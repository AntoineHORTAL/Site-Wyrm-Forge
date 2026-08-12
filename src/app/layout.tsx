import type { Metadata } from 'next'
import './globals.css'
import { ThemeProvider } from '@/components/providers/ThemeProvider'
import TestDbBanner from '@/components/dev/TestDbBanner'

export const metadata: Metadata = {
  title: 'Wyrm Forge — L\'assistant LoL le plus customisable',
  description: 'Overlay 100% personnalisable, builds et jungle paths partagés par la communauté, analyses IA. Wyrm Forge s\'adapte à toi — pas l\'inverse.',
  icons: {
    icon: '/wyrm-logo.ico',
    shortcut: '/wyrm-logo.ico',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body>
        {/* Avant le ThemeProvider et dans le flux : le bandeau doit coiffer la page,
            pas se superposer à un en-tête. Il ne rend rien quand le site parle à la
            production, donc zéro impact de mise en page dans le cas nominal. */}
        <TestDbBanner />
        <ThemeProvider>
          {children}
        </ThemeProvider>
      </body>
    </html>
  )
}
