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

## 🟠 Architecture

### State & props
- `activeTab: DashTab` est lifté dans `src/app/page.tsx` et passé en props à Nav et Dashboard
- `DashTab` (type union) et `UserProfile` (interface) sont exportés depuis `src/app/page.tsx`
- `effectiveTier` dans `page.tsx` force `'architecte+'` pour les admins côté affichage, peu importe la valeur en DB

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
- Compte admin : `admin@wyrm-forge.com` — role='admin', tier='architecte+' en DB

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
| architecte | `#BA7517` |
| architecte+ | `#EF9F27` |

### Badge certifié
SVG : cercle bleu `#3B82F6` avec checkmark blanc — défini inline dans AdminTab.tsx et Nav.tsx (composant `CertifiedBadge`)

---

## 🟡 Base de données — table `profiles`

| Colonne | Type | Nullable | Notes |
|---|---|---|---|
| `id` | `uuid` | NOT NULL | PK, FK → `auth.users` |
| `username` | `text` | NOT NULL | |
| `email` | `text` | nullable | copié depuis `auth.users` à la création |
| `tier` | `text` | NOT NULL | `apprenti` \| `forgeron` \| `maître` \| `légion` \| `architecte` \| `architecte+` |
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
Un trigger BEFORE UPDATE (`trg_protect_riot_columns → fn_protect_riot_columns()`) bloque toute modification directe des colonnes `riot_puuid`, `riot_gamename`, `riot_tagline`, `riot_platform`, `riot_link_pending`, `riot_link_expires_at` quand `current_user = 'authenticated'` (appel client avec JWT).
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
Réglages globaux clé/valeur.
RLS : SELECT `authenticated`, UPDATE `is_admin()`, INSERT/DELETE bloqués côté client.

Valeurs en base (migrations cumulées) :

| key | value par défaut | Migration |
|---|---|---|
| `patch_auto_publish` | `'false'` | 20260530000009 |
| `ecailles_enabled` | `'false'` | 20260606000001 |
| `shop_enabled` | `'false'` | 20260606000001 |
| `quests_enabled` | `'false'` | 20260606000001 |
| `cap_daily_scales` | `'12'` | 20260607000001 (était '25' en 20260606000001) |
| `streak_bonus_pct` | `'0'` | 20260606000011 (corrigé depuis '10' de 20260606000001) |

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

## 🟡 Base de données — module Tournois (migrations 20260611000001-000005)

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

### Front Tournois (étape 4 — câblage)
- `src/lib/tournois.ts` : types DB + `callTournamentEF` (token optionnel) + filtres `?statut=` (`tous`/`avenir`/`encours`/`termines`) + `parseRules` + `remainingSlots`.
- `/tournois` : SSR, charge TOUS les tournois non-draft (table petite, jamais tronquée) puis filtre serveur selon `?statut=` ; stats hero calculées sur les données réelles.
- `/tournois/[slug]` : SSR (tournoi puis teams+matches+standings en parallèle), `notFound()` si absent/draft (RLS masque les drafts aux non-propriétaires). Bandeau brouillon pour le créateur.
- `TournamentLive` (client) : détient l'état vivant + **UN SEUL channel Realtime** par page sur `matches` (filtre tournament_id), patch local + refetch débounce standings/teams. Reste monté à travers les changements de tab (le tab est une prop).
- Bracket v2 : `bracket-layout.ts` (géométrie PURE calculée depuis les données matches — testée par `bracket-layout.test.ts`, `npm test` / vitest) + `BracketView.tsx` (cartes 2 lignes liées vers `/tournois/[slug]/match/M{n}`, connecteurs SVG orthogonaux `--xv2-blue` 40% → 100% sur le chemin du vainqueur, badge EN COURS pulsant, mobile : scroll horizontal + snap + ancres WB/LB/Finale).
- `RegistrationForm` (client) → EF `tournament-register` (JWT optionnel) ; `AdminPanel` (client) → EF `tournament-admin` (toutes actions dont `start_match`) ; garde serveur `/tournois/[slug]/admin` : `created_by` OU `profiles.role='admin'`.

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
| Match Up | Verrouillé — dev preview admin |
| Post Game | Verrouillé — dev preview admin |
| Tournois | Soon screen |
| Admin | Fonctionnel (gestion users, tiers, certification) |

## 🔵 Pages publiques (hors dashboard)

