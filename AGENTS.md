<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

---

# Wyrm Forge — Agent Reference

Application : assistant League of Legends (Next.js 16.2.4 + Supabase + Vercel). UI en **français**.

---

## 🔴 Règles critiques — ne jamais enfreindre

- **Middleware** : renommé en `proxy` dans Next.js 16 → fichier `src/proxy.ts`, export nommé `proxy` (pas `middleware`)
- **Tailwind v4** : syntaxe `@import "tailwindcss"` dans `globals.css` — ne jamais utiliser `@tailwind base/components/utilities`
- **Supabase client** : toujours `createClient` depuis `@/lib/supabase/client` — ne jamais instancier directement
- **Grilles responsive** : utiliser des classes CSS dans `globals.css` (ex: `.dash-grid-builds`), jamais de `grid-template-columns` en inline style — les media queries ne fonctionnent pas sur les styles inline

---

## 🔴 Quelle base Supabase le site interroge-t-il ? — bandeau « BASE DE TEST »

Pendant web du mécanisme de l'app WPF (`Services/AppConfig.cs` + bandeau `TestDbBanner`, documenté dans l'`AGENTS.md` du repo `Logiciel-Assistant-LOL`, § Pièges connus n°7). Même principe, **implémentation différente** — les différences ci-dessous sont délibérées, ne pas « aligner » les deux par réflexe.

- **Bascule** : par `.env.local` uniquement (`NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY`). Pas d'équivalent du canal Vélopack — le site n'a **pas** d'environnement de déploiement de test (décision HORTAL, 2026-08-12) : aucune config Vercel n'est impliquée.
- **Détection** : `src/lib/supabase/environment.ts` (module **pur**, testé — `environment.test.ts`, 16 tests). `isTestDatabase(url)` compare l'URL effective à `PROD_SUPABASE_URL`, casse et slash final normalisés.
- **Affichage** : `src/components/dev/TestDbBanner.tsx`, monté dans `src/app/layout.tsx` → visible sur **toutes** les pages. **Server Component** (pas de `'use client'`) : deux variables lues, du HTML statique rendu — aucun JS envoyé au navigateur pour ça.

### ⚠️ Dériver de l'URL, jamais d'un drapeau séparé
`isTestDatabase` se déduit de l'**URL effective**, pas d'un `NEXT_PUBLIC_IS_TEST` ni du canal de déploiement. Un drapeau séparé peut diverger de l'URL qu'il prétend décrire et afficherait « BASE DE TEST » à quelqu'un branché sur la PROD — le contresens exact que ce bandeau existe pour éviter. Même règle et même justification que côté WPF.

### ⚠️ Le durcissement ne peut PAS être copié du WPF — deux formats de clé
Le WPF détecte une config incohérente en comparant le couple (URL, clé) à des **couples connus codés en dur**. **Transposer ça ici serait faux** : pour le **même** projet de production, le site utilise une clé anon au **format hérité** (`eyJ…`, un JWT) là où le WPF utilise le **nouveau format** (`sb_publishable_…`). Les deux sont valides pour le même projet — une comparaison contre les clés du WPF déclencherait donc une fausse alerte sur la prod du site, et casserait à la première rotation de clé.

Détection retenue à la place, **structurelle et sans aucune clé en dur** (`inspectSupabaseEnv`) : les clés héritées sont des JWT dont le payload porte `{ ref: "<projet>" }` ; on compare ce `ref` au sous-domaine de l'URL. Fonctionne pour n'importe quel projet, y compris un futur troisième, et ne périme jamais.

**Conservateur par construction** — tout ce qui n'est pas vérifiable est déclaré valide, jamais suspect :

| Config | Verdict |
|---|---|
| URL prod + clé (JWT) du projet test | **incohérent** — le bug du 2026-08-12 |
| URL test + clé (JWT) de prod | **incohérent** |
| URL quelconque + clé `sb_publishable_…` | **ok** — format opaque, aucun `ref` à lire |
| URL hors `*.supabase.co` (proxy local, domaine perso) | **ok** |

### ⚠️ L'écran bloquant est BRIDÉ AU DÉVELOPPEMENT (`NODE_ENV !== 'production'`)
Sur config incohérente ou variables manquantes, un écran rouge plein écran remplace le site et nomme le fichier à corriger — pendant de la boîte de dialogue + `Environment.Exit` du WPF. **Il ne sort jamais en production** : la faute visée n'existe que sur un poste de dev (`.env.local` édité à la main), alors qu'un faux positif en prod mettrait de vrais visiteurs devant un mur. En production, le cas est signalé par `console.error` côté serveur et rien de plus.

### 🔍 Piège Next.js — `process.env.NEXT_PUBLIC_*` doit être écrit LITTÉRALEMENT
Next remplace ces expressions par leur valeur **à la compilation**, et uniquement sous leur forme littérale. Un accès dynamique (`process.env[nom]`) n'est pas remplacé et vaut `undefined` dans le navigateur. D'où la lecture centralisée dans `readSupabaseEnv()`. Corollaire : **modifier `.env.local` n'a aucun effet sans redémarrer `npm run dev`**.

### Vérifié au rendu réel (2026-08-12), pas seulement en test unitaire
Trois `next dev` avec variables surchargées par le shell : URL test + clé test → bandeau + infobulle portant l'URL ; URL prod + clé test → écran bloquant nommant les deux projets, aucun bandeau ; `.env.local` réel (prod + prod) → ni l'un ni l'autre, page normale.

---

## 🟠 Architecture

### State & props
> ⚠️ **Ce bloc a changé au chantier « rafraîchir la vitrine » (2026-09-03).** Le header a été
> sorti de `src/app/page.tsx` vers le layout racine ; l'état qui le nourrissait a suivi. Les trois
> puces d'origine (activeTab lifté dans page.tsx, types exportés depuis page.tsx, effectiveTier
> calculé dans page.tsx) ne décrivent plus le code.

- **Le header (`Nav`) est monté une seule fois, dans `src/app/layout.tsx`**, via
  `src/components/nav/SiteHeader.tsx`. Il est donc présent sur TOUTES les routes — `/matches`,
  `/champions`, `/patch-notes`, `/about`, `/tournois`, `/summoner`, `/live`, pages légales — et
  plus seulement sur `/`. Seul `/prac` en est exclu (`HEADERLESS_PREFIXES` dans `SiteHeader`) :
  sous-domaine interne, il porte déjà sa propre navigation.
- **`SessionProvider`** (`src/components/providers/SessionProvider.tsx`, monté dans le layout
  racine) détient utilisateur, profil, solde d'Écailles et flag `ecailles_enabled`, plus
  `effectiveTier` (marqueur de RÔLE `'admin'` pour les admins, peu importe la valeur en DB — pas
  un palier : déclaré dans `tiersFr`/`tiersEn` et dans les deux `TIER_COLORS`, mais hors de
  `TIER_ORDER`, donc jamais proposable ni écrivable dans `profiles.tier`). ⚠️ **Un seul jeu
  d'appels Supabase pour tout le site** : une page qui a besoin de la session la LIT
  (`useSession()`), elle ne la recharge jamais. Le provider rend aussi `AuthModal`, puisque
  `openAuth()` doit être appelable depuis le header, donc depuis n'importe quelle route.
- **`DashboardNavProvider`** porte `activeTab` (que `page.tsx` REND et que le header PILOTE) et
  `goToTab` : sur `/` c'est un changement d'état, ailleurs un `router.push('/?tab=…')`, que
  `page.tsx` relit au montage (garde `DEEP_LINKABLE_TABS`). Sans ça, les onglets du drawer
  mobile ne feraient rien hors de `/`.
- `DashTab` (type union) et `UserProfile` (interface) vivent dans **`src/lib/session-types.ts`** —
  module neutre, parce que les providers ne peuvent pas importer `page.tsx` (qui les importe déjà).
  `page.tsx` les ré-exporte pour compatibilité.
- Les liens centrés du header vivent dans **`src/lib/nav-links.ts`** (`NAV_LINKS`, module PUR
  testable sans jsdom). Deux natures : `section` (ancre + scroll-spy) et `route` (vraie route
  Next). « Joueurs » → `/matches` est le seul lien-route. `landing.test.ts` verrouille
  l'appariement position-par-position avec `nav.links` du dictionnaire.

### Emplacements publicitaires (dashboard)

> Les pages PUBLIQUES en portent aussi depuis le 2026-09-12 (`/patch-notes`,
> `/champions`) — voir § Pages publiques et examen AdSense. Les deux verrous de
> `lib/ads.ts` y sont les mêmes ; seule la lecture du palier change pour un
> visiteur anonyme (`shouldShowPublicAds`).

- **Point d'intégration UNIQUE côté dashboard** : `src/components/dashboard/Dashboard.tsx`, troisième piste de la grille `.dash-layout`. Pas de logement par fonctionnalité (rien dans le Builder, rien dans MatchUp) — tout ce qui vit derrière le dashboard hérite de la colonne sans rien déclarer. **La vitrine (`/`) n'est toujours PAS concernée** : décision du chantier AdSense, pas de publicité sur la page qui doit convaincre.
- **Deux verrous indépendants**, tous deux dans `src/lib/ads.ts` :
  - `shouldShowAds(tier, isAdmin)` — **seul `apprenti` voit des pubs**. C'est une LISTE BLANCHE d'un élément, jamais une liste noire des paliers payants : un palier ajouté demain n'affiche rien par défaut. Palier inconnu ou profil non chargé ⇒ pas de pub.
  - `hasAdConsent()` — renvoie `false` **en dur** tant qu'aucune CMP n'existe. Aucun script tiers n'est chargé, donc aucun cookie publicitaire. C'est le seul endroit à modifier le jour où la CMP arrive.
- **Régie agnostique** : `AdSlot` ne connaît aucun fournisseur. Le point d'insertion du script est balisé dans son `useEffect`.
- **Anti-CLS** : la largeur de la piste est réservée par le CSS (`.dash-layout--ads` dans `globals.css`), pas par du JS — donc connue avant le premier rendu React. Le tier est résolu avant que `<Dashboard>` monte (`page.tsx` garde `loading` jusque-là), la colonne ne peut donc pas apparaître après coup.
- **Seuils responsive** — dérivés des largeurs réelles, calcul complet en commentaire au-dessus de `.dash-adrail` dans `globals.css` (source qui fait foi) :

| Viewport | Colonne pub | Contenu restant |
|---|---|---|
| ≥ 1440 px | 300×600 | 780 px |
| 1280–1439 px | 160×600 | 760 px et + |
| < 1280 px | **masquée** | inchangé |

  Plancher visé : 768 px de contenu, imposé par `.dash-grid-jungle` (448 px figés). Sous 1280 px la colonne disparaît **entièrement** plutôt que de rogner le contenu ou la sidebar.
- ⚠️ **`ConsentBanner.tsx` n'est PAS une CMP** — malgré son nom, il annonce une demande de suivi « prac ». Ne pas y brancher le consentement publicitaire.
- ⚠️ **Avant activation réelle** : la page `/confidentialite` affirme aujourd'hui « ni cookie publicitaire, ni traceur tiers […] c'est pourquoi aucun bandeau de consentement ne t'est présenté ». Cette phrase devient fausse dès qu'une régie est branchée — à réécrire en même temps que la CMP.

### Navigation mobile
- Pas de bottom tab bar — la navigation dashboard est intégrée dans le **hamburger drawer** (Nav.tsx)
- Classes CSS : `.nav-desktop` (visible ≥768px), `.nav-hamburger-btn` (visible <768px)

### Tabs dashboard
- Définis dans `src/components/dashboard/Dashboard.tsx` : `tabGroups` (groupés) et `dashTabs` (liste plate pour le drawer)
- `TabDef` type : `{ id, label, shortLabel, icon, locked?, soon? }`
- `locked: true` → nécessite `unlocked={isAdmin}` dans SidebarBtn pour être accessible
- `soon: true` → non cliquable, badge "Bientôt", opacité réduite
- **Overlay tab supprimé volontairement** — fonctionnalité réservée à l'app desktop, inutile sur le site

### Admin
- Détection : `profile.role === 'admin'`
- Table `admin_users` avec **RLS activé** — `deny_anon` + `deny_authenticated` bloquent tout accès client direct ; `is_admin()` bypass via SECURITY DEFINER
- Fonction `is_admin()` : SECURITY DEFINER, lit `admin_users` sans déclencher les policies
- Compte admin : `admin@wyrm-forge.com` — role='admin', tier='maître' en DB (basculé depuis `architecte+` par la migration `20260901000004`, ce palier ayant été retiré de l'offre). Son affichage ne dépend plus de son tier : `effectiveTier` pose `'admin'`

---

## 🟡 Thème & style

### Deux thèmes
- `mythic` : violet/or, police Cinzel (`font-mythic`), variable `c = theme === 'mythic'` utilisée partout
- `classic` : zinc/violet

### Classes utilitaires globales
- `.accent-text` : gradient de couleur sur le texte
- `.font-mythic` : police Cinzel
- `.wf-btn-primary` : bouton principal

### Couleurs des tiers
| Tier | Couleur |
|---|---|
| apprenti | `#A1A1AA` |
| forgeron | `#5DCAA5` |
| maître | `#7F77DD` |
| légion | `#3A8AC9` |
| admin | `#EF9F27` |

⚠️ `admin` est un marqueur de **RÔLE**, pas un palier : il est hors de `TIER_ORDER`, posé par `effectiveTier` (`page.tsx`), et n'est jamais écrit dans `profiles.tier`. Il reprend l'or de l'ancien `architecte+` pour que la carte admin garde exactement son apparence. Les paliers `architecte` (`#BA7517`) et `architecte+` (`#EF9F27`) ont été retirés de l'offre par la migration `20260901000004`.

### Badge certifié
SVG : cercle bleu `#3B82F6` avec checkmark blanc — défini inline dans AdminTab.tsx et Nav.tsx (composant `CertifiedBadge`)

---

## 🟡 Base de données — table `profiles`

| Colonne | Type | Nullable | Notes |
|---|---|---|---|
| `id` | `uuid` | NOT NULL | PK, FK → `auth.users` |
| `username` | `text` | NOT NULL | |
| `email` | `text` | nullable | copié depuis `auth.users` à la création |
| `tier` | `text` | NOT NULL | `apprenti` \| `forgeron` \| `maître` \| `légion` — **aucune contrainte CHECK**, la liste est une convention de code (`TIER_ORDER`). `architecte` / `architecte+` retirés de l'offre par `20260901000004` |
| `role` | `text` | NOT NULL | `'user'` \| `'admin'` |
| `certified` | `boolean` | NOT NULL | default `false` |
| `tier_expires_at` | `timestamptz` | nullable | `null` = compte à vie |
| `created_at` | `timestamptz` | NOT NULL | |
| `riot_puuid` | `text` | nullable | PUUID Riot, stable cross-région — indexé (`idx_profiles_riot_puuid`) |
| `riot_gamename` | `text` | nullable | partie "nom" du Riot ID (ex : `"Faker"`) |
| `riot_tagline` | `text` | nullable | partie "tag" du Riot ID (ex : `"T1"`) |
| `riot_platform` | `text` | nullable | région Riot (ex : `"euw1"`) |
| `riot_rank` | `text` | nullable | clé de rang choisie par l'utilisateur sur le site (ex : `'gold'`) — contrainte CHECK : `'iron'\|'bronze'\|'silver'\|'gold'\|'platinum'\|'emerald'\|'diamond'\|'master+'` ou `NULL` |
| `riot_link_pending` | `jsonb` | nullable | challenge icône en cours — `{ target_icon, candidate_puuid, platform, game_name, tag_line }` — écrit par Edge Function, jamais par le client |
| `riot_link_expires_at` | `timestamptz` | nullable | deadline UTC du challenge en cours — NULL si aucun challenge actif |

Contrainte : `uq_profiles_riot_puuid UNIQUE (riot_puuid)` — un compte Riot par profil Wyrm Forge. Les NULLs ne violent pas la contrainte.

### Logique abonnements
- `tier_expires_at = null` → compte à vie (exclu des stats de répartition par tier)
- Abonné actif = `tier !== 'apprenti'` + `tier_expires_at` défini + pas encore expiré
- Les admins sont exclus des stats de comptage par tier

### Logique champs Riot
- Les colonnes `riot_*` sont peuplées progressivement — toujours tester `if (riot_gamename)` avant usage
- `riot_puuid` est l'identifiant stable : utilise-le comme clé de cache côté Edge Functions
- `riot_rank` est choisi par l'utilisateur sur le site (select dans /profil) — l'app desktop ne lit ni n'écrit cette colonne
- Fallback plateforme : si `riot_platform` est `null`, utiliser `'euw1'` par défaut
- `riot_link_pending` et `riot_link_expires_at` sont transitoires — utilisés uniquement pendant le flow de vérification icône. L'app desktop ne lit ni n'écrit ces colonnes.

### Protection des colonnes riot_*
Un trigger BEFORE INSERT OR UPDATE (`trg_protect_riot_columns → fn_protect_riot_columns()`) bloque toute écriture directe des colonnes `riot_puuid`, `riot_gamename`, `riot_tagline`, `riot_platform`, `riot_link_pending`, `riot_link_expires_at` quand `current_user = 'authenticated'` (appel client avec JWT). Comportement différencié : à l'**INSERT**, rejet si une colonne `riot_*` est NOT NULL (le client ne peut poser aucune valeur riot à la création) ; à l'**UPDATE**, rejet seulement d'un changement réel (`IS DISTINCT FROM OLD`).
- Roles non bloqués : `service_role` (Edge Functions), `postgres` (fonctions SECURITY DEFINER).
- Fonction `clear_riot_link()` : SECURITY DEFINER, GRANT authenticated — seul moyen propre pour un utilisateur de délier son compte Riot. Ne touche pas `riot_rank`.

### Migrations appliquées
```sql
-- Colonnes email + certified (existaient avant le versionnage)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS certified BOOLEAN NOT NULL DEFAULT false;
UPDATE profiles SET email = u.email FROM auth.users u WHERE profiles.id = u.id AND profiles.email IS NULL;

-- Colonnes Riot (migration 20260530000002)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS riot_puuid    TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS riot_gamename TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS riot_tagline  TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS riot_platform TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS riot_rank     TEXT;
CREATE INDEX IF NOT EXISTS idx_profiles_riot_puuid ON profiles (riot_puuid) WHERE riot_puuid IS NOT NULL;

-- M1 — Riot link challenge (migration 20260606000004)
ALTER TABLE public.profiles ADD CONSTRAINT uq_profiles_riot_puuid UNIQUE (riot_puuid);
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS riot_link_pending     JSONB;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS riot_link_expires_at  TIMESTAMPTZ;
-- + trigger trg_protect_riot_columns + function clear_riot_link()
```

---

## 🟡 Base de données — table `patch_notes`

| Colonne | Type | Nullable | Notes |
|---|---|---|---|
| `id` | `bigint` | NOT NULL | PK auto-générée |
| `version` | `text` | NOT NULL | Ex : `"26.11"` (numérotation publique Riot, pas DDragon) — UNIQUE, clé anti-doublon |
| `title` | `text` | NOT NULL | Titre FR du résumé |
| `summary_jsonb` | `jsonb` | NOT NULL | Résumé structuré — `{ subtitle, highlights[], counts, champions[{name, ddragon_key, type, changes[]}], items[], systeme[] }` |
| `raw_source` | `text` | nullable | Scrape Riot brut — régénération + audit |
| `image_url` | `text` | nullable | URL image optionnelle |
| `status` | `text` | NOT NULL | `'draft'` \| `'published'` — default `'draft'` |
| `source_url` | `text` | nullable | URL Riot scrapée (attribution) |
| `model` | `text` | nullable | Modèle Anthropic utilisé (audit coût) |
| `created_at` | `timestamptz` | NOT NULL | |
| `updated_at` | `timestamptz` | NOT NULL | Trigger BEFORE UPDATE |
| `published_at` | `timestamptz` | nullable | null tant que draft |
| `published_by` | `uuid` | nullable | FK auth.users — admin qui a publié |

### RLS patch_notes
- SELECT `published` : `anon` + `authenticated`
- SELECT `draft` : admin uniquement (`is_admin()`)
- UPDATE : admin uniquement — édition + publication via client
- INSERT : `service_role` uniquement (Edge Function `patch-notes-generator`)
- DELETE : refusé par défaut

### Table `app_settings`
Réglages globaux clé/valeur, **et catalogue de feature flags** depuis la migration `20260905000001_feature_flags_catalog.sql`.

RLS :
- SELECT `authenticated` → **toutes** les lignes (`as_select_authenticated`, inchangée)
- SELECT `anon` → **uniquement `is_public = true`** (`as_select_anon`, 20260905000001)
- UPDATE `is_admin()` ; INSERT/DELETE bloqués côté client

> ⚠️ La policy `anon` est ce qui rend les flags lisibles **sans compte** : l'app WPF
> fonctionne sans compte Wyrm Forge (`verify_jwt = false` sur les fonctions Riot,
> cf. `config.toml`) et le site sert des pages publiques. Avant elle,
> `ForgeService.GetAppFlagAsync` renvoyait `false` faute de JWT — un kill switch
> aurait été invisible pour exactement les utilisateurs qu'on ne peut pas prévenir
> autrement.

#### Colonnes de catalogue (20260905000001)

| Colonne | Rôle |
|---|---|
| `kind` | `'setting'` (réglage/tuning, hors catalogue) · `'launch'` (cat. 1, défaut `'false'`) · `'kill'` (cat. 2, défaut `'true'`) |
| `surface` | `'web'` \| `'app'` \| `'shared'` — informatif ; aucun client ne filtre dessus |
| `group_key` | Section du panneau admin (`ecailles`, `overlay`, `riot`, `ia`, `contenu`, `site`, `app`, `scenarios`) |
| `parent_key` | FK auto-référente. **Un flag n'est actif que si tous ses ancêtres le sont** — résolution faite une fois par les clients |
| `off_behavior` | `'hidden'` \| `'notice'` \| `'degraded'` — ce que voit l'utilisateur, affiché à l'admin **avant** la bascule |
| `label_fr/en`, `desc_fr/en` | Libellés **portés par la base**, pas par le dico i18n → **ajouter un flag = un INSERT, sans déploiement** |
| `sort_order` | Ordre dans le groupe (blocs de 100 par groupe) |
| `reason` | Motif de coupure, obligatoire à l'extinction d'un kill switch, remis à `NULL` à la réactivation |
| `is_public` | Lisible par `anon`. **Règle : tout flag est public, toute valeur de tuning reste privée** |

Contrainte `app_settings_flag_metadata_complete` : un `kind <> 'setting'` DOIT avoir
ses 4 libellés + `surface` + `group_key` + `off_behavior`. C'est le filet qui remplace
l'erreur de compilation perdue en sortant les libellés du dico typé — un flag muet est
un échec d'INSERT, pas un interrupteur sans texte dans le panneau.

#### ⚠️ Sémantique de `updated_at` / `updated_by`

Les deux triggers (`trg_app_settings_updated_at`, `trg_app_settings_actor`) portent
`WHEN (NEW.value IS DISTINCT FROM OLD.value)` : ils répondent à « **quand, et par qui,
la VALEUR a-t-elle changé ?** », ce qu'affiche le panneau admin (« coupé par X il y a
12 min »). Une migration qui ne touche que des métadonnées de catalogue ne les réécrit
donc pas. `updated_by` n'était **jamais** renseigné avant 20260905000001 (AdminTab ne
posait que `value`) ; il l'est désormais côté base, ce qui couvre aussi toute écriture
future par RPC ou Edge Function.

#### Valeurs de tuning (`kind = 'setting'`, `is_public = false`)

| key | value courante | Migration |
|---|---|---|
| `patch_auto_publish` | `'false'` | 20260530000009 — réglage de la génération de patch notes. Garde son interrupteur dédié dans la carte Patch notes d'AdminTab, hors des deux sections du catalogue |
| `cap_daily_scales` | `'12'` | 20260607000001 (était '25' en 20260606000001) |
| `streak_bonus_pct` | `'0'` | 20260606000011 (corrigé depuis '10' de 20260606000001) |

> Ces trois lignes sont désormais invisibles pour `anon`. C'est l'objectif que visait la
> migration P2 `20260606000013`, atteint pour ce rôle ; l'étendre à `authenticated`
> reste bloqué par la même raison qu'alors (AdminTab lit la table côté client).

#### Catalogue de flags — 40 lignes

**Catégorie 1, lancement (6)** — `off_behavior = 'hidden'`, valeur `'false'` :
`ecailles_enabled` (parent) → `shop_enabled`, `quests_enabled`, `cosmetics_enabled` ;
`scenarios_enabled` ; et `kit_sur_mesure_enabled` (migration `20260908000002`,
`group_key = 'site'`, `sort_order = 630`).

> ⚠️ `kit_sur_mesure_enabled` est le premier flag de lancement `surface = 'web'`.
> Il est donc dans `LAUNCH_FLAG_KEYS` (`src/lib/feature-flags.ts`) **sans** pendant
> dans `ColdStartClosed` de `Services/FeatureFlagService.cs` — l'app WPF n'embarque
> aucune brique de ce service, elle ne peut pas le laisser fuir. Les cinq autres
> restent la liste partagée entre les deux clients. Ne pas « réaligner » les deux
> listes par réflexe : c'est la règle énoncée dans `feature-flags.ts` appliquée
> dans l'autre sens.

**Catégorie 2, kill switches (34)** — valeur `'true'` :

| group_key | clés |
|---|---|
| `riot` | `riot_history_enabled` (EF riot-matches / riot-match-detail / riot-rank), `live_game_enabled`, `riot_link_enabled` |
| `ia` | `matchup_ai_enabled` (**seul `'degraded'`** — le repli stats+radar existe déjà), `postgame_ai_enabled` |
| `contenu` | `patch_notes_enabled`, `workshop_builds_enabled`, `workshop_jungle_enabled` |
| `site` | `ads_enabled`, `player_search_enabled`, `prac_enabled` |
| `app` | `champ_select_advisor_enabled`, **`item_set_export_enabled`**, **`rune_page_apply_enabled`**, `minimap_detection_enabled` |
| `overlay` | `overlay_enabled` (maître) + **18 enfants**, parité 1:1 avec les propriétés `Show*` de `Models/OverlayConfig.cs` (app WPF) |

> ⚠️ Les deux clés en gras gardent les seules features qui écrivent **hors du périmètre
> de l'app, dans les fichiers du client League** (sets d'objets, page de runes). Ce sont
> les kill switches à plus forte valeur du lot.

**Overlay — pourquoi 18 et pas 19.** `OverlayConfig` porte 19 booléens ; `UseTimelineView`
est volontairement absent du catalogue : ce n'est pas un toggle de visibilité mais un
choix de **mode** exclusif (timers classiques ↔ frise). Le couper ne masquerait rien, il
forcerait l'utilisateur dans l'autre mode. Les clés reprennent le nom exact de la
propriété en snake_case (`ShowBaronTimer` → `overlay_show_baron_timer`), redondance
« show » comprise : la correspondance doit rester mécanique et vérifiable.

**Overlay — `off_behavior = 'hidden'`, jamais `'notice'`.** En jeu, personne ne lit un
encart : ni place, ni attention, et un message flottant sur la map serait pire que le bug
qu'on coupe. Un bloc coupé **ne se dessine pas**. L'explication vit dans l'onglet Overlay
de l'app, où la case correspondante apparaît désactivée.

---

## 🟡 Base de données — table `searched_summoners`

| Colonne | Type | Nullable | Notes |
|---|---|---|---|
| `region` | `text` | NOT NULL | PK partielle — ex : `"euw1"` |
| `game_name` | `text` | NOT NULL | PK partielle — partie nom du Riot ID |
| `tag_line` | `text` | NOT NULL | PK partielle — partie tag du Riot ID |
| `last_seen` | `timestamptz` | NOT NULL | Dernière occurrence, default `now()` |

Clé primaire composite `(region, game_name, tag_line)`.
Index `idx_ss_prefix` sur `(region, lower(game_name) text_pattern_ops)` — autocomplete prefix ILIKE insensible à la casse.

### RLS searched_summoners
- SELECT : `anon` + `authenticated` — suggestions publiques, aucun login requis
- INSERT/UPDATE : aucune policy client — upsert via `service_role` (Edge Functions) uniquement
- DELETE : bloqué (aucune policy)

### Alimentation
- `riot-matches` : upsert du joueur recherché après résolution Riot ID réussie
- `riot-match-detail` : upsert fire-and-forget des 10 participants à chaque consultation de match (post-déploiement, cache v2 uniquement)

---

## 🟡 Base de données — table `scenarios`

Éditeur de macro stratégique 5v5 (onglet « Scénarios », `src/components/dashboard/tabs/ScenariosTab.tsx`).

| Colonne | Type | Nullable | Notes |
|---|---|---|---|
| `id` | `uuid` | NOT NULL | PK, default `gen_random_uuid()` |
| `user_id` | `uuid` | NOT NULL | FK → `auth.users` ON DELETE CASCADE |
| `name` | `text` | NOT NULL | Nom du scénario |
| `allies` | `jsonb` | NOT NULL | default `'[]'` — 5 alliés (un par rôle) |
| `drawings` | `jsonb` | NOT NULL | default `'[]'` — tracés posés sur la map |
| `created_at` | `timestamptz` | NOT NULL | default `now()` |

> ⚠️ Table **créée ad-hoc** sur le remote avant le versionnage — **codifiée a posteriori** par la migration `20260622000001_scenarios.sql` (idempotente : `CREATE TABLE IF NOT EXISTS` + `DROP/CREATE POLICY`, rejouable sans risque contre l'existant). Au prochain `db push`, soit la migration s'applique sans effet de bord, soit la marquer `applied` via `supabase migration repair`.

### Contrat JSONB (partagé site ↔ app WPF — interop bidirectionnelle, noms FIGÉS)
Le modèle C# miroir vit dans `Logiciel-Assistant-LOL/Models/Scenario.cs`. Ne jamais renommer un champ sans synchroniser les deux clients.

- **`allies`** : `[ { role: 'TOP'|'JUNGLE'|'MID'|'ADC'|'SUPPORT', champ: { id, name, image } | null } ]` — objet champion DDragon **complet** (pas juste un id), 5 entrées.
- **`drawings`** : `[ { id, type: 'ward'|'arrow'|'zone'|'ping'|'lane', points: [{x,y}] (POURCENTAGES 0–100), wardType?: 'yellow'|'control'|'blue', pingType?: 'danger'|'help'|'fight', laneId?: 'TOP'|'MID'|'BOT', color?, phase?: 'early'|'mid'|'late'|'all', label? } ]`
  - Cardinalité `points` : ward/ping/zone = 1 ; arrow = 2 ; lane = 0 (laneId seul). Zone = cercle rayon fixe.
  - Une seule liste, champ `phase` par élément (pas de listes séparées).
- **Ennemis NON stockés** (rangée décorative fixe côté UI).

### RLS scenarios (owner-based, migration 20260622000001)
- SELECT / INSERT / UPDATE / DELETE : `authenticated` uniquement, `(select auth.uid()) = user_id` (INSERT + UPDATE avec `WITH CHECK` pour bloquer la réassignation de `user_id`).
- `anon` : aucun accès. GRANT `authenticated` sur la table (Data API).

> ✅ **`20260901000003` — jeu de policies ad-hoc retiré. APPLIQUÉE ET VALIDÉE sur test ET prod le 2026-09-01** (`db push` manuel, sondes vertes : la sonde `anon` est passée de `200 []` à `42501`, le CRUD utilisateur est resté inchangé). Elle retire les 4 policies `"Users can ..."` — sans clause `TO`, donc PUBLIC, `anon` compris — que `20260815000005` avait **reproduites** sans les nettoyer, pose le `REVOKE ALL ... FROM anon, authenticated` qui manquait depuis toujours, et supprime l'index `scenarios_user_idx` (préfixe strict de `idx_scenarios_user_time`). Les 4 policies `scn_*` restent seules en place.
>
> C'est ce qui rend la ligne « `anon` : aucun accès » ci-dessus **littéralement** vraie. Avant, elle ne l'était qu'en pratique : la table portait le `GRANT ALL` par défaut de Supabase et le refus ne tenait qu'au prédicat `auth.uid() = user_id` s'évaluant à NULL pour un visiteur non connecté. Le refus est désormais un privilège, plus un effet de bord d'évaluation.
>
> ⚠️ Comme pour `20260901000002`, **l'application a précédé le commit** `13369ec` qui a introduit le fichier dans le dépôt, et dont le message affirme à tort « PAS ENCORE APPLIQUEES ». L'historique git n'est pas réécrit : c'est cette section qui fait foi.

> 🟡 **Dette connue — le verrou « palier payant » des Scénarios est PUREMENT CÔTÉ CLIENT.** Constaté le 2026-09-01. L'accès à l'onglet est décidé dans `components/dashboard/Dashboard.tsx` (`isPro = isAdmin || isPaidTier(profile?.tier)`), donc **dans le navigateur**. Les 4 policies `scn_*` ne testent que `(select auth.uid()) = user_id` — **aucune notion de palier en base**. Un compte Apprenti qui appelle PostgREST directement lit, crée, modifie et supprime ses scénarios sans obstacle. C'est un verrou d'affichage, pas une barrière de sécurité, et l'abaissement du seuil de `maître` à « tout palier payant » n'y change rien.
>
> **Question de conception à trancher AVANT d'écrire la moindre policy** : que devient le contenu déjà créé par un compte qui redescend en Apprenti (fin d'abonnement) — **lecture seule** (SELECT reste ouvert, seuls INSERT/UPDATE/DELETE deviennent conditionnés au palier) ou **invisible** (SELECT lui-même conditionné) ? Le second fait disparaître des données que l'utilisateur a produites et pourrait vouloir récupérer ; le premier laisse s'accumuler du contenu sans contrepartie. Tant que ce n'est pas tranché, écrire la policy serait prématuré.
>
> Correction éventuelle = policies avec jointure sur `profiles.tier`, dans une migration dédiée. **Non planifiée à ce jour.**

### Consommateurs
- **Site React** : CRUD client Supabase direct (`supabase.from('scenarios')`, pas d'Edge Function). Onglet `locked: true` (admin / tier Pro).
- **App WPF** : `ScenarioService` (CRUD PostgREST sous **JWT user**, calqué sur `ForgeService`) — port en cours (Lot 0 : migration + modèles miroir + service ; Lot 1 : vue lecture seule `ScenariosTab`). Carte de fond = **même art que le site** (DDragon `map11` v14.24.1, `ScenarioService.MapImageUrl`), pas la minimap in-game — garantit l'alignement des tracés.

---

## 🟡 Base de données — table `rank_stat_samples`

| Colonne | Type | Nullable | Notes |
|---|---|---|---|
| `id` | `bigint` | NOT NULL | PK auto-générée (GENERATED ALWAYS AS IDENTITY) |
| `puuid` | `text` | NOT NULL | PUUID Riot — stocké pour dédup uniquement, jamais exposé |
| `match_id` | `text` | NOT NULL | Identifiant de match Riot |
| `region` | `text` | NOT NULL | Ex : `"euw1"` |
| `queue` | `int` | NOT NULL | `420` = solo/duo, `440` = flex |
| `tier` | `text` | NOT NULL | `IRON`\|`BRONZE`\|`SILVER`\|`GOLD`\|`PLATINUM`\|`EMERALD`\|`DIAMOND`\|`MASTER`\|`GRANDMASTER`\|`CHALLENGER` |
| `role` | `text` | NOT NULL | `TOP`\|`JUNGLE`\|`MIDDLE`\|`BOTTOM`\|`UTILITY`\|`FILL` |
| `kills` | `int` | NOT NULL | |
| `deaths` | `int` | NOT NULL | |
| `assists` | `int` | NOT NULL | |
| `cs_per_min` | `numeric(5,2)` | NOT NULL | |
| `vision_score` | `int` | NOT NULL | |
| `damage_dealt` | `int` | NOT NULL | |
| `gold_earned` | `int` | NOT NULL | |
| `duration_s` | `int` | NOT NULL | Durée de la partie en secondes |
| `win` | `boolean` | NOT NULL | |
| `collected_at` | `timestamptz` | NOT NULL | default `now()` |

Contrainte `uq_rss_puuid_match UNIQUE (puuid, match_id)` — un sample par (joueur, partie).
Index `idx_rss_bucket` sur `(region, queue, tier, role)` — requêtes d'agrégation.
Index `idx_rss_collected` sur `(collected_at)` — purges temporelles.

### RLS rank_stat_samples
- SELECT/INSERT/UPDATE/DELETE : aucune policy client — anon + authenticated bloqués par défaut
- Insertion via `service_role` (Edge Functions) uniquement — bypass RLS automatique
- Accès aux agrégats exclusivement via `get_rank_avg()` SECURITY DEFINER

### Fonction `get_rank_avg(p_region, p_queue, p_tier, p_role, p_min_samples DEFAULT 50)`
- SECURITY DEFINER — lit `rank_stat_samples` sans déclencher les policies RLS
- Retourne : `sample_count`, `avg_kills`, `avg_deaths`, `avg_assists`, `avg_cs_per_min`, `avg_vision_score`, `avg_damage_dealt`, `avg_gold_earned`, `avg_winrate`
- Retourne **aucune ligne** si le bucket contient moins de `p_min_samples` échantillons (évite d'exposer des agrégats non représentatifs)
- `GRANT EXECUTE TO anon, authenticated`

### Alimentation
- `riot-matches` : appelle `harvestRankStats()` depuis `supabase/functions/_shared/harvest-rank-stats.ts` — fire-and-forget, cache MISS + start===0 + appel by Riot ID uniquement. Lit le tier depuis `riot_cache` (clé `rank:{platform}:{gameName}:{tagLine}`).
- Insertion via service_role — bypass RLS automatique.
- Purge recommandée : `DELETE FROM public.rank_stat_samples WHERE collected_at < NOW() - INTERVAL '1 year'`

### Consommateurs
- **Site React** : appel `get_rank_avg()` pour comparaison de performance joueur vs bucket de rang
- **App WPF** : peut appeler `get_rank_avg()` via la même Edge Function ou appel direct Supabase RPC
- **Lignes brutes** : inaccessibles aux deux clients — service_role uniquement

---

## 🟡 Base de données — Kit sur mesure (`kit_orders`, migration 20260908000001)

Service payant d'accompagnement personnalisé, **add-on ponctuel orthogonal à
`profiles.tier`**. Lot 1 livré : V0 interne, sans paiement en ligne — l'admin
encaisse et fixe les RDV à la main, le dossier est suivi en base.

### ⚠️ « Légion » n'est PAS le patron d'add-on de ce module
`légion` n'est qu'une **valeur de `profiles.tier`** : aucune table, aucun
entitlement, aucune ligne de migration. C'est une chaîne dans `TIER_ORDER`
(`lib/subscription.ts`), `TIER_COLORS` et `tiersFr`/`tiersEn`, rien d'autre. Un
palier est **exclusif** (une colonne, une valeur) ; un kit doit coexister avec
n'importe quel palier, `apprenti` compris, et se répéter dans le temps. Le
découplage réellement copié ici est celui de `prac_admins` (20260626000001) :
table isolée, RLS stricte, écritures par fonction `SECURITY DEFINER`.

### Table `kit_orders`

| Colonne | Type | Nullable | Notes |
|---|---|---|---|
| `id` | `uuid` | NOT NULL | PK, default `gen_random_uuid()` |
| `user_id` | `uuid` | NOT NULL | FK → `profiles(id)` ON DELETE CASCADE — le client |
| `created_by` | `uuid` | NOT NULL | FK → `auth.users` — l'admin qui a ouvert le dossier (pendant d'`added_by` sur `tracked_players`) |
| `status` | `text` | NOT NULL | default `'demande'` — CHECK à 8 valeurs, voir la machine d'états |
| `player_snapshot` | `jsonb` | NOT NULL | default `'{}'` — **gel** de l'état du joueur à la prise du pack |
| `price_total_cents` | `integer` | nullable | prix total en CENTIMES, CHECK `> 0`. Jamais de flottant sur de l'argent |
| `admin_note` | `text` | nullable | ⚠️ **lisible par le client** (voir RLS) |
| `created_at` / `updated_at` | `timestamptz` | NOT NULL | `updated_at` par `trg_kit_orders_updated_at` → `fn_set_updated_at()` |

Index : `idx_kit_orders_user` (FK), `idx_kit_orders_created` (tri du tableau admin),
et **`uq_kit_orders_active`** — index UNIQUE **partiel** sur `(user_id)`
`WHERE status NOT IN ('termine','annule')`. Un client peut avoir plusieurs
dossiers dans le temps, mais **un seul actif** : deux dossiers en cours
signifieraient deux acomptes encaissés pour un seul accompagnement. Idiome de
`uq_ledger_ref` (20260606000002).

### Contrat JSONB `player_snapshot`
`{ riot_puuid, riot_gamename, riot_tagline, riot_platform, riot_rank, role, captured_at }` —
toutes les clés optionnelles. **Une COPIE, jamais une jointure vers `profiles`** :
`profiles.riot_rank` est choisi par l'utilisateur et change quand il veut, une
jointure renverrait le rang d'aujourd'hui et viderait de son sens la mesure de
progression que ce service vend. `{}` = pas encore capturé (rempli au lot 2).

### Machine d'états — 8 états, 17 transitions

```
demande ⇄ acompte_paye ⇄ decouverte_faite ⇄ kit_trouve ⇄ solde_paye ⇄ session_faite → termine
   └───────────┴──────────────┴─────────────┴────────────┴──────────────┘ → annule
```

6 avancées + 5 retours d'un cran + 6 annulations. Tout le reste →
`invalid_transition`. Deux règles à ne pas défaire :
- **`termine` est terminal DANS LES DEUX SENS** — pas de dé-clôture. C'est ce qui
  rend stable la liste des preneurs du pack ; un remboursement est une écriture
  comptable (lot 4), pas un retour d'état.
- **`annule` est terminal** — un client qui revient ouvre un nouveau dossier, que
  `uq_kit_orders_active` autorise puisque l'ancien est clos.

Valeurs FR **sans accent** à dessein : `profiles.tier = 'maître'` oblige déjà
`lib/subscription.ts` à normaliser avant toute comparaison, on ne réintroduit pas
ce problème sur une valeur que SQL, TypeScript et les URL manipulent.

### Table `kit_order_events` — journal d'audit
Une ligne par transition (`from_status` NULL = ouverture), écrite par
`kit_set_status` **dans la même transaction** que l'UPDATE : le statut et sa trace
ne peuvent pas diverger. Colonnes : `id` (bigint identity), `kit_order_id`
(FK CASCADE), `from_status`, `to_status`, `actor` (nullable — une écriture
`service_role` future n'a pas d'utilisateur), `note`, `created_at`.

### RLS
- `kit_orders` SELECT : `public.is_admin() OR (select auth.uid()) = user_id`
- `kit_order_events` SELECT : **`is_admin()` seul** — le client ne voit pas sa
  timeline (retours arrière et notes internes)
- **Aucune policy INSERT / UPDATE / DELETE** sur les deux tables
- `REVOKE ALL FROM anon, authenticated` **avant** `GRANT SELECT TO authenticated` —
  sans le REVOKE, les DEFAULT PRIVILEGES de Supabase laisseraient le refus reposer
  sur l'absence de policy plutôt que sur un privilège. C'est l'oubli que
  `20260901000003` a dû réparer a posteriori sur `scenarios`, écrit dès le départ ici

> ⚠️ `admin_note` vit sur `kit_orders`, dont le CLIENT lit sa propre ligne : une
> note interne y est lisible par PostgREST même si l'UI ne l'affiche jamais. Ce
> qui doit rester interne va dans `kit_order_events.note`.

### Fonctions SECURITY DEFINER — le seul chemin d'écriture
Toutes `SET search_path = public`, `REVOKE EXECUTE FROM PUBLIC` + `GRANT authenticated`,
et toutes gardées par `public.is_admin()` en interne (`is_admin()` est **sans
argument** et lit `auth.uid()`, cf. 20260530000007).

| Fonction | Rôle |
|---|---|
| `kit_open_order(p_user_id, p_snapshot, p_status, p_price_total_cents, p_admin_note)` | Ouvre un dossier. `p_status` ∈ `{'demande','acompte_paye'}` seulement — jamais au milieu de la chaîne. Mappe `unique_violation` → `kit_order_already_active` |
| `kit_set_status(p_order_id, p_next_status, p_note)` | La machine d'états. `SELECT … FOR UPDATE` sérialise le double-clic. Retourne le nouveau statut |
| `kit_set_details(p_order_id, p_price_total_cents, p_admin_note)` | Édition partielle (`NULL` = ne change pas ce champ). Ne touche **jamais** `status` |

Erreurs métier levées : `not_admin`, `invalid_status`, `invalid_transition`,
`kit_order_not_found`, `kit_order_already_active` — traduites côté site par
`kitErrorLabel` (`locales/dashboard/admin.ts`), qui les cherche **par inclusion**
dans `error.message` (une exception plpgsql n'arrive pas nue), comme le fait déjà
`shop-purchase`.

### 🔴 Pourquoi cette barrière est en base et pas dans le navigateur
C'est la correction explicite de la dette documentée au § `scenarios` : le verrou
« palier payant » des Scénarios est **purement côté client** (`isPro` calculé dans
`Dashboard.tsx`), et un Apprenti qui appelle PostgREST passe au travers. Ici
l'argent change de main — la même erreur serait payante. Un
`supabase.from('kit_orders').update({ status })` depuis le navigateur est refusé
par la base quoi que rende le panneau. **Ne jamais « simplifier » les appels RPC
d'`AdminTab` en écritures directes.**

### Consommateurs
- **Site React** : sous-onglet « Kits » d'`AdminTab` (`?subtab=kits`) — liste,
  ouverture, avancement, retour d'un cran, annulation, prix, timeline. Le rendu
  d'un dossier vit dans **`components/dashboard/KitOrderCard.tsx`**, composant
  **sans hook** sorti d'`AdminTab` pour être testable via `renderToStaticMarkup`
  — même patron et même raison que `SettingToggle` / `CutBanner` / les deux
  modales. Miroir client de la machine d'états dans **`src/lib/kit-orders.ts`**
  (module PUR ; `kit-orders.test.ts` verrouille les 17 transitions sur les 64
  couples, `KitOrderCard.test.tsx` vérifie que l'écran ne propose jamais un geste
  hors de ces 17). ⚠️ Les deux sont des **miroirs d'affichage**, pas des barrières.
- **App WPF** : hors périmètre (flag `surface = 'web'`).

### ⚠️ `kit_sur_mesure_enabled` ne ferme PAS le panneau admin
Le flag ne gouverne que la surface **utilisateur final** (page de commande et
entrée de navigation, à venir au lot 2). Le sous-onglet « Kits » l'ignore
délibérément, pour deux raisons :
1. c'est là que se préparent les dossiers AVANT le lancement — un flag qui
   fermerait aussi l'admin rendrait la recette impossible, alors que c'est
   précisément l'usage d'un flag de lancement ;
2. c'est la convention déjà en place : `EcaillesTab` rend la Forge à un admin
   même quand `ecailles_enabled` est à `false` (« recette avant lancement »,
   verrouillé par `feature-flags.test.ts`).

À tenir au lot 2 : c'est la surface CLIENTE qui lira
`useFlag('kit_sur_mesure_enabled')`. Et le verrou de ce qui coûte reste la garde
`is_admin()` des trois RPC — un flag est de la présentation, jamais une barrière.
- Tests SQL : **deux scripts**, chacun à coller en entier dans le SQL Editor,
  qui résolvent eux-mêmes leurs identités (l'admin est pris dans `admin_users`,
  jamais dans `prac_admins` : `is_admin()` ne lit que la première) et rendent une
  table `✅`/`❌`. `ROLLBACK` final, rien ne persiste. Aucune méta-commande psql :
  `\gset` n'existe pas dans le SQL Editor web.
  - `20260908000001_kit_orders_test.sql` — machine d'états, RLS, privilèges (22 lignes).
  - `20260909000001_kit_request_order_test.sql` — dépôt client, flag serveur,
    bornes du snapshot, correction admin, non-régression des gardes du lot 1
    (29 lignes).

> ⚠️ Le second script **bascule `kit_sur_mesure_enabled`** dans sa transaction :
> le service n'étant pas lancé, le flag vaut `'false'` et tous les dépôts
> échoueraient sur `kit_service_disabled` sans prouver le chemin nominal. Le
> `ROLLBACK` restaure la valeur d'origine — raison de plus pour ne le jouer que
> sur le projet de TEST.

### 🟢 Lot 2 — surface cliente (migration 20260909000001)

**`kit_request_order(p_snapshot jsonb) RETURNS uuid`** — la PREMIÈRE fonction du
module accordée à un non-admin. Ouvre un dossier en `demande` pour `auth.uid()`.
Gardes, dans l'ordre : `auth.uid()` non nul → **flag `kit_sur_mesure_enabled`
relu EN BASE** → forme et taille du snapshot (`kit_assert_snapshot`, objet JSON,
≤ 4096 octets) → `uq_kit_orders_active` (un seul dossier actif).

> ⚠️ La relecture du flag dans la fonction est le cœur du dispositif. `useFlag()`
> ne masque qu'un onglet ; une RPC accordée à `authenticated` est appelable au
> `curl`. Sans elle, le flag ne serait qu'un rideau et le service serait ouvert
> avant son lancement. Ligne absente ⇒ refus (fail-closed, aligné sur
> `flagFallback` pour un flag de lancement).

Ce que le lot 2 ne change PAS : aucune policy INSERT/UPDATE/DELETE n'est ajoutée,
`kit_set_status` reste admin-only (le client ne fait pas avancer son dossier et
ne peut donc pas se l'annuler — l'admin le fait pour lui), `kit_order_events`
reste illisible pour lui.

**`created_by` porte désormais deux sémantiques** : l'admin via `kit_open_order`,
ou le client via `kit_request_order`. Pas de migration de colonne — la distinction
se lit exactement en comparant `created_by` à `user_id` (égaux ⇒ dépôt client).

**`kit_set_details` a gagné `p_player_snapshot jsonb`** (4ᵉ paramètre, admin
seul), pour corriger un Riot ID mal tapé qui serait sinon définitif. L'ancienne
signature à 3 arguments est **DROPPÉE** dans la migration : un `DEFAULT` ajouté
crée une surcharge, et un appel à 3 arguments deviendrait ambigu (42725).

> Le gel reste **structurel** : `player_snapshot` est écrit une fois, il n'existe
> aucun chemin client de réécriture, et rien ne relit `profiles.riot_rank` après
> coup. Le gel protège contre la RELECTURE LIVE, pas contre une correction tracée.

### 🔴 `REVOKE … FROM PUBLIC` NE SUFFIT PAS — migration 20260909000002
Les tests du lot 2 (T7/T13b/T13c) ont montré que les **cinq** fonctions du module
étaient exécutables par `anon`, alors que les deux migrations portaient bien leur
`REVOKE EXECUTE … FROM PUBLIC`. La révocation ne révoquait rien : les
`ALTER DEFAULT PRIVILEGES` du projet Supabase accordent EXECUTE **nominativement**
à `anon` et `authenticated`, et `FROM PUBLIC` ne touche pas un grant nominatif.

C'est exactement le bug que `20260731000002_revoke_definer_anon.sql` avait déjà
diagnostiqué, documenté, et clos par une « Note pour les migrations futures » —
que les migrations du kit n'ont pas suivie.

**Règle, pour toute nouvelle fonction du schéma `public` :**
```sql
REVOKE ALL ON FUNCTION … FROM PUBLIC;
REVOKE ALL ON FUNCTION … FROM anon[, authenticated];   -- selon la cible
GRANT  EXECUTE ON FUNCTION … TO <rôle voulu>;
```
Sonde de contrôle avec la clé anon : `PGRST202` = absente · `42501` = barrière OK ·
**tout autre code = la fonction s'est exécutée**. Un `REVOKE FROM PUBLIC` seul
passe la relecture de code mais pas la sonde.

> ⚠️ Le trou n'est pas propre au kit. Un balayage du 2026-09-09 trouve ~20
> migrations avec `REVOKE … ON FUNCTION … FROM PUBLIC` sans `FROM anon` (prac,
> tournois, quêtes, `purchase_cosmetic`…), dont une partie seulement est
> rattrapée par 20260731000002 / 20260614000003 / 20260901000002. Toutes gardent
> une garde applicative interne — érosion de la défense en profondeur, pas porte
> ouverte. **Audit dédié à planifier.**

> 💡 La migration 20260909000002 se **vérifie elle-même** : un bloc `DO` final
> interroge `has_function_privilege` et fait ÉCHOUER le `db push` si l'état visé
> n'est pas atteint — dans les deux sens (anon encore ouvert, ou `authenticated`
> révoqué de travers). Une révocation qui ne révoque rien étant précisément le
> bug réparé ici, la relire dans le fichier ne prouvait rien.

**Côté site** : onglet dashboard `kit` (`DashTab`, `NAV_TAB_IDS`, `tabGroups`),
masqué par `useFlag('kit_sur_mesure_enabled')` avec bypass admin — même
convention `'hidden'` qu'Écailles et Scénarios, gardée AUSSI sur le deep-link
`?tab=kit`. Composant `tabs/KitTab.tsx`, dico `locales/dashboard/kit.ts`, contrat
et validation dans le module PUR `lib/kit-snapshot.ts` (`kit-snapshot.test.ts`).

> ⚠️ `KitTab` filtre `.eq('user_id', user.id)` en plus de la RLS. Ce n'est PAS
> une redondance : `ko_select` dit `is_admin() OR auth.uid() = user_id`, donc
> pour un ADMIN elle laisse passer TOUS les dossiers. Sans ce filtre, un admin
> qui ouvre l'onglet pour recetter verrait le dossier d'un autre présenté comme
> le sien.

**Formule duo (110 €) : aucun modèle en base.** `kit_orders` porte un seul
`user_id` et `uq_kit_orders_active` est par utilisateur. Le binôme vit dans
`player_snapshot.partner` (`{riot_gamename, riot_tagline, role}`), déclaratif et
sans compte : il n'a ni dossier ni visibilité, et rien ne l'empêche d'en ouvrir
un de son côté. Choix assumé — le modéliser demanderait `partner_user_id` et une
révision de l'index d'unicité.

**Réservation** : simple lien externe, préremplí par `buildBookingUrl` depuis
`NEXT_PUBLIC_KIT_BOOKING_URL` (`name`, `email`). Variable absente ⇒ aucun bouton
n'est rendu, l'écran bascule sur le contact manuel.

### Reste à faire (lots suivants)
- **Lot 3** — e-mail « kit trouvé », déclenché par le bouton admin (pas un Database
  Webhook — on évite le plombage Vault/`pg_net` du Lot 5E).

  ✅ **Transport e-mail rétabli le 2026-09-11** : Resend (décision HORTAL), helper
  `_shared/resend.ts` recréé (générique, `from` obligatoire, `Idempotency-Key`),
  secret `RESEND_API_KEY`, prestataire réinscrit au § 5 de `confidentialite/page.tsx`.
  Ce lot pourra le réutiliser tel quel ; le patron claim-then-send et la file
  `subscription_emails` des e-mails d'abonnement (§ CGV › E-mails transactionnels)
  sont la référence — la table est dédiée à l'abonnement (CHECK sur `kind`) : le Kit
  aura sa propre clé d'idempotence, voire sa propre table. Les e-mails de compte
  (inscription, mot de passe) restent sur le SMTP par défaut de Supabase.
- **Lot 4** — Stripe, paiement ponctuel `mode: 'payment'` en deux sessions
  (acompte 40 % / solde 60 %). Bloqué hors code par Kbis + Stripe en live
  (`docs/economie-ecailles-wyrm-forge_1.md`), et par la réécriture des CGU
  (`cgu/page.tsx` ne parle aujourd'hui que d'abonnement reconduit).

---

## 🟡 Base de données — système Écailles (M0 + M2 + M3)

### Feature flags — `app_settings` (M0 — migration 20260606000001)

Cinq clés insérées dans la table `app_settings` existante (voir tableau ci-dessus).
Tous les flags sont à `'false'` / valeur minimale au démarrage.

---

### Table `scales_ledger` (M2 — migration 20260606000002)

Grand livre immuable des mouvements d'Écailles. Chaque ligne = un crédit (delta > 0) ou un débit (delta < 0). Solde = `SUM(delta)` par utilisateur.

| Colonne | Type | Nullable | Notes |
|---|---|---|---|
| `id` | `bigint` | NOT NULL | PK GENERATED ALWAYS AS IDENTITY |
| `user_id` | `uuid` | NOT NULL | FK → `auth.users` ON DELETE CASCADE |
| `delta` | `bigint` | NOT NULL | positif = crédit, négatif = débit |
| `source` | `text` | NOT NULL | `'quest'`\|`'shop'`\|`'tournament'`\|`'admin'`\|`'purchase'` |
| `ref_id` | `text` | nullable | clé de dédup opaque — unique partiel si NOT NULL |
| `created_at` | `timestamptz` | NOT NULL | default `now()` |

Index : `uq_ledger_ref` UNIQUE partiel sur `(ref_id) WHERE ref_id IS NOT NULL` (dédup INSERT ... ON CONFLICT). `idx_ledger_user_time` sur `(user_id, created_at DESC)` (solde + pagination).

### RLS scales_ledger
- SELECT `authenticated` : `user_id = auth.uid()` — lecture de ses propres lignes uniquement
- INSERT/UPDATE/DELETE : aucune policy client — Edge Functions via service_role uniquement

### Fonction `get_balance()`
- SECURITY DEFINER, STABLE, `LANGUAGE sql`, pas de paramètre
- Utilise `auth.uid()` en interne — impossible de lire le solde d'un autre user
- Retourne `0` si aucune ligne (COALESCE)
- `GRANT EXECUTE TO authenticated`

### Correction d'erreur
Ne jamais faire `INSERT` direct dans `scales_ledger` côté client. Passer toujours par une Edge Function (service_role). Pour corriger une erreur de crédit, insérer une ligne compensatrice (delta opposé) — les lignes sont immuables par design.

### Règle d'idempotence — index partiel `uq_ledger_ref`
L'index `uq_ledger_ref` est **PARTIEL** : `UNIQUE (ref_id) WHERE ref_id IS NOT NULL`. Conséquence : tout `INSERT` dans `scales_ledger` utilisant `ON CONFLICT` doit **OBLIGATOIREMENT** répéter le prédicat :
```sql
ON CONFLICT (ref_id) WHERE ref_id IS NOT NULL DO NOTHING
```
Sans le prédicat → erreur `42P10` à l'exécution. Ce bug a touché `purchase_cosmetic` ET `finalize_quest_claim` (corrigés). Toute nouvelle fonction qui crédite/débite le ledger doit suivre cette forme.

---

### Table `cosmetics` — catalogue (M3 — migration 20260606000003)

Catalogue administré des cosmétiques disponibles à la boutique.

| Colonne | Type | Nullable | Notes |
|---|---|---|---|
| `id` | `bigint` | NOT NULL | PK GENERATED ALWAYS AS IDENTITY |
| `slug` | `text` | NOT NULL | UNIQUE — identifiant stable |
| `type` | `text` | NOT NULL | `'badge'`\|`'avatar'`\|`'avatar_frame'`\|`'avatar_anim'` |
| `name` | `text` | NOT NULL | Nom affiché |
| `description` | `text` | nullable | |
| `rarity` | `text` | NOT NULL | `'common'`\|`'rare'`\|`'legendary'` |
| `price_scales` | `int` | NOT NULL | > 0 — prix en Écailles |
| `image_url` | `text` | nullable | |
| `available_from` | `timestamptz` | nullable | NULL = toujours disponible |
| `available_until` | `timestamptz` | nullable | NULL = toujours disponible |
| `is_active` | `boolean` | NOT NULL | default `true` |
| `created_at` | `timestamptz` | NOT NULL | default `now()` |

### RLS cosmetics
- SELECT `anon` + `authenticated` : `true` — catalogue public
- INSERT/UPDATE/DELETE : aucune policy client (service_role only)

---

### Table `user_cosmetics` — inventaire (M3 — migration 20260606000003)

Association (user, cosmétique) après achat. Un seul cosmétique équipé par type par utilisateur.

| Colonne | Type | Nullable | Notes |
|---|---|---|---|
| `id` | `bigint` | NOT NULL | PK GENERATED ALWAYS AS IDENTITY |
| `user_id` | `uuid` | NOT NULL | FK → `auth.users` ON DELETE CASCADE |
| `cosmetic_id` | `bigint` | NOT NULL | FK → `cosmetics(id)` ON DELETE RESTRICT |
| `cosmetic_type` | `text` | NOT NULL | dénormalisé depuis `cosmetics.type` à l'INSERT |
| `is_equipped` | `boolean` | NOT NULL | default `false` |
| `purchased_at` | `timestamptz` | NOT NULL | default `now()` |

Contrainte `uq_user_cosmetics UNIQUE (user_id, cosmetic_id)`.
Index unique partiel `uq_equipped_type` sur `(user_id, cosmetic_type) WHERE is_equipped = true` — garantit un seul équipé par type par user au niveau DB.

### RLS user_cosmetics
- SELECT `authenticated` : `user_id = auth.uid()` — inventaire personnel uniquement
- INSERT/UPDATE/DELETE : aucune policy client — achats par Edge Functions (service_role), équipement par fonctions SECURITY DEFINER

### Fonctions cosmétiques (M3)

| Fonction | GRANT | Description |
|---|---|---|
| `equip_cosmetic(p_cosmetic_id BIGINT)` | `authenticated` | Déséquipe d'abord l'éventuel cosmétique du même type, puis équipe. RAISE EXCEPTION `'cosmetic_not_owned'` si non possédé. |
| `unequip_cosmetic(p_cosmetic_id BIGINT)` | `authenticated` | Déséquipe. RAISE EXCEPTION `'cosmetic_not_owned'` si non possédé. |
| `get_equipped_cosmetics(p_puuid TEXT)` | `anon, authenticated` | Retourne `(type, slug, name, image_url)` des cosmétiques équipés d'un joueur identifié par PUUID. Ne retourne jamais `user_id` ni UUID Wyrm Forge. |

### Fonction `purchase_cosmetic` (M5 — migration 20260606000005)

Orchestre l'achat atomique d'un cosmétique avec des Écailles.

```
purchase_cosmetic(p_user_id UUID, p_cosmetic_id BIGINT) RETURNS VOID
```

LANGUAGE plpgsql, SECURITY DEFINER, SET search_path = public.
**Non exposée en RPC direct** — `REVOKE EXECUTE FROM PUBLIC`. Appelée exclusivement par l'Edge Function `shop-purchase` via service_role.

**Logique (dans l'ordre, transaction implicite de la fonction) :**
1. Advisory lock `pg_advisory_xact_lock(hashtext(p_user_id))` — sérialise les achats concurrents du même utilisateur.
2. Lecture `cosmetics FOR SHARE` — vérifie `is_active`, `available_from/until`. RAISE `'cosmetic_unavailable'` si NOT FOUND.
3. Vérification possession `user_cosmetics`. RAISE `'already_owned'` si possédé.
4. Calcul solde `SUM(delta)` dans `scales_ledger`. RAISE `'insufficient_balance'` si solde < prix.
5. Débit `scales_ledger` — `ref_id = 'shop:{user_id}:{cosmetic_id}'`, `ON CONFLICT (ref_id) DO NOTHING` (idempotent via `uq_ledger_ref`).
6. INSERT `user_cosmetics` — `cosmetic_type` dénormalisé, `ON CONFLICT (user_id, cosmetic_id) DO NOTHING` (idempotent via `uq_user_cosmetics`).

**Erreurs levées :**
- `'cosmetic_unavailable'` — cosmétique inexistant, inactif ou hors période
- `'already_owned'` — utilisateur possède déjà ce cosmétique
- `'insufficient_balance'` — solde insuffisant

**Aucun GRANT** — fonction réservée service_role.

---

### Système de quêtes journalières (M5 — migration 20260606000006)

#### Table `quest_definitions` — catalogue

| Colonne | Type | Nullable | Notes |
|---|---|---|---|
| `slug` | `text` | NOT NULL | PK — identifiant stable de la quête |
| `name` | `text` | NOT NULL | Libellé affiché |
| `category` | `text` | NOT NULL | `'lol'` \| `'app'` |
| `reward` | `int` | NOT NULL | Récompense de base en Écailles (> 0) |
| `is_active` | `boolean` | NOT NULL | default `true` |
| `criteria` | `jsonb` | nullable | Conditions de validation — schéma ci-dessous (migration 20260606000008) |
| `pool_eligible` | `boolean` | NOT NULL | default `true` — quête incluse dans le tirage du pool journalier (migration 20260607000001) |
| `cost_tier` | `text` | NOT NULL | `'free'` \| `'riot_detail'` — coût API : `free` = liste de matchs uniquement ; `riot_detail` = appels match detail Riot nécessaires. CHECK constraint. default `'free'` (migration 20260607000001) |

RLS : SELECT `anon` + `authenticated` (catalogue public) — INSERT/UPDATE/DELETE service_role only.

Pool actif (migration 20260607000001) — 8 quêtes `lol` + 2 quêtes `app` :

| slug | name | category | reward | cost_tier | criteria (résumé) |
|---|---|---|---|---|---|
| `lol_play_game` | Joue une partie classée | lol | 4 | free | play count=1 queue=420 |
| `lol_win_game` | Gagne une partie classée | lol | 7 | riot_detail | win count=1 queue=420 |
| `lol_play_flex` | Joue une partie Flex | lol | 4 | free | play count=1 queue=440 |
| `lol_play_2_solo` | Joue 2 parties classées Solo/Duo | lol | 5 | free | play count=2 queue=420 |
| `lol_play_2_flex` | Joue 2 parties Flex | lol | 5 | free | play count=2 queue=440 |
| `lol_play_3_ranked` | Joue 3 parties classées | lol | 6 | free | play count=3 queue="ranked" |
| `lol_win_ranked` | Gagne une partie classée (Solo ou Flex) | lol | 7 | riot_detail | win count=1 queue="ranked" |
| `lol_play_2_ranked` | Joue 2 parties classées (Solo ou Flex) | lol | 5 | free | play count=2 queue="ranked" |
| `app_view_match` | Consulte le détail d'une partie | app | 3 | free | app_event match_viewed count=1 |
| `app_view_3_matches` | Consulte le détail de 3 parties | app | 5 | free | app_event match_viewed count=3 |

Calibrage rewards (cap=12) : `play(4) + play_2(5) + app(3) = 12` pile. `play(4) + win(7) + app(3) = 14` tronqué à 12 par `finalize_quest_claim`.

##### Schéma JSONB `criteria` — formes valides

| `type` | Champs supplémentaires | Description |
|---|---|---|
| `"play"` | `count` (int), `queue` (optionnel) | Jouer N parties classées dans la fenêtre UTC du jour |
| `"win"` | `count` (int), `queue` (optionnel) | Gagner N parties classées dans la fenêtre UTC du jour |
| `"cs"` | `threshold` (int), `queue` (optionnel) | Atteindre ≥ threshold CS dans une partie classée du jour — non activé en prod |
| `"app_event"` | `event` (string), `count` (int) | N occurrences de cet `event_type` dans `app_events` pour le jour UTC |

Champ `queue` optionnel (applicable aux types `play`, `win`, `cs`) :
- `420` (int) : Solo/Duo uniquement
- `440` (int) : Flex uniquement
- `"ranked"` (string) : union Solo/Duo + Flex — interprété par quest-claim
- absent : défaut implicite `420` (comportement historique hardcodé de quest-claim)

Extensible : ajouter une nouvelle quête = simple `INSERT` avec le `criteria` correspondant, zéro redéploiement.

#### Table `quest_completions` — dédup journalier

| Colonne | Type | Nullable | Notes |
|---|---|---|---|
| `id` | `bigint` | NOT NULL | PK GENERATED ALWAYS AS IDENTITY |
| `user_id` | `uuid` | NOT NULL | FK → `auth.users` ON DELETE CASCADE |
| `quest_slug` | `text` | NOT NULL | FK → `quest_definitions(slug)` |
| `day` | `date` | NOT NULL | Date UTC serveur — jamais la date client |
| `created_at` | `timestamptz` | NOT NULL | default `now()` |

Contrainte `uq_completion UNIQUE (user_id, quest_slug, day)`.
Index `idx_qc_user_day` sur `(user_id, day DESC)` — lecture des complétions du jour.

RLS : SELECT `authenticated` = `user_id = auth.uid()` — INSERT/UPDATE/DELETE service_role only.

#### Table `quest_streaks` — streak par compte

| Colonne | Type | Nullable | Notes |
|---|---|---|---|
| `user_id` | `uuid` | NOT NULL | PK, FK → `auth.users` ON DELETE CASCADE |
| `current_streak` | `int` | NOT NULL | Nombre de jours consécutifs, default `0` |
| `last_day` | `date` | nullable | Dernier jour où une quête a été complétée |

RLS : SELECT `authenticated` = `user_id = auth.uid()` — INSERT/UPDATE/DELETE service_role only.

#### Table `app_events` — empreintes serveur (quêtes `app`)

| Colonne | Type | Nullable | Notes |
|---|---|---|---|
| `id` | `bigint` | NOT NULL | PK GENERATED ALWAYS AS IDENTITY |
| `user_id` | `uuid` | NOT NULL | FK → `auth.users` ON DELETE CASCADE |
| `event_type` | `text` | NOT NULL | Type d'événement — valeurs définies : `'match_viewed'` (loggé par `riot-match-detail`) |
| `ref_id` | `text` | nullable | Référence externe (ex : matchId) |
| `created_at` | `timestamptz` | NOT NULL | default `now()` |

Index `idx_app_events_lookup` sur `(user_id, event_type, created_at DESC)`.

RLS : aucune policy client — SELECT/INSERT/UPDATE/DELETE via service_role uniquement. Le client ne lit jamais cette table directement.

#### Clés `app_settings` ajoutées (M5)

| Clé | Valeur courante | Description |
|---|---|---|
| `cap_daily_scales` | `'12'` | Plafond d'Écailles gagnables par quêtes en un jour (recalibré en 20260607000001, était '25') |
| `streak_bonus_pct` | `'0'` | Bonus streak en % par jour de streak (0 = désactivé) |

> Ces deux clés sont `kind = 'setting'`, `is_public = false` depuis 20260905000001 :
> elles ne sont **pas** lisibles par `anon` et n'apparaissent pas dans le catalogue de
> flags du panneau admin. Voir § *Table `app_settings`* pour le modèle complet.

#### Fonction `finalize_quest_claim` (M5)

```
finalize_quest_claim(p_user_id UUID, p_quest_slug TEXT, p_day DATE, p_reward INT) RETURNS VOID
```

LANGUAGE plpgsql, SECURITY DEFINER, SET search_path = public.
**Non exposée en RPC direct** — `REVOKE EXECUTE FROM PUBLIC`. Appelée exclusivement par l'Edge Function `quest-claim` via service_role.

**Logique (dans l'ordre, transaction implicite) :**
1. Advisory lock `pg_advisory_xact_lock(hashtext(p_user_id))` — sérialise les claims concurrents du même utilisateur.
2. Dédup authoritative : SELECT dans `quest_completions`. RAISE `'already_claimed'` si trouvé.
3. Plafond journalier : `SUM(qd.reward)` des complétions du jour. RAISE `'daily_cap_reached'` si `v_today_sum + p_reward > cap_daily_scales`.
4. Lecture streak + calcul bonus : `v_total = p_reward + (p_reward * streak * bonus_pct / 100)`.
5. Débit `scales_ledger` — `ref_id = 'quest:{user_id}:{quest_slug}:{day}'`, `ON CONFLICT (ref_id) DO NOTHING` (idempotent).
6. INSERT `quest_completions` — `ON CONFLICT (user_id, quest_slug, day) DO NOTHING` (idempotent).
7. Mise à jour streak :
   - `last_day IS NULL` → streak = 1 (premier claim historique)
   - `last_day = p_day - 1` → streak + 1 (jour consécutif)
   - `last_day = p_day` → no-op (déjà compté ce jour)
   - `last_day < p_day - 1` → reset streak = 1 (jour(s) manqué(s))

**Erreurs levées :**
- `'already_claimed'` — quête déjà complétée ce jour
- `'daily_cap_reached'` — plafond journalier atteint

**Aucun GRANT** — fonction réservée service_role.

**Comportement `daily_cap_reached` côté EF (déviation intentionnelle)** : `finalize_quest_claim` est une transaction atomique — si elle raise `daily_cap_reached`, rien n'est inscrit (ni ledger, ni completion, ni streak). L'EF `quest-claim` mappe cette erreur en HTTP 200 `{ success: false, capped: true, reward: 0 }` pour ne pas afficher d'erreur rouge côté client. Conséquence : **le streak n'est PAS incrémenté quand le plafond est atteint**. Pour implémenter "créditer 0 mais compter le streak", il faudrait découper `finalize_quest_claim` en étapes séparables (hors scope actuel).

**Comportement du plafond ACTÉ** (déviation définitive, voir `docs/economie-ecailles §12`) : le cap fonctionne en rejet, pas en troncature. Acceptable car aucune quête seule ne vaut ≥ cap (le premier claim du jour réussit toujours → streak jamais perdu) et le front désactive les boutons au plafond. **Règle de calibrage à respecter pour toute nouvelle quête** : `max(reward) < cap_daily_scales`.

---

### Consommateurs Écailles
- **Site React** : `get_balance()` (solde affiché), `equip_cosmetic()` / `unequip_cosmetic()` (profil), `get_equipped_cosmetics()` (page `/summoner/...`), `quest_definitions` (catalogue quêtes), `quest_completions` + `quest_streaks` (état journalier)
- **App WPF** : `get_equipped_cosmetics()` (affichage profil joueur) — lecture catalogue `cosmetics` et `quest_definitions` possible via anon
- **Edge Function `shop-purchase`** : appelle `purchase_cosmetic()` via service_role — seul point d'entrée pour les achats Écailles
- **Edge Function `quest-claim`** : appelle `finalize_quest_claim()` via service_role — seul point d'entrée pour valider une quête
- **Lignes brutes `scales_ledger`** : inaccessibles aux deux clients — service_role uniquement
- **Lignes brutes `app_events`** : inaccessibles aux deux clients — service_role uniquement

---

## 🔴 Base de données — module Tournois — SUPPRIMÉ le 2026-09-11

> **Journal de chantier — ne décrit plus rien d'existant.** Le module a été retiré en
> deux temps : le front le 2026-09-03, puis la base et les Edge Functions le
> 2026-09-11 (décision HORTAL : retrait complet, pas de dépréciation).
>
> Retiré le 2026-09-11 par `20260911000001_drop_tournaments.sql` (appliquée) : les 6
> tables, les 2 vues, les 7 fonctions, le trigger, l'entrée Realtime, et — hors SQL,
> l'API Storage refusant les `DELETE` directs — le bucket `tournament-heroes` et ses 4
> policies. Les EF `tournament-register` et `tournament-admin` ont été supprimées du
> projet Supabase : retirer leurs dossiers du dépôt ne les désinstallait pas.
>
> Seule survivance volontaire : la valeur `'tournament'` de `chk_ledger_source` (table
> Écailles), conservée parce que des lignes de ledger historiques la portent.
>
> Tout ce qui suit est conservé comme historique, et **ne doit jamais être lu comme
> l'architecture courante**.

*(Section fusionnée le 2026-09-11 : ce document en portait deux versions
paraphrasées. Celle-ci est la plus complète ; les faits que seule l'autre portait —
noms des contraintes d'unicité, activation Realtime, liste exhaustive des codes
d'erreur — y ont été repris avant suppression du doublon.)*

### Table `tournaments`

| Colonne | Type | Nullable | Notes |
|---|---|---|---|
| `id` | `uuid` | NOT NULL | PK, `gen_random_uuid()` |
| `slug` | `text` | NOT NULL | UNIQUE — identifiant URL |
| `name` | `text` | NOT NULL | Nom affiché |
| `format` | `text` | NOT NULL | default `'2V2'` |
| `map` | `text` | NOT NULL | default `'ARAM'` |
| `status` | `text` | NOT NULL | `'draft'`\|`'registration'`\|`'live'`\|`'finished'` — default `'draft'` |
| `starts_at` | `timestamptz` | nullable | Date de début prévue |
| `max_teams` | `int` | NOT NULL | default `8` — plafond d'équipes |
| `cashprize_label` | `text` | nullable | Libellé du cashprize affiché |
| `cashprize_bonus` | `text` | nullable | Bonus cashprize texte libre |
| `caster_name` | `text` | nullable | Nom du caster |
| `twitch_url` | `text` | nullable | URL stream Twitch |
| `hero_image_url` | `text` | nullable | URL image bannière |
| `rules` | `jsonb` | NOT NULL | default `'[]'` — liste de règles |
| `created_by` | `uuid` | NOT NULL | FK `auth.users` |
| `created_at` | `timestamptz` | NOT NULL | default `now()` |

### RLS tournaments
- SELECT `status != 'draft'` : `anon` + `authenticated`
- SELECT `status = 'draft'` : `authenticated` si `created_by = auth.uid()` OU `is_admin()`
- INSERT/UPDATE/DELETE : aucune policy client — Edge Functions via service_role

### Table `tournament_teams`

| Colonne | Type | Nullable | Notes |
|---|---|---|---|
| `id` | `uuid` | NOT NULL | PK |
| `tournament_id` | `uuid` | NOT NULL | FK `tournaments` ON DELETE CASCADE |
| `name` | `text` | NOT NULL | 3-24 chars — UNIQUE par tournoi `(tournament_id, name)` |
| `seed` | `int` | nullable | Attribué par `seed_bracket` |
| `status` | `text` | NOT NULL | `'pending'`\|`'validated'`\|`'rejected'` — default `'pending'` |
| `created_at` | `timestamptz` | NOT NULL | default `now()` |

Contrainte `uq_team_name_per_tournament UNIQUE (tournament_id, name)`.

### RLS tournament_teams
- SELECT : `anon` + `authenticated` — toutes les équipes visibles publiquement
- INSERT/UPDATE/DELETE : aucune policy client

### Table `tournament_players`

| Colonne | Type | Nullable | Notes |
|---|---|---|---|
| `id` | `uuid` | NOT NULL | PK |
| `team_id` | `uuid` | NOT NULL | FK `tournament_teams` ON DELETE CASCADE |
| `riot_pseudo` | `text` | NOT NULL | Format `gameName#TAG`, validé par l'EF |
| `discord_pseudo` | `text` | NOT NULL | Confidentiel — ne jamais exposer en SELECT direct |
| `user_id` | `uuid` | nullable | FK `auth.users` — lié si JWT présent à l'inscription |
| `created_at` | `timestamptz` | NOT NULL | default `now()` |

### RLS tournament_players
- SELECT `authenticated` : `user_id = auth.uid()` — lecture de ses propres lignes (profil)
- INSERT/UPDATE/DELETE : aucune policy client
- Lecture publique via la vue `tournament_players_public` (SECURITY DEFINER, sans `discord_pseudo`)

### Table `matches`

| Colonne | Type | Nullable | Notes |
|---|---|---|---|
| `id` | `uuid` | NOT NULL | PK |
| `tournament_id` | `uuid` | NOT NULL | FK `tournaments` ON DELETE CASCADE |
| `code` | `text` | NOT NULL | `'M1'`..'M14'` — UNIQUE par tournoi |
| `bracket` | `text` | NOT NULL | `'winner'`\|`'loser'`\|`'final'` |
| `round` | `int` | NOT NULL | Numéro de round dans le bracket |
| `position` | `int` | NOT NULL | Position dans le round |
| `team_a` | `uuid` | nullable | FK `tournament_teams` |
| `team_b` | `uuid` | nullable | FK `tournament_teams` |
| `winner_id` | `uuid` | nullable | FK `tournament_teams` — null tant que non joué |
| `next_match_id` | `uuid` | nullable | FK `matches` — destination du gagnant |
| `next_match_slot` | `text` | nullable | `'a'`\|`'b'` |
| `loser_next_match_id` | `uuid` | nullable | FK `matches` — destination du perdant (loser bracket) |
| `loser_next_match_slot` | `text` | nullable | `'a'`\|`'b'` |
| `status` | `text` | NOT NULL | `'pending'`\|`'ready'`\|`'in_progress'`\|`'finished'` — default `'pending'` (migration 20260612000001) |
| `started_at` | `timestamptz` | nullable | posé par `start_match()`, remis à NULL si le match repasse pending/ready |
| `created_at` | `timestamptz` | NOT NULL | default `now()` |

Contrainte `uq_match_code_per_tournament UNIQUE (tournament_id, code)`.
Realtime activé : `REPLICA IDENTITY FULL` + publication `supabase_realtime`.

### Statut de match — trigger `trg_match_auto_status` (migration 20260612000001)
Le statut est DÉRIVÉ des données par un trigger BEFORE INSERT OR UPDATE (`fn_match_auto_status`), sauf `'in_progress'` qui est posé par `start_match()` et préservé :
- `winner_id NOT NULL` → `'finished'`
- `team_a` OU `team_b` NULL → `'pending'` (+ `started_at = NULL`)
- deux équipes, pas de vainqueur, status ∈ (pending, finished) → `'ready'` (couvre l'undo)

Conséquence : `seed_bracket` / `report_match_result` / `undo_match_result` n'écrivent JAMAIS `status` — la propagation des équipes/résultats le met à jour automatiquement. Toute nouvelle écriture sur `matches` hérite de ce comportement.

### RLS matches
- SELECT : `anon` + `authenticated` — bracket public
- INSERT/UPDATE/DELETE : aucune policy client

### Vues publiques
- `tournament_standings` : classement par tournoi (wins/losses/points/riot_pseudos). GRANT `anon, authenticated`.
- `tournament_players_public` : joueurs sans `discord_pseudo`. GRANT `anon, authenticated`.

### Fonctions SECURITY DEFINER (tournois)

| Fonction | GRANT | Description |
|---|---|---|
| `seed_bracket(p_tournament_id UUID)` | aucun (REVOKE FROM PUBLIC) | Génère les 14 matchs DE 8 équipes + câblage FK. Advisory lock xact. Erreurs : `bracket_wrong_team_count`, `bracket_already_seeded`, `tournament_wrong_status`. Appelée par `tournament-admin` via userDb (JWT user). |
| `report_match_result(p_match_id UUID, p_winner_id UUID)` | aucun (REVOKE FROM PUBLIC) | Enregistre le résultat + propage gagnant/perdant. Clôt le tournoi si M14. Erreurs : `match_teams_not_set`, `winner_not_in_match`, `already_reported`. |
| `undo_match_result(p_match_id UUID)` | aucun (REVOKE FROM PUBLIC) | Annule le résultat si aucun match aval joué. Erreur : `downstream_played`. |
| `start_match(p_match_id UUID)` | aucun (REVOKE FROM PUBLIC) | Lance un match : exige `status='ready'`, pose `in_progress` + `started_at=now()`. Advisory lock xact. Refuse explicitement `auth.uid() IS NULL`. Erreurs : `match_not_found`, `match_forbidden`, `match_wrong_status`. (migration 20260612000001) |

**Point critique** : ces fonctions utilisent `auth.uid()` en interne pour vérifier les droits. Elles DOIVENT être appelées via un client Supabase initialisé avec le JWT utilisateur — jamais via service_role seul (qui a `auth.uid() = NULL`).

Toutes posaient un advisory lock transactionnel sur `tournament_id`. Liste complète des codes d'erreur levés :
- `seed_bracket` : `tournament_not_found`, `tournament_forbidden`, `tournament_wrong_status`, `bracket_wrong_team_count`, `bracket_already_seeded`
- `report_match_result` : `match_not_found`, `match_forbidden`, `match_teams_not_set`, `winner_not_in_match`, `already_reported`
- `undo_match_result` : `match_not_found`, `match_forbidden`, `downstream_played`
- `start_match` : `match_not_found`, `match_forbidden`, `match_wrong_status`

### Consommateurs Tournois
- **Site React** : `tournaments` (liste/détail), `tournament_teams` (équipes), `tournament_players_public` (joueurs sans discord), `matches` (bracket), `tournament_standings` (classement)
- **App WPF** : `tournament_standings` + `tournament_players_public` (affichage lecture seule)
- **Edge Function `tournament-register`** : INSERT `tournament_teams` + `tournament_players` via service_role — seul point d'entrée pour les inscriptions
- **Edge Function `tournament-admin`** : UPDATE `tournaments` + `tournament_teams` via service_role ; appelle `seed_bracket` / `start_match` / `report_match_result` / `undo_match_result` via userDb — seul point d'entrée pour l'administration
- `discord_pseudo` : jamais exposé aux clients — stocké en DB, visible uniquement via service_role (accès orga)

### État de déploiement Tournois (12/06/2026)
- Migrations 20260611000001-000004, 20260611000006 et 20260612000001 : **appliquées sur le remote**.
- ⚠️ Migration `20260611000005_tournaments_demo.sql` (seed démo) : **JAMAIS exécutée sur le remote** — marquée `applied` via `supabase migration repair` pour que `db push` la saute (le fichier porte un bandeau « NE PAS APPLIQUER EN PRODUCTION »). Les données du tournoi `demo-noel-2024` ont été injectées en remote **ad-hoc** via `supabase db query` pour la QA visuelle — réversible : `DELETE FROM public.tournaments WHERE slug = 'demo-noel-2024';` (CASCADE équipes/joueurs/matchs).
- EF `tournament-register` + `tournament-admin` : **déployées** (`verify_jwt = false` dans config.toml pour les deux — JWT vérifié dans le code de tournament-admin, getUser → 401).

### 🔴 Front Tournois — SUPPRIMÉ le 2026-09-03

**Le front tournois n'existe plus.** Retiré en entier sur décision HORTAL, la route ayant été
jugée inutile. Ce qui a disparu du dépôt :

| Supprimé | Volume |
|---|---|
| `src/app/tournois/**` — listing écosystèmes, vitrine série, tournoi, page match, `/manage`, `/manage/creer`, `/manage/serie/creer`, `[slug]/admin`, `[slug]/edit` | 11 fichiers, 1 486 l. |
| `src/components/tournois/**` — dont `TournamentLive` (Realtime), `BracketView` + `bracket-layout.ts`, `RegistrationForm`, `AdminPanel`, `EcosystemsGrid`, `Xv2Deco` | 19 fichiers, 4 343 l. |
| `src/lib/tournois.ts` + `src/lib/tournois/{bracket-template,themes}.ts` | 607 l. |
| `src/app/globals.css` — bloc `XV2 TOURNOIS` (thème, grilles, bracket) | ~348 l. |
| `src/components/tournois/bracket/bracket-layout.test.ts` | 11 `it`, **27 tests** à l'exécution (boucles `for (const size of BRACKET_SIZES)`) |
| `src/proxy.ts` — CAS sous-domaine tournois, redirect 308 depuis l'apex, `tournoisHostname()`, `lowercaseSerieSlug()` | ~50 l. |
| `docs/tournois.md` + `docs/references/tournois/` (4 maquettes PNG) | — |

Retiré aussi : l'`@import` Google Fonts **Kanit + Rajdhani** en tête de `globals.css`, dont
`.xv2-display` / `.xv2-data` étaient les seuls consommateurs. C'était un import **bloquant au
rendu sur toutes les pages du site**, pas seulement sur les tournois.

⚠️ **Suppression NETTE, sans redirection** : le sous-domaine `NEXT_PUBLIC_TOURNOIS_HOST` et
`wyrm-forge.com/tournois*` renvoient désormais **404**. Aucun lien entrant n'existait dans le
code (pas de sitemap, rien dans la vitrine, bouton « Tournois » de l'app WPF `IsEnabled="False"`),
mais **les annonces externes éventuelles n'ont pas pu être vérifiées**. Si un lien cassé
apparaît, reprendre le patron du CAS 2 de prac dans `proxy.ts` (redirection vers l'accueil).
La variable d'environnement `NEXT_PUBLIC_TOURNOIS_HOST` et l'entrée DNS/domaine côté
Vercel + Cloudflare sont **hors dépôt** et restent à retirer à la main.

⚠️ **NE PAS confondre avec l'onglet dashboard `tournois`** (`Dashboard.tsx`, badge « Bientôt ») :
c'est un `SoonScreen` sans aucun lien de code avec ce front (zéro import partagé, vérifié), il
est **volontairement conservé** et sert de prototype pour autre chose. Ne pas le retirer en
« nettoyant » les restes de ce chantier.

**Ce qui SURVIT et reste documenté ci-dessus** : les 11 migrations, les 6 tables/vues, les 4
fonctions `SECURITY DEFINER` (`seed_bracket`, `report_match_result`, `undo_match_result`,
`start_match`) et les 2 Edge Functions (`tournament-register`, `tournament-admin`). Elles n'ont
plus de client web, mais l'app WPF lit toujours `tournament_standings` et
`tournament_players_public` — **ne pas les supprimer sans vérifier ce dépôt-là**.

> 🔴 **Les trois paragraphes ci-dessus sont DÉPASSÉS depuis le 2026-09-11.** Voir le
> bandeau en tête de section. Plus rien ne survit : tables, vues, fonctions et Edge
> Functions ont été supprimées, et l'onglet dashboard `tournois` a été retiré lui aussi.
>
> La réserve sur l'app WPF (« l'app WPF lit toujours `tournament_standings` ») s'est
> d'ailleurs révélée **fausse à la vérification** : le dépôt `Logiciel-Assistant-LOL`
> ne contenait aucun accès à ces tables — seulement un bouton de navigation
> `IsEnabled="False"` et des libellés i18n, tous retirés depuis. La prudence affichée
> ici était donc justifiée dans son principe (vérifier avant de supprimer) mais
> reposait sur une affirmation jamais contrôlée. Leçon à garder : ce document a
> documenté un consommateur qui n'a jamais existé.

---

## 🟢 Chantier baseline des migrations — CLOS (2026-08-18)

Les migrations `supabase/migrations/` ne couvraient pas le schéma antérieur au versionnage : une base vierge ne pouvait pas être reconstruite depuis zéro. La migration `20260529000000_baseline_pre_versioning.sql` comble ce trou d'historique.

| Phase | Objet | État |
|---|---|---|
| A | Rédaction de la baseline `20260529000000_baseline_pre_versioning.sql` | ✅ |
| B | `migration repair` sur prod et test pour marquer la baseline `applied` | ✅ |
| C | Alignement 80/80 local↔remote sur prod et test, diff d'instantané sans écart (374 objets) | ✅ |
| D | **Rejeu intégral des 80 migrations sur un projet vierge, sans aucun `repair`** | ✅ |

### Phase D — la preuve empirique
Projet jetable `wyrm-forge-baseline-test-jetable` créé, poussé, vérifié puis **supprimé** (2026-08-18). Base au départ strictement vierge : 0 migration remote, 0 objet dans `public`.

- `supabase db push` à nu → **80/80 migrations appliquées**, `db push --dry-run` ensuite : « Remote database is up to date ».
- Instantané des objets (même méthode de hash qu'en Phase C : fonctions, colonnes, contraintes, index, policies, triggers, RLS, grants, vues, extensions) comparé à la prod : **un seul écart**, voir ci-dessous.
- Les 6 écarts CRLF/LF connus sur `update_updated_at` / `increment_*` **n'apparaissent pas** — le fingerprint normalise les espaces (`regexp_replace(..., '\s+', ' ', 'g')`) avant le md5.

**Verdict : le trou d'historique est comblé.** Une base vierge absorbe les 80 migrations dans l'ordre et produit le schéma de la prod.

### ⚠️ Deux dépendances hors migrations (découvertes en Phase D)

**1. `storage.buckets` — piège de provisionnement.** La migration `20260613000002_tournaments_create_infra.sql` fait `INSERT INTO storage.buckets` (bucket `tournament-heroes`). Cette table n'est créée par aucune de nos migrations : c'est le service Storage de Supabase qui la crée, **de façon asynchrone après la création du projet**. Sur un projet neuf, le premier push a échoué ici (`relation "storage.buckets" does not exist`, SQLSTATE 42P01) simplement parce qu'il a doublé le provisionnement ; relancé quelques minutes plus tard sans rien modifier, il est passé. **Sur un projet neuf, attendre le statut `ACTIVE_HEALTHY` avant `db push`** — un échec sur cette migration n'est pas une régression de schéma.

**2. Trigger `prac-notify-tracked-players` — Database Webhook du Dashboard.** Seul écart d'instantané prod ↔ base reconstruite. C'est un webhook créé à la main dans le Dashboard (`AFTER INSERT OR UPDATE ON public.tracked_players` → `supabase_functions.http_request` vers l'EF `prac-notify`), donc absent de toute base reconstruite depuis les migrations. **À recréer manuellement** sur tout nouvel environnement, ou à codifier en migration si on veut qu'il suive.

> 🔴 Sécurité : la définition de ce trigger embarque un en-tête `X-Internal-Token` **en clair dans la base**. Il n'est pas dans Git, mais il est lisible par quiconque peut lire `pg_trigger` sur la prod. À considérer pour une rotation / un passage par Vault.
>
> ✅ **Traité — voir Lot 5E.** `20260901000001_prac_notify_webhook_vault.sql` (commit `0280b0f`) remplace ce webhook par un trigger versionné qui lit le token dans Vault, ce qui referme du même coup cet écart d'instantané : le déclencheur suit désormais les migrations. ✅ **Appliquée sur test ET prod le 2026-09-01**, et **le token a été tourné dans la foulée sur les deux projets**, avec une valeur distincte par environnement. Le paragraphe ci-dessus est donc de l'archéologie : plus aucun `X-Internal-Token` en clair dans `pg_trigger`, et plus rien à recréer à la main sur un nouvel environnement — hors les deux secrets Vault (cf. Lot 5E).


### 🟡 Dette connue — 2 bugs de policy repérés en relisant la baseline (2026-08-31)

Repérés pendant la relecture de `20260529000000_baseline_pre_versioning.sql`, **hors périmètre du chantier baseline**. La baseline les REPRODUIT fidèlement, et c'est sa fonction : elle reproduit la prod, elle ne la corrige pas. Chacun demande une migration séparée, non planifiée à ce jour.

**1. `deletion_requests` — policy INSERT au prédicat mort.** La policy `"Users can create their own deletion request"` porte un sous-`SELECT` qui compare `deletion_requests.id` à `auth.uid()` au lieu de `user_id` :

```sql
AND (NOT (EXISTS ( SELECT 1
                     FROM public.admin_users
                    WHERE (deletion_requests.id = auth.uid()))))
```

`id` est la PK de la demande, `auth.uid()` l'identifiant de l'utilisateur : l'égalité ne peut **jamais** être vraie, donc le `NOT EXISTS` vaut toujours TRUE. La clause, censée empêcher un admin de déposer une demande de suppression, **ne bloque rien**. Impact réel limité — les deux autres conditions (`user_id = auth.uid()` et l'exclusion des e-mails `@wyrm-forge.com`) tiennent — mais l'intention de la troisième est perdue. Correction = `DROP POLICY` + `CREATE POLICY` avec `user_id` à la place de `id`, dans une migration dédiée.

**2. `profiles` — doublon de policy SELECT.** `"View profiles"` (`auth.uid() = id OR public.is_admin()`) et `"Users can read own profile"` (`auth.uid() = id`) coexistent. Les policies permissives se cumulant en OU, la seconde est **strictement incluse** dans la première et ne rend visible aucune ligne supplémentaire. Même classe de doublon que les 8 policies de `scenarios`. Aucun risque de sécurité : juste une évaluation de prédicat inutile à chaque SELECT et une lecture ambiguë du modèle d'accès. À retirer si l'on généralise le nettoyage entamé sur `scenarios`.

---

## 🟢 Conventions de code

- Composants et fichiers : `PascalCase.tsx`
- Variable de thème toujours nommée `c` : `const c = theme === 'mythic'`
- Erreurs Supabase traduites manuellement en français (ex: `'Invalid login credentials'` → `'Email ou mot de passe incorrect.'`)
- Nouveaux profils insérés avec `{ id, username, email, tier: 'apprenti', certified: false }` via AuthModal
- `clamp()` pour les font-sizes responsive (ex: `clamp(36px, 8vw, 64px)`)

---

## 🔵 État d'avancement des onglets

| Onglet | État |
|---|---|
| Accueil | UI placeholder (pas de vraies données Riot) |
| To-Do Lists | Fonctionnel (Supabase, Realtime actif) |
| Stats | UI placeholder |
| Jungle Path | Fonctionnel (données locales) |
| Builds Items | Fonctionnel (données locales) |
| Workshop Builds | Fonctionnel (données Supabase) |
| Workshop Jungle | Fonctionnel (données Supabase) |
| Patch Notes | Fonctionnel — onglet dashboard + page publique `/patch-notes` (SSR) |
| Match Up | Fonctionnel — **ouvert à tous les tiers** (aucun gating d'affichage ; l'accès réel est le solde « Chaleur de la Forge ») : mode, champions, niveaux, builds, radar, analyse IA. Voir §MatchUp Web |
| Post Game | Fonctionnel — **ouvert à tous les tiers** (aucun gating d'affichage ; l'accès réel est le solde « Chaleur de la Forge ») |
| Tournois | Soon screen |
| Admin | Fonctionnel (gestion users, tiers, certification) |

## 🔵 Pages publiques (hors dashboard)

| Route | État |
|---|---|
| `/patch-notes` | Fonctionnel — liste publique SSR. **2 emplacements publicitaires entre les patchs** depuis le 2026-09-12 (§ Pages publiques et examen AdSense) |
| `/match/[platform]/[matchId]` | Fonctionnel — vue détail avec Impact d'items (Vue 1 stats + Vue 2 Meraki) |
| `/summoner/[region]/[gameName]/[tagLine]` | Fonctionnel — historique joueur public, autocomplete `searched_summoners`, comparaison de rang (Vue A percentile + Vue B vs avg) |
| ~~`/tournois*`~~ | **SUPPRIMÉ le 2026-09-03** (décision HORTAL) — front retiré en entier : 11 routes, 19 composants, `lib/tournois*`, le bloc CSS XV2 et le routage de sous-domaine du proxy. Suppression **nette**, sans redirection : le sous-domaine et `wyrm-forge.com/tournois*` renvoient 404. La BASE et les Edge Functions sont intactes — voir § Base de données — module Tournois. |
| `/live/[region]/[riotId]` | Fonctionnel (Lots D1→D5) — les 9 états d'interface du contrat `riot-live-game` (§ Contrat client normatif ci-dessous), composition des 2 équipes, **rangs + winrate des 10 joueurs**. Logique dans `src/lib/live-game.ts` (module pur testé : types, fetch, libellés, `elapsedSeconds`, `splitTeams`, `fetchParticipantRanks`), rendu dans `src/components/live/LiveComposition.tsx`, icônes via `src/lib/ddragon.ts`, libellés de rang via `src/lib/lol-tiers.ts`. **Plus d'appel EF inline** (extrait au Lot D2). Les rangs viennent de 10 appels `riot-rank?puuid=` en `Promise.allSettled` (jamais `all` : un rejet ne doit dégrader QUE sa ligne) — `ranks` reste `null` côté EF. Coût mesuré en réel (29/07/2026) : **11 appels Riot à froid** (1 spectator + 10 league-v4), **0 pour un 2ᵉ participant de la même partie** (mutualisation du cache). Verrou de 30 s sur « Actualiser » : c'est lui qui borne `riot-rank` à 2 chargements/min, soit pile son bucket `isRateLimited` de 20/min. **Point d'entrée depuis `/summoner`** (Lot D5) : bouton « Partie en direct → » dans l'en-tête joueur, construit par `buildLiveHref` (module pur testé). Il propage `?puuid=` **quand il est déjà résolu** par le chargement de `/summoner` (riot-rank ou riot-matches) → la page cible emprunte le chemin canonique de l'EF, **12 appels → 11**. PUUID absent ou mal formé (GUID LCU 36 car.) ⇒ **omis**, repli sur le Riot ID seul : lien toujours valide, juste un account-v1 de plus. Deux décisions actées : (1) le bouton **ne pré-vérifie PAS `in_game`** — le faire coûterait un appel spectator-v5 à chaque visite de `/summoner` pour une info périmée dès le clic ; « pas en partie » se découvre sur la page cible, où c'est un état NOMINAL ; (2) `prefetch={false}` sur le `next/link` est **fonctionnel, pas cosmétique** — le prefetch par défaut déclencherait une requête RSC vers `/live` dès l'entrée du lien dans le viewport, ce qu'interdit le STOP D5 (zéro requête réseau après le chargement initial de `/summoner`). |
| `/confidentialite`, `/mentions-legales`, `/cgu`, `/cgv` | Fonctionnel (Lot P1.a, **traduites FR/EN** le 2026-09-12 — voir § Traduction EN des pages légales) — pages légales statiques, câblées depuis la barre basse du `Footer` (les 3 liens y sont des routes réelles ; **les colonnes du haut aussi depuis le 2026-09-03** — les 9 `'#'` restants ont été soit rebranchés, soit retirés avec leur libellé). **Versions de départ, PAS la version juridique finale** — relecture par un juriste prévue. Chaque `page.tsx` est un Server Component RÉDUIT À `metadata` + le composant de contenu client correspondant (`src/components/legal/*Content.tsx`), qui lit le dictionnaire de la langue courante (`src/locales/legal/`) et le rend dans la coquille partagée `src/components/legal/LegalPage.tsx` ; les helpers `Section` / `List` / `Todo` vivent désormais dans `LegalBlocks.tsx` (rupture de cycle d'imports). ⚠️ Les informations manquantes sont marquées par le composant **`<Todo>`**, qui les rend **visibles à l'écran** en `[À COMPLÉTER PAR HORTAL — …]` / `[TO BE COMPLETED BY HORTAL — …]` **dans les deux langues** : c'est volontaire (un placeholder invisible en commentaire serait publié tel quel sans que personne ne le voie), et une version EN qui paraîtrait complète serait pire encore. `grep -rn HORTAL src` les liste toutes, FR et EN. À renseigner dès l'immatriculation de la SASU : raison sociale, capital, siège, SIREN/SIRET, RCS, TVA, directeur de publication, adresse postale Supabase, région d'hébergement, médiateur de la consommation, modalités de facturation Stripe. |

### Impact d'items (`/match/...`) — précisions techniques
- **Cache v3** (depuis 2026-07-31) : `riot-match-detail` utilise `match:v3:${routing}:${matchId}`. Historique des versions : v1 (origine) → v2 (`playerStats` de timeline) → **v3 (runes complètes : 6 perks + stat shards)**.
  - ⚠️ **Le cache de cette EF est PERMANENT** (`expires_at` 2099 — un match terminé est immuable). **Tout enrichissement du corps de réponse exige donc un bump de version de clé**, sinon les matchs déjà consultés resservent éternellement l'ancien corps. C'est la contrainte structurante de cette EF : le contrat de sortie est figé au moment où le match entre en cache.
  - Les entrées des versions précédentes sont **laissées en place** (aucune purge) — elles n'expirent qu'en 2099 et ne coûtent que du stockage. Prix du bump : les matchs déjà vus repayent **2 appels Riot** (match + timeline) à leur prochaine ouverture.
  - Runes v3 : `perks: { primaryStyle, subStyle, selected[6], statPerks: { offense, flex, defense } }`, `selected[0]` = keystone. **`keystoneId` et `secondaryStyleId` sont CONSERVÉS** — six consommateurs les lisent (pages `/match`, `/summoner`, `/matches`, `AccueilTab` ; `RiotService` + `MatchHistoryView` côté WPF). Le champ `perks` est purement additif, ne pas les retirer.
- **Vue 1 Timeline** : métrique sélectionnable (Or / PA / AD / Armure / RM / PV max / Hâte / Dégâts champs). Courbes par frame (~1 min). Activée si `playerStats` présents (cache v2) + `queueId ∈ {420, 440}`.
- **Vue 2 Importance** : part d'or (DDragon) + stats Meraki par item avec contribution % si `playerStats` disponibles. Route handler `/api/external/items` — cache 24h, fallback silencieux. Bandeau si Meraki daté.
- **Helper partagé** : `src/lib/external-fetch.ts` + `src/app/api/external/items/route.ts`.

### Page joueur (`/summoner/...`) — précisions techniques
- Client Component — rate limit distribué par IP visiteur.
- Appelle `riot-rank` **puis** `riot-matches` en **séquentiel** (intentionnel) : le rang doit être en cache `riot_cache` avant que `riot-matches` soit appelé, pour que le harvest `harvestRankStats` puisse y lire le tier sans appel Riot supplémentaire.
- `riot-rank` retourne désormais `profileIconId` + `summonerLevel`.
- Autocomplete via `searched_summoners` (Supabase anon SELECT), alimentée par `riot-matches` + `riot-match-detail`.
- Jour 1 : recherche exacte fonctionnelle. Autocomplete opérationnel dès que la table se remplit organiquement.

### Comparaison de rang (`/summoner/...`) — précisions techniques
- Bloc affiché si `soloEntry || flexEntry` (joueur classé uniquement).
- **Vue A — Percentile** : estimation "Top X%" basée sur la distribution de rang publique LeagueOfGraphs S1 2026. Calcul purement client, aucune DB.
- **Vue B — Vs ton rang** : compare les stats du joueur (dernières parties chargées) aux agrégats de la DB via `get_rank_avg()`.
  - Rôle dominant déterminé : Solo/Duo prioritaire, puis Flex. Si aucun rôle détecté, le message le signale.
  - Métriques comparées : CS/min, Vision, Dégâts, KDA. Indicateurs ↑/↓/≈ si écart ≥ 5%.
  - Fetch non bloquant — si la DB est vide pour ce bucket, message dégradé gracieux.
- **Alimentation de la DB** : `riot-matches` appelle `harvestRankStats` (fire-and-forget, `_shared/harvest-rank-stats.ts`) sur cache MISS + page 0 + appel by Riot ID. Lit le tier depuis `riot_cache` (pas d'appel Riot supplémentaire).
- **Seuil de représentativité** : `get_rank_avg()` ne retourne rien si `< 50 samples` dans le bucket — empêche les comparaisons biaisées.

---

## 🟡 MatchUp Web — éditeur d'analyse (chantier clos, 2026-07-22)

Portage web complet du builder MatchUp WPF, onglet dashboard **Match Up** (`src/components/dashboard/tabs/MatchUpTab.tsx`, **ouvert à tous les tiers** depuis le 2026-08-01 — voir § Dégating ci-dessous). Persistance **localStorage** (parité `matchups.json` WPF, pas de table Supabase). Livré en 3 lots.

### Dégating par tier (2026-08-01) — Match Up est ouvert à TOUS les tiers
Mêmes deux verrous que Post Game, retirés dans la foulée : `locked: true` sur la `TabDef` (badge « Pro » sidebar desktop **et** drawer mobile) + le ternaire `(isAdmin || isProTier) ? <MatchUpTab/> : <LockedScreen badge="Analyse IA"/>` dans `Dashboard.tsx`. Il ne reste **aucun gating par tier** sur les deux onglets « Analyse IA ».

Le tier est déjà pris en compte **deux fois côté serveur** (budget hebdo **et** modèle) : Apprenti 15 cr / Forgeron 65 cr sur **Haiku** (rapide **6**, détaillée **11**), Maître+ 135 cr sur **Sonnet** (rapide **17**, détaillée **33**). Un Apprenti finance donc 2 rapides ou 1 détaillée par semaine — peu, mais réel : le verrou d'affichage masquait une feature déjà budgétée pour lui.

> ⚠️ **`canAfford` est le vrai garde, pas le tier.** Avec un pot fongible, un solde non nul ne finance pas forcément l'action demandée (9 crédits Haiku payent une rapide à 6, pas une détaillée à 11). Ne jamais remplacer ce test par `remaining <= 0` — c'est précisément le défaut corrigé au chantier « Chaleur de la Forge ».

> **Scénarios reste le seul onglet `locked`** du dashboard, et volontairement : contrairement aux onglets IA, il n'a aucun budget serveur qui arbitrerait son accès à la place du tier. Le dégater demanderait de décider d'un modèle d'accès, pas seulement de retirer un drapeau.

Tests : `src/components/dashboard/tabs.test.ts` (10 tests, `describe.each` sur les deux onglets IA) verrouille l'absence de `locked` et assert que `scenarios` est le seul verrouillé restant. `src/lib/matchup/payload.test.ts` couvre le barème **Haiku** de `canAfford` (Apprenti/Forgeron), jusque-là non testé — seuls les coûts Sonnet l'étaient, or ce sont les tiers Haiku que ce dégating fait entrer dans la feature.

### Modèle & persistance (Lot 1)
- `src/lib/matchup/types.ts` — `MatchUpScenario { mode, allies[], enemies[] }`, `MatchUpChampion { champ, level, build, baseStats, role? }`, `BuildRef = none | saved(buildId) | temp(blocks)`. Réducteurs **purs** (immuables, garde d'index) : `resizeToMode`, `setChampion`, `setLevel`/`clampLevel` (1 → cap du rôle), `setRole`, `setBuild`.
- `src/lib/matchup/storage.ts` — CRUD localStorage `wf.matchups.v2` (migration douce depuis `v1`, voir §Cap de niveau), SSR-safe.
- `src/lib/matchup/ddragon.ts` — loader DDragon dédié conservant `stats` (base + perlevel) pour le scaling.
- `src/lib/champion-stats.ts` — helper centralisé `statAtLevel` / `scaledBaseStats` / `aggregateItemStats` (partagé avec BuildsTab).

### UI de sélection (Lot 2 — 2.1→2.4)
- **2.1** socle (ModeSelector 1v1→5v5, slots, autosave debounced). **2.2** `ChampionPicker` (recherche insensible casse/accents) + niveau simulé. **2.3** `BuildPicker` : build **sauvegardé** (`item_builds`, par référence, résolu à la volée) OU **temporaire** (snapshot d'items autonome) ; `src/lib/matchup/build-resolve.ts` = pont pur `BuildRef → aggregateItemStats`. **2.4** `StatRadar` : radar SVG autonome, `src/lib/matchup/stats-compare.ts` = miroir pur de `AddStatsComparison` WPF (11 axes base+items, normalisation par axe). *Le tableau comparatif et les barres du WPF sont volontairement écartés (radar seul).*

### Câblage analyse IA (Lot 3)
- `src/lib/matchup/payload.ts` (**pur, testé**) — `buildScenarioPayload`/`champPayload`, miroir strict de `ChampPayload`/`BuildScenario` de `ClaudeService.cs` : stats scalées `toFixed(1)`, itère **toutes** les clés baseStats (parité WPF), noms d'items (temp snapshot / saved résolus DDragon), slots vides filtrés. Plus `readQuota`, `formatResetFr`, `overQuotaMessage`.
- `src/lib/matchup/api.ts` — couche réseau (miroir `ClaudeService`) : `analyzeMatchup` (POST) + `getQuota` (GET), token via `supabase.auth.getSession`, **mapping FR identique** (0/401/429/502/autre/vide). Séparé de `payload.ts` pour tester le pur sans l'alias `@/` (vitest sans config d'alias).
- `MatchUpTab` : boutons rapide/détaillée, compteur X/N, blocage propre à 0, bannière tronqué, résultat.
- `scripts/matchup-analyze-smoke.mjs` — **test réel non mocké** (GET quota → POST 200 + décompte → exhaustion → 429 `over_quota` + blocage). Garde-fou coût (exhaustion opt-in).

### Rôle par slot & cap de niveau Top 18→20 (chantier clos, 2026-07-23 — site + WPF)
**Mécanique** (Season 16, sourcée wiki officiel LoL) : un champion **Top** qui complète sa *Role Quest* passe de **18 à 20** ; tous les autres rôles restent à 18. Livré **sur les deux plateformes** avec **parité complète du contrat EF**.

- **Contrat EF (Lot 1, `supabase/functions/matchup-analyze/index.ts`)** — `champ.role?: 'TOP'|'JUNGLE'|'MID'|'ADC'|'SUPPORT'`, **optionnel**. Helper `roleLabel` (validé contre les 5 rôles) injecte le rôle dans la ligne de contexte du prompt (`Ahri (allié, Top) niveau 6`). **Rétrocompatible par construction** : rôle absent OU inconnu → `roleLabel` renvoie `null` → prompt strictement identique à l'ancien format ; `validateScenario` inchangé (aucun nouveau rejet). Un client pré-migration produit exactement le même prompt qu'avant.
- **Modèle web (Lot 2)** — `MatchUpRole` + `role?` sur `MatchUpChampion` (absent = aucun rôle, défaut sûr). Namespace localStorage bumpé `wf.matchups.v1` → **`wf.matchups.v2`** : **v2 fait autorité dès que la clé existe** (même vide/corrompue) pour ne jamais re-migrer par-dessus un état légitime ; sinon lecture de v1, recopie vers v2, et **v1 est CONSERVÉ** (rollback, zéro perte). `clearScenarios` purge les **deux** namespaces (un reset ne doit pas laisser de donnée re-migrable).
- **Cap conditionnel (Lot 3)** — `maxLevelForRole(role)` = `MAX_LEVEL_TOP` (20) si `TOP`, sinon `MAX_LEVEL` (18) — **y compris sans rôle assigné** (défaut sûr pour les scénarios v1 migrés). `clampLevel(level, role?)` prend le rôle en 2ᵉ paramètre **optionnel** → tous les appels existants gardent le cap 18. `setRole` **re-clampe le niveau** à l'assignation comme au retrait : quitter Top rabaisse un 19/20 à 18 plutôt que de laisser un niveau devenu illégal. UI : rangée de 5 pills TOP/JGL/MID/ADC/SUP par slot occupé (vocabulaire et couleurs repris de l'éditeur Scénarios) — **différence assumée** : ici le rôle est OPTIONNEL (les Scénarios ont 5 rôles fixes), donc re-cliquer le rôle actif le retire.
- **Parité payload** — `champPayload` envoie `role`, comme `ClaudeService.cs` (WPF Lot 4.3). La clé est **OMISE** quand le slot n'a pas de rôle valide, jamais envoyée à `null` : **effet serveur identique** (`roleLabel` → `null` → prompt inchangé) et cohérent avec `build`, déjà omis quand vide. `normalizeRole` (miroir de `MatchUpRoles.Normalize` WPF) n'est pas décorative — les scénarios relus depuis localStorage sont un JSON **simplement casté**, le type union ne garantit rien à l'exécution ; un fichier édité à la main pourrait sinon pousser un rôle inconnu jusqu'à l'EF. `MATCHUP_ROLES` est la source unique de la liste (réutilisée par `MatchUpTab`).
- **Côté WPF** (`Models/MatchUp.cs`, `MatchUpService`, `MatchUpEditorView`, `ClaudeService`) : `Role` est un `string?` et **non un enum** (une valeur inconnue dans un `matchups.json` édité à la main est ramenée à `null` par `Normalize` au lieu de faire échouer la désérialisation du fichier entier). Pas de bump de nom de fichier (System.Text.Json est nativement tolérant dans les deux sens) mais **backup unique `matchups.pre-role.backup.json`** — pendant du « v1 conservé » du web. ⚠️ **Seul point lossy, assumé** : le WPF autorisait 1→20 sur **tous** les slots sans gating, donc un scénario existant peut porter un 19/20 **sans rôle**, désormais illégal → ces niveaux retombent à 18 (l'original reste dans le backup).
- **L'écart web/WPF (18 vs 20) documenté précédemment est RÉSOLU** : les deux clients appliquent désormais la même règle. Calcul pur inchangé (`statAtLevel` / `GetStatAtLevel` scalent linéairement, sans cap interne).

### 🔑 Point d'architecture — backend réutilisé SANS modification serveur
L'EF `matchup-analyze` + l'infra `usage_counters`/`consume_ai_quota`/`refund_ai_quota` (migration `20260720000001`), écrites pour le **WPF**, sont désormais consommées **à l'identique par le web** : **aucun changement côté serveur** (ni EF, ni SQL, ni migration) n'a été nécessaire pour brancher le 2ᵉ client — seule une couche cliente TS (`api.ts` + `payload.ts`) miroir de `ClaudeService.cs`. C'est la **preuve concrète que le patron proxy Anthropic serveur + quota atomique par tier est réellement réutilisable** (cf. §Modèle freemium : c'est ce même patron que Post Game réutilisera, avec juste une nouvelle `feature` et un nouveau barème). Contrat POST/GET, gating par tier, clé Anthropic serveur : voir la doc `matchup-analyze` dans la liste des Edge Functions.

### Tests
`src/lib/matchup/*.test.ts` (vitest) : `types`, `storage`, `ddragon`, `build-resolve`, `stats-compare`, `payload` — **104 tests** couvrant tous les modules purs (dont rôle/cap : migration v1→v2, `maxLevelForRole`, re-clamp de `setRole`, `normalizeRole`, omission de `role` dans le payload). La couche réseau `api.ts` est couverte par le smoke script réel (non mocké).

---

## 📋 À faire plus tard

### Comparaison rangs supérieurs (palier Maître) — retirée de la grille le 2026-09-11
Fonctionnalité promise puis retirée de la grille le 11/09, faute d'implémentation.
À développer si retenue pour le palier Maître, sinon laisser retirée définitivement.

> Contexte : la grille tarifaire (`pricing.tiers[2].features`, `src/locales/landing.ts`,
> FR « Comparaison rangs supérieurs » / EN « Compare against higher ranks ») la vendait
> comme avantage Maître, alors qu'aucun code ne l'implémente — la seule comparaison de
> rang existante (Vue B de `/summoner`, `get_rank_avg()`) est ouverte à tous et compare
> au rang du joueur, pas aux rangs supérieurs. Décision HORTAL : retrait. La réintroduire
> sur la grille exige que la fonctionnalité existe ET soit réservée à Maître.

### ~~Quotas IA différenciés rapide / détaillée~~ — ABANDONNÉ (2026-07-31)
> **Chantier clos sans être réalisé.** La séparation en deux compteurs `matchup_quick`/`matchup_detailed` a été **remplacée** par le pot de crédits fongible « Chaleur de la Forge » (§ dédié ci-dessus), qui résout le même problème sans cloisonner le budget : chaque appel débite son coût réel sur un solde unique, donc une analyse rapide ne consomme plus l'équivalent d'une détaillée. **Ne pas réintroduire de compteur par feature** — ce serait recloisonner ce que ce chantier vient d'unifier. Le texte ci-dessous est conservé pour l'historique du raisonnement.

#### (historique) Quotas IA différenciés rapide / détaillée (MatchUp, puis PostGame)
**Constat de coût** : ⚠️ **le ratio « ~16× » de la première version de ce paragraphe est FAUX — le vrai ratio mesuré est 3,5×** (voir § Coût réel mesuré ci-dessous). Le 16× comparait deux scénarios différents, pas rapide vs détaillée à scénario constant. Sur un scénario identique (5v5 complet, Sonnet 5), l'« analyse rapide » (`max_tokens=400`) coûte **15,7 crédits** contre **55,7** pour la détaillée (`max_tokens=3000`) — soit **3,5×**, pas 16×. Toute décision de calibrage prise sur le 16× est à refaire. Aujourd'hui les deux **consomment le même compteur hebdomadaire** : `usage_counters` avec une seule `feature = 'matchup_analyze'` (⚠️ la clé réelle en base est `matchup_analyze`, pas `matchup`). `matchup-analyze` ne distingue pas `advanced` true/false pour le quota.

**Piste à cadrer** : séparer en **deux compteurs distincts** (ex. `matchup_quick` et `matchup_detailed`), chacun avec sa propre limite par tier — permettrait p. ex. de débloquer **plus d'analyses rapides** pour Apprenti (gratuit) **sans** gonfler le budget détaillé (plus coûteux, surtout Sonnet pour Maître+).

**Impact** :
- **Migration** : 2 features au lieu d'1 (ou refonte du schéma `usage_counters`).
- **EF `matchup-analyze`** : choisir le bon compteur selon `advanced` (le `TIER_CONFIG` devient un mapping tier→{limite_rapide, limite_détaillée, modèle}).
- **Affichage quota** : potentiellement **2 jauges au lieu d'1**, côté WPF (`ClaudeService`/`MatchUpAnalysisResult`) **et** web (`src/lib/matchup/api.ts` `getQuota` + `MatchUpTab`).

**Prérequis / cadrage générique** : la **même question se posera pour PostGame** (analyse IA post-partie, pas encore construite). → **Concevoir une architecture de quota différenciée générique dès PostGame** (compteurs paramétrés par variante d'analyse), plutôt que de la retrofit sur MatchUp seul. Le patron `usage_counters` + `consume_ai_quota`/`refund_ai_quota` reste la base (cf. §MatchUp Web + doc `matchup-analyze`) — c'est la granularité `feature` qui évolue.

### Coût réel mesuré de `matchup-analyze` (Lot 1 chantier Budget IA — 2026-07-31)

Mesures **réelles** (appels Anthropic non mockés, `usage.input_tokens`/`output_tokens` de la réponse API), prompt byte-identique à la prod. Unité : **1 crédit = 0,001 $**. Tarif **standard** Sonnet 5 (3,00 $/15,00 $ par MTok).

> ⚠️ **Sonnet 5 est en tarif d'introduction (2,00 $/10,00 $) jusqu'au 31/08/2026** — soit **+50 % de coût au 1ᵉʳ septembre**. Tous les chiffres ci-dessous sont au tarif standard : budgéter sur la facture de juillet/août, c'est être court de 50 % en septembre.

#### Ce qui coûte réellement
- **C'est le template de réponse qui coûte, pas la complexité de l'input.** De 265 à 3 579 tokens d'entrée (×13,5), le coût ne fait que ×2. À 5v5 complet, l'input ne pèse que **19 %** de la facture.
- **Le prompt détaillé actuel (6 sections) tronque systématiquement** : 5/5 runs à `stop_reason=max_tokens` sur un 5v5 complet. **Tout utilisateur Maître+ qui lance une analyse détaillée 5v5 reçoit aujourd'hui une analyse coupée.**
- **L'analyse rapide Sonnet (15,7 cr) coûte MOINS cher que l'analyse détaillée Haiku (18,1 cr)** — raccourcir la réponse est un levier plus puissant que dégrader le modèle. À retenir avant d'arbitrer « Haiku par défaut ».

#### Prompt de réponse — V2 condensé (mesuré, **PAS déployé**)
Réécriture du bloc de consignes du prompt `advanced` : 6 sections → **4**, budget explicite de 400 mots, interdiction de recopier les stats. Les 3 phases (early/mid/late) sont **conservées**, fusionnées en une section à une phrase par phase — aucune information actionnable perdue (contrôle qualité sur sortie réelle : conseils tactiques spécifiques, exploitation des builds, note de difficulté justifiée).

| Cas (Sonnet 5, détaillée) | V1 (6 sections) | V2 (4 sections) | Gain |
|---|---|---|---|
| 1v1, sans stats | 27,4 cr · 1 776 tok | **10,7 cr** · 647 tok | −61 % |
| 1v1, 20 stats | 34,7 cr · 2 165 tok | **13,5 cr** · 736 tok | −61 % |
| 2v2, 20 stats, 3 items | 44,9 cr · 2 704 tok | **16,2 cr** · 783 tok | −64 % |
| **5v5 complet, 6 items** | 55,7 cr · **3 000 tok (tronqué 5/5)** | **24,0 cr** · 872 tok (**tronqué 0/6**) | **−57 %** |

Vérifié une seconde fois sur un 5v5 aux **stats différenciées par champion** (les 10 champions du premier jeu d'essai portaient les mêmes stats, ce que le modèle remarquait par un préambule méta) : **878 tokens de sortie, 23,9 cr, 0/4 tronqué** — écart de 0,7 % avec le jeu synthétique, et le préambule disparaît. La mesure est donc représentative.

- **Aucun des deux clients ne parse les sections** — web `MatchUpTab.tsx:310` (`whiteSpace: pre-wrap`), WPF `MatchUpEditorView.xaml.cs:890` (`TextBlock` unique). Vérifié dans les deux dépôts : la réécriture ne peut casser aucun affichage. C'est ce qui rend la refonte du format libre.

#### Vérification finale à `max_tokens=1400` (la valeur réellement déployée)
Mesurer à 3000 n'aurait pas testé la configuration de prod — c'est précisément à 1400 qu'une troncature redevient possible. 16 runs sur le prompt définitif (consigne « 2 puces » renforcée incluse) :

| Cas | in | out moy | out max | tronqué | crédits |
|---|---|---|---|---|---|
| 1v1 sans stats | 385 | 596 | 612 | 0/2 | 10,1 |
| 1v1 · 20 stats | 877 | 700 | 722 | 0/2 | 13,1 |
| 2v2 · 3 items | 1 557 | 799 | 831 | 0/2 | 16,6 |
| 5v5 complet | 3 699 | 803 | 870 | **0/6** | **23,1** |
| 5v5 stats différenciées | 3 699 | 819 | 876 | **0/4** | **23,4** |

**0 troncature sur 16 runs. Sortie max 876 / 1400 → 37 % de marge.** Le durcissement de la consigne n'a pas fait remonter le coût (23,1 vs 24,0 avant).

⚠️ **Écart de consigne résiduel, non bloquant** : la section « Forces et faiblesses » demande exactement 2 puces par camp. Après reformulation contraignante, la sortie respecte généralement la cible (4 puces au total), avec un dépassement occasionnel à 8. **Sans impact budgétaire** — la longueur totale reste stable et sous le plafond. Ne pas « corriger » à nouveau sans mesurer : la consigne actuelle est le meilleur compromis trouvé.
> 🪤 Piège de méthode rencontré : le compteur de puces du script de contrôle utilisait `/^\s*[-*•]/`, qui matche aussi `**Camp allié :**` (astérisque de gras) — il sur-comptait de 2 par réponse et faisait croire à une violation systématique. Vérifier un instrument de mesure avant de conclure d'un écart.

#### Budget tier Maître (135 crédits/semaine)
| | V1 | V2 |
|---|---|---|
| Analyses détaillées 5v5 finançables/sem | **2,4** | **5,6** (5,2 au coût max observé) |

---

## 🟡 PostGame — les 9 combinaisons (EF `postgame-analyze`, généralisé le 2026-08-01)

**3 profondeurs** (`simple`/`medium`/`advanced`) **× 3 modes** (`perso`/`adversaire`/`les_deux`). La première brique (2026-07-31) n'ouvrait que `simple × perso` pour valider le patron EF/prompt/coût ; `depth`/`mode` étaient déjà dans le contrat, donc la généralisation **n'a cassé aucun client** — les défauts restent `simple`/`perso`.

### 🔑 Aucun enrichissement de `riot-match-detail` n'a été nécessaire
C'était le risque majeur du chantier, et il ne s'est pas matérialisé : **tout ce dont les 9 combinaisons ont besoin est déjà dans le cache v3** — `teamPosition` (adversaire), `timeline[].playerGold/playerXp/playerCs` (courbes), `perks` (runes), `summoner1Id/2Id`, `skillEvents`, `events[]` (BUILDING_KILL / ELITE_MONSTER_KILL), `teams[].objectives`, `teams[].bans`, multikills, `totalHeal`, `timeCcOthers`, `longestLife`. **Pas de bump de clé de cache**, donc aucun match déjà consulté ne re-paie les 2 appels Riot. Vérifier cet inventaire AVANT d'envisager un v4 : la contrainte du cache permanent (expiration 2099) rend tout enrichissement coûteux.

### Prompt — module partagé `_shared/postgame-prompt.ts`
Module **PUR** (aucun import, aucune API Deno), importé par l'EF **et** par le script de mesure `scripts/postgame-measure.ts` (lancé sous Node/tsx). C'est ce qui garantit que **le prompt mesuré est byte-identique au prompt servi** — la première brique mesurait depuis une copie dans le scratchpad, qui pouvait dériver en silence.

- **`les_deux` est une EXTENSION de `perso`**, pas un gabarit séparé : mêmes sections + une section « Face à face ». Idem pour la profondeur, qui **ajoute** des sections sans jamais en retirer (4 → 5 → 6). Un test vérifie que `les_deux` a exactement une section de plus que `perso` à profondeur égale. Objectif : éviter 9 templates indépendants à maintenir.
- **⚠️ INVARIANT — `simple × perso` est verrouillé BYTE-À-BYTE** (`src/lib/postgame/prompt.test.ts`) contre le littéral d'avant refonte. Ce prompt est **déjà tarifé en production** (6 crédits Haiku / 17 Sonnet) : le modifier rendrait un prix déjà facturé faux. La mesure post-refonte est retombée exactement sur 17/6, ce qui valide l'invariant de bout en bout.
- Discipline du Lot 1 appliquée à **chaque** palier : budget de mots explicite (300 → 750 selon la combinaison), sections numérotées avec plafond par section, interdiction de recopier les chiffres.

### Mode `adversaire` — repli quand il n'y a pas de duel de voie
Adversaire = même `teamPosition`, équipe opposée. `teamPosition` est **vide sur les modes sans voies** (ARAM, Arena) et parfois sur la Faille quand Riot n'infère pas les rôles. **C'est un état NOMINAL de la donnée, pas une panne** :
- **Serveur** : la résolution se fait **AVANT `consume_ai_credits`** → `400 { code: 'opponent_unavailable' }`, **zéro crédit débité, zéro appel Anthropic**.
- **Client** : grise les modes adverses sur les files sans voies (`hasLaneOpponent`, liste `LANELESS_QUEUES`) **avant** tout appel, et le mode effectif est **dérivé** (`laneOk ? modeChoice : 'perso'`) plutôt que synchronisé par un `setState` dans un effet — le choix de l'utilisateur est conservé et redevient actif dès qu'il resélectionne une partie de Faille.
- Le serveur reste l'**autorité** : la liste de files du client ne peut pas couvrir le cas « Faille sans rôles détectés ».

### Grille de coûts — 9 combinaisons × 2 modèles, MESURÉE
54 appels Anthropic **réels, non mockés** (9 × 2 modèles × 3 runs : 2 au pire cas pour la variance + 1 typique), le 2026-08-01. **0 troncature, 0 échec.** Aucune valeur extrapolée : chaque combinaison est chiffrée à part, conformément à la leçon du Lot 1 (le template pilote le coût, un ratio ne se transpose pas).

| Combinaison | Haiku 4.5 | Sonnet 5 |
|---|---|---|
| `simple_perso` | **6** | **17** |
| `simple_adversaire` | 6 | 17 |
| `simple_les_deux` | 7 | 20 |
| `medium_perso` | 7 | 22 |
| `medium_adversaire` | 7 | 22 |
| `medium_les_deux` | 8 | 25 |
| `advanced_perso` | 9 | 27 |
| `advanced_adversaire` | 9 | 27 |
| `advanced_les_deux` | **10** | **31** |

Plafonds de sortie (`MAX_TOKENS`, **source unique dans le module partagé**) : `simple` 900, `medium` 1100, `advanced` 1300 → marges de 32 % / 29 % / 33 %. **Le tarif pire cas est DIRECTEMENT proportionnel à ce plafond** — le surdimensionner fait payer une sortie jamais atteinte, le réduire fait tronquer. Les deux bougent ensemble ou pas du tout.

- 🪤 **Piège de méthode rencontré** : un premier passage à **1 run** par combinaison donnait des sorties max nettement plus basses (404 au lieu de 614 sur `simple_adversaire`). Calibrer les plafonds sur un échantillon unique aurait produit des troncatures en production. **Toujours au moins 2 runs sur le pire cas.**
- **Cas dégénéré vérifié en priorité** (`advanced × les_deux`, le pire cas de la matrice, mesuré **en premier** par construction du script) : entrée max 3 543 tok, sortie max 868 / 1300, **0 troncature sur 6 runs**.

#### Cohérence budgétaire — le pot est PARTAGÉ avec MatchUp
- **Aucune combinaison PostGame ne dépasse une analyse détaillée MatchUp** (31 < 33 Sonnet). Ordre de grandeur cohérent, comme demandé au cadrage.
- **Un Apprenti (15 cr, Haiku) peut s'offrir CHAQUE combinaison au moins une fois** — la plus chère est à 10. Propriété importante : le tier gratuit n'est exclu d'aucune combinaison, sinon le dégating de l'onglet n'aurait servi à rien.
- Un Maître (135 cr, Sonnet) finance 4 `advanced_les_deux` (124 cr) — soit exactement le calibrage « 4 analyses détaillées » déjà réservé de facto par l'usage MatchUp.
- Ces trois propriétés sont **testées** (`src/lib/postgame/api.test.ts` § Budget par tier), pas seulement documentées.

#### Garde anti-dérive
`prompt.test.ts` **lit le fichier de l'EF** et compare les 18 valeurs de `COST_CREDITS` à la grille mesurée, vérifie qu'aucune n'est à 0, et que `MAX_TOKENS` n'a pas bougé. Une valeur modifiée sans re-mesure fait échouer la suite.

### Patron réutilisé sans modification
Proxy Anthropic serveur + `verify_jwt = true` + **`consume_ai_credits` sur le pot « Chaleur de la Forge »** — le même solde que MatchUp, pas un compteur PostGame. C'est la 2ᵉ preuve que le patron est réutilisable tel quel : aucune migration, aucune fonction SQL nouvelle.

### Source de données
Appel **interne** à `riot-match-detail` (`fetch` vers `${SUPABASE_URL}/functions/v1/…` avec la clé anon, patron de `prac-track`) plutôt qu'un accès Riot direct : bénéficie de son cache permanent, de son comptage de quota et de son circuit breaker. Le client n'envoie que `{ matchId, puuid }` — **aucune stat ne transite par lui**, il ne peut donc rien falsifier.

- `platform` déduite du préfixe du matchId (`EUW1_…` → `euw1`) si absente, puis validée contre la liste `ROUTING`.
- `participantId` Riot = index dans `participants` + 1 (convention de `riot-match-detail`) — c'est ce qui relie le joueur à ses `itemEvents` et à ses morts dans `kills[]`.
- **Dictionnaires DDragon** mémoïsés au **niveau module** (instances Deno chaudes → un fetch par instance), chargés **à la demande selon la profondeur** : `item.json` toujours ; `summoner.json` + `runesReforged.json` dès `medium` ; `champion.json` (noms des bans) seulement en `advanced`. Pas de cache DB : `riot_cache.function_name` porte un CHECK qu'il faudrait étendre par migration pour un simple libellé. Échec DDragon → dégradation silencieuse (« objet {id} », « inconnues »), jamais d'erreur remontée pour un libellé cosmétique.
  - ⚠️ **`champion.json` et `summoner.json` sont indexés par CLÉ (« Ahri »), pas par id numérique** — c'est `data[x].key` qui porte l'id renvoyé par l'API match. `item.json`, lui, est bien indexé par id. Deux extracteurs distincts (`byId` / `byNumericKey`), ne pas les confondre.
  - Les fragments de stats (`statPerks`) sont **absents de `runesReforged.json`** → table `STAT_SHARDS` en dur.

#### Plafonds structurels — ce qui borne le coût d'entrée
`CAP_PURCHASES` 25 · `CAP_DEATHS` 15 · `CAP_SKILLS` 18 · `CAP_CURVE` 8 · `CAP_OBJECTIVES` 25. Ce sont **ces plafonds qui définissent le « pire cas »** mesuré : les relever invaliderait la grille de coûts. Les courbes sont échantillonnées **toutes les 5 minutes** (pas une ligne par frame) — une partie de 35 min produirait sinon 35 lignes × 3 valeurs pour une information que le modèle n'exploite pas plus finement.

### Client (site uniquement — WPF hors périmètre à ce stade)
`src/lib/postgame/api.ts` + `src/components/dashboard/tabs/PostGameTab.tsx`, branché sur l'onglet `postgame` (remplace le `DevPreviewScreen`). Sélecteur des 10 derniers matchs via `riot-matches`, **deux rangées de pills** (profondeur × sujet) affichant chacune le coût en crédits de l'option, solde décrémenté à l'écran.

#### Sélecteur de matchs — champs affichés (enrichi le 2026-08-04)
Chaque ligne porte : **résultat V/D**, champion, **rôle**, KDA, **mode de jeu**, **durée**, **date + heure**. **Aucun appel réseau supplémentaire** — tous ces champs étaient déjà dans le payload `riot-matches` existant (vérifié avant d'écrire le code, cf. l'objet retourné par `riot-matches/index.ts`). Ne pas ajouter d'appel à `riot-match-detail` pour enrichir cette liste.

- ⚠️ **PIÈGE DE NOM DE CHAMP — `duration`, PAS `gameDuration`.** `riot-matches` **aplatit** `m.info.gameDuration` en une clé `duration`. Le composant déclarait et lisait `gameDuration` → toujours `undefined` → **la durée n'était jamais affichée**, sans la moindre erreur. Corrigé. Règle : les noms de `SlimMatch` doivent être recopiés depuis l'objet retourné par l'EF, jamais depuis le vocabulaire de l'API Riot — l'EF renomme (`duration`, `queueName`, `position`, `cs`).
- **`queueName` est déjà résolu côté serveur** (`QUEUES[queueId] ?? 'Partie'`) : on le réutilise plutôt que d'ajouter une **4ᵉ** table de libellés de files au repo (trois existent déjà, dette documentée au § contrat `riot-live-game`).
- `position` (`teamPosition || individualPosition`) est **vide sur ARAM/Arena** — le badge de rôle est alors masqué, jamais remplacé par un tiret. Le libellé Riot→abréviation (`MIDDLE`→`MID`, `BOTTOM`→`ADC`, `UTILITY`→`SUP`) est une **3ᵉ copie** assumée (les deux autres sont dans `/summoner` et `/matches`) — non extraite pour ne pas toucher deux pages hors périmètre.
- Le résultat est doublé d'un **V/D textuel** en plus de la couleur : la pastille seule se lit mal sur 10 lignes et exclut les daltoniens rouge/vert.

- **`costs` porte les 9 clés** `${depth}_${mode}` — indispensable : le coût varie de 6 à 31 crédits, donc le prix affiché change quand on bascule de profondeur **ou** de mode.
- **`canAffordPostGame(quota, depth, mode)` prend la combinaison en paramètre.** Un booléen global de finançabilité serait ici encore plus faux que dans le cas MatchUp : à 7 braises, un Apprenti peut s'offrir `simple_les_deux` (7) mais pas `medium_les_deux` (8). Défauts `simple`/`perso` → les appels existants restent valides.
- Quand la combinaison choisie n'est pas finançable, le message **propose la combinaison de repli** (`Simple · moi`) si elle l'est — plutôt que de laisser l'utilisateur devant un bouton grisé sans issue.
- Repli `opponent_unavailable` : le composant rebascule sur « Moi » et affiche l'explication (ARAM/Arena/rôles non détectés), **jamais une erreur rouge**.

#### Dégating par tier (2026-08-01) — Post Game est ouvert à TOUS les tiers
L'onglet était doublement verrouillé : `locked: true` sur sa `TabDef` (badge « Pro » dans la sidebar desktop **et** dans le drawer mobile) + un ternaire `(isAdmin || isProTier) ? <PostGameTab/> : <LockedScreen badge="Analyse IA"/>` dans `Dashboard.tsx`. Un compte Apprenti ne voyait donc **rien**, alors qu'il dispose de 15 crédits/semaine pour un bilan à 6. **Les deux verrous ont été retirés** ; il ne reste aucun gating par tier sur Post Game.

Le tier est déjà pris en compte **deux fois côté serveur** par « Chaleur de la Forge » — budget hebdo **et** modèle : Apprenti 15 cr / Forgeron 65 cr sur **Haiku** (bilan à **6**), Maître+ 135 cr sur **Sonnet** (bilan à **17**). Un Apprenti finance donc 2 bilans par semaine, un Maître 7. Le verrou d'affichage ne faisait que masquer une feature déjà budgétée, sans rien protéger.

> ⚠️ **`locked` est la SEULE source du badge « Pro »**, lu par `SidebarBtn` (`Dashboard.tsx`) *et* `DrawerTabBtn` (`src/components/nav/Nav.tsx`) depuis la même `TabDef` — le retirer une fois suffit pour les deux navigations. Ne pas chercher un second endroit à modifier.

> ℹ️ **Match Up a été dégaté juste après**, par le même patron (voir § Dégating dans MatchUp Web) — les deux onglets IA sont désormais cohérents, seul le budget de crédits arbitre l'accès. Note historique utile : contrairement à ce qui a été affirmé au lancement de ces chantiers, **aucun retrait de badge « Pro » n'avait jamais eu lieu sur MatchUp avant le 2026-08-01** ; l'historique git montre l'inverse (`40a0be3 feat: unlock matchup/postgame pour tiers maître+` a *élargi* l'accès de admin-only à maître+). Post Game a donc été le premier dégaté, pas le second.

Tests : `src/components/dashboard/tabs.test.ts` (6 tests) verrouille l'absence de `locked` sur `postgame` et documente le contraste avec `matchup`/`scenarios`. Le fichier **stubbe `@/lib/supabase/client`** (`vi.mock`) : importer `Dashboard` tire `ScenariosTab`, qui appelle `createClient()` au niveau module et lève sans variables d'env.

> **Statut : version `simple × perso` DÉPLOYÉE** (vérifié le 2026-08-01 — un GET non authentifié renvoie `401 UNAUTHORIZED_NO_AUTH_HEADER` du gateway, et non un 404 « function not found »). Aucune migration requise.
>
> ✅ **La généralisation aux 9 combinaisons est DÉPLOYÉE depuis le 2026-08-04** — commit `d86f7ba`, EF `postgame-analyze` **version 1 → 2** (workflow `30916776074`, vert au 2ᵉ essai — voir l'incident esm.sh ci-dessous), et chunk client servant les pills Profondeur/Sujet. Vérifié sur la **source réellement déployée** (`supabase functions download`), pas sur le commit : `COST_CREDITS` y porte bien les 18 valeurs.
>
> ⚠️ **Ce qui a causé le bug « un seul coût affiché ».** Entre le 2026-08-01 et le 2026-08-04, le code des 9 combinaisons était **complet en local mais jamais commité** : l'EF est restée en **version 1** (`created_at == updated_at`, jamais redéployée) avec `costs = { simple_perso }` — **une seule clé**. Le client en prod n'avait donc aucune pill, et un seul coût à afficher. Ce n'était ni un bug d'affichage, ni de mauvaises clés lues dans `costs`. **Leçon : « le code est écrit » ≠ « c'est déployé ».** Vérifier `supabase functions list` (champ `version`) avant de diagnostiquer un écart de payload comme un bug client.
>
> ⚠️ **Incident de déploiement à connaître (2026-08-04)** : le workflow a d'abord échoué sur `detail-quota` — `failed to load 'https://esm.sh/@supabase/supabase-js@2': timed out after 10s`. Panne **transitoire d'esm.sh, sans rapport avec le code poussé**. Comme le job tourne sous `bash -e` et déploie les fonctions **par ordre alphabétique**, l'échec sur la première a stoppé le job **avant même d'atteindre `postgame-analyze`**. Un simple `gh run rerun --failed` a suffi. Ne pas chercher un bug dans la fonction visée quand l'erreur mentionne une autre fonction.
>
> ⛔ **Restent NON validés en conditions réelles** (le déploiement ne les a pas couverts) : (1) l'extraction des faits sur un vrai corps de match — les `playerFacts` medium/advanced n'ont jamais vu de données Riot authentiques, seulement des fixtures ; (2) la résolution d'adversaire sur une vraie partie de Faille ; (3) le repli `opponent_unavailable` sur un vrai ARAM. Ces trois points touchent du code de **mapping**, là où les fixtures mentent le plus facilement. **À exercer sur une vraie analyse avant de considérer le chantier clos.**
>
> ⚠️ **Bloqueur d'intégration corrigé le 2026-08-01** : `PostGameTab` décide de l'existence d'une liaison Riot sur `profile.riot_puuid`, mais `fetchProfile` (`src/app/page.tsx`) ne sélectionnait que `id, username, tier, role, tier_expires_at, certified` → `riot_puuid` toujours `undefined` → **l'onglet renvoyait vers « Lie ton compte Riot » même avec une liaison bien présente en base**, et le sélecteur de matchs était donc inatteignable. `riot_puuid, riot_platform` ajoutés au `select`. Les autres champs déclarés dans `UserProfile` (`riot_gamename`/`riot_tagline`/`riot_rank`) restent **non sélectionnés** : l'interface les déclare optionnels, aucun consommateur du dashboard ne les lit. Règle : tout nouvel onglet qui lit un champ de `UserProfile` doit vérifier que `fetchProfile` le ramène — le type ne le garantit pas, tous les champs Riot y sont optionnels.
>
> **Cas « solde insuffisant » verrouillé par des tests** (`src/lib/postgame/api.test.ts`, 8 tests) : 3 braises restantes / bilan à 6 ⇒ `canAffordPostGame` false ⇒ bouton `disabled` **et** garde en tête du callback `run` (le « aucun appel réseau voué au 429 » ne doit pas dépendre du seul attribut HTML). Coût inconnu (`costs` absent, EF pré-crédits) ⇒ finançable, le serveur reste l'autorité.
>
> **Reste à observer** : le chemin nominal *solde suffisant → analyse rendue* n'a jamais tourné dans l'UI (solde de test à 3 braises). À faire au reset du pot (lundi 2026-08-03) ou sur un compte mieux doté.

---

## 🟡 Chaleur de la Forge — pot de crédits IA (migration 20260731000001)

**Modèle de quota IA du projet.** Remplace le comptage « N analyses par feature ». Un utilisateur dispose d'un **solde hebdomadaire unique en crédits**, **fongible entre TOUTES les features IA** présentes et futures (MatchUp, PostGame, …) : premier arrivé premier servi, aucune réservation par feature. Chaque appel débite son **coût réel**, calculé côté serveur.

### Unité et budgets — source des chiffres
> ⚠️ Ces valeurs n'étaient documentées **nulle part** avant ce chantier (elles circulaient à l'oral). Elles sont consignées ici pour être la référence. **La conversion crédit→$ est une ESTIMATION**, pas une facturation réelle : elle sert à dimensionner un budget, pas à refléter la facture Anthropic au centime.

- **1 crédit = 0,001 $** de coût Anthropic estimé.
- Budgets hebdomadaires par tier (cadrage « Chaleur de la Forge », Lot 0) : **Apprenti 15**, **Forgeron 65**, **Maître 135**.
- ⚠️ **Légion et admin n'ont PAS été définis** par ce cadrage. Légion aligné sur Maître (135), admin à 1000 — choix conservateur côté budget, mais qui **ne différencie plus le tier payant supérieur**. À trancher. (Architecte / Architecte+ figuraient ici au même budget ; ils ont été retirés de l'offre par `20260901000004`, la bascule vers Maître était donc neutre côté crédits.)

### Coût d'un appel — dépend du MODÈLE, pas seulement de `advanced`
Tarif **pire cas** (discipline actée au Lot 1) : input max mesuré sur un 5v5 complet + sortie au plafond `max_tokens`, arrondi au crédit supérieur.

| | Rapide (400 tok out) | Détaillée (1400 tok out) |
|---|---|---|
| **Sonnet 5** (3 $/15 $ MTok) | **17** cr | **33** cr |
| **Haiku 4.5** (1 $/5 $ MTok) | **6** cr | **11** cr |

> Le cadrage ne citait que 32,1 / 16,3 — ce sont les chiffres **Sonnet**. Les appliquer aux tiers Haiku (Apprenti, Forgeron) les surfacturerait d'un **facteur 3**. D'où `COST_CREDITS` indexé par modèle dans l'EF.

Ce que chaque tier peut donc s'offrir : Apprenti 1 détaillée ou 2 rapides · Forgeron 5 détaillées ou 10 rapides · **Maître 4 détaillées** (132/135) ou 7 rapides — les 4 détaillées de Maître restent exactement le calibrage du Lot 1.

### Fonctions SQL
| Fonction | Rôle |
|---|---|
| `consume_ai_credits(p_user_id uuid, p_cost int, p_limit int) → int` | Débit atomique. Retourne le total consommé ; **NULL = solde insuffisant, aucune écriture** (donc aucun appel payant). |
| `refund_ai_credits(p_user_id uuid, p_cost int) → void` | Rembourse le montant exact si l'appel fournisseur échoue après débit. |

SECURITY DEFINER, `REVOKE FROM PUBLIC`, **aucun GRANT** → service_role uniquement. Advisory lock + décision portée par le seul prédicat `WHERE uc.count + p_cost <= p_limit` du `DO UPDATE` → pas de fenêtre TOCTOU.

- **Nom distinct de `consume_ai_quota`, délibérément** : une surcharge de même nom et même arité (`uuid, int, int` vs `uuid, text, int`) ferait lever une ambiguïté PostgREST (`PGRST203`) à la résolution du RPC. `consume_ai_quota`/`refund_ai_quota` sont **laissées en place** (aucun DROP) pour tout consommateur non migré.
- **Garde-fou non évident** : `p_cost > p_limit` est refusé **avant** l'INSERT. La branche INSERT du `ON CONFLICT` ne porte pas le prédicat du `DO UPDATE` — sans ce test, la toute première consommation de la semaine écrirait `count = p_cost` au-delà du budget.

### AUCUNE migration de schéma — et pourquoi
`usage_counters` est **inchangée**. La colonne `feature` est conservée et figée à la valeur générique **`'ai_credits'`** : la PK `(user_id, feature, period_start)` donne alors exactement **une ligne par (utilisateur, semaine)**, ce que demande le modèle. Supprimer la colonne aurait imposé un DROP/recreate de PK sur une table vivante — donc une fenêtre où des compteurs en cours pouvaient être perdus, pour un bénéfice nul.

> ⚠️ **Conséquence de bascule** : les lignes `feature='matchup_analyze'` (compteur en **nombre d'analyses**) ne sont ni migrées ni supprimées — elles deviennent **inertes**. Un utilisateur ayant déjà consommé des analyses la semaine du déploiement **repart à 0** sur le pot crédits : rien n'est perdu, mais il y a un **sur-octroi ponctuel sur cette seule semaine**. Les deux sémantiques de `count` (analyses vs crédits) ne doivent **jamais** cohabiter sur une même valeur de `feature`.

### Contrat client — le solde seul ne suffit plus
`GET` renvoie `{ used, limit, remaining, model, resets_at, costs: { quick, detailed } }`. **`costs` est indispensable** : un solde restant ne dit plus si l'action est finançable (20 crédits payent une rapide à 17, pas une détaillée à 33).

**Le booléen unique `remaining <= 0` a donc été remplacé sur les DEUX clients** par une décision par action — c'était le piège principal de ce chantier : le conserver aurait désactivé les deux boutons dès que le moins cher devenait inabordable, reproduisant exactement le défaut corrigé.
- Web : `canAfford(quota, advanced)` (`src/lib/matchup/payload.ts`, testé) → `canQuick` / `canDetailed` dans `MatchUpTab.tsx`.
- WPF : `MatchUpAnalysisResult.CanAfford(bool advanced)` → `SetAnalysisButtonsEnabled` dans `MatchUpEditorView.xaml.cs`.
- Coût **jamais transmis par le client** (patron intent→grant) : il est recalculé serveur à chaque appel.
- Message 429 différencié sur les deux clients : « Chaleur de la Forge épuisée » vs « Il te reste N braises, il en faut M pour une analyse détaillée ».
- Repli si `costs` absent (réponse d'une EF pré-crédits) : coûts à 0 → tout est considéré finançable côté client, le serveur restant l'autorité. Un faux « solde épuisé » serait plus grave qu'un 429 propre.

> **Statut : DÉPLOYÉ EN PRODUCTION le 2026-07-31** — commits `ea86417` (prompt V2 + `max_tokens=1400`) et `7a9c283` (plafond Maître 4/sem), poussés sur `main`, run GitHub Actions `30637694396` vert (`Deployed Functions on project …: matchup-analyze`). Scripts de mesure rejouables dans le scratchpad de session (`measure-matchup-cost.mjs`, `measure-prompt-v2.mjs`, `verify-v2-realstats.mjs`, `measure-final.mjs`).

#### Instrumentation prod à poser (non faite)
`supabase/functions/matchup-analyze/index.ts:244-249` — `doc.usage` est disponible et actuellement **jeté**. Un `console.log` structuré (`model`, `advanced`, `tier`, `in_tok`, `out_tok`, `stop_reason`) y donne le **taux de troncature réel en prod**, la métrique qui tranchera le `max_tokens` cible. Pas de `user_id` (le `tier` suffit au budget, et évite d'inscrire une donnée nominative dans les logs). `console.log` plutôt qu'une table : zéro migration, zéro RLS, zéro latence sur le chemin payant.

### Offline support (To-Do Lists)
**Décision** : implémenter quand l'app desktop existera — inutile avant d'avoir les deux clients.

**Architecture prévue :**
- **Dexie.js** (wrapper IndexedDB) comme store local
- Flux : écriture locale immédiate → sync Supabase en arrière-plan
- Hors ligne : opérations mises en file d'attente dans une table `pending_ops` (IndexedDB)
- Retour en ligne : détection via `navigator.onLine` + event `online` → replay de la file dans l'ordre
- Conflits : stratégie **last write wins** basée sur `updated_at` (suffisant pour des listes perso)

---

### API Riot
- **Personal API Key validée** par Riot — plus de renouvellement quotidien.
- Stockée dans **Supabase secrets** (`RIOT_API_KEY`), jamais dans le code ni
  dans les .env Vercel. Toutes les requêtes Riot passent par des Edge
  Functions Supabase qui font office de proxy.
- Edge Functions actives : `riot-rotation`, `riot-matches`, `riot-match-detail`,
  `riot-rank`, `riot-live-game`, `riot-link-init`, `shop-purchase`, `quest-claim`, `quest-status`, `detail-quota`, `matchup-analyze`. Déploiement auto via GitHub Action sur push.
- `detail-quota` (F3 Lot 2) : quota anonyme de consultation du **détail** d'un match, SÉPARÉ du limiteur de recherche (Lot 1). `verify_jwt = false`, public. Clé `rate:detail:ip:{ip}` (dictionnaire `matchId→ts`, 10 matchs DISTINCTS/IP/h, fenêtre glissante) — cf. `_shared/ip-rate-limit.ts` (`peekDetailRateLimit`/`commitDetailRateLimit`/`riotCacheDetailBackend`). ⚠️ Ces limiteurs IP détournent `riot_cache` comme KV : tout nouveau `function_name` DOIT être ajouté à la contrainte `riot_cache_function_name_check` (sinon `23514` silencieux avalé par le fail-open des backends → compteur jamais persisté). Ajoutés par la migration `20260719000001` : `'public-search'` (Lot 1) + `'detail-quota'` (Lot 2). Deux actions : `GET` → PEEK (lecture seule, alimente l'affichage « X/10 ») ; `POST { matchId }` → COMMIT (réserve un créneau, **idempotent par match** dans la fenêtre → re-vue gratuite ; 429 si budget épuisé + match neuf). Aucune donnée Riot touchée.
  - ⚠️ **DEUX contraintes distinctes à tenir synchronisées** : `riot_cache_function_name_check` (le KV détourné par les limiteurs IP) **ET** `riot_rate_limits_function_name_check` (le limiteur atomique `isRateLimited`, `_shared/rate-limit.ts`, qui appelle `fn_riot_rate_increment`). Elles avaient divergé (public-search/detail-quota ajoutées à `riot_cache` par `20260719000001` mais jamais à `riot_rate_limits`) — c'est cette divergence qui produit la classe de bug ci-dessus. La migration `20260728000001` (socle `riot-live-game`) les réaligne sur la même liste de 9 valeurs et **corrige explicitement** une affirmation périmée de `20260719000001` (« riot_rate_limits N'est PAS concernée ») : ce n'était vrai que pour les limiteurs KV de l'époque, pas pour une EF future qui appellerait `isRateLimited()` sous un nouveau nom. Toute nouvelle EF utilisant `isRateLimited()` doit ajouter son nom aux DEUX contraintes.
  - **Câblage** : `/matches/[region]/[riotId]` (public) peek au chargement + bouton « Voir tous les détails » par match affichant le quota restant → COMMIT au clic puis navigation (connecté = illimité, aucun peek/compteur). La page `/match/[platform]/[matchId]` est désormais **accessible aux non-connectés** : anonyme → COMMIT au chargement (idempotent : gratuit si le bouton a déjà réservé le match → **pas de 429 surprise**), 429 → message « quota atteint, connecte-toi » ; connecté → accès illimité (highlight profil + rang inchangés).
- ⚠️ **Piège backend — validation PUUID dans `riot-matches`** (résolu 23/06/2026) : la fonction accepte `?puuid=` OU `?gameName=&tagLine=`. La regex `PUUID_RE` validait à l'origine un **UUID v4 (36 car., format `8-4-4-4-12`)** — or ce format est précisément le **GUID anonymisé du LCU**, PAS un vrai PUUID Riot (**78 car.**, charset `[A-Za-z0-9_-]`). Conséquence : tout appel `?puuid=` avec un vrai PUUID renvoyait `400 {"error":"Format PUUID invalide."}`. Le chemin `gameName/tagLine` n'était PAS touché (le puuid y est résolu côté serveur via account-v1 et n'est jamais soumis à `PUUID_RE`), d'où un bug **latent** : le site n'utilise que le chemin Riot ID, et le 1er consommateur `?puuid=` (app WPF `WyrmBackendService.GetMatchIdsByPuuidAsync`) l'a révélé. **Correctif** : `PUUID_RE = /^[A-Za-z0-9_-]{70,128}$/` (charset borné → anti path-injection ; le puuid est en plus `encodeURIComponent`'d avant l'appel Riot). **Règle** : toute validation de PUUID côté backend cible ce format, JAMAIS un UUID.
- `riot-rank` accepte désormais aussi **`?puuid=&platform=`** (Lot C, en plus du chemin historique `?gameName=&tagLine=&platform=`) — premier consommateur : `riot-live-game` (le WPF n'a que le puuid sous la main pendant une partie en cours, pas de Riot ID). Même regex `PUUID_RE = /^[A-Za-z0-9_-]{70,128}$/` que `riot-matches` (jamais un UUID v4 — piège ci-dessus).
  - **Asymétrie de contrat volontaire** : le chemin puuid répond `{ puuid, entries }` **SANS** `summonerId`/`profileIconId`/`summonerLevel` (présents uniquement sur le chemin Riot ID historique). Le front ne doit JAMAIS supposer ces champs présents sur une réponse obtenue via `?puuid=` — sans incidence connue, `riot-live-game` obtient déjà `profileIconId` via spectator-v5.
  - **Résolution en 2 appels Riot** (`summoner-v4 by-puuid` → `league-v4 by-summoner`, isolés dans `fetchRankEntriesByPuuid`), **pas** le raccourci 1-appel `league-v4 entries/by-puuid` — non confirmé par une doc présente dans le repo, donc non implémenté à l'aveugle. Le passage à 1 appel est prévu comme un changement d'UNE ligne dans `fetchRankEntriesByPuuid` le jour où l'endpoint est vérifié.
  - ⚠️ **COUPLAGE CACHÉ `riot-rank` ↔ `_shared/harvest-rank-stats.ts`, À NE JAMAIS CASSER** : `harvestRankStats` (appelée depuis `riot-matches`) reconstruit littéralement la clé de cache `rank:{platform}:{gameName.toLowerCase()}:{tagLine.toLowerCase()}` écrite par `riot-rank` pour lire le tier du joueur sans appel Riot supplémentaire — aucune constante partagée, aucun test. Si cette clé cesse de correspondre, `rank_stat_samples` cesse silencieusement de se remplir (aucune erreur visible, juste `get_rank_avg()` qui reste sous son seuil de 50 samples → dégradation muette de la Vue B de `/summoner`). Stratégie **dual-write / dual-read** retenue pour introduire le pivot par puuid sans casser ce couplage : sur le chemin Riot ID, `riot-rank` écrit désormais **deux** clés avec le même corps — la clé historique (INCHANGÉE au caractère près) ET `rank:{platform}:puuid:{puuid}` (purement additif) ; `harvestRankStats` lit la clé puuid **en premier**, avec repli sur la clé historique si absente. Sur le chemin `?puuid=` lui-même, seule la clé puuid est lue/écrite — le Riot ID y est inconnu par construction, la clé historique n'est **jamais** devinée ni écrite depuis ce chemin.
- 🔴 **PANNE RÉSOLUE (28/07/2026) — `league-v4/entries/by-summoner` retiré par Riot** : `riot-rank` échouait à **tous** les coups en `403`. Cause racine : `summoner-v4 by-puuid` répond toujours `200` mais **ne renvoie plus le champ `id`** → `summonerId = ''` → l'URL construite devenait `.../entries/by-summoner/` (segment vide) → `403`. Diagnostic établi par le **delta de `riot_daily_quota.calls_by_function`** (+3 sur le chemin Riot ID, +2 sur le chemin puuid ⇒ l'échec est au dernier appel de la chaîne, pas au premier), puis confirmé par un `summonerId: ""` dans la réponse après correctif.
  - **Amplification** : un `403` n'est **pas** mémorisé (le cache négatif est réservé aux `404`), donc chaque consultation repartait en appel Riot. Le quota journalier de 1000 a été **brûlé intégralement les 24 et 25 juillet** (`riot-rank` : 810 puis 978 appels), ouvrant le circuit breaker → **tout le site en 503**. Leçon : une EF qui échoue sans mémoriser son échec est un amplificateur de panne, pas seulement une fonctionnalité cassée.
  - **Effet collatéral silencieux** : la clé `rank:{platform}:{gn}:{tl}` n'étant jamais écrite, `harvestRankStats` sortait immédiatement → **`rank_stat_samples` est resté à 0 ligne depuis l'origine** → `get_rank_avg()` toujours sous son seuil de 50 samples → Vue B de `/summoner` jamais fonctionnelle. Personne ne l'avait vu : aucune erreur n'est levée sur ce chemin.
  - **Correctif** : `league-v4/entries/by-puuid/{puuid}` sur les **deux** chemins de `riot-rank`. Le chemin `?puuid=` passe ainsi de 2 à **1 seul appel Riot** (le coût d'une page live game à 10 joueurs tombe de 21 à **11 appels**). `summoner-v4` reste appelé sur le chemin Riot ID uniquement, pour `profileIconId`/`summonerLevel`.
  - ⚠️ **Règle** : Riot retire progressivement toutes les variantes par `summonerId`. Toute nouvelle intégration league-v4/spectator cible les variantes **`by-puuid`**. Ne jamais se fier à `summoner.id`, désormais absent.
- 🟡 **Dettes fonctionnelles ACCEPTÉES du cache Riot (relecture sécurité du fix R1/R2, commit `d701fed`)** — ce ne sont PAS des bugs à corriger par réflexe, mais des compromis documentés :
  - **#2 — cache négatif `riot-match-detail` vs 404 transitoire (TTL 5 min)** : `riot-match-detail` mémorise tout 404 upstream pendant **5 min** (préfixe `neg:`, rejeu gratuit). Or un match **tout juste terminé** peut 404 brièvement sur match-v5 le temps que Riot le rende disponible (délai de pipeline), **même sur la bonne région**. Conséquence : un joueur qui consulte sa partie immédiatement après la fin peut voir « introuvable » jusqu'à **5 min**. Le commentaire « le match n'existe pas » dans le code est donc optimiste (un 404 match-v5 n'est pas strictement déterministe). **Accepté** pour l'instant. **Piste si ça devient gênant** : TTL négatif plus court (**60-90 s**) spécifiquement pour `riot-match-detail` (les 404 `account-v1` de `riot-matches`/`riot-rank`, eux, sont déterministes → 5 min OK).
  - **#3 — décalage cosmétique en frontière de page du cache paginé `riot-matches`** : le cache est indexé par **pages fixes de 10** (`matches:v2:${routing}:${ident}:p10_{idx}`, TTL 3 min), chaque page cachée **indépendamment**. Pour une lecture **multi-pages** (`count > 10`, ex. le chemin `count=20` de StatsTab/WPF/prac), si une partie se termine **dans la fenêtre TTL entre le fetch de deux pages adjacentes**, la concaténation peut **dupliquer ou omettre un match** à la frontière `p10`. Impact **cosmétique** (un doublon/trou dans une liste de 20), fenêtre ≤ 3 min, **jamais** sur `count ≤ 10` (mono-page). **Accepté** — non bloquant.
- `riot-rotation` : rotation gratuite des champions (GET, public, `verify_jwt = false`). Proxy vers `champion-rotations` + cache `riot_cache`.
  - ⚠️ **Contrat de données normalisé (bug résolu 13/07/2026)** : l'upstream renvoie la réponse avec les clés **`{ sr, newplayer }`**, alors que le front (`AccueilTab.tsx`) lit **`freeChampionIds`**. Sans normalisation, `data.freeChampionIds` est `undefined` → `undefined.map()` throw → `catch { setRotation([]) }` → rotation vide → message trompeur **« clé API non configurée ou expirée »** (chaîne statique du front, PAS un vrai signal backend — le front jette `res.status`/`data.error`). Le symptôme n'accusait PAS la vraie cause : clé présente et valide (200 + vrais IDs). **Correctif** : l'EF normalise désormais `freeChampionIds ← raw.freeChampionIds ?? raw.sr`, idem `freeChampionIdsForNewPlayers ← raw.newplayer` (fallback `[]`), donc robuste que l'upstream renvoie l'un OU l'autre format.
  - ❓ **QUESTION OUVERTE — à investiguer séparément (non bloquant)** : le format `{ sr, newplayer }` **n'est PAS** le format documenté officiel de Riot pour `champion-rotations-v3` (`{ freeChampionIds, freeChampionIdsForNewPlayers, maxNewPlayerLevel }`). L'endpoint interrogé (`https://{platform}.api.riotgames.com/lol/platform/v3/champion-rotations`) est pourtant bien l'URL Riot officielle, et l'appel renvoie 200 avec des IDs de champions plausibles, **identiques sur toutes les régions** (cohérent avec une rotation globale). Origine réelle du format abrégé non élucidée (mock/proxy quelque part ? variante d'API ?). Le fix par fallback fonctionne dans les deux cas, mais **confirmer un jour que la donnée servie est bien la vraie rotation courante** (et non une fixture figée) — ne pas perdre ce point de vue.
  - **Cache hebdomadaire (13/07/2026)** : la rotation change 1×/semaine, le mardi (heure US). L'API n'expose **aucun timestamp de fin** (réponse limitée à `sr`/`newplayer` — vérifié ; le v3 standard n'en expose pas non plus) → impossible de caler le TTL sur la donnée réelle. Approximation assumée : `cacheSet` reçoit une expiration explicite `nextRotationExpiryIso()` = **prochain mardi 12:00 UTC** (≈ 1 appel Riot/semaine). Limite : si Riot décale exceptionnellement le jour, retard possible jusqu'au mardi suivant (documenté en tête de `riot-rotation/index.ts`). `cacheSet(key, fn, body, expiresAtIso?)` : 4ᵉ param optionnel générique pour forcer une expiration calculée.
- `patch-notes-generator` : génère un résumé FR via Claude (déclenchement : pg_cron quotidien + bouton admin) — auth double : JWT admin OU `X-Internal-Token: <PATCH_CRON_SECRET>`
  - Secrets Supabase requis : `ANTHROPIC_API_KEY` (clé Anthropic), `PATCH_CRON_SECRET` (token cron), `SUPABASE_SERVICE_ROLE_KEY` (automatique)
  - Modèle épinglé : `claude-sonnet-4-6`
  - Retourne `{ skipped: true }` si le patch est déjà en base (protection contre les doubles appels)
- `patch-notes` : lecture publique des patch notes publiés (site + app desktop) — `verify_jwt = false`
- `shop-purchase` : achat d'un cosmétique (POST, JWT obligatoire) — body `{ cosmetic_id: number }`. Vérifie `shop_enabled` via `isFeatureEnabled` avant le JWT, appelle `purchase_cosmetic` SECURITY DEFINER via service_role. Codes HTTP : 402 solde insuffisant, 404 cosmétique indisponible, 409 déjà possédé, 403 boutique désactivée.
  - ⚠️ **Pas d'`app_event` dans `shop-purchase`** : `shop-purchase` ne doit PAS émettre d'app_event (notamment `cosmetic_purchased`). Décision actée : la quête `app_buy_cosmetic` a été écartée (incitation perverse — dépenser des Écailles pour en regagner moins), donc aucun consommateur n'existe pour cet événement. Ne pas instrumenter, même si un ancien plan le mentionne.
- `quest-claim` : réclamation d'une quête journalière (POST, JWT obligatoire) — body `{ quest_slug: string }`. Flow : `quests_enabled` flag → **rate limit IP** → auth → chargement pool complet → **garde-fou set du jour** (`selectDailySet`) → dédup préventif → vérification action data-driven (dispatch sur `criteria.type`) → `finalize_quest_claim` SECURITY DEFINER. Codes HTTP : 400 condition non remplie, 403 flag off / pas de compte Riot lié / quête hors set, 404 quête inconnue, 409 déjà réclamée, 429 rate limit Riot/IP.
  - Logique `criteria.type` : `'play'` (count matchs), `'win'` (count victoires, break-early), `'cs'` (threshold CS, break-early), `'app_event'` (count app_events du jour).
  - `resolveQueue(queue)` : `420` → `[420]`, `440` → `[440]`, `"ranked"` → `[420, 440]`, défaut → `[420]`.
  - `fetchMatchIds` : appels Riot en parallèle si multi-queue, IDs dédupliqués.
  - Réponse succès : `{ success: true, quest_name, reward, capped: false }`. Réponse plafond : `{ success: false, capped: true, reward: 0 }` (HTTP 200, pas d'erreur rouge côté client).
  - `riot-match-detail` logue `event_type='match_viewed'` dans `app_events` (fire-and-forget, uniquement si JWT présent) — alimente la vérification de `app_view_match`.
- `quest-status` : lecture de l'état des quêtes du jour (GET ou POST, JWT obligatoire). Retourne `{ day, streak, earned_today, cap, quests[] }` avec `completed_today` et `progress` par quête. Le flag `quests_enabled` N'est PAS vérifié — lecture pure disponible même quand les quêtes sont off. Quatre requêtes DB en parallèle (`quest_definitions` pool_eligible + `quest_completions` + `quest_streaks` + `app_settings` cap). `streak` = null si jamais de complétion. `earned_today` = somme des rewards des complétions du jour. `progress` = `{ current, target }` pour les quêtes `app_event` (lecture `app_events`), `null` pour les quêtes `lol` (pas d'appel Riot). Consommé par le dashboard web (M7) et le futur overlay desktop.
- `matchup-analyze` (MatchUp — analyse IA, chantier clos 2026-07-21) : proxy Anthropic **serveur** pour l'analyse d'un match up (POST, **`verify_jwt = true`** — JWT obligatoire, à la différence des EF Riot). La clé `ANTHROPIC_API_KEY` reste **côté serveur, jamais exposée au client** (le WPF appelait l'API Anthropic en direct → supprimé). Body `{ advanced: boolean, scenario: { mode, allies[], enemies[] } }` (champ = `{ name, level, stats?: [{label,value}], build?: string[], role?: 'TOP'|'JUNGLE'|'MID'|'ADC'|'SUPPORT' }` — `role` **optionnel**, absent/inconnu ⇒ prompt identique à l'ancien format ; envoyé par les deux clients depuis 2026-07-23, cf. §MatchUp Web). Reconstruit le prompt **côté serveur** (miroir de l'ancien `BuildPrompt` WPF) → le client n'envoie que des données structurées, jamais le prompt.
  - **Gating par tier** (mapping `tier → { budget hebdo EN CRÉDITS, modèle }` **dans l'EF**, PAS en DB — les fonctions SQL ne connaissent pas les tiers, elles reçoivent `p_limit` calculé) : Apprenti 15 cr + Haiku, Forgeron 65 cr + Haiku, Maître/Légion 135 cr + Sonnet, admin 1000 cr + Sonnet. Tier inconnu/absent → plancher Apprenti. Modèles épinglés : `claude-haiku-4-5` / `claude-sonnet-5`. Voir § Chaleur de la Forge.
  - **Quota atomique** — table `usage_counters` + deux fonctions SECURITY DEFINER (migration `20260720000001`, service_role only, aucune écriture client) : `consume_ai_quota(user, feature, limit)` réserve un slot en **une seule instruction** (`INSERT … ON CONFLICT DO UPDATE SET count=count+1 WHERE count < limit RETURNING count` + `pg_advisory_xact_lock` → aucune fenêtre TOCTOU ; renvoie `NULL` = plafond atteint, zéro écriture) ; `refund_ai_quota(user, feature)` rend le slot **uniquement si l'appel Anthropic échoue** (jamais de débit sur une panne serveur). Fenêtre = semaine calendaire **lundi 00:00 UTC** (`date_trunc('week', now() at time zone 'UTC')::date`). RLS SELECT self-only (affichage du compteur).
  - **Flow POST** : auth → lecture `tier`/`role` (`profiles`) → mapping → `consume_ai_quota` → `NULL` ⇒ **429** `{ over_quota:true, used, limit, remaining:0, resets_at }` (aucun appel payant) ; sinon appel Anthropic → échec ⇒ `refund_ai_quota` + **502** ; succès ⇒ `{ analysis, model, advanced, truncated, used, limit, remaining, resets_at }`. `truncated = (stop_reason === 'max_tokens')` — avertissement remonté explicitement, jamais de troncature muette.
  - **GET** : état du quota de la semaine (`{ used, limit, remaining, model, resets_at }`) **sans rien consommer** — alimente l'affichage « X/N ».
  - Codes : 200 · 400 (payload) · 401 (JWT) · 405 · 429 (plafond hebdo) · 502 (Anthropic KO) · 500. Secret requis : `ANTHROPIC_API_KEY` (partagé avec `patch-notes-generator`).
  - Consommateurs : **app WPF** `ClaudeService` → `WyrmBackendService.PostFunctionAsync`/`GetFunctionRawAsync` (voir AGENTS.md WPF) **ET site web** `src/lib/matchup/api.ts` (`analyzeMatchup`/`getQuota`) depuis l'onglet Match Up. **Aucune modification serveur** n'a été nécessaire pour brancher le 2ᵉ client (voir §MatchUp Web) — preuve que le patron proxy+quota est réutilisable tel quel.
  - 🔁 **PATRON RÉUTILISABLE pour Post Game** (analyse IA post-partie, encore à cadrer) : réutiliser **tel quel** le trio EF `verify_jwt=true` + proxy Anthropic serveur + `usage_counters`/`consume_ai_quota`/`refund_ai_quota`, avec un **nouveau `feature`** (ex. `'postgame_analyze'`) et le mapping tier→modèle/limite dans l'EF. **Ne PAS réinventer l'infra de quota** — seuls la `feature`, le barème (voir §Modèle freemium : Post Game 3/9/∞) et le prompt changent.
- `tournament-register` : inscription publique d'une équipe (POST, JWT optionnel) — body `{ tournament_id, team_name, players[2] }`. Rate limit IP. Validation complète des inputs (UUID, nom, riot_pseudo, discord_pseudo). Vérifie `status = 'registration'` et `count(pending+validated) < max_teams`. INSERT `tournament_teams` + `tournament_players` via service_role. Codes HTTP : 400 validation, 403 tournoi non ouvert, 409 complet/nom pris, 429 rate limit, 201 succès.
- `tournament-admin` : actions d'administration d'un tournoi (POST, JWT obligatoire — vérifié DANS LE CODE, `verify_jwt = false` dans config.toml) — body `{ action, tournament_id, ... }`. Vérifie `created_by === user.id OR is_admin()`. Les RPC SECURITY DEFINER (`seed_bracket`, `start_match`, `report_match_result`, `undo_match_result`) sont appelées via `userDb` (client JWT utilisateur) car elles utilisent `auth.uid()` en interne. Actions : `open_registration`, `close_registration`, `validate_team`, `reject_team`, `seed_bracket`, `start_match`, `report_result`, `undo_result`, `set_status`. Codes HTTP : 400 état/payload invalide, 401 JWT absent, 403 non autorisé, 404 tournoi/match non trouvé, 409 conflit.
- `riot-live-game` (Lot B, socle DB déjà livré par la migration `20260728000001`) : composition de la **partie en cours** d'un joueur (spectator-v5), public, `verify_jwt = false`, gardée par le feature flag `live_game_enabled` (`app_settings`, kill-switch, off par défaut → **403** tant que non activé).
  - **Contrat d'entrée** : `?puuid=&platform=` (canonique) OU `?gameName=&tagLine=&platform=` (confort). Même `PUUID_RE` que `riot-matches` (jamais un UUID v4 — piège documenté ci-dessus).
  - **Endpoint Riot** : `GET https://{platform}.api.riotgames.com/lol/spectator/v5/active-games/by-summoner/{puuid}` — endpoint **plateforme** (pas régional comme account-v1). ⚠️ Le segment s'appelle `by-summoner` mais prend en réalité un **PUUID**, pas un summonerId — piège de nommage hérité, ne pas s'y tromper.
  - **Décision 1 — « pas en partie » = 200 porteur, jamais 404** : c'est l'état nominal d'un joueur, pas une erreur (`{ in_game: false, requested_puuid }`). Spectator-v5 renvoie lui-même un 404 upstream aussi bien pour « pas en partie » que pour « puuid inconnu » (Riot ne distingue pas les deux) — sans conséquence ici, car côté chemin puuid l'existence n'est de toute façon jamais vérifiée, et côté chemin Riot ID elle l'a déjà été par account-v1 juste avant. Le vrai 404 client (`{ error: 'Invocateur introuvable.' }`) ne peut venir QUE d'account-v1 (Riot ID inexistant), jamais de spectator-v5.
  - **Décision 2 — TTL variable, jamais le fallback de `TTL_MS`** : 30s si `in_game:false` ou écran de chargement (`game_start_time === 0`), 5 min si en partie (donnée spectator immuable une fois la game lancée). Toujours passé explicitement via le 4ᵉ paramètre `expiresAtIso` de `cacheSet` — l'entrée `TTL_MS['riot-live-game']` (30s) n'est qu'un filet de sécurité si un futur appel omettait ce paramètre.
  - **Décision 3 — mutualisation par partie** : sur MISS, la réponse Riot contient les 10 participants → le MÊME corps (strictement centré partie, **sans** `requested_puuid`) est écrit sous les 10 clés `live:{platform}:puuid:{puuid}` + une clé `live:{platform}:game:{game_id}` (observabilité). Un seul appel Riot couvre donc les 10 joueurs. `requested_puuid` est ajouté **à la réponse**, après lecture du cache, jamais au corps stocké — sinon un joueur B recevrait un corps marqué « demandé : A ». Chemin confort (`gameName`/`tagLine`) : clé additionnelle dédiée `live:{platform}:name:{gameName}:{tagLine}` (privée à cette identité, contrairement aux clés puuid/game) permettant un HIT total (0 appel Riot, même pas account-v1) sur une requête répétée.
  - **Ordre des gardes** : CORS → feature flag (403) → validation params (400) → `isRateLimited` (429) → `checkIpRateLimit` (429, bucket `public-search` **partagé** avec `riot-matches` — `riotCacheBackend()` sans argument ; la clé réelle `rate:ip:{ip}` est câblée en dur, un `fn` différent ne changerait que la colonne `function_name`) → `cacheGet` (HIT) → `cacheGetNegative` (HIT-NEG) → `isCircuitOpen` (STALE ou 503 `quota_exceeded`) → appels Riot.
  - **Comptage quota réel** (comme `riot-matches`, aucune entrée forfaitaire dans `RIOT_CALLS`) : 1 appel sur le chemin puuid (spectator-v5 seul), 2 sur le chemin Riot ID (account-v1 + spectator-v5).
  - **`ranks: null`** en V1 — emplacement réservé pour l'enrichissement serveur futur (winrate par champion, Scope Raisonnable), même motif que le `role?` optionnel de `matchup-analyze` : rétrocompatible par construction, aucun client à redéployer le jour où le serveur le remplit.
  - ⚠️ **429 « server » de Riot ≠ notre quota** (mesuré le 2026-07-28) : le service spectator EUW1 déleste **par intermittence** (~1 appel sur 3 refusé) avec `x-rate-limit-type: server` et `retry-after` 20-30 s, **alors que la clé est très loin de ses plafonds** (SPECTATOR-V5 : 3000 req/10 s) et que le circuit breaker est fermé. Les trois types de 429 Riot n'ont pas le même sens : `application` et `method` nous incriminent, **`server` non — c'est l'endpoint saturé en amont**. Ne PAS diagnostiquer ça comme un dépassement de quota ni comme un problème de périmètre de clé. L'EF le traduit en **503 `{ reason: 'riot_busy', retry_after_s }` + header `Retry-After`** (et non en 429, qui est réservé à NOS limiteurs) et ne mémorise rien — l'état de la partie est inconnu. Le front doit reproposer l'action, pas afficher un échec dur.
  - Codes HTTP : 200 (en partie ou non) · 400 · 403 (flag off) · 404 (Riot ID inexistant) · 429 (nos limiteurs) · 503 (`quota_exceeded` circuit ouvert, ou `riot_busy` délestage Riot) · 500.
  - Non validable hors partie matchmade réelle : les parties **personnalisées** ne sont pas exposées par spectator-v5 (limite Riot, pas un bug de l'EF).

### Module partagé `_shared/daily-quests.ts`
- Export : `selectDailySet(dayStr, pool, K=3) → QuestDef[]`
- Algorithme déterministe : tri par slug → hash FNV-1a 32 bits du `dayStr` → 2 quêtes lol (≤1 `riot_detail`) + 1 quête app.
- Importé par `quest-claim` ET `quest-status` — garantit le même set au même instant sans état partagé.
- Export type : `QuestDef` (interface avec `slug`, `category`, `cost_tier`, index signature).
- L'app desktop (`Logiciel-Assistant-LOL`) consomme aussi les Edge Functions
  via `WyrmBackendService.cs` — clé Riot **plus du tout** côté client.

---

## 🟡 Contrat client normatif — `riot-live-game` (Lot D0/E0)

> ✅ **Front site (Lots D0 → D5) : LIVRÉ et CLOS (29/07/2026).** D0 contrat · D1 les 9 états · D2 `src/lib/live-game.ts` (module pur testé) · D3 composition des 2 équipes · D4 rangs + winrate des 10 joueurs · D5 point d'entrée depuis `/summoner` (`?puuid=`, 12 → 11 appels). Détail par lot : § Pages publiques, ligne `/live/[region]/[riotId]`. **Le Lot E (app WPF) reste À FAIRE** — ce bloc en demeure la spécification normative, il ne doit pas être allégé ni « nettoyé » parce que le site est fini : c'est précisément ce texte qui garantit la parité du second client, écrit dans un dépôt qui ne partage aucun code avec celui-ci.
>
> **Ce bloc est LA source de vérité du contrat client de `riot-live-game`.** La page « Live Game » sera implémentée **deux fois**, dans deux dépôts qui ne partagent aucun code (site Next.js — Lot D ; app WPF C# — Lot E, renvoi court dans son `AGENTS.md`). La parité s'obtient par **spécification**, pas par du code partagé — exactement le patron déjà éprouvé pour MatchUp (`ClaudeService.cs` ↔ `src/lib/matchup/payload.ts`). Tout nom de champ ci-dessous est vérifié contre `supabase/functions/riot-live-game/index.ts` — en cas de divergence future entre ce texte et le code, **le code fait foi**.

### A. Contrat de réponse

Trois formes, aucun champ inventé (copie stricte des types `GameBody` / `NotInGameBody` / `Participant` de l'EF) :

**200 — en partie :**
```ts
{
  in_game: true,
  game: {
    game_id: number
    platform_id: string
    queue_id: number            // gameQueueConfigId ?? 0
    map_id: number
    game_mode: string            // ex. "CLASSIC", "ARAM"
    game_type: string
    game_start_time: number      // epoch ms — 0 = écran de chargement, voir §C
    game_length_s: number        // ⚠️ FIGÉ par le TTL cache (jusqu'à 5 min) — voir §C, ne JAMAIS afficher brut
    banned_champions: Array<{ champion_id: number, team_id: number, pick_turn: number }>
  },
  participants: Array<{
    puuid: string
    riot_id: string               // peut être '' — voir §C
    team_id: number                // 100 | 200 — TABLE CRITIQUE, voir §B
    champion_id: number
    spell1_id: number
    spell2_id: number
    profile_icon_id: number
    perks: { perk_ids: number[], perk_style: number, perk_sub_style: number }
    bot: boolean                   // voir §C
  }>,
  ranks: null,                     // TOUJOURS null en V1 — voir §C
  requested_puuid: string,         // ajouté APRÈS lecture du cache, jamais stocké dans le corps partagé
}
```

**200 — pas en partie (état NOMINAL, PAS un 404) :**
```ts
{ in_game: false, requested_puuid: string }
```
C'est l'état le plus fréquent (la majorité des joueurs, la majorité du temps) — jamais traité comme une erreur, jamais rouge à l'écran (voir §E).

**Erreurs** — le corps est toujours `{ error: string, ...détails }` :

| Statut | `reason` | Corps additionnel | Déclencheur |
|---|---|---|---|
| 400 | — | — | param manquant, région invalide, ou PUUID mal formé |
| 403 | — | — | `live_game_enabled = false` (kill-switch, `app_settings`) |
| 404 | — | — | Riot ID inexistant, **account-v1 SEUL** — jamais depuis spectator-v5 (voir §C) |
| 429 | — | `retry_after_s` (2ᵉ limiteur seulement) | nos limiteurs (`isRateLimited` / `checkIpRateLimit`) |
| 503 | `quota_exceeded` | `resets_in` (secondes avant minuit UTC) | notre circuit breaker ouvert (quota Riot journalier épuisé) |
| 503 | `riot_busy` | `retry_after_s` | délestage **de Riot lui-même** (spectator EUW1, transitoire) |
| 500 | — | — | exception serveur inattendue |

### B. ⚠️ TABLE CRITIQUE — `team_id`

| `team_id` | Vocabulaire Live Client Data (WPF) | Couleur écran |
|---|---|---|
| `100` | `ORDER` | Bleu |
| `200` | `CHAOS` | Rouge |

**Pourquoi cette table est la plus critique du contrat.** Côté site, `team_id` n'est qu'une couleur d'affichage — une inversion produirait une carte bleue à droite au lieu de gauche, visible et anodin. **Côté WPF, `team_id` est la clé de jointure des rangs** : le client résout le rang de chaque participant via des appels séparés à `riot-rank`, puis doit rattacher chaque rang résolu au bon joueur affiché. La jointure se fait sur **`(champion_id, team_id)`**, jamais sur `riot_id` (voir §C — `riotIdTagLine` n'est **pas** exposé sur `/playerlist`, seulement sur `/activeplayer`, donc indisponible pour désigner un participant distant depuis spectator-v5).

Une inversion de `team_id` dans ce contexte **n'entraîne aucun plantage** — c'est le seul bug de ce chantier qui produit des données **fausses ET plausibles** : chaque joueur affiche un rang crédible (Or, Platine, Diamant…), simplement celui du mauvais adversaire. Aucun test manuel superficiel ne le détecte ; seule une vérification champion par champion contre le client Riot le révèle.

### C. Valeurs dégénérées — comportement obligatoire pour les deux fronts

- **`riot_id: ''`** (possible, cf. `mapGameBody` — `p.riotId ?? ''`) → repli d'affichage sur le **nom du champion**, jamais une ligne vide. Côté WPF : ne **jamais** l'utiliser comme clé de jointure (voir §B), seulement en confirmation opportuniste si non vide.
- **`game_start_time: 0`** → écran de chargement : afficher « En chargement » (ou équivalent), **jamais** un chrono à 00:00.
- **`game_length_s` est FIGÉ** par le TTL de cache (30 s en chargement/pas-en-partie, **5 min** en partie) → **ne jamais l'afficher brut**, la valeur est datée du moment du dernier MISS serveur. Les deux fronts calculent l'écoulé **depuis `game_start_time`** côté client (horloge locale). Côté WPF, `LiveGameService.GetGameTime()` (Live Client Data locale, si le joueur observe sa propre partie) est encore préférable quand disponible. Le chrono affiché ne doit **jamais être négatif** — clamp à 0 si l'horloge client est en avance sur le serveur.
- **`ranks: null`** → toujours `null` en V1, emplacement réservé pour un enrichissement serveur futur (Scope Raisonnable, winrate par champion). Les deux clients **doivent le lire défensivement dès maintenant** (`?? fallback`, jamais `ranks.foo` non gardé) pour n'avoir jamais besoin d'être redéployés le jour où le serveur le remplit — même motif que le `role?` optionnel de `matchup-analyze`.
- **`bot: true`** → étiqueter explicitement le participant (ex. badge « IA ») — les bots n'ont pas de rang réel, ne pas tenter de leur résoudre un rang via `riot-rank`.
- **`banned_champions` vide** (aveugle, ARAM, tout mode sans bans) → **masquer le bloc entièrement**, jamais afficher un bloc « Bans » vide.

### D. Tables de libellés normatives

> Une seule liste par dépôt. Ne pas la recopier deux fois dans le même dépôt — si un futur écran a besoin des mêmes libellés, réutiliser la constante déjà posée pour Live Game (site) ou celle déjà posée pour Live Game (WPF), ne pas en écrire une troisième.

#### `queue_id` → libellé FR

⚠️ **Trois versions divergentes existaient déjà dans ce repo** avant ce contrat : `src/app/summoner/[region]/[riotId]/page.tsx` (~l.20), `src/app/match/[platform]/[matchId]/page.tsx` (~l.28), `src/lib/prac.ts` (~l.47) — trois `Record<number,string>` distincts, ni les mêmes clés ni les mêmes libellés (ex. `"Classée Solo/Duo"` vs `"Solo/Duo"` ; `400`/`430` fusionnés en `"Normale"` dans `prac.ts` mais distingués ailleurs ; `700` Clash présent **seulement** dans `prac.ts` ; `1020`/`1400`/`1900` présents **seulement** dans la page match). Cette dette n'est **pas corrigée ici** (hors périmètre D0/E0, documentation uniquement) — la liste ci-dessous est la référence **pour Live Game uniquement**, construite en fusionnant les trois sources (libellés les plus complets retenus) :

| `queue_id` | Libellé FR retenu |
|---|---|
| `0` | Personnalisée |
| `400` | Normale Draft |
| `420` | Classée Solo/Duo |
| `430` | Normale Aveugle |
| `440` | Classée Flex |
| `450` | ARAM |
| `700` | Clash |
| `900` | URF |
| `1020` | Légendes Uniques |
| `1400` | Ultime Spellbook |
| `1700` | Arena |
| `1900` | URF (pick) |

Le site recopie cette liste **une fois** (nouvelle constante dédiée à Live Game, ou réutilisation si un des trois fichiers existants est refactoré — au choix de l'implémentation D, hors scope ici) ; le WPF la recopie **une fois** en C#. Ne jamais synchroniser les quatre listes entre elles après coup — c'est précisément la classe de bug que ce contrat vise à éviter pour les **futurs** écrans, la dette **existante** des trois listes site reste telle quelle.

#### `tier` LoL (rang classé) → libellé FR + couleur

⚠️ **Piège de lecture** : ne pas confondre avec les couleurs des **tiers d'abonnement Wyrm Forge** (apprenti/forgeron/maître/légion, documentées plus haut dans ce fichier § Base de données — table `profiles`). Il s'agit ici du rang **LoL** (Fer → Challenger), un concept entièrement différent qui partage juste le mot « tier ».

✅ **RÉSOLU au Lot D4** — `TIER_COLORS` / `TIER_FR` vivent désormais dans **`src/lib/lol-tiers.ts`** (source unique, testée), avec `tierColor` / `tierLabel` / `formatTier` (cette dernière n'affiche pas de division pour Maître / Grand Maître / Challenger, alors que l'API renvoie pourtant `rank: 'I'`). `src/app/summoner/[region]/[riotId]/page.tsx` et `src/app/matches/[region]/[riotId]/page.tsx` l'importent — **ne jamais réécrire ces tables ailleurs**.

> ⚠️ Correction d'une erreur de ce document : ce paragraphe affirmait que les tables existaient en **trois** exemplaires, dont un dans `src/lib/prac.ts`. C'était faux — `prac.ts` n'a jamais contenu `TIER_COLORS`/`TIER_FR`. Il y en avait **deux** (summoner + matches). Les occurrences de `TIER_COLORS` dans `AdminTab.tsx` et `app/profil/page.tsx` sont les couleurs des **tiers d'abonnement Wyrm Forge**, un concept différent (voir le piège de lecture ci-dessus) — elles ne sont PAS concernées et ne doivent pas être fusionnées.

| `tier` | Libellé FR | Couleur |
|---|---|---|
| `IRON` | Fer | `#5A5A5A` |
| `BRONZE` | Bronze | `#B87333` |
| `SILVER` | Argent | `#A8A8A8` |
| `GOLD` | Or | `#E4A800` |
| `PLATINUM` | Platine | `#4FCEAC` |
| `EMERALD` | Émeraude | `#00BA57` |
| `DIAMOND` | Diamant | `#4A90D9` |
| `MASTER` | Maître | `#9B4DCA` |
| `GRANDMASTER` | Grand Maître | `#E84057` |
| `CHALLENGER` | Challenger | `#F4E342` |

### E. Les 9 états d'interface (+ 1 sous-état)

Texte FR normatif — les deux fronts affichent EXACTEMENT ces messages (à l'interpolation des variables près) :

| # | État | Texte FR | Traitement visuel |
|---|---|---|---|
| 1 | Chargement (requête en vol) | « Recherche d'une partie en cours… » | neutre |
| 2 | `in_game:false` | « Ce joueur n'est pas en partie actuellement. » | **NOMINAL — jamais rouge**, jamais traité comme une erreur |
| 3 | 403 kill-switch | « Le suivi de partie en direct arrive bientôt. » | **non-rouge**, même famille visuelle que les onglets `soon` du dashboard — le message brut de l'EF (`La fonctionnalité "partie en cours" est actuellement désactivée.`) n'est **pas** montré tel quel au joueur |
| 4 | 404 Riot ID inexistant | « Invocateur introuvable. » (repris tel quel du backend) | erreur |
| 5 | 400 | « Requête invalide. » (ne devrait jamais survenir en usage normal — bug client si vu) | erreur |
| 6 | 429 (nos limiteurs) | « Trop de requêtes. Réessaie dans une minute. » ou, si `retry_after_s` fourni, « Trop de recherches. Réessaie dans {retry_after_s}s. » | erreur transitoire |
| 7 | 503 `quota_exceeded` | « Service temporairement indisponible. Réessaie dans {resets_in formaté, ex. "3 h"}. » | erreur transitoire (rare — quota journalier global) |
| 8 | 503 `riot_busy` | « Le service Riot est momentanément saturé. Réessaie dans {retry_after_s} secondes. » | transitoire, **aucun retry auto** (voir §F) |
| 9 | 500 / réseau | « Erreur serveur inattendue. » / « Erreur réseau, vérifie ta connexion. » | erreur |

**Sous-état « rangs partiels »** (par joueur, jamais global) : les rangs ne viennent **pas** de `riot-live-game` (`ranks` est toujours `null`, voir §C) mais de 10 appels séparés à `riot-rank?puuid=` faits par chaque client après réception de la partie. Si l'un de ces 10 appels échoue (429, 503, PUUID improbable), **seul le joueur concerné** affiche `—` à la place de son rang — les 9 autres lignes restent intactes. Ne jamais faire échouer tout l'écran pour un seul rang manquant.

### F. Règles d'appel — non négociables

- **Discriminant d'erreur = le COUPLE `(status, body.reason)`, jamais le seul statut.** Deux 503 de sens opposé : `quota_exceeded` (notre circuit breaker, tout le site est coupé, rare) vs `riot_busy` (Riot déleste lui-même, ~1 appel sur 3 mesuré sur spectator EUW1, transitoire et fréquent). Traiter les deux comme un seul cas générique « 503 » afficherait le mauvais message dans la moitié des cas.
- **`retry_after_s` et `resets_in` se lisent dans le CORPS JSON, jamais dans les headers HTTP.** `_shared/cors.ts` ne pose aucun `Access-Control-Expose-Headers` → le navigateur ne peut lire ni `Retry-After` ni `X-Cache` en JS, même si l'EF les pose bien dans la réponse. Corollaire de méthode : la vérification de la mutualisation du cache (10 joueurs → 1 appel Riot) **ne peut pas se vérifier depuis l'UI/devtools réseau côté client** — seulement via le delta de `riot_daily_quota` en base.
- **AUCUN retry automatique sur `riot_busy`.** Mesuré au STOP B (28/07/2026) : un 503 `riot_busy` **a déjà consommé un appel Riot** (la requête a atteint Riot avant d'être refusée en aval). Un retry en boucle côté client reproduirait exactement le brûlage de quota qui a mis tout le site en 503 les 24 et 25 juillet (voir § Piège backend `riot-rank` ci-dessus). Respecter `retry_after_s`, laisser l'utilisateur relancer manuellement.
- **Budget de jetons `isRateLimited`** : dans `riot-rank`, `isRateLimited` s'exécute **avant** le cache (vérifié : l.147 puis `cacheGet` l.153) → **un HIT consomme quand même un jeton**. Bucket 20/min/IP/fonction. Une consultation Live Game complète = **11 jetons** (1 appel `riot-live-game` + 10 appels `riot-rank`, un par participant) ⇒ deux chargements dans la même minute déclenchent des 429 partiels (certains rangs échouent, pas la partie elle-même). **Décision actée : verrou de 30 s côté front sur le bouton « Actualiser », pas de modification backend en V1.**
- **Coût réel (jamais un forfait)** : 1 appel Riot par chemin puuid (spectator-v5 seul), 2 par chemin Riot ID (account-v1 + spectator-v5). Mutualisation : 1 appel spectator-v5 couvre les 10 joueurs de la partie pendant le TTL (5 min).
- **Pas d'auto-poll en V1** — aucun des deux fronts ne doit re-solliciter l'EF en boucle pendant la partie ; rafraîchissement uniquement sur action utilisateur (bouton « Actualiser », verrouillé 30 s ci-dessus).
- **Kill-switch `live_game_enabled` à `'false'`** : les deux fronts gèrent le 403 comme un état normal (voir état #3 §E), jamais comme une panne.

### G. Divergences ASSUMÉES — ne pas « corriger »

- **Version DDragon** : le site prend systématiquement `versions[0]` (dernière version dynamique, cf. `src/lib/matchup/ddragon.ts`, `src/app/summoner/.../page.tsx`, etc.) ; le WPF (`LiveGameService.cs`, propre à l'indicateur de comeback) retombe sur la constante **`"14.24.1"`** si le fetch échoue. Toléré — écart cosmétique (icônes/splash légèrement datés en cas de fallback), jamais bloquant. ⚠️ **Ne pas confondre** avec `ScenarioService.MapImageUrl`, où le figeage sur `14.24.1` est **volontaire et permanent** (alignement pixel-perfect des tracés de scénario avec le site) — deux justifications totalement différentes pour la même chaîne de version.
- **`riot-rank?puuid=` ne garantit pas `summonerId`/`profileIconId`/`summonerLevel`** (asymétrie de contrat documentée plus haut, § `riot-rank`) — sans incidence pour Live Game : `profile_icon_id` est déjà présent dans chaque participant de la réponse `riot-live-game` elle-même (spectator-v5), les deux fronts n'ont jamais besoin de le redemander à `riot-rank`.
- **WPF EUW-only** (`RiotService.Platform = "euw1"` en dur) — le site gère les 11 plateformes de `ROUTING`, le WPF n'en a besoin que d'une. Pas un bug, portée volontairement réduite du client desktop.
- **Partie personnalisée ⇒ `in_game:false`** : spectator-v5 n'expose **jamais** les parties personnalisées (limite Riot, pas un bug de l'EF ni des fronts). C'est le premier réflexe de test d'un développeur qui code ce Lot (lancer une perso pour tester vite) — sans message dédié à ce cas précis, ce sera diagnostiqué à tort comme un bug d'intégration. **Les deux fronts doivent le documenter explicitement** (commentaire de code minimum) pour ne pas faire perdre ce temps à la prochaine personne qui reproduit le réflexe.

---

## 💳 Abonnements Stripe Billing — Forgeron / Maître (migration 20260909000003)

Premier paiement réel du projet. Couvre **uniquement** les deux paliers priorisés,
en **mode test Stripe** : Forgeron (3 €/mois, 30 €/an) et Maître (6 €/mois, 60 €/an).
Légion et Monarque sont **hors périmètre** — non priorisés, donc non achetables.

> ⚠️ **Ne pas confondre avec le Lot 4 du Kit sur mesure** (§ Kit sur mesure), qui
> est un `mode: 'payment'` ponctuel en deux sessions (acompte / solde). Ici c'est
> `mode: 'subscription'`, un tout autre objet Stripe et un tout autre cycle de vie.
> Les deux passeront par la **même** route de webhook : c'est pourquoi
> `checkout.session.completed` y filtre explicitement `session.mode !== 'subscription'`
> plutôt que de supposer que tout checkout est un abonnement.

### Où vit quoi

| Fichier | Rôle |
|---|---|
| `src/lib/stripe/plans.ts` | **Module PUR, testé (22 tests)** — paliers achetables, catalogue de prix, et **la politique** « quel statut Stripe donne droit à quel palier ». Aucune décision de palier ne se prend ailleurs. |
| `src/lib/stripe/server.ts` | Plomberie serveur : instance Stripe paresseuse, `requireEnv`, `SITE_URL`. `import 'server-only'`. |
| `src/lib/supabase/admin.ts` | **Le seul** client `service_role` du site. `import 'server-only'`. |
| `src/lib/stripe/checkout-intent.ts` | **Module PUR, testé (19 tests)** — l'intention d'abonnement mise en attente pendant la connexion (voir § Reprise après connexion). |
| `src/lib/stripe/subscription-view.ts` | **Module PUR, testé (23 tests)** — ce que la section « Abonnement » de `/profil` AFFICHE. Ne décide d'aucun palier : il relit ce que le webhook a écrit. |
| `src/app/api/stripe/checkout/route.ts` | POST `{ plan, period }` → `{ url }`. Ne fait **aucune** écriture. |
| `src/app/api/stripe/portal/route.ts` | POST sans corps → `{ url }` du Billing Portal. Ne fait **aucune** écriture (voir § Portail client). |
| `src/app/api/stripe/webhook/route.ts` | Signature Stripe → RPC. **Le seul** chemin qui change un palier. |
| `src/components/dashboard/CheckoutReturn.tsx` | Bandeau d'attente au retour de Stripe (voir § Étape 4). |
| `src/app/profil/page.tsx` → `SubscriptionSection` | Section « Abonnement » : palier, échéance, incident de paiement, bouton de portail. |
| migration `20260909000003` | Table `stripe_subscriptions` + RPC `stripe_apply_subscription_event`. |

### ⚠️ Deux vocabulaires de palier, et il faut les distinguer

| Forme | Où | Exemple |
|---|---|---|
| `PlanKey` — **ASCII, minuscule** | corps JSON, `metadata` Stripe, noms de variables d'env | `maitre` |
| `profiles.tier` — **valeur réelle, accentuée** | base, partagée avec l'app WPF | `maître` |

`TIER_BY_PLAN` (`plans.ts`) fait la conversion, **une seule fois**. La clé ASCII
existe parce qu'elle voyage : un accent survit mal à un encodage d'URL, à une clé
`metadata` Stripe et à un nom de variable d'environnement sous Windows.
`landing.test.ts` verrouille la correspondance `PRICING_TIERS[i].plan` ↔ `name` :
sans ce test, « Maître » pourrait vendre un abonnement `forgeron` sans que rien ne
proteste, ni au typage ni à l'exécution.

### Variables d'environnement (Vercel + `.env.local`)

Aucune n'est en dur nulle part. `.env*` est couvert par `.gitignore` ; le gabarit
commenté vit en queue de `.env.local` (non versionné).

| Variable | Portée | Note |
|---|---|---|
| `STRIPE_SECRET_KEY` | serveur | Le **mode** (test/live) en est DÉDUIT — `stripeMode()`, jamais un drapeau `STRIPE_MODE` séparé. Même raisonnement qu'`isTestDatabase` : un drapeau peut diverger de la clé qu'il prétend décrire. |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | **navigateur** | Déclarée pour la complétude de la config. **Aucun code ne la lit aujourd'hui** : Checkout est une redirection pleine page, elle ne servira qu'à un futur embed Stripe.js. Ne pas s'étonner de ne pas la trouver dans un `grep`. |
| `STRIPE_WEBHOOK_SECRET` | serveur | Barrière unique du webhook. En local, `stripe listen` en émet un **différent** de celui du Dashboard. |
| `STRIPE_PRICE_{FORGERON,MAITRE}_{MENSUEL,ANNUEL}` | serveur | Les **prix**, pas les produits. En variables et pas en dur : ils diffèrent entre test et live du même compte, et un changement tarifaire ne doit pas être un déploiement. |
| `SUPABASE_SERVICE_ROLE_KEY` | serveur | **Nouveau côté site.** Voir ci-dessous. |

> 🔴 **`SUPABASE_SERVICE_ROLE_KEY` arrive dans le site, et c'est une exception assumée.**
> Jusqu'ici, tout ce qui avait besoin de `service_role` vivait dans une Edge
> Function, où Supabase l'injecte. Le webhook ne peut pas : **Stripe signe le corps
> de la requête**, la vérification doit donc avoir lieu là où la requête arrive.
> Faire relayer une EF par la route Next reviendrait à recopier `STRIPE_WEBHOOK_SECRET`
> à deux endroits et à ouvrir un second point d'entrée à garder. La clé est donc
> ajoutée aux variables Vercel (jamais `NEXT_PUBLIC_`), et son usage est **borné à
> `src/lib/supabase/admin.ts`**, qui porte `import 'server-only'` — un import depuis
> un composant client devient une **erreur de build**, pas une clé dans le bundle.

### Table `stripe_subscriptions`

| Colonne | Type | Notes |
|---|---|---|
| `user_id` | `uuid` | **PK** → `profiles(id)` CASCADE. Un abonnement courant par compte (le modèle est « un palier à la fois »). |
| `stripe_customer_id` | `text` | NOT NULL **UNIQUE** — clé de correspondance des `customer.subscription.*`. |
| `stripe_subscription_id` | `text` | UNIQUE, nullable. |
| `status` | `text` | Statut Stripe **brut**, sans CHECK (voir plus bas). |
| `price_id` / `tier` | `text` | Prix souscrit ; palier **acheté**, conservé même s'il n'est plus effectif. |
| `current_period_end` | `timestamptz` | Recopié dans `profiles.tier_expires_at`. |
| `cancel_at_period_end` | `boolean` | Résilié mais encore actif — distinct de `status='canceled'`. |
| `last_event_at` | `timestamptz` | **Garde d'ordre**, défaut `-infinity`. Voir plus bas. |

**RLS** : `ss_select_own` (SELECT self only), **aucune policy d'écriture**,
`REVOKE ALL FROM anon, authenticated` puis `GRANT SELECT TO authenticated`.
Même patron que `kit_orders` — l'argent change de main, la barrière est en base.

#### 🔴 Pourquoi une table et pas des colonnes `stripe_*` sur `profiles`
Deux raisons, la seconde décisive :
1. `profiles` est **partagée avec l'app WPF** ; l'identifiant client Stripe n'est
   pas du contrat entre deux clients qui ne se déploient pas ensemble.
2. **Sécurité.** `trg_protect_privilege_columns` (20260614000001) protège une
   **liste nommée** : `role`, `tier`, `tier_expires_at`, `certified`. Une colonne
   `stripe_customer_id` sur `profiles` n'y serait **pas**, donc serait librement
   écrivable par tout `authenticated` via PostgREST — et c'est la clé par laquelle
   le webhook retrouve un compte. Un Apprenti qui s'attribue le
   `stripe_customer_id` d'un abonné hériterait de son abonnement au prochain
   événement. La table dédiée n'a aucune policy d'écriture : le problème ne se pose pas.

### RPC `stripe_apply_subscription_event` — le seul chemin d'écriture

SECURITY DEFINER, `SET search_path = public`, **EXECUTE réservé à `service_role`**
(les trois instructions `REVOKE FROM PUBLIC` / `REVOKE FROM anon, authenticated` /
`GRANT TO service_role`, conformément à la règle de `20260909000002`), avec un bloc
`DO` final qui **fait échouer le `db push`** si l'état visé n'est pas atteint — dans
les deux sens.

Fait les **deux** écritures dans une seule transaction (la ligne d'abonnement et le
palier de `profiles`) : un webhook interrompu entre les deux laisserait sinon un
palier ne correspondant à aucun abonnement. Retour `jsonb`
`{ applied, profile_updated, reason }`, **jamais d'exception sur un cas métier** —
le webhook doit répondre 200 à un événement périmé, sinon Stripe le retente en boucle.

> ⚠️ **La fonction ne décide de RIEN.** Elle reçoit `p_effective_tier` /
> `p_effective_expires_at` déjà calculés par `resolveTierOutcome` (TypeScript, testé)
> et se contente de les appliquer. Dupliquer la table de décision en PL/pgSQL
> garantirait qu'un jour les deux divergent — et c'est la version non testée qui
> gagnerait, puisque c'est elle qui écrit. **Ne pas « rapatrier la logique en base »
> par réflexe.**

> ⚠️ **Un ADMIN n'est jamais déclassé** par cette fonction (`role = 'admin'` →
> `profile_updated: false`, `reason: 'admin_untouched'`). Son palier est un marqueur
> de rôle géré à la main (cf. `effectiveTier`, et l'exclusion des admins dans
> `SubscriptionReminder` / `AdminTab`). L'abonnement est quand même enregistré ;
> seul le report sur `profiles` est sauté.

### ⚠️ Garde d'ordre — `last_event_at`, pas un champ d'audit

**Stripe ne garantit pas l'ordre de livraison des webhooks**, et retente les échecs.
Sans cette colonne, un `customer.subscription.updated` (`active`) livré en retard
**après** un `deleted` réactiverait l'abonnement d'un compte résilié. On y écrit le
`created` de l'**événement** (pas `now()`), et l'`ON CONFLICT` porte
`WHERE EXCLUDED.last_event_at >= s.last_event_at`.

`>=` et non `>`, délibérément : `checkout.session.completed` et le premier
`customer.subscription.updated` portent souvent le **même** `created` à la seconde
près ; avec `>`, le second serait rejeté comme périmé alors qu'il porte l'information
la plus complète. À timestamp égal le dernier arrivé gagne ; c'est l'événement
**strictement** plus ancien qu'on refuse.

### 🔑 Politique de palier — `resolveTierOutcome` (`plans.ts`)

| Statut Stripe | Palier | Justification |
|---|---|---|
| `active`, `trialing` | **accordé** + `current_period_end` | Un essai est un accès accordé, même si rien n'est débité. |
| **`past_due`** | **CONSERVÉ** | Décision explicite. Stripe relance ~1 semaine (Smart Retries) et aboutit la plupart du temps. Couper au premier échec punirait un client qui va payer ; l'erreur inverse se referme seule au passage en `unpaid`. |
| `unpaid` | retiré | État **terminal** d'un impayé, pas une alerte. |
| `canceled`, `incomplete_expired` | retiré | Fin effective / abonnement jamais commencé. |
| `incomplete` | retiré | 3DS en attente : rien n'est encaissé, l'accès s'ouvrira au passage `active`. |
| `paused` | retiré | Existe mais ne facture pas. |
| **inconnu de Stripe** | **CONSERVÉ** | Les 8 statuts documentés sont tous traités ; une valeur hors liste signifie que Stripe en a ajouté un. Entre déclasser un client qui paie et laisser un accès de trop, on choisit le second — borné par `current_period_end`, et **journalisé en `console.error`**. |
| **palier indéterminé** (`tier: null`) | retiré | Prix hors catalogue : il n'y a rien à accorder, on ne sait pas quoi. Attribuer « le palier le plus probable » offrirait Maître à qui a payé Forgeron. |

> ⚠️ **Un palier payant ne sort JAMAIS d'ici sans date d'expiration** — testé.
> `tier_expires_at = null` signifie « compte à vie » dans ce schéma
> (`SubscriptionReminder`, badge « à vie » de `/profil`) : un abonnement qui
> écrirait `null` offrirait un accès perpétuel à qui a payé un mois. `null` n'est
> renvoyé que sur retour au gratuit, où la question ne se pose pas.

> ⚠️ **`isPaymentIssue` ≠ perte d'accès.** `past_due` est un incident **ET** un
> accès conservé — les deux notions sont distinctes et doivent le rester (un futur
> bandeau « ton paiement a échoué » s'affiche sans couper quoi que ce soit).

### 🪤 Trois pièges Stripe déjà payés, à ne pas re-découvrir

1. **`current_period_end` n'est PLUS sur l'objet `Subscription`.** Depuis l'API
   2025-xx (le SDK est ici en `22.x`, API `2026-08-26.dahlia`), Stripe l'a descendu
   sur chaque `SubscriptionItem`. Le lire sur l'abonnement renvoie `undefined`
   **silencieusement** — le champ n'existe plus au typage non plus. `periodEndOf()`
   prend le **max** des items.
2. **Le corps du webhook doit être lu BRUT** (`request.text()`), jamais
   `request.json()`. La signature porte sur les octets exacts : un parse suivi d'un
   re-`stringify` change l'ordre des clés et l'échappement, la signature ne
   correspond plus, **toutes** les livraisons sont rejetées — avec pour seul
   symptôme un 400.
3. **Stripe compte en SECONDES**, `Date` en millisecondes. L'oubli du ×1000 place
   la fin de période en 1970 et déclasse tout le monde. D'où `unixToIso()`, unique
   et testée, plutôt que des `new Date(x * 1000)` disséminés.

### Rattachement d'un événement à un compte — trois sources, dans cet ordre

Elles ne sont **pas** interchangeables :
1. `subscription.metadata.user_id` — posé via `subscription_data.metadata` au
   checkout, survit à **tous** les `customer.subscription.*`, y compris déclenchés
   depuis le Dashboard Stripe ;
2. `session.client_reference_id` — n'existe **que** sur
   `checkout.session.completed`, mais y est le plus fiable ;
3. la table, par `stripe_customer_id` — seul recours pour un abonnement créé **hors**
   de notre parcours (à la main dans le Dashboard, ou migré).

Aucune ne répond ⇒ **200 `{ ignored, reason: 'user_not_resolved' }`**, jamais un 500 :
réessayer ne ferait pas apparaître l'identité manquante, et Stripe boucherait sur un
cas insoluble. Un 500 n'est renvoyé que sur panne DB/réseau, là où le rejeu a un sens
— et la garde d'ordre + l'`ON CONFLICT` le rendent inoffensif.

### Étape 4 — le dashboard reflète le palier sans rechargement forcé

**Le problème** : quand Stripe renvoie sur `success_url`, `profiles.tier` **n'est pas
encore écrit**. Le webhook est appelé en parallèle, par un chemin qui ne passe pas par
le navigateur et n'a aucun rendez-vous avec lui. Sans traitement, quelqu'un qui vient
de payer voit encore « Apprenti » — et le réflexe est de repayer.

**La réponse** : `SessionProvider` expose désormais **`refreshProfile()`** (relit
`profiles`, **renvoie** le profil relu — l'état React n'est pas à jour à l'instant du
`await`), et `CheckoutReturn` s'en sert : bandeau « activation en cours… », relecture
toutes les 2 s, **15 tentatives max (30 s)**, puis message « recharge dans une minute ».
**Jamais un message d'échec** : le paiement, lui, est passé.

- Le paramètre `?checkout=` est retiré de l'URL (`history.replaceState`) **avant**
  toute attente — un rechargement ou un retour arrière ne rejoue pas l'annonce.
- La détection combine **deux** conditions : palier différent de celui du retour
  (couvre Apprenti→Forgeron **et** Forgeron→Maître, qu'un simple « est-ce payant ? »
  manquerait) **ou** palier payant alors que le profil n'était pas chargé au retour.
- **Polling et pas Realtime**, délibérément : `profiles` n'est pas dans la publication
  `supabase_realtime`, et l'y ajouter diffuserait les changements de toutes ses
  colonnes pour une attente de quelques secondes, une fois par abonnement.
- Monté dans `Dashboard.tsx` à côté de `ConsentBanner` (bandeau de flux, dans la
  colonne de contenu) et **non** dans `page.tsx` comme `SubscriptionReminder`, qui est
  une modale plein écran.

### `Pricing.tsx` est monté à DEUX endroits — c'est ce qui dicte le bouton

- vitrine publique (`page.tsx`, branche visiteur) : personne n'est connecté → le clic
  ouvre `openAuth()` ;
- onglet **caché** `tarifs` du dashboard (`Dashboard.tsx`) : connecté → le clic ouvre
  Stripe Checkout.

D'où la lecture de `useSession()` dans le composant plutôt qu'une prop. Le bouton est
inerte sur **son propre palier** (`ctaCurrent`) : proposer un second paiement à qui
l'a déjà créerait un doublon d'abonnement chez Stripe, pas une mise à niveau.

> ⚠️ **Le montant n'est JAMAIS transmis par le client** — seulement le couple
> `(plan, period)`, qui sert à choisir un `price_id` configuré côté serveur. Même
> patron intent→grant que « Chaleur de la Forge ». Accepter un prix du navigateur,
> ce serait accepter de vendre Maître au prix qu'il aura choisi.

### Reprise après connexion — « Se connecter pour s'abonner » finit le geste

**Le problème** : sur la vitrine, `ctaSubscribeAnon` ouvrait la modale et s'arrêtait
là. Une fois connecté, plus rien ne relançait le checkout — et sur `/`, la vitrine
avait en plus **disparu** (branche visiteur de `page.tsx` remplacée par le
dashboard), donc le bouton à re-cliquer n'était même plus à l'écran.

**La réponse** : le couple (palier, périodicité) est mémorisé dans
**`sessionStorage`** au clic (`rememberCheckoutIntent`), puis rejoué automatiquement.

> ⚠️ **Ni un `useState` ni une `ref` ne conviennent ici**, et ce n'est pas une
> question de goût : aucun des deux ne survit aux chemins de connexion. Google
> (`signInWithOAuth`) **quitte le site** et revient par `/auth/callback` — tout
> l'arbre React a été détruit ; la connexion e-mail, elle, **démonte `Pricing`** à
> l'instant où `user` devient non-null, donc un effet `[user]` posé dedans ne
> s'exécute jamais avec la nouvelle valeur. `sessionStorage` traverse les deux (il
> est lié à l'ONGLET) et se ferme tout seul, ce qu'un `localStorage` ne ferait pas.

Le relais se fait en deux temps, dans deux fichiers :
1. **`page.tsx`** — effet sur `user` : si une intention attend (`peekCheckoutIntent`,
   lecture NON destructive), il ouvre l'onglet `tarifs`. Sans lui, le dashboard
   s'ouvrirait sur l'accueil et personne ne relirait jamais l'intention.
2. **`Pricing.tsx`** — effet sur `user` : `takeCheckoutIntent` (lecture **destructive**)
   puis ouverture du checkout avec la périodicité MÉMORISÉE, pas celle du toggle.

> ⚠️ **La consommation a lieu AVANT l'ouverture du checkout, jamais après.** Si
> l'ouverture échoue (réseau, 503 de configuration), on veut que la personne
> re-clique, pas qu'un paiement se relance seul au rendu suivant. C'est aussi le
> seul ordre qui tienne face au double montage du mode strict de React. Une garde
> `resumed` (ref) double la protection côté React.

TTL de **15 minutes** : assez pour un aller-retour OAuth + création de compte, trop
court pour qu'une intention abandonnée ouvre un paiement une demi-heure plus tard.
**Ce n'est PAS une sécurité** — l'intention ne porte qu'un palier et une
périodicité, jamais un montant ; une intention falsifiée à la console ne peut pas
acheter Maître au prix de Forgeron, le prix restant choisi côté serveur.

### Portail client — `/api/stripe/portal` + section « Abonnement » de `/profil`

> 🔴 **CONFIGURATION MANUELLE REQUISE CÔTÉ STRIPE.** Le Billing Portal doit être
> activé et enregistré dans **Dashboard → Settings → Billing → Customer portal**,
> **en mode LIVE comme en mode test** (les deux configurations sont distinctes et
> ne se recopient pas). Sans elle, `billingPortal.sessions.create` répond
> « No configuration provided » et la route renvoie un **502** : c'est une
> configuration absente, pas un bug de code. Aucune variable d'environnement
> supplémentaire n'est nécessaire — la route réutilise `STRIPE_SECRET_KEY`.

`POST /api/stripe/portal`, **sans corps** → `{ url }`, redirection **pleine page**
comme le checkout. `return_url` = `${SITE_URL}/profil`.

- **Authentification comme le checkout** : `getUser()` et jamais `getSession()`.
- **Le `stripe_customer_id` ne vient JAMAIS du corps de la requête** : la route le
  relit dans `stripe_subscriptions` **sous le JWT de l'utilisateur** (policy
  `ss_select_own`). C'est le pendant exact du « le montant n'est jamais transmis par
  le client » côté checkout — l'accepter du navigateur ouvrirait les factures et le
  moyen de paiement de n'importe quel abonné.
- **Aucun client, aucun portail** → **404 `{ error: 'no_customer' }`**. Cas NORMAL
  (cette personne n'a jamais eu d'abonnement), pas une panne : 404 et non 403, ce
  n'est pas un refus d'accès mais une ressource inexistante.
- **La route n'écrit rien.** Une résiliation faite dans le portail revient par
  `customer.subscription.updated` puis `deleted` : le webhook reste le seul chemin
  d'écriture sur les paliers.

Côté interface, `SubscriptionSection` (dans `/profil`, juste sous l'en-tête) rend le
verdict de **`resolveSubscriptionView`** — trois situations : `free` (lien vers
l'onglet Tarifs), `paid` (date de renouvellement, ou d'ARRÊT si
`cancel_at_period_end` — même date, sens opposé, deux libellés distincts) et
`lifetime` (`tier_expires_at` à `null`, attribution manuelle, jamais Stripe).

> ⚠️ **`resolveSubscriptionView` ≠ `resolveTierOutcome`.** Le second traduit un
> événement Stripe en palier à ÉCRIRE (webhook) ; le premier relit ce qui est déjà
> en base pour l'AFFICHER. Recalculer le palier côté client à partir du statut
> Stripe créerait une seconde table de décision, et la page finirait par affirmer un
> palier que la base ne donne pas.

Deux détails qui ne sont pas des oublis :
- **Le bouton de portail est adossé à l'EXISTENCE d'un client Stripe, pas au palier
  courant.** Un ancien abonné redescendu à `apprenti` garde ses factures, son moyen
  de paiement et sa réactivation dans le portail ; les lui cacher l'obligerait à
  écrire un mail. C'est exactement la condition que la route vérifie côté serveur,
  pour qu'un bouton visible ne mène jamais à une erreur.
- **Le rôle admin reste orthogonal** : `stripe_apply_subscription_event` enregistre
  l'abonnement d'un admin mais ne touche pas à son palier (`admin_untouched`). La
  section le DIT (`adminNote`) plutôt que de laisser croire qu'une résiliation lui
  ferait perdre ses accès. Le badge de rôle de l'en-tête n'est pas touché.

`isPaymentIssue` (de `plans.ts`) alimente un bandeau `past_due`/`unpaid` — un
incident de paiement **ne retire pas** le palier (`past_due` conserve l'accès), les
deux notions restent distinctes.

### Tests

`src/lib/stripe/plans.test.ts` — **22 tests** sur le module pur : paliers achetables
(et l'exclusion de Légion/Monarque), correspondance ASCII↔accentué, catalogue de prix
dans les deux sens, **les 8 statuts un par un**, le cas « statut inconnu », l'invariant
« jamais de palier payant sans date », le ×1000, et `stripeMode`.
`src/locales/landing.test.ts` — 2 tests de plus : toute carte `subscribe` porte une clé
`plan` valide (et elle seule), et cette clé désigne bien le palier de la carte.
`src/lib/stripe/checkout-intent.test.ts` — **19 tests** : aller-retour palier+périodicité,
consommation UNIQUE (`take` efface, `peek` non), TTL à la milliseconde près, et le
rejet de tout ce qui sort corrompu du stockage (JSON invalide, palier inventé,
horodatage absent). Plus les deux cas « pas de stockage » : `null` (rendu serveur) et
un stockage qui LÈVE (navigation privée) — aucun des deux ne doit jamais faire échouer
un clic, seule la reprise automatique disparaît.
`src/lib/stripe/subscription-view.test.ts` — **23 tests** : les trois situations
(`free`/`paid`/`lifetime`), le palier inconnu payant par défaut, le portail ouvert à un
ancien abonné redescendu au gratuit, la résiliation programmée, les cinq statuts face à
`isPaymentIssue`, et l'orthogonalité du rôle admin.

> **Le repo n'a pas de suite de tests de routes API** (aucun test n'existe pour
> `api/external/items`) — la convention y est de tester les **modules purs**, pas les
> handlers. Toute la logique décisionnelle a donc été sortie dans `plans.ts`
> précisément pour être testable sous cette convention ; les routes ne contiennent
> que de l'orchestration. **Ne pas introduire un harnais de test de routes pour ce
> seul chantier** sans décider de la convention pour tout le repo.

### Reste à faire

- **Aucun test SQL** pour la migration (les `supabase/tests/*.sql` du kit et de prac
  sont le patron à suivre : blocs `BEGIN/ROLLBACK` pour le SQL Editor distant). À
  écrire avant de pousser en prod — cibles évidentes : la garde d'ordre
  (`last_event_at`), l'exclusion des admins, et la sonde `anon`/`authenticated` sur
  la RPC (`42501` attendu).
- **Migration non appliquée** au moment de la rédaction (ni test, ni prod).
- ~~**Portail client Stripe**~~ ✅ **LIVRÉ** — `/api/stripe/portal` + section
  « Abonnement » de `/profil` (voir § Portail client ci-dessus). ⚠️ Le portail doit
  être **activé manuellement dans le Dashboard Stripe**, en LIVE comme en test, sinon
  la route répond 502.
- ~~**CGU** (`cgu/page.tsx`) : à relire~~ ✅ **FAIT** au chantier CGV du 2026-09-11 —
  voir § CGV, rétractation et consentement ci-dessous.
- Le § « Modèle freemium » ci-dessous dit encore « à activer quand Pricing sera
  réactivé » et « la section Pricing est actuellement masquée sur la vitrine » :
  **les deux sont périmés**. La grille est visible et le paiement est branché ;
  l'**enforcement** des quotas par palier, lui, reste bien à faire.

---

## ⚖️ CGV, rétractation et consentement avant paiement (chantier du 2026-09-11)

Suite à l'audit légal du 2026-09-10. Périmètre : abonnements Forgeron / Maître
seulement. **Le Kit sur mesure est HORS périmètre** (contrat de prestation distinct,
rétractation pleinement applicable). ~~La traduction EN des CGU/CGV aussi~~ → **FAITE le
2026-09-12**, voir § Traduction EN des pages légales.

### Ce qui a été livré

| Élément | Où |
|---|---|
| Page CGV (L221-5) | `src/app/cgv/page.tsx` + `src/locales/legal/cgv.tsx` — route dédiée, **FR et EN**, liée depuis le footer, la nav des pages légales et la modale de paiement |
| Clauses d'abonnement partagées CGU § 8 ↔ CGV § 2-5 | `src/components/legal/SubscriptionTerms.tsx` — **un seul texte rendu à deux endroits**, montants lus dans `PRICING_TIERS` |
| CGU § 2 / § 9 bornées pour le payant, § 8 au présent, § 10 sans prorata | `src/app/cgu/page.tsx` |
| Texte versionné de la case + ordre « preuve puis session » | `src/lib/stripe/checkout-consent.ts` (**module PUR**, `checkout-consent.test.ts`) |
| Étape de consentement avant Stripe | `src/components/landing/CheckoutConsentModal.tsx` (sans hook, testé) + `Pricing.tsx` |
| Écriture de la preuve AVANT la session | `src/app/api/stripe/checkout/route.ts` |
| Table de preuve | migration `20260911000003_checkout_consent_log.sql` + `supabase/tests/20260911000003_checkout_consent_log_test.sql` |
| Nouveau traitement déclaré | `confidentialite/page.tsx` § 2, 4, 6 |

### 🔴 Ce que la case prouve — L221-25, pas L221-28

Un abonnement est un service CONTINU : il n'est jamais « pleinement exécuté » en
14 jours, donc l'exception L221-28 1° (perte du droit) ne joue presque jamais.
Ce qui s'applique est **L221-25** : sans demande expresse recueillie, un abonné qui
se rétracte ne doit RIEN (remboursement intégral, même après usage) ; avec elle, il
doit le **prorata du service fourni**. La case ne supprime donc pas le droit de
rétractation, elle en change la contrepartie — le texte de la case et le § 6 des CGV
le disent. ⚠️ **Le remboursement au prorata d'une rétractation est MANUEL** (annuler
l'abonnement + remboursement partiel depuis le Dashboard Stripe), à faire sous
14 jours (L221-24). Aucune automatisation.

### 🔴 Flux de paiement — trois barrières, une seule qui compte

1. `CheckoutConsentModal` : case jamais pré-cochée, bouton `disabled` ET sans
   `onClick` tant qu'elle n'est pas cochée ;
2. `Pricing.confirmCheckout` : garde sur la case ; **c'est le SEUL appelant
   d'`openCheckout`**. La reprise après connexion (`checkout-intent`) **rouvre la
   modale**, elle ne va plus jamais directement chez Stripe — sinon ce serait le seul
   chemin de paiement sans consentement ;
3. **La route** (`checkConsent`) : `consent.accepted === true` (booléen strict),
   `version === CURRENT_CONSENT_VERSION` (sinon 400 `consent_outdated`), langue
   connue. Le **texte n'est jamais lu dans le corps** : il est relu dans le module
   versionné. Puis `recordConsentThenOpenCheckout` écrit la preuve (RPC
   `record_checkout_consent`, client `service_role`) et **n'appelle Stripe que si
   l'écriture a abouti** — sinon 503 `consent_not_recorded`, aucune session.
   `consent_id` part dans les `metadata` de la session ET de l'abonnement Stripe.

> ⚠️ **Changer le texte de la case** = ajouter une NOUVELLE version à
> `CONSENT_TEXTS`, pointer `CURRENT_CONSENT_VERSION` dessus, ajouter son empreinte
> SHA-256 dans `checkout-consent.test.ts`. Jamais réécrire une version publiée : le
> test d'empreinte échoue exprès.
>
> ⚠️ **Changer les CGV** = avancer la date `updated` **des DEUX dictionnaires**
> (`cgvFr` et `cgvEn` de `src/locales/legal/cgv.tsx`, au format ISO `AAAA-MM-JJ`) ET
> `CGV_VERSION` ensemble — c'est la version enregistrée avec chaque preuve.
> `checkout-consent.test.ts` relit le dictionnaire et échoue si les trois divergent.
> La date n'est plus rédigée : `LegalPage` la formate dans la langue lue
> (« 11 septembre 2026 » / « 11 September 2026 »), ce qui rend impossible d'annoncer
> deux versions selon la langue.

### Table `checkout_consent_log` (migration 20260911000003)

`id` · `user_id` (FK `profiles` **ON DELETE SET NULL**) · `plan` · `period`
(`mensuel`|`annuel`) · `consent_version` · `locale` · `consent_text` (texte COMPLET,
20-2000 car.) · `terms_version` · `accepted_at` (horloge de la BASE).

- **Aucun accès client**, lecture comprise : RLS sans policy + `REVOKE ALL` (42501).
- Écriture : `record_checkout_consent(...)` SECURITY DEFINER, EXECUTE
  `service_role` seul (règle des trois instructions de 20260909000002), bloc `DO`
  d'auto-vérification.
- **Immuable** : trigger `trg_checkout_consent_log_immutable` refuse tout UPDATE,
  même `service_role`, **sauf** `user_id → NULL` sans autre changement. Cette
  exception est OBLIGATOIRE : `ON DELETE SET NULL` s'exécute comme un UPDATE, sans
  elle la suppression d'un compte d'ancien abonné échouerait.
- `SET NULL` et pas `CASCADE` : la preuve survit à la suppression du compte
  (détachée), elle reste reliée à Stripe par `consent_id`. Conservation annoncée :
  5 ans. **Aucune purge n'existe** — première échéance en 2031, à planifier.
- **Validée le 2026-09-11 sur le projet TEST, 27/27**, en exécutant migration +
  script de test dans UNE transaction terminée par une exception volontaire (rien
  n'a persisté — vérifié après coup). **NON APPLIQUÉE** ni sur test ni en prod.
  ⚠️ Le projet test est en retard de deux migrations sur la prod
  (`20260911000001/2`, drops tournois/prac) : un `db push` sur test les appliquerait
  aussi.

### ✉️ E-mails transactionnels d'abonnement (chantier du 2026-09-11 — Resend rebranché)

Débloque les trois obligations qui dépendaient d'un transport e-mail. Décision
HORTAL : **Resend** (compte conservé).

| Obligation | E-mail | Déclencheur |
|---|---|---|
| **L221-13** confirmation du contrat | `order_confirmation` (FR/EN) — palier, prix, périodicité, 1er prélèvement, prochaine échéance, lien portail, lien CGV, droit de rétractation, **texte exact** de la demande expresse (relu dans `checkout_consent_log`) | `checkout.session.completed` |
| **L215-1-1** confirmation de résiliation | `cancellation_confirmation` (FR/EN) — demande enregistrée, date de fin d'accès, pas de remboursement partiel (CGU § 10) | `customer.subscription.updated` où la résiliation **passe** à programmée (`previous_attributes`) — le plus tôt, pas `deleted` qui n'arrive qu'en fin de période |
| **L215-1** rappel avant reconduction | `renewal_reminder` (FR/EN) — date de reconduction en encadré, montant (aperçu de facture Stripe, remises comprises), lien pour résilier | programmé à la souscription et à chaque renouvellement d'un abonnement **annuel** |

**Architecture — le webhook n'envoie jamais rien.**
1. `/api/stripe/webhook`, APRÈS `applySubscription`, appelle `queueSubscriptionEmails`
   (tout en try/catch + `enqueueSafely` : **ne lève jamais**) qui dépose des lignes
   via la RPC `enqueue_subscription_email`. Un dépôt impossible = `console.error`
   « à traiter À LA MAIN », et le webhook répond 200 comme d'habitude.
2. pg_cron (`subscription-emails-drain`, **toutes les 5 min**) appelle
   `trigger_subscription_emails_drain()`, qui ne réveille l'EF **que s'il y a une ligne
   due** (URL + jeton lus dans Vault à chaque appel).
3. L'EF `subscription-emails` réclame (`claim_subscription_emails`, `FOR UPDATE SKIP
   LOCKED`), envoie via `_shared/resend.ts` avec **`Idempotency-Key = dedup_key`**,
   puis clôt (`finish_subscription_email`). Toute la logique est dans le module PUR
   `_shared/subscription-emails.ts` (gabarits, calendrier, isolation des échecs).

**Jamais deux fois** : `dedup_key` UNIQUE (`order:<sub>`, `cancel:<sub>:<event>`,
`renewal:<sub>:<échéance>`) ; réclamation exclusive ; Idempotency-Key Resend (24 h)
contre le doublon après plantage. Une ligne restée `sending` est reprise après 15 min
(la dette V1 de prac, où une ligne bloquée ne repartait jamais, est réglée).
**Relances** : 15 min, 30 min, 1 h, 2 h, 4 h, puis 6 h ; abandon visible en `failed`
après 8 tentatives (≈ 20 h).

> ⚠️ **Rappel annuel : point fixe « un mois calendaire + 15 jours », PAS « J-30 ».**
> La loi dit « au plus tard **un mois** » avant le terme. Quand le mois précédent a
> 31 jours (échéance en janvier, février, avril, juin, août, septembre, novembre),
> un mois = 31 jours : un envoi à J-30 serait hors délai **7 mois sur 12**. Constante
> `REMINDER_MARGIN_DAYS` ; propriété vérifiée par test sur chaque jour de trois ans.
> L'EF revérifie l'abonnement à l'envoi (toujours vivant, non résilié, même échéance)
> et journalise en erreur un envoi qui dépasserait la limite légale.

Table `subscription_emails` (migration `20260911000004`) : file ET journal. RLS sans
policy + `REVOKE ALL` (aucun accès client), 3 RPC `service_role` seul, bloc `DO`
d'auto-vérification. `user_id … ON DELETE SET NULL` : une ligne envoyée reste la
preuve de l'information légale ; une ligne en attente d'un compte supprimé est close
`skipped`, jamais envoyée. Conservation annoncée : 5 ans (pas de purge automatique,
première échéance 2031).

#### 🌍 Langue des e-mails — FR / EN depuis le 2026-09-12

Les trois gabarits étaient codés en dur en français (`<html lang="fr">`). Ils sont
désormais bilingues, sur la convention des dictionnaires `src/locales/legal/*` : le
**FR fait foi**, `EmailTexts = typeof emailTextsFr`, `emailTextsEn: EmailTexts` — une
clé oubliée ne compile pas.

**🔴 D'où vient la langue : `checkout_consent_log.locale`, et rien d'autre.**
Le site n'a **aucune préférence de langue persistée** — `wf-lang` vit dans le
`localStorage` du navigateur et ne survit pas au serveur. La seule trace durable de
la langue dans laquelle une personne a traité avec nous est la `locale` écrite avec
sa demande expresse (migration `20260911000003`), au moment exact où elle lisait la
page de paiement.

| E-mail | Source de la langue |
|---|---|
| `order_confirmation` | la `locale` de **LA preuve de cette commande** (`payload.consent_id`), déjà relue pour son `consent_text` → **aucune requête de plus**, et exacte par construction |
| `cancellation_confirmation`, `renewal_reminder` | la **dernière locale connue du compte** (`localeOf` → `checkout_consent_log` du `user_id`, `accepted_at DESC`, limite 1) |

L'index `idx_checkout_consent_log_user (user_id, accepted_at DESC)` existait déjà :
**aucune migration, aucune colonne, aucune table.**

> ⚠️ **Pourquoi pas une colonne `locale` sur `stripe_subscriptions`** : une migration
> sur la base PARTAGÉE avec l'app WPF, plus un backfill, pour stocker une donnée déjà
> déductible. **Pourquoi pas une préférence utilisateur** : ce serait inventer un
> mécanisme là où la preuve de consentement répond déjà à la question — et il faudrait
> alors décider ce qui arbitre entre la préférence et la langue réellement lue au
> moment de l'achat (c'est la seconde qui compte en droit).

**🔴 Repli sûr, jamais silencieux.** Toute locale absente, vide ou hors catalogue
(`de`, valeur corrompue) ramène au **français** — le comportement d'avant le
chantier — et le repli est **journalisé** : `info` quand le compte n'a simplement
aucune preuve (normal pour un abonnement antérieur au recueil), `warn` quand la
valeur est hors catalogue ou que la lecture a échoué. Une panne de `localeOf`
**n'empêche jamais l'envoi** : la sanction du défaut d'information (L215-1) est bien
plus lourde qu'un e-mail dans la mauvaise langue. `resolveEmailLocale` tolère les
étiquettes régionales (`en-GB`, `fr-CA`) : la colonne accepte 2 à 10 caractères, et un
`en-GB` qui retomberait en français serait le pire des deux mondes.

**Ce qui suit la langue** : sujet, titre, corps, `<html lang>`, la mention « e-mail de
service », les libellés de palier (« Forgeron / Maître » ↔ « Blacksmith / Master »,
comme la grille tarifaire, la modale de paiement et les CGV), les montants
(`Intl`, `fr-FR` / `en-GB` — même choix que `src/lib/intl.ts`) et les dates.

**Ce qui ne suit PAS la langue, à dessein** :
- l'**adresse du siège** en pied de page : c'est une adresse ;
- le **fuseau des dates**, `Europe/Paris` dans les deux langues. Ce sont des dates
  CONTRACTUELLES (échéance, fin d'accès, premier prélèvement) fixées par un vendeur
  français ; les afficher dans le fuseau du destinataire les ferait diverger d'un jour
  de celles qu'annoncent le site, les CGV et le portail Stripe ;
- les **références d'articles** (`L215-1`), comme dans les pages légales.

**🔴 Les liens des e-mails portent la langue (`?lang=`) — et eux seuls.**
Un e-mail anglais dont le lien pointait sur `/cgv` tout court faisait atterrir son
destinataire sur la version FRANÇAISE : la langue du site vit dans le `localStorage`,
qui ne franchit ni l'e-mail ni l'appareil. Le cas est la RÈGLE, pas l'exception — un
lien ouvert depuis l'application mail d'un téléphone s'ouvre dans un navigateur qui
n'a jamais visité le site.

- Les liens `/cgv` et `/profil` des trois gabarits sont estampillés `?lang=fr|en`
  (`siteLink`), **dans les deux langues** : un abonné français dont le navigateur a
  gardé « en » d'une visite précédente doit lui aussi atterrir dans la langue de
  l'e-mail qu'il vient de lire.
- **Le lien « no-code » du portail Stripe n'est PAS estampillé** : c'est une URL de
  Stripe, qui a sa propre gestion de langue ; `?lang=` y serait un paramètre parasite.
- Côté site, `LanguageProvider` lit le paramètre au chargement. Règle de priorité
  dans un module PUR, `src/lib/lang-param.ts` : **URL > préférence stockée > rien**
  (et « rien » signifie : on ne touche pas à l'état, on n'écrit pas dans le stockage —
  un visiteur qui n'a jamais choisi de langue ne doit pas repartir avec une préférence
  qu'il n'a pas exprimée).
- La langue venue de l'URL est **persistée** sous `wf-lang`. Sans cela, le premier
  lien du pied de page — qui recharge la page entière, sans le paramètre — ramènerait
  le visiteur en français : le bug corrigé, repoussé d'un clic.
- **Aucune URL du site ne porte ce paramètre** : la navigation normale suit l'état du
  provider comme avant. Ce n'est pas un routage i18n par URL, il y a toujours une
  seule URL par page. Un test vérifie qu'aucun `href` des pages légales ne le porte.

> ⚠️ **`window.location.search`, et surtout PAS `useSearchParams()`.** Ce hook force
> le rendu dynamique de tout l'arbre sous lui, et le provider est monté dans le layout
> RACINE : la vitrine, les quatre pages légales, /champions et /matches cesseraient
> toutes d'être prérendues en statique. Le paramètre est donc lu dans le même `useEffect`
> que le stockage, APRÈS l'hydratation — ce qui préserve aussi l'égalité du rendu
> serveur et du premier rendu client. (Vérifié : la table des routes du `next build`
> est inchangée, `/cgu` et `/cgv` restent `○`.)

> ⚠️ Le nom du paramètre est écrit **deux fois** : `LANG_PARAM` (`src/lib/lang-param.ts`)
> et une constante locale du module Deno, qui ne peut pas importer `src/` (même
> contrainte que le dictionnaire, voir ci-dessus). `subscription-emails-worker.test.ts`
> compare le lien RENDU à `LANG_PARAM` : c'est ce qui interdit aux deux côtés de diverger.

> ⚠️ **Le dictionnaire vit DANS `_shared/subscription-emails.ts`**, pas dans un module
> frère. L'Edge Function tourne sous Deno, qui **exige** l'extension (`./x.ts`), et
> `tsc` la **refuse** (`allowImportingTsExtensions`) — or ce module est aussi compilé
> par Next, qui l'importe depuis le webhook Stripe. Un module frère serait importable
> par l'un ou par l'autre, jamais par les deux. Ne pas « ranger » le dictionnaire à
> côté sans traiter ce point.

**Contrat `WorkerDeps` élargi** — deux effets injectés de plus côté EF :
`consentOf` renvoie désormais `locale`, et `localeOf(userId)` est nouveau. Les deux
sont de simples `select` sur `checkout_consent_log` (service_role ; la table reste
inaccessible aux clients).

**Tests** (`src/lib/stripe/subscription-emails-worker.test.ts`, 55 tests ;
`src/lib/lang-param.test.ts`, 12 tests) :
normalisation des étiquettes, parité des clés FR/EN, aucune chaîne EN restée en
français, contenu légal présent dans le gabarit anglais (encadré L215-1 daté, montant,
liens, texte de consentement, échappement HTML), choix du gabarit **de bout en bout à
travers `processDueEmails`** — c'est là qu'est le bug probable, une locale lue mais
pas transmise — et les quatre replis : compte sans preuve, valeur hors catalogue,
`localeOf` en panne, compte supprimé (qui n'interroge même pas la langue). Côté
liens : `?lang=` présent sur `/cgv` et `/profil` dans les trois gabarits et dans les
deux langues, absent du portail Stripe, et la règle de priorité URL > stockage > rien.
`LegalPage.test.tsx` referme la chaîne : un `?lang=en` sans préférence locale rend bien
la page en anglais, et aucun lien du site ne porte le paramètre.

**Validé** : 27/27 sur le projet test (migration + `supabase/tests/20260911000004_…`
dans une transaction annulée — rien n'a persisté, job cron compris) ; tests vitest
(`src/lib/stripe/subscription-emails*.test.ts`) ; `deno check` de l'EF OK.
**✅ Migration appliquée en prod le 2026-09-12** (`db push`, projet `cuscgmgqakxnfwnsrhhv`), et
**configuration complète le même jour** : `EMAIL_FROM`, `RESEND_API_KEY` et
`SUBSCRIPTION_EMAILS_TOKEN` côté Edge Functions, `subscription_emails_token` et
`subscription_emails_url` côté Vault (vérifiés par requête SQL directe). Plus aucun secret
manquant : la configuration n'est plus un verrou, l'envoi réel est armé.
**Reste le déploiement** — l'EF `subscription-emails` et le webhook Stripe du site partent au
push sur `main` ; tant qu'il n'a pas eu lieu, la file ne se remplit pas et le cron n'a personne
à réveiller. **Le projet test n'a ni la migration ni les secrets.**

**⚠️ Pré-requis de mise en service, dans cet ordre :**
1. Secrets Edge Functions (prod) : `supabase secrets set RESEND_API_KEY=… EMAIL_FROM=…
   SUBSCRIPTION_EMAILS_TOKEN=<aléatoire> --project-ref cuscgmgqakxnfwnsrhhv` (+ en option
   `EMAIL_REPLY_TO`, `STRIPE_PORTAL_LOGIN_URL`, `SITE_URL`).
2. Secrets Vault (même jeton) : `subscription_emails_token` et `subscription_emails_url`
   (commandes dans l'en-tête de la migration).
3. `db push` de la migration, puis push sur `main` (déploie l'EF via le workflow) et
   déploiement du site (webhook).
Sans 1 et 2, rien ne se perd : la file se remplit, l'EF répond 503 sans rien réclamer,
tout part dès que la configuration est posée.

**À décider par HORTAL (non deviné)** : l'adresse d'expéditeur `EMAIL_FROM` (le domaine
`wyrm-forge.com` est **déjà authentifié chez Resend** — DKIM `resend._domainkey`, SPF et
MX du sous-domaine `send.`, région eu-west-1 — mais **aucun enregistrement DMARC**
n'existe : à ajouter côté Cloudflare) ; activer ou non le lien de connexion « no-code »
du portail Stripe (`STRIPE_PORTAL_LOGIN_URL`, sinon les e-mails renvoient vers
`/profil`) ; faire valider par le juriste que la confirmation de commande, qui renvoie
aux CGV par un lien, suffit comme support durable (sinon joindre les CGV en PDF).

### ✅ Corrections bloquantes traitées le 2026-09-11 (décisions HORTAL)

**1. Grille tarifaire alignée sur le serveur** (décision : la réalité serveur fait
foi). La grille annonçait « Analyses IA illimitées (Opus) » (Maître) et
« 20 analyses IA / mois (Sonnet) » (Forgeron) quand le serveur applique
135 cr/sem Sonnet et 65 cr/sem Haiku. Elle dit désormais « 15 / 65 / 135 crédits
IA / semaine (Haiku / Haiku / Sonnet) », et la FAQ explique ce qu'est un crédit.
`landing.test.ts` **relit `TIER_CONFIG` dans les deux EF** et échoue si la grille
(FR ou EN) s'en écarte, ou si « Opus » / une IA « illimitée » réapparaît.
0 abonnement en prod au moment de la correction : aucun contrat à régulariser.
Option écartée (chiffrée) : Opus illimité pour Maître — ~54 cr la détaillée au
pire cas, déficitaire au-delà de ~95 détaillées/mois/abonné, coût non borné.

**2. Supprimer un compte arrête la facturation Stripe** (décision : fin de période
dès la demande). Il n'existait AUCUN code de suppression : le site insérait une
ligne `deletion_requests` depuis le navigateur, la suppression effective restait
manuelle, et l'abonnement Stripe survivait au compte.
- `POST /api/account/deletion-request` remplace l'insert client : trouve TOUS les
  abonnements (table + `subscriptions.search` sur `metadata.user_id`, pour ceux dont
  le webhook n'a jamais été reçu), pose `cancel_at_period_end`, et **n'enregistre la
  demande qu'ensuite** — Stripe en échec ⇒ rien d'enregistré (503
  `billing_stop_failed`). Logique et ordre dans `src/lib/stripe/account-deletion.ts`
  (PUR, testé).
- Annuler sa demande **ne réactive pas** l'abonnement (pas de prélèvement surprise) ;
  la personne le réactive elle-même depuis le portail.
- **Filet dans le webhook** pour un compte supprimé SANS demande (suppression manuelle
  au Dashboard Supabase…) : tout `customer.subscription.*` / `checkout.session.completed`
  dont le profil n'existe plus ⇒ résiliation immédiate, 200 (ça répare au passage une
  boucle de 500 sur la clé étrangère). Et **`invoice.created`** : la facture de
  renouvellement en brouillon est **figée** (`auto_advance: false`) après
  résiliation.
  > 🪤 Stripe **refuse de supprimer** une facture issue d'un abonnement (seules les
  > factures ponctuelles se suppriment) — la première version le tentait, le smoke
  > test l'a révélé. Figer, pas supprimer.
- ⚠️ **À cocher dans Stripe (test ET live)** : l'événement `invoice.created` sur
  l'endpoint du webhook. Sans lui, le filet ne voit le renouvellement qu'une fois
  prélevé.
- **Validé sur Stripe (sandbox) le 2026-09-11, 10/10** : `npx tsx
  scripts/stripe-deletion-smoke.ts` rejoue les deux étages avec des horloges de test
  avancées au-delà du renouvellement — un seul paiement au total dans les deux cas.
  Passe par la CLI (sandbox), jamais par la clé de `.env.local`.

**3. Résiliation sous une mention sans ambiguïté** (décret 2023-417). `/profil`
porte un bouton **« Résilier mon abonnement »** qui ouvre le portail DIRECTEMENT sur
l'écran de résiliation (`POST /api/stripe/portal { flow: 'cancel' }` →
`flow_data.type = 'subscription_cancel'`), distinct de « Moyen de paiement et
factures ». Règle d'affichage partagée interface ↔ route :
`canCancelSubscription` (`subscription-view.ts`). `/profil` lit désormais
`stripe_subscription_id`.

### Restant à traiter

- 🔴 **La clé Stripe de `.env.local` est une clé LIVE** (vérifié le 2026-09-11 par
  son préfixe, sans l'afficher) — contrairement à ce que dit le § Abonnements Stripe
  (« mode test »). Un `next dev` local encaisse donc de vrais paiements. Toute
  vérification de configuration faite via la CLI (sandbox) — moyens de paiement,
  portail — est **à refaire en LIVE**.
- **Sondage « motif de résiliation » activé** dans le portail (sandbox) : il ajoute
  une étape. À désactiver, ou à garder strictement facultatif, en live — d'où
  « en quelques clics » dans les CGU, pas un nombre exact.
- ~~**L215-1-1 al. 2 : confirmer la résiliation sur support durable**~~ ✅ couvert par
  l'e-mail `cancellation_confirmation` — voir § E-mails transactionnels ci-dessus.
- ~~**« Comparaison rangs supérieurs »**~~ ✅ retirée de la grille le 2026-09-11 (décision HORTAL) — voir § À faire plus tard.
- Les autres limites de la grille (blocs d'overlay, imports, builds) ne sont pas
  appliquées côté serveur : l'abonné reçoit au moins ce qui est annoncé, sans risque
  juridique, mais la grille ne décrit pas la réalité.
- **Encadré de garantie légale** (CGV § 7) reproduit d'après le modèle du décret
  n° 2022-424 pour les contenus/services numériques : à faire vérifier **mot pour
  mot** contre Légifrance.

---

## 📄 Pages publiques et examen AdSense (chantier du 2026-09-12)

Motif de refus reçu : **« Contenu à faible valeur informative »**. Diagnostic fait à
la main, en récupérant le HTML **sans exécuter de JavaScript** — c'est ce que voit le
robot d'examen :

| Page | Avant | Après |
|---|---|---|
| `/` | **« Chargement... » et rien d'autre** — `page.tsx` court-circuitait sur `loading`, qui vaut `true` au rendu serveur | vitrine complète + section éditoriale · **62 Ko** |
| `/champions` | barre de filtres vide, liste chargée dans un `useEffect` | **173 champions, 173 liens, 175 `alt`** · **232 Ko** |
| `/matches` | outil de recherche, vide par nature | inchangé, mais **`noindex, follow`** |
| `/patch-notes` | déjà solide (SSR, contenu statique riche) | inchangé, + 2 emplacements pub |

### 🔴 La règle générale que ce chantier installe

**Un composant client rend quand même son HTML au SSR — à condition que son parent le
rende.** Les deux pages en défaut ne souffraient pas d'être « clientes » : elles
souffraient d'un **garde de chargement** ou d'un **`useEffect`** placé AVANT le
contenu. Le correctif n'a donc pas été de tout réécrire en Server Component, mais de
retirer ce qui s'interposait.

> ⚠️ Avant de toucher à une page publique, mesurer ce qu'elle SERT :
> `npx next build && grep -c 'Chargement' .next/server/app/<page>.html`
> Le fichier prérendu est la réponse exacte que reçoit un robot.

### `/champions` — Server Component + îlot client

- `src/app/champions/page.tsx` — Server Component, `export const revalidate = 3600`,
  lit `fetchChampionCatalog()` (`src/lib/champions-catalog.ts`) et rend un **chapô
  éditorial** (classes, échelle de difficulté, origine des données).
- `src/components/champions/ChampionsExplorer.tsx` — îlot CLIENT par-dessus une liste
  déjà rendue. **Invariant : l'état initial est `NO_FILTERS`, donc le premier rendu
  contient TOUS les champions.** Ne pas y introduire de pagination ni de filtre par
  défaut sans remesurer le HTML servi — ce serait la coquille vide par un autre chemin.
- Les cartes sont des **`<Link>`**, plus des `div onClick` + `router.push` : les
  ~170 fiches `/champion/[id]` étaient jusque-là **invisibles pour un robot**.
- Le « ← Retour » `router.back()` est devenu un `<Link href="/">` : un bouton qui
  dépend de l'historique ne mène nulle part quand la page est ouverte depuis un
  résultat de recherche.
- Survol et libellés masqués passés en CSS (`.champ-card`, `.sr-only` dans
  `globals.css`) : une carte sans état React est rendable par le serveur, et ~170
  `useState` de survol disparaissent au passage.

### `/` — la vitrine n'attend plus la session

`app/page.tsx` rend directement `user ? dashboard : vitrine`. L'état serveur
(`user === null`) produit donc la vitrine COMPLÈTE.

> ⚠️ **Contrepartie assumée** : un utilisateur connecté voit brièvement la vitrine
> avant que sa session ne soit résolue, là où il voyait « Chargement... ». C'est le
> même transitoire avec un contenu différent — et c'est **déjà** ce que fait le header
> du layout racine, qui passe de `mode="visitor"` à `mode="user"` sur toutes les
> routes. Le supprimer demanderait de lire le cookie Supabase côté serveur, ce qui
> rendrait **tout le site dynamique**, vitrine et pages légales comprises.

Nouvelle section éditoriale `src/components/landing/About.tsx` (+ bloc `about` dans
`locales/landing.ts`, FR/EN) : du **texte suivi**, là où le reste de la vitrine est
fait de titres courts et de cartes. Ton aligné sur le dossier légal — aucune promesse
de résultat en jeu (CGU § 9), non-affiliation à Riot Games rappelée (CGU § 11).

### `/matches` — `noindex, follow`

Page-OUTIL : hors saisie d'un Riot ID, un titre, un paragraphe et un champ. Elle reste
accessible et utilisable ; seule son indexation est retirée.

> ⚠️ `follow: true` et non `noindex, nofollow` : les résultats
> (`/matches/[region]/[riotId]`) portent de vraies données de parties, et ces liens
> sont le seul chemin qui y mène.
>
> ⚠️ Contrairement à ce qu'on croit souvent, cette page **est liée deux fois** depuis
> la navigation globale : « Joueurs » dans le header (`PLAYER_SEARCH_HREF`) et
> « Rechercher un joueur » dans le footer. Ne pas retirer ces liens en croyant « finir
> le travail » — `noindex, follow` est précisément fait pour cette situation.

### Emplacements publicitaires sur les pages PUBLIQUES

`src/components/ads/PublicAdSlot.tsx` — pendant de `DashboardAdRail` hors dashboard.
Il n'ajoute **aucun mécanisme de consentement** : `AdSlot` garde `hasAdConsent()`, qui
reste `false` tant qu'aucune CMP n'existe.

- **`shouldShowPublicAds()`** (`lib/ads.ts`) — le verrou COMMERCIAL, adapté au public :
  session non résolue ⇒ **rien** (sinon 250 px réservés puis retirés = le CLS
  qu'`AdSlot` existe pour éviter) ; visiteur **anonyme** ⇒ **oui**, il est par
  définition sur l'offre gratuite ; visiteur connecté ⇒ `shouldShowAds()` habituel.
  C'est la seule différence avec le rail, et elle est nécessaire : `shouldShowAds(null)`
  vaut `false`, donc appliquer la règle du dashboard n'afficherait **jamais** le
  moindre emplacement là où le site en a besoin.
- **Placement** — format `rectangle-300` (300×250), qui ne touche ni `AD_FORMATS` ni
  `--ad-slot-w` (la variable CSS n'est posée que dans `.dash-adrail`) :

| Page | Emplacements | Où |
|---|---|---|
| `/patch-notes` | 2 | **entre** les patchs, après le 2ᵉ et le 5ᵉ (`AD_AFTER_INDEX`) — jamais à l'intérieur d'un `<article>`, jamais avant le premier |
| `/champions` | 1 | **en fin** de grille (prop `footer`) — la grille n'est jamais coupée en deux |
| `/` et `/matches` | **0** | pas de pub sur la page qui doit convaincre, ni sur une page désindexée |

### Ce qui reste à faire

- **La CMP est toujours absente** : `hasAdConsent()` renvoie `false`, donc les
  emplacements réservent leur espace mais **ne chargent rien**. Tant que c'est le cas,
  aucune impression n'est servie — la demande d'examen peut partir, la monétisation
  non. Voir § Emplacements publicitaires (dashboard) pour la dette associée.
- ~~**`ADSENSE_CLIENT_ID`** porte toujours son `<Todo>`~~ ✅ **CONFIRMÉ PAR HORTAL le
  2026-09-12** sur le Dashboard Google AdSense : `ca-pub-2383615103865834`, la valeur
  que le dépôt portait déjà — rien n'a changé, seul le doute est levé. Le second
  identifiant qui circulait dans les documents du projet
  (`ca-pub-2386151503865834`) était une faute de frappe dans la note, pas dans le code.
- **`/champion/[id]`** (fiche d'un champion) est encore `'use client'` + `useEffect`,
  donc `ƒ` et vide sans JS — ~170 pages dans ce cas. Hors périmètre de ce chantier,
  mais c'est désormais le plus gros gisement de contenu non servi du site, et
  `champions-catalog.ts` fournit déjà la moitié du chemin.

---

## 🌍 Traduction EN des pages légales (chantier du 2026-09-12)

### 🔴 Pourquoi — art. 6 Rome I, pas du confort d'interface

Le contrat conclu par un consommateur résidant dans un autre État membre reste soumis
aux **dispositions impératives de SON droit**, et il ne peut pas être réputé avoir
accepté des conditions qu'il n'était pas en mesure de lire. Un site qui se **présente
en anglais** (vitrine, dashboard, /profil, modale de paiement) et ne propose ses
conditions de vente qu'en français prend donc le risque que le consentement à ces
clauses soit écarté. La traduction est ce qui rend les clauses **opposables** à
l'abonné anglophone — ce n'est pas une amélioration d'ergonomie.

### Architecture — pourquoi le contenu a quitté les `page.tsx`

Le site **n'a pas de routage i18n par URL** : la langue est un état client unique
(`LanguageProvider` + `localStorage` `wf-lang`), partagé par la vitrine, le dashboard
et les pages publiques. Les pages légales étaient des Server Components avec leur
texte en dur — impossible d'y lire la langue.

| Élément | Où |
|---|---|
| Dictionnaires FR/EN des 4 documents | `src/locales/legal/{mentions,confidentialite,cgu,cgv}.tsx` — `xxFr` fait foi, `xxEn: typeof xxFr` |
| Coquille (retour, date, bandeau bêta, nav croisée, pied) | `src/locales/legal/shell.ts` — **module FEUILLE**, voir le cycle ci-dessous |
| Clauses d'abonnement partagées CGU § 8 ↔ CGV § 2-5 | `src/locales/legal/subscription.tsx` (texte) + `src/components/legal/SubscriptionTerms.tsx` (rendu, montants) |
| Assemblage FR/EN pour les tests | `src/locales/legal/index.ts` — **jamais importé par une page** (il tirerait les 4 documents dans chaque bundle) |
| Corps de page, client | `src/components/legal/{MentionsLegales,Confidentialite,Cgu,Cgv}Content.tsx` |
| `page.tsx` | réduits à `metadata` + `<XxxContent />` |
| Helpers `Section` / `List` / `Todo` | **déplacés** de `LegalPage.tsx` vers `LegalBlocks.tsx` |

**⚠️ Le cycle d'imports qu'il ne faut pas réintroduire.** Les dictionnaires rendent
`<Section>` / `<Todo>`, donc ils importent `LegalBlocks`. Si `LegalBlocks` (ou
`LegalPage`) lisait la coquille via `./index`, on aurait
`LegalPage → index → cgu → LegalBlocks → index`. D'où la règle : **`shell.ts` ne doit
rien importer de `./index`**, et `LegalPage` / `LegalBlocks` l'importent en direct.
Même raison pour `SubscriptionTerms.tsx`, qui importe `./subscription` et non l'index.

**Un hook par document** (`useCgv()`, `useCgu()`, `useMentions()`,
`useConfidentialite()`), et pas un `useLegal()` global : chaque page légale est une
route distincte, un hook global ferait entrer les quatre documents dans le bundle de
chacune. Même raisonnement que la séparation `landing` / `dashboard`.

### 🔴 La date de mise à jour est une DATE, plus une phrase

`updated` vaut désormais l'ISO `'2026-09-11'` dans chaque dictionnaire ; `LegalPage`
la formate avec `formatDate(…, lang, { dateStyle: 'long' })`. Deux conséquences :

- les deux langues **ne peuvent pas** annoncer deux dates différentes — pour les CGV,
  cette date EST `CGV_VERSION`, la version enregistrée avec chaque preuve de
  consentement ;
- la `Date` est construite **à partir des composants** (`new Date(y, m - 1, d)`) et
  non par `new Date('2026-09-11')`, qui serait minuit UTC : dans un fuseau à l'ouest
  de Greenwich, la date affichée reculerait d'un jour et ne correspondrait plus à
  `CGV_VERSION`.

### Conventions de traduction (à respecter pour toute nouvelle clause)

- **Dénominations juridiques françaises sans équivalent** (SASU, RCS, SIREN/SIRET,
  « directeur de la publication », franchise en base de TVA) : **conservées en
  français et glosées** entre parenthèses. Traduire « SASU » par « limited company »
  désignerait une autre forme sociale, et le lecteur ne retrouverait pas l'entité
  dans les registres.
- **Références d'articles** : laissées en français (« article L221-18 du Code de la
  consommation ») — c'est ce numéro qui permet de retrouver le texte.
- **Encadré réglementaire de garantie légale** (CGV § 7) : le décret n° 2022-424
  n'impose ce libellé **qu'en français**. La version EN est une traduction de
  courtoisie, annoncée comme telle dans l'encadré ; **c'est le texte français qui
  fait foi**. Ne pas « améliorer » l'un sans l'autre.
- **Noms de paliers** : `profiles.tier` reste « Forgeron » / « Maître » en base, mais
  le libellé AFFICHÉ suit la langue (« Blacksmith » / « Master »), comme la grille
  tarifaire et la modale de paiement. Un contrat qui nommerait le palier autrement
  que l'écran de souscription serait illisible pour l'abonné.
- **Identifiants techniques** (`wf-lang`, `wf.matchups.v2`, `sb-…-auth-token`) : **pas
  traduits** — le lecteur doit les retrouver tels quels dans son navigateur.
- **Aucune divergence de fond entre FR et EN.** Pas une phrase de plus d'un côté que
  de l'autre, même vraie et même utile : une clause présente dans une seule langue
  fait exactement le tort que ce chantier corrige. Les faits qui ne concernent que le
  lecteur anglophone vont dans AGENTS.md, pas dans le contrat.
- **`metadata` reste FR** (titre d'onglet, description) : elle est produite côté
  serveur, où la langue du visiteur n'est pas connue. La traduire supposerait des URL
  localisées, que le site n'a pas.

### Ce que les tests verrouillent

`src/locales/legal/legal.test.ts` (dictionnaires, 28 tests) et
`src/components/legal/LegalPage.test.tsx` (4 pages **rendues** dans les 2 langues,
28 tests) :

- parité de clés FR/EN, aucune section vide, `updated` identique et au format ISO ;
- **aucun titre de section identique au français** — le symptôme du copier-coller non
  traduit. Si un titre devait un jour être légitimement identique, déclarer
  l'exception dans le test plutôt que de le désarmer ;
- **autant de `<Todo>` en EN qu'en FR**, section par section, clauses d'abonnement
  comprises ;
- la bascule change réellement le HTML des 4 pages : coquille, date formatée, nav
  croisée, note de traduction (EN seulement), montants (`3€` / `€3`), noms de paliers ;
- `HEADERLESS_PREFIXES` (`SiteHeader.tsx`) **ne contient aucune route légale** — les
  pages légales n'ont pas de bascule à elles, elle vit dans `Nav` : y masquer le
  header enfermerait un visiteur arrivé en anglais dans un document qu'il ne peut
  plus changer de langue.

### ⏳ Ce qui reste en français — à décider par HORTAL

- ~~**Les e-mails transactionnels d'abonnement**~~ ✅ **TRADUITS le 2026-09-12**,
  chantier séparé — voir § E-mails transactionnels d'abonnement › Langue des e-mails.
  La langue vient de `checkout_consent_log.locale` : celle de la preuve de la commande
  pour `order_confirmation`, la dernière connue du compte pour les deux autres. Repli
  français journalisé. Aucune migration.
- Le **`metadata`** des 4 routes (voir ci-dessus).
- Le **Kit sur mesure**, qui aura ses propres conditions (déjà hors périmètre).

> ✅ L'écart « un lien d'e-mail anglais ouvre la page en français » est corrigé depuis
> le 2026-09-12 : les liens sortants portent `?lang=`, lu par `LanguageProvider`.
> Voir § E-mails transactionnels › Langue des e-mails.

---

## 💰 Modèle freemium (à activer quand Pricing sera réactivé)

### Règle Riot Developer Agreement
- ❌ **Interdit** : vendre l'accès à l'API (paywall absolu sans free tier).
- ✅ **Autorisé** : freemium avec **un free tier qui fonctionne**. C'est le
  modèle de **op.gg, blitz, u.gg, mobalytics** — tous ont des plans payants
  avec des quotas sur de la data Riot.

### Récap du modèle prévu

|                          | FREE | STANDARD | PREMIUM |
|--------------------------|------|----------|---------|
| To-do list               |   3  |    9     |    ∞    |
| Jungle paths             |   3  |    9     |    ∞    |
| Build items              |   3  |    9     |    ∞    |
| Workshop builds (semaine)|   3  |    9     |    ∞    |
| Workshop paths (semaine) |   3  |    9     |    ∞    |
| Match Up (semaine)       |   3  |    6     |    ∞    |
| Post Game (semaine)      |   3  |    9     |    ∞    |
| Stats                    |   ∞  |    ∞     |    ∞    |
| Champions                |   ∞  |    ∞     |    ∞    |
| Cosmétique profil        |  —   |    ✓     |    ✓    |
| Badge supporter          |  —   |    —     |    ✓    |
| Accès anticipé features  |  —   |    —     |    ✓    |

Stats et Champions sont **toujours illimités** : ces écrans sont l'argument
principal pour amener l'utilisateur sur le site (SEO + valeur de découverte),
les paywaller cassera plus de chose que ça ne rapportera.

> ⚠️ **Les deux lignes IA de ce tableau (Match Up, Post Game) sont PÉRIMÉES en tant que
> barème.** Ces features ne comptent plus des analyses par semaine mais débitent un solde
> de crédits fongible (§ Chaleur de la Forge) : Post Game « simple + perso » coûte 6 crédits
> sur Haiku (Apprenti/Forgeron) et 17 sur Sonnet (Maître+), donc ~2 bilans/semaine pour un
> Apprenti et 7 pour un Maître. Le reste du tableau (listes, workshop, cosmétiques) reste la
> cible à implémenter. **Ne pas réintroduire de compteur par feature pour l'IA.**

### Enforcement (à coder le moment venu)

> ✅ **Première brique LIVRÉE (2026-07-21)** — l'infra de quota générique existe et tourne en prod : table `usage_counters` + `consume_ai_quota`/`refund_ai_quota` (migration `20260720000001`), premier consommateur l'EF **`matchup-analyze`** (gating réel par tier Apprenti/Forgeron/Maître, quota atomique serveur, clé Anthropic jamais exposée). C'est le **patron de référence** — le prochain quota (Post Game en tête) le réutilise, il ne se réinvente pas : voir la doc `matchup-analyze` dans la liste des Edge Functions. Le plan ci-dessous reste la cible d'ensemble (généraliser `canAccess`, UI paywall globale, purge/reset).

À prévoir côté DB Supabase :
- Table `usage_counters` (`user_id`, `feature`, `period_start`, `count`)
- Fonction côté backend `canAccess(userId, feature)` qui :
  1. Lit le `tier` actuel de l'user dans `profiles`
  2. Récupère le quota associé au tier pour cette feature
  3. Lit le compteur de la période en cours (`period_start` semaine ou mois)
  4. Retourne `{ allowed: boolean, remaining: number, resetsAt: timestamp }`
- **Reset hebdomadaire** : soit cron Supabase qui purge les compteurs
  expirés, soit check lazy au moment de chaque appel (plus simple).
- Côté UI : afficher le compteur restant ("Il te reste 2/3 analyses cette
  semaine") + paywall popup quand atteint zero.

Pas urgent — la section Pricing est actuellement masquée sur la vitrine.
Quand on la réactivera, on cadrera l'enforcement.

---

### Dette RLS : workshop_junglepaths sans propriétaire
`workshop_junglepaths` n'a pas de colonne `creator_id` — seulement `creator_name`
(texte libre, non vérifiable). L'INSERT est ouvert à tout utilisateur authentifié
mais on ne peut pas identifier le propriétaire d'une ligne.
**⚠️ Choix ASSUMÉ, pas un oubli** : F5 a été tranché par HORTAL (2026-07-16) —
pas de chantier "créateur approuvé" et pas de `creator_id` pour l'instant, reporté
après la beta (pas assez de données d'usage pour justifier la brique maintenant).
L'absence d'attribution fiable est donc une dette **documentée et acceptée** tant
que le Workshop n'a pas d'usage réel. Contexte complet + cadrage conservé pour une
reprise future : voir mémoire `project_f5_workshop_creator_id.md`.
**Piste de reprise (si rouvert)** : ajouter `creator_id UUID REFERENCES auth.users
DEFAULT auth.uid()` puis recréer les policies `wjp_update_owner` / `wjp_delete_owner`
en conséquence — nécessite au préalable que le WPF publie sous JWT user (pas anon).

---

## 🔴 Module prac (prac.wyrm-forge.com) — SUPPRIMÉ le 2026-09-11

> **Journal de chantier — ne décrit plus rien d'existant.** Module retiré en entier
> sur décision HORTAL (retrait complet, pas de dépréciation) : il n'était pas utilisé
> et ne devait pas l'être en l'état. Le retrait couvre les 5 sections « Module prac »
> de ce document — socle, chantiers 3, 4, 5 et Search.
>
> Retiré du dépôt : `src/app/prac/**`, `src/app/consent/page.tsx`, `src/lib/prac.ts`,
> `ConsentBanner.tsx`, le bloc `consent` de `locales/dashboard/profil.ts` et ses deux
> helpers, le routage de sous-domaine de `proxy.ts`. Supprimées du projet Supabase :
> les EF `prac-track` et `prac-notify`. Base : migration
> `20260911000002_drop_prac.sql` — 5 tables, 14 fonctions, 3 policies, 4 triggers, le
> secret Vault `prac_webhook_secret` et la ligne `prac_enabled` de `app_settings`.
>
> ⚠️ **Le module contenait de vraies données personnelles**, contrairement aux
> tournois : une personne tierce avait accepté d'être suivie le 2026-07-01, et son
> adresse e-mail figurait en clair dans `prac_notification_log.recipient`. Ces lignes
> ont été exportées hors dépôt avant purge.
>
> Effet de bord notable : `prac-notify` était le **seul** consommateur de Resend dans
> le projet. Son retrait a rendu `_shared/resend.ts` orphelin (supprimé), sorti Resend
> de la liste des sous-traitants de `confidentialite/page.tsx`, et laissé le Lot 3 du
> Kit sans transport e-mail décidé — voir la note de ce lot.
>
> Tout ce qui suit est conservé comme historique, et **ne doit jamais être lu comme
> l'architecture courante**.

Outil interne réservé aux **admins prac** (HORTAL/Ewen) pour suivre la performance de joueurs Wyrm Forge dans le temps. Partage la base d'utilisateurs (pas d'identité séparée). Découpage : **1) socle** (fait) → 2) roster+consentement → 3) tracking (résolution par créneau + désambiguïsation) → 4) pages (liste, top-5 winrate, détail joueur) → 5) email Resend.

### Durcissement F1/F2/F4 — migration `20260901000002`

> ✅ **APPLIQUÉE ET VALIDÉE sur test ET prod le 2026-09-01**, par `db push` manuel depuis le terminal, sondes A→F vertes des deux côtés : `anon` renvoie `42501` sur `scenarios`, `prac_admins` et `prac_top_winrate` ; le trigger F4 se déclenche ; le CRUD utilisateur est intact ; et sous JWT d'admin prac, `prac_admins_lisible = 1`, `is_prac_admin = true`, roster lisible.
>
> ⚠️ **Le message du commit `13369ec` affirme à tort « PAS ENCORE APPLIQUEES ».** Il a été rédigé sans connaissance du `db push` manuel déjà effectué : **l'application a précédé le commit** qui a introduit les fichiers dans le dépôt. L'historique git n'est pas réécrit — **c'est cette section qui fait foi**, exactement comme l'en-tête de `20260901000001` au Lot 5E fait foi contre sa propre prescription périmée.

Trois écarts au moindre privilège relevés par un audit manuel du module. Aucun n'était un trou exploitable ; tous trois **amendent ce que décrit le Socle ci-dessous**.

⚠️ Ne pas confondre avec les lots `F*` de juillet (`20260715000001_f2_search_path_increment_fns`, `20260715000002_f4_restrict_insert_certified`, `20260716000002_f4bis…`) : autre audit, autres tables. La numérotation F1/F2/F4 ci-dessous est propre au module prac.

- **F1 — `REVOKE ... FROM PUBLIC` était un no-op.** Les `ALTER DEFAULT PRIVILEGES` de Supabase accordent EXECUTE **nominativement** à `anon` sur toute nouvelle fonction de `public` : un REVOKE sur le pseudo-rôle PUBLIC ne retire pas un grant nominatif. Les 11 fonctions du module — `is_prac_admin`, `prac_caller_puuid`, `prac_caller_in_match`, `prac_player_stats`, `prac_related_players`, `prac_search_profiles`, `prac_top_winrate`, `prac_visible_match_ids`, `request_tracking`, `remove_tracking`, `respond_consent` — reçoivent donc un `REVOKE ALL ... FROM anon` explicite. Même motif que `20260731000002` pour d'autres fonctions.
  > ⚠️ **`authenticated` n'est PAS touché, et ne doit jamais l'être** : `is_prac_admin` est appelée **à l'intérieur** des policies `tp_select` / `tm_select`, où l'expression s'évalue avec les droits du rôle appelant. Lui retirer EXECUTE casserait toute lecture de `tracked_players`. Cinq de ces fonctions sont par ailleurs appelées depuis le navigateur (`prac_player_stats`, `prac_search_profiles`, `prac_top_winrate`, `request_tracking`, `respond_consent`) — toujours sous JWT `authenticated`, derrière la garde de session du layout `/prac` ou le `getUser()` de `/consent`.
- **F2 — `prac_admins` a reçu le patron des 4 autres tables du module** (`REVOKE ALL FROM anon, authenticated` puis GRANT minimal, cf. `20260627000003`), et `pa_select_self` la clause `TO authenticated` qui lui manquait — sans elle, la policy visait PUBLIC, `anon` compris. Avant, ce qui protégeait la table n'était pas un privilège mais le prédicat `auth.uid() = user_id` s'évaluant à NULL : même fragilité que `scenarios`.
  > ⚠️ Le `GRANT SELECT ON public.prac_admins TO authenticated` est **obligatoire, pas cosmétique** : `src/app/prac/layout.tsx` lit la table sous JWT utilisateur pour décider de l'accès au shell. Sans lui, **tout `/prac` tombe en 403**. C'est le seul endroit du lot où une erreur casse quelque chose de visible.
- **F4 — le modèle de consentement est devenu une contrainte de base.** Trigger `trg_tracked_matches_require_consent` (BEFORE INSERT sur `tracked_matches`) qui refuse tout parent dont le statut n'est pas `accepted`, via un `SELECT ... FOR SHARE` sur la ligne de `tracked_players`. Le verrou le sérialise avec le `FOR UPDATE` que `respond_consent` prend au revoke, donc un INSERT concurrent et une révocation ne peuvent plus se croiser. **Défense en profondeur** : sur le chemin nominal, `prac_commit_tracked_matches` lève déjà `player_not_accepted` avant d'insérer — le trigger ne se déclenche jamais. Les messages sont repris **à l'identique** pour que le mapping 403/404 de l'EF `prac-track` continue de fonctionner. Ce que ça ferme : une future EF en service_role, un backfill ou un `INSERT` manuel en SQL Editor, qui contournaient tous la règle sans rien violer.

### Socle (chantier 1 — migration 20260626000001)
- **Table `prac_admins`** (`user_id` PK → `auth.users`, `granted_by`, `created_at`) : allowlist **plate**, sans scopes (≠ `tournament_admins` volontairement — pas de hiérarchie). RLS : SELECT self-only (`pa_select_self`) ; aucune écriture client (service_role uniquement). **Amorçage manuel** (BOOTSTRAP commenté dans la migration).
- **Fonction `is_prac_admin(p_uid)`** : SECURITY DEFINER, STABLE, `REVOKE FROM PUBLIC` + `GRANT authenticated`. Lit `prac_admins` en bypass RLS.
- **Sous-domaine** : `proxy.ts` — `NEXT_PUBLIC_PRAC_HOST` → rewrite interne `/prac/*` (CAS 3) ; host principal + `/prac*` → 308 vers le sous-domaine (CAS 4). Routes **plates** (pas de normalisation de casse, contrairement à tournois). En local/preview (host non câblé), `/prac/*` fonctionne en direct.
- **Garde d'accès** : `src/app/prac/layout.tsx` (server, `force-dynamic`) — non connecté ou non admin prac → redirect `NEXT_PUBLIC_SITE_URL`. Détection via lecture directe `prac_admins` (RLS self-read).

### Roster & consentement (chantier 2, lot A — migration 20260626000002)

#### Table `tracked_players`

| Colonne | Type | Nullable | Notes |
|---|---|---|---|
| `id` | `uuid` | NOT NULL | PK, default `gen_random_uuid()` |
| `profile_id` | `uuid` | NOT NULL | FK → `profiles(id)` (= `auth.users.id`) ON DELETE CASCADE — joueur tracké |
| `added_by` | `uuid` | NOT NULL | FK → `auth.users` — admin prac demandeur |
| `status` | `text` | NOT NULL | `'pending'`\|`'accepted'`\|`'declined'`\|`'revoked'` — CHECK constraint, default `'pending'` |
| `requested_at` | `timestamptz` | NOT NULL | default `now()` — (ré)ouverture de la demande |
| `responded_at` | `timestamptz` | nullable | posé à la réponse du joueur (lot B), remis à `NULL` à la réouverture |
| `updated_at` | `timestamptz` | NOT NULL | default `now()` — trigger `trg_tracked_players_updated_at → fn_set_updated_at()` |

Contrainte `uq_tracked_players_profile UNIQUE (profile_id)` — **un seul dossier par joueur** (pas d'historique de demandes ; la réouverture réécrit la ligne existante).

#### Frontière de sécurité — RLS only
- **RLS activée**, une **seule** policy : `tp_select` (SELECT) = `is_prac_admin(auth.uid()) OR auth.uid() = profile_id`. L'admin prac voit tout le roster ; un joueur voit uniquement sa propre ligne.
- **Aucune policy INSERT/UPDATE/DELETE** → deny total pour les rôles client (RLS activée + absence de policy). `GRANT SELECT` à `authenticated` uniquement (`anon` : aucun accès).
- **Toute écriture passe par des fonctions SECURITY DEFINER** (owned `postgres` → bypass RLS, droits re-vérifiés en interne via `is_prac_admin(auth.uid())`). La garde n'est PAS le layout Next — c'est la RLS + les fonctions.

#### Fonctions (SECURITY DEFINER, `SET search_path = public`, `REVOKE FROM PUBLIC` + `GRANT authenticated`)

| Fonction | Description |
|---|---|
| `request_tracking(p_profile_id uuid) → uuid` | Admin crée OU rouvre une demande. Vérifie `is_prac_admin` (sinon `RAISE 'not_prac_admin'`). Retourne l'id du dossier. |
| `remove_tracking(p_profile_id uuid) → void` | Admin retire le joueur du roster (DELETE du dossier). Vérifie `is_prac_admin` (sinon `RAISE 'not_prac_admin'`). |

> 🟡 **Dette connue — `remove_tracking` est un point d'entrée mort.** Constaté le 2026-09-01 : la fonction n'a **aucun appelant** dans `src/` ni dans `supabase/functions/` — le retrait d'un joueur du roster n'est exposé nulle part dans l'UI prac. Elle reste néanmoins `GRANT EXECUTE ... TO authenticated`, donc appelable en RPC par n'importe quel compte connecté (sa garde interne `is_prac_admin` tient : un non-admin reçoit `not_prac_admin`). **Non corrigée volontairement** — hors périmètre du lot de durcissement F1/F2/F4, qui ne retire que le grant d'`anon`. À trancher plus tard : soit brancher l'appel côté UI, soit retirer le grant `authenticated` (voire la fonction) si le retrait de roster passe définitivement par service_role.

**`request_tracking` — comportement par statut existant :**
- **absence de dossier** → INSERT (`status='pending'`, `added_by=auth.uid()`).
- **`pending` / `accepted`** (déjà actif) → `RAISE EXCEPTION 'already_tracked'`.
- **`declined` / `revoked`** → **réouverture** : la ligne repasse `status='pending'`, `added_by`/`requested_at` réécrits, `responded_at = NULL`.

> ⚠️ **`revoked` est réouvrable exactement comme `declined`** — décision de cadrage actée (lot A), **pas un oubli**. Un joueur qui a révoqué son consentement peut être re-sollicité par l'admin (nouvelle demande `pending`), à lui de réaccepter ou non.

**`remove_tracking` — cascade `tracked_matches` :** le DELETE du dossier `tracked_players` cascadera vers `tracked_matches` au **chantier 3** (FK `tracked_player_id ... ON DELETE CASCADE`). Contrat figé, **pas encore actif** (table `tracked_matches` non créée à ce stade) — rien à faire côté `remove_tracking` aujourd'hui.

### Réponse du joueur (chantier 2, lot B — migration 20260627000001)

Fonction **`respond_consent(p_decision text) RETURNS text`** — pendant *côté joueur* du couple admin `request_tracking`/`remove_tracking`. Même style que les fonctions du lot A : SECURITY DEFINER, `SET search_path = public`, `REVOKE EXECUTE FROM PUBLIC` + `GRANT authenticated`.

- **Cible = `auth.uid()` uniquement** : la fonction n'a **aucun paramètre d'id**. Elle lit/écrit la seule ligne `WHERE profile_id = auth.uid()` (verrouillée `FOR UPDATE` pour sérialiser double-clic / appels concurrents). Répondre pour un autre profil est **impossible par construction**.
- **Retour** : le nouveau `status` (text).

#### Machine d'états (transitions valides — tout le reste → `invalid_transition`)

| `p_decision` | statut courant | → nouveau statut |
|---|---|---|
| `accept` | `pending` | `accepted` |
| `accept` | `revoked` | `accepted` (ré-acceptation après révocation) |
| `decline` | `pending` | `declined` |
| `revoke` | `accepted` | `revoked` |

Toute autre combinaison (`accept` sur `accepted`/`declined`, `decline` hors `pending`, `revoke` hors `accepted`, etc.) lève `invalid_transition`. `declined` est **terminal côté joueur** : seul l'admin via `request_tracking` (lot A) le rouvre vers `pending`.

Sur transition valide : `UPDATE status = <nouveau>, responded_at = now()` (le trigger `trg_tracked_players_updated_at` bumpe `updated_at`).

#### Erreurs levées

| Exception | Déclencheur |
|---|---|
| `invalid_action` | `p_decision` hors `('accept','decline','revoke')` — levée **avant** tout accès à la ligne |
| `no_consent_request` | aucun dossier `tracked_players` pour `auth.uid()` |
| `invalid_transition` | décision incompatible avec le statut courant (voir tableau) |

> ⚠️ **Purge `tracked_matches` sur `revoke` : PAS implémentée ici.** La table `tracked_matches` n'existe pas encore. Un commentaire SQL dans le corps de `respond_consent` marque le contrat figé : au **chantier 3**, un trigger AFTER UPDATE purgera les matchs du joueur révoqué (`accepted → revoked`). À ne pas oublier à la création de la table.

### Lot C — page `/consent` + bandeau dashboard

Interface **joueur** du flow de consentement. Vit côté **site public** (`src/app/consent/page.tsx`), **hors `src/app/prac/`** → aucune garde `prac_admins` : le joueur n'est pas admin prac. Client component calqué sur `/profil` (`src/app/profil/page.tsx`) — palette fixe, cards inline, pas de design system dédié. Lecture **directe** du dossier via la policy RLS `tp_select` du lot A (`.eq('profile_id', user.id).maybeSingle()`, **aucune nouvelle policy**) ; écriture via RPC `supabase.rpc('respond_consent', { p_decision })` (lot B).

#### Machine d'affichage `/consent` (statut → rendu → boutons)

| Statut du dossier | Affichage | Boutons (→ `respond_consent`) |
|---|---|---|
| **aucun dossier** | message neutre « aucune demande en cours » | — |
| `pending` | explication + date de demande | **Accepter** (`accept`) / **Refuser** (`decline`) |
| `accepted` | pill verte « Suivi actif » | **Révoquer** (`revoke`) |
| `declined` | pill grise « Demande refusée » | **aucun** |
| `revoked` | pill grise « Suivi révoqué » | **Réactiver** (`accept`) |

- `declined` est **terminal côté joueur** : **pas de bouton Accepter** (la fonction lèverait `invalid_transition` ; seul l'admin rouvre via `request_tracking`).
- `revoked` a un bouton **Réactiver** car `accept: revoked → accepted` est une transition valide.
- **Gestion d'erreur RPC** : toute exception (`no_consent_request`, `invalid_transition`, `invalid_action`) est traduite en FR **et déclenche un re-`load()` de resync** — couvre la concurrence (état changé / dossier retiré par l'admin entre l'affichage et le clic) sans crash. Resync DB après chaque action réussie.
- Non connecté → carte « Connecte-toi » (pas d'erreur).

#### `ConsentBanner` (bandeau dashboard) — `src/components/dashboard/ConsentBanner.tsx`

Signale une demande **en attente** depuis n'importe quel onglet du dashboard.

- **Condition d'affichage** : **uniquement** `status='pending'` pour `auth.uid()`. Tout autre état (ou aucun dossier) → invisible.
- **Emplacement** : tout en haut de `<main className="dash-main">` dans `Dashboard.tsx`, au-dessus du header de titre → visible quel que soit l'onglet actif.
- **Motif réutilisé** : `DeletionRequest` de `/profil` — composant **isolé** avec son propre `useEffect`, `return null` tant que `loading` **et** si pas de dossier pending (aucun flash, aucun layout shift).
- **Check non bloquant** : point-lookup `.eq('profile_id', user.id).eq('status','pending').maybeSingle()` (le `profile_id` unique-indexé rend le lookup ponctuel), exécuté **dans le composant**, **jamais** en `await` dans le chemin de chargement principal de `page.tsx` → coût imperceptible pour les joueurs sans dossier (immense majorité). Lien vers `/consent`.

## 🔴 Module prac — chantier 3 (Tracking) — SUPPRIMÉ le 2026-09-11

> Journal de chantier. Module retiré en entier le 2026-09-11 — voir le bandeau de la
> section « Module prac (prac.wyrm-forge.com) ».

### Lot 3A — table `tracked_matches` (schéma, RLS, purge) [migrations 20260627000002 + 000003]

Matchs trackés d'un joueur suivi : **pointeur** (vers `tracked_players` + match Riot) + **snapshot dénormalisé immuable** — uniquement ce que les pages du ch4 consomment (liste + agrégats). Le payload Riot complet n'est **pas** dupliqué : le détail d'un match se lit en réutilisant `/match/[region]/[matchId]`.

#### Schéma `tracked_matches`

| Colonne | Type | Notes |
|---|---|---|
| `id` | `uuid` | PK, `gen_random_uuid()` |
| `tracked_player_id` | `uuid` | NOT NULL, FK → `tracked_players(id)` **ON DELETE CASCADE** — pointeur + ownership RLS + cascade `remove_tracking` |
| `match_id` | `text` | NOT NULL — id Riot (`EUW1_…`) |
| `region` | `text` | NOT NULL — plateforme au track → lien `/match/[region]/[matchId]` |
| `added_by` | `uuid` | NOT NULL, FK `auth.users` — admin prac |
| `created_at` | `timestamptz` | default `now()` |
| `game_creation` | `timestamptz` | NOT NULL — `to_timestamp(gameCreation/1000)` (fenêtre + tri + affichage) |
| `champion_id` / `champion_name` | `int` / `text` | liste + top-champions |
| `queue_id` | `int` | |
| `win` | `boolean` | winrate (cœur ch4) |
| `kills` / `deaths` / `assists` | `int` | KDA |
| `cs` | `int` | CS/min avec `duration_s` |
| `duration_s` | `int` | |
| `position` | `text` | rôle |
| `vision_score` / `damage_dealt` / `gold_earned` | `int` | agrégats détail joueur |

Contrainte `uq_tracked_matches_player_match UNIQUE (tracked_player_id, match_id)` (dédup). Index `idx_tracked_matches_player_time (tracked_player_id, game_creation DESC)` (liste + agrégats). **Pas de `updated_at`** — snapshot immuable, aucun chemin UPDATE. Items/runes/timeline **exclus** (→ réutilisation `/match`).

#### RLS `tracked_matches` (miroir `tracked_players`)
- SELECT `tm_select` : `is_prac_admin(auth.uid()) OR EXISTS (SELECT 1 FROM tracked_players tp WHERE tp.id = tracked_matches.tracked_player_id AND tp.profile_id = auth.uid())` → admin voit tout, joueur voit ses propres matchs via le pointeur.
- Aucune policy INSERT/UPDATE/DELETE → écritures via l'EF `prac-track` (service_role, lot 3B) uniquement.
- **Moindre privilège explicite** : `REVOKE ALL FROM anon, authenticated` puis `GRANT SELECT TO authenticated` (anon zéro accès). Nécessaire car les DEFAULT PRIVILEGES Supabase accordent ALL aux deux rôles sur toute nouvelle table — la migration 000003 applique le même correctif à `tracked_players` (dette Lot A : `GRANT SELECT` sans `REVOKE` préalable).

#### Purge — deux mécanismes distincts et complémentaires
- **`remove_tracking`** (DELETE de la ligne `tracked_players`) → **FK `ON DELETE CASCADE`** supprime les `tracked_matches`. Suffit, aucun trigger.
- **`revoke`** (`respond_consent` UPDATE status='revoked', la ligne reste) → la FK cascade ne se déclenche pas sur UPDATE. Trigger `trg_tracked_players_purge_on_revoke` AFTER UPDATE `WHEN (NEW.status='revoked' AND OLD.status IS DISTINCT FROM 'revoked')` → `fn_purge_tracked_matches_on_revoke()` (SECURITY DEFINER, `search_path=public`) → `DELETE FROM tracked_matches WHERE tracked_player_id = NEW.id`.
- Le `IS DISTINCT FROM` est un garde-fou défensif : la seule transition atteignable vers `revoked` est `accepted → revoked` (respond_consent, lot B). Le trigger BEFORE UPDATE `trg_tracked_players_updated_at` (lot A) ne crée aucun conflit (phase + table cible différentes).

### Lot 3B — EF `prac-track` + fonction `prac_commit_tracked_matches` [migration 20260627000004]

EF `supabase/functions/prac-track/index.ts` — tracking de matchs, **admin prac uniquement**. POST, JWT obligatoire vérifié en code (`getUser` → 401), `verify_jwt = false` dans `config.toml` (convention projet, comme `tournament-admin`). Garde **globale** `is_prac_admin(auth.uid())` via `db.rpc('is_prac_admin', { p_uid: user.id })` (service_role, l'uid est un paramètre) **avant le dispatch** → 403 sinon, donc toute action est gardée par défaut. Un seul client `db` (service_role) — pas de `userDb` (aucune RPC à `auth.uid()` interne ; les écritures passent par la fonction SECURITY DEFINER ci-dessous).

#### Action `resolve` — lecture seule
Entrée : `{ action:'resolve', tracked_player_id, from, to, start? }` (`from`/`to` ISO, `start` 0–200 défaut 0).
- Lit `status` + `riot_puuid`/`riot_platform` du joueur (`tracked_players`⋈`profiles`, service_role).
- Exige `status='accepted'` (**résolution post-consentement uniquement** — cadrage) → 403 sinon.
- `riot_puuid IS NULL` → **400** `{ code:'player_not_linked' }`.
- Appelle `riot-matches ?puuid&platform&count=20&start` (fetch interne, `apikey` anon) → **1 appel Riot**, mis en cache (clé `matches:{platform}:puuid:{puuid}:{start}:20`, TTL 3 min).
- Filtre `gameCreation ∈ [from,to]` (epoch ms), flag `already_tracked` (SELECT `tracked_matches`).
- Sortie : `{ candidates:[{ match_id, game_creation, champion_name, queue_id, win, kills, deaths, assists, already_tracked }], start, count }`. Aucune écriture.

#### Action `commit` — écriture idempotente
Entrée : `{ action:'commit', tracked_player_id, match_ids[] (1–20), start? }`. Le `start?` (ajout au contrat initial) sert à **re-fetcher la même page** que le resolve (donc **cache HIT**) pour les fenêtres paginées (`start>0`). Défaut 0.
- Check rapide (fail-fast pré-réseau) `status='accepted'` + puuid.
- Re-appelle `riot-matches` (mêmes params → cache HIT) et **ré-extrait le snapshot CÔTÉ SERVEUR** pour chaque `match_id` demandé (jamais les stats client — seuls les `match_id` sont de confiance). `match_id` absent de la page → `not_found[]` ; si **tous** absents → 404.
- Appelle `prac_commit_tracked_matches(p_tracked_player_id, p_added_by, p_rows jsonb)` (SECURITY DEFINER, REVOKE PUBLIC, service_role only) qui écrit atomiquement.
- Sortie : `{ inserted, skipped, not_found }`. `skipped` = doublons déjà trackés. Mapping erreurs RPC : `player_not_accepted` → 403, `tracked_player_not_found` → 404.

#### Garde de concurrence — fermeture de la fenêtre de race
`status='accepted'` est **re-vérifié au commit** (pas seulement au resolve) car un revoke peut arriver entre les deux (fenêtre de plusieurs centaines de ms pendant l'appel réseau). Via PostgREST, un `SELECT status` puis un `INSERT` sont deux transactions séparées non verrouillables entre elles → fenêtre TOCTOU. Une contrainte DB (`CHECK`/FK) ne peut pas référencer `tracked_players.status`.

Mécanisme : appel réseau + extraction snapshot **hors verrou** dans l'EF ; puis `prac_commit_tracked_matches`, **dans une seule transaction** : `SELECT status FROM tracked_players WHERE id = p_tracked_player_id **FOR SHARE**` → `RAISE 'player_not_accepted'`/`'tracked_player_not_found'` → `INSERT ... jsonb_to_recordset(p_rows) ON CONFLICT (tracked_player_id, match_id) DO NOTHING`. Le `FOR SHARE` entre en conflit avec le `FOR UPDATE` que `respond_consent` (lot B) prend déjà sur la même ligne au revoke → les deux chemins se **sérialisent** : revoke d'abord ⇒ relit `revoked` ⇒ RAISE, 0 insert ; commit d'abord ⇒ le revoke attend puis son trigger AFTER UPDATE purge les lignes fraîches. **Aucun `tracked_matches` orphelin ne survit au revoke.**

#### Idempotence silencieuse
`ON CONFLICT DO NOTHING` + `{ inserted, skipped, not_found }` plutôt qu'un 409 dur : `commit` est un batch ; un doublon (concurrence inter-admins ou rejeu) ne doit pas faire échouer tout le lot. L'autorité de dédup est la contrainte `uq_tracked_matches_player_match`, pas le flag `already_tracked` du resolve (indicatif UI). Discipline réseau : **1 appel `riot-matches` par resolve**, commit réutilise le cache (TTL 3 min).

#### Codes HTTP
200 · 400 (payload/fenêtre ; `player_not_linked` + `code`) · 401 (JWT) · 403 (non admin prac, OU joueur non/plus accepted) · 404 (tracked_player_id introuvable, OU aucun match_id trouvé) · 405 (non POST).

### Lot 3C — UI `/prac/ajouter` + action `list`

#### Page `/prac/ajouter` (`src/app/prac/ajouter/page.tsx`)
UI de désambiguïsation, **admin prac only** (garde portée par `src/app/prac/layout.tsx` → `prac_admins`). Client component, palette du shell prac. Flux : **picker joueur** (action `list`) → **fenêtre `[from, to]`** (datetime-local) → **`resolve`** → liste des candidats avec **cases à cocher**, matchs `already_tracked` **grisés + non sélectionnables** (jamais de devinette) → **`commit`** de la sélection → bannière `{ inserted, skipped, not_found }` + re-resolve auto (rafraîchit les flags). Joueur non lié → résolution désactivée + avertissement. Appels via `src/lib/prac.ts` (`callPracTrack`, calqué sur `ecailles.ts`/`tournois.ts`). Nav du layout : « Ajouter un joueur » → `Link` vers `/prac/ajouter`.

#### Action `list` (ajoutée à `prac-track`)
`{ action:'list' }` → joueurs `accepted` + identité d'affichage `{ tracked_player_id, username, game_name, tag_line, platform, linked }` (service_role). **Pourquoi via service_role** : un admin prac **n'est pas forcément admin site** (`prac_admins` ≠ `admin_users`/`profiles.role`), donc le client ne peut **pas** lire les `profiles` des autres joueurs via RLS → la lecture des noms passe par l'EF en service_role, gardée par `is_prac_admin`.

#### Défense en profondeur dans `handleList`
En plus de la garde globale (avant dispatch), `handleList` **re-vérifie `is_prac_admin(uid)`** en première ligne (403 sinon). **Redondance volontaire, commentée explicitement comme telle dans le code** : `list` renvoie le roster complet (données protégées par le consentement du ch2) ; si un futur refactor déplaçait le dispatch avant la garde globale, ce re-check resterait la dernière barrière. Ce n'est **pas** du code mort à nettoyer. (resolve/commit non dupliqués : déjà couverts par la garde globale + leurs gardes données ; exigent un `tracked_player_id` connu, pas d'énumération en masse.)

#### Incident de déploiement (leçon)
Pendant 3C, l'action `list` est apparue non gardée en test HTTP (200 pour un non-admin) alors que **la source était correctement gardée** (garde globale avant dispatch). Cause : **la build déployée était désynchronisée de la source** (redéploiement périmé de l'EF). Leçon : **après toute modification du code d'une EF, redéployer puis vérifier la version déployée AVANT de tester** — ne pas diagnostiquer un comportement surprenant comme un bug source sans avoir confirmé que le déploiement reflète la source.

## 🔴 Module prac — chantier 4 (Pages) — SUPPRIMÉ le 2026-09-11

> Journal de chantier. Module retiré en entier le 2026-09-11 — voir le bandeau de la
> section « Module prac (prac.wyrm-forge.com) ».

### Lot 4A — fonctions d'agrégats `prac_top_winrate` + `prac_player_stats` [migration 20260628000001]

Deux fonctions SECURITY DEFINER (`SET search_path = public`, `LANGUAGE plpgsql`) qui alimentent les pages du chantier 4. Validées 7/7 en conditions réelles (SQL Editor distant) le 2026-06-28.

#### Frontière d'accès — contraste VOLONTAIRE avec `get_rank_avg`
`get_rank_avg` agrège des moyennes **par rang** (zéro PII) → aucune garde, `GRANT anon, authenticated`. Ces deux fonctions exposent des **identités réelles** (`username`) de joueurs trackés → frontière plus stricte : **`REVOKE EXECUTE FROM PUBLIC` + `GRANT authenticated` uniquement (jamais `anon`)** + garde interne obligatoire. Seul le squelette « SECURITY DEFINER + agrégats » est hérité de `get_rank_avg`, pas la portée d'accès. **Ne pas « corriger » vers anon par analogie.**

| Fonction | Garde | Sortie |
|---|---|---|
| `prac_top_winrate(p_min_matches int DEFAULT 5)` | **admin prac only** — `RAISE 'not_prac_admin'` si `NOT is_prac_admin(auth.uid())` | TABLE `(tracked_player_id, profile_id, username, games, wins, winrate, avg_kda, avg_cs_per_min)`, `HAVING count(*) >= p_min_matches`, `ORDER BY winrate DESC, games DESC, username`. Classement accueil / top-5 (4C). |
| `prac_player_stats(p_tracked_player_id uuid)` | **`is_prac_admin OR self`** (voir ordre anti-énumération) | TABLE 1 ligne `(tracked_player_id, profile_id, username, games, wins, losses, winrate, avg_kda, avg_kills, avg_deaths, avg_assists, avg_cs_per_min, avg_vision_score, avg_damage_dealt, avg_gold_earned, top_champions jsonb)`. Fiche détail (4B/4D). |

`top_champions` = top 3 champions **par games**, chacun `{ champion, games, wins, winrate }`, trié `c_games DESC, c_wins DESC, champion_name`. `'[]'::jsonb` si aucun match.

#### Ordre des gardes anti-énumération (`prac_player_stats`)
La cible est résolue **différemment selon le statut de l'appelant**, pour ne pas créer d'oracle d'existence des `tracked_player_id` :
- **admin prac** → autorisé sur tout joueur → lookup sans filtre owner → `RAISE 'not_found'` si absent (révélation honnête, l'admin est légitime).
- **non-admin** → lookup borné `WHERE tp.id = p_id AND tp.profile_id = auth.uid()` → `RAISE 'not_authorized'` si rien (qu'il s'agisse d'un id inexistant OU du dossier d'autrui : **même erreur**, indistinguable).

Conséquence prouvée par les tests T6/T7 : un non-admin sur un dossier existant d'autrui obtient `not_authorized` ; un admin sur un id inexistant obtient `not_found`. L'erreur dépend de l'appelant, jamais de l'existence de la cible côté non-admin.

#### Protection division par zéro (formules)
- `winrate = wins / NULLIF(games, 0) * 100` → `COALESCE(..., 0)`
- `avg_cs_per_min = Σcs / NULLIF(Σduration_s, 0) * 60` → `COALESCE(..., 0)`
- `avg_kda = (ΣK + ΣA) / NULLIF(ΣD, 0)` → si `ΣD = 0`, fallback « KDA parfait » = `ΣK + ΣA` ; puis `0` si aucun match (player_stats).

#### ⚠️ Piège résolu — ambiguïté de colonne dans le CTE (NE PAS réintroduire)
Dans `prac_player_stats`, la colonne **OUT** `tracked_player_id` du `RETURNS TABLE` est une variable plpgsql en scope dans tout le corps. Le CTE `m AS (SELECT * FROM tracked_matches WHERE tracked_player_id = p_tracked_player_id)` levait `42702: column reference "tracked_player_id" is ambiguous` (collision OUT-var ↔ colonne table). **Fix : aliaser la table** → `SELECT tmx.* FROM public.tracked_matches tmx WHERE tmx.tracked_player_id = p_tracked_player_id`. Règle générale : dès qu'une fonction `RETURNS TABLE` a une colonne OUT homonyme d'une colonne de table référencée dans le corps, **qualifier la colonne par un alias de table**. `prac_top_winrate` n'était pas touché (déjà aliasé `tm`/`tp`). Bug invisible en relecture, attrapé uniquement à l'exécution réelle.

#### Tests (`supabase/tests/20260628000001_prac_aggregates_test.sql`)
Pas de stack locale → 7 blocs `BEGIN/ROLLBACK` indépendants pour le **SQL Editor distant**, `auth.uid()` piloté par `SET LOCAL ROLE authenticated` + `set_config('request.jwt.claims', …)`. Les blocs data-dependent **seedent leurs matchs AVANT le `SET LOCAL ROLE`** (tracked_matches n'a aucune policy INSERT client → insert sous rôle postgres), puis rollback. UUID réels réutilisés (pas de seed `auth.users` fictif). Couverture : garde admin (T1), seuil (T2), division par zéro (T3), agrégats + top_champions (T4), vue self (T5), anti-énumération not_authorized/not_found (T6/T7).

### Lot 4B — pages admin liste + détail joueur

Deux pages client (`'use client'`) sous le shell `/prac` (garde `prac_admins` portée par `src/app/prac/layout.tsx`). Palette inline réutilisée de `/prac/ajouter` (fond sombre, Cinzel, card `rgba(255,255,255,0.03)`, accent `#EF9F27`). Lien nav « Players suivis » dans le layout.

#### `src/app/prac/joueurs/page.tsx` — roster complet
**Option a actée : roster COMPLET, joueurs à 0 match tracké NON masqués** (affichés « — » — c'est l'info utile à l'admin qui n'a encore rien tracké). Deux sources fusionnées **côté client** sur `tracked_player_id` :
- **EF `prac-track` `{action:'list'}`** → roster des `accepted` + identité (service_role : un admin prac n'est pas forcément admin site → ne peut pas lire `profiles` d'autrui via RLS).
- **RPC direct `prac_top_winrate(1)`** → winrate/games/KDA des seuls joueurs ayant ≥1 match (INNER JOIN → exclut les 0-match, qui gardent « — » après merge).

Tri : joueurs avec parties d'abord (winrate desc), puis le reste (alpha). Chaque ligne → `Link` vers `/prac/joueurs/[tracked_player_id]`.

#### `src/app/prac/joueurs/[id]/page.tsx` — détail joueur
`[id]` = `tracked_player_id` (lu via `useParams`). **Deux lectures directes, AUCUNE EF** :
- **RPC direct `prac_player_stats(id)`** → agrégats + `top_champions` (SECURITY DEFINER, garde `is_prac_admin OR self` ; sous `/prac` l'appelant est admin → branche admin). Erreurs mappées FR : `not_found` → « Joueur introuvable. », `not_authorized` → « Accès non autorisé. ».
- **SELECT direct `tracked_matches`** via RLS `tm_select` (l'admin prac voit tout) — `order game_creation desc`.

Rendu : tuiles d'agrégats (winrate, KDA, CS/min, vision, dégâts, or, K/D/A), bloc top champions, liste des matchs. **Chaque match → `Link` vers `/match/[region]/[matchId]`** (réutilisation du rendu existant, cadrage ; `region` = `tracked_matches.region`). État vide propre si 0 match.

#### `src/lib/prac.ts` — types + helpers (chantier 4)
Types `TopWinrateRow`, `PlayerStats`, `TopChampion`, `TrackedMatchRow`. Helpers : `num()` (⚠️ **PostgREST renvoie les `numeric` en STRING**, `bigint` en number → normalisation obligatoire à l'affichage), `matchKda()` / `csPerMin()` (division par zéro protégée côté front, miroir des fonctions SQL). RPC appelées en **direct `supabase.rpc`** (pas via l'EF) car `GRANT authenticated` + garde interne.

### Lot 4C — accueil top-5 winrate

`src/app/prac/page.tsx` (remplace le placeholder checklist du socle, **converti server → client** `'use client'`). **Vitrine, pas roster** : n'affiche QUE les joueurs classés.
- **RPC direct `prac_top_winrate(3)`** — `MIN_MATCHES = 3` (seuil « joueur classé », cadrage 4C). Pas d'EF (contrairement à `/prac/joueurs` qui a besoin du roster complet via EF `list`) : le top-5 = joueurs ayant ≥3 parties trackées uniquement, donc le RPC suffit (il joint `profiles` en interne).
- **`slice(0, 5)` côté client** — la fonction trie déjà `winrate DESC, games DESC`, on coupe à 5.
- Cartes classées : badge de rang or/argent/bronze (#1-3) puis neutre, bordure dorée pour #1, winrate vert/rouge (≥50 %), sous-ligne `games · KDA · cs/min` + `xV yD`. Chaque carte → `Link` vers `/prac/joueurs/[id]`.
- **État vide géré** (`rows.length === 0`, cas < 1 joueur classé) : message clair « pas encore assez de données … au moins 3 parties » + lien vers `/prac/joueurs`. Plus loading/erreur. Jamais de page cassée.

> **Chantier 4 (Pages) clos pour 4A/4B/4C.** Sous-lot **4D (vue joueur self)** livré ci-dessous (4D-1).

### Lot 4D-1 — bloc « Ton suivi » (vue self) sur `/consent`

Vue self du joueur sur ses propres données trackées. **Vit sur `/consent`** (site public, hors gating `/prac` — le joueur n'est pas admin prac), **pas** sur une route `/mon-suivi` dédiée : `/consent` est déjà la destination du joueur (ConsentBanner, futur email ch5) et l'endroit naturel de la transparence « qu'est-ce qu'on suit de moi ». **100 % front** — aucune migration (schéma prêt depuis 4A).

- **Condition d'affichage** : bloc rendu **uniquement quand `status='accepted'`** (sous le bloc « Suivi actif » existant). `declined`/`revoked` → aucun bloc (sur revoke, le trigger de purge a déjà supprimé les matchs → rien à montrer).
- **Données** : le `load()` de `/consent` sélectionne désormais aussi **`id`** de `tracked_players` (la policy `tp_select` retourne déjà la ligne propre du joueur). Cet id alimente :
  - **`supabase.rpc('prac_player_stats', { p_tracked_player_id: id })`** — branche self (validée 4A T5).
  - **SELECT direct `tracked_matches`** via RLS `tm_select` (branche self : le joueur voit ses propres lignes).
- **Rendu** : composant local `SelfTracking` re-rendu dans la **palette `/consent`** (`var(--text-muted)`, bordure `#7F77DD`) — **pas** la palette shell prac. Choix : re-render local plutôt qu'extraction d'un composant partagé avec le détail admin 4B (évite de toucher la page admin committée ; bloc auto-contenu). Réutilise les helpers/types de `src/lib/prac.ts` (`num`, `matchKda`, `csPerMin`, `queueLabel`, `PlayerStats`, `TrackedMatchRow`).
- Affiche tuiles (winrate, KDA, CS/min, vision, dégâts, or), top champions, liste des parties suivies → chaque match `Link` vers `/match/[region]/[matchId]`. **État 0-match géré** : « Aucune partie suivie pour l'instant. ».

## 🔴 Module prac — recherche/ajout de joueur (Search) — SUPPRIMÉ le 2026-09-11

> Journal de chantier. Module retiré en entier le 2026-09-11 — voir le bandeau de la
> section « Module prac (prac.wyrm-forge.com) ».

### Search-1 — fonction `prac_search_profiles` [migration 20260628000002]

Recherche de profils par un admin prac pour alimenter l'UI « Ajouter un joueur » (qui appelle ensuite `request_tracking`). Validée 7/7 contre le remote le 2026-06-28.

**Signature** : `prac_search_profiles(p_query text, p_limit int DEFAULT 10)` — SECURITY DEFINER, `SET search_path = public`, `LANGUAGE plpgsql`.

**Pourquoi SECURITY DEFINER** : la RLS de `profiles` n'autorise un user qu'à lire SON profil (`auth.uid()=id OR is_admin()`). Un admin prac n'est pas forcément admin site → ne peut pas lister les autres profils. La fonction bypasse la RLS en tant qu'owner, **sans ajouter de policy ni élargir l'accès du site**, bornée par :
- **Garde** `is_prac_admin(auth.uid())` → `RAISE 'not_prac_admin'` sinon.
- **`REVOKE EXECUTE FROM PUBLIC` + `GRANT authenticated`** (jamais anon).
- Appel en **RPC direct** `supabase.rpc` (définer + gardée — pas d'EF, pattern 4A/4C).

**Comportement** :
- Recherche `username ILIKE '%q%' OR riot_gamename ILIKE '%q%'`.
- **Escaping LIKE** : les métacaractères `\ % _` de `p_query` sont échappés (backslash d'abord) → saisie traitée LITTÉRALEMENT, pas de joker injecté.
- **Seuil ≥ 2 caractères** (après `trim`) : sinon `RETURN` sans résultat (anti-dump, pas d'erreur).
- **Limite bornée** `LEAST(GREATEST(p_limit,1), 25)`.
- **Tri** : correspondances par **préfixe d'abord** (`(username ILIKE q||'%') OR (riot_gamename ILIKE q||'%') DESC`), puis `username` (collation base : MAJUSCULES avant minuscules).

**Champs retournés (minimaux)** : `profile_id (=id)`, `username`, `riot_gamename`, `riot_tagline`, `riot_platform`, `linked` (`riot_puuid IS NOT NULL`), `tracking_status` (LEFT JOIN `tracked_players` → `status` ou `NULL`). **Exclus volontairement** : `email`, `role`, `tier`, `riot_puuid` brut, `created_at`. Le contrat est prouvé structurellement (test T7 : `SELECT email FROM prac_search_profiles(...)` → `42703 column does not exist`).

`tracking_status` pilote l'UI Search-2 : `NULL` → bouton « Suivre » (`request_tracking`) ; `pending` → « en attente » ; `accepted` → « déjà suivi » (lien détail) ; `declined`/`revoked` → « renvoyer une demande » (réouverture par `request_tracking`).

**Note perf** : `ILIKE` non sargable → seq scan sur `profiles` (table interne, ~4 lignes → négligeable). Si la base grossit, ajouter un index trigram/`text_pattern_ops`.

**Tests** (`supabase/tests/20260628000002_prac_search_profiles_test.sql`) : 7 blocs `BEGIN/ROLLBACK` distants sur profils réels (pas de seed). Couverture : garde (T1), username+tracking_status accepted (T2), riot_gamename+linked+status NULL (T3), seuil <2 (T4), limite+ordre (T5), escaping `%%` (T6), contrat no-PII (T7).

### Search-2 — UI `/prac/ajouter-joueur` + relabel nav

Page client (`'use client'`) sous le shell `/prac` (garde `prac_admins`). **DISTINCTE de `/prac/ajouter`** (qui tracke des *matchs* d'un joueur déjà suivi) : ici on ajoute un joueur au **roster** (demande de suivi).

- **Flow** : champ de recherche **débouncé (300 ms)** → `supabase.rpc('prac_search_profiles', { p_query })` (RPC direct, < 2 caractères = aucun appel, cohérent avec le seuil serveur) → liste de résultats. Bouton par ligne **selon `tracking_status`** :
  - `null` → **« Suivre »** → `supabase.rpc('request_tracking', { p_profile_id })`.
  - `declined`/`revoked` → **« Renvoyer une demande »** (même RPC `request_tracking` qui rouvre vers `pending`).
  - `pending` → pill **« Demande en attente »** (pas d'action).
  - `accepted` → pill **« Déjà suivi »** (pas d'action).
  - **Re-search (resync) après chaque action** dans tous les cas — couvre la concurrence (`already_tracked` → message FR + resync).
- **Relabel nav** (`src/app/prac/layout.tsx`) : l'entrée existante **`/prac/ajouter`** passe de « Ajouter un joueur » (libellé trompeur — la page s'appelle « Ajouter des matchs ») à **« Tracker des matchs »**, et une nouvelle entrée **« Ajouter un joueur »** pointe vers `/prac/ajouter-joueur`. Nav prac à 4 entrées : Accueil · Players suivis · Ajouter un joueur · Tracker des matchs.
- **Raccourci** : bouton **« + Ajouter un joueur »** en tête de `/prac/joueurs` → `/prac/ajouter-joueur`.
- Type `ProfileSearchResult` ajouté à `src/lib/prac.ts`. Palette shell prac réutilisée.

> **Périmètre prac cadré ce jour terminé** : chantiers 1-4 (4A/4B/4C) + 4D (vue self) + Search (recherche/ajout roster). Chantier 5 (email Resend de notification de demande de suivi) **en cours** — Lot 5B livré ci-dessous.

## 🔴 Module prac — chantier 5 (Notification email Resend) — SUPPRIMÉ le 2026-09-11

> Journal de chantier. Module retiré en entier le 2026-09-11 — voir le bandeau de la
> section « Module prac (prac.wyrm-forge.com) ».
>
> ⚠️ C'est le chantier qui a introduit Resend dans le projet. Resend n'a plus aucun
> consommateur depuis, et le helper `_shared/resend.ts` a été supprimé. Le patron
> claim-then-send décrit ici reste une bonne référence ; le code se relit par
> `git show 6b46bde:supabase/functions/prac-notify/index.ts`.

Notifier le joueur par e-mail quand un admin prac ouvre (ou rouvre) une demande de suivi. Découpage : **5B** squelette EF log-only (fait) → **5C** table `prac_notification_log` (idempotence — fait) → 5D envoi Resend réel → 5E câblage du Database Webhook → 5F finitions.

### Lot 5B — squelette EF `prac-notify` (log-only)

EF `supabase/functions/prac-notify/index.ts` — **squelette sans envoi Resend** (l'envoi arrive au 5D). Pose la mécanique : réception webhook → vérif secret → filtrage transition → résolution destinataire → **`console.log` structuré de ce qui SERAIT envoyé**. `verify_jwt = false` dans `config.toml`.

- **Déclenchement (câblage 5E, pas encore actif)** : Database Webhook Supabase sur `tracked_players` (INSERT + UPDATE) → POST `/functions/v1/prac-notify`. L'appelant est Postgres (pg_net), pas un navigateur — pas de JWT user.
- **Sécurité — `X-Internal-Token`** : `verify_jwt=false` (comme `prac-track`/`tournament-admin`), seule barrière = header `X-Internal-Token` comparé à `PRAC_WEBHOOK_SECRET` (secret Supabase) **en code** → **401** si absent/incorrect (et non 403 : l'appelant est un service interne, pas un user authentifié). Sans ce check l'EF serait un **open relay** (déclenchement d'e-mails par n'importe qui). Comparaison directe `===` (token haute entropie), même esprit que le `X-Internal-Token` de `patch-notes-generator`.
- **Format payload Database Webhook** (standard, confirmé) : `{ type: 'INSERT'|'UPDATE'|'DELETE', table, schema, record, old_record }`. `record` = ligne NEW (null en DELETE) ; `old_record` = ligne OLD (null en INSERT).
- **Règle de filtrage (en code — les webhooks n'ont pas de condition par colonne)** : ne traiter QUE les transitions où `status` DEVIENT `'pending'` :
  - **INSERT** avec `record.status === 'pending'` → transition **`'initial'`** (demande initiale).
  - **UPDATE** avec `record.status === 'pending'` ET `old_record.status ∈ {'declined','revoked'}` → transition **`'reopen'`** (réouverture par `request_tracking`).
  - Tout le reste (accepted/declined/revoked en eux-mêmes, `pending→pending`, DELETE, autre table) → **ignoré** : `200 { ignored: true }` (le webhook attend une réponse même si l'événement est ignoré).
- **Résolution destinataire — source canonique** : email lu via `db.auth.admin.getUserById(record.profile_id)` (service_role) → **`auth.users.email`**. PAS `profiles.email` (simple copie faite à la création, susceptible de dériver). `profiles.id = auth.users.id = record.profile_id` → lookup direct par id.
- **Réponses** : pertinent → `200 { would_send: true, transition, profile_id, email }` + `console.log('prac-notify: would send consent request email', {transition, profile_id, email})`. Email introuvable → `200 { would_send: false, reason: 'no_email'|'lookup_error' }` + `console.error` (un retry du webhook ne réparerait pas un lookup d'id, d'où le 200). `profile_id` manquant → `200 { ignored: true, reason: 'missing_profile_id' }`.
- **Codes HTTP** : 200 (pertinent log-only OU ignoré) · 400 (JSON invalide) · 401 (token interne absent/incorrect) · 405 (non POST).
- **Tests (5/5 validés en HTTP réel, secret synchronisé)** : sans token → 401 ; mauvais token → 401 ; INSERT pending → `would_send:true`/`initial` ; UPDATE declined→pending → `would_send:true`/`reopen` ; UPDATE revoked→pending → `would_send:true`/`reopen` ; UPDATE pending→accepted → `ignored:true` ; UPDATE accepted→revoked → `ignored:true`. Contraste `would_send` vs `ignored` conforme.

### Lot 5C — table `prac_notification_log` (idempotence)

Migration `20260630000001_prac_notification_log.sql`. Journal d'envois de notifications prac : une ligne = une tentative de notification pour **une instance de demande**. Sert UNIQUEMENT l'idempotence de l'EF `prac-notify` (consommée au 5D). Validée 4/4 (+1 contraste) contre le remote (à exécuter au déploiement, blocs `BEGIN/ROLLBACK` distants).

#### Schéma

| Colonne | Type | Notes |
|---|---|---|
| `id` | `bigint` | PK GENERATED ALWAYS AS IDENTITY |
| `tracked_player_id` | `uuid` | NOT NULL, FK → `tracked_players(id)` **ON DELETE CASCADE** |
| `requested_at` | `timestamptz` | NOT NULL — l'instance de demande notifiée (= `record.requested_at` du webhook) |
| `channel` | `text` | default `'email'` (extensible) |
| `recipient` | `text` | email au moment de l'envoi (audit ; nullable) |
| `status` | `text` | `'pending'`\|`'sent'`\|`'failed'` — CHECK, default `'pending'` |
| `provider_message_id` | `text` | id Resend (nullable) |
| `error` | `text` | message d'échec (nullable) |
| `created_at` / `updated_at` | `timestamptz` | trigger `trg_prac_notification_log_updated_at → fn_set_updated_at()` |

Contrainte `uq_prac_notif UNIQUE (tracked_player_id, requested_at, channel)` — **clé d'idempotence** + crée l'index btree du claim `ON CONFLICT` (aucun index supplémentaire).

#### Clé d'idempotence — articulation avec le flux
- **Retry / double-livraison du webhook** pour la même demande → même `requested_at` → conflit → skip (**at-most-once par demande**).
- **Réouverture** (`request_tracking` : `declined`/`revoked` → `pending`) remet `requested_at = now()` → clé neuve → **nouvelle notification autorisée**. `tracked_player_id` (= `tracked_players.id`) est **stable** à travers les réouvertures (UPDATE de la même ligne) → bon ancrage + porte la cascade FK.

#### Frontière de sécurité — service_role ONLY (modèle `app_events`, PAS `tracked_matches`)
Le joueur ne lit JAMAIS ce journal (audit interne pur). Donc RLS activée + **aucune policy** + `REVOKE ALL FROM anon, authenticated` **sans aucun `GRANT SELECT`** → un client `authenticated` (même admin prac) obtient **`permission denied` (42501)**, garantie plus forte qu'un filtrage RLS à 0 ligne. `role_table_grants` ne retourne **aucune** ligne pour anon/authenticated (vérifié explicitement, test T4). `service_role` conserve ses privilèges par défaut Supabase (writes EF 5D).

#### Conservation sur révocation
Contrairement à `tracked_matches` (purgé sur `revoke` car donnée Riot sensible), ce journal est **CONSERVÉ** sur `revoked` — c'est un log d'envoi (audit), pas de la donnée joueur. Supprimé uniquement si le dossier `tracked_players` est supprimé (`remove_tracking` → FK ON DELETE CASCADE, test T3).

#### ⚠️ Dette connue V1 — pas de reclaim time-based
L'EF 5D ne re-tentera un envoi que sur une ligne `status='failed'`. Une ligne restée **`'pending'`** (crash de l'EF entre le claim et l'UPDATE de statut) **ne se débloque JAMAIS automatiquement** → le joueur concerné pourrait **ne jamais recevoir sa notification, sans alerte**. Accepté pour la V1 (cas rare : fenêtre de crash de quelques ms). À traiter plus tard si besoin : reclaim des `'pending'` plus vieux que N minutes, ou job de supervision. **Ne pas confondre avec un bug** — déviation actée.

### Lot 5D — envoi Resend réel (claim-then-send) [migration 20260630000002]

Passe l'EF `prac-notify` du log-only (5B) à l'**envoi réel**. Validé 4/4 en conditions réelles (cas A/B/C/D — 3 vrais e-mails Resend reçus, idempotence + reclaim `failed` confirmés).

#### Helper `_shared/resend.ts` — premier transport e-mail du projet
`sendEmail({ to, subject, html, text?, from? }) → { ok, status, id?, error? }`. **Ne throw JAMAIS sur erreur HTTP** (ni réseau) : retourne `{ ok:false, status, error }` pour que l'appelant décide (marquer `'failed'` + laisser le webhook retenter). **Throw uniquement si `RESEND_API_KEY` absent** (mauvaise config serveur, via `requireSecret`). `from` par défaut = `Wyrm Forge <noreply@wyrm-forge.com>` (domaine vérifié, DKIM Cloudflare) — surchargeable. Réutilisable au-delà de prac. Secret requis : `RESEND_API_KEY`.

#### Flux claim-then-send (EF `prac-notify`)
Après filtrage transition (5B) + résolution destinataire (`auth.users.email`) :
1. **CLAIM atomique** via `prac_notify_claim(p_tracked_player_id, p_requested_at, p_channel, p_recipient) → bigint` (SECURITY DEFINER, `REVOKE FROM PUBLIC`, service_role only). En **une seule instruction** (pas de fenêtre TOCTOU entre livraisons concurrentes du webhook) : `INSERT ... ON CONFLICT (tracked_player_id, requested_at, channel) DO UPDATE SET status='pending', recipient=EXCLUDED.recipient, error=NULL, updated_at=now() **WHERE prac_notification_log.status='failed'**` + `RETURNING id`. Le prédicat `WHERE status='failed'` sur le DO UPDATE fait tout le tri :
   - jamais notifiée → INSERT ligne `'pending'` → renvoie l'id (**on possède l'envoi**).
   - ligne `'failed'` → re-claim (repasse `'pending'`) → renvoie l'id (**retry après échec Resend**).
   - ligne `'sent'` ou `'pending'` in-flight → conflit non éligible → `RETURNING` ne renvoie rien → **`NULL`** → EF répond `200 { skipped:true, reason:'already_notified' }`, **aucun envoi** (at-most-once par demande).
2. **ENVOI Resend** (`sendEmail`) uniquement si un id a été claimé.
3. **Finalisation** : succès → `UPDATE status='sent', provider_message_id` → `200 { sent:true }`. Échec → `UPDATE status='failed', error` (tronqué 500 car) → **`500`** (le webhook retentera → `prac_notify_claim` re-claimera la ligne `'failed'`).

#### Template inline (prac-notify seul consommateur)
`buildEmail(transition, username, siteUrl)` construit `{ subject, html, text }` inline (pas de moteur de templates — un seul consommateur). **Sujet différencié `initial` vs `reopen`** (« Demande de suivi prac » vs « Nouvelle demande de suivi prac »). `username` **best-effort** : lu depuis `profiles.username` dans un `try/catch` qui ne bloque jamais l'envoi ; `null`/vide → salutation générique (« Salut, »). CTA vers `${SITE_URL}/consent`. Fond `#1A1A1A`, accent `#EF9F27` (charte).

#### Dette V1 (rappel)
Reclaim **uniquement sur `'failed'`** : une ligne restée `'pending'` (crash EF entre claim et UPDATE final) ne se re-débloque pas automatiquement → notification perdue silencieusement. Déviation actée (voir dette V1 du lot 5C ci-dessus), pas un bug.

### Lot 5E — déclencheur de `prac-notify` (trigger versionné + secret en Vault)

> ✅ **État au 2026-09-01 — MIGRATION APPLIQUÉE ET TOKEN TOURNÉ, sur test ET prod.**
> `20260901000001_prac_notify_webhook_vault.sql` (commit `0280b0f`) est poussée sur les deux projets — sur la prod, le `db push` a affiché le `NOTICE` de suppression de l'ancien webhook Dashboard. Les deux secrets Vault (`prac_webhook_secret`, `prac_notify_url`) existent partout, et **le token a été tourné le 2026-09-01**, avec une valeur **différente par environnement**. La section « État HISTORIQUE » plus bas ne décrit plus rien de vivant : elle est conservée pour comprendre d'où l'on vient.
>
> Contrôle de l'état en place, si un doute subsiste :
> ```sql
> SELECT t.tgname, p.proname
>   FROM pg_trigger t
>   JOIN pg_class c ON c.oid = t.tgrelid
>   JOIN pg_proc  p ON p.oid = t.tgfoid
>  WHERE c.relname = 'tracked_players' AND NOT t.tgisinternal;
> ```
> Attendu : `prac_notify_tracked_players | prac_notify_webhook`. Un `http_request` signalerait un retour en arrière — base reconstruite sans la migration, ou restauration d'un dump antérieur.

#### État ACTUEL (en place sur test et prod depuis le 2026-09-01)

Le déclencheur est un **trigger versionné**, `prac_notify_tracked_players`, créé par migration sur `public.tracked_players` (AFTER INSERT OR UPDATE, FOR EACH ROW). Il appelle `public.prac_notify_webhook()`, qui à **chaque appel** lit dans Vault le token et l'URL, construit l'en-tête en mémoire et POSTe via `net.http_post`. Plus rien de sensible dans le catalogue, et le trigger porte **le même nom sur toutes les bases**.

⚠️ **Pré-requis MANUEL, à faire AVANT le `db push`, sur CHAQUE environnement.** Les deux valeurs sont propres à l'environnement, elles n'entrent donc pas dans Git — c'est le seul geste manuel qui reste :

| Secret Vault | Contenu |
|---|---|
| `prac_webhook_secret` | la valeur exacte du secret Edge Function `PRAC_WEBHOOK_SECRET` |
| `prac_notify_url` | `https://<project-ref>.supabase.co/functions/v1/prac-notify` du projet courant |

```sql
select vault.create_secret('<valeur>', 'prac_webhook_secret', 'En-tete X-Internal-Token du webhook prac-notify');
select vault.create_secret('https://<project-ref>.supabase.co/functions/v1/prac-notify', 'prac_notify_url', 'URL de l EF prac-notify appelee par le trigger tracked_players');
```

**Si Vault n'est pas renseigné** : `RAISE WARNING` dans les logs Postgres, aucun POST, et **l'INSERT/UPDATE sur `tracked_players` passe quand même**. Choix délibéré — une config de notification manquante ne doit pas casser l'ouverture d'une demande de suivi. Contrepartie assumée : l'e-mail est perdu silencieusement pour l'admin, visible seulement dans les logs. C'est aussi ce qui rend la migration rejouable sur un environnement vierge sans danger : sans secret Vault le trigger existe mais ne poste **nulle part**, en particulier jamais vers la prod — ce qu'une URL en dur dans la migration aurait provoqué.

**`net.http_post`, pas `extensions.http_post`.** Mesuré sur la prod le 2026-09-01 : `http_post` vit dans le schéma `net`, alors même que la baseline porte `CREATE EXTENSION pg_net WITH SCHEMA extensions`. `pg_net` crée son propre schéma `net` indépendamment du schéma déclaré à l'installation. Le piège est réel : lire le `CREATE EXTENSION` de la baseline conduit à conclure `extensions.http_post`, et c'est faux. L'appel est qualifié en dur dans la fonction, `search_path` réduit à `pg_catalog, net`.

#### État HISTORIQUE (supprimé le 2026-09-01 — conservé pour l'archéologie)

Jusqu'au 2026-09-01, un **Database Webhook créé à la main dans le Dashboard** (Database → Webhooks), non exportable en migration, donc absent de toute base reconstruite. Sa config **avant suppression** :

| Champ | Valeur |
|---|---|
| Name | `prac-notify-tracked-players` (prod) / `prac-notify-consent` (test) |
| Table | `public.tracked_players` |
| Events | **INSERT + UPDATE** (pas DELETE) |
| Type | HTTP Request → POST |
| URL | `https://cuscgmgqakxnfwnsrhhv.supabase.co/functions/v1/prac-notify` |
| HTTP Header | `X-Internal-Token: <valeur de PRAC_WEBHOOK_SECRET>` |

> 🔴 **C'est précisément ce que la migration corrige** : les arguments de `supabase_functions.http_request()` — dont ce header — sont stockés **en clair dans `pg_trigger.tgargs`**. `prac-notify` tournant en `verify_jwt=false`, ce header est sa **seule** barrière : le lire, c'est pouvoir déclencher des e-mails à volonté (open relay) et brûler les créneaux d'idempotence de `prac_notify_claim`.

> ⚠️ **Le nom du webhook DIFFÈRE entre les deux bases** (constaté le 2026-08-15) : prod `prac-notify-tracked-players`, test `prac-notify-consent`. Piège de diagnostic — chercher `prac-notify-consent` sur la prod ne renvoie rien et donne l'impression que le webhook est absent. **Vérifier par la table, pas par le nom.** La migration fait disparaître cette divergence : elle supprime les anciens triggers **par leur définition** (tout trigger de `tracked_players` passant par `supabase_functions.http_request`), pas par leur nom, justement parce que les noms ne sont pas alignés.

#### Rotation du token — procédure de référence (ordre EF-first)

> ✅ **Jouée le 2026-09-01 sur test puis prod**, tokens distincts par environnement, canari vert sur les deux. Cette section décrit la procédure telle qu'elle a réellement été exécutée : la rejouer telle quelle pour toute rotation future.

Le token a vécu en clair dans `pg_trigger.tgargs`. La migration ne fait que le **déplacer** dans Vault, elle ne le **tourne** pas — la rotation est un geste séparé.

**Le piège central** : la valeur doit être identique côté Vault (lue par le trigger à chaque appel) ET côté variable d'environnement de l'EF (qui la compare) **au même instant**. Tant que les deux divergent, `secretsMatch()` échoue → `401` → et **`pg_net` NE REJOUE PAS** : les notifications de cette fenêtre sont **perdues, pas retardées**. À faire à une heure creuse.

##### L'ordre : Edge Function d'abord, Vault en dernier

> ⚠️ **C'est l'inverse de ce que prescrivaient les versions antérieures de ce document et l'en-tête de la migration `20260901000001`** (qui disaient Vault → EF → deploy). Cette prescription était mauvaise : **ne pas la restaurer**. L'en-tête de la migration n'est volontairement pas corrigé — on ne réécrit pas un fichier de migration déjà appliqué ; **c'est cette section qui fait foi**.

Les deux côtés n'ont pas du tout la même dynamique :

| Côté | Vitesse de propagation | Bord observable ? |
|---|---|---|
| `vault.update_secret` | **immédiate et atomique** — `prac_notify_webhook()` relit `vault.decrypted_secrets` à chaque appel, la transaction suivante voit la nouvelle valeur | **oui**, au commit près |
| `supabase secrets set` | **lente et non déterministe** — l'env est injecté au **boot de l'isolate** ; un isolate chaud garde l'ancienne valeur jusqu'à recyclage. Seul un `functions deploy` force le basculement | **non** — on ne voit pas mourir le dernier isolate portant l'ancien env |

Conséquence directe sur la fenêtre de `401` :

- **Vault d'abord** (l'ancienne prescription) → la fenêtre s'ouvre au commit SQL et se ferme *quand le dernier isolate portant l'ancien env disparaît*. Bord de fermeture **hors de contrôle et inobservable** : 30 s à plusieurs minutes. Et si le deploy échoue, on est en panne avec un correctif à trouver sous pression.
- **EF d'abord** → la fenêtre s'ouvre pendant le `secrets set` / `deploy` et se ferme **à l'instant précis** où l'on lance l'instruction Vault, qui prend quelques millisecondes. Tant que Vault n'est pas basculé, le système reste fonctionnel et un échec de deploy se rejoue **sans dégât** — la base n'a pas été touchée.

> 🧭 **Principe général, réutilisable hors de ce contexte.** Quand une bascule doit être simultanée des deux côtés, on fait passer en premier l'opération **lente, faillible et non observable**, et on garde l'opération **instantanée, atomique et fiable** pour **fermer** la fenêtre. L'ordre inverse concentre l'incertitude sur le bord qu'on ne maîtrise pas.

Deux corollaires pratiques :

- **Préparer l'étape Vault *entièrement* avant de lancer le deploy** (SQL prêt, valeur déjà en place, curseur dans l'éditeur). La fenêtre se réduit alors au temps entre « le deploy rend la main » et « Run » — 1 à 2 s au lieu d'une minute. C'est le levier qui compte le plus.
- **Un seul acteur doit posséder les deux bords.** Répartir le deploy et le `Run` SQL entre deux intervenants — ou entre un agent et un humain — réintroduit une latence de passage de relais bien plus grande que la fenêtre qu'on cherche à supprimer. Lors de la rotation du 2026-09-01, c'est ce constat qui a fait basculer l'exécution vers un script PowerShell unique lancé par l'opérateur, plutôt qu'un enchaînement agent → humain.

##### Séquence effective

Sur **chaque** projet — test d'abord, prod seulement après un canari vert sur test — avec un **token différent par environnement** (une compromission du test ne doit pas donner la prod) :

0. `git status --porcelain -- supabase/functions/prac-notify supabase/functions/_shared` → **doit être vide**. `functions deploy` expédie l'arbre **local**, pas le dernier commit : une modification non commitée partirait avec la rotation, et l'on aurait deux changements dans la même fenêtre — diagnostic impossible en cas de `401`.
1. Générer le token **sans jamais l'afficher** — 32 octets de RNG cryptographique en hex (64 caractères). Aucun format n'est imposé : Vault stocke du `text` libre et `secretsMatch()` compare des SHA-256, donc même la longueur ne fuit pas. L'hex évite tout échappement shell ou env.
2. SQL Editor **ouvert sur le bon projet**, onglet vide, curseur dedans.
3. `supabase secrets set "PRAC_WEBHOOK_SECRET=<token>" --project-ref <ref>`
4. `supabase functions deploy prac-notify --project-ref <ref>` — **le redéploiement est obligatoire, pas optionnel** : c'est lui qui rend l'instant du basculement déterministe. Un `secrets set` seul laisse les isolates chauds sur l'ancienne valeur pour une durée indéterminée.
5. **Immédiatement** : le bloc `do $$ … $$;` ci-dessous.
6. Contrôles + canari (section suivante).
7. Nettoyage : **supprimer le snippet du SQL Editor** — il est persisté côté serveur, le token y resterait en clair, ce qui annulerait une partie du bénéfice de la rotation — puis vider le presse-papier.

> ⚠️ **`--project-ref` est obligatoire, pas décoratif** : le projet lié par défaut de la CLI est la **prod** (`cuscgmgqakxnfwnsrhhv`). Une commande sans le flag tape sur la prod, y compris quand on croit travailler sur le projet de test.

`vault.update_secret`, **jamais `create_secret`** — un doublon rendrait la valeur lue par le trigger indéterminée (son `max(case … end)` prendrait l'une des deux). Version qui échoue bruyamment plutôt que de ne rien faire silencieusement, `update_secret(null, …)` ne mettant rien à jour :

```sql
do $$
declare v_id uuid;
begin
  select id into v_id from vault.secrets where name = 'prac_webhook_secret';
  if v_id is null then
    raise exception 'prac_webhook_secret absent de Vault - NE PAS CONTINUER.';
  end if;
  perform vault.update_secret(v_id, '<nouvelle valeur>');
end
$$;
```

##### Vérification post-rotation — le canari à effet nul (méthode standard)

**À rejouer tel quel à chaque rotation**, sur chaque projet, avant de passer au suivant. Ne pas réinventer une validation ad hoc — et surtout **ne pas valider en créant une vraie demande de suivi** : cela enverrait un e-mail réel et brûlerait un créneau d'idempotence de `prac_notify_claim`.

**1. La bascule Vault a bien eu lieu** (n'affiche aucune valeur) :

```sql
select name, created_at, updated_at, now() - updated_at as depuis
  from vault.secrets
 where name in ('prac_webhook_secret', 'prac_notify_url');
```

Attendu : `prac_webhook_secret` → `updated_at` à l'instant, **`created_at` INCHANGÉ** (un `created_at` qui bouge trahit un doublon créé par `create_secret`). `prac_notify_url` → les deux inchangés.

**2. Le canari** — rejoue le chemin *exact* du trigger (lecture Vault → construction de l'en-tête → comparaison côté EF) sans toucher à `tracked_players` ni envoyer d'e-mail :

```sql
select net.http_post(
  url     => (select decrypted_secret from vault.decrypted_secrets where name = 'prac_notify_url'),
  body    => jsonb_build_object('type','UPDATE','table','tracked_players','schema','public',
                                'record','{}'::jsonb,'old_record','{}'::jsonb),
  params  => '{}'::jsonb,
  headers => jsonb_build_object(
               'Content-Type','application/json',
               'X-Internal-Token',(select decrypted_secret from vault.decrypted_secrets where name = 'prac_webhook_secret')),
  timeout_milliseconds => 5000
) as request_id;
```

**Pourquoi c'est sans effet** : `record` vide → `relevantTransition()` sort dès `newStatus !== 'pending'` → `200 { ignored: true }`. Aucun envoi Resend, aucune ligne dans `prac_notification_log`. Le canari passant par l'URL **lue dans Vault**, il valide au passage `prac_notify_url` : une URL corrompue se verrait ici.

**3. Lire la réponse**, 2-3 s plus tard :

```sql
select id, status_code, timed_out, error_msg, left(content, 200) as content, created
  from net._http_response
 order by created desc
 limit 3;
```

| Résultat | Lecture |
|---|---|
| `200` + `{"ignored":true}` | ✅ Vault et EF alignés — rotation réussie |
| `401` + `{"error":"Authentification interne requise."}` | ❌ désalignement : deploy non propagé, ou valeur Vault ≠ valeur EF. Rejouer la séquence complète, qui regénère et réaligne les deux côtés |
| aucune ligne | worker `pg_net` pas encore passé, ou lignes expirées (TTL ~6 h) — relancer la lecture |

**Confirmation e2e optionnelle**, qui valide en plus le trigger lui-même et pas seulement le couple Vault/EF. Un `UPDATE` no-op ne peut structurellement pas produire d'e-mail, `reopen` exigeant `old ∈ {declined, revoked}` **et** `new = 'pending'` — impossible quand `old = new` :

```sql
update public.tracked_players set status = status
 where id = (select id from public.tracked_players limit 1);
```

(Écrit une nouvelle version de ligne : inoffensif, mais ce n'est pas une lecture pure.)

##### Variante zéro fenêtre (envisagée, non retenue)

Faire accepter deux secrets à l'EF le temps du basculement **supprime** la fenêtre au lieu de la réduire, au prix d'une quinzaine de lignes et de deux deploys :

```ts
const expected = requireSecret('PRAC_WEBHOOK_SECRET')
const previous = Deno.env.get('PRAC_WEBHOOK_SECRET_PREVIOUS')
const ok = await secretsMatch(provided, expected)
       || (!!previous && await secretsMatch(provided, previous))
```

Deploy 1 : `PREVIOUS` = ancien token, `SECRET` = nouveau → l'EF accepte les deux, la bascule Vault se fait sans aucune contrainte de timing. Deploy 2, à froid plus tard : suppression de `PREVIOUS`. **Écartée à la rotation du 2026-09-01** — la fenêtre de 1-2 s obtenue par l'ordre EF-first a été jugée suffisante à une heure creuse. À reconsidérer si le volume de notifications augmente, ou si une rotation doit se faire en pleine journée.

#### Invariants, quel que soit l'état

- **Pas de filtre par colonne** : le trigger fire sur **tout** INSERT/UPDATE de `tracked_players`, et c'est **l'EF qui filtre** (`relevantTransition` : seul `status` devenant `pending` déclenche un envoi ; tout le reste → `200 { ignored:true }`). Volontaire — la sélectivité vit dans l'EF. Le trigger étant désormais à nous, une clause `WHEN` deviendrait possible ; non faite, ce serait un changement de comportement.
- **Le header est la seule barrière** : `verify_jwt=false`, la valeur de `X-Internal-Token` DOIT correspondre à `PRAC_WEBHOOK_SECRET`. Header absent ou différent → `401`, aucun e-mail, silencieusement côté déclencheur.
- **Ne pas ajouter l'event DELETE** : `remove_tracking` supprime le dossier → aucun e-mail à envoyer (l'EF ignorerait de toute façon, mais éviter le POST inutile).

### Lot 5F — finitions du template `prac-notify`

- **Sujets différenciés** (déjà en place depuis 5D) : `initial` → « Demande de suivi prac — Wyrm Forge » ; `reopen` → « Nouvelle demande de suivi prac — Wyrm Forge » (+ phrase d'intro « souhaite suivre » vs « vient de te renvoyer »). Validé au test e2e 5E (2 e-mails, sujets/corps différenciés).
- **Mention de transparence (opt-out non technique)** : ligne discrète en bas du template (HTML **et** version texte) — « Tu reçois cet email car un administrateur Wyrm Forge a initié une demande de suivi. Tu peux refuser depuis ta page de consentement. » **Pas de lien d'unsubscribe technique en V1** : le refus se fait exclusivement via `/consent` (`respond_consent('decline'|'revoke')`). La mention est purement informative.

### Décisions de cadrage actées
- **Stockage post-consentement uniquement** : aucune donnée Riot d'un joueur n'est résolue/stockée tant que le consentement n'est pas `accepted`.
- **Révocation** : purge des `tracked_matches` du joueur.
- **Ajout manuel par créneau** (pas de cron auto en V1). Plateforme = `profiles.riot_platform` (fallback `euw1`).
- Détail de match = **réutilisation** du rendu existant (`/match/...`) ; seul le lien « clic sur un joueur » diffère (→ page joueur prac, pas `/summoner`). Détail joueur prac = historique des **matchs trackés uniquement** + agrégats (≠ `/summoner` qui montre tout l'historique Riot).

---

### Vecteur open redirect latent : paramètre `next` dans le callback OAuth
Si un paramètre `next` (destination post-login) est un jour ajouté à
`src/app/auth/callback/route.ts`, il DOIT être validé contre `NEXT_PUBLIC_SITE_URL`
avant d'être utilisé comme cible de redirection. Un `redirect(next || home)` sans
validation = open redirect classique. Pattern sûr :
```ts
const next    = searchParams.get('next') ?? '/'
const target  = new URL(next, SITE_URL)
if (target.origin !== new URL(SITE_URL).origin) return redirect(home)
return redirect(target)
```

---

### Cookies de session sans HttpOnly : risque architectural ACCEPTÉ (audit sécurité 1.3)
Les cookies de session Supabase (`sb-<ref>-auth-token`, éventuellement chunkés `.0`/`.1`)
**n'ont pas le flag `HttpOnly`, par conception** — ce n'est **pas** un oubli de configuration
et `cookieOptions` ne peut pas le corriger. La session est gérée côté client par
`createBrowserClient` (`@supabase/ssr`, `src/lib/supabase/client.ts`), qui lit/écrit le token
via `document.cookie` : un cookie `HttpOnly` serait invisible au JS et casserait l'auth. Le
flag `Secure` **est** posé en production (`secure: process.env.NODE_ENV === 'production'`,
partagé client.ts / server.ts / proxy.ts) et `Domain=.wyrm-forge.com` + `SameSite=Lax` sont
confirmés en runtime — seul `HttpOnly` manque, et structurellement.

- **Risque accepté** : en cas de XSS **ailleurs** sur le site, le token de session serait
  directement lisible par du JS injecté → cela **élargit le rayon d'impact** d'une XSS
  potentielle (vol de session), mais **n'est pas une XSS en soi**. Le vecteur reste
  conditionné à l'existence d'une faille d'injection par ailleurs.
- **Correction propre** = migrer vers une session **entièrement gérée côté serveur** (cookies
  posés uniquement par le serveur, jamais lus par le JS client) — **hors scope** de cet audit,
  refonte non triviale du flux d'auth.
- **À réévaluer si le profil de risque change** — en particulier dès que le site affiche du
  **contenu généré par les utilisateurs sans échappement** (aujourd'hui : `creator_name` du
  Workshop, pseudos, noms de scénarios/tournois… tout rendu utilisateur est un point à auditer
  côté XSS, car c'est ce qui transformerait ce risque accepté en exploitation réelle).
