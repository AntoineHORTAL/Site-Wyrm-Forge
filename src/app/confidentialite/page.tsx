import type { Metadata } from 'next'
import ConfidentialiteContent from '@/components/legal/ConfidentialiteContent'

/* Politique de confidentialité — FR / EN, contenu dans `src/locales/legal/confidentialite.tsx`. */

// ⚠️ `metadata` reste en FRANÇAIS, et seulement en français : elle est produite
// côté serveur, où la langue choisie par le visiteur (état client, localStorage)
// n'est pas connue. La traduire supposerait des URL localisées, que le site n'a
// pas — et une `<html lang>` par route, alors qu'elle est réalignée côté client.
// Le CONTENU de la page, lui, suit la langue : voir `ConfidentialiteContent`.
export const metadata: Metadata = {
  title: 'Politique de confidentialité — Wyrm Forge',
  description: 'Quelles données Wyrm Forge collecte, avec qui elles sont partagées, combien de temps elles sont conservées et comment exercer tes droits RGPD.',
}

export default function ConfidentialitePage() {
  return <ConfidentialiteContent />
}
