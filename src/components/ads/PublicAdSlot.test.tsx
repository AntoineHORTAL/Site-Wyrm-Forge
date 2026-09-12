import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { setAdConsent } from '@/lib/ads'

/**
 * Les TROIS verrous d'un emplacement de page publique, et leur indépendance.
 *
 *   1. `ads_enabled`         — kill switch d'exploitation ;
 *   2. `shouldShowPublicAds` — verrou commercial (palier) ;
 *   3. `hasAdConsent()`      — verrou légal, appliqué plus bas dans `AdSlot`.
 *
 * Le premier a manqué ici jusqu'au 2026-09-12 alors que `Dashboard.tsx`
 * l'appliquait déjà : couper le flag éteignait la colonne du dashboard et
 * laissait les cinq emplacements des pages publiques en place. Un kill switch
 * qui ne couvre que la moitié du site n'en est pas un — et c'est le seul moyen
 * d'éteindre la publicité en urgence depuis que la CMP peut ouvrir le verrou de
 * consentement.
 *
 * ⚠️ Chaque verrou est testé SEUL, les deux autres grands ouverts. C'est la
 * seule façon de prouver qu'il suffit à lui-même : un test qui les fermerait
 * tous passerait même si le code n'en lisait qu'un.
 */

let adsEnabled = true
let session = {
  user: null as { id: string } | null,
  profile: null as { tier: string } | null,
  loading: false,
  isAdmin: false,
}

vi.mock('@/components/providers/SessionProvider', () => ({
  useSession: () => session,
}))
vi.mock('@/components/providers/FeatureFlagsProvider', () => ({
  useFlag: (key: string) => (key === 'ads_enabled' ? adsEnabled : true),
}))

const { default: PublicAdSlot } = await import('./PublicAdSlot')

const render = () => renderToStaticMarkup(<PublicAdSlot name="test-slot" />)

/** Visiteur anonyme — le cas nominal d'une page publique. */
const anonyme = () => { session = { user: null, profile: null, loading: false, isAdmin: false } }
const connecte = (tier: string, isAdmin = false) => {
  session = { user: { id: 'u-1' }, profile: { tier }, loading: false, isAdmin }
}

beforeEach(() => {
  adsEnabled = true
  anonyme()
  // Consentement ACCORDÉ dans tout ce fichier : on teste les verrous
  // d'AU-DESSUS, et un consentement fermé les masquerait tous.
  setAdConsent('granted')
})

describe('🔴 kill switch `ads_enabled` — il éteint AUSSI les pages publiques', () => {
  it('coupé, rien n’est rendu pour un visiteur anonyme', () => {
    // Le cas exact de la régression : consentement accordé, palier éligible,
    // et pourtant l'emplacement ne doit pas exister.
    adsEnabled = false
    expect(render()).toBe('')
  })

  it('coupé, rien n’est rendu pour un Apprenti connecté', () => {
    adsEnabled = false
    connecte('apprenti')
    expect(render()).toBe('')
  })

  it('ouvert, l’emplacement est bien rendu — la preuve que le test mord', () => {
    // Sans cette assertion, les deux précédentes passeraient même si le
    // composant ne rendait JAMAIS rien.
    const html = render()
    expect(html).not.toBe('')
    expect(html).toContain('data-ad-slot="test-slot"')
  })

  it('il suffit à lui seul : les deux autres verrous restent ouverts', () => {
    adsEnabled = false
    connecte('apprenti')          // palier éligible
    expect(render()).toBe('')     // consentement accordé (beforeEach)
  })
})

describe('le verrou commercial reste appliqué, flag ouvert', () => {
  it.each(['forgeron', 'maître', 'légion'])('un abonné %s ne voit rien', (tier) => {
    connecte(tier)
    expect(render()).toBe('')
  })

  it('un Apprenti connecté voit l’emplacement', () => {
    connecte('apprenti')
    expect(render()).toContain('data-ad-slot')
  })

  it('un admin ne voit rien, même au palier gratuit', () => {
    connecte('apprenti', true)
    expect(render()).toBe('')
  })

  it('rien tant que la session n’est pas résolue', () => {
    session = { user: { id: 'u-1' }, profile: null, loading: true, isAdmin: false }
    expect(render()).toBe('')
  })
})

describe('dashboard et pages publiques lisent le MÊME flag', () => {
  it('la clé `ads_enabled` est partagée par les deux chemins', () => {
    // Deux clés distinctes rendraient le kill switch à moitié efficace sans que
    // rien ne le signale — exactement la panne que ce chantier corrige.
    const src = (p: string) => readFileSync(path.resolve(__dirname, p), 'utf8')
    for (const [nom, p] of [
      ['PublicAdSlot', './PublicAdSlot.tsx'],
      ['Dashboard', '../dashboard/Dashboard.tsx'],
    ] as const) {
      expect(src(p), nom).toContain("useFlag('ads_enabled')")
    }
  })
})
