'use client'

import { LegalPage } from '@/components/legal/LegalPage'
import { Section } from '@/components/legal/LegalBlocks'
import { useCgv } from '@/locales/legal/cgv'

/* Corps de /cgv — composant CLIENT.
 *
 * La page (`src/app/cgv/page.tsx`) reste un Server Component pour exporter
 * `metadata` ; tout le contenu vit ici, parce qu'il dépend de la langue choisie
 * (état client, `LanguageProvider`). C'est ce découpage qui permet de traduire
 * les pages légales sans routage i18n par URL.
 *
 * L'ORDRE des sections est porté par ce fichier, pas par le dictionnaire : une
 * section nommée explicitement ne peut pas disparaître d'une langue sans que la
 * compilation le signale, là où un `Object.values()` avalerait l'oubli.
 */
export default function CgvContent() {
  const d = useCgv()
  const s = d.sections
  return (
    <LegalPage
      title={d.title}
      accent={d.accent}
      updated={d.updated}
      current="/cgv"
      intro={d.intro}
    >
      <Section title={s.seller.title}>{s.seller.body}</Section>
      <Section title={s.offers.title}>{s.offers.body}</Section>
      <Section title={s.price.title}>{s.price.body}</Section>
      <Section title={s.order.title}>{s.order.body}</Section>
      <Section title={s.term.title}>{s.term.body}</Section>
      <Section title={s.withdrawal.title}>{s.withdrawal.body}</Section>
      <Section title={s.guarantees.title}>{s.guarantees.body}</Section>
      <Section title={s.complaints.title}>{s.complaints.body}</Section>
      <Section title={s.mediation.title}>{s.mediation.body}</Section>
      <Section title={s.personalData.title}>{s.personalData.body}</Section>
      <Section title={s.disputes.title}>{s.disputes.body}</Section>
      <Section title={s.annex.title}>{s.annex.body}</Section>
    </LegalPage>
  )
}
