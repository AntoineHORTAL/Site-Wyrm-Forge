import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { setAdConsent } from '@/lib/ads'
import { ADSENSE_SCRIPT_SRC, CMP_SCRIPT_SRC } from '@/lib/adsense'

/**
 * Le CÂBLAGE entre la CMP et les deux consommateurs du consentement.
 *
 * `ads.test.ts` vérifie la décision (quel signal TCF vaut quel état). Ici on
 * vérifie ce qui la relie à l'écran, et deux propriétés que la logique pure ne
 * peut pas montrer :
 *
 *   • le rendu SERVEUR n'émet JAMAIS le script de régie. Le consentement est
 *     une notion client ; un HTML qui contiendrait déjà l'URL de Google
 *     appellerait Google pour quelqu'un qui n'a rien accepté — et sur une page
 *     prérendue en statique, ce HTML est servi à TOUT LE MONDE, indéfiniment ;
 *   • les composants s'ABONNENT au consentement au lieu de le lire une fois.
 *     C'est ce qui fait que « Accepter » affiche les publicités sans
 *     rechargement. Un `useState` posé au montage compilerait et passerait tous
 *     les autres tests, en cassant exactement cette exigence.
 *
 * `next/script` est remplacé par une balise nue : le composant réel délègue à
 * Next le MOMENT du chargement, pas la DÉCISION de charger, et c'est la
 * décision qu'on teste.
 */

vi.mock('next/script', () => ({
  // `async` n'est pas décoratif : sans lui, `@next/next/no-sync-scripts` traite
  // la balise comme un script bloquant. C'est aussi ce que fait le vrai
  // `next/script` en `afterInteractive`.
  default: ({ src, id }: { src?: string; id?: string }) =>
    <script async data-id={id} src={src} />,
}))

const { default: AdSenseScript } = await import('./AdSenseScript')

/**
 * Source débarrassée de ses commentaires.
 *
 * Indispensable : ces fichiers DOCUMENTENT ce qu'on leur interdit (« le couple
 * useState/useEffect qui vivait ici… »). Chercher le motif dans la source brute
 * ferait échouer le test sur sa propre explication. Même helper que
 * `src/app/public-pages.test.ts`, pour la même raison.
 */
const withoutComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ')

const read = (p: string) =>
  withoutComments(readFileSync(path.resolve(__dirname, p), 'utf8'))

beforeEach(() => { setAdConsent('unknown') })

describe('🔴 le rendu serveur n’appelle jamais la régie', () => {
  it('sans réponse du visiteur, aucun script AdSense dans le HTML', () => {
    expect(renderToStaticMarkup(<AdSenseScript />)).toBe('')
  })

  it('même consentement ACCORDÉ, le rendu serveur reste vide', () => {
    // `useSyncExternalStore` a un snapshot serveur figé à `false`. C'est
    // volontaire : le serveur ne peut pas connaître le choix d'un visiteur, et
    // une page prérendue est servie telle quelle à tous les suivants. Sans ce
    // snapshot, le premier visiteur ayant accepté ferait inscrire l'URL de
    // Google dans un HTML statique distribué à tout le monde.
    setAdConsent('granted')
    expect(renderToStaticMarkup(<AdSenseScript />)).toBe('')
    expect(renderToStaticMarkup(<AdSenseScript />)).not.toContain('googlesyndication')
  })

  it('l’URL de régie et celle de la CMP sont bien distinctes', () => {
    // La confusion serait grave dans les deux sens : charger la régie en
    // croyant charger la bannière, ou l'inverse.
    expect(ADSENSE_SCRIPT_SRC).toContain('googlesyndication.com')
    expect(CMP_SCRIPT_SRC).toContain('fundingchoicesmessages.google.com')
    expect(CMP_SCRIPT_SRC).not.toContain('googlesyndication.com')
  })
})

