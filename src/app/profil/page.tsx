'use client'

/**
 * Page de profil utilisateur : /profil
 *
 * Contenu :
 *   - Identité Wyrm Forge (pseudo, tier, certified, date d'inscription)
 *   - Identité Riot (gameName#tag, plateforme, lien vers stats)
 *   - Statistiques agrégées des dernières parties (winrate, kda moyen, etc.)
 *   - Champions les plus joués (top 3-5)
 *   - Mes builds (Item Builds Supabase)
 *   - Mes to-do lists (compteurs)
 */
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { useDashboard, useLang } from '@/locales/dashboard'
import { formatDate, formatDateTime, ddragonLocale } from '@/lib/intl'
import { subscriptionTierLabel } from '@/locales/dashboard/nav'
import { riotRankLabel, gamesLabel, type RiotRankKey } from '@/locales/dashboard/profil'
import {
  resolveSubscriptionView,
  type SubscriptionRow,
} from '@/lib/stripe/subscription-view'

const supabase = createClient()
const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPA_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const DDN      = 'https://ddragon.leagueoflegends.com'

interface UserProfile {
  id: string; username: string; email: string
  tier: string; role: string; certified: boolean
  tier_expires_at: string | null; created_at: string
  riot_gamename?: string | null
  riot_tagline?:  string | null
  riot_platform?: string | null
  riot_rank?:     string | null
}

// Rangs LoL utilisés pour la comparaison de stats moyennes.
// Valeurs approximatives basées sur les stats publiques de la communauté
// (sources : op.gg statistics, lolalytics, données aggregees).
//
// ⚠️ `key` EST la valeur écrite dans `profiles.riot_rank`, validée par
// `chk_profiles_riot_rank` : elle ne se traduit pas. Le libellé vit dans le dico
// (`profil.riotRanks`), la couleur reste ici — c'est du style, pas du texte.
export const LOL_RANKS: { key: RiotRankKey; color: string }[] = [
  { key: 'iron',     color: '#7C5D44' },
  { key: 'bronze',   color: '#9E6C3F' },
  { key: 'silver',   color: '#9CA3AF' },
  { key: 'gold',     color: '#EF9F27' },
  { key: 'platinum', color: '#5DCAA5' },
  { key: 'emerald',  color: '#10B981' },
  { key: 'diamond',  color: '#3A8AC9' },
  { key: 'master+',  color: '#A855F7' },
]

interface ChampInfo { id: string; name: string; image: string; numericId: number }
interface MatchInfo {
  matchId: string; championId: number; championName: string
  queueId: number; queueName: string
  kills: number; deaths: number; assists: number
  cs: number; duration: number; win: boolean; gameCreation: number
}

const TIER_COLORS: Record<string, string> = {
  apprenti: '#A1A1AA', forgeron: '#5DCAA5', maître: '#7F77DD',
  légion: '#3A8AC9',
  // Marqueur de rôle, pas un palier — voir `effectiveTier` (page.tsx) et la note
  // de `tiersFr` (locales/dashboard/nav.ts). Hors `TIER_ORDER`.
  admin: '#EF9F27',
}

