-- Tests SQL — kit_orders, kit_order_events et la machine d'états
-- (lot 1 « Kit sur mesure », migration 20260908000001).
--
-- ════════════════════════════════════════════════════════════════════════════
--  COMMENT LANCER
-- ════════════════════════════════════════════════════════════════════════════
--   1. Ouvrir le SQL Editor sur le projet **TEST** (gyjcdswpybrhesarompg).
--      ⚠️ PAS la prod (cuscgmgqakxnfwnsrhhv). Vérifier le nom du projet en haut
--      à gauche : « Wyrm Forge Test ».
--   2. Coller CE FICHIER EN ENTIER dans un onglet vide, puis exécuter.
--   3. Lire la table de résultats : une ligne par test, colonne `ok`.
--      Tout doit être `true`. `ROLLBACK` final → rien ne persiste.
--
-- ⚠️ Ce fichier n'utilise AUCUNE méta-commande psql (`\gset`, `\set`…) : elles
-- n'existent pas dans le SQL Editor web, qui parle SQL et rien d'autre. Tout ce
-- qui devait être « capturé puis recollé » vit dans des variables plpgsql.
--
-- ════════════════════════════════════════════════════════════════════════════
--  LES TROIS IDENTITÉS SONT RÉSOLUES PAR LE SCRIPT — rien à renseigner
-- ════════════════════════════════════════════════════════════════════════════
-- ⚠️ PIÈGE À NE PAS REFAIRE : l'admin DOIT venir de `admin_users`, pas de
-- `prac_admins`. `is_admin()` (20260530000007) ne lit QUE `admin_users` ; les
-- deux tables sont explicitement découplées (cf. l'en-tête de 20260626000001 :
-- « un admin prac n'est pas forcément super-admin du site »). Prendre un UUID
-- dans `prac_admins` ferait échouer T1..T4 (l'« admin » se verrait refuser
-- `not_admin`) et — bien pire — ferait PASSER T5 pour la mauvaise raison : le
-- non-admin serait refusé, mais on n'aurait rien prouvé sur la garde elle-même.
--
-- Le bloc T0 échoue bruyamment si l'amorçage manque, plutôt que de laisser les
-- tests suivants mentir.

BEGIN;

CREATE TEMP TABLE t_res (
  ordre    int,
  test     text,
  attendu  text,
  obtenu   text,
  ok       boolean
) ON COMMIT DROP;

DO $t$
DECLARE
  v_admin   uuid;
  v_client  uuid;
  v_other   uuid;
  v_order   uuid;
  v_order2  uuid;
  v_status  text;
  v_err     text;
  v_cnt     int;
  v_cnt2    int;
  v_price   int;
BEGIN
  -- Note de lecture — deux mécanismes distincts, à ne pas confondre :
  --   • `set_config('request.jwt.claims', …)` décide QUI on est pour
  --     `auth.uid()`, donc pour `is_admin()` et les prédicats de policy ;
  --   • `SET LOCAL ROLE authenticated` décide sous quel RÔLE POSTGRES on parle,
  --     donc quels PRIVILÈGES de table s'appliquent.
  -- T5 n'a besoin que du premier (garde applicative dans la fonction) ; T6, T7
  -- et T8 ont besoin des deux — sous le rôle du SQL Editor (superuser) les
  -- REVOKE et les policies ne s'appliquent pas, et les tests passeraient à tort.
  -- ══════════════════════════════════════════════════════════════════════
  -- T0 — Résolution des identités
  -- ══════════════════════════════════════════════════════════════════════
  SELECT user_id INTO v_admin
    FROM public.admin_users
   ORDER BY user_id
   LIMIT 1;

  IF v_admin IS NULL THEN
    RAISE EXCEPTION
      'admin_users est VIDE sur cette base — impossible de tester is_admin(). '
      'Amorcer la table avant de rejouer (voir 20260626000001 pour le patron).';
  END IF;

  -- Deux profils NON admin, distincts. `NOT EXISTS` sur admin_users et non sur
  -- prac_admins : c'est la même table que celle que lit is_admin().
  SELECT p.id INTO v_client
    FROM public.profiles p
   WHERE NOT EXISTS (SELECT 1 FROM public.admin_users a WHERE a.user_id = p.id)
   ORDER BY p.created_at, p.id
   LIMIT 1;

  SELECT p.id INTO v_other
    FROM public.profiles p
   WHERE NOT EXISTS (SELECT 1 FROM public.admin_users a WHERE a.user_id = p.id)
     AND p.id IS DISTINCT FROM v_client
   ORDER BY p.created_at, p.id
   LIMIT 1;

  IF v_client IS NULL OR v_other IS NULL THEN
    RAISE EXCEPTION
      'Il faut au moins DEUX profils non-admin distincts pour jouer T5/T7/T8.';
  END IF;

  -- Filet supplémentaire : si le compte « admin » retenu se trouvait aussi être
  -- le client, T5 et T7 ne prouveraient rien.
  IF v_admin = v_client OR v_admin = v_other THEN
    RAISE EXCEPTION 'Les identités se recouvrent — jeu de comptes inutilisable.';
  END IF;

  INSERT INTO t_res VALUES (
    0, 'T0 — identités (admin issu de admin_users)',
    'admin + 2 non-admins distincts',
    format('admin=%s client=%s other=%s',
           left(v_admin::text, 8), left(v_client::text, 8), left(v_other::text, 8)),
    true);

  -- On se déclare ADMIN pour toute la suite des appels RPC. `is_admin()` étant
  -- SECURITY DEFINER, seules les claims comptent — pas besoin de SET ROLE ici.
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);

  -- ══════════════════════════════════════════════════════════════════════
  -- T1 — Parcours nominal : 6 avancées, et 7 lignes de journal
  -- ══════════════════════════════════════════════════════════════════════
  v_order := public.kit_open_order(v_client, '{"riot_rank":"gold","role":"JUNGLE"}'::jsonb, 'demande');

  PERFORM public.kit_set_status(v_order, 'acompte_paye');
  PERFORM public.kit_set_status(v_order, 'decouverte_faite');
  PERFORM public.kit_set_status(v_order, 'kit_trouve');
  PERFORM public.kit_set_status(v_order, 'solde_paye');
  PERFORM public.kit_set_status(v_order, 'session_faite');
  v_status := public.kit_set_status(v_order, 'termine');

  SELECT count(*) INTO v_cnt FROM public.kit_order_events WHERE kit_order_id = v_order;

  INSERT INTO t_res VALUES (
    1, 'T1 — parcours nominal demande → termine',
    'termine / 7 événements',
    format('%s / %s événements', v_status, v_cnt),
    v_status = 'termine' AND v_cnt = 7);

  -- ══════════════════════════════════════════════════════════════════════
  -- T2 — Retour d'un cran accepté, dé-clôture refusée
  -- ══════════════════════════════════════════════════════════════════════
  v_order2 := public.kit_open_order(v_client, '{}'::jsonb, 'acompte_paye');
  -- ⚠️ v_order est en 'termine' donc n'occupe plus le slot actif : c'est
  -- précisément ce que uq_kit_orders_active autorise (cf. T9).
  PERFORM public.kit_set_status(v_order2, 'decouverte_faite');
  PERFORM public.kit_set_status(v_order2, 'kit_trouve');
  v_status := public.kit_set_status(v_order2, 'decouverte_faite');

  INSERT INTO t_res VALUES (
    2, 'T2a — retour d''un cran (kit_trouve → decouverte_faite)',
    'decouverte_faite', v_status, v_status = 'decouverte_faite');

  -- v_order est terminé : toute sortie doit être refusée.
  BEGIN
    PERFORM public.kit_set_status(v_order, 'session_faite');
    v_err := '(aucune erreur)';
  EXCEPTION WHEN OTHERS THEN
    v_err := SQLERRM;
  END;

  INSERT INTO t_res VALUES (
    3, 'T2b — 🔴 termine NE se dé-clôture PAS',
    'invalid_transition', v_err, v_err LIKE '%invalid_transition%');

  -- ══════════════════════════════════════════════════════════════════════
  -- T3 — Transitions invalides : saut, sur-place, sortie d'un terminal
  -- ══════════════════════════════════════════════════════════════════════
  -- v_order2 est en 'decouverte_faite'. Saut de 2 crans → solde_paye.
  BEGIN
    PERFORM public.kit_set_status(v_order2, 'solde_paye');
    v_err := '(aucune erreur)';
  EXCEPTION WHEN OTHERS THEN v_err := SQLERRM;
  END;
  INSERT INTO t_res VALUES (
    4, 'T3a — saut de 2 crans refusé',
    'invalid_transition', v_err, v_err LIKE '%invalid_transition%');

  -- Sur-place (double-clic).
  BEGIN
    PERFORM public.kit_set_status(v_order2, 'decouverte_faite');
    v_err := '(aucune erreur)';
  EXCEPTION WHEN OTHERS THEN v_err := SQLERRM;
  END;
  INSERT INTO t_res VALUES (
    5, 'T3b — transition sur place refusée (double-clic)',
    'invalid_transition', v_err, v_err LIKE '%invalid_transition%');

  -- Sortie d'un dossier annulé.
  PERFORM public.kit_set_status(v_order2, 'annule');
  BEGIN
    PERFORM public.kit_set_status(v_order2, 'acompte_paye');
    v_err := '(aucune erreur)';
  EXCEPTION WHEN OTHERS THEN v_err := SQLERRM;
  END;
  INSERT INTO t_res VALUES (
    6, 'T3c — annule est terminal',
    'invalid_transition', v_err, v_err LIKE '%invalid_transition%');

  -- ══════════════════════════════════════════════════════════════════════
  -- T4 — Statut inconnu : distinct d'une transition invalide
  -- ══════════════════════════════════════════════════════════════════════
  v_order2 := public.kit_open_order(v_client, '{}'::jsonb, 'acompte_paye');
  BEGIN
    PERFORM public.kit_set_status(v_order2, 'livre');
    v_err := '(aucune erreur)';
  EXCEPTION WHEN OTHERS THEN v_err := SQLERRM;
  END;
  INSERT INTO t_res VALUES (
    7, 'T4 — statut inconnu → invalid_status (pas invalid_transition)',
    'invalid_status', v_err,
    v_err LIKE '%invalid_status%' AND v_err NOT LIKE '%invalid_transition%');

  -- ══════════════════════════════════════════════════════════════════════
  -- T5 — 🔴 BLOQUANT : un NON-ADMIN ne fait rien avancer
  -- ══════════════════════════════════════════════════════════════════════
  -- On devient le CLIENT (propriétaire du dossier — le cas le plus favorable
  -- à une faille : il a le droit de LIRE sa ligne).
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_client, 'role', 'authenticated')::text, true);

  BEGIN
    PERFORM public.kit_set_status(v_order2, 'decouverte_faite');
    v_err := '(aucune erreur)';
  EXCEPTION WHEN OTHERS THEN v_err := SQLERRM;
  END;
  INSERT INTO t_res VALUES (
    8, 'T5a — 🔴 non-admin : kit_set_status refusé',
    'not_admin', v_err, v_err LIKE '%not_admin%');

  BEGIN
    PERFORM public.kit_open_order(v_client, '{}'::jsonb, 'acompte_paye');
    v_err := '(aucune erreur)';
  EXCEPTION WHEN OTHERS THEN v_err := SQLERRM;
  END;
  INSERT INTO t_res VALUES (
    9, 'T5b — 🔴 non-admin : kit_open_order refusé',
    'not_admin', v_err, v_err LIKE '%not_admin%');

  BEGIN
    PERFORM public.kit_set_details(v_order2, 9900);
    v_err := '(aucune erreur)';
  EXCEPTION WHEN OTHERS THEN v_err := SQLERRM;
  END;
  INSERT INTO t_res VALUES (
    10, 'T5c — 🔴 non-admin : kit_set_details refusé',
    'not_admin', v_err, v_err LIKE '%not_admin%');

  -- Preuve que le refus n'est pas un artefact : le statut n'a pas bougé.
  SELECT status INTO v_status FROM public.kit_orders WHERE id = v_order2;
  INSERT INTO t_res VALUES (
    11, 'T5d — 🔴 le dossier n''a pas bougé après les 3 refus',
    'acompte_paye', v_status, v_status = 'acompte_paye');

  -- ══════════════════════════════════════════════════════════════════════
  -- T6 — 🔴 BLOQUANT : UPDATE direct refusé, même pour un ADMIN
  -- ══════════════════════════════════════════════════════════════════════
  -- Ici le SET ROLE est INDISPENSABLE : c'est un test de PRIVILÈGE table, pas
  -- de logique applicative. Sous le rôle du SQL Editor (postgres/superuser) le
  -- REVOKE ne s'applique pas — le test passerait à tort.
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';

  BEGIN
    EXECUTE format('UPDATE public.kit_orders SET status = %L WHERE id = %L', 'termine', v_order2);
    v_err := '(aucune erreur — UPDATE PASSÉ)';
  EXCEPTION WHEN OTHERS THEN
    v_err := SQLSTATE || ' ' || SQLERRM;
  END;

  EXECUTE 'RESET ROLE';

  INSERT INTO t_res VALUES (
    12, 'T6a — 🔴 UPDATE direct par un ADMIN refusé',
    '42501 permission denied', v_err, v_err LIKE '42501%');

  -- Et le statut n'a effectivement pas changé.
  SELECT status INTO v_status FROM public.kit_orders WHERE id = v_order2;
  INSERT INTO t_res VALUES (
    13, 'T6b — 🔴 statut inchangé après l''UPDATE refusé',
    'acompte_paye', v_status, v_status = 'acompte_paye');

  -- Idem sur le journal d'audit.
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    EXECUTE format('INSERT INTO public.kit_order_events (kit_order_id, to_status) VALUES (%L, %L)',
                   v_order2, 'termine');
    v_err := '(aucune erreur — INSERT PASSÉ)';
  EXCEPTION WHEN OTHERS THEN v_err := SQLSTATE || ' ' || SQLERRM;
  END;
  EXECUTE 'RESET ROLE';

  INSERT INTO t_res VALUES (
    14, 'T6c — 🔴 INSERT direct dans le journal refusé',
    '42501 permission denied', v_err, v_err LIKE '42501%');

  -- ══════════════════════════════════════════════════════════════════════
  -- T7 — Lecture : le client voit SA ligne, un tiers ne la voit pas
  -- ══════════════════════════════════════════════════════════════════════
  EXECUTE 'SET LOCAL ROLE authenticated';

  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_client, 'role', 'authenticated')::text, true);
  SELECT count(*) INTO v_cnt FROM public.kit_orders WHERE id = v_order2;

  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_other, 'role', 'authenticated')::text, true);
  SELECT count(*) INTO v_cnt2 FROM public.kit_orders WHERE id = v_order2;

  EXECUTE 'RESET ROLE';

  INSERT INTO t_res VALUES (
    15, 'T7 — propriétaire voit 1, tiers voit 0',
    '1 / 0', format('%s / %s', v_cnt, v_cnt2),
    v_cnt = 1 AND v_cnt2 = 0);

  -- ══════════════════════════════════════════════════════════════════════
  -- T8 — Journal réservé à l'admin : le client ne lit pas sa timeline
  -- ══════════════════════════════════════════════════════════════════════
  EXECUTE 'SET LOCAL ROLE authenticated';

  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_client, 'role', 'authenticated')::text, true);
  SELECT count(*) INTO v_cnt FROM public.kit_order_events WHERE kit_order_id = v_order2;

  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  SELECT count(*) INTO v_cnt2 FROM public.kit_order_events WHERE kit_order_id = v_order2;

  EXECUTE 'RESET ROLE';

  INSERT INTO t_res VALUES (
    16, 'T8 — client voit 0 événement, admin en voit ≥ 1',
    '0 / ≥1', format('%s / %s', v_cnt, v_cnt2),
    v_cnt = 0 AND v_cnt2 >= 1);

  -- ══════════════════════════════════════════════════════════════════════
  -- T9 — Un seul dossier ACTIF, mais plusieurs dans le temps
  -- ══════════════════════════════════════════════════════════════════════
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);

  -- v_order2 est actif (acompte_paye) → un second doit être refusé.
  BEGIN
    PERFORM public.kit_open_order(v_client, '{}'::jsonb, 'acompte_paye');
    v_err := '(aucune erreur)';
  EXCEPTION WHEN OTHERS THEN v_err := SQLERRM;
  END;
  INSERT INTO t_res VALUES (
    17, 'T9a — 2e dossier ACTIF refusé',
    'kit_order_already_active', v_err, v_err LIKE '%kit_order_already_active%');

  -- Contraste : une fois clos, il ne bloque plus.
  PERFORM public.kit_set_status(v_order2, 'annule');
  BEGIN
    PERFORM public.kit_open_order(v_client, '{}'::jsonb, 'acompte_paye');
    v_err := 'ok';
  EXCEPTION WHEN OTHERS THEN v_err := SQLERRM;
  END;
  INSERT INTO t_res VALUES (
    18, 'T9b — dossier clos ⇒ un nouveau passe',
    'ok', v_err, v_err = 'ok');

  -- ══════════════════════════════════════════════════════════════════════
  -- T10 — Cascade : supprimer le dossier emporte son journal
  -- ══════════════════════════════════════════════════════════════════════
  SELECT count(*) INTO v_cnt FROM public.kit_order_events WHERE kit_order_id = v_order;
  DELETE FROM public.kit_orders WHERE id = v_order;
  SELECT count(*) INTO v_cnt2 FROM public.kit_order_events WHERE kit_order_id = v_order;

  INSERT INTO t_res VALUES (
    19, 'T10 — DELETE du dossier purge le journal',
    '≥1 puis 0', format('%s puis %s', v_cnt, v_cnt2),
    v_cnt >= 1 AND v_cnt2 = 0);

  -- ══════════════════════════════════════════════════════════════════════
  -- T11 — Prix : centimes, et arrondi de la répartition 40/60
  -- ══════════════════════════════════════════════════════════════════════
  SELECT id INTO v_order2 FROM public.kit_orders
   WHERE user_id = v_client AND status = 'acompte_paye'
   ORDER BY created_at DESC LIMIT 1;

  PERFORM public.kit_set_details(v_order2, 9900, 'note de test');
  SELECT price_total_cents INTO v_price FROM public.kit_orders WHERE id = v_order2;

  INSERT INTO t_res VALUES (
    20, 'T11 — kit_set_details écrit le prix en centimes',
    '9900', v_price::text, v_price = 9900);
