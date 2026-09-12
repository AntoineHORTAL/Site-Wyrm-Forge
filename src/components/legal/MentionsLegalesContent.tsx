'use client'

import { LegalPage } from '@/components/legal/LegalPage'
import { Section } from '@/components/legal/LegalBlocks'
import { useMentions } from '@/locales/legal/mentions'

/* Corps de /mentions-legales — composant CLIENT.
 *
 * La page (`src/app/mentions-legales/page.tsx`) reste un Server Component pour exporter
 * `metadata` ; tout le contenu vit ici, parce qu'il dépend de la langue choisie
 * (état client, `LanguageProvider`). C'est ce découpage qui permet de traduire
 * les pages légales sans routage i18n par URL.
 *
 * L'ORDRE des sections est porté par ce fichier, pas par le dictionnaire : une
 * section nommée explicitement ne peut pas disparaître d'une langue sans que la
 * compilation le signale, là où un `Object.values()` avalerait l'oubli.
 */
export default function MentionsLegalesContent() {
  const d = useMentions()
  const s = d.sections
  return (
    <LegalPage
      title={d.title}
      accent={d.accent}
      updated={d.updated}
      current="/mentions-legales"
      intro={d.intro}
    >
      <Section title={s.editor.title}>{s.editor.body}</Section>
      <Section title={s.contact.title}>{s.contact.body}</Section>
      <Section title={s.hosting.title}>{s.hosting.body}</Section>
      <Section title={s.ip.title}>{s.ip.body}</Section>
      <Section title={s.riot.title}>{s.riot.body}</Section>
      <Section title={s.report.title}>{s.report.body}</Section>
      <Section title={s.mediation.title}>{s.mediation.body}</Section>
      <Section title={s.law.title}>{s.law.body}</Section>
    </LegalPage>
  )
}
