/**
 * Assemblage des dictionnaires du dossier légal — les quatre documents plus la
 * coquille et les clauses d'abonnement partagées.
 *
 * ⚠️ Ce module n'est PAS le chemin d'accès des pages. Chaque page légale est une
 * route distincte et consomme le hook de SON document (`useCgv()`, `useCgu()`,
 * `useMentions()`, `useConfidentialite()`), exporté par le module correspondant :
 * un hook global ferait entrer les quatre documents dans le bundle de chacune —
 * même raisonnement que la séparation `landing` / `dashboard`.
 *
 * Il existe pour la VÉRIFICATION : `legal.test.ts` parcourt `legalFr` / `legalEn`
 * et vérifie que les deux langues portent exactement les mêmes clés, jusqu'aux
 * sections. Le typage le garantit déjà à la compilation (`typeof` du FR) ; le
 * test attrape en plus ce que le typage ne voit pas — une section vide, un texte
 * resté en français côté EN.
 *
 * Pas de `'use client'` : ce fichier n'est importé que par les tests (node), et
 * l'y mettre laisserait croire qu'il a sa place dans un composant.
 */

import type { Lang } from '@/locales/landing'
import { legalShellFr, legalShellEn } from './shell'
import { subscriptionFr, subscriptionEn } from './subscription'
import { mentionsFr, mentionsEn } from './mentions'
import { confidentialiteFr, confidentialiteEn } from './confidentialite'
import { cguFr, cguEn } from './cgu'
import { cgvFr, cgvEn } from './cgv'

export const legalFr = {
  shell: legalShellFr,
  subscription: subscriptionFr,
  mentions: mentionsFr,
  confidentialite: confidentialiteFr,
  cgu: cguFr,
  cgv: cgvFr,
}

export type LegalDict = typeof legalFr

export const legalEn: LegalDict = {
  shell: legalShellEn,
  subscription: subscriptionEn,
  mentions: mentionsEn,
  confidentialite: confidentialiteEn,
  cgu: cguEn,
  cgv: cgvEn,
}

export const legalDicts: Record<Lang, LegalDict> = {
  fr: legalFr,
  en: legalEn,
}

/** Les quatre documents du dossier légal, hors coquille et clauses partagées. */
export const LEGAL_DOCUMENTS = ['mentions', 'confidentialite', 'cgu', 'cgv'] as const
export type LegalDocument = (typeof LEGAL_DOCUMENTS)[number]
