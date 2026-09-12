'use client'

/**
 * Chaînes de la COQUILLE des pages légales — celles rendues par
 * `src/components/legal/LegalPage.tsx` autour du corps de chaque document :
 * bouton de retour, ligne « dernière mise à jour », bandeau bêta, navigation
 * croisée entre les quatre documents, mention de bas de page.
 *
 * ⚠️ Module FEUILLE, volontairement séparé de `./index` : `LegalPage.tsx` et
 * `LegalBlocks.tsx` l'importent DIRECTEMENT, et les dictionnaires de contenu
 * (`./cgu`, `./cgv`, …) importent ces mêmes composants. Passer par l'index
 * créerait un cycle `LegalPage → index → cgu → LegalPage`. Tant que ce fichier
 * n'importe rien de `./index`, il n'y a pas de cycle.
 *
 * Convention identique au reste du site (`locales/landing.ts`,
 * `locales/dashboard/*`) : le FR fait foi, le type EN en dérive via `typeof`,
 * une clé oubliée casse la compilation.
 */

import { useLanguage } from '@/components/providers/LanguageProvider'
import type { Lang } from '@/locales/landing'

/** Adresse de contact publiée — UNE seule, sur les quatre documents (LCEN). */
export const LEGAL_CONTACT_EMAIL = 'contact@wyrm-forge.com'

export const legalShellFr = {
  back: '← Retour',
  updatedPrefix: 'Dernière mise à jour :',
  betaNotice:
    "Wyrm Forge est en bêta. Ce document est appelé à être complété et précisé ; les "
    + "informations encore manquantes y sont signalées en toutes lettres. Pour toute "
    + 'question :',
  /* Note affichée UNIQUEMENT dans la version anglaise : le lecteur doit savoir
     qu'il lit une traduction d'un document rédigé en français, sans qu'on lui
     oppose pour autant une clause de prévalence (qui viderait de son sens
     l'accès aux conditions dans sa langue — art. 6 Rome I). Vide en français :
     `LegalPage` ne rend le bloc que si la chaîne n'est pas vide. */
  translationNotice: '',
  /* Appariés PAR POSITION à `LEGAL_LINKS` (LegalPage.tsx). */
  navLabels: ['Mentions légales', 'Confidentialité', 'CGU', 'CGV'],
  /* Préfixe du badge `<Todo>` — voir `LegalBlocks.tsx`. Le nom reste le même
     dans les deux langues : `grep -rn HORTAL src` liste tout ce qui manque,
     badges rendus comme commentaires de source, quelle que soit la langue. */
  todoPrefix: 'À COMPLÉTER PAR HORTAL',
  footer: '© 2026 Wyrm Forge. Non affilié à Riot Games.',
}

export type LegalShellDict = typeof legalShellFr

export const legalShellEn: LegalShellDict = {
  back: '← Back',
  updatedPrefix: 'Last updated:',
  betaNotice:
    'Wyrm Forge is in beta. This document is still being completed and refined; any '
    + 'information that is still missing is flagged explicitly. For any question:',
  translationNotice:
    'This page is an English translation of terms drawn up in French. Switch the site '
    + 'to FR to read the original wording.',
  navLabels: ['Legal notice', 'Privacy', 'Terms of use', 'Terms of sale'],
  todoPrefix: 'TO BE COMPLETED BY HORTAL',
  footer: '© 2026 Wyrm Forge. Not affiliated with Riot Games.',
}

export const legalShellDicts: Record<Lang, LegalShellDict> = {
  fr: legalShellFr,
  en: legalShellEn,
}

/** Coquille des pages légales dans la langue courante. */
export const useLegalShell = (): LegalShellDict => legalShellDicts[useLanguage().lang]