describe('🔴 les consommateurs s’abonnent, ils ne lisent pas une fois', () => {
  const ADSENSE = read('AdSenseScript.tsx')
  const ADSLOT = read('AdSlot.tsx')

  it('AdSenseScript passe par le hook réactif', () => {
    expect(ADSENSE).toContain('useAdConsent()')
    // Le couple qu'on a remplacé : il lisait le consentement au montage et n'en
    // sortait plus, donc la régie n'aurait démarré qu'au rechargement suivant.
    expect(ADSENSE).not.toContain('useState')
  })

  it('AdSlot aussi, et `granted` est une DÉPENDANCE de son effet', () => {
    // Sans cette dépendance, l'effet ne rejoue pas quand le consentement
    // arrive : l'emplacement resterait réservé et vide jusqu'au rechargement.
    expect(ADSLOT).toContain('useAdConsent()')
    expect(ADSLOT).toMatch(/\}, \[[^\]]*granted[^\]]*\]\)/)
  })

  it('aucun consommateur ne lit `hasAdConsent()` directement', () => {
    // Le point d'entrée reste `hasAdConsent()` — mais les COMPOSANTS passent par
    // le hook, seul chemin qui les re-rend au changement.
    for (const [nom, src] of [['AdSenseScript', ADSENSE], ['AdSlot', ADSLOT]] as const) {
      expect(src.includes('hasAdConsent('), nom).toBe(false)
    }
  })

  it('le hook expose bien un snapshot serveur fermé', () => {
    const hook = read('use-ad-consent.ts')
    expect(hook).toContain('useSyncExternalStore')
    expect(hook).toMatch(/=>\s*false/)
  })
})

describe('🔴 la bannière est atteignable après coup', () => {
  it('le footer monte le point d’entrée « Gérer les cookies »', () => {
    // RGPD art. 7-3 : retirer son consentement doit être aussi simple que de
    // l'avoir donné. Le footer est monté par le layout racine, donc ce point
    // d'entrée existe sur TOUTES les routes.
    const footer = read('../landing/Footer.tsx')
    expect(footer).toContain('<ManageCookiesButton')
  })

  it('la réouverture tente les deux API, et avoue son échec', () => {
    const manager = read('ConsentManager.tsx')
    expect(manager).toContain('showRevocationMessage')
    expect(manager).toContain('displayConsentUi')
    // Renvoie `false` plutôt que de ne rien faire : un bouton muet passe pour
    // cassé, et sur un sujet de consentement c'est l'impression à éviter.
    expect(manager).toMatch(/return false/)
  })
})

describe('🔴 les défauts Consent Mode précèdent tout script Google', () => {
  const layout = read('../../app/layout.tsx')

  it('les quatre signaux publicitaires partent à « denied »', () => {
    for (const signal of ['ad_storage', 'ad_user_data', 'ad_personalization', 'analytics_storage']) {
      expect(layout, signal).toContain(`'${signal}':'denied'`)
    }
  })

  it('le bloc de défauts est placé AVANT la CMP', () => {
    // L'ordre est la seule chose qui rende ces défauts utiles : posés après un
    // tag Google, ils arriveraient trop tard. La régie, elle, n'est plus dans ce
    // layout (voir le bloc suivant) : elle monte après, par construction.
    const defauts = layout.indexOf('consent-mode-default')
    const cmp = layout.indexOf('<ConsentManager')
    expect(defauts).toBeGreaterThan(-1)
    expect(defauts).toBeLessThan(cmp)
  })
})

describe('🔴 adsbygoogle.js ne se charge que sur le dashboard', () => {
  // Décision du 2026-10-19 : la publicité ne vit que dans la colonne du
  // dashboard (palier Apprenti). Un script chargé par le layout racine serait
  // présent sur toutes les pages, et les annonces automatiques d'AdSense
  // pourraient s'y placer sans aucun emplacement côté code.
  // `read` retire déjà les commentaires : ceux du layout NOMMENT AdSenseScript.
  const code = (src: string) => src
  const layout = read('../../app/layout.tsx')
  const rail = read('DashboardAdRail.tsx')

  it('le layout racine ne monte plus la régie', () => {
    expect(code(layout)).not.toContain('AdSenseScript')
    expect(code(layout)).not.toContain('ADSENSE_SCRIPT_SRC')
  })

  it('… mais garde la balise de validation du compte sur toutes les pages', () => {
    expect(code(layout)).toMatch(/'google-adsense-account':\s*ADSENSE_CLIENT_ID/)
  })

  it('la colonne du dashboard est le seul endroit qui la monte', () => {
    expect(code(rail)).toContain('<AdSenseScript />')
    const monteurs = ['../../app/layout.tsx', '../dashboard/Dashboard.tsx', 'AdSlot.tsx', 'HouseAdSlot.tsx']
      .filter(p => code(read(p)).includes('<AdSenseScript'))
    expect(monteurs).toEqual([])
  })

  it('le script reste derrière le consentement', () => {
    expect(read('AdSenseScript.tsx')).toContain('if (!granted) return null')
  })
})
