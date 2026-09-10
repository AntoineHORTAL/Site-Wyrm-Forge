'use client'

import { useState } from 'react'
import { useTheme } from '@/components/providers/ThemeProvider'
import { useLanguage } from '@/components/providers/LanguageProvider'
import { useSession } from '@/components/providers/SessionProvider'
import { formatPrice } from '@/locales/landing'
import { WINDOWS_DOWNLOAD_URL } from '@/lib/download'
import { PRICING_TIERS } from '@/lib/pricing-tiers'

const WindowsIcon = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
    <rect x="3" y="3" width="8" height="8" rx="1" />
    <rect x="13" y="3" width="8" height="8" rx="1" />
    <rect x="3" y="13" width="8" height="8" rx="1" />
    <rect x="13" y="13" width="8" height="8" rx="1" />
  </svg>
)

// Les montants vivent dans `src/lib/pricing-tiers.ts` (module pur), pour que
// `landing.test.ts` puisse vérifier sans jsdom que la promesse « 2 mois offerts »
// correspond bien aux prix affichés.
//
// ⚠️ L'ancien `ANNUAL_FACTOR = 0.9` a été RETIRÉ : les prix annuels sont
// désormais des valeurs fixes et arrondies (30 € / 60 €), pas le produit d'une
// formule. Ne pas le réintroduire — il produisait des montants à deux décimales
// (32,40 € / 64,80 €) et faisait dépendre un prix affiché d'un calcul flottant.

// Le formatage des prix (séparateur décimal ET position du symbole €) vit dans
// `formatPrice` (src/locales/landing.ts) — seule source de vérité, partagée par
// tous les affichages de montant de la vitrine.
//
// ATTENTION : CE COMPOSANT EST MONTE A DEUX ENDROITS, et c'est ce qui dicte le
// comportement du bouton d'abonnement :
//   - sur la vitrine publique (`page.tsx`, branche visiteur) : personne n'est
//     connecte, le clic doit donc ouvrir la modale de connexion ;
//   - dans le dashboard, comme onglet cache `tarifs` (`Dashboard.tsx`) : la
//     personne est connectee, le clic ouvre Stripe Checkout.
// D'ou la lecture de `useSession()` ici plutot qu'une prop : un meme composant,
// deux points de montage, et aucun des deux n'a a savoir lequel s'applique.

