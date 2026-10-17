import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import SettingToggle from '../components/dashboard/SettingToggle'
import KillSwitchModal from '../components/dashboard/KillSwitchModal'
import LaunchModal from '../components/dashboard/LaunchModal'
import {
  flagWriteOutcome, canRevertLaunch, revertLaunchPatch, applyRevertLaunch,
  launchPatch, isPendingLaunch, isLiveLegacyLaunch, type FlagCatalogueRow,
} from './admin-flags'
import { adminFr, adminEn } from '../locales/dashboard/admin'

/**
 * Écritures du panneau admin sur `app_settings` (chantier du 2026-10-17).
 *
 * Trois cas, ceux qui ont fait échouer en silence les clics « Lancer » du
 * 2026-10-17 et rendu impossible la fermeture de la boutique :
 *  1. une erreur Supabase est lue et affichée ;
 *  2. un refus RLS (zéro ligne, sans erreur) est traité comme un échec ;
 *  3. un lancement ouvert peut être refermé sans devenir un kill switch.
 */

function row(key: string, value: boolean, kind: 'launch' | 'kill', over: Partial<FlagCatalogueRow> = {}): FlagCatalogueRow {
  return {
    key, value: value ? 'true' : 'false', kind,
    surface: 'shared', group_key: 'ecailles', parent_key: null,
    off_behavior: 'hidden',
    label_fr: `Libellé ${key}`, label_en: `Label ${key}`,
    desc_fr: `Description ${key}`, desc_en: `Description ${key}`,
    sort_order: 0, reason: null, updated_at: null, updated_by: null,
    ...over,
  }
}

const ADMIN_TAB = readFileSync(join(__dirname, '../components/dashboard/tabs/AdminTab.tsx'), 'utf8')

describe('1. erreur Supabase lue et rendue', () => {
  it('une erreur PostgREST donne un échec qui porte son message', () => {
    const out = flagWriteOutcome({ data: null, error: { message: 'permission denied for table app_settings' } })
    expect(out).toEqual({ ok: false, reason: 'error', message: 'permission denied for table app_settings' })
  })

  it("l'erreur prime sur des lignes éventuellement renvoyées", () => {
    expect(flagWriteOutcome({ data: [{ key: 'x' }], error: { message: 'boom' } }).ok).toBe(false)
  })

  it('les deux modales affichent le message d’erreur reçu, en alerte', () => {
    const cut = renderToStaticMarkup(createElement(KillSwitchModal, {
      flagLabel: 'Boutique', reason: 'x', saving: false, error: 'La base a refusé l’écriture : boom.',
      onReasonChange: () => {}, onConfirm: () => {}, onCancel: () => {},
      labels: {
        cutTitle: '{label}', cutReasonLabel: 'm', cutReasonHint: 'h', cutReasonPlaceholder: 'p',
        cutConfirm: 'c', cutCancel: 'a', impactLabel: 'i', impactText: 't',
      },
    }))
    const launch = renderToStaticMarkup(createElement(LaunchModal, {
      flagLabel: 'Quêtes', saving: false, error: 'Aucune ligne modifiée',
      onConfirm: () => {}, onCancel: () => {},
      labels: {
        launchTitle: '{label}', launchImpactLabel: 'i', launchImpactText: 't',
        launchIrreversible: 'r', launchConfirm: 'c', launchCancel: 'a',
      },
    }))
    expect(cut).toContain('role="alert"')
    expect(cut).toContain('La base a refusé l’écriture : boom.')
    expect(launch).toContain('role="alert"')
    expect(launch).toContain('Aucune ligne modifiée')
  })

  it('sans erreur, aucune alerte n’est rendue', () => {
    const launch = renderToStaticMarkup(createElement(LaunchModal, {
      flagLabel: 'Quêtes', saving: false, onConfirm: () => {}, onCancel: () => {},
      labels: {
        launchTitle: '{label}', launchImpactLabel: 'i', launchImpactText: 't',
        launchIrreversible: 'r', launchConfirm: 'c', launchCancel: 'a',
      },
    }))
    expect(launch).not.toContain('role="alert"')
  })

  it('les messages existent en FR et en EN, avec le message brut interpolé', () => {
    for (const d of [adminFr, adminEn]) {
      expect(d.flags.writeError).toContain('{message}')
      expect(d.flags.writeNoRows.length).toBeGreaterThan(0)
    }
  })
})

