// Accueil prac — placeholder du socle (chantier 1).
// La garde d'accès est portée par le layout. Le contenu réel (top-5 winrate)
// arrive au chantier 4. Cette page confirme juste que le socle est en place.

export const dynamic = 'force-dynamic'

const card: React.CSSProperties = {
  padding: '18px 20px', borderRadius: 10,
  background: 'rgba(255,255,255,0.03)',
  border: '1px solid rgba(255,255,255,0.08)',
}

export default function PracHomePage() {
  const steps: { n: number; label: string; done: boolean }[] = [
    { n: 1, label: 'Socle — droits prac, sous-domaine, shell', done: true },
    { n: 2, label: 'Roster + consentement', done: false },
    { n: 3, label: 'Tracking — résolution par créneau + désambiguïsation', done: false },
    { n: 4, label: 'Pages — liste, top-5 winrate, détail joueur', done: false },
    { n: 5, label: 'Email Resend (consentement)', done: false },
  ]

  return (
    <div>
      <h1 style={{ fontFamily: 'Cinzel, serif', fontSize: 'clamp(26px, 4vw, 40px)', margin: '0 0 6px', color: '#fff' }}>
        Suivi de joueurs
      </h1>
      <p style={{ color: '#9b93b5', fontSize: 15, margin: '0 0 28px' }}>
        Outil interne réservé aux administrateurs prac. Le top 5 des joueurs suivis par winrate s&apos;affichera ici.
      </p>

      <div style={card}>
        <div style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '.08em', color: '#9b93b5', marginBottom: 14 }}>
          Avancement
        </div>
        <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {steps.map((s) => (
            <li key={s.n} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span
                style={{
                  width: 22, height: 22, borderRadius: 11, flexShrink: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 12, fontWeight: 700,
                  background: s.done ? '#EF9F27' : 'rgba(255,255,255,0.06)',
                  color: s.done ? '#1A1A1A' : '#9b93b5',
                }}
              >
                {s.done ? '✓' : s.n}
              </span>
              <span style={{ fontSize: 14, color: s.done ? '#E9E6F2' : '#9b93b5' }}>{s.label}</span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  )
}
