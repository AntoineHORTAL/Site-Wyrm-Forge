'use client'

// TwitchCast — bloc cast d'un match en direct.
// L'embed Twitch exige un paramètre `parent` = le(s) domaine(s) hôte(s).
// On le calcule au RUNTIME via window.location.hostname (toujours correct : localhost
// en dev, domaine réel en prod) + éventuellement NEXT_PUBLIC_TOURNOIS_HOST si défini.
// Aucun host n'est jamais écrit en dur.

import { useEffect, useState } from 'react'

interface TwitchCastProps {
  twitchUrl:  string
  casterName: string | null
}

// Extrait le nom de chaîne d'une URL twitch.tv/<channel>
function parseChannel(url: string): string | null {
  try {
    const u = new URL(url)
    if (!/(^|\.)twitch\.tv$/.test(u.hostname)) return null
    const seg = u.pathname.split('/').filter(Boolean)[0]
    return seg ? seg.toLowerCase() : null
  } catch {
    return null
  }
}

export default function TwitchCast({ twitchUrl, casterName }: TwitchCastProps) {
  const channel = parseChannel(twitchUrl)
  const [parents, setParents] = useState<string[]>([])

  useEffect(() => {
    const hosts = new Set<string>()
    if (typeof window !== 'undefined') hosts.add(window.location.hostname)
    const envHost = process.env.NEXT_PUBLIC_TOURNOIS_HOST
    if (envHost) {
      try { hosts.add(new URL(/^https?:\/\//.test(envHost) ? envHost : `https://${envHost}`).hostname) }
      catch { /* host env malformé — ignoré */ }
    }
    setParents([...hosts])
  }, [])

  // URL invalide → repli sur un simple lien (pas d'embed cassé)
  if (!channel) {
    return (
      <a href={twitchUrl} target="_blank" rel="noopener noreferrer" className="xv2-btn-primary">
        Regarder le live sur Twitch
      </a>
    )
  }

  const src = parents.length > 0
    ? `https://player.twitch.tv/?channel=${encodeURIComponent(channel)}&${parents.map((p) => `parent=${encodeURIComponent(p)}`).join('&')}&muted=false`
    : null

  return (
    <section
      aria-label="Diffusion en direct"
      style={{
        background: 'rgba(20,9,28,0.6)',
        border: '1px solid rgba(47,111,222,0.25)',
        borderRadius: 10,
        overflow: 'hidden',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '12px 16px', flexWrap: 'wrap' }}>
        <span className="xv2-display" style={{ color: '#fff', fontSize: 15, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          <span className="xv2-badge-live">LIVE</span>
          DIFFUSION{casterName ? ` · ${casterName}` : ''}
        </span>
        <a href={twitchUrl} target="_blank" rel="noopener noreferrer" className="xv2-data"
           style={{ color: '#8fc6f5', fontSize: 13, textDecoration: 'none' }}>
          Ouvrir sur Twitch ↗
        </a>
      </div>

      {/* Ratio 16/9 responsive */}
      <div style={{ position: 'relative', width: '100%', paddingTop: '56.25%', background: '#000' }}>
        {src ? (
          <iframe
            title={`Twitch — ${channel}`}
            src={src}
            allowFullScreen
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 0 }}
          />
        ) : (
          <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center' }}>
            <span className="xv2-data" style={{ color: '#6e85a0', fontSize: 14 }}>Chargement du live…</span>
          </div>
        )}
      </div>
    </section>
  )
}
