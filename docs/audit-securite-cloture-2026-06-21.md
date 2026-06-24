# Rapport de clôture — Audit sécurité pré-beta

**Date : 2026-06-21** · Périmètre : Site Wyrm Forge (Next.js + Supabase) · Mode : re-audit de confirmation, read-only

> Document d'archive. Clôture formelle de l'audit sécurité pré-beta mené en 3 lots. Ce n'est pas une nouvelle recherche de vulnérabilités : c'est la confirmation de l'état réel du système après application et déploiement des 3 lots.

---

## Tableau récapitulatif des 3 lots

| Lot | Objet | Migrations / fichiers | Statut |
|---|---|---|---|
| **LOT 1** | P0 profiles — verrouillage colonnes de privilège | `20260614000001_security_p0_profiles_privilege_lock.sql` | ✅ Appliqué · Déployé · **Testé réel** (insufficient_privilege levé en authenticated simulé) |
| **LOT 2** | RPC tournois → `is_tournament_admin()` | `20260614000002_security_p1_tournament_admin_guard.sql` | ✅ Appliqué · Déployé · Testé (refus anon confirmé) |
| **LOT 3** | Durcissement EXECUTE + e.message + dédup app_events + riot_* INSERT | `…003_function_grants`, `…004_app_events_dedup`, `…005_riot_columns_insert` + 9 EF | ✅ Appliqué · Déployé · Testé (anon refusé, farm bloqué, erreurs génériques) |

---

## Confirmation point par point

### 1. P0 profiles — CONFIRMÉ ✅
- **Policy UPDATE** : `profiles_update_self_or_admin`, PERMISSIVE, `TO authenticated`, `USING / WITH CHECK (auth.uid() = id OR is_admin())`. La migration **droppe d'abord toute policy UPDATE existante** (boucle sur `pg_policies`) avant recréation → pas d'empilement d'une ancienne policy permissive créée hors-versionnage.
- **Trigger** `trg_protect_privilege_columns` → `fn_protect_privilege_columns()` : BEFORE UPDATE, couvre bien **`role`, `tier`, `tier_expires_at`, `certified`** (comparaison `IS DISTINCT FROM OLD`). Bypass intacts : la garde ne s'applique que si `current_user = 'authenticated'` **ET** `NOT is_admin()` → `service_role`, `postgres`, et admins authentifiés passent ; seuls les non-admins authentifiés sont bloqués.
- **Aucun contournement réintroduit** : grep sur l'ensemble des Edge Functions → **aucune écriture** de `role`/`tier`/`certified`/`tier_expires_at` sur `profiles`. Les seuls `.update()` touchant `profiles` (riot-link-init/verify) ne portent que des colonnes `riot_*`. Les occurrences `role:`/`tier:` détectées ailleurs sont hors-sujet (rank_stat_samples, cache de rang, rôle de message Anthropic).

### 2. RPC tournois — CONFIRMÉ ✅
Les 4 fonctions utilisent **`is_tournament_admin(auth.uid(), <tournament_id>)`** (plus `is_admin()`), toutes SECURITY DEFINER + advisory lock xact :
- `seed_bracket` (l.43-44)
- `report_match_result` (l.202-203)
- `start_match` (l.273-275 — refus explicite `auth.uid() IS NULL` **conservé**)
- `undo_match_result` (l.352-353)

### 3. Durcissement EXECUTE — CONFIRMÉ ✅
`20260614000003` applique la répartition documentée :

| Fonction | Révoqué | Re-grant |
|---|---|---|
| seed_bracket / report_match_result / undo_match_result / start_match | PUBLIC, anon | authenticated |
| equip_cosmetic / unequip_cosmetic / get_balance / clear_riot_link | PUBLIC, anon | authenticated |
| purchase_cosmetic / finalize_quest_claim | PUBLIC, anon, **authenticated** | aucun (service_role only) |
| get_equipped_cosmetics | *(non touché — lecture publique anon/auth assumée)* | — |