END
$t$;

-- ════════════════════════════════════════════════════════════════════════════
--  T12 — Moindre privilège, vérifié explicitement (hors DO : requête catalogue)
-- ════════════════════════════════════════════════════════════════════════════
-- Attendu : UNIQUEMENT (authenticated, SELECT) sur les deux tables. Aucune ligne
-- pour `anon`, aucun INSERT/UPDATE/DELETE pour qui que ce soit.
INSERT INTO t_res
SELECT 21,
       'T12 — privilèges: seulement (authenticated, SELECT)',
       '2 lignes SELECT/authenticated',
       coalesce(string_agg(grantee || ':' || privilege_type, ', ' ORDER BY table_name, grantee, privilege_type), '(aucun)'),
       count(*) = 2
         AND bool_and(grantee = 'authenticated' AND privilege_type = 'SELECT')
  FROM information_schema.role_table_grants
 WHERE table_schema = 'public'
   AND table_name IN ('kit_orders', 'kit_order_events')
   AND grantee IN ('anon', 'authenticated');

-- ════════════════════════════════════════════════════════════════════════════
--  RÉSULTATS
-- ════════════════════════════════════════════════════════════════════════════
SELECT
  ordre,
  CASE WHEN ok THEN '✅' ELSE '❌' END AS r,
  test,
  attendu,
  obtenu
FROM t_res
ORDER BY ordre;

-- Rien ne persiste : la base de test ressort exactement comme avant.
ROLLBACK;