export default function ProfilePage() {
  const router = useRouter()
  const dico = useDashboard()
  const lang = useLang()
  const P = dico.profil
  const G = P.page
  const [profile, setProfile]   = useState<UserProfile | null>(null)
  const [matches, setMatches]   = useState<MatchInfo[]>([])
  const [champMap, setChampMap] = useState<Record<number, ChampInfo>>({})
  const [version, setVersion]   = useState('')
  const [buildCount,     setBuildCount]    = useState(0)
  const [todoListCount,  setTodoListCount] = useState(0)
  const [todoItemCount,  setTodoItemCount] = useState(0)
  const [loading, setLoading] = useState(true)
  // Ligne `stripe_subscriptions` de l'utilisateur — `null` s'il n'a jamais eu
  // d'abonnement, ce qui est le cas de la grande majorité des comptes.
  const [subscription, setSubscription] = useState<SubscriptionRow | null>(null)
  // Le chargement mémorise un CODE, pas un texte : le message est composé au rendu.
  // Sans ça, le dico entrerait dans les dépendances de l'effet et une bascule de
  // langue relancerait tout le chargement du profil.
  const [errorKey, setErrorKey] = useState<'' | 'errSignedOut' | 'errNotFound' | 'errLoad'>('')

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true); setErrorKey('')
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) { setErrorKey('errSignedOut'); return }

        // Profil + compteurs Supabase en parallèle
        const [profRes, builds, todoLists, todoItems, subRes, vRes] = await Promise.all([
          supabase.from('profiles')
            .select('id, username, tier, role, certified, tier_expires_at, created_at, riot_gamename, riot_tagline, riot_platform, riot_rank')
            .eq('id', user.id).maybeSingle(),
          supabase.from('item_builds').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
          supabase.from('todo_lists').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
          supabase.from('todo_items').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
          // Abonnement Stripe. Lecture de SA ligne, garantie par la policy
          // `ss_select_own` (migration 20260909000003) : le `.eq()` ci-dessous est
          // du confort de requête, la barrière est en base. `maybeSingle` et non
          // `single` — l'absence de ligne est le cas NORMAL, pas une erreur.
          supabase.from('stripe_subscriptions')
            .select('stripe_customer_id, stripe_subscription_id, status, cancel_at_period_end, current_period_end')
            .eq('user_id', user.id).maybeSingle(),
          fetch(`${DDN}/api/versions.json`),
        ])
        if (cancelled) return

        // Une erreur ici ne doit PAS faire échouer la page : le profil est
        // chargé, seule la section Abonnement se dégrade (ni bouton de portail,
        // ni alerte d'impayé). `subRes.error` est déjà silencieux côté
        // PostgREST quand la ligne n'existe pas.
        setSubscription((subRes.data as SubscriptionRow | null) ?? null)

        const profData = profRes.data as Omit<UserProfile, 'email'> | null
        if (!profData) { setErrorKey('errNotFound'); return }
        const prof: UserProfile = { ...profData, email: user.email ?? '' }
        setProfile(prof)
        setBuildCount(builds.count ?? 0)
        setTodoListCount(todoLists.count ?? 0)
        setTodoItemCount(todoItems.count ?? 0)

        const vList: string[] = await vRes.json()
        const v = vList[0]
        setVersion(v)

        // Matchs Riot si user a un Riot ID
        if (prof.riot_gamename && prof.riot_tagline) {
          const { data: { session } } = await supabase.auth.getSession()
          if (!session) return
          const res = await fetch(
            `${SUPA_URL}/functions/v1/riot-matches?${new URLSearchParams({
              gameName: prof.riot_gamename,
              tagLine:  prof.riot_tagline,
              platform: prof.riot_platform ?? 'euw1',
              count:    '10',
            }).toString()}`,
            { headers: { apikey: SUPA_KEY, Authorization: `Bearer ${session.access_token}` } },
          )
          if (cancelled) return
          if (res.ok) {
            const data = await res.json()
            setMatches(data.matches ?? [])
          }
        }
      } catch {
        if (!cancelled) setErrorKey('errLoad')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [])

  /**
   * Carte des champions DDragon — effet SÉPARÉ, avec `lang` en dépendance.
   *
   * ⚠️ Le chargement vivait dans l'effet ci-dessus. L'y laisser en ajoutant `lang`
   * aurait rappelé `riot-matches` à chaque bascule de langue, donc consommé du quota
   * Riot pour un changement purement cosmétique.
   */
  useEffect(() => {
    if (!version) return
    let cancelled = false
    fetch(`${DDN}/cdn/${version}/data/${ddragonLocale(lang)}/champion.json`)
      .then(r => r.json())
      .then((cData: { data: Record<string, unknown> }) => {
        if (cancelled) return
        const map: Record<number, ChampInfo> = {}
        Object.values(cData.data).forEach((ch: unknown) => {
          const c = ch as { key: string; id: string; name: string; image: { full: string } }
          map[Number(c.key)] = { id: c.id, name: c.name, image: c.image.full, numericId: Number(c.key) }
        })
        setChampMap(map)
      })
      .catch(() => { /* icônes manquantes : la page reste lisible */ })
    return () => { cancelled = true }
  }, [version, lang])

  if (loading) {
    return (
      <main style={{ minHeight: '100vh', padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
        {G.loading}
      </main>
    )
  }
  if (errorKey || !profile) {
    return (
      <main style={{ minHeight: '100vh', padding: 40, color: '#E24B4A' }}>
        {errorKey ? G[errorKey] : G.errUnavailable}
      </main>
    )
  }

  // Stats agrégées des matchs
  const wins    = matches.filter(m => m.win).length
  const losses  = matches.length - wins
  const winrate = matches.length > 0 ? Math.round((wins / matches.length) * 100) : null
  const totalK  = matches.reduce((s, m) => s + m.kills,   0)
  const totalD  = matches.reduce((s, m) => s + m.deaths,  0)
  const totalA  = matches.reduce((s, m) => s + m.assists, 0)
  const avgKda  = totalD === 0 ? totalK + totalA : ((totalK + totalA) / totalD).toFixed(2)
  const avgCs   = matches.length > 0
    ? Math.round(matches.reduce((s, m) => s + m.cs, 0) / matches.length)
    : null

  // Champion le plus joué (compteur des récurrences)
  const champCounts: Record<number, { count: number; w: number; champ?: ChampInfo }> = {}
  matches.forEach(m => {
    if (!champCounts[m.championId]) champCounts[m.championId] = { count: 0, w: 0, champ: champMap[m.championId] }
    champCounts[m.championId].count++
    if (m.win) champCounts[m.championId].w++
  })
  const topChamps = Object.entries(champCounts)
    .map(([id, v]) => ({ id: Number(id), ...v }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5)

  const tierColor = TIER_COLORS[profile.tier] ?? '#A1A1AA'
  const memberSince = formatDate(profile.created_at, lang, { year: 'numeric', month: 'long' })

  return (
    <main style={{
      minHeight: '100vh', padding: '24px clamp(12px, 4vw, 40px)',
      maxWidth: 1200, margin: '0 auto', color: '#F5F2FA',
    }}>
      <button onClick={() => router.back()} style={{
        background: 'transparent', border: 'none', cursor: 'pointer',
        color: 'var(--text-muted)', fontSize: 13, padding: '6px 0', marginBottom: 14,
      }}>{P.shared.back}</button>

      {/* En-tête profil */}
      <header style={{
        marginBottom: 18, padding: '20px 24px', borderRadius: 12,
        background: `linear-gradient(135deg, ${tierColor}22 0%, rgba(255,255,255,0.02) 100%)`,
        borderTop: `1px solid ${tierColor}55`, borderRight: `1px solid rgba(255,255,255,0.06)`,
        borderBottom: `1px solid rgba(255,255,255,0.06)`, borderLeft: `4px solid ${tierColor}`,
        display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap',
      }}>
        {/* Avatar : initiale du pseudo */}
        <div style={{
          width: 80, height: 80, borderRadius: '50%',
          background: `linear-gradient(135deg, ${tierColor} 0%, ${tierColor}88 100%)`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 38, fontWeight: 800, color: '#0a0612',
          border: `3px solid ${tierColor}`,
        }}>
          {profile.username.charAt(0).toUpperCase()}
        </div>

        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <h1 style={{ fontSize: 28, fontWeight: 800, margin: 0 }}>{profile.username}</h1>
            {profile.certified && (
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="11" fill="#3B82F6"/>
                <path d="M7 12L10.5 15.5L17 9" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', fontSize: 12, color: 'var(--text-muted)' }}>
            <span style={{
              padding: '3px 10px', borderRadius: 4,
              background: `${tierColor}22`, color: tierColor, fontWeight: 700, letterSpacing: 1,
            }}>{subscriptionTierLabel(dico.nav, profile.tier).toUpperCase()}</span>
            {profile.tier_expires_at && (
              <span>{G.until.replace('{date}', formatDate(profile.tier_expires_at, lang))}</span>
            )}
            {!profile.tier_expires_at && profile.tier !== 'apprenti' && (
              <span style={{ color: '#EF9F27', fontWeight: 700 }}>{G.lifetime}</span>
            )}
            <span>·</span>
            <span>{G.memberSince.replace('{date}', memberSince)}</span>
            <span>·</span>
            <Link href="/?tab=tarifs" style={{ color: '#EF9F27', fontWeight: 600, textDecoration: 'none' }}>
              {G.pricing}
            </Link>
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 4 }}>
            {profile.email}
          </div>
        </div>
      </header>

      {/* Abonnement — palier, échéance, et accès au portail Stripe */}
      <SubscriptionSection profile={profile} subscription={subscription} />

      {/* Section Riot */}
      <section style={{
        marginBottom: 18, padding: '14px 18px', borderRadius: 10,
        background: 'rgba(255,255,255,0.02)',
        borderTop: '1px solid rgba(255,255,255,0.06)', borderRight: '1px solid rgba(255,255,255,0.06)',
        borderBottom: '1px solid rgba(255,255,255,0.06)', borderLeft: '1px solid rgba(255,255,255,0.06)',
      }}>
        <div style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
          {G.riotTitle}
        </div>
        {profile.riot_gamename ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
            <div style={{ fontSize: 18, fontWeight: 700 }}>
              {profile.riot_gamename}<span style={{ color: 'var(--text-dim)', fontWeight: 400 }}>#{profile.riot_tagline}</span>
            </div>
            <span style={{
              padding: '2px 8px', borderRadius: 3,
              background: 'rgba(58,138,201,0.2)', color: '#3A8AC9',
              fontSize: 11, fontWeight: 700,
            }}>{(profile.riot_platform ?? 'euw1').toUpperCase()}</span>
          </div>
        ) : (
          <div style={{ fontSize: 13, color: 'var(--text-dim)' }}>
            {G.riotNone}
          </div>
        )}
      </section>

      {/* Statistiques des dernières parties */}
      {profile.riot_gamename && matches.length > 0 && (
        <section style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
            {G.statsTitle.replace('{count}', String(matches.length))}
          </div>
          <div style={{
            display: 'grid', gap: 8,
            gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
          }}>
            <StatCard label={G.games} value={String(matches.length)} />
            <StatCard
              label={G.wins}
              value={G.winLoss.replace('{wins}', String(wins)).replace('{losses}', String(losses))}
              color={wins > losses ? '#5DCAA5' : wins < losses ? '#E24B4A' : undefined}
            />
            <StatCard
              label={P.shared.winrate}
              value={winrate !== null ? `${winrate}%` : '-'}
              color={(winrate ?? 0) >= 50 ? '#5DCAA5' : '#E24B4A'}
            />
            <StatCard label={G.avgKda} value={String(avgKda)} />
            <StatCard label={G.avgCs} value={avgCs ? String(avgCs) : '-'} />
          </div>
        </section>
      )}

      {/* Top champions joués */}
      {topChamps.length > 0 && (
        <section style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
            {P.shared.topChampions}
          </div>
          <div style={{
            display: 'grid', gap: 8,
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          }}>
            {topChamps.map(({ id, count, w, champ }) => {
              const winrateChamp = Math.round((w / count) * 100)
              return (
                <div key={id}
                  onClick={() => champ && router.push(`/champion/${champ.id}`)}
                  style={{
                    cursor: champ ? 'pointer' : 'default',
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '10px 12px', borderRadius: 6,
                    background: 'rgba(255,255,255,0.02)',
                    border: '1px solid rgba(255,255,255,0.06)',
                    transition: 'background 120ms',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)' }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.02)' }}
                >
                  {champ && version
                    ? <img src={`${DDN}/cdn/${version}/img/champion/${champ.image}`}
                        alt="" style={{ width: 48, height: 48, borderRadius: 6 }} />
                    : <div style={{ width: 48, height: 48, borderRadius: 6, background: '#222' }} />
                  }
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {/* Nom DDragon, chargé dans la locale de la langue affichée (Lot 8). */}
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{champ?.name ?? G.champFallback.replace('{id}', String(id))}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>
                      {gamesLabel(P, count)} · <span style={{ color: winrateChamp >= 50 ? '#5DCAA5' : '#E24B4A', fontWeight: 600 }}>{G.champWinrate.replace('{rate}', String(winrateChamp))}</span>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/* Activité dans l'écosystème Wyrm Forge */}
      <section style={{ marginBottom: 18 }}>
        <div style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
          {G.activityTitle}
        </div>
        <div style={{
          display: 'grid', gap: 8,
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
        }}>
          <StatCard label={G.builds} value={String(buildCount)} />
          <StatCard label={G.todoLists} value={String(todoListCount)} />
          <StatCard label={G.todoItems} value={String(todoItemCount)} />
        </div>
      </section>

      {/* Paramètres du compte */}
      <ProfileSettings profile={profile} onProfileUpdate={p => setProfile(p)} />

      {/* Zone danger : déconnexion */}
      <DangerZone />

      {/* Suppression du compte (RGPD article 17) */}
      <DeletionRequest profile={profile} />
    </main>
  )
}

// ────────────────────────────────────────────────────────────────────────────────
// Abonnement : palier courant, échéance, et accès au portail de facturation Stripe
// ────────────────────────────────────────────────────────────────────────────────
/**
 * Section « Abonnement ».
 *
 * Elle LIT, elle n'écrit rien. `profiles.tier` / `tier_expires_at` sont la source
 * de vérité du palier — écrits par le webhook Stripe, et par lui seul. Le bouton
 * ci-dessous n'ouvre que le portail hébergé de Stripe : une résiliation faite
 * là-bas revient par webhook, elle ne repasse jamais par cette page.
 *
 * Toute la décision d'affichage vit dans `resolveSubscriptionView` (module pur,
 * testé). Ici il ne reste que du rendu — convention du repo : ce qui décide se
 * teste, le JSX ne se teste pas.
 */
function SubscriptionSection({ profile, subscription }: {
  profile: UserProfile; subscription: SubscriptionRow | null
}) {
  const dico = useDashboard()
  const lang = useLang()
  const P = dico.profil
  const G = P.page
  const S = P.subscription

  // Quel bouton est en cours d'ouverture — deux boutons mènent au portail.
  const [pending, setPending] = useState<'cancel' | 'manage' | null>(null)
  const [error, setError] = useState<string | null>(null)

  const view = resolveSubscriptionView({
    tier: profile.tier,
    tierExpiresAt: profile.tier_expires_at,
    role: profile.role,
    subscription,
  })

  const tierColor = TIER_COLORS[view.tier] ?? '#A1A1AA'

  /**
   * `cancel` ouvre le portail DIRECTEMENT sur l'écran de résiliation (flux
   * `subscription_cancel`) ; `manage` sur sa page d'accueil.
   */
  async function openPortal(flow: 'cancel' | 'manage') {
    setError(null)
    setPending(flow)
    try {
      // Aucun identifiant ne part d'ici : la route lit l'utilisateur connecté et
      // retrouve elle-même son client ET son abonnement Stripe. Les lui
      // transmettre depuis le navigateur ouvrirait les factures — ou la
      // résiliation — de n'importe qui à n'importe qui.
      const res = await fetch('/api/stripe/portal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(flow === 'cancel' ? { flow: 'cancel' } : {}),
      })
      const data = await res.json().catch(() => null)

      if (!res.ok || !data?.url) {
        // Convention du repo : le code technique reste dans la console,
        // l'utilisateur lit un message traduit.
        console.error('[profil] portal:', flow, res.status, data?.error)
        setError(S.manageError)
        setPending(null)
        return
      }

      // Redirection pleine page, comme le checkout : le portail Stripe est un
      // domaine tiers, hors du routeur Next.
      window.location.assign(data.url)
    } catch (err) {
      console.error('[profil] portal:', flow, err)
      setError(S.manageError)
      setPending(null)
    }
  }

  return (
    <section style={{
      marginBottom: 18, padding: '14px 18px', borderRadius: 10,
      background: 'rgba(255,255,255,0.02)',
      border: '1px solid rgba(255,255,255,0.06)',
    }}>
      <div style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>
        {S.title}
      </div>

      {/* Palier + échéance */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
        <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>{S.currentPlan}</span>
        <span style={{
          padding: '3px 10px', borderRadius: 4,
          background: `${tierColor}22`, color: tierColor, fontWeight: 700, letterSpacing: 1, fontSize: 12,
        }}>{subscriptionTierLabel(dico.nav, view.tier).toUpperCase()}</span>

        {/* Badge « à vie » : même libellé et même or que l'en-tête — c'est la
            MÊME notion, pas une seconde. */}
        {view.kind === 'lifetime' && (
          <span style={{ color: '#EF9F27', fontWeight: 700, fontSize: 12 }}>{G.lifetime}</span>
        )}

        {/* Une résiliation programmée porte la même date qu'un renouvellement et
            le sens inverse : deux libellés distincts, jamais fusionnés. */}
        {view.kind === 'paid' && view.expiresAt && (
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            {(view.cancelAtPeriodEnd ? S.endsOn : S.renewsOn)
              .replace('{date}', formatDate(view.expiresAt, lang))}
          </span>
        )}
      </div>

      {view.kind === 'lifetime' && (
        <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 10 }}>{S.lifetimeNote}</div>
      )}

      {/* L'abonnement Stripe est ORTHOGONAL au rôle admin : la RPC
          `stripe_apply_subscription_event` enregistre bien l'abonnement d'un
          admin mais ne touche pas à son palier (`admin_untouched`). Le dire
          évite de laisser croire qu'une résiliation lui ferait perdre ses accès. */}
      {view.isAdmin && (
        <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 10 }}>{S.adminNote}</div>
      )}

      {/* Incident de paiement — `past_due` conserve l'accès, `unpaid` l'a déjà
          perdu : dans les deux cas c'est le moyen de paiement qu'il faut mettre
          à jour, d'où un seul message. */}
      {view.paymentIssue && (
        <div role="alert" style={{
          fontSize: 13, color: '#F5F2FA', lineHeight: 1.4,
          padding: '10px 12px', marginBottom: 10, borderRadius: 8,
          background: 'rgba(226,75,74,0.10)', border: '1px solid rgba(226,75,74,0.35)',
        }}>
          {S.paymentIssue}
        </div>
      )}

      {/* Palier gratuit : la sortie est la grille tarifaire, pas le portail. */}
      {view.kind === 'free' && (
        <div style={{ marginBottom: view.canManageBilling ? 12 : 0 }}>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 2 }}>{S.freeTitle}</div>
          <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 8 }}>{S.freeBody}</div>
          <Link href="/?tab=tarifs" style={{ color: '#EF9F27', fontWeight: 600, textDecoration: 'none', fontSize: 13 }}>
            {G.pricing}
          </Link>
        </div>
      )}

      {/* Bouton de portail — affiché dès qu'un client Stripe existe, y compris
          sur un palier redescendu à gratuit : factures et réactivation vivent
          là-bas. C'est exactement la condition que la route vérifie côté
          serveur, pour qu'un bouton visible ne mène jamais à une erreur. */}
      {/* RÉSILIATION — bouton propre, sous une mention sans ambiguïté (décret
          n° 2023-417, art. L215-1-1), et PAS une option cachée derrière
          « gérer ». Profil → ce bouton → confirmation Stripe (+ sondage de motif
          s'il est activé dans le portail — voir AGENTS.md § CGV).
          Absent quand la résiliation est déjà programmée : la date de fin
          s'affiche au-dessus, et la réactivation vit dans le portail. */}
      {view.canCancel && (
        <div style={{ marginBottom: view.canManageBilling ? 14 : 0 }}>
          <button
            type="button"
            onClick={() => openPortal('cancel')}
            disabled={pending !== null}
            style={{
              padding: '9px 16px', borderRadius: 8,
              cursor: pending ? 'default' : 'pointer',
              fontFamily: 'inherit', fontSize: 13, fontWeight: 600,
              background: 'transparent', color: '#E24B4A',
              border: '1px solid rgba(226,75,74,0.45)',
              opacity: pending ? 0.7 : 1,
            }}
          >
            {pending === 'cancel' ? S.cancelLoading : S.cancelSubscription}
          </button>
          <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 6 }}>{S.cancelHint}</div>
        </div>
      )}

      {view.canManageBilling && (
        <>
          <button
            type="button"
            onClick={() => openPortal('manage')}
            disabled={pending !== null}
            style={{
              padding: '9px 16px', borderRadius: 8,
              cursor: pending ? 'default' : 'pointer',
              fontFamily: 'inherit', fontSize: 13, fontWeight: 600,
              background: 'transparent', color: '#EF9F27',
              border: '1px solid rgba(239,159,39,0.45)',
              opacity: pending ? 0.7 : 1,
            }}
          >
            {pending === 'manage' ? S.manageLoading : S.manage}
          </button>
          <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 6 }}>{S.manageHint}</div>
        </>
      )}

      {error && (
        <p role="alert" style={{ color: '#E24B4A', fontSize: 13, marginTop: 10, marginBottom: 0 }}>
          {error}
        </p>
      )}
    </section>
  )
}

