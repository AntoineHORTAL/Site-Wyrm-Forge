'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useTheme } from '@/components/providers/ThemeProvider'

interface AuthModalProps {
  onClose: () => void
  onSuccess: () => void
}

const EyeIcon = ({ open }: { open: boolean }) => open ? (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
    <circle cx="12" cy="12" r="3"/>
  </svg>
) : (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
    <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
    <line x1="1" y1="1" x2="23" y2="23"/>
  </svg>
)

// ────────────────────────────────────────────────────────────────────────────────
// PasswordField : input de mot de passe avec œil pour show/hide.
// ⚠️ DOIT être défini AU TOP LEVEL (pas dans le composant parent), sinon React
// le re-crée à chaque render → le focus est perdu à chaque caractère tapé.
// Les styles sont passés en props pour rester sensibles au thème du parent.
// ────────────────────────────────────────────────────────────────────────────────
function PasswordField({
  value, onChange, show, onToggle, placeholder, autoComplete, hasError,
  inputBase, eyeBtn,
}: {
  value: string; onChange: (v: string) => void
  show: boolean; onToggle: () => void
  placeholder: string; autoComplete: string; hasError?: boolean
  inputBase: React.CSSProperties
  eyeBtn: React.CSSProperties
}) {
  return (
    <div style={{ position: 'relative', marginBottom: 12 }}>
      <input
        type={show ? 'text' : 'password'}
        style={{
          ...inputBase,
          paddingRight: 44,
          borderColor: hasError ? '#E24B4A' : inputBase.borderColor,
        }}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        required
        autoComplete={autoComplete}
      />
      <button type="button" onClick={onToggle} style={eyeBtn} tabIndex={-1}>
        <EyeIcon open={show} />
      </button>
    </div>
  )
}