Le commentaire de migration documente la cause racine (**Supabase re-grant par défaut anon/authenticated via ALTER DEFAULT PRIVILEGES**) et le `COMMENT ON FUNCTION purchase_cosmetic` formalise pourquoi le « trust p_user_id » est sûr (seul service_role peut l'appeler après le REVOKE). Aucun `GRANT … TO anon/PUBLIC` réintroduit dans les migrations postérieures.

### 4. e.message — CONFIRMÉ ✅
**0 occurrence de `e.message` renvoyé brut dans une réponse HTTP.** Toutes les occurrences sont soit :
- du **logging** `console.error(... e.message ...)` (jamais dans le body) ;
- du **matching de substring** (`msg.includes('already_claimed')`…) puis renvoi d'un message FR fixe — shop-purchase, quest-claim, tournament-register, tournament-admin (`mapSqlError` → table `SQL_ERROR_MAP` à messages contrôlés, fallback générique « Erreur serveur inattendue. » si non mappé).

### 5. Dédup app_events — CONFIRMÉ ✅
- Contrainte **`uq_app_events_dedup UNIQUE (user_id, event_type, ref_id)`** présente (`20260614000004`), créée idempotente, précédée d'une purge des doublons antérieurs (garde le `MIN(id)` par groupe). UNIQUE **totale** (pas d'index partiel) → pas de piège `42P10` à l'upsert.
- *Vérif « 0 doublon en base »* : confirmée manuellement par HORTAL/VERTE après double consultation. Requête de contrôle disponible pour audit ultérieur :
  ```sql
  SELECT user_id, event_type, ref_id, COUNT(*)
    FROM public.app_events
   WHERE ref_id IS NOT NULL
   GROUP BY 1,2,3
  HAVING COUNT(*) > 1;
  ```
  → doit retourner 0 ligne. (Read-only : non exécutée depuis cette session, pas d'accès remote.)

### 6. Items Tier C assumés — FORMALISÉS (voir section dédiée ci-dessous)

---

## Items Tier C assumés — non bloquants, documentés, sans date d'engagement

| # | Item | Constat | Risque |
|---|---|---|---|
| C-1 | **Secret mal orthographié `RATE_LIMITE_RIOT_IP`** | `_shared/rate-limit.ts:40` lit `Deno.env.get('RATE_LIMITE_RIOT_IP')`. Fonctionnel (le secret existe sous ce nom), mais faute de frappe (« LIMITE » au lieu de « LIMIT »). | Cosmétique. Renommer = changer secret Supabase + code simultanément. |
| C-2 | **Pas d'advisory lock sur `equip_cosmetic`** | `20260608000001` : lit `COUNT(*)` des badges équipés puis équipe, sans `pg_advisory_xact_lock`. Deux requêtes concurrentes pourraient dépasser la limite de 5 badges. | Mineur — fenêtre étroite, plafond purement cosmétique, aucun impact économique/sécurité. |

Aucun autre item Tier C de l'audit initial n'est resté ouvert au-delà de ces points.

---

## Périmètre tournois

**Sécurisé en l'état actuel (LOT 2 appliqué : RPC sur `is_tournament_admin`, gardes `auth.uid()`, REVOKE/GRANT corrects, erreurs mappées).** Une refonte complète du module est prévue (session dédiée) → **à ré-auditer après la refonte**. Ce n'est pas un défaut de couverture du présent audit, mais un report assumé.

---

## Hors clôture — à traiter dans un futur audit

Repéré pendant la relecture, **non bloquant**, hors des 3 lots confirmés :

- **`config.toml` : 7 EF en `verify_jwt = false`** (riot-*, patch-notes, tournament-*). C'est une **convention projet assumée** (JWT vérifié applicativement, ou endpoints publics anon) — documentée en commentaire (l.36). À revoir EF par EF lors du futur audit complet pour confirmer que chacune fait bien sa vérification applicative quand elle manipule des données utilisateur (tournament-admin/register concernées, revues avec la refonte tournois). **Pas une régression** — signalé pour traçabilité.

---

## Verdict global

**Le site est beta-ready du point de vue sécurité**, sous réserve des items Tier C documentés (C-1 cosmétique, C-2 mineur), qui n'ont pas d'impact bloquant pour une beta.

Les trois lots sont appliqués, déployés et — pour le P0 et les points testables — confirmés en conditions réelles. Le P0 d'auto-élévation de privilèges (le risque critique) est **fermé et vérifié**.

---

*Audit de confirmation read-only. Aucune modification de code ni de migration n'a été effectuée dans le cadre de cette clôture.*