// ────────────────────────────────────────────────────────────────────────────────
// Paramètres : pseudo / email / mot de passe / compte Riot — édition inline
// ────────────────────────────────────────────────────────────────────────────────
function ProfileSettings({ profile, onProfileUpdate }: {
  profile: UserProfile; onProfileUpdate: (p: UserProfile) => void
}) {
  const P = useDashboard().profil
  const S = P.settings
  // `Échec : {message}` interpole un message SUPABASE, non traduisible.
  const fail = (message: string) => S.failure.replace('{message}', message)
  return (
    <section style={{ marginBottom: 18 }}>
      <div style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
        {S.title}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <EditableField
          label={S.username.label}
          editLabel={S.username.editLabel}
          currentValue={profile.username}
          placeholder={S.username.placeholder}
          onSave={async (newValue) => {
            const { error } = await supabase.from('profiles')
              .update({ username: newValue }).eq('id', profile.id)
            if (error) throw new Error(fail(error.message))
            onProfileUpdate({ ...profile, username: newValue })
            return S.username.done
          }}
        />
        <EditableField
          label={S.email.label}
          editLabel={S.email.editLabel}
          currentValue={profile.email}
          placeholder={S.email.placeholder}
          inputType="email"
          onSave={async (newValue) => {
            const { error } = await supabase.auth.updateUser({ email: newValue })
            if (error) throw new Error(fail(error.message))
            return S.email.done.replace('{email}', newValue)
          }}
        />
        <EditableField
          label={S.password.label}
          editLabel={S.password.editLabel}
          currentValue="••••••••"
          placeholder={S.password.placeholder}
          inputType="password"
          maskValue
          onSave={async (newValue) => {
            if (newValue.length < 8) throw new Error(S.password.tooShort)
            const { error } = await supabase.auth.updateUser({ password: newValue })
            if (error) throw new Error(fail(error.message))
            return S.password.done
          }}
        />
        <div style={{
          padding: '10px 14px', borderRadius: 6,
          background: 'rgba(255,255,255,0.02)',
          border: '1px solid rgba(255,255,255,0.06)',
        }}>
          <div style={{ fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 2 }}>
            {S.riotTitle}
          </div>
          {profile.riot_gamename ? (
            <div style={{ fontSize: 14, color: '#F5F2FA' }}>
              {profile.riot_gamename}<span style={{ color: 'var(--text-dim)', fontWeight: 400 }}>#{profile.riot_tagline}</span>
              {' '}<span style={{ color: 'var(--text-dim)', fontSize: 12 }}>· {(profile.riot_platform ?? 'euw1').toUpperCase()}</span>
            </div>
          ) : (
            <div style={{ fontSize: 13, color: 'var(--text-dim)' }}>
              {S.riotNone}
            </div>
          )}
        </div>
        <EditableField
          label={S.rank.label}
          editLabel={S.rank.editLabel}
          /* `riotRankLabel` rend une valeur inconnue TELLE QUELLE et l'absence de rang
             comme « Non renseigné » — exactement ce que la page affichait déjà. */
          currentValue={riotRankLabel(P, profile.riot_rank)}
          customForm={(value, setValue) => (
            <select
              value={value || profile.riot_rank || ''}
              onChange={e => setValue(e.target.value)}
              style={inputStyle}
            >
              <option value="">{S.rank.placeholder}</option>
              {/* `r.key` est la valeur ÉCRITE en base : seul le libellé est traduit. */}
              {LOL_RANKS.map(r => (
                <option key={r.key} value={r.key}>{P.riotRanks[r.key]}</option>
              ))}
            </select>
          )}
          onSave={async (newValue) => {
            if (!newValue) throw new Error(S.rank.required)
            const { error } = await supabase.from('profiles')
              .update({ riot_rank: newValue }).eq('id', profile.id)
            if (error) throw new Error(fail(error.message))
            onProfileUpdate({ ...profile, riot_rank: newValue })
            return S.rank.done
          }}
        />
      </div>
    </section>
  )
}

