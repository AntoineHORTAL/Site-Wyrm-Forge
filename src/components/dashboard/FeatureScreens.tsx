'use client'

import { useTheme } from '@/components/providers/ThemeProvider'

/**
 * Les deux écrans de la convention de coupure (`app_settings.off_behavior`).
 *
 * Ils vivent ici plutôt que dans chaque onglet parce que la convention n'a de
 * valeur que si elle est IDENTIQUE partout : une feature coupée doit se lire de
 * la même façon quel que soit l'onglet où on tombe dessus. Le JSX de
 * `ComingSoonScreen` était jusqu'ici recopié dans `EcaillesTab` ; il en sort pour
 * que Scénarios — et les prochains — n'aient pas à le redupliquer.
 *
 * Le troisième comportement, `'degraded'`, n'a volontairement PAS de composant :
 * un repli dégradé est par nature spécifique (MatchUp garde son radar et sa
 * comparaison de stats, et n'affiche l'encart que sur le bloc IA). Il se compose
 * avec `UnavailableNotice` posé à l'intérieur du composant, pas à sa place.
 */

/**
 * `off_behavior = 'hidden'` — catégorie 1 (lancement).
 *
 * L'entrée de navigation est absente ; cet écran ne se voit QUE sur accès direct
 * (deep-link `?tab=…`, favori, lien partagé). Il ne promet pas de date : dire
 * « bientôt » engage déjà assez.
 */
export function ComingSoonScreen({ title, text }: { title: string; text: string }) {
  const { theme } = useTheme()
  const c = theme === 'mythic'

  return (
    <div style={{
      textAlign: 'center', padding: '60px 32px', borderRadius: 12,
      border: `2px dashed ${c ? 'rgba(186,117,23,0.25)' : '#27272A'}`,
    }}>
      <div style={{ fontSize: 40, marginBottom: 16 }}>🔥</div>
      <h3 style={{ fontSize: 20, fontWeight: 600, color: '#F5F2FA', marginBottom: 8 }}>
        {title}
      </h3>
      <p style={{ color: 'var(--text-muted)', fontSize: 14, margin: '0 auto', maxWidth: 380 }}>
        {text}
      </p>
    </div>
  )
}

/**
 * `off_behavior = 'notice'` — catégorie 2 (kill switch), le défaut.
 *
 * ⚠️ L'entrée de navigation RESTE visible et l'écran dit explicitement que c'est
 * temporaire. C'est le point de la convention : la feature était là hier, la faire
 * disparaître se lirait comme une perte de données et enverrait l'utilisateur au
 * support. On ne donne ni cause ni délai — les deux seraient des promesses.
 */
export function UnavailableNotice({ title, text }: { title: string; text: string }) {
  const { theme } = useTheme()
  const c = theme === 'mythic'

  return (
    <div style={{
      textAlign: 'center', padding: '48px 32px', borderRadius: 12,
      border: `1px solid ${c ? 'rgba(186,117,23,0.2)' : '#27272A'}`,
      background: c ? 'rgba(42,21,71,0.25)' : 'rgba(255,255,255,0.02)',
    }}>
      <div style={{ fontSize: 32, marginBottom: 14 }}>🔧</div>
      <h3 style={{ fontSize: 17, fontWeight: 600, color: '#F5F2FA', marginBottom: 6 }}>
        {title}
      </h3>
      <p style={{ color: 'var(--text-muted)', fontSize: 14, margin: '0 auto', maxWidth: 420 }}>
        {text}
      </p>
    </div>
  )
}
