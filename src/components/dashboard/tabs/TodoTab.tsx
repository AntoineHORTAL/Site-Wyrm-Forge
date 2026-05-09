'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useTheme } from '@/components/providers/ThemeProvider'
import type { RealtimeChannel } from '@supabase/supabase-js'

interface TodoList {
  id: string
  user_id: string
  title: string
  description: string
  items: string[]
  active: boolean
  created_at?: string
}

export default function TodoTab() {
  const { theme } = useTheme()
  const c = theme === 'mythic'
  const supabase = createClient()

  const [lists, setLists]       = useState<TodoList[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [loading, setLoading]   = useState(true)
  const [saving, setSaving]     = useState(false)
  const [form, setForm] = useState({
    title: '', description: '', items: ['', '', '', '', ''],
  })

  /* ── Chargement ── */
  const load = useCallback(async () => {
    const { data } = await supabase
      .from('todos')
      .select('*')
      .order('created_at', { ascending: false })
    setLists((data as TodoList[]) ?? [])
    setLoading(false)
  }, [supabase])

  /* ── Realtime ── */
  useEffect(() => {
    load()

    const channel: RealtimeChannel = supabase
      .channel('todos-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'todos' }, () => load())
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [load, supabase])

  /* ── Actions ── */
  async function addList() {
    const items = form.items.filter(i => i.trim())
    if (!form.title.trim()) return
    setSaving(true)
    await supabase.from('todos').insert({
      title:       form.title.trim(),
      description: form.description.trim(),
      items,
      active:      false,
    })
    setForm({ title: '', description: '', items: ['', '', '', '', ''] })
    setSaving(false)
  }

  async function toggleActive(list: TodoList) {
    await supabase.from('todos').update({ active: !list.active }).eq('id', list.id)
  }

  async function deleteList(id: string) {
    await supabase.from('todos').delete().eq('id', id)
    if (selected === id) setSelected(null)
  }

  /* ── Styles ── */
  const border = c ? 'rgba(186,117,23,0.2)' : '#27272A'
  const bg     = c ? 'rgba(42,21,71,0.4)'   : '#18181B'

  const inputStyle: React.CSSProperties = {
    background: c ? 'rgba(20,10,35,0.6)' : '#18181B',
    border: `1px solid ${c ? 'rgba(186,117,23,0.25)' : '#27272A'}`,
    borderRadius: 6, padding: '10px 12px',
    color: '#F5F2FA', fontFamily: 'inherit', fontSize: 13,
    outline: 'none', width: '100%', marginBottom: 8,
  }

  const btnStyle: React.CSSProperties = {
    width: '100%', padding: '9px 14px',
    background: 'transparent', color: 'var(--text)',
    border: `1px solid ${c ? 'rgba(186,117,23,0.3)' : '#27272A'}`,
    borderRadius: 6, fontSize: 13, cursor: 'pointer',
    fontFamily: 'inherit', textAlign: 'center', marginBottom: 6,
  }

  const currentList = lists.find(l => l.id === selected)

  return (
    <div className="dash-grid-todo">

      {/* ── Colonne gauche : liste + actions ── */}
      <div>
        <div style={{ fontSize: 15, fontWeight: 700, color: '#F5F2FA', marginBottom: 14 }}>
          Mes listes
        </div>

        {loading ? (
          <div style={{ color: 'var(--text-dim)', fontSize: 13 }}>Chargement…</div>
        ) : lists.length === 0 ? (
          <div style={{
            padding: '20px 16px', borderRadius: 8, textAlign: 'center',
            border: `1px dashed ${border}`, color: 'var(--text-dim)', fontSize: 13,
          }}>
            Aucune liste — crée-en une à droite.
          </div>
        ) : (
          lists.map(list => (
            <div
              key={list.id}
              onClick={() => setSelected(list.id === selected ? null : list.id)}
              style={{
                border: `1px solid ${list.id === selected ? (c ? 'rgba(186,117,23,0.5)' : '#7F77DD') : border}`,
                background: bg, borderRadius: 6, padding: '12px 14px', marginBottom: 8, cursor: 'pointer',
                transition: 'border-color 0.15s',
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 600, color: '#F5F2FA', marginBottom: 2 }}>
                {list.title}
                {list.active && (
                  <span style={{
                    marginLeft: 8, fontSize: 10, color: '#5DCAA5',
                    border: '1px solid rgba(93,202,165,0.4)', borderRadius: 4, padding: '1px 6px',
                  }}>Actif</span>
                )}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{list.items.length} élément{list.items.length !== 1 ? 's' : ''}</div>
            </div>
          ))
        )}

        {/* Boutons d'action sur la liste sélectionnée */}
        {currentList && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 }}>
            <button
              onClick={() => toggleActive(currentList)}
              style={{
                ...btnStyle,
                color: currentList.active ? '#E24B4A' : '#5DCAA5',
                borderColor: currentList.active ? 'rgba(226,75,74,0.4)' : 'rgba(93,202,165,0.4)',
              }}
            >
              {currentList.active ? 'Désactiver' : 'Définir active'}
            </button>
            <button
              onClick={() => deleteList(currentList.id)}
              style={{ ...btnStyle, color: '#E24B4A', borderColor: 'rgba(226,75,74,0.4)' }}
            >
              Supprimer
            </button>
          </div>
        )}

        {/* Indicateur Realtime */}
        <div style={{
          marginTop: 16, display: 'flex', alignItems: 'center', gap: 6,
          fontSize: 11, color: 'var(--text-dim)',
        }}>
          <span style={{
            width: 6, height: 6, borderRadius: '50%', background: '#5DCAA5',
            boxShadow: '0 0 6px #5DCAA5', flexShrink: 0,
          }} />
          Synchronisé en temps réel
        </div>
      </div>

      {/* ── Colonne droite : formulaire de création ── */}
      <div>
        <div style={{ fontSize: 15, fontWeight: 700, color: '#F5F2FA', marginBottom: 14 }}>
          Nouvelle liste
        </div>

        <label style={{ fontSize: 13, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>Titre</label>
        <input
          style={inputStyle}
          value={form.title}
          onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
          placeholder="Nom de la liste..."
        />

        <label style={{ fontSize: 13, color: 'var(--text-muted)', display: 'block', marginBottom: 6, marginTop: 8 }}>Description</label>
        <textarea
          style={{ ...inputStyle, resize: 'vertical', minHeight: 80 }}
          value={form.description}
          onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
          placeholder="Description optionnelle..."
        />

        <label style={{ fontSize: 13, color: 'var(--text-muted)', display: 'block', marginBottom: 6, marginTop: 8 }}>
          Éléments (max 5)
        </label>
        {form.items.map((item, i) => (
          <input
            key={i}
            style={{ ...inputStyle, marginBottom: 6 }}
            value={item}
            onChange={e => setForm(f => {
              const items = [...f.items]; items[i] = e.target.value; return { ...f, items }
            })}
            placeholder={`Élément ${i + 1}...`}
          />
        ))}

        <button
          onClick={addList}
          disabled={saving || !form.title.trim()}
          style={{
            marginTop: 16, padding: 12, width: '100%',
            background: 'transparent',
            border: `1px solid ${c ? 'rgba(186,117,23,0.4)' : '#27272A'}`,
            borderRadius: 6, color: 'var(--text)',
            fontSize: 14, cursor: saving || !form.title.trim() ? 'not-allowed' : 'pointer',
            opacity: saving || !form.title.trim() ? 0.5 : 1,
            fontFamily: 'inherit', transition: 'opacity 0.15s',
          }}
        >
          {saving ? 'Création…' : 'Créer la liste'}
        </button>
      </div>
    </div>
  )
}
