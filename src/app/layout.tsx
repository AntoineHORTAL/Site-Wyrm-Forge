import type { Metadata } from 'next'
import './globals.css'
import { ThemeProvider } from '@/components/providers/ThemeProvider'

export const metadata: Metadata = {
  title: 'Wyrm Forge — L\'assistant LoL le plus customisable',
  description: 'Overlay 100% personnalisable, builds et jungle paths partagés par la communauté, analyses IA. Wyrm Forge s\'adapte à toi — pas l\'inverse.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body>
        <ThemeProvider>
          {children}
        </ThemeProvider>
      </body>
    </html>
  )
}