export default function Pricing() {
  const { theme } = useTheme()
  const c = theme === 'mythic'
  const { t, lang } = useLanguage()
  const p = t.pricing
  const [annual, setAnnual] = useState(false)

  const { user, profile, openAuth } = useSession()

  // Palier en cours d'ouverture -- porte la CLE du palier clique plutot qu'un
  // booleen : deux boutons coexistent, seul celui qu'on a clique doit passer en
  // << Redirection... >>. Ne repasse jamais a `null` en cas de succes, la page
  // etant alors en train de partir vers Stripe.
  const [pending, setPending] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Palier actuel, normalise comme le fait `isPaidTier` : `profiles.tier` n'a
  // aucune contrainte CHECK, et `page.tsx` utilise un repli capitalise.
  const currentTier = profile?.tier?.trim().toLowerCase() ?? null

  async function subscribe(plan: 'forgeron' | 'maitre') {
    // Visiteur non connecte : le checkout exige un `user_id` a rattacher a la
    // session Stripe. On ouvre la modale plutot que de laisser la route repondre
    // 401 -- c'est la meme personne, il lui manque juste un compte.
    if (!user) { openAuth(); return }

    setError(null)
    setPending(plan)
    try {
      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // Seuls le palier et la periodicite partent d'ici. Jamais un montant :
        // le prix est choisi cote serveur a partir de ce couple.
        body: JSON.stringify({ plan, period: annual ? 'annuel' : 'mensuel' }),
      })

      const data = await res.json().catch(() => null)
      if (!res.ok || !data?.url) {
        // Convention du repo : le code technique reste dans la console,
        // l'utilisateur lit un message traduit.
        console.error('[pricing] checkout:', res.status, data?.error)
        setError(p.checkoutError)
        setPending(null)
        return
      }

      // Redirection pleine page, pas un `router.push` : Stripe Checkout est un
      // domaine tiers, hors du routeur Next.
      window.location.assign(data.url)
    } catch (err) {
      console.error('[pricing] checkout:', err)
      setError(p.checkoutError)
      setPending(null)
    }
  }

  const segBtn = (active: boolean): React.CSSProperties => ({
    padding: '7px 16px',
    borderRadius: 100,
    border: 'none',
    cursor: 'pointer',
    fontFamily: 'inherit',
    fontSize: 13,
    fontWeight: 600,
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    background: active
      ? c ? 'linear-gradient(135deg, var(--gold-light), var(--gold-pale))' : '#FAFAFA'
      : 'transparent',
    color: active ? (c ? '#1a0f02' : '#09090B') : 'var(--text-muted)',
    transition: 'background 0.15s, color 0.15s',
  })

  return (
    <section
      id="tarifs"
      style={{
        padding: '88px 32px',
        background: c ? '#0A0612' : '#0F0F11',
        borderTop: c ? undefined : '1px solid #1F1F23',
        borderBottom: c ? undefined : '1px solid #1F1F23',
      }}
    >
      <div style={{ textAlign: 'center', marginBottom: 32 }}>
        <span className="land-eyebrow">{p.eyebrow}</span>
        <h2
          className="font-mythic"
          style={{ fontSize: c ? 'clamp(28px, 4.5vw, 42px)' : 'clamp(24px, 4vw, 36px)', fontWeight: 600, margin: '0 0 14px', color: '#F5F2FA', letterSpacing: c ? undefined : '-0.5px' }}
        >
          {p.titleBefore}<span className="accent-text">{p.titleAccent}</span>{p.titleAfter}
        </h2>
        <p style={{ color: 'var(--text-muted)', fontSize: 16, maxWidth: 520, margin: '0 auto' }}>
          {p.subtitle}
        </p>
      </div>

      {/* Toggle Mensuel / Annuel */}
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 44 }}>
        <div
          style={{
            display: 'inline-flex',
            padding: 4,
            gap: 4,
            borderRadius: 100,
            background: c ? 'rgba(20,10,35,0.6)' : '#18181B',
            border: c ? '1px solid rgba(186,117,23,0.25)' : '1px solid #27272A',
          }}
        >
          <button onClick={() => setAnnual(false)} style={segBtn(!annual)}>{p.monthly}</button>
          <button onClick={() => setAnnual(true)} style={segBtn(annual)}>
            {p.annual}
            <span style={{ fontSize: 11, fontWeight: 700, color: annual ? 'inherit' : (c ? '#EF9F27' : '#7F77DD') }}>{p.annualPerk}</span>
          </button>
        </div>
      </div>

      <div className="land-pricing-grid">
        {PRICING_TIERS.map((tier, i) => {
          const copy = p.tiers[i]
          const isFree = tier.monthly === 0
          // En mode annuel, le « /mois » affiché est le prix annuel ramené au mois
          // (30 € → 2,50 €), pas le mensuel remisé : c'est le montant réellement
          // engagé qui doit se lire, et les deux ne coïncident pas.
          const perMonth = annual ? tier.annual / 12 : tier.monthly
          return (
            <div
              key={tier.name}
              className="wf-card land-reveal"
              style={{
                position: 'relative',
                display: 'flex',
                flexDirection: 'column',
                padding: '28px 24px',
                animationDelay: `${i * 0.07}s`,
                ...(tier.popular
                  ? {
                      border: c ? '1.5px solid var(--gold)' : '1.5px solid #7F77DD',
                      background: c
                        ? 'linear-gradient(180deg, rgba(58,30,90,0.45) 0%, rgba(21,8,40,0.6) 100%)'
                        : '#1A1530',
                    }
                  : {}),
              }}
            >
              {tier.popular && (
                <div
                  style={{
                    position: 'absolute', top: -12, left: '50%', transform: 'translateX(-50%)',
                    fontSize: 11, fontWeight: 700, padding: '4px 14px', borderRadius: 20,
                    letterSpacing: 1, textTransform: 'uppercase', whiteSpace: 'nowrap',
                    background: c ? 'linear-gradient(135deg, var(--gold), var(--gold-light))' : '#7F77DD',
                    color: c ? '#0A0612' : 'white',
                  }}
                >
                  {p.popular}
                </div>
              )}

              {/* Nom + tagline */}
              <div style={{ fontSize: c ? 20 : 16, fontWeight: 700, color: c ? '#EF9F27' : '#A1A1AA', fontFamily: c ? 'var(--font-serif)' : undefined, letterSpacing: c ? '0.3px' : 1, textTransform: c ? undefined : 'uppercase', marginBottom: 4 }}>
                {copy.name}
              </div>
              <div style={{ fontSize: 13, color: 'var(--text-dim)', marginBottom: 18 }}>{copy.tagline}</div>

              {/* Prix */}
              <div style={{ minHeight: 64, marginBottom: 18 }}>
                {isFree ? (
                  <div style={{ fontSize: 32, fontWeight: 700, color: '#F5F2FA', lineHeight: 1.1 }}>{p.free}</div>
                ) : (
                  <>
                    <div style={{ fontSize: 32, fontWeight: 700, color: '#F5F2FA', lineHeight: 1.1 }}>
                      {formatPrice(perMonth, lang)}
                      <small style={{ fontSize: 14, color: 'var(--text-dim)', fontWeight: 400 }}>{p.perMonth}</small>
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 4, minHeight: 16 }}>
                      {annual
                        ? p.billedAnnually.replace('{price}', formatPrice(tier.annual, lang))
                        : p.noCommitment}
                    </div>
                  </>
                )}
              </div>

              {/* Features */}
              <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 22px', flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {copy.features.map((f) => (
                  <li key={f} style={{ fontSize: 13, color: 'var(--text-muted)', paddingLeft: 22, position: 'relative', lineHeight: 1.4 }}>
                    <span style={{ position: 'absolute', left: 0, top: 1, color: c ? '#BA7517' : '#7F77DD', fontSize: 12, fontWeight: 700 }}>
                      {c ? '◆' : '✓'}
                    </span>
                    {f}
                  </li>
                ))}
              </ul>

              {/* CTA — trois formes : téléchargement, abonnement Stripe, ou « bientôt » */}
              {tier.cta === 'download' ? (
                <a href={WINDOWS_DOWNLOAD_URL} download className="wf-btn-gold" style={{ justifyContent: 'center' }}>
                  <WindowsIcon />
                  {p.ctaDownload}
                </a>
              ) : tier.cta === 'subscribe' && tier.plan ? (
                (() => {
                  const isCurrent = currentTier !== null && currentTier === tier.name.toLowerCase()
                  const isPending = pending === tier.plan
                  // Bouton inerte sur son propre palier : proposer un second
                  // paiement à quelqu'un qui l'a déjà créerait un doublon
                  // d'abonnement chez Stripe, pas une mise à niveau.
                  const disabled = isCurrent || isPending

                  return (
                    <button
                      type="button"
                      onClick={() => subscribe(tier.plan!)}
                      disabled={disabled}
                      style={{
                        width: '100%', padding: '12px 0', borderRadius: 8,
                        cursor: disabled ? 'default' : 'pointer',
                        fontFamily: 'inherit', fontSize: 14, fontWeight: 600,
                        background: isCurrent
                          ? 'transparent'
                          : c ? 'linear-gradient(135deg, var(--gold), var(--gold-light))' : '#7F77DD',
                        color: isCurrent
                          ? 'var(--text-dim)'
                          : c ? '#0A0612' : '#fff',
                        border: isCurrent
                          ? `1px solid ${c ? 'rgba(186,117,23,0.25)' : '#3F3F46'}`
                          : 'none',
                        opacity: isPending ? 0.7 : 1,
                        transition: 'opacity 0.15s',
                      }}
                    >
                      {isCurrent  ? p.ctaCurrent
                       : isPending ? p.ctaSubscribeLoading
                       : user      ? p.ctaSubscribe
                       : p.ctaSubscribeAnon}
                    </button>
                  )
                })()
              ) : (
                <button
                  type="button"
                  disabled
                  title={p.ctaSoonTitle}
                  style={{
                    width: '100%', padding: '12px 0', borderRadius: 8, cursor: 'not-allowed',
                    fontFamily: 'inherit', fontSize: 14, fontWeight: 600,
                    background: 'transparent',
                    color: 'var(--text-dim)',
                    border: `1px solid ${c ? 'rgba(186,117,23,0.25)' : '#3F3F46'}`,
                    opacity: 0.7,
                  }}
                >
                  {p.ctaSoon}
                </button>
              )}
            </div>
          )
        })}
      </div>

      {/* Échec d'ouverture du checkout — sous la grille et pas dans une carte :
          l'erreur ne concerne pas un palier en particulier. */}
      {error && (
        <p role="alert" style={{ textAlign: 'center', color: '#E24B4A', fontSize: 13, marginTop: 24 }}>
          {error}
        </p>
      )}

      {/* Paliers à venir — sobre, sans promesse de date */}
      <p style={{ textAlign: 'center', color: 'var(--text-dim)', fontSize: 13, marginTop: 36 }}>
        {p.moreTiers}
      </p>
    </section>
  )
}
