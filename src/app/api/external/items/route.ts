import { NextResponse } from 'next/server'
import { fetchExternal } from '@/lib/external-fetch'

const MERAKI_ITEMS = 'https://cdn.merakianalytics.com/riot/lol/resources/latest/en-US/items.json'
const MERAKI_AHRI  = 'https://cdn.merakianalytics.com/riot/lol/resources/latest/en-US/champions/Ahri.json'
const DDN_VERSIONS = 'https://ddragon.leagueoflegends.com/api/versions.json'

// Stats retenues pour la Vue 2 — contribution par item
const STAT_KEYS = [
  'abilityPower', 'attackDamage', 'armor', 'magicResistance', 'health',
  'abilityHaste', 'lethality', 'criticalStrikeChance', 'omnivamp',
  'attackSpeed', 'movespeed',
] as const
type StatKey = (typeof STAT_KEYS)[number]

type MerakiStatEntry = { flat: number; percent: number; percentBase: number; percentBonus: number }
type MerakiItem      = { stats?: Partial<Record<StatKey, MerakiStatEntry>> }

function extractValue(s: MerakiStatEntry | undefined): number {
  if (!s) return 0
  if (s.flat   !== 0) return s.flat
  if (s.percent !== 0) return s.percent
  return s.percentBase ?? 0
}

/**
 * Compare DDragon patch (ex. "16.12.1", saison 16 = 2026)
 * avec Meraki patch (ex. "26.11").
 * DDragon saison N → année 2010+N.
 */
function isOutdated(ddVersion: string, merakiPatch: string): boolean {
  const ddParts    = ddVersion.split('.')
  const ddYear     = 2010 + parseInt(ddParts[0] ?? '0', 10)
  const ddMinor    = parseInt(ddParts[1] ?? '0', 10)
  const mkParts    = merakiPatch.split('.')
  const mkYear     = parseInt(mkParts[0] ?? '0', 10)
  const mkMinor    = parseInt(mkParts[1] ?? '0', 10)
  return mkYear < ddYear || (mkYear === ddYear && mkMinor < ddMinor)
}

export const runtime = 'nodejs'

export async function GET() {
  try {
    const [merakiRaw, ahri, versions] = await Promise.all([
      fetchExternal<Record<string, MerakiItem>>(MERAKI_ITEMS, 86400),
      fetchExternal<{ patchLastChanged: string }>(MERAKI_AHRI,  86400),
      fetchExternal<string[]>(DDN_VERSIONS, 3600),
    ])

    const ddPatch     = versions[0] ?? ''
    const merakiPatch = ahri.patchLastChanged ?? ''
    const outdated    = isOutdated(ddPatch, merakiPatch)

    // Réduction : ne garder que les stats non-nulles pour chaque item
    const stats: Record<string, Partial<Record<StatKey, number>>> = {}
    for (const [id, item] of Object.entries(merakiRaw)) {
      const reduced: Partial<Record<StatKey, number>> = {}
      for (const key of STAT_KEYS) {
        const v = extractValue(item.stats?.[key])
        if (v !== 0) reduced[key] = v
      }
      if (Object.keys(reduced).length > 0) stats[id] = reduced
    }

    return NextResponse.json(
      { stats, outdated, ddPatch, merakiPatch },
      { headers: { 'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=3600' } },
    )
  } catch {
    // Fallback silencieux : la Vue 2 affiche quand même les données DDragon
    return NextResponse.json(
      { stats: {}, outdated: false, ddPatch: '', merakiPatch: '', error: true },
      { status: 200 },
    )
  }
}
