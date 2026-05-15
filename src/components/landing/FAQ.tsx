'use client'

import { useTheme } from '@/components/providers/ThemeProvider'

const faqs = [
  {
    q: 'Wyrm Forge est-il autorisé par Riot Games ?',
    a: "Wyrm Forge utilise uniquement l'API officielle Riot Games et ne modifie pas les fichiers du jeu. Il est conforme aux règles d'utilisation des APIs Riot et ne risque pas de ban. Wyrm Forge n'est pas affilié à Riot Games.",
  },
  {
    q: "Comment fonctionne l'overlay en jeu ?",
    a: "L'overlay se superpose à League of Legends en mode fenêtré ou fenêtré sans bordures. Tu peux le configurer pour qu'il se masque automatiquement en jeu ou rester toujours visible selon tes préférences.",
  },
  {
    q: 'Puis-je importer mes builds depuis Mobafire ou OP.GG ?',
    a: "Un import depuis Mobafire est en cours de développement. L'import OP.GG est sur la roadmap.",
  },
  {
    q: 'Quelles données sont utilisées par l\'outil ?',
    a: "Wyrm Forge utilise ton historique de matchs récupéré via l'API officielle Riot Games. Aucune donnée personnelle autre que ton Riot ID n'est partagée avec des tiers.",
  },
  {
    q: 'Combien coûte Wyrm Forge ?',
    a: "Wyrm Forge est entièrement gratuit pour la communauté. Le projet n'est pas commercial — il est développé par passion et toutes les fonctionnalités sont accessibles sans paiement.",
  },
]

export default function FAQ() {
  const { theme } = useTheme()

  return (
    <section
      style={{
        padding: '80px 48px',
        background: theme === 'mythic'
          ? 'linear-gradient(180deg, #0A0612 0%, #150828 50%, #0A0612 100%)'
          : '#0F0F11',
        borderTop: theme === 'classic' ? '1px solid #1F1F23' : undefined,
        borderBottom: theme === 'classic' ? '1px solid #1F1F23' : undefined,
      }}
    >
      <h2 className="font-mythic" style={{
        fontSize: theme === 'mythic' ? 40 : 36, fontWeight: 600,
        textAlign: 'center', margin: '0 0 16px', color: '#F5F2FA',
      }}>
        Questions <span className="accent-text">fréquentes</span>
      </h2>
      <p style={{
        textAlign: 'center', color: 'var(--text-muted)', fontSize: 16,
        maxWidth: 600, margin: '0 auto 56px',
      }}>
        Tout ce que tu veux savoir avant de commencer.
      </p>

      <div style={{ maxWidth: 800, margin: '0 auto' }}>
        {faqs.map((faq, i) => (
          <div
            key={i}
            style={
              theme === 'mythic'
                ? { padding: '20px 0', borderBottom: '1px solid rgba(186,117,23,0.15)' }
                : {
                    background: '#18181B',
                    border: '1px solid #27272A',
                    borderRadius: 8, marginBottom: 12,
                    padding: '20px 24px',
                  }
            }
          >
            <h4 style={{
              fontSize: theme === 'mythic' ? 17 : 15,
              color: theme === 'mythic' ? '#F5F2FA' : '#FAFAFA',
              margin: '0 0 8px', fontWeight: 600,
            }}>{faq.q}</h4>
            <p style={{ color: 'var(--text-muted)', fontSize: 14, margin: 0 }}>{faq.a}</p>
          </div>
        ))}
      </div>
    </section>
  )
}
