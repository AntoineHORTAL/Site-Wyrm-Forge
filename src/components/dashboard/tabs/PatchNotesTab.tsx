'use client'

import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useTheme } from '@/components/providers/ThemeProvider'
import { createClient } from '@/lib/supabase/client'
import { IconMaximize, IconX, IconDownload, IconPhoto, IconFileText } from '@tabler/icons-react'
import PatchCard, { type PatchNote } from '@/components/patch-notes/PatchCard'
import { useDashboard } from '@/locales/dashboard'

const DDN = 'https://ddragon.leagueoflegends.com'

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(iso))
}

export default function PatchNotesTab() {
  console.log('PatchNotesTab rendu')

  const { theme } = useTheme()
  const c = theme === 'mythic'
  const supabase = createClient()
  const pn = useDashboard().accueil.patchnotes

  const [patches, setPatches]               = useState<PatchNote[]>([])
  const [loading, setLoading]               = useState(true)
  const [expanded, setExpanded]             = useState<string | null>(null)
  const [ddragonVersion, setDdragonVersion] = useState('15.10.1')
  const [fullscreenPatch, setFullscreenPatch] = useState<PatchNote | null>(null)
  const [mounted, setMounted]               = useState(false)

  // Menu export : quel patch + position fixe calculée depuis le bouton déclencheur
  const [exportMenuPatch, setExportMenuPatch]   = useState<string | null>(null)
  const [exportMenuPos, setExportMenuPos]       = useState<{ top: number; right: number } | null>(null)
  // Patch dont toutes les descriptions sont forcées ouvertes pendant la capture PNG
  const [exportExpandPatch, setExportExpandPatch] = useState<string | null>(null)

  const contentRefs   = useRef<Map<string, HTMLDivElement>>(new Map())
  const exportBtnRefs = useRef<Map<string, HTMLButtonElement>>(new Map())

  const accent      = c ? '#EF9F27' : '#7F77DD'
  const border      = c ? 'rgba(186,117,23,0.2)' : '#27272A'
  const accentMuted = c ? 'rgba(186,117,23,0.08)' : 'rgba(127,119,221,0.07)'

  useEffect(() => { setMounted(true) }, [])

  useEffect(() => {
    async function init() {
      setLoading(true)
      const [{ data: patches }, vRes] = await Promise.all([
        supabase
          .from('patch_notes')
          .select('id, version, title, summary_jsonb, image_url, published_at')
          .eq('status', 'published')
          .order('published_at', { ascending: false })
          .limit(20),
        fetch(`${DDN}/api/versions.json`).catch(() => null),
      ])
      if (patches) setPatches(patches as PatchNote[])
      if (vRes?.ok) {
        const versions = await vRes.json() as string[]
        if (versions[0]) setDdragonVersion(versions[0])
      }
      setLoading(false)
    }
    init()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!fullscreenPatch) return
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') setFullscreenPatch(null) }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [fullscreenPatch])

  function closeExportMenu() {
    setExportMenuPatch(null)
    setExportMenuPos(null)
  }

  function openExportMenu(patchId: string) {
    // Si déjà ouvert sur ce patch, fermer
    if (exportMenuPatch === patchId) { closeExportMenu(); return }
    const btn = exportBtnRefs.current.get(patchId)
    if (!btn) return
    const rect = btn.getBoundingClientRect()
    // Position fixe : collé sous le bouton, aligné à droite
    setExportMenuPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right })
    setExportMenuPatch(patchId)
  }

  async function exportPng(patchId: string, version: string) {
    console.log('export image', patchId, version)

    // 1. Forcer l'ouverture de toutes les descriptions (forceExpandDesc dans PatchCard)
    setExportExpandPatch(patchId)

    // 2. Attendre deux frames : React re-render + layout navigateur
    await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))

    const el = contentRefs.current.get(patchId)
    if (!el) { console.warn('exportPng: ref introuvable pour', patchId); setExportExpandPatch(null); return }

    // 3. Attendre que toutes les polices soient chargées
    await document.fonts.ready

    // 4. Attendre le chargement COMPLET de toutes les images dans la zone capturée
    //    (5 s de timeout de sécurité par image pour ne pas bloquer indéfiniment)
    const imgs = Array.from(el.querySelectorAll<HTMLImageElement>('img'))
    await Promise.all(imgs.map(img => {
      if (img.complete && img.naturalWidth > 0) return Promise.resolve()
      return Promise.race([
        new Promise<void>(resolve => {
          img.addEventListener('load',  () => resolve(), { once: true })
          img.addEventListener('error', () => resolve(), { once: true })
        }),
        new Promise<void>(resolve => setTimeout(resolve, 5000)),
      ])
    }))

    // 5. Capture html2canvas — scale:2 pour la netteté, useCORS pour les images DDragon
    const html2canvas = (await import('html2canvas')).default
    const canvas = await html2canvas(el, {
      useCORS: true,
      backgroundColor: '#130f1a',
      scale: 2,
    })

    // 6. Téléchargement
    const link = document.createElement('a')
    link.href = canvas.toDataURL('image/png')
    link.download = `patch-${version}.png`
    link.click()

    // 7. Restaurer l'état des descriptions
    setExportExpandPatch(null)
  }

  function exportPdf() {
    console.log('export pdf')
    window.print()
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
        <div style={{ color: 'var(--text-muted)', fontSize: 14 }}>{pn.loading}</div>
      </div>
    )
  }

  if (patches.length === 0) {
    return (
      <div style={{
        textAlign: 'center', padding: '60px 32px', borderRadius: 12,
        border: `2px dashed ${c ? 'rgba(186,117,23,0.3)' : 'rgba(127,119,221,0.3)'}`,
      }}>
        <div style={{ fontSize: 40, marginBottom: 16 }}>📜</div>
        <h3 style={{ color: '#F5F2FA', fontSize: 18, fontWeight: 600, margin: '0 0 8px' }}>
          {pn.emptyTitle}
        </h3>
        <p style={{ color: 'var(--text-muted)', fontSize: 14, margin: 0 }}>
          {pn.emptyText}
        </p>
      </div>
    )
  }

  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {patches.map(patch => {
          const isOpen = expanded === patch.id
          return (
            <div
              key={patch.id}
              style={{
                border: `1px solid ${isOpen ? accent : border}`,
                borderRadius: 12,
                background: isOpen ? accentMuted : 'rgba(255,255,255,0.02)',
                transition: 'border-color 0.15s, background 0.15s',
              }}
            >
              {/* ── En-tête : accordéon + actions ────────────────────────── */}
              <div style={{ display: 'flex', alignItems: 'stretch' }}>
                <button
                  onClick={() => setExpanded(prev => prev === patch.id ? null : patch.id)}
                  style={{
                    flex: 1, display: 'flex', alignItems: 'center', gap: 14,
                    padding: '14px 12px 14px 18px',
                    background: 'transparent', border: 'none',
                    cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit', minWidth: 0,
                  }}
                >
                  <span style={{
                    fontSize: 11, fontWeight: 700, letterSpacing: 1,
                    color: accent, background: isOpen ? 'transparent' : 'rgba(127,119,221,0.1)',
                    padding: '3px 8px', borderRadius: 6, flexShrink: 0, fontFamily: 'Cinzel, serif',
                  }}>
                    {patch.version}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ color: '#F5F2FA', fontWeight: 600, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {patch.title}
                    </div>
                    <div style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 2 }}>
                      {pn.publishedOn.replace('{date}', formatDate(patch.published_at))}
                    </div>
                  </div>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={accent} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                    style={{ flexShrink: 0, transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}>
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </button>

                {/* Bouton plein écran */}
                <button
                  onClick={() => setFullscreenPatch(patch)}
                  title={pn.fullscreen}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    width: 42, flexShrink: 0, background: 'transparent', border: 'none',
                    borderLeft: `1px solid ${border}`, color: 'var(--text-muted)', cursor: 'pointer',
                  }}
                >
                  <IconMaximize size={15} />
                </button>

                {/* Bouton Exporter — le menu lui-même est rendu via portal */}
                {isOpen && (
                  <button
                    ref={el => {
                      if (el) exportBtnRefs.current.set(patch.id, el)
                      else exportBtnRefs.current.delete(patch.id)
                    }}
                    onClick={() => openExportMenu(patch.id)}
                    title={pn.export}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                      padding: '0 12px', flexShrink: 0,
                      background: 'transparent', border: 'none',
                      borderLeft: `1px solid ${border}`, color: 'var(--text-muted)',
                      cursor: 'pointer', fontSize: 12, fontFamily: 'inherit',
                    }}
                  >
                    <IconDownload size={13} />
                    <span>{pn.export}</span>
                  </button>
                )}
              </div>

              {/* ── Contenu déplié : PatchCard ────────────────────────────── */}
              {isOpen && (
                <div style={{ padding: '0 20px 24px', borderTop: `1px solid ${border}` }}>
                  <div
                    style={{ marginTop: 24 }}
                    ref={el => {
                      if (el) contentRefs.current.set(patch.id, el)
                      else contentRefs.current.delete(patch.id)
                    }}
                  >
                    <PatchCard patch={patch} ddragonVersion={ddragonVersion} forceExpandDesc={exportExpandPatch === patch.id} />
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* ── Menu export via Portal — position:fixed, échappe tout overflow:hidden ── */}
      {mounted && exportMenuPatch && exportMenuPos && createPortal(
        <>
          {/* Overlay transparent qui ferme le menu au clic extérieur (onClick, pas mousedown) */}
          <div
            style={{ position: 'fixed', inset: 0, zIndex: 299 }}
            onClick={closeExportMenu}
          />
          {/* Menu */}
          <div style={{
            position: 'fixed',
            top: exportMenuPos.top,
            right: exportMenuPos.right,
            zIndex: 300,
            background: '#1e1a2a',
            border: `1px solid ${border}`,
            borderRadius: 8,
            overflow: 'hidden',
            minWidth: 148,
            boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
          }}>
            <button
              onClick={() => {
                const patch = patches.find(p => p.id === exportMenuPatch)
                closeExportMenu()
                if (patch) exportPng(patch.id, patch.version)
              }}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                width: '100%', padding: '10px 14px',
                background: 'transparent', border: 'none',
                color: '#F5F2FA', cursor: 'pointer',
                fontSize: 13, fontFamily: 'inherit', textAlign: 'left',
              }}
            >
              <IconPhoto size={14} /> {pn.exportPng}
            </button>
            <button
              onClick={() => { closeExportMenu(); exportPdf() }}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                width: '100%', padding: '10px 14px',
                background: 'transparent', border: 'none',
                borderTop: `1px solid ${border}`,
                color: '#F5F2FA', cursor: 'pointer',
                fontSize: 13, fontFamily: 'inherit', textAlign: 'left',
              }}
            >
              <IconFileText size={14} /> {pn.exportPdf}
            </button>
          </div>
        </>,
        document.body
      )}

      {/* ── Modal plein écran via Portal ──────────────────────────────────── */}
      {mounted && fullscreenPatch && createPortal(
        <div className="pn-modal" onClick={() => setFullscreenPatch(null)}>
          <div className="pn-modal-inner" onClick={e => e.stopPropagation()}>
            <button
              className="pn-modal-close"
              onClick={() => setFullscreenPatch(null)}
              aria-label={pn.close}
            >
              <IconX size={18} />
            </button>
            <PatchCard patch={fullscreenPatch} ddragonVersion={ddragonVersion} />
          </div>
        </div>,
        document.body
      )}
    </>
  )
}
