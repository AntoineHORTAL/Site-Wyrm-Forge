# Module Tournois — Wyrm Forge

Module de tournois communautaires (format Double Élimination 8 équipes, 2V2 ARAM par
défaut). Bracket public temps réel, inscriptions, panneau organisateur.

## Composants

- **DB** : tables `tournaments`, `tournament_teams`, `tournament_players`, `matches` +
  vues `tournament_standings` / `tournament_players_public` + fonctions SECURITY DEFINER
  (`seed_bracket`, `report_match_result`, `undo_match_result`, `start_match`).
  Migrations `20260611000001`→`20260612000001`. Schéma détaillé : voir `AGENTS.md`.
- **Edge Functions** : `tournament-register` (inscription publique, JWT optionnel),
  `tournament-admin` (actions orga, JWT vérifié dans le code).
- **Front** : `/tournois` (liste SSR + filtres), `/tournois/[slug]` (poster + bracket
  temps réel + classement), `/tournois/[slug]/admin`, `/tournois/[slug]/match/[code]`,
  `/tournois/creer`. Lib partagée : `src/lib/tournois.ts`.

## Écosystèmes / séries (routing 2 niveaux)

Tout tournoi appartient à une **série** (`tournament_series`). L'URL publique est
`/[serie]/[slug]` (ex. `/xv2/demo-noel-2024`). **Source de vérité de l'écosystème :
`tournaments.series_id`** (FK → `tournament_series`). L'ancienne colonne texte
`tournaments.series` est **DEPRECATED** (conservée comme filet, ne plus lire/écrire ;
suppression prévue dans une migration ultérieure). Unicité du slug **par série**
(`uq_tournaments_series_slug`). `category` ∈ `amis | communautaire`. Droits :
`is_tournament_admin` (scope `global` / `series:{slug}` / `{tournament_id}`) +
`is_series_admin` (création de tournoi dans une série). Bloc créa série isolé dans
l'EF (`resolveOrCreateSeries`) — création de série réservée aux admins globaux.

## Thèmes de série (bornés)