describe('2. refus RLS silencieux (zéro ligne)', () => {
  it('zéro ligne sans erreur = échec `no_rows`, jamais un succès', () => {
    expect(flagWriteOutcome({ data: [], error: null })).toEqual({ ok: false, reason: 'no_rows' })
    expect(flagWriteOutcome({ data: null, error: null })).toEqual({ ok: false, reason: 'no_rows' })
  })

  it('au moins une ligne revenue = succès', () => {
    expect(flagWriteOutcome({ data: [{ key: 'shop_enabled' }], error: null })).toEqual({ ok: true })
  })

  it('AdminTab n’écrit app_settings qu’à UN endroit, suivi de `.select(`', () => {
    // Le refus RLS ne se voit qu'avec `.select()` : une seconde écriture sans
    // lui réintroduirait l'échec silencieux.
    const writes = ADMIN_TAB.match(/\.from\('app_settings'\)\s*\.update\(/g) ?? []
    expect(writes).toHaveLength(1)
    expect(ADMIN_TAB).toMatch(/\.from\('app_settings'\)\s*\.update\(patch\)\s*\.eq\('key', key\)\s*\.select\('key'\)/)
  })

  it('les trois gestes du catalogue et le réglage passent par `writeAppSetting`', () => {
    for (const fn of ['toggleSetting', 'toggleFlag', 'launchFlag', 'revertLaunch']) {
      const body = ADMIN_TAB.slice(ADMIN_TAB.indexOf(`async function ${fn}(`))
      const end = body.indexOf('\n  }')
      expect(body.slice(0, end), fn).toContain('writeAppSetting(')
    }
  })
})

describe('3. annuler un lancement ouvert, sans conversion', () => {
  it('seul un flag de lancement OUVERT peut être refermé', () => {
    expect(canRevertLaunch(row('shop_enabled', true, 'launch'))).toBe(true)
    expect(canRevertLaunch(row('cosmetics_enabled', false, 'launch'))).toBe(false)
    expect(canRevertLaunch(row('ecailles_enabled', true, 'kill'))).toBe(false)
    expect(canRevertLaunch(row('live_game_enabled', false, 'kill'))).toBe(false)
  })

  it('le patch ne touche PAS `kind` : le flag reste un lancement, fermé, avec son motif', () => {
    const patch = revertLaunchPatch('  boutique pas prête  ')
    expect(patch).toEqual({ value: 'false', reason: 'boutique pas prête' })
    expect('kind' in patch).toBe(false)

    const after = applyRevertLaunch(row('shop_enabled', true, 'launch'), 'boutique pas prête')
    expect(after.kind).toBe('launch')
    expect(after.value).toBe('false')
    expect(isPendingLaunch(after)).toBe(true)
    expect(isLiveLegacyLaunch(after)).toBe(false)
  })

  it('relancer ensuite repart du patch de lancement, qui efface le motif', () => {
    expect(launchPatch()).toEqual({ value: 'true', kind: 'kill', reason: null })
  })

  it('la carte d’un lancement ouvert porte les deux boutons', () => {
    const html = renderToStaticMarkup(createElement(SettingToggle, {
      label: 'Boutique', description: 'd', settingKey: 'shop_enabled',
      value: true, saving: false, loading: false, onToggle: () => {},
      border: '#27272A', bg: '#18181B', variant: 'launch',
      actionLabel: 'Convertir en kill switch',
      secondaryActionLabel: 'Annuler le lancement', onSecondaryAction: () => {},
    }))
    expect(html).toContain('Annuler le lancement')
    expect(html).toContain('Convertir en kill switch')
  })

  it('sans libellé secondaire, la carte n’a qu’un bouton', () => {
    const html = renderToStaticMarkup(createElement(SettingToggle, {
      label: 'Kit', description: 'd', settingKey: 'kit_sur_mesure_enabled',
      value: false, saving: false, loading: false, onToggle: () => {},
      border: '#27272A', bg: '#18181B', variant: 'launch', actionLabel: 'Lancer',
    }))
    expect(html.match(/<button/g)).toHaveLength(1)
  })

  it('AdminTab propose « Annuler le lancement » selon `canRevertLaunch`, et le motif est exigé', () => {
    expect(ADMIN_TAB).toContain('secondaryActionLabel={canRevertLaunch(row) ? F.revertAction : undefined}')
    const body = ADMIN_TAB.slice(ADMIN_TAB.indexOf('async function revertLaunch('))
    expect(body.slice(0, body.indexOf('\n  }'))).toContain('if (!canSubmitCut(cutReason)) return')
  })

  it('les libellés de l’annulation existent en FR et en EN', () => {
    for (const d of [adminFr, adminEn]) {
      expect(d.flags.revertAction.length).toBeGreaterThan(0)
      expect(d.flags.revertTitle).toContain('{label}')
      expect(d.flags.revertConfirm.length).toBeGreaterThan(0)
    }
  })
})
