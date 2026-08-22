'use client'

/**
 * Dictionnaire de la ZONE CONNECTÉE (dashboard + pages accessibles une fois connecté).
 *
 * Pendant de `src/locales/landing.ts` pour la vitrine, avec exactement la même
 * convention : le FR fait foi, le type EN en dérive via `typeof`, donc une clé
 * oubliée ou renommée casse la compilation au lieu d'afficher un texte manquant.
 * La différence est la TAILLE : la vitrine tient en ~82 chaînes, la zone connectée
 * en compte ~550 — d'où un module par zone plutôt qu'un fichier unique de plusieurs
 * milliers de lignes. Chaque module porte sa propre dérivation de type ; ce fichier
 * ne fait que les assembler.
 *
 * Périmètre (validé) : dashboard + Nav connecté + /profil + /consent + AuthModal +
 * builder/ + ecailles/. EXCLUS : /tournois/manage, /prac/*, et toutes les pages
 * publiques, qui restent en français.
 *
 * ⏳ Les modules sont vides : le Lot 0 pose la structure, chaque lot suivant remplit
 * le sien (voir l'en-tête de chaque fichier pour le lot qui lui correspond).
 */

import { useLanguage } from '@/components/providers/LanguageProvider'
import type { Lang } from '@/locales/landing'

import { commonFr,    commonEn }    from './common'
import { navFr,       navEn }       from './nav'
import { accueilFr,   accueilEn }   from './accueil'
import { buildsFr,    buildsEn }    from './builds'
import { workshopFr,  workshopEn }  from './workshop'
import { strategieFr, strategieEn } from './strategie'
import { analyseFr,   analyseEn }   from './analyse'
import { adminFr,     adminEn }     from './admin'
import { profilFr,    profilEn }    from './profil'
import { ecaillesFr,  ecaillesEn }  from './ecailles'

export const dashboardFr = {
  common:    commonFr,
  nav:       navFr,
  accueil:   accueilFr,
  builds:    buildsFr,
  workshop:  workshopFr,
  strategie: strategieFr,
  analyse:   analyseFr,
  admin:     adminFr,
  profil:    profilFr,
  ecailles:  ecaillesFr,
}

export type DashboardDict = typeof dashboardFr

export const dashboardEn: DashboardDict = {
  common:    commonEn,
  nav:       navEn,
  accueil:   accueilEn,
  builds:    buildsEn,
  workshop:  workshopEn,
  strategie: strategieEn,
  analyse:   analyseEn,
  admin:     adminEn,
  profil:    profilEn,
  ecailles:  ecaillesEn,
}

export const dashboardDicts: Record<Lang, DashboardDict> = {
  fr: dashboardFr,
  en: dashboardEn,
}

/**
 * Dictionnaire de la zone connectée dans la langue courante.
 *
 * Pendant de `useLanguage().t` (vitrine), branché sur le MÊME état de langue : le
 * provider est unique et monté dans le layout racine, donc un choix fait sur la
 * vitrine s'applique au dashboard et inversement.
 *
 * Le hook vit ici, avec son dico, et non dans `LanguageProvider.tsx` : ce dernier est
 * importé par toutes les pages via le layout (y compris publiques), y référencer ce
 * dico embarquerait ses chaînes dans le bundle des visiteurs qui ne les verront jamais.
 */
export const useDashboard = (): DashboardDict => dashboardDicts[useLanguage().lang]
