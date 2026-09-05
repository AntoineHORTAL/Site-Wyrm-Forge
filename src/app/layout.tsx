import type { Metadata } from 'next'
import Script from 'next/script'
import './globals.css'
import { ThemeProvider } from '@/components/providers/ThemeProvider'
import { LanguageProvider } from '@/components/providers/LanguageProvider'
import { SessionProvider } from '@/components/providers/SessionProvider'
import { FeatureFlagsProvider } from '@/components/providers/FeatureFlagsProvider'
import { DashboardNavProvider } from '@/components/providers/DashboardNavProvider'
import SiteHeader from '@/components/nav/SiteHeader'
import TestDbBanner from '@/components/dev/TestDbBanner'

export const metadata: Metadata = {
  title: 'Wyrm Forge — L\'assistant LoL le plus customisable',
  description: 'Overlay 100% personnalisable, builds et jungle paths partagés par la communauté, analyses IA. Wyrm Forge s\'adapte à toi — pas l\'inverse.',
  // Seconde méthode de vérification AdSense, en complément du <Script> plus bas.
  //
  // Passe par `other` parce que `google-adsense-account` n'est pas une clé
  // standard de l'API Metadata : `other` est la porte de sortie prévue pour les
  // `<meta name=… content=…>` que Next ne connaît pas nativement.
  //
  // ⚠️ Et surtout : elle NE PEUT PAS être remplacée par le <Script>. En App
  // Router, un script `beforeInteractive` n'atterrit pas dans le HTML brut sous
  // forme de balise littérale — il y apparaît comme un `<link rel="preload">` et
  // un `self.__next_s.push(...)`, c'est-à-dire du JS à exécuter. Le crawler de
  // Google ne trouvait donc rien à vérifier (constaté par Invoke-WebRequest sur
  // le HTML servi). `metadata`, lui, est rendu dans le <head> au build/SSR :
  // la balise est présente sans dépendre de l'exécution du JS.
  //
  // ⚠️ Cet identifiant et celui du `client=` du <Script> désignent le MÊME
  // compte AdSense : ils doivent rester identiques.
  other: {
    'google-adsense-account': 'ca-pub-2383615103865834',
  },
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
          src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-2383615103865834"
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
            {/* Feature flags — AU-DESSUS de SessionProvider, et jamais dedans.
                Ce provider ne doit dépendre d'AUCUN utilisateur : /matches,
                /champions, /live et la vitrine sont publiques, et ce sont
                précisément les visiteurs anonymes qu'on ne peut pas prévenir
                autrement quand un kill switch tombe. La lecture anonyme est
                permise par la policy `as_select_anon` (migration 20260905000001).

                Au-dessus plutôt qu'à côté : SessionProvider n'en dépend pas, mais
                le placer plus haut laisse la porte ouverte à ce qu'il consomme un
                flag un jour, sans avoir à re-imbriquer tout le layout. */}
            <FeatureFlagsProvider>
            {/* Session unique pour tout le site (utilisateur, profil, solde d'Écailles).
                Elle vivait dans l'état de `page.tsx`, seul endroit où `Nav` était monté.
                Ici, elle est chargée UNE fois et lue partout — le header en a besoin sur
                /matches, /champions, /patch-notes… autant que sur `/`, sans redemander
                la session à chaque page. Le provider rend aussi la modale de connexion,
                puisque `openAuth()` doit être appelable depuis le header. */}
            <SessionProvider>
              {/* Onglet actif du dashboard : `page.tsx` le rend, le header le pilote. */}
              <DashboardNavProvider>
                {/* Le header précède `children` dans le flux : c'est ce qui permet au
                    Hero de remonter dessous (`marginTop: -64`) sans se le voir masquer. */}
                <SiteHeader />
                {children}
              </DashboardNavProvider>
            </SessionProvider>
            </FeatureFlagsProvider>
          </ThemeProvider>
        </LanguageProvider>
      </body>
    </html>
  )
}