| Route | État |
|---|---|
| `/patch-notes` | Fonctionnel — liste publique SSR |
| `/match/[platform]/[matchId]` | Fonctionnel — vue détail avec Impact d'items (Vue 1 stats + Vue 2 Meraki) |
| `/summoner/[region]/[gameName]/[tagLine]` | Fonctionnel — historique joueur public, autocomplete `searched_summoners`, comparaison de rang (Vue A percentile + Vue B vs avg) |
| `/tournois` | Fonctionnel — liste SSR + filtres `?statut=` |
| `/tournois/[slug]` | Fonctionnel — poster/règles SSR + bracket v2 + classement, Realtime sur `matches` |
| `/tournois/[slug]/admin` | Fonctionnel — panneau organisateur (garde created_by/admin), actions via EF `tournament-admin` |
| `/tournois/[slug]/match/[code]` | À FAIRE (étape D) — les cartes du bracket pointent déjà dessus |
| `/tournois/creer` | À FAIRE (étape E) |

### Impact d'items (`/match/...`) — précisions techniques
- **Cache v2** : `riot-match-detail` utilise `match:v2:${matchId}`. Matchs pré-déploiement → cache permanent v1, Vue 1 stats indisponible (dégradé propre).
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

## 📋 À faire plus tard

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
  `riot-rank`, `riot-link-init`, `shop-purchase`, `quest-claim`, `quest-status`. Déploiement auto via GitHub Action sur push.
