import type { Metadata } from 'next'
import CguContent from '@/components/legal/CguContent'

/* Conditions générales d'utilisation — FR / EN, contenu dans `src/locales/legal/cgu.tsx`. */

// ⚠️ `metadata` reste en FRANÇAIS, et seulement en français : elle est produite
// côté serveur, où la langue choisie par le visiteur (état client, localStorage)
// n'est pas connue. La traduire supposerait des URL localisées, que le site n'a
// pas — et une `<html lang>` par route, alors qu'elle est réalignée côté client.
// Le CONTENU de la page, lui, suit la langue : voir `CguContent`.
export const metadata: Metadata = {
  title: "Conditions générales d'utilisation — Wyrm Forge",
  description: "Règles d'utilisation de Wyrm Forge : compte, statut bêta, Écailles, abonnements Forgeron et Maître, résiliation et non-affiliation à Riot Games.",
}

export default function CguPage() {
  return <CguContent />
}
