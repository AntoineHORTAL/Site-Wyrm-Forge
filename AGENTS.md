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
| `live_game_enabled` | `'false'` | 20260728000001 — kill-switch de l'EF `riot-live-game` (spectator-v5), **livrée** depuis. ⚠️ La valeur affichée ici est celle **posée par la migration**, pas l'état courant du remote : ce flag se pilote à la main (le vérifier en base avant de conclure à une panne — un 403 sur `/live` est d'abord un kill-switch à `'false'`, pas un bug). |

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
| Match Up | Fonctionnel — **ouvert à tous les tiers** (aucun gating d'affichage ; l'accès réel est le solde « Chaleur de la Forge ») : mode, champions, niveaux, builds, radar, analyse IA. Voir §MatchUp Web |
| Post Game | Fonctionnel — **ouvert à tous les tiers** (aucun gating d'affichage ; l'accès réel est le solde « Chaleur de la Forge ») |
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
| `/live/[region]/[riotId]` | Fonctionnel (Lots D1→D5) — les 9 états d'interface du contrat `riot-live-game` (§ Contrat client normatif ci-dessous), composition des 2 équipes, **rangs + winrate des 10 joueurs**. Logique dans `src/lib/live-game.ts` (module pur testé : types, fetch, libellés, `elapsedSeconds`, `splitTeams`, `fetchParticipantRanks`), rendu dans `src/components/live/LiveComposition.tsx`, icônes via `src/lib/ddragon.ts`, libellés de rang via `src/lib/lol-tiers.ts`. **Plus d'appel EF inline** (extrait au Lot D2). Les rangs viennent de 10 appels `riot-rank?puuid=` en `Promise.allSettled` (jamais `all` : un rejet ne doit dégrader QUE sa ligne) — `ranks` reste `null` côté EF. Coût mesuré en réel (29/07/2026) : **11 appels Riot à froid** (1 spectator + 10 league-v4), **0 pour un 2ᵉ participant de la même partie** (mutualisation du cache). Verrou de 30 s sur « Actualiser » : c'est lui qui borne `riot-rank` à 2 chargements/min, soit pile son bucket `isRateLimited` de 20/min. **Point d'entrée depuis `/summoner`** (Lot D5) : bouton « Partie en direct → » dans l'en-tête joueur, construit par `buildLiveHref` (module pur testé). Il propage `?puuid=` **quand il est déjà résolu** par le chargement de `/summoner` (riot-rank ou riot-matches) → la page cible emprunte le chemin canonique de l'EF, **12 appels → 11**. PUUID absent ou mal formé (GUID LCU 36 car.) ⇒ **omis**, repli sur le Riot ID seul : lien toujours valide, juste un account-v1 de plus. Deux décisions actées : (1) le bouton **ne pré-vérifie PAS `in_game`** — le faire coûterait un appel spectator-v5 à chaque visite de `/summoner` pour une info périmée dès le clic ; « pas en partie » se découvre sur la page cible, où c'est un état NOMINAL ; (2) `prefetch={false}` sur le `next/link` est **fonctionnel, pas cosmétique** — le prefetch par défaut déclencherait une requête RSC vers `/live` dès l'entrée du lien dans le viewport, ce qu'interdit le STOP D5 (zéro requête réseau après le chargement initial de `/summoner`). |
| `/confidentialite`, `/mentions-legales`, `/cgu` | Fonctionnel (Lot P1.a) — pages légales statiques, câblées depuis la barre basse du `Footer` (les 3 liens y sont désormais des routes réelles ; les colonnes du haut restent en `'#'`). **Versions de départ, PAS la version juridique finale** — relecture par un juriste prévue. Server Components (pour exporter `metadata`) qui rendent la coquille cliente partagée `src/components/legal/LegalPage.tsx` (`LegalPage` + helpers `Section` / `List` / `Todo`). ⚠️ Les informations manquantes sont marquées par le composant **`<Todo>`**, qui les rend **visibles à l'écran** en `[À COMPLÉTER — …]` : c'est volontaire (un placeholder invisible en commentaire serait publié tel quel sans que personne ne le voie). À renseigner dès l'immatriculation de la SASU : raison sociale, capital, siège, SIREN/SIRET, RCS, TVA, directeur de publication, adresse postale Supabase, région d'hébergement, médiateur de la consommation, modalités de facturation Stripe. |

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
- ⚠️ **Légion / Architecte / Architecte+ / admin n'ont PAS été définis** par ce cadrage. Alignés sur Maître (135) pour les trois tiers, 1000 pour admin — choix conservateur côté budget, mais qui **ne différencie plus les tiers payants supérieurs**. À trancher.

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
  - **Gating par tier** (mapping `tier → { budget hebdo EN CRÉDITS, modèle }` **dans l'EF**, PAS en DB — les fonctions SQL ne connaissent pas les tiers, elles reçoivent `p_limit` calculé) : Apprenti 15 cr + Haiku, Forgeron 65 cr + Haiku, Maître/Légion/Architecte(+) 135 cr + Sonnet, admin 1000 cr + Sonnet. Tier inconnu/absent → plancher Apprenti. Modèles épinglés : `claude-haiku-4-5` / `claude-sonnet-5`. Voir § Chaleur de la Forge.
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

⚠️ **Piège de lecture** : ne pas confondre avec les couleurs des **tiers d'abonnement Wyrm Forge** (apprenti/forgeron/maître/légion/architecte/architecte+, documentées plus haut dans ce fichier § Base de données — table `profiles`). Il s'agit ici du rang **LoL** (Fer → Challenger), un concept entièrement différent qui partage juste le mot « tier ».

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

> **Chantier 4 (Pages) clos pour 4A/4B/4C.** Sous-lot **4D (vue joueur self)** livré ci-dessous (4D-1).

### Lot 4D-1 — bloc « Ton suivi » (vue self) sur `/consent`

Vue self du joueur sur ses propres données trackées. **Vit sur `/consent`** (site public, hors gating `/prac` — le joueur n'est pas admin prac), **pas** sur une route `/mon-suivi` dédiée : `/consent` est déjà la destination du joueur (ConsentBanner, futur email ch5) et l'endroit naturel de la transparence « qu'est-ce qu'on suit de moi ». **100 % front** — aucune migration (schéma prêt depuis 4A).

- **Condition d'affichage** : bloc rendu **uniquement quand `status='accepted'`** (sous le bloc « Suivi actif » existant). `declined`/`revoked` → aucun bloc (sur revoke, le trigger de purge a déjà supprimé les matchs → rien à montrer).
- **Données** : le `load()` de `/consent` sélectionne désormais aussi **`id`** de `tracked_players` (la policy `tp_select` retourne déjà la ligne propre du joueur). Cet id alimente :
  - **`supabase.rpc('prac_player_stats', { p_tracked_player_id: id })`** — branche self (validée 4A T5).
  - **SELECT direct `tracked_matches`** via RLS `tm_select` (branche self : le joueur voit ses propres lignes).
- **Rendu** : composant local `SelfTracking` re-rendu dans la **palette `/consent`** (`var(--text-muted)`, bordure `#7F77DD`) — **pas** la palette shell prac. Choix : re-render local plutôt qu'extraction d'un composant partagé avec le détail admin 4B (évite de toucher la page admin committée ; bloc auto-contenu). Réutilise les helpers/types de `src/lib/prac.ts` (`num`, `matchKda`, `csPerMin`, `queueLabel`, `PlayerStats`, `TrackedMatchRow`).
- Affiche tuiles (winrate, KDA, CS/min, vision, dégâts, or), top champions, liste des parties suivies → chaque match `Link` vers `/match/[region]/[matchId]`. **État 0-match géré** : « Aucune partie suivie pour l'instant. ».

## 🟡 Module prac — recherche/ajout de joueur (Search)

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

## 🟡 Module prac — chantier 5 (Notification email Resend)

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

### Lot 5E — câblage du Database Webhook (⚠️ configuration MANUELLE, non versionnée)

Le déclencheur de `prac-notify` est un **Database Webhook Supabase créé à la main dans le dashboard** (Database → Webhooks). **Ce n'est PAS du code commité** : les webhooks Supabase ne sont pas exportables dans les migrations → **dette d'infra visible, à recréer manuellement sur tout nouvel environnement**. Reproduire à l'identique la config suivante :

| Champ | Valeur |
|---|---|
| Name | `prac-notify-consent` |
| Table | `public.tracked_players` |
| Events | **INSERT + UPDATE** (pas DELETE) |
| Type | HTTP Request → POST |
| URL | `https://cuscgmgqakxnfwnsrhhv.supabase.co/functions/v1/prac-notify` |
| HTTP Header | `X-Internal-Token: <valeur de PRAC_WEBHOOK_SECRET>` |

- **Pas de filtre par colonne** : les Database Webhooks ne supportent pas de condition (`WHEN status='pending'`) → **tout** INSERT/UPDATE de `tracked_players` fire, et c'est **l'EF qui filtre** en code (`relevantTransition` : seul `status` devenant `pending` déclenche un envoi ; tout le reste → `200 { ignored:true }`). Volontaire — la sélectivité vit dans l'EF, pas dans le webhook.
- **Header = seule barrière** : `verify_jwt=false`, la valeur de `X-Internal-Token` DOIT correspondre au secret Supabase `PRAC_WEBHOOK_SECRET`. Si le header manque/diffère → `401`, aucun e-mail. Si un jour le secret est tourné, **mettre à jour le header du webhook en même temps** (sinon toutes les notifications tombent en 401 silencieusement côté déclencheur).
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
