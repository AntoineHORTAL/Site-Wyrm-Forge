import type { Metadata } from 'next'
import MentionsLegalesContent from '@/components/legal/MentionsLegalesContent'

/* Mentions légales — FR / EN, contenu dans `src/locales/legal/mentions.tsx`. */

// ⚠️ `metadata` reste en FRANÇAIS, et seulement en français : elle est produite
// côté serveur, où la langue choisie par le visiteur (état client, localStorage)
// n'est pas connue. La traduire supposerait des URL localisées, que le site n'a
// pas — et une `<html lang>` par route, alors qu'elle est réalignée côté client.
// Le CONTENU de la page, lui, suit la langue : voir `MentionsLegalesContent`.
export const metadata: Metadata = {
  title: 'Mentions légales — Wyrm Forge',
  description: 'Éditeur, hébergeur, propriété intellectuelle, médiation et contact du site Wyrm Forge.',
}

export default function MentionsLegalesPage() {
  return <MentionsLegalesContent />
}
