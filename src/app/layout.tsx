import type { Metadata } from 'next'
import './globals.css'
import { ThemeProvider } from '@/components/providers/ThemeProvider'
import { LanguageProvider } from '@/components/providers/LanguageProvider'

export const metadata: Metadata = {
  title: 'Wyrm Forge — L\'assistant LoL le plus customisable',
  description: 'Overlay 100% personnalisable, builds et jungle paths partagés par la communauté, analyses IA. Wyrm Forge s\'adapte à toi — pas l\'inverse.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // `lang="fr"` est le rendu serveur (les `metadata` ci-dessus sont FR elles aussi,
    // et ne peuvent pas suivre un choix client) ; LanguageProvider le réaligne côté
    // client sur la langue réellement choisie.
    <html lang="fr">
      <body>
        {/* Un SEUL provider de langue pour tout le site — vitrine, dashboard et pages
            connectées. Placé ici et pas dans une page : /profil et /consent sont des
            routes distinctes de `/`, elles n'auraient sinon aucun accès à la langue,
            et deux providers = deux états = un switch qui ne se propage pas. */}
        <LanguageProvider>
          <ThemeProvider>
            {children}
          </ThemeProvider>
        </LanguageProvider>
      </body>
    </html>
  )
}