const inputStyle: React.CSSProperties = {
  flex: 1, minWidth: 180, padding: '8px 10px',
  background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(127,119,221,0.3)',
  borderRadius: 5, color: '#F5F2FA', fontSize: 13,
  fontFamily: 'inherit', outline: 'none',
}

function EditableField({ label, editLabel, currentValue, placeholder, inputType, maskValue, customForm, onSave }: {
  label: string
  /* Intitulé du mode édition. Écrit en toutes lettres et NON dérivé de `label` :
     « Nouveau » + le libellé ne s'accorde ni en genre ni en nombre (« Nouveau email »),
     et la construction n'a aucun équivalent d'une langue à l'autre. */
  editLabel: string
  currentValue: string
  placeholder?: string
  inputType?: 'text' | 'email' | 'password'
  maskValue?: boolean
  customForm?: (value: string, setValue: (v: string) => void) => React.ReactNode
  onSave: (newValue: string) => Promise<string>
}) {
  const [editing, setEditing] = useState(false)
  const [value,   setValue]   = useState('')
  const [busy,    setBusy]    = useState(false)
  const [msg,     setMsg]     = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)
  const S = useDashboard().profil.settings

  async function save() {
    if (busy) return
    setBusy(true); setMsg(null)
    try {
      const okMsg = await onSave(value)
      setMsg({ kind: 'ok', text: okMsg })
      setEditing(false)
      setValue('')
    } catch (e: unknown) {
      setMsg({ kind: 'err', text: e instanceof Error ? e.message : S.errUnknown })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{
      padding: '10px 14px', borderRadius: 6,
      background: 'rgba(255,255,255,0.02)',
      border: '1px solid rgba(255,255,255,0.06)',
    }}>
      {!editing ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 2 }}>
              {label}
            </div>
            <div style={{ fontSize: 14, color: '#F5F2FA', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {currentValue}
            </div>
          </div>
          <button onClick={() => { setEditing(true); setMsg(null) }} style={{
            padding: '6px 12px', borderRadius: 5, fontSize: 12, fontWeight: 600,
            cursor: 'pointer', background: 'rgba(127,119,221,0.15)',
            border: '1px solid rgba(127,119,221,0.4)', color: '#F5F2FA',
          }}>{S.edit}</button>
        </div>
      ) : (
        <div>
          <div style={{ fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>
            {editLabel}
          </div>
          {customForm
            ? customForm(value, setValue)
            : (
              <input
                type={inputType ?? 'text'}
                value={value}
                onChange={e => setValue(e.target.value)}
                placeholder={placeholder}
                disabled={busy}
                style={inputStyle}
                onKeyDown={e => { if (e.key === 'Enter') save() }}
              />
            )
          }
          <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
            <button onClick={() => { setEditing(false); setValue(''); setMsg(null) }} disabled={busy}
              style={{
                padding: '6px 12px', borderRadius: 5, fontSize: 12, fontWeight: 600,
                cursor: 'pointer', background: 'transparent',
                border: '1px solid rgba(255,255,255,0.1)', color: 'var(--text-muted)',
              }}>{S.cancel}</button>
            <button onClick={save} disabled={busy || !value.trim()} style={{
              padding: '6px 12px', borderRadius: 5, fontSize: 12, fontWeight: 600,
              cursor: busy ? 'wait' : 'pointer',
              background: 'rgba(239,159,39,0.18)',
              border: '1px solid #EF9F27', color: '#F5F2FA',
              opacity: !value.trim() ? 0.5 : 1,
            }}>{busy ? S.saving : S.save}</button>
          </div>
          {!busy && maskValue && (
            <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 4 }}>
              {S.passwordNotice}
            </div>
          )}
        </div>
      )}
      {msg && (
        <div style={{
          marginTop: 8, padding: '6px 10px', borderRadius: 4, fontSize: 12,
          background: msg.kind === 'ok' ? 'rgba(93,202,165,0.10)' : 'rgba(226,75,74,0.10)',
          borderLeft: `3px solid ${msg.kind === 'ok' ? '#5DCAA5' : '#E24B4A'}`,
          color: msg.kind === 'ok' ? '#5DCAA5' : '#E24B4A',
        }}>{msg.text}</div>
      )}
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────────────
// DeletionRequest : demande de suppression du compte (RGPD article 17 — droit à
// l'effacement). On enregistre une demande dans la table deletion_requests qui
// sera traitée par un admin / une Edge Function dans les 30 jours max.
// ────────────────────────────────────────────────────────────────────────────────
interface DeletionRequestRow {
  id: string; user_id: string; email: string; username: string | null
  reason: string | null
  requested_at: string; processed_at: string | null
  status: 'pending' | 'processed' | 'cancelled'
}