- ⚠️ **Piège backend — validation PUUID dans `riot-matches`** (résolu 23/06/2026) : la fonction accepte `?puuid=` OU `?gameName=&tagLine=`. La regex `PUUID_RE` validait à l'origine un **UUID v4 (36 car., format `8-4-4-4-12`)** — or ce format est précisément le **GUID anonymisé du LCU**, PAS un vrai PUUID Riot (**78 car.**, charset `[A-Za-z0-9_-]`). Conséquence : tout appel `?puuid=` avec un vrai PUUID renvoyait `400 {"error":"Format PUUID invalide."}`. Le chemin `gameName/tagLine` n'était PAS touché (le puuid y est résolu côté serveur via account-v1 et n'est jamais soumis à `PUUID_RE`), d'où un bug **latent** : le site n'utilise que le chemin Riot ID, et le 1er consommateur `?puuid=` (app WPF `WyrmBackendService.GetMatchIdsByPuuidAsync`) l'a révélé. **Correctif** : `PUUID_RE = /^[A-Za-z0-9_-]{70,128}$/` (charset borné → anti path-injection ; le puuid est en plus `encodeURIComponent`'d avant l'appel Riot). **Règle** : toute validation de PUUID côté backend cible ce format, JAMAIS un UUID.
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
- `tournament-register` : inscription publique d'une équipe (POST, JWT optionnel) — body `{ tournament_id, team_name, players[2] }`. Rate limit IP. Validation complète des inputs (UUID, nom, riot_pseudo, discord_pseudo). Vérifie `status = 'registration'` et `count(pending+validated) < max_teams`. INSERT `tournament_teams` + `tournament_players` via service_role. Codes HTTP : 400 validation, 403 tournoi non ouvert, 409 complet/nom pris, 429 rate limit, 201 succès.
- `tournament-admin` : actions d'administration d'un tournoi (POST, JWT obligatoire — vérifié DANS LE CODE, `verify_jwt = false` dans config.toml) — body `{ action, tournament_id, ... }`. Vérifie `created_by === user.id OR is_admin()`. Les RPC SECURITY DEFINER (`seed_bracket`, `start_match`, `report_match_result`, `undo_match_result`) sont appelées via `userDb` (client JWT utilisateur) car elles utilisent `auth.uid()` en interne. Actions : `open_registration`, `close_registration`, `validate_team`, `reject_team`, `seed_bracket`, `start_match`, `report_result`, `undo_result`, `set_status`. Codes HTTP : 400 état/payload invalide, 401 JWT absent, 403 non autorisé, 404 tournoi/match non trouvé, 409 conflit.

### Module partagé `_shared/daily-quests.ts`
- Export : `selectDailySet(dayStr, pool, K=3) → QuestDef[]`
- Algorithme déterministe : tri par slug → hash FNV-1a 32 bits du `dayStr` → 2 quêtes lol (≤1 `riot_detail`) + 1 quête app.
- Importé par `quest-claim` ET `quest-status` — garantit le même set au même instant sans état partagé.
- Export type : `QuestDef` (interface avec `slug`, `category`, `cost_tier`, index signature).
- L'app desktop (`Logiciel-Assistant-LOL`) consomme aussi les Edge Functions
  via `WyrmBackendService.cs` — clé Riot **plus du tout** côté client.

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

### Enforcement (à coder le moment venu)

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
(texte libre, non vérifiable). L'INSERT est restreint aux utilisateurs authentifiés
mais on ne peut pas identifier le propriétaire d'une ligne.
**À corriger** : ajouter `creator_id UUID REFERENCES auth.users DEFAULT auth.uid()`
puis recréer les policies `wjp_update_owner` / `wjp_delete_owner` en conséquence.

---

---

## 🟡 Base de données — module Tournois (migrations 20260611000001-000005)

### Table `tournaments`

| Colonne | Type | Nullable | Notes |
|---|---|---|---|
| `id` | `uuid` | NOT NULL | PK default gen_random_uuid() |
| `slug` | `text` | NOT NULL | UNIQUE — identifiant URL stable |
| `name` | `text` | NOT NULL | Nom affiché |
| `format` | `text` | NOT NULL | default `'2V2'` |
| `map` | `text` | NOT NULL | default `'ARAM'` |
| `status` | `text` | NOT NULL | `'draft'`\|`'registration'`\|`'live'`\|`'finished'` |
| `starts_at` | `timestamptz` | nullable | |
| `max_teams` | `int` | NOT NULL | default `8` |
| `cashprize_label` | `text` | nullable | Ex : `'60€'` |
| `cashprize_bonus` | `text` | nullable | Ex : `'+ ARÈNE PASS XV2'` |
| `caster_name` | `text` | nullable | |
| `twitch_url` | `text` | nullable | |
| `hero_image_url` | `text` | nullable | Slot visuel organisateur |
| `rules` | `jsonb` | NOT NULL | Liste ordonnée de strings, default `'[]'` |
| `created_by` | `uuid` | NOT NULL | FK `auth.users` |
| `created_at` | `timestamptz` | NOT NULL | default `now()` |

### RLS `tournaments`
- SELECT non-draft : `anon` + `authenticated` — `status <> 'draft'`
- SELECT draft : `authenticated` — `created_by = auth.uid() OR is_admin()`
- INSERT/UPDATE/DELETE : aucune policy client (service_role only)

### Table `tournament_teams`

| Colonne | Type | Nullable | Notes |
|---|---|---|---|
| `id` | `uuid` | NOT NULL | PK |
| `tournament_id` | `uuid` | NOT NULL | FK `tournaments` ON DELETE CASCADE |
| `name` | `text` | NOT NULL | 3-24 caractères, UNIQUE par tournoi |
| `seed` | `int` | nullable | null avant seeding |
| `status` | `text` | NOT NULL | `'pending'`\|`'validated'`\|`'rejected'`, default `'pending'` |
| `created_at` | `timestamptz` | NOT NULL | |

Contrainte `uq_team_name_per_tournament UNIQUE (tournament_id, name)`.

### RLS `tournament_teams`
- SELECT : `anon` + `authenticated` — toutes équipes
- INSERT/UPDATE/DELETE : aucune policy client

### Table `tournament_players`

| Colonne | Type | Nullable | Notes |
|---|---|---|---|
| `id` | `uuid` | NOT NULL | PK |
| `team_id` | `uuid` | NOT NULL | FK `tournament_teams` ON DELETE CASCADE |
| `riot_pseudo` | `text` | NOT NULL | Format `'gameName#TAG'`, validé côté EF |
| `discord_pseudo` | `text` | NOT NULL | **Ne jamais exposer en SELECT public** |
| `user_id` | `uuid` | nullable | FK `auth.users` |
| `created_at` | `timestamptz` | NOT NULL | |

### RLS `tournament_players`
- SELECT : `authenticated` — `user_id = auth.uid()` uniquement
- Lecture publique : passer par la vue `tournament_players_public` (sans `discord_pseudo`)
- INSERT/UPDATE/DELETE : aucune policy client

### Table `matches`

| Colonne | Type | Nullable | Notes |
|---|---|---|---|
| `id` | `uuid` | NOT NULL | PK |
| `tournament_id` | `uuid` | NOT NULL | FK `tournaments` ON DELETE CASCADE |
| `code` | `text` | NOT NULL | `'M1'`..`'M14'`, UNIQUE par tournoi |
| `bracket` | `text` | NOT NULL | `'winner'`\|`'loser'`\|`'final'` |
| `round` | `int` | NOT NULL | |
| `position` | `int` | NOT NULL | |
| `team_a` | `uuid` | nullable | FK `tournament_teams` |
| `team_b` | `uuid` | nullable | FK `tournament_teams` |
| `winner_id` | `uuid` | nullable | FK `tournament_teams` |
| `next_match_id` | `uuid` | nullable | FK self — destination gagnant |
| `next_match_slot` | `text` | nullable | `'a'`\|`'b'` |
| `loser_next_match_id` | `uuid` | nullable | FK self — destination perdant (LB) |
| `loser_next_match_slot` | `text` | nullable | `'a'`\|`'b'` |
| `status` | `text` | NOT NULL | `'pending'`\|`'ready'`\|`'in_progress'`\|`'finished'` — dérivé par trigger `trg_match_auto_status` (migration 20260612000001), `'in_progress'` posé par `start_match()` |
| `started_at` | `timestamptz` | nullable | posé par `start_match()` |
| `created_at` | `timestamptz` | NOT NULL | |

Contrainte `uq_match_code_per_tournament UNIQUE (tournament_id, code)`.
Realtime activé : `REPLICA IDENTITY FULL` + publication `supabase_realtime`.

### RLS `matches`
- SELECT : `anon` + `authenticated`
- INSERT/UPDATE/DELETE : aucune policy client

### Vues publiques
- `tournament_standings` : classement par tournoi (wins, losses, points, pseudos Riot). GRANT SELECT `anon, authenticated`.
- `tournament_players_public` : joueurs sans `discord_pseudo`. GRANT SELECT `anon, authenticated`.

### Fonctions SQL (toutes SECURITY DEFINER, REVOKE EXECUTE FROM PUBLIC)

| Fonction | Description |
|---|---|
| `seed_bracket(p_tournament_id UUID)` | Génère les 14 matchs DE 8 équipes, seed les équipes, passe en `'live'`. Advisory lock sur tournament_id. |
| `report_match_result(p_match_id UUID, p_winner_id UUID)` | Enregistre résultat + propage gagnant/perdant. Advisory lock sur tournament_id. |
| `undo_match_result(p_match_id UUID)` | Annule résultat si aucun match aval joué. Advisory lock sur tournament_id. |
| `start_match(p_match_id UUID)` | Lance un match `ready` → `in_progress` + `started_at`. Advisory lock sur tournament_id. Refuse `auth.uid() IS NULL`. |

Erreurs levées par `seed_bracket` : `'tournament_not_found'`, `'tournament_forbidden'`, `'tournament_wrong_status'`, `'bracket_wrong_team_count'`, `'bracket_already_seeded'`.
Erreurs levées par `report_match_result` : `'match_not_found'`, `'match_forbidden'`, `'match_teams_not_set'`, `'winner_not_in_match'`, `'already_reported'`.
Erreurs levées par `undo_match_result` : `'match_not_found'`, `'match_forbidden'`, `'downstream_played'`.
Erreurs levées par `start_match` : `'match_not_found'`, `'match_forbidden'`, `'match_wrong_status'`.

### Consommateurs Tournois
- **Site React** : lecture `tournaments`, `tournament_teams`, `tournament_players_public`, `matches`, `tournament_standings` (anon/auth)
- **App WPF** : lecture `tournament_standings` + `tournament_players_public` (anon/auth)
- **Edge Functions** : écriture via service_role — `seed_bracket`, `report_match_result`, `undo_match_result`

---

## 🟡 Module prac (prac.wyrm-forge.com) — suivi de joueurs (interne)

Outil interne réservé aux **admins prac** (HORTAL/Ewen) pour suivre la performance de joueurs Wyrm Forge dans le temps. Partage la base d'utilisateurs (pas d'identité séparée). Découpage : **1) socle** (fait) → 2) roster+consentement → 3) tracking (résolution par créneau + désambiguïsation) → 4) pages (liste, top-5 winrate, détail joueur) → 5) email Resend.

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

## 🟡 Module prac — chantier 3 (Tracking)

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

## 🟡 Module prac — chantier 4 (Pages)

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

> **Chantier 4 (Pages) clos pour 4A/4B/4C.** Sous-lot **4D (vue joueur self** — le joueur voit son propre détail hors `/prac`, via `prac_player_stats` branche self) **différé en fast-follow**, comme acté.

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