export default function AuthModal({ onClose, onSuccess }: AuthModalProps) {
  const { theme } = useTheme()
  const c = theme === 'mythic'
  const [mode, setMode] = useState<'login' | 'signup' | 'forgot'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [pseudo, setPseudo] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const supabase = createClient()

  async function handleGoogle() {
    setError('')
    setLoading(true)
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    })
    if (oauthError) {
      setError('Erreur lors de la connexion Google.')
      setLoading(false)
    }
    // Si succès → redirection automatique, pas besoin de setLoading(false)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setSuccess('')

    if (mode === 'forgot') {
      setLoading(true)
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/callback`,
      })
      setLoading(false)
      if (resetError) setError(resetError.message)
      else setSuccess('Un lien de réinitialisation a été envoyé à ton adresse email.')
      return
    }

    if (mode === 'signup') {
      if (password !== confirmPassword) { setError('Les mots de passe ne correspondent pas.'); return }
      if (password.length < 6) { setError('Le mot de passe doit contenir au moins 6 caractères.'); return }
      if (pseudo.trim().length < 2) { setError('Le pseudo doit contenir au moins 2 caractères.'); return }
    }

    setLoading(true)

    if (mode === 'signup') {
      const { data, error: signUpError } = await supabase.auth.signUp({
        email, password,
        options: {
          data: { username: pseudo.trim() },
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      })
      if (signUpError) setError(signUpError.message)
      else if (data.user) {
        // F6 — riot_platform: null explicite (defense in depth) : ne jamais laisser un
        // éventuel DEFAULT côté DB remplir un riot_* et déclencher fn_protect_riot_columns.
        await supabase.from('profiles').insert({ id: data.user.id, username: pseudo.trim(), tier: 'apprenti', email, riot_platform: null })
        setSuccess('Compte créé ! Vérifie ton email pour confirmer ton inscription.')
      }
    } else {
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password })
      if (signInError) setError(signInError.message === 'Invalid login credentials' ? 'Email ou mot de passe incorrect.' : signInError.message)
      else { onSuccess(); onClose() }
    }

    setLoading(false)
  }

  const inputBase: React.CSSProperties = {
    background: c ? 'rgba(20,10,35,0.6)' : '#27272A',
    border: `1px solid ${c ? 'rgba(186,117,23,0.25)' : '#3F3F46'}`,
    borderRadius: 8, padding: '11px 14px',
    color: '#F5F2FA', fontFamily: 'inherit', fontSize: 14,
    outline: 'none', width: '100%',
    transition: 'border-color 0.15s',
  }

  const label: React.CSSProperties = {
    fontSize: 13, color: 'var(--text-muted)', marginBottom: 6, display: 'block',
  }

  const eyeBtn: React.CSSProperties = {
    position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
    background: 'none', border: 'none', cursor: 'pointer',
    color: 'var(--text-dim)', padding: 4, display: 'flex', alignItems: 'center',
    transition: 'color 0.15s',
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 100,
        background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: c ? '#130720' : '#18181B',
          border: `1px solid ${c ? 'rgba(186,117,23,0.3)' : '#27272A'}`,
          borderRadius: 16, padding: '36px 32px', width: '100%', maxWidth: 420,
          boxShadow: c ? '0 24px 64px rgba(0,0,0,0.6)' : '0 24px 64px rgba(0,0,0,0.5)',
        }}
      >
        {/* Logo */}
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 20 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/wyrm-logo.ico" alt="Wyrm Forge" width={48} height={48} style={{ borderRadius: 10 }} />
        </div>

        <h2 className="font-mythic" style={{ fontSize: 22, fontWeight: 600, color: '#F5F2FA', marginBottom: 4, textAlign: 'center' }}>
          {mode === 'forgot' ? 'Mot de passe oublié' : mode === 'login' ? 'Connexion' : 'Créer un compte'}
        </h2>
        <p style={{ color: 'var(--text-muted)', fontSize: 13, textAlign: 'center', marginBottom: 24 }}>
          {mode === 'forgot' ? 'On t\'envoie un lien de réinitialisation.' : mode === 'login' ? 'Content de te revoir, Invocateur.' : 'Rejoins la forge.'}
        </p>

        {/* Tabs (login / signup) */}
        {mode !== 'forgot' && (
          <div style={{
            display: 'flex', background: c ? 'rgba(255,255,255,0.04)' : '#27272A',
            borderRadius: 8, padding: 3, marginBottom: 24, gap: 2,
          }}>
            {(['login', 'signup'] as const).map(m => (
              <button key={m} type="button"
                onClick={() => { setMode(m); setError(''); setSuccess('') }}
                style={{
                  flex: 1, padding: '8px 0', border: 'none', borderRadius: 6,
                  fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit',
                  background: mode === m ? (c ? 'rgba(127,119,221,0.25)' : '#3F3F46') : 'transparent',
                  color: mode === m ? '#F5F2FA' : 'var(--text-dim)', transition: 'all 0.15s',
                }}
              >
                {m === 'login' ? 'Connexion' : 'Inscription'}
              </button>
            ))}
          </div>
        )}

        {/* Bouton Google (login + signup uniquement) */}
        {mode !== 'forgot' && !success && (
          <>
            <button
              type="button"
              onClick={handleGoogle}
              disabled={loading}
              style={{
                width: '100%', padding: '11px 14px',
                background: 'transparent',
                border: `1px solid ${c ? 'rgba(186,117,23,0.3)' : '#3F3F46'}`,
                borderRadius: 8, color: '#F5F2FA', fontSize: 14, fontWeight: 500,
                cursor: loading ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                transition: 'border-color 0.15s, background 0.15s',
                opacity: loading ? 0.6 : 1,
              }}
              onMouseEnter={e => {
                if (!loading) (e.currentTarget as HTMLButtonElement).style.borderColor = c ? 'rgba(186,117,23,0.6)' : '#71717A'
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLButtonElement).style.borderColor = c ? 'rgba(186,117,23,0.3)' : '#3F3F46'
              }}
            >
              {/* Logo Google SVG */}
              <svg width="18" height="18" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
                <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
                <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
                <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
                <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.18 1.48-4.97 2.31-8.16 2.31-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
                <path fill="none" d="M0 0h48v48H0z"/>
              </svg>
              Continuer avec Google
            </button>

            {/* Séparateur */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '16px 0' }}>
              <div style={{ flex: 1, height: 1, background: c ? 'rgba(186,117,23,0.15)' : '#3F3F46' }}/>
              <span style={{ color: 'var(--text-dim)', fontSize: 12 }}>ou</span>
              <div style={{ flex: 1, height: 1, background: c ? 'rgba(186,117,23,0.15)' : '#3F3F46' }}/>
            </div>
          </>
        )}

        {/* Success message */}
        {success ? (
          <div style={{ textAlign: 'center', padding: '16px 0' }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>✉️</div>
            <p style={{ color: '#5DCAA5', fontWeight: 600, marginBottom: 8, fontSize: 15 }}>
              {mode === 'forgot' ? 'Email envoyé !' : 'Compte créé avec succès !'}
            </p>
            <p style={{ color: 'var(--text-muted)', fontSize: 13, lineHeight: 1.5 }}>{success}</p>
            <button onClick={onClose} style={{
              marginTop: 20, padding: '10px 24px', background: 'transparent',
              border: `1px solid ${c ? 'rgba(186,117,23,0.4)' : '#3F3F46'}`,
              borderRadius: 8, color: 'var(--text)', cursor: 'pointer', fontFamily: 'inherit', fontSize: 14,
            }}>Fermer</button>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            {/* Pseudo (signup only) */}
            {mode === 'signup' && (
              <>
                <label style={label}>Pseudo</label>
                <input style={{ ...inputBase, marginBottom: 12 }}
                  value={pseudo} onChange={e => setPseudo(e.target.value)}
                  placeholder="TonPseudo" required minLength={2} maxLength={32} autoComplete="username"
                />
              </>
            )}

            {/* Email */}
            <label style={label}>Adresse email</label>
            <input type="email" style={{ ...inputBase, marginBottom: 12 }}
              value={email} onChange={e => setEmail(e.target.value)}
              placeholder="ton@email.com" required autoComplete="email"
            />

            {/* Password (login + signup) */}
            {mode !== 'forgot' && (
              <>
                <label style={label}>Mot de passe</label>
                <PasswordField
                  value={password} onChange={setPassword}
                  show={showPassword} onToggle={() => setShowPassword(v => !v)}
                  placeholder={mode === 'signup' ? 'Min. 6 caractères' : '••••••••'}
                  autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                  inputBase={inputBase} eyeBtn={eyeBtn}
                />
              </>
            )}

            {/* Confirm password (signup only) */}
            {mode === 'signup' && (
              <>
                <label style={label}>Confirmer le mot de passe</label>
                <PasswordField
                  value={confirmPassword} onChange={setConfirmPassword}
                  show={showConfirm} onToggle={() => setShowConfirm(v => !v)}
                  placeholder="••••••••"
                  autoComplete="new-password"
                  hasError={!!(confirmPassword && confirmPassword !== password)}
                  inputBase={inputBase} eyeBtn={eyeBtn}
                />
              </>
            )}

            {/* Forgot password link (login only) */}
            {mode === 'login' && (
              <div style={{ textAlign: 'right', marginBottom: 16, marginTop: -4 }}>
                <button type="button"
                  onClick={() => { setMode('forgot'); setError(''); setSuccess('') }}
                  style={{
                    background: 'none', border: 'none', fontSize: 12,
                    color: c ? '#BA7517' : '#7F77DD',
                    cursor: 'pointer', fontFamily: 'inherit',
                    textDecoration: 'underline', textUnderlineOffset: 3,
                  }}
                >
                  Mot de passe oublié ?
                </button>
              </div>
            )}

            {/* Back link (forgot mode) */}
            {mode === 'forgot' && (
              <button type="button"
                onClick={() => { setMode('login'); setError('') }}
                style={{
                  background: 'none', border: 'none', fontSize: 12,
                  color: 'var(--text-dim)', cursor: 'pointer', fontFamily: 'inherit',
                  marginBottom: 16, display: 'block',
                }}
              >
                ← Retour à la connexion
              </button>
            )}

            {/* Error */}
            {error && (
              <div style={{
                background: 'rgba(226,75,74,0.1)', border: '1px solid rgba(226,75,74,0.3)',
                borderRadius: 8, padding: '10px 14px', color: '#E24B4A', fontSize: 13, marginBottom: 14,
              }}>
                {error}
              </div>
            )}

            {/* Submit — style braise (.wf-btn-gold) */}
            <button type="submit" disabled={loading} className="wf-btn-gold" style={{
              width: '100%', padding: '13px', justifyContent: 'center', fontSize: 15, marginTop: 4,
              cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1,
            }}>
              {loading ? '...' : mode === 'login' ? 'Se connecter' : mode === 'signup' ? 'Créer mon compte' : 'Envoyer le lien'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
