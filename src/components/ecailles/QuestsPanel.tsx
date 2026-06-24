'use client'

import { useState, useEffect } from 'react'
import { useTheme } from '@/components/providers/ThemeProvider'
import { createClient } from '@/lib/supabase/client'
import { callEF } from '@/lib/ecailles'

interface QuestStatus {
  slug: string
  name: string
  category: string
  reward: number
  completed_today: boolean
  progress?: { current: number; target: number }  // forward-compat quêtes multi-étapes
}

interface QuestState {
  day: string
  streak: number | null
  earned_today: number
  cap: number
  quests: QuestStatus[]
}

interface Props {
  questsEnabled: boolean
  onBalanceChange: () => void
}

export default function QuestsPanel({ questsEnabled, onBalanceChange }: Props) {
  const { theme } = useTheme()
  const c = theme === 'mythic'
  const supabase = createClient()

  const [state, setState] = useState<QuestState | null>(null)
  const [loading, setLoading] = useState(true)
  const [claiming, setClaiming] = useState<Record<string, boolean>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [noRiotLink, setNoRiotLink] = useState(false)

  const accent = c ? '#EF9F27' : '#7F77DD'
  const border = c ? 'rgba(186,117,23,0.2)' : '#27272A'

  const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const SUPA_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

  useEffect(() => { fetchStatus() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function fetchStatus() {
    setLoading(true)
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { setLoading(false); return }

    try {
      const res = await fetch(`${SUPA_URL}/functions/v1/quest-status`, {
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'apikey': SUPA_KEY,
        },
      })
      if (res.ok) setState(await res.json() as QuestState)
    } catch { /* réseau */ }
    setLoading(false)
  }

  async function claim(slug: string, isLolQuest: boolean) {
    if (claiming[slug]) return

    if (isLolQuest) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('riot_gamename')
        .single()
      if (!profile?.riot_gamename) {
        setNoRiotLink(true)
        return
      }
    }

    setClaiming(prev => ({ ...prev, [slug]: true }))
    setErrors(prev => { const e = { ...prev }; delete e[slug]; return e })

    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { setClaiming(prev => ({ ...prev, [slug]: false })); return }

    const { data: claimData, error } = await callEF<{ success: boolean; capped?: boolean; reward?: number }>(
      'quest-claim', { quest_slug: slug }, session.access_token,
    )

    if (error) {
      // Mapping par texte (plusieurs codes 403 distincts : Riot / plafond / flag off)
      if (error.includes('Riot') || error.includes('lier ton compte') || error.includes('riot_puuid')) {
        setNoRiotLink(true)
        setClaiming(prev => ({ ...prev, [slug]: false }))
        return
      }
      let msg = 'Erreur inattendue'
      if (error.includes('already_claimed') || error.includes('409') || error.includes('déjà réclamée'))
        msg = 'Déjà réclamée aujourd\'hui'
      else if (error.includes('plafond') || error.includes('daily_cap'))
        msg = 'Plafond journalier atteint'
      else if (error.includes('désactivées') || error.includes('quests_enabled'))
        msg = 'Quêtes temporairement désactivées'
      else if (error.includes('set du jour'))
        msg = 'Quête non disponible aujourd\'hui'
      else if (error.includes('400') || error.includes('not fulfilled') || error.includes('trouvée'))
        msg = 'Condition non remplie'
      setErrors(prev => ({ ...prev, [slug]: msg }))
    } else if (claimData?.capped) {
      // HTTP 200 mais plafond atteint — finalize_quest_claim a rollbacké : rien n'est inscrit
      setErrors(prev => ({ ...prev, [slug]: 'Plafond journalier atteint' }))
      await fetchStatus()
    } else {
      await fetchStatus()
      onBalanceChange()
    }

    setClaiming(prev => ({ ...prev, [slug]: false }))
  }

  if (loading) {
    return <div style={{ color: 'var(--text-muted)', fontSize: 14, padding: '20px 0' }}>Chargement…</div>
  }

  const streak      = state?.streak ?? 0
  const earnedToday = state?.earned_today ?? 0
  const cap         = state?.cap ?? 12

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Bandeau quêtes désactivées */}
      {!questsEnabled && (
        <div style={{
          padding: '10px 16px', borderRadius: 8,
          background: 'rgba(226,75,74,0.08)', border: '1px solid rgba(226,75,74,0.25)',
          color: '#E24B4A', fontSize: 13,
        }}>
          Les quêtes sont temporairement désactivées.
        </div>
      )}

      {/* Bandeau Riot non lié */}
      {noRiotLink && (
        <div style={{
          padding: '12px 16px', borderRadius: 8,
          background: c ? 'rgba(186,117,23,0.08)' : 'rgba(127,119,221,0.08)',
          border: `1px solid ${border}`, fontSize: 13, color: 'var(--text-muted)',
        }}>
          Lie ton compte Riot dans l'onglet{' '}
          <strong style={{ color: accent }}>Accueil</strong>{' '}
          pour débloquer les quêtes LoL.
        </div>
      )}

      {/* Streak + progression cap */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '12px 18px', borderRadius: 10,
        background: c ? 'rgba(186,117,23,0.07)' : 'rgba(127,119,221,0.06)',
        border: `1px solid ${border}`,
      }}>
        <span style={{ fontSize: 22 }}>🔥</span>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#F5F2FA' }}>
              {streak === 0 ? '0 jour' : `${streak} jour${streak > 1 ? 's' : ''}`} de streak
            </div>
            {state && (
              <div style={{ fontSize: 11, color: earnedToday >= cap ? '#5DCAA5' : 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                {earnedToday} / {cap} Écailles
              </div>
            )}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
            Complète une quête chaque jour pour maintenir ton streak
          </div>
          {state && (
            <div style={{ height: 3, borderRadius: 2, background: 'rgba(255,255,255,0.07)', marginTop: 6 }}>
              <div style={{
                height: '100%', borderRadius: 2,
                width: `${Math.min(100, Math.round((earnedToday / cap) * 100))}%`,
                background: earnedToday >= cap ? '#5DCAA5' : accent,
                transition: 'width 0.3s',
              }} />
            </div>
          )}
        </div>
      </div>

      {/* Liste des quêtes */}
      {state?.quests.map(q => (
        <div key={q.slug} style={{
          padding: '16px 20px', borderRadius: 10,
          border: `1px solid ${q.completed_today ? 'rgba(93,202,165,0.3)' : border}`,
          background: q.completed_today ? 'rgba(93,202,165,0.04)' : 'rgba(255,255,255,0.02)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16,
          opacity: q.completed_today ? 0.75 : 1,
        }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#F5F2FA', marginBottom: 4 }}>
              {q.name}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              Récompense :{' '}
              <span style={{ color: accent, fontWeight: 600 }}>+{q.reward} Écailles</span>
            </div>
            {/* Barre de progression (forward-compat — présente si le serveur envoie progress) */}
            {q.progress && !q.completed_today && (
              <div style={{ marginTop: 8 }}>
                <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 3 }}>
                  {q.progress.current} / {q.progress.target}
                </div>
                <div style={{ height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.08)' }}>
                  <div style={{
                    height: '100%', borderRadius: 2, transition: 'width 0.3s',
                    width: `${Math.min(100, Math.round((q.progress.current / q.progress.target) * 100))}%`,
                    background: accent,
                  }} />
                </div>
              </div>
            )}
            {errors[q.slug] && (
              <div style={{ fontSize: 11, color: '#E24B4A', marginTop: 4 }}>{errors[q.slug]}</div>
            )}
          </div>

          <button
            onClick={() => claim(q.slug, q.category === 'lol')}
            disabled={q.completed_today || !questsEnabled || claiming[q.slug]}
            style={{
              padding: '7px 16px', borderRadius: 8, fontSize: 12, fontWeight: 600,
              fontFamily: 'inherit',
              cursor: q.completed_today || !questsEnabled ? 'default'
                : claiming[q.slug] ? 'wait' : 'pointer',
              border: q.completed_today ? '1px solid rgba(93,202,165,0.4)' : `1px solid ${accent}`,
              background: q.completed_today ? 'transparent'
                : c ? 'rgba(186,117,23,0.15)' : 'rgba(127,119,221,0.12)',
              color: q.completed_today ? '#5DCAA5' : accent,
              opacity: !questsEnabled && !q.completed_today ? 0.5 : 1,
              transition: 'all 0.15s', whiteSpace: 'nowrap',
            }}
          >
            {q.completed_today ? '✓ Réclamée' : claiming[q.slug] ? 'En cours…' : 'Réclamer'}
          </button>
        </div>
      ))}

      {(!state || state.quests.length === 0) && (
        <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)', fontSize: 14 }}>
          Aucune quête disponible.
        </div>
      )}
    </div>
  )
}
