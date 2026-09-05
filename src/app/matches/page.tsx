/**
 * Page d'accueil de la recherche publique d'historique (F3).
 *   /matches  →  barre de recherche  →  /matches/[region]/GameName%23TAG
 *
 * Accessible sans connexion. La barre `PlayerSearchBar` route vers `/matches`
 * (prop `basePath`) au lieu de `/summoner` (profil public, réservé).
 */
import PlayerSearchBar from '@/components/player/PlayerSearchBar'

export const metadata = {
  title: 'Historique de parties — Wyrm Forge',
  description: 'Recherche l\'historique de parties League of Legends d\'un joueur : KDA, builds, scoreboard.',
}

export default function MatchesSearchPage() {
  return (
    <main style={{
      // 100vh − hauteur du header (voir `--nav-h` dans globals.css) : le header
      // est dans le flux du layout racine, un 100vh brut ferait défiler la page
      // de sa hauteur pour rien.
      minHeight: 'calc(100vh - var(--nav-h))', padding: '80px clamp(12px, 4vw, 40px)',
      maxWidth: 720, margin: '0 auto', color: '#F5F2FA',
    }}>
      <h1 className="font-mythic" style={{
        fontSize: 'clamp(28px, 6vw, 44px)', fontWeight: 600,
        margin: '0 0 12px', letterSpacing: '-1px',
      }}>
        <span className="accent-text">Historique</span> de parties
      </h1>
      <p style={{ fontSize: 15, color: 'var(--text-muted)', margin: '0 0 28px', maxWidth: 520 }}>
        Entre un Riot ID (<code>GameName#TAG</code>) pour consulter l&apos;historique complet
        d&apos;un joueur — résultat, champion, KDA, items. Aucun compte requis.
      </p>

      <PlayerSearchBar basePath="/matches" />

      <p style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 18 }}>
        Exemple : <code>Faker#KR1</code> sur le serveur KR.
      </p>
    </main>
  )
}