// Les comptes Wyrm Forge (équipe / admin) ne peuvent pas être supprimés depuis l'app.
// Vérification UI + RLS côté DB pour double protection.
const WYRM_DOMAIN = '@wyrm-forge.com'
function isProtectedAccount(profile: UserProfile): boolean {
  return profile.email?.toLowerCase().endsWith(WYRM_DOMAIN) || profile.role === 'admin'
}

function DeletionRequest({ profile }: { profile: UserProfile }) {
  const P = useDashboard().profil
  const lang = useLang()
  const D = P.deletion
  // Même gabarit « Échec : {message} » que les paramètres du compte : le message
  // interpolé vient de Supabase et n'est pas traduisible.
  const fail = (message: string) => P.settings.failure.replace('{message}', message)
  const protectedAcc = isProtectedAccount(profile)

  const [pending,  setPending]  = useState<DeletionRequestRow | null>(null)
  const [loading,  setLoading]  = useState(true)
  const [opening,  setOpening]  = useState(false)
  const [emailIn,  setEmailIn]  = useState('')
  const [reason,   setReason]   = useState('')
  const [busy,     setBusy]     = useState(false)
  const [msg,      setMsg]      = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)

  // Charger une éventuelle demande déjà en cours pour l'afficher
  useEffect(() => {
    if (protectedAcc) { setLoading(false); return }
    let cancelled = false
    async function load() {
      const { data } = await supabase
        .from('deletion_requests')
        .select('*')
        .eq('user_id', profile.id)
        .eq('status', 'pending')
        .order('requested_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (!cancelled) {
        setPending(data as DeletionRequestRow | null)
        setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [profile.id, protectedAcc])

  async function submit() {
    if (busy) return
    if (emailIn.trim().toLowerCase() !== profile.email.toLowerCase()) {
      setMsg({ kind: 'err', text: D.emailMismatch })
      return
    }
    setBusy(true); setMsg(null)
    try {
      // Route serveur et plus un `insert` direct : la demande doit d'abord
      // ARRÊTER LA FACTURATION Stripe (fin de période), ce que le navigateur ne
      // peut pas faire. Si Stripe échoue, la demande n'est pas enregistrée.
      // Voir `src/lib/stripe/account-deletion.ts`.
      const res = await fetch('/api/account/deletion-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: emailIn.trim(), reason: reason.trim() || null }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok || !data?.request) {
        console.error('[profil] deletion-request:', res.status, data?.error)
        const text = data?.error === 'billing_stop_failed' ? D.errBilling
          : data?.error === 'request_not_recorded' ? D.errNotRecorded
          : data?.error === 'email_mismatch' ? D.emailMismatch
          : fail(data?.error ?? String(res.status))
        setMsg({ kind: 'err', text })
        return
      }
      setPending(data.request as DeletionRequestRow)
      setOpening(false)
      setEmailIn(''); setReason('')
      setMsg({ kind: 'ok', text: D.done })
    } catch {
      setMsg({ kind: 'err', text: D.errUnexpected })
    } finally {
      setBusy(false)
    }
  }

  async function cancelPending() {
    if (!pending || busy) return
    setBusy(true); setMsg(null)
    const { error } = await supabase
      .from('deletion_requests')
      .update({ status: 'cancelled' })
      .eq('id', pending.id)
    setBusy(false)
    if (error) { setMsg({ kind: 'err', text: D.cancelFailed.replace('{message}', error.message) }); return }
    setPending(null)
    setMsg({ kind: 'ok', text: D.cancelled })
  }

  if (loading) return null

  // Compte protégé (équipe Wyrm Forge / admin) : on affiche uniquement
  // un message d'info, sans formulaire de suppression.
  if (protectedAcc) {
    return (
      <section style={{
        marginTop: 18, padding: '14px 18px', borderRadius: 10,
        background: 'rgba(127,119,221,0.04)',
        border: '1px solid rgba(127,119,221,0.2)',
        borderLeft: '3px solid #7F77DD',
      }}>
        <div style={{ fontSize: 11, color: '#7F77DD', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8, fontWeight: 700 }}>
          {D.protectedTitle}
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>
          {D.protectedBefore}{' '}
          {/* contact@ et non admin@ : décision du 2026-09-11 d'une adresse publiée UNIQUE
              sur tout le produit. Cet encart ne s'affiche qu'aux comptes de l'équipe, mais
              c'est bien une adresse affichée, et deux adresses en circulation, c'est la
              question à laquelle il a fallu répondre pour les mentions légales. */}
          <a href="mailto:contact@wyrm-forge.com" style={{ color: '#EF9F27' }}>contact@wyrm-forge.com</a>
          {D.protectedAfter}
        </div>
      </section>
    )
  }

  return (
    <section style={{
      marginTop: 18, padding: '14px 18px', borderRadius: 10,
      background: 'rgba(226,75,74,0.04)',
      border: '1px solid rgba(226,75,74,0.2)',
      borderLeft: '3px solid #E24B4A',
    }}>
      <div style={{ fontSize: 11, color: '#E24B4A', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8, fontWeight: 700 }}>
        {D.title}
      </div>

      {pending ? (
        <div>
          <div style={{ padding: '10px 14px', borderRadius: 6,
            background: 'rgba(239,159,39,0.08)',
            border: '1px solid rgba(239,159,39,0.3)',
            color: '#EF9F27', fontSize: 13, marginBottom: 10,
          }}>
            <strong>{D.pendingTitle}</strong>
            <div style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 4 }}>
              {D.pendingDate.replace('{date}', formatDateTime(pending.requested_at, lang, {
                day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit',
              }))}
              <br />{D.pendingDelay}
            </div>
          </div>
          <button onClick={cancelPending} disabled={busy} style={{
            padding: '8px 14px', borderRadius: 6, fontSize: 13, fontWeight: 600,
            cursor: busy ? 'wait' : 'pointer',
            background: 'rgba(127,119,221,0.15)',
            border: '1px solid rgba(127,119,221,0.4)', color: '#F5F2FA',
          }}>{busy ? '…' : D.cancelRequest}</button>
        </div>
      ) : !opening ? (
        <div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5, marginBottom: 12 }}>
            {D.introBefore} <strong style={{ color: '#E24B4A' }}>{D.introStrong}</strong> {D.introAfter}
            <ul style={{ margin: '6px 0 0 18px', padding: 0, color: 'var(--text-dim)' }}>
              <li>{D.bullet1}</li>
              <li>{D.bullet2}</li>
              <li>{D.bullet3}</li>
              <li>{D.bullet4}</li>
              <li>{D.billingNote}</li>
            </ul>
            <div style={{ marginTop: 8, color: 'var(--text-dim)', fontStyle: 'italic' }}>
              {D.delay}
            </div>
          </div>
          <button onClick={() => { setOpening(true); setMsg(null) }} style={{
            padding: '8px 14px', borderRadius: 6, fontSize: 13, fontWeight: 600,
            cursor: 'pointer',
            background: 'rgba(226,75,74,0.15)',
            border: '1px solid #E24B4A', color: '#E24B4A',
          }}>{D.open}</button>
        </div>
      ) : (
        <div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 10 }}>
            {D.confirmBefore} <strong style={{ color: '#F5F2FA' }}>{profile.email}</strong> {D.confirmAfter}
          </div>
          <input
            type="email"
            value={emailIn}
            onChange={e => setEmailIn(e.target.value)}
            placeholder={profile.email}
            style={inputStyle}
            disabled={busy}
          />
          <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 10, marginBottom: 4 }}>
            {D.reasonLabel}
          </div>
          <textarea
            value={reason}
            onChange={e => setReason(e.target.value)}
            placeholder={D.reasonPlaceholder}
            disabled={busy}
            rows={3}
            style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }}
          />
          <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
            <button onClick={() => { setOpening(false); setEmailIn(''); setReason(''); setMsg(null) }} disabled={busy} style={{
              padding: '8px 14px', borderRadius: 6, fontSize: 13, fontWeight: 600,
              cursor: 'pointer', background: 'transparent',
              border: '1px solid rgba(255,255,255,0.1)', color: 'var(--text-muted)',
            }}>{P.settings.cancel}</button>
            <button onClick={submit} disabled={busy || !emailIn} style={{
              padding: '8px 14px', borderRadius: 6, fontSize: 13, fontWeight: 600,
              cursor: busy ? 'wait' : 'pointer',
              background: 'rgba(226,75,74,0.20)',
              border: '1px solid #E24B4A', color: '#fff',
              opacity: !emailIn ? 0.5 : 1,
            }}>{busy ? D.submitting : D.submit}</button>
          </div>
        </div>
      )}

      {msg && (
        <div style={{
          marginTop: 10, padding: '6px 10px', borderRadius: 4, fontSize: 12,
          background: msg.kind === 'ok' ? 'rgba(93,202,165,0.10)' : 'rgba(226,75,74,0.10)',
          borderLeft: `3px solid ${msg.kind === 'ok' ? '#5DCAA5' : '#E24B4A'}`,
          color: msg.kind === 'ok' ? '#5DCAA5' : '#E24B4A',
        }}>{msg.text}</div>
      )}
    </section>
  )
}

