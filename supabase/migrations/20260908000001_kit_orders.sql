-- Migration 20260908000001 : kit_orders + kit_order_events + machine d'états
-- (service « Kit sur mesure », lot 1 — V0 interne, sans paiement en ligne).
--
-- ════════════════════════════════════════════════════════════════════════════
--  POURQUOI UNE TABLE DÉDIÉE, ET SURTOUT PAS UNE VALEUR DE `profiles.tier`
-- ════════════════════════════════════════════════════════════════════════════
-- `profiles.tier` porte UNE valeur : un compte y est `apprenti` OU `forgeron` OU
-- `maître` OU `légion`, jamais deux à la fois. C'est un PALIER, exclusif par
-- construction. Le kit sur mesure est un ACHAT PONCTUEL qui doit coexister avec
-- n'importe quel palier — y compris `apprenti` — et se répéter dans le temps.
-- Le modéliser en 5ᵉ valeur de `tier` déclasserait le palier payé du client au
-- moment de l'achat, puis n'aurait aucun moyen de le lui rendre.
--
-- ⚠️ « Légion » n'est PAS un précédent d'add-on à copier : c'est exactement la
-- 4ᵉ valeur de cette colonne, rien d'autre — aucune table, aucun entitlement.
-- Le découplage recherché ici est celui de `prac_admins` (20260626000001), dont
-- l'en-tête le formule déjà : « Découplé de profiles.role et de admin_users ».
--
-- ════════════════════════════════════════════════════════════════════════════
--  LA BARRIÈRE EST EN BASE, PAS DANS LE NAVIGATEUR
-- ════════════════════════════════════════════════════════════════════════════
-- Dette connue et documentée (AGENTS.md § scenarios) : le verrou « palier payant »
-- des Scénarios est PUREMENT CÔTÉ CLIENT — `isPro` est calculé dans Dashboard.tsx
-- et les policies `scn_*` ne testent que la propriété de la ligne. Un compte
-- Apprenti qui appelle PostgREST directement passe au travers.
--
-- Ici, l'argent change de main : la même erreur serait payante. D'où :
--   • AUCUNE policy INSERT / UPDATE / DELETE sur kit_orders → RLS activée sans
--     policy = deny total pour anon ET authenticated. Un
--     `supabase.from('kit_orders').update({ status })` depuis le navigateur est
--     refusé par la base, quoi que rende le panneau admin ;
--   • le SEUL chemin d'écriture est constitué des trois fonctions SECURITY
--     DEFINER ci-dessous, qui re-vérifient `is_admin()` en interne ;
--   • le sous-onglet « Kits » d'AdminTab n'est donc qu'une COMMODITÉ, au même
--     titre que la section Feature flags l'est vis-à-vis de `as_update_admin`.
--
-- Dépend de : profiles(id) (baseline), admin_users + is_admin() (20260530000007),
--             fn_set_updated_at() (20260606000012).
--
-- Idempotent : CREATE ... IF NOT EXISTS + DROP/CREATE POLICY/TRIGGER +
--              CREATE OR REPLACE FUNCTION. Rejouable sans effet de bord.

