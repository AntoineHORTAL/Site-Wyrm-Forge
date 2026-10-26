import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { WINDOWS_DOWNLOAD_URL, latestStableVersion, windowsDownloadUrl } from './download'

// Extrait réel de releases.win.json (2026-10-25), SHA retirés.
const FEED = {
  Assets: [
    { PackageId: 'WyrmForge', Version: '1.0.23', Type: 'Full', FileName: 'WyrmForge-1.0.23-full.nupkg' },
    { PackageId: 'WyrmForge', Version: '1.0.23', Type: 'Delta', FileName: 'WyrmForge-1.0.23-delta.nupkg' },
    { PackageId: 'WyrmForge', Version: '1.0.22', Type: 'Full', FileName: 'WyrmForge-1.0.22-full.nupkg' },
  ],
}

describe('latestStableVersion', () => {
  it('lit la version du flux réel', () => {
    expect(latestStableVersion(FEED)).toBe('1.0.23')
  })

  it('compare numériquement, pas en texte (1.0.10 > 1.0.9)', () => {
    const feed = { Assets: [
      { Version: '1.0.9', Type: 'Full' },
      { Version: '1.0.10', Type: 'Full' },
      { Version: '1.0.2', Type: 'Full' },
    ] }
    expect(latestStableVersion(feed)).toBe('1.0.10')
  })

  it('ignore les deltas et les versions à suffixe (preview)', () => {
    const feed = { Assets: [
      { Version: '1.0.23', Type: 'Full' },
      { Version: '1.0.24', Type: 'Delta' },
      { Version: '1.0.25-preview', Type: 'Full' },
    ] }
    expect(latestStableVersion(feed)).toBe('1.0.23')
  })

  it.each([null, undefined, {}, { Assets: 'x' }, { Assets: [] }, { Assets: [{ Type: 'Full' }] }, 'garbage'])(
    'flux illisible → null (%j)',
    feed => expect(latestStableVersion(feed)).toBeNull(),
  )
})

describe('windowsDownloadUrl', () => {
  it('garde l’URL du Setup et ajoute le nom versionné', () => {
    expect(windowsDownloadUrl('1.0.23')).toBe(
      `${WINDOWS_DOWNLOAD_URL}?download=WyrmForge-1.0.23-Setup.exe`,
    )
  })

  it.each([null, '', '1.0.23-preview', '../x', '1.0'])('version absente ou invalide → lien neutre (%j)', v => {
    expect(windowsDownloadUrl(v)).toBe(WINDOWS_DOWNLOAD_URL)
  })

  it('ne pointe jamais vers l’ancien downloads/WyrmForge.exe', () => {
    expect(WINDOWS_DOWNLOAD_URL).not.toMatch(/\/downloads\/WyrmForge\.exe$/)
    expect(WINDOWS_DOWNLOAD_URL).toMatch(/\/downloads\/velopack\/WyrmForge-win-Setup\.exe$/)
  })
})

// Un lien posé directement sur la constante perdrait le nom versionné sans que rien ne
// casse : tout lien du site passe par useWindowsDownloadUrl().
describe('liens de téléchargement', () => {
  function sources(dir: string): string[] {
    return readdirSync(dir).flatMap(name => {
      const p = join(dir, name)
      if (statSync(p).isDirectory()) return sources(p)
      return /\.tsx$/.test(name) && !/\.test\.tsx$/.test(name) ? [p] : []
    })
  }

  it('aucun href={WINDOWS_DOWNLOAD_URL} dans les composants', () => {
    const fautifs = sources(join(__dirname, '..'))
      .filter(f => readFileSync(f, 'utf8').includes('href={WINDOWS_DOWNLOAD_URL}'))
    expect(fautifs).toEqual([])
  })
})