Chaque série porte une identité visuelle **bornée** : `tournament_series.theme_preset`
(clé d'une **liste fermée** définie dans le code) + `theme_primary` / `theme_accent`
(override hex de 2 couleurs, validés `^#[0-9a-fA-F]{6}$` côté DB **et** EF). Le thème
est appliqué en injectant des **variables CSS `--xv2-*` scopées** sur le conteneur racine
des pages série/tournoi (`resolveThemeVars` dans `src/lib/tournois/themes.ts`) — jamais de
`<style>` global, jamais de CSS venant de la base. Fallback = preset `xv2` (zéro régression).

### Pourquoi pas de CSS libre en base ?
Une chaîne CSS/HTML stockée puis injectée = faille d'injection + dette ingérable. Seules
des **clés de preset validées** et des **couleurs hex validées** sortent de la base ; rien
d'autre n'est interprété comme du style.

### Comment ajouter un preset ?
C'est une **PR code**, pas une écriture en base :
1. `src/lib/tournois/themes.ts` : ajouter la clé à `ThemePreset` + `THEME_PRESETS`, et son
   jeu de tokens (hex en dur) dans `PRESETS`.
2. Migration SQL : étendre `CHECK chk_series_theme_preset`.
3. Edge Function `tournament-admin` : ajouter la clé à `THEME_PRESETS`.

## Routing sous-domaine (prod) — `tournaments.wyrm-forge.com`

En production, le module est servi sur un sous-domaine dédié : un tournoi est à
`tournaments.wyrm-forge.com/[slug]`. Le préfixe interne `/tournois/...` n'est jamais
exposé. Géré par `src/proxy.ts` (proxy Next.js 16, ex-middleware) :

- **host = `NEXT_PUBLIC_TOURNOIS_HOST`** → `NextResponse.rewrite` de `/X` vers
  `/tournois/X` (barre d'URL inchangée).
- **host principal + `/tournois/*`** → redirect **308** vers le sous-domaine (URL
  canonique unique, anciens liens préservés).
- **localhost / preview (host non câblé)** → aucun rewrite, on reste sur `/tournois/...`.

### Construction des liens — JAMAIS de host ni `/tournois` en dur

Deux helpers dans `src/lib/tournois.ts`, dérivés du seul `NEXT_PUBLIC_TOURNOIS_HOST` :

- `tournamentPath(path)` → chemin **relatif** public (`/[slug]`) pour toute navigation
  in-app (Link, router, redirect). Relatif ⇒ résout sur le sous-domaine courant en prod
  **et** conserve la navigation client + le Realtime (pas de full reload). En local :
  `/tournois{path}`.
- `tournamentUrl(path)` → URL **absolue** canonique (metadata `canonical`/OG, liens
  entrants depuis le site principal).

> Déviation assumée vs prompt initial (qui demandait `tournamentUrl` absolu partout) :
> des URL absolues dans les `<Link>` internes casseraient la nav SPA et le channel
> Realtime unique de `TournamentLive`. On utilise donc `tournamentPath` (relatif) pour
> l'interne et `tournamentUrl` (absolu) pour le canonical/OG.

### ⚠️ Variable d'environnement Vercel (NON câblée à ce jour)

`NEXT_PUBLIC_TOURNOIS_HOST=tournaments.wyrm-forge.com` doit être défini **uniquement sur
l'environnement Production de Vercel** — surtout PAS en `.env.local` ni en Preview
(sinon les chemins relatifs `/[slug]` tomberaient en 404 sur un host qui ne réécrit pas).
Tant que la variable n'est pas posée + le DNS du sous-domaine configuré, la prod continue
de servir sur `/tournois/...` (comportement local).

## Administration des tournois — table `tournament_admins`

Les droits d'admin tournoi ne sont PAS branchés sur `profiles.role` (P0 auto-élévation
non résolu). Table dédiée `tournament_admins (user_id, scope, …)` à RLS stricte (un user
ne lit QUE ses propres droits ; aucune écriture client — tout via l'EF `tournament-admin`
en service_role). `scope` ∈ `'global'` | `'series:{nom}'` | `'{tournament_id}'`.

Helper SQL `is_tournament_admin(p_uid, p_tournament)` (SECURITY DEFINER) :
- `p_tournament = NULL` (contexte création) → true si scope `global` OU une série quelconque.
- `p_tournament` défini → true si `global`, `series:{série du tournoi}`, ou ce tournoi précis.

Actions EF réservées aux **admins globaux** : `grant_admin` / `revoke_admin`
(body `{ action, target_user_id, scope }`).

### BOOTSTRAP du premier admin global (à exécuter à la main)

L'action `grant_admin` exige déjà d'être admin global → le tout premier doit être inséré
manuellement :

```bash
supabase db query --linked "INSERT INTO public.tournament_admins (user_id, scope) \
  SELECT id, 'global' FROM auth.users WHERE email = 'antoinehortal2001@gmail.com' \
  ON CONFLICT (user_id, scope) DO NOTHING;"
```

> Déjà exécuté : `antoinehortal2001@gmail.com` (`35252895-…43ea`) est admin **global**.

## Données de démonstration — `demo-noel-2024`

Un tournoi de démonstration **terminé** est présent en base de production pour servir de
vitrine du module (bracket complet, classement, remontée loser bracket → champion
HWEINUH). Il reproduit le scénario des images de référence QA
(`docs/references/tournois/bracket.png`).

- Source de vérité du scénario : la migration `supabase/migrations/20260611000005_tournaments_demo.sql`
  (bandeau « NE PAS APPLIQUER EN PRODUCTION », marquée `applied` via `supabase migration
  repair` sans exécution — `db push` la saute). Les données ont été injectées **ad-hoc**
  en remote via `supabase db query --linked -f <migration>`.

### ⚠️ À supprimer AVANT le lancement beta

Avant d'ouvrir le module au public, retirer ce tournoi de démo. Une seule commande suffit —
la cascade FK efface équipes, joueurs et matchs associés :

```sql
DELETE FROM public.tournaments WHERE slug = 'demo-noel-2024';
```

Via CLI sur le projet lié :

```bash
supabase db query --linked "DELETE FROM public.tournaments WHERE slug = 'demo-noel-2024';"
```

> La suppression est sûre et réversible : pour réinjecter la démo, rejouer
> `supabase db query --linked -f supabase/migrations/20260611000005_tournaments_demo.sql`
> **une seule fois** (le script est idempotent sur le tournoi/équipes mais ré-insère des
> joueurs en double si exécuté deux fois sans `DELETE` préalable).
