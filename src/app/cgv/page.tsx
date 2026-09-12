import type { Metadata } from 'next'
import CgvContent from '@/components/legal/CgvContent'

/* Conditions générales de vente — FR / EN, contenu dans `src/locales/legal/cgv.tsx`.
 *
 * ⚠️ La date `updated` du dictionnaire DOIT correspondre à `CGV_VERSION`
 * (`src/lib/stripe/checkout-consent.ts`) : c'est la version enregistrée avec
 * chaque preuve de consentement, et `checkout-consent.test.ts` le vérifie. */

// ⚠️ `metadata` reste en FRANÇAIS, et seulement en français : elle est produite
// côté serveur, où la langue choisie par le visiteur (état client, localStorage)
// n'est pas connue. La traduire supposerait des URL localisées, que le site n'a
// pas — et une `<html lang>` par route, alors qu'elle est réalignée côté client.
// Le CONTENU de la page, lui, suit la langue : voir `CgvContent`.
export const metadata: Metadata = {
  title: 'Conditions générales de vente — Wyrm Forge',
  description: 'Conditions de vente des abonnements Wyrm Forge : prix, paiement, reconduction, résiliation, droit de rétractation, garanties légales et réclamations.',
}

export default function CgvPage() {
  return <CgvContent />
}