// ── Zone danger : déconnexion (suppression de compte = action plus risquée à venir) ──
function DangerZone() {
  const router = useRouter()
  const Z = useDashboard().profil.danger
  const [busy, setBusy] = useState(false)

  async function logout() {
    if (busy) return
    setBusy(true)
    await supabase.auth.signOut()
    router.push('/')
  }

  return (
    <section style={{
      padding: '14px 18px', borderRadius: 10,
      background: 'rgba(226,75,74,0.04)',
      border: '1px solid rgba(226,75,74,0.2)',
      borderLeft: '3px solid #E24B4A',
    }}>
      <div style={{ fontSize: 11, color: '#E24B4A', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8, fontWeight: 700 }}>
        {Z.title}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', flex: 1, minWidth: 200 }}>
          {Z.text}
        </div>
        <button onClick={logout} disabled={busy} style={{
          padding: '8px 14px', borderRadius: 6, fontSize: 13, fontWeight: 600,
          cursor: busy ? 'wait' : 'pointer',
          background: 'rgba(226,75,74,0.15)', border: '1px solid #E24B4A', color: '#E24B4A',
        }}>{busy ? Z.loggingOut : Z.logout}</button>
      </div>
    </section>
  )
}

function StatCard({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{
      padding: '12px 16px', borderRadius: 8,
      background: 'rgba(255,255,255,0.02)',
      border: '1px solid rgba(255,255,255,0.06)',
    }}>
      <div style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>
        {label}
      </div>
      <div style={{ fontSize: 22, fontWeight: 700, color: color ?? '#F5F2FA' }}>
        {value}
      </div>
    </div>
  )
}
