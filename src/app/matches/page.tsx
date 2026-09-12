/**
 * Page d'accueil de la recherche publique d'historique (F3).
 *   /matches  →  barre de recherche  →  /matches/[region]/GameName%23TAG
 *
 * Accessible sans connexion. La barre `PlayerSearchBar` route vers `/matches`
 * (prop `basePath`) au lieu de `/summoner` (profil public, réservé).
 */
import type { Metadata } from 'next'
import PlayerSearchBar from '@/components/player/PlayerSearchBar'

export const metadata: Metadata = {
  title: 'Historique de parties — Wyrm Forge',
  description: 'Recherche l\'historique de parties League of Legends d\'un joueur : KDA, builds, scoreboard.',
  /**
   * 🔴 NOINDEX — décidé au chantier AdSense du 2026-09-12.
   *
   * Cette page est un OUTIL, pas un contenu : hors saisie d'un Riot ID, elle ne
   * porte qu'un titre, un paragraphe et un champ de recherche. Proposée à
   * l'indexation, elle tire vers le bas la valeur moyenne des pages du site —
   * exactement le grief de l'examen AdSense (« contenu à faible valeur
   * informative »). Elle reste ACCESSIBLE et pleinement utilisable : seule son
   * indexation est retirée.
   *
   * `follow: true` et non `noindex, nofollow` : les résultats de recherche
   * (`/matches/[region]/[riotId]`), eux, portent de vraies données de parties.
   * Interdire de suivre les liens couperait le seul chemin qui y mène.
   *
   * ⚠️ Contrairement à ce qu'on pourrait croire, cette page EST liée depuis la
   * navigation globale — deux fois : « Joueurs » dans le header
   * (`PLAYER_SEARCH_HREF`, `lib/nav-links.ts`) et « Rechercher un joueur » dans
   * la colonne Ressources du footer. C'est sans conséquence ici, et même
   * préférable : `noindex, follow` laisse Google la parcourir pour atteindre les
   * résultats, sans la faire figurer dans l'index. Ne PAS retirer ces liens en
   * croyant « finir le travail » — ils sont le seul chemin vers la recherche.
   */
  robots: { index: false, follow: true },
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
