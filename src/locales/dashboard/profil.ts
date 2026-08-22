/**
 * Pages connectées hors dashboard : `/profil`, `/consent`, et la modale d'authentification
 * (`components/auth/AuthModal.tsx`).
 *
 * ⚠️ `AuthModal` ne contient pas que des libellés : il TRADUIT les erreurs Supabase
 * (ex. `'Invalid login credentials'` → « Email ou mot de passe incorrect. »). Côté EN,
 * il ne s'agit donc pas de traduire un texte français mais de fournir le message
 * anglais correspondant au même code d'erreur — la clé du mapping reste la chaîne
 * renvoyée par Supabase, qui n'est jamais traduite.
 *
 * ⏳ Rempli au Lot 7.
 */
export const profilFr = {}

export type ProfilDict = typeof profilFr

export const profilEn: ProfilDict = {}
