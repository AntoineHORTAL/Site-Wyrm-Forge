'use client'

import { useLegalShell } from '@/locales/legal/shell'

/* Briques de mise en forme des pages légales, extraites de `LegalPage.tsx`.
 *
 * ⚠️ Elles vivent dans leur PROPRE module parce que les dictionnaires de
 * contenu (`src/locales/legal/{cgu,cgv,mentions,confidentialite}.tsx`) les
 * importent : les laisser dans `LegalPage.tsx` — qui importe lui-même la
 * coquille du dictionnaire — formerait un cycle d'imports. Ici, la seule
 * dépendance est `locales/legal/shell`, un module feuille. */

/** Titre de section + contenu. Utilisé par les quatre pages légales. */
export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: 36 }}>
      <h2 style={{
        fontSize: 18, fontWeight: 700, marginBottom: 12,
        color: 'var(--gold-pale)',
      }}>
        {title}
      </h2>
      <div style={{ fontSize: 15, color: 'var(--text-muted)', lineHeight: 1.75 }}>
        {children}
      </div>
    </section>
  )
}

/** Liste à puces au style commun des pages légales. */
export function List({ children }: { children: React.ReactNode }) {
  return (
    <ul style={{ margin: '8px 0 0', paddingLeft: 20, display: 'grid', gap: 6 }}>
      {children}
    </ul>
  )
}

/** Encart « information manquante » — rend visible ce que HORTAL doit fournir.
 *
 *  Marqueur greppable dans LES DEUX langues : `grep -rn "HORTAL" src` liste tout
 *  ce qui reste à renseigner, badges rendus ET commentaires de source. Le
 *  préfixe est traduit (`legalShell.todoPrefix`) mais garde le même nom propre,
 *  justement pour que la recherche n'en rate aucun.
 *
 *  ⚠️ La version EN doit porter les MÊMES trous que la FR : un document anglais
 *  qui paraîtrait complet alors que le français signale une information
 *  manquante donnerait une fausse impression de complétude au lecteur qui ne
 *  lit que l'anglais. */
export function Todo({ children }: { children: React.ReactNode }) {
  const shell = useLegalShell()
  return (
    <span style={{
      display: 'inline-block', padding: '1px 7px', borderRadius: 4,
      background: 'rgba(239,159,39,0.12)', border: '1px dashed rgba(239,159,39,0.45)',
      color: '#EF9F27', fontSize: 13, fontWeight: 600,
    }}>
      [{shell.todoPrefix} — {children}]
    </span>
  )
}