-- ════════════════════════════════════════════════════════════════════════════
--  1. TABLE kit_orders
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.kit_orders (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Le client. CASCADE : un compte supprimé emporte ses dossiers — le lot 4
  -- (comptabilité Stripe) vivra dans ses propres tables, pas ici.
  user_id          uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,

  -- L'admin qui a ouvert le dossier. Pendant d'`added_by` sur tracked_players :
  -- répond à « qui a vendu ce kit ? » sans avoir à lire le journal d'événements.
  created_by       uuid NOT NULL REFERENCES auth.users,

  -- Position dans le parcours. Voir la table de transitions au § 4.
  --
  -- ⚠️ Valeurs FR SANS ACCENT, délibérément. Le repo a les deux conventions
  -- (`tracked_players` en anglais, `profiles.tier` en français) et le vocabulaire
  -- métier est ici français — acompte, solde. Mais `profiles.tier = 'maître'`
  -- oblige déjà `lib/subscription.ts` à normaliser par `.trim().toLowerCase()`
  -- avant toute comparaison : on ne réintroduit pas ce problème sur une valeur
  -- machine que du SQL, du TypeScript et des URL vont manipuler.
  status           text NOT NULL DEFAULT 'demande'
                   CHECK (status IN (
                     'demande',           -- dossier ouvert, acompte pas encore encaissé
                     'acompte_paye',      -- 40 % reçus
                     'decouverte_faite',  -- appel découverte tenu
                     'kit_trouve',        -- réflexion offline terminée (déclencheur e-mail, lot 3)
                     'solde_paye',        -- 60 % reçus
                     'session_faite',     -- session d'explication + test en jeu tenus
                     'termine',           -- livré — TERMINAL, le client est « preneur du pack »
                     'annule'             -- abandon / remboursement — TERMINAL
                   )),

  -- GEL de l'état du joueur à la prise du pack.
  --
  -- ⚠️ Une COPIE, jamais une jointure vers `profiles`. `profiles.riot_rank` est
  -- choisi par l'utilisateur et change quand il veut : lire le rang « au moment
  -- de la prise » par jointure renverrait le rang d'AUJOURD'HUI, ce qui vide de
  -- son sens la mesure de progression que ce service vend.
  --
  -- NOT NULL DEFAULT '{}' et jamais nullable — même parti pris que
  -- `scenarios.allies` / `scenarios.drawings` (`jsonb NOT NULL DEFAULT '[]'`) :
  -- aucun consommateur n'a à distinguer « absent » de « vide ». `{}` signifie
  -- « pas encore capturé » (lot 1 : l'admin ouvre le dossier à la main).
  --
  -- Contrat visé, rempli par le formulaire du LOT 2 — noms figés au même titre
  -- que le contrat JSONB de `scenarios` :
  --   { riot_puuid, riot_gamename, riot_tagline, riot_platform,
  --     riot_rank, role, captured_at }
  -- Toutes les clés sont optionnelles : un dossier ouvert pour un compte sans
  -- Riot ID lié reste un dossier valide.
  player_snapshot  jsonb NOT NULL DEFAULT '{}'::jsonb,

  -- Prix total convenu, en CENTIMES d'euro (entier — jamais de flottant sur de
  -- l'argent). Nullable : au lot 1 l'admin le saisit à la main et peut ouvrir un
  -- dossier avant d'avoir arrêté le montant ; le lot 4 (Stripe) le renseignera
  -- depuis la session de paiement. La répartition 40/60 n'est PAS stockée — elle
  -- se déduit, et un acompte réellement encaissé se lit dans le journal d'événements.
  price_total_cents integer CHECK (price_total_cents IS NULL OR price_total_cents > 0),

  -- Main courante interne (contexte, coordonnées de RDV, décisions). Jamais
  -- montrée au client : aucune policy ne l'expose hors de `is_admin()`… sauf que
  -- le client voit SA ligne (policy ko_select). Voir l'avertissement au § 3.
  admin_note       text,

  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

-- ── Index ─────────────────────────────────────────────────────────────────────
-- Postgres n'indexe pas les colonnes de FK automatiquement, et le projet suit le
-- lint « unindexed foreign key » de l'advisor Supabase (cf. les migrations
-- security_pX et 20260905000001 § 2).
CREATE INDEX IF NOT EXISTS idx_kit_orders_user
  ON public.kit_orders (user_id);

-- Tri par défaut du tableau admin (le plus récent en premier), calqué sur le
-- `.order('created_at', { ascending: false })` de la liste des comptes.
CREATE INDEX IF NOT EXISTS idx_kit_orders_created
  ON public.kit_orders (created_at DESC);

-- UN SEUL DOSSIER ACTIF PAR CLIENT — index unique PARTIEL.
--
-- `tracked_players` pose un `UNIQUE (profile_id)` sec : un dossier par joueur,
-- pour toujours. Inapplicable ici — un client satisfait doit pouvoir racheter un
-- kit l'année suivante sans qu'on efface le précédent. Mais deux dossiers EN
-- COURS simultanés signifieraient deux acomptes encaissés pour un seul
-- accompagnement : c'est ça qu'on interdit, et rien d'autre.
--
-- L'index partiel est l'idiome déjà employé par `uq_ledger_ref`
-- (20260606000002) : la contrainte ne porte que sur le sous-ensemble qui la mérite.
CREATE UNIQUE INDEX IF NOT EXISTS uq_kit_orders_active
  ON public.kit_orders (user_id)
  WHERE status NOT IN ('termine', 'annule');

-- ── Trigger updated_at (fonction partagée du repo) ────────────────────────────
DROP TRIGGER IF EXISTS trg_kit_orders_updated_at ON public.kit_orders;
CREATE TRIGGER trg_kit_orders_updated_at
  BEFORE UPDATE ON public.kit_orders
  FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();

-- ════════════════════════════════════════════════════════════════════════════
--  2. TABLE kit_order_events — journal d'audit des transitions
-- ════════════════════════════════════════════════════════════════════════════
-- Une ligne par changement d'état, écrite par `kit_set_status` dans la MÊME
-- transaction que l'UPDATE : le statut et sa trace ne peuvent pas diverger.
--
-- Pourquoi ce journal existe alors que `kit_orders.status` suffit à afficher
-- l'état courant : l'avancement est MANUEL et irréversible au-delà d'un cran.
-- Sans trace, un « terminé » posé par erreur, un retour arrière, ou la question
-- « le solde a été encaissé quand, exactement ? » n'ont aucune réponse. Pour un
-- service payé, c'est la différence entre une machine d'états et une machine
-- d'états auditable.
CREATE TABLE IF NOT EXISTS public.kit_order_events (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  kit_order_id  uuid NOT NULL REFERENCES public.kit_orders(id) ON DELETE CASCADE,

  -- NULL = ouverture du dossier (il n'y avait pas d'état précédent).
  from_status   text,
  to_status     text NOT NULL,

  -- `auth.uid()` au moment de l'écriture. Nullable : une écriture future en
  -- service_role (webhook Stripe du lot 4) n'a pas d'utilisateur. Le tableau
  -- admin omet alors la mention plutôt que d'afficher un UUID — même règle que
  -- `adminName()` pour `app_settings.updated_by`.
  actor         uuid REFERENCES auth.users,

  -- Commentaire libre attaché à CE passage (« remboursé le 12 », « le client a
  -- reporté »). Distinct d'`admin_note`, qui décrit le dossier, pas l'étape.
  note          text,

  created_at    timestamptz NOT NULL DEFAULT now()
);

-- La timeline d'un dossier, du plus récent au plus ancien.
CREATE INDEX IF NOT EXISTS idx_kit_order_events_order
  ON public.kit_order_events (kit_order_id, created_at DESC);

-- ════════════════════════════════════════════════════════════════════════════
--  3. RLS + MOINDRE PRIVILÈGE
-- ════════════════════════════════════════════════════════════════════════════
ALTER TABLE public.kit_orders       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kit_order_events ENABLE ROW LEVEL SECURITY;

-- Lecture kit_orders : l'admin voit tout, le client voit SES dossiers.
--
-- `(select auth.uid())` et non `auth.uid()` nu : forme des policies récentes du
-- repo (`scn_*`, 20260622000001), qui laisse Postgres évaluer l'appel une seule
-- fois en initplan au lieu d'une fois par ligne.
DROP POLICY IF EXISTS ko_select ON public.kit_orders;
CREATE POLICY ko_select ON public.kit_orders
  FOR SELECT TO authenticated
  USING (public.is_admin() OR (select auth.uid()) = user_id);

-- Lecture kit_order_events : ADMIN UNIQUEMENT.
--
-- Le client ne voit pas la timeline. Elle contient les retours arrière et les
-- notes internes — donner à voir « on t'a marqué terminé puis on est revenu en
-- arrière » n'aide personne et invite à des questions auxquelles le journal
-- n'est pas fait pour répondre. Le client a son statut courant, qui est la
-- vérité qui le concerne.
DROP POLICY IF EXISTS koe_select_admin ON public.kit_order_events;
CREATE POLICY koe_select_admin ON public.kit_order_events
  FOR SELECT TO authenticated
  USING (public.is_admin());

-- Aucune policy INSERT / UPDATE / DELETE sur ni l'une ni l'autre : RLS activée +
-- absence de policy = deny total pour les rôles client. Toute écriture passe par
-- les fonctions SECURITY DEFINER du § 4 (owned par postgres → bypass RLS, droits
-- re-vérifiés en interne).

-- ⚠️ Le REVOKE avant le GRANT n'est pas décoratif. Supabase applique des DEFAULT
-- PRIVILEGES accordant ALL à `anon` ET `authenticated` sur toute table neuve :
-- sans ce REVOKE, le refus d'écriture ne tiendrait qu'à l'absence de policy, et
-- le refus de lecture anonyme qu'au prédicat s'évaluant à NULL. C'est exactement
-- l'oubli que `20260901000003` a dû réparer a posteriori sur `scenarios` — « le
-- refus est désormais un privilège, plus un effet de bord d'évaluation ». On
-- l'écrit dès le départ ici plutôt que dans deux ans.
REVOKE ALL ON public.kit_orders       FROM anon, authenticated;
REVOKE ALL ON public.kit_order_events FROM anon, authenticated;

-- Seule la lecture est ré-accordée, et seulement à `authenticated` : `anon` n'a
-- aucune policy, donc aucun accès, sur les deux tables.
GRANT SELECT ON public.kit_orders       TO authenticated;
GRANT SELECT ON public.kit_order_events TO authenticated;

-- ⚠️ CONSÉQUENCE À CONNAÎTRE : `admin_note` est sur `kit_orders`, dont le CLIENT
-- lit sa propre ligne. Une note interne y est donc lisible par le client via
-- PostgREST, même si le site ne l'affiche jamais. Traiter `admin_note` comme du
-- texte destiné au client. Ce qui doit rester interne va dans `kit_order_events.note`,
-- table réservée à `is_admin()`.

-- ════════════════════════════════════════════════════════════════════════════
--  4. MACHINE D'ÉTATS — kit_set_status
-- ════════════════════════════════════════════════════════════════════════════
-- Table de transitions COMPLÈTE (17 valides ; tout le reste → invalid_transition) :
--
--   AVANCÉES (6)                          RETOURS D'UN CRAN (5)
--   ────────────────────────────────      ────────────────────────────────
--   demande          → acompte_paye       acompte_paye     → demande
--   acompte_paye     → decouverte_faite   decouverte_faite → acompte_paye
--   decouverte_faite → kit_trouve         kit_trouve       → decouverte_faite
--   kit_trouve       → solde_paye         solde_paye       → kit_trouve
--   solde_paye       → session_faite      session_faite    → solde_paye
--   session_faite    → termine            (termine → session_faite : REFUSÉ)
--
--   ANNULATIONS (6) : les six états non terminaux → annule
--   demande · acompte_paye · decouverte_faite · kit_trouve · solde_paye ·
--   session_faite  →  annule
--
-- CE QUI EST INTERDIT, ET POURQUOI :
--   • `termine` est TERMINAL dans les deux sens. Un kit livré ne se dé-livre pas ;
--     un remboursement est une écriture comptable (lot 4), pas un retour d'état.
--     C'est aussi ce qui rend la liste des « preneurs du pack » stable.
--   • `annule` est TERMINAL. Un client qui revient ouvre un NOUVEAU dossier —
--     l'index partiel `uq_kit_orders_active` l'autorise, et l'historique du
--     premier reste intact.
--   • Un saut de plus d'un cran est refusé : chaque étape correspond à un fait
--     réel (un appel tenu, un virement reçu). Les enchaîner sans les distinguer
--     ferait perdre la date de chacun dans le journal.
--   • X → X est refusé. Un double-clic produit donc `invalid_transition` sur le
--     second appel, et non une deuxième ligne d'audit pour un seul événement.
--
-- IMPLÉMENTATION — pourquoi un tableau ordonné plutôt que la cascade IF/ELSIF de
-- `respond_consent` : cette machine-ci a 17 transitions contre 4. Écrites en
-- cascade, elles seraient illisibles et une omission passerait inaperçue. Le
-- tableau ci-dessous EST le parcours, dans l'ordre ; la règle « une transition
-- valide déplace d'exactement un cran » s'y vérifie d'un coup d'œil et se
-- généralise sans réécriture le jour où une étape s'ajoute. La table de
-- transitions reste écrite en toutes lettres juste au-dessus, pour l'audit.
CREATE OR REPLACE FUNCTION public.kit_set_status(
  p_order_id    uuid,
  p_next_status text,
  p_note        text DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  -- La chaîne linéaire, dans l'ordre du parcours. `annule` n'y figure pas : il
  -- n'a pas de position, il se rejoint depuis n'importe quel état non terminal.
  c_chain constant text[] := ARRAY[
    'demande', 'acompte_paye', 'decouverte_faite', 'kit_trouve',
    'solde_paye', 'session_faite', 'termine'
  ];

  v_status   text;
  v_from_idx int;
  v_to_idx   int;
BEGIN
  -- ── Garde 1 : l'appelant est-il admin ? ────────────────────────────────────
  -- `is_admin()` est SANS ARGUMENT et lit `auth.uid()` lui-même
  -- (20260530000007). C'est LA barrière : la fonction est SECURITY DEFINER, donc
  -- elle contourne la RLS — sans ce test, tout `authenticated` pourrait faire
  -- avancer n'importe quel dossier.
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'not_admin';
  END IF;

  -- ── Garde 2 : la cible est-elle un statut connu ? ──────────────────────────
  -- Distinct d'`invalid_transition` : « tu as demandé un état qui n'existe pas »
  -- et « cet état existe mais on ne peut pas y aller d'ici » sont deux bugs
  -- différents côté appelant, et méritent deux messages différents.
  IF p_next_status IS NULL
     OR NOT (p_next_status = ANY (c_chain) OR p_next_status = 'annule') THEN
    RAISE EXCEPTION 'invalid_status';
  END IF;

  -- ── Garde 3 : le dossier existe-t-il ? ─────────────────────────────────────
  -- FOR UPDATE verrouille la ligne pour sérialiser un double-clic ou deux admins
  -- simultanés — même raison que `respond_consent`. Sans lui, deux appels
  -- concurrents pourraient tous deux lire `kit_trouve` et écrire deux fois.
  SELECT status INTO v_status
    FROM public.kit_orders
   WHERE id = p_order_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'kit_order_not_found';
  END IF;

  -- ── Garde 4 : la transition est-elle valide ? ──────────────────────────────
  IF p_next_status = 'annule' THEN
    -- Annulable depuis tout état non terminal. `termine` et `annule` sont exclus
    -- (le second par array_position → NULL, faute d'être dans la chaîne).
    IF v_status = 'termine' OR array_position(c_chain, v_status) IS NULL THEN
      RAISE EXCEPTION 'invalid_transition';
    END IF;
  ELSE
    v_from_idx := array_position(c_chain, v_status);
    v_to_idx   := array_position(c_chain, p_next_status);

    -- v_from_idx NULL ⇒ le dossier est `annule` : plus aucune sortie.
    IF v_from_idx IS NULL THEN
      RAISE EXCEPTION 'invalid_transition';
    END IF;

    IF v_to_idx - v_from_idx = 1 THEN
      NULL;                                   -- avancée d'un cran : toujours permise
    ELSIF v_to_idx - v_from_idx = -1 AND v_status <> 'termine' THEN
      NULL;                                   -- retour d'un cran, sauf depuis `termine`
    ELSE
      RAISE EXCEPTION 'invalid_transition';   -- saut, sur-place, ou dé-clôture
    END IF;
  END IF;

  -- ── Écriture — statut ET trace dans la même transaction ────────────────────
  UPDATE public.kit_orders
     SET status = p_next_status
   WHERE id = p_order_id;
  -- (updated_at est posé par trg_kit_orders_updated_at.)

  INSERT INTO public.kit_order_events (kit_order_id, from_status, to_status, actor, note)
  VALUES (p_order_id, v_status, p_next_status, auth.uid(), p_note);

  RETURN p_next_status;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.kit_set_status(uuid, text, text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.kit_set_status(uuid, text, text) TO authenticated;

-- ════════════════════════════════════════════════════════════════════════════
--  5. OUVERTURE D'UN DOSSIER — kit_open_order
-- ════════════════════════════════════════════════════════════════════════════
-- Deux points d'entrée seulement, jamais au milieu de la chaîne :
--   • `acompte_paye` (DÉFAUT) — le chemin du LOT 1 : l'admin encaisse à la main,
--     puis ouvre le dossier ;
--   • `demande` — le chemin du LOT 2 : le client remplit le formulaire, le
--     dossier existe avant que l'argent n'arrive.
-- Tout autre état de départ est refusé : ouvrir un dossier directement en
-- `solde_paye` court-circuiterait le journal et sa chronologie.
CREATE OR REPLACE FUNCTION public.kit_open_order(
  p_user_id           uuid,
  p_snapshot          jsonb   DEFAULT '{}'::jsonb,
  p_status            text    DEFAULT 'acompte_paye',
  p_price_total_cents integer DEFAULT NULL,
  p_admin_note        text    DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'not_admin';
  END IF;

  IF p_status IS NULL OR p_status NOT IN ('demande', 'acompte_paye') THEN
    RAISE EXCEPTION 'invalid_status';
  END IF;

  -- COALESCE plutôt que de faire confiance à l'appelant : un `null` explicite
  -- passé depuis le client JavaScript écraserait le DEFAULT de la colonne et
  -- violerait le NOT NULL. Le contrat « player_snapshot n'est jamais null »
  -- se tient ici, pas dans l'appelant.
  INSERT INTO public.kit_orders
    (user_id, created_by, status, player_snapshot, price_total_cents, admin_note)
  VALUES
    (p_user_id, auth.uid(), p_status, COALESCE(p_snapshot, '{}'::jsonb),
     p_price_total_cents, p_admin_note)
  RETURNING id INTO v_id;

  -- Première ligne du journal : from_status NULL = ouverture.
  INSERT INTO public.kit_order_events (kit_order_id, from_status, to_status, actor)
  VALUES (v_id, NULL, p_status, auth.uid());

  RETURN v_id;

EXCEPTION
  -- L'index partiel uq_kit_orders_active a parlé : ce client a déjà un dossier
  -- en cours. Remonté en erreur métier lisible plutôt qu'en 23505 brut, sur le
  -- modèle des codes de `purchase_cosmetic` que shop-purchase mappe en HTTP.
  WHEN unique_violation THEN
    RAISE EXCEPTION 'kit_order_already_active';
END;
$$;

REVOKE EXECUTE ON FUNCTION public.kit_open_order(uuid, jsonb, text, integer, text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.kit_open_order(uuid, jsonb, text, integer, text) TO authenticated;

-- ════════════════════════════════════════════════════════════════════════════
--  6. ÉDITION DES DÉTAILS — kit_set_details
-- ════════════════════════════════════════════════════════════════════════════
-- Sans elle, `price_total_cents` et `admin_note` ne seraient modifiables qu'à la
-- création : deux colonnes mortes au premier montant corrigé. Elle ne touche
-- JAMAIS `status` — la machine d'états a sa porte à elle, et une seule.
--
-- Sémantique de mise à jour PARTIELLE : `NULL` = « ne change pas ce champ ».
-- Conséquence assumée : on ne peut pas REMETTRE un champ à NULL par cette
-- fonction. C'est le bon compromis pour un panneau où l'admin édite un champ à
-- la fois ; l'alternative (un booléen « effacer » par colonne) coûte plus qu'elle
-- ne rapporte tant que personne n'a eu besoin d'effacer un prix.
CREATE OR REPLACE FUNCTION public.kit_set_details(
  p_order_id          uuid,
  p_price_total_cents integer DEFAULT NULL,
  p_admin_note        text    DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'not_admin';
  END IF;

  UPDATE public.kit_orders
     SET price_total_cents = COALESCE(p_price_total_cents, price_total_cents),
         admin_note        = COALESCE(p_admin_note,        admin_note)
   WHERE id = p_order_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'kit_order_not_found';
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.kit_set_details(uuid, integer, text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.kit_set_details(uuid, integer, text) TO authenticated;
