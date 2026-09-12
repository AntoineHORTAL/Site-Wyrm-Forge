'use client'

import { LegalPage } from '@/components/legal/LegalPage'
import { Section } from '@/components/legal/LegalBlocks'
import { useConfidentialite } from '@/locales/legal/confidentialite'

/* Corps de /confidentialite — composant CLIENT.
 *
 * La page (`src/app/confidentialite/page.tsx`) reste un Server Component pour exporter
 * `metadata` ; tout le contenu vit ici, parce qu'il dépend de la langue choisie
 * (état client, `LanguageProvider`). C'est ce découpage qui permet de traduire
 * les pages légales sans routage i18n par URL.
 *
 * L'ORDRE des sections est porté par ce fichier, pas par le dictionnaire : une
 * section nommée explicitement ne peut pas disparaître d'une langue sans que la
 * compilation le signale, là où un `Object.values()` avalerait l'oubli.
 */
export default function ConfidentialiteContent() {
  const d = useConfidentialite()
  const s = d.sections
  return (
    <LegalPage
      title={d.title}
      accent={d.accent}
      updated={d.updated}
      current="/confidentialite"
      intro={d.intro}
    >
      <Section title={s.controller.title}>{s.controller.body}</Section>
      <Section title={s.collected.title}>{s.collected.body}</Section>
      <Section title={s.cookies.title}>{s.cookies.body}</Section>
      <Section title={s.purposes.title}>{s.purposes.body}</Section>
      <Section title={s.sharing.title}>{s.sharing.body}</Section>
      <Section title={s.retention.title}>{s.retention.body}</Section>
      <Section title={s.rights.title}>{s.rights.body}</Section>
      <Section title={s.security.title}>{s.security.body}</Section>
      <Section title={s.minors.title}>{s.minors.body}</Section>
      <Section title={s.changes.title}>{s.changes.body}</Section>
    </LegalPage>
  )
}
