-- Retrait des paliers « architecte » et « architecte+ » de l'offre Wyrm Forge.
--
-- Décision produit : ces deux paliers ne seront pas commercialisés. Les comptes
-- qui les portent sont repassés sur « maître », le palier payant le plus proche.
--
-- Étendue constatée sur PROD avant exécution (2026-09-01) : 4 comptes au total,
-- une seule ligne en 'architecte+' — le compte admin lui-même. Aucun client
-- réel concerné, aucun abonnement actif (bêta gratuite, paiement non branché).
--
-- ⚠️ Base PARTAGÉE avec l'app de bureau WPF. Bascule sûre pour les deux clients :
--   - `isPaidTier` (site) teste « != apprenti » : maître reste payant, aucun
--     accès perdu — la fonction ne lit PAS TIER_ORDER, c'est délibéré.
--   - `NavDict.Label` (app WPF) connaît « maître » : aucun libellé cassé.
--   - TIER_CONFIG des Edge Functions : architecte(+) et maître valaient tous
--     les deux 135 crédits / Sonnet — la bascule est NEUTRE côté budget IA.
--
-- ⚠️ `profiles.tier` n'a AUCUNE contrainte CHECK (vérifié sur les 83 migrations
-- antérieures ; seul `role` en a une, cf. baseline l.114). Choix ASSUMÉ de ne
-- pas en ajouter : `isPaidTier`, `shouldShowAds` et `NavDict.Label` sont tous
-- écrits pour tolérer un palier inconnu. Cette migration nettoie l'existant,
-- elle ne verrouille pas l'avenir — c'est le code applicatif qui cesse de
-- proposer ces valeurs (retrait de `TIER_ORDER` dans `lib/subscription.ts`).
--
-- `tier_expires_at` est laissé INTACT : l'abonnement payé court jusqu'à son
-- terme, seul le nom du palier change.
--
-- Le compte admin est INCLUS dans la bascule (il portait `architecte+` en base).
-- Son affichage ne dépend plus d'un palier : `page.tsx` utilise désormais le
-- marqueur de rôle `'admin'`, découplé de la grille commerciale.

-- ── Avant ────────────────────────────────────────────────────────────────
do $$
declare n_arch int; n_archp int; n_maitre int;
begin
  select count(*) into n_arch   from public.profiles where tier = 'architecte';
  select count(*) into n_archp  from public.profiles where tier = 'architecte+';
  select count(*) into n_maitre from public.profiles where tier = 'maître';
  raise notice 'AVANT  — architecte=%  architecte+=%  maître=%', n_arch, n_archp, n_maitre;
end $$;

-- ── Bascule ──────────────────────────────────────────────────────────────
update public.profiles
   set tier = 'maître'
 where tier in ('architecte', 'architecte+');

-- ── Après (garde-fou : échoue si la bascule est incomplète) ──────────────
do $$
declare n_reste int; n_maitre int;
begin
  select count(*) into n_reste  from public.profiles where tier in ('architecte','architecte+');
  select count(*) into n_maitre from public.profiles where tier = 'maître';
  raise notice 'APRÈS  — architecte(+) restants=%  maître=%', n_reste, n_maitre;
  if n_reste <> 0 then
    raise exception 'Bascule incomplète : % ligne(s) encore sur architecte(+)', n_reste;
  end if;
end $$;
