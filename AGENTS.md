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
- Table `admin_users` avec **RLS désactivé** pour éviter la récursion RLS dans les policies de `profiles`
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

```
id              uuid (FK → auth.users)
username        text
email           text
tier            text  -- apprenti | forgeron | maître | légion | architecte | architecte+
role            text  -- 'user' | 'admin'
certified       boolean  default false
tier_expires_at timestamptz  -- null = à vie, sinon date d'expiration
created_at      timestamptz
```

### Logique abonnements
- `tier_expires_at = null` → compte à vie (exclu des stats de répartition par tier)
- Abonné actif = `tier !== 'apprenti'` + `tier_expires_at` défini + pas encore expiré
- Les admins sont exclus des stats de comptage par tier

### SQL à avoir appliqué
```sql
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS certified BOOLEAN NOT NULL DEFAULT false;
UPDATE profiles SET email = u.email FROM auth.users u WHERE profiles.id = u.id AND profiles.email IS NULL;
```

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
| Workshop Builds | UI placeholder |
| Workshop Jungle | UI placeholder |
| Match Up | Verrouillé — dev preview admin |
| Post Game | Verrouillé — dev preview admin |
| Tournois | Soon screen |
| Admin | Fonctionnel (gestion users, tiers, certification) |

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
  `riot-rank`. Déploiement auto via GitHub Action sur push.
- L'app desktop (`Logiciel-Assistant-LOL`) consomme aussi les Edge Functions
  via `WyrmBackendService.cs` — clé Riot **plus du tout** côté client.
- Tournament API : non encore demandée.

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
