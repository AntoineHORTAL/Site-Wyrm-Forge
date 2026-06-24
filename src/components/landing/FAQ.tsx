'use client'

import { useState } from 'react'
import { useTheme } from '@/components/providers/ThemeProvider'

const faqs = [
  {
    // Réponse reprise de l'ancien FAQ.tsx (question « autorisé par Riot »)
    q: 'Est-ce légal et sans risque de ban ?',
    a: "Wyrm Forge utilise uniquement l'API officielle Riot Games et ne modifie pas les fichiers du jeu. Il est conforme aux règles d'utilisation des APIs Riot et ne risque pas de ban. Wyrm Forge n'est pas affilié à Riot Games.",
  },
  {
    // Réponse reprise de l'ancien FAQ.tsx
    q: "Comment fonctionne l'overlay ?",
    a: "L'overlay se superpose à League of Legends en mode fenêtré ou fenêtré sans bordures. Tu peux le configurer pour qu'il se masque automatiquement en jeu ou reste toujours visible selon tes préférences.",
  },
  {
    // Réponse reprise de l'ancien FAQ.tsx (question « combien ça coûte »)
    q: 'Est-ce vraiment 100% gratuit ?',
    a: "Oui. Wyrm Forge est entièrement gratuit pour la communauté. Le projet n'est pas commercial — il est développé par passion et toutes les fonctionnalités sont accessibles sans paiement.",
  },
  {
    // Rédigée (aucune réponse existante pour cette question) — à relire
    q: 'Sur quelles plateformes ça marche ?',
    a: "Wyrm Forge est une application Windows (10 et 11). Une version macOS n'est pas prévue pour le moment. Le site web, lui, reste accessible depuis n'importe quel navigateur.",
  },
  {
    // Rédigée (aucune réponse existante pour cette question) — à relire
    q: 'Comment fonctionnent les analyses IA ?',
    a: "Une IA analyse ton historique de parties récupéré via l'API officielle Riot pour repérer tes erreurs récurrentes — positionnement, timings, gestion de vague — et te proposer des conseils ciblés pour progresser. Aucune donnée autre que ton Riot ID n'est partagée.",
  },
]

export default function FAQ() {
  const { theme } = useTheme()
  const c = theme === 'mythic'
  const [open, setOpen] = useState<number | null>(0)

  return (
    <section
      id="faq"
      style={{
        padding: '88px 32px',
        background: c ? '#0A0612' : '#0F0F11',
        borderTop: c ? undefined : '1px solid #1F1F23',
      }}
    >
      <div style={{ textAlign: 'center', marginBottom: 44 }}>
        <span className="land-eyebrow">Questions fréquentes</span>
        <h2
          className="font-mythic"
          style={{ fontSize: c ? 'clamp(28px, 4.5vw, 42px)' : 'clamp(24px, 4vw, 36px)', fontWeight: 600, margin: 0, color: '#F5F2FA', letterSpacing: c ? undefined : '-0.5px' }}
        >
          On répond à <span className="accent-text">tout</span>.
        </h2>
      </div>

      <div style={{ maxWidth: 760, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {faqs.map((faq, i) => {
          const isOpen = open === i
          return (
            <div
              key={i}
              style={{
                background: c ? 'rgba(20,10,35,0.5)' : '#18181B',
                border: `1px solid ${isOpen ? (c ? 'rgba(186,117,23,0.4)' : '#3F3F46') : c ? 'rgba(186,117,23,0.18)' : '#27272A'}`,
                borderRadius: 10,
                overflow: 'hidden',
                transition: 'border-color 0.15s',
              }}
            >
              <button
                onClick={() => setOpen(isOpen ? null : i)}
                aria-expanded={isOpen}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 16,
                  padding: '18px 20px',
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  textAlign: 'left',
                  color: '#F5F2FA',
                  fontSize: 15,
                  fontWeight: 600,
                }}
              >
                {faq.q}
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  style={{ flexShrink: 0, color: 'var(--text-dim)', transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}
                >
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>
              {isOpen && (
                <p style={{ margin: 0, padding: '0 20px 20px', color: 'var(--text-muted)', fontSize: 14, lineHeight: 1.65 }}>
                  {faq.a}
                </p>
              )}
            </div>
          )
        })}
      </div>
    </section>
  )
}
