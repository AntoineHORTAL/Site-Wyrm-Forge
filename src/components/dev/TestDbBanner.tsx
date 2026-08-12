import {
  describeProject,
  inspectSupabaseEnv,
  readSupabaseEnv,
  PROD_SUPABASE_URL,
} from '@/lib/supabase/environment'

/**
 * Bandeau « BASE DE TEST » + garde-fou de configuration Supabase.
 *
 * Pendant web du bandeau de l'app WPF (`ApplyTestDbBanner` / `PositionTestDbBanner`).
 * Monté une seule fois dans le layout racine → visible sur TOUTES les pages, dashboard
 * comme pages publiques.
 *
 * ⚠️ Server Component (pas de `'use client'`) : il ne fait que lire deux variables
 * `NEXT_PUBLIC_*` et rendre du HTML statique. Le passer en client n'apporterait rien et
 * enverrait du JS sur toutes les pages du site pour un `<div>`.
 *
 * En production, la valeur nominale est « rien à afficher » : l'URL de prod ne déclenche
 * pas le bandeau, et l'écran d'erreur ci-dessous est bridé au développement (voir
 * `blocking`).
 */
export default function TestDbBanner() {
  const { url, key } = readSupabaseEnv()
  const verdict = inspectSupabaseEnv(url, key)

  // L'écran bloquant ne sort JAMAIS en production.
  //
  // Ce n'est pas de la prudence de principe : le seul environnement concerné par cette
  // classe de faute est le poste de dev (`.env.local` édité à la main). Bloquer le site
  // public sur une heuristique — même conservatrice — mettrait de vrais visiteurs à la
  // merci d'un faux positif, pour un diagnostic qui ne s'adresse qu'à nous. En prod, le
  // problème est signalé dans les logs serveur et rien d'autre.
  const blocking = process.env.NODE_ENV !== 'production'

  if (verdict.kind === 'missing') {
    const detail = `Variables manquantes : ${verdict.missing.join(', ')}`
    if (!blocking) {
      console.error(`[supabase] ${detail}`)
      return null
    }
    return (
      <ConfigError
        title="Configuration Supabase absente"
        detail={detail}
        fix="Crée un .env.local à la racine du projet avec NEXT_PUBLIC_SUPABASE_URL et NEXT_PUBLIC_SUPABASE_ANON_KEY, puis relance `npm run dev` (les variables ne sont lues qu'au démarrage)."
      />
    )
  }

  if (verdict.kind === 'mismatch') {
    const detail =
      `L'URL désigne le projet ${describeProject(verdict.urlRef)}, ` +
      `mais la clé appartient au projet ${describeProject(verdict.keyRef)}.`
    if (!blocking) {
      console.error(`[supabase] Configuration incohérente. ${detail}`)
      return null
    }
    return (
      <ConfigError
        title="Configuration Supabase incohérente"
        detail={detail}
        fix="Dans .env.local, NEXT_PUBLIC_SUPABASE_URL et NEXT_PUBLIC_SUPABASE_ANON_KEY doivent venir du MÊME projet Supabase. Corrige les deux ensemble, puis relance `npm run dev`."
      />
    )
  }

  if (!verdict.isTest) return null // production : aucun bandeau, aucun impact de mise en page

  return (
    <div
      style={{
        background: '#C0392B',
        borderBottom: '1px solid #8A1F1F',
        color: '#FFFFFF',
        font: '700 12px/1 "Segoe UI", system-ui, sans-serif',
        letterSpacing: '0.08em',
        padding: '8px 12px',
        textAlign: 'center',
      }}
      // L'URL complète va dans l'infobulle, pas dans le bandeau : celui-ci doit rester
      // lisible d'un coup d'œil. Même partage qu'en WPF.
      title={`Supabase : ${verdict.url}`}
    >
      BASE DE TEST
    </div>
  )
}

/**
 * Écran d'erreur bloquant (développement uniquement).
 *
 * Pendant web de la boîte de dialogue + `Environment.Exit` du WPF : on ne se rabat pas en
 * silence sur un fonctionnement dégradé. Une config à moitié basculée produit des erreurs
 * Supabase diffuses, très loin de leur cause — mieux vaut un mur qui nomme le fichier à
 * corriger.
 *
 * Rouge plein, volontairement hors charte : cet écran ne doit jamais pouvoir être confondu
 * avec une page du site.
 */
function ConfigError({ title, detail, fix }: { title: string; detail: string; fix: string }) {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 99999,
        background: '#1A1A1A',
        color: '#FFFFFF',
        font: '14px/1.6 "Segoe UI", system-ui, sans-serif',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}
    >
      <div style={{ maxWidth: 620, border: '2px solid #C0392B', borderRadius: 8, padding: 24 }}>
        <div
          style={{
            background: '#C0392B',
            margin: '-24px -24px 20px',
            padding: '10px 24px',
            borderRadius: '4px 4px 0 0',
            fontWeight: 700,
            letterSpacing: '0.06em',
          }}
        >
          {title.toUpperCase()}
        </div>
        <p style={{ margin: '0 0 16px' }}>{detail}</p>
        <p style={{ margin: '0 0 16px' }}>{fix}</p>
        <p style={{ margin: 0, color: '#A1A1AA', fontSize: 12 }}>
          Projet de production : <code>{PROD_SUPABASE_URL}</code>
          <br />
          Cet écran n&apos;apparaît qu&apos;en développement.
        </p>
      </div>
    </div>
  )
}
