import type { Metadata } from 'next'
import Script from 'next/script'
import './globals.css'
import { ThemeProvider } from '@/components/providers/ThemeProvider'
import { LanguageProvider } from '@/components/providers/LanguageProvider'
import TestDbBanner from '@/components/dev/TestDbBanner'

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
        {/* Script de vérification AdSense — enfant du <body>, mais Next le REMONTE
            dans le <head> du HTML initial grâce à `beforeInteractive`. C'est ce que
            demande Google : le crawler doit le trouver dès le premier octet servi,
            avant toute hydratation React.

            ⚠️ `beforeInteractive` n'a d'effet QUE dans le layout racine — le placer
            dans une page ou un layout imbriqué le dégraderait silencieusement en
            `afterInteractive`.

            Pas d'`async` : l'attribut du snippet fourni par Google devient sans
            objet ici, c'est la stratégie du composant `Script` qui pilote le
            chargement. Le forcer à la main entrerait en conflit avec elle. */}
        <Script
          id="google-adsense"
          strategy="beforeInteractive"
          src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-2386151503865834"
          crossOrigin="anonymous"
        />
        {/* Avant le ThemeProvider et dans le flux : le bandeau doit coiffer la page,
            pas se superposer à un en-tête. Il ne rend rien quand le site parle à la
            production, donc zéro impact de mise en page dans le cas nominal. */}
        <TestDbBanner />
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