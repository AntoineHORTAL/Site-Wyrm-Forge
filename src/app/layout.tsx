import type { Metadata } from 'next'
import './globals.css'
import { ThemeProvider } from '@/components/providers/ThemeProvider'
import { LanguageProvider } from '@/components/providers/LanguageProvider'
import { SessionProvider } from '@/components/providers/SessionProvider'
import { FeatureFlagsProvider } from '@/components/providers/FeatureFlagsProvider'
import { DashboardNavProvider } from '@/components/providers/DashboardNavProvider'
import SiteHeader from '@/components/nav/SiteHeader'
import Footer from '@/components/landing/Footer'
import TestDbBanner from '@/components/dev/TestDbBanner'
import AdSenseScript from '@/components/ads/AdSenseScript'
import ConsentManager from '@/components/ads/ConsentManager'
import { ADSENSE_CLIENT_ID } from '@/lib/adsense'

export const metadata: Metadata = {
  title: 'Wyrm Forge — L\'assistant LoL le plus customisable',
  description: 'Overlay 100% personnalisable, builds et jungle paths partagés par la communauté, analyses IA. Wyrm Forge s\'adapte à toi — pas l\'inverse.',
  // Vérification du compte AdSense — DÉSORMAIS LE SEUL CHEMIN, et il suffit.
  //
  // Passe par `other` parce que `google-adsense-account` n'est pas une clé
  // standard de l'API Metadata : `other` est la porte de sortie prévue pour les
  // `<meta name=… content=…>` que Next ne connaît pas nativement.
  //
  // C'est `metadata` qui fait le travail, et pas un script : il est rendu dans
  // le <head> au build/SSR, donc la balise est présente dans le HTML servi sans
  // dépendre de l'exécution du moindre JS. Un script `beforeInteractive`, lui,
  // n'atterrit pas dans le HTML brut sous forme de balise littérale — il y
  // apparaît comme un `<link rel="preload">` et un `self.__next_s.push(...)`,
  // que le crawler de Google ne sait pas lire (constaté par Invoke-WebRequest
  // sur le HTML servi).
  //
  // ⚠️ C'est précisément ce qui permet de conditionner le SCRIPT de régie au
  // consentement (voir <AdSenseScript /> plus bas) sans rien casser côté
  // vérification : la balise reste servie à tout le monde, le script non.
  other: {
    'google-adsense-account': ADSENSE_CLIENT_ID,
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // `lang="fr"` est le rendu serveur (les `metadata` ci-dessus sont FR elles aussi,
    // et ne peuvent pas suivre un choix client) ; LanguageProvider le réaligne côté
    // client sur la langue réellement choisie.
    <html lang="fr">
      <body>
        {/* ── Consent Mode v2 : TOUT est refusé par défaut ──────────────────
            Posé en <script> BRUT et en tête du <body>, donc exécuté avant tout
            script Google, CMP comprise. C'est la défense de fond : même si un
            tag Google se chargeait par un chemin qu'on n'a pas prévu, il
            démarrerait sans droit d'écrire de cookie ni de lire un identifiant.

            ⚠️ Pas de `next/script` ici : `beforeInteractive` ne garantit l'ordre
            que depuis le layout racine, et une balise brute est le seul moyen
            d'être certain que ces quatre `denied` précèdent le reste. L'inline
            est minuscule et ne dépend de rien.

            ⚠️ `wait_for_update` laisse 500 ms à la CMP pour transmettre un
            consentement déjà enregistré lors d'une visite précédente, avant que
            les tags ne concluent au refus. Sans ce délai, un visiteur qui a
            accepté hier repartirait en mode refusé le temps du chargement. */}
        <script
          id="consent-mode-default"
          dangerouslySetInnerHTML={{ __html:
            'window.dataLayer=window.dataLayer||[];'
            + 'function gtag(){dataLayer.push(arguments);}'
            + "gtag('consent','default',{"
            + "'ad_storage':'denied','ad_user_data':'denied',"
            + "'ad_personalization':'denied','analytics_storage':'denied',"
            + "'wait_for_update':500});",
          }}
        />
        {/* La bannière de consentement (Google CMP). Chargée pour TOUS —
            c'est elle qui recueille le choix, elle ne peut pas être derrière le
            choix. Tout le raisonnement est en tête de `ConsentManager`. */}
        <ConsentManager />
        {/* Script de régie AdSense — chargé UNIQUEMENT avec le consentement.
            Il vivait ici en `beforeInteractive`, donc sur toutes les pages, pour
            tous les visiteurs, avant toute interaction et sans consentement : un
            dépôt d'identifiants non strictement nécessaire, que l'article 82 de
            la loi Informatique et Libertés soumet à un consentement préalable.
            ⚠️ ORDRE VOULU : il vient APRÈS les défauts Consent Mode et après la
            CMP — il ne monte de toute façon rien tant que `hasAdConsent()` est
            faux. Tout le raisonnement est dans <AdSenseScript />. */}
        <AdSenseScript />
        {/* Avant le ThemeProvider et dans le flux : le bandeau doit coiffer la page,
            pas se superposer à un en-tête. Il ne rend rien quand le site parle à la
            production, donc zéro impact de mise en page dans le cas nominal. */}
        <TestDbBanner />
        {/* Un SEUL provider de langue pour tout le site — vitrine, dashboard et pages
            connectées. Placé ici et pas dans une page : /profil est une
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
                {/* Footer GLOBAL — et non plus rendu par la seule vitrine anonyme.
                    Il portait les trois liens légaux (/cgu, /confidentialite,
                    /mentions-legales) et la mention Riot, mais `page.tsx` ne le
                    montait que dans sa branche NON connectée : un utilisateur
                    connecté, et toutes les routes annexes (/matches, /champions,
                    /live, /summoner, /profil, /patch-notes, /about), n'y
                    avaient donc accès depuis AUCUNE page. L'article 6 III de la
                    LCEN veut un accès « facile, direct et permanent » — ce qui
                    exclut « seulement pour les visiteurs déconnectés de l'accueil ».

                    Monté ici plutôt que dupliqué route par route : un second
                    composant de pied de page finirait par diverger du premier, et
                    c'est la copie oubliée qui porterait les liens obsolètes. */}
                <Footer />
              </DashboardNavProvider>
            </SessionProvider>
            </FeatureFlagsProvider>
          </ThemeProvider>
        </LanguageProvider>
      </body>
    </html>
  )
}