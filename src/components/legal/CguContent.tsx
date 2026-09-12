'use client'

import { LegalPage } from '@/components/legal/LegalPage'
import { Section } from '@/components/legal/LegalBlocks'
import { useCgu } from '@/locales/legal/cgu'

/* Corps de /cgu — composant CLIENT.
 *
 * La page (`src/app/cgu/page.tsx`) reste un Server Component pour exporter
 * `metadata` ; tout le contenu vit ici, parce qu'il dépend de la langue choisie
 * (état client, `LanguageProvider`). C'est ce découpage qui permet de traduire
 * les pages légales sans routage i18n par URL.
 *
 * L'ORDRE des sections est porté par ce fichier, pas par le dictionnaire : une
 * section nommée explicitement ne peut pas disparaître d'une langue sans que la
 * compilation le signale, là où un `Object.values()` avalerait l'oubli.
 */
export default function CguContent() {
  const d = useCgu()
  const s = d.sections
  return (
    <LegalPage
      title={d.title}
      accent={d.accent}
      updated={d.updated}
      current="/cgu"
      intro={d.intro}
    >
      <Section title={s.scope.title}>{s.scope.body}</Section>
      <Section title={s.beta.title}>{s.beta.body}</Section>
      <Section title={s.account.title}>{s.account.body}</Section>
      <Section title={s.riotLink.title}>{s.riotLink.body}</Section>
      <Section title={s.rules.title}>{s.rules.body}</Section>
      <Section title={s.userContent.title}>{s.userContent.body}</Section>
      <Section title={s.scales.title}>{s.scales.body}</Section>
      <Section title={s.subscriptions.title}>{s.subscriptions.body}</Section>
      <Section title={s.availability.title}>{s.availability.body}</Section>
      <Section title={s.termination.title}>{s.termination.body}</Section>
      <Section title={s.riotDisclaimer.title}>{s.riotDisclaimer.body}</Section>
      <Section title={s.changes.title}>{s.changes.body}</Section>
      <Section title={s.disputes.title}>{s.disputes.body}</Section>
    </LegalPage>
  )
}
