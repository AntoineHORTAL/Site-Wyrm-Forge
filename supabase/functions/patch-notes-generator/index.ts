// Edge Function POST : génère un résumé de patch notes via Anthropic Claude.
// Déclenchée par un cron Supabase ou par un admin via le dashboard.
//
// Auth double :
//   1. JWT admin Supabase (header Authorization) — accès admin dashboard
//   2. Header X-Internal-Token = PATCH_CRON_SECRET — accès cron automatique
//
// Stratégie de récupération du contenu :
//   1. Jina AI Reader (rend le JS, retourne le texte propre)
//   2. Fetch direct (fallback si Jina down)
//   3. web_search via Claude (fallback si la page est introuvable)
//
// Génération par sections (4 appels Claude parallèles) quand le contenu est disponible,
// ou 1 appel unifié avec web_search en fallback.
//
// Post-traitement déterministe :
//   - reclassifyRunes : déplace systeme[] → runes[] si le nom est une rune connue
//   - completeMissingDescriptions : complète les descriptions absentes via un appel ciblé

import { handleCors, jsonResponse } from '../_shared/cors.ts'
import { getUser, secretsMatch } from '../_shared/auth.ts'
import { cacheGet, cacheSet } from '../_shared/cache.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const FN    = 'patch-notes-generator'
const MODEL = 'claude-sonnet-4-6'

function adminDb() {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )
}

function normalizePatchVersion(raw: string): string {
  const parts = raw.split('.')
  return `${parts[0]}.${parts[1]}`
}

// DDragon 16.x → public 26.x (offset +10 depuis la saison 15/2025)
function toPublicPatchVersion(ddragonVersion: string): string {
  const [major, minor] = ddragonVersion.split('.')
  const majorNum = parseInt(major, 10)
  const publicMajor = majorNum >= 15 ? majorNum + 10 : majorNum
  return `${publicMajor}.${minor}`
}

// Teste les deux slugs Riot (long → court) via HEAD
async function resolveSourceUrl(version: string): Promise<{ url: string; ok: boolean }> {
  const base  = 'https://www.leagueoflegends.com/fr-fr/news/game-updates'
  const dash  = version.replace('.', '-')
  const candidates = [
    `${base}/league-of-legends-patch-${dash}-notes/`,
    `${base}/patch-${dash}-notes/`,
  ]
  for (const url of candidates) {
    try {
      const r = await fetch(url, { method: 'HEAD' })
      if (r.ok) return { url, ok: true }
    } catch { /* essai suivant */ }
  }
  return { url: candidates[0], ok: false }
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

// Valide la structure minimale du JSON fusionné
// deno-lint-ignore no-explicit-any
function validatePatchData(data: any): boolean {
  return (
    typeof data === 'object' && data !== null &&
    typeof data.subtitle === 'string' &&
    Array.isArray(data.highlights) &&
    typeof data.counts === 'object' &&
    typeof data.counts.champions === 'number' &&
    typeof data.counts.items     === 'number' &&
    typeof data.counts.runes     === 'number' &&
    typeof data.counts.systeme   === 'number' &&
    Array.isArray(data.champions) &&
    Array.isArray(data.items) &&
    Array.isArray(data.runes) &&
    Array.isArray(data.systeme)
  )
}

// Appelle l'API Anthropic et retourne le texte du bloc text, ou null en cas d'erreur
async function callSection(
  anthropicKey: string,
  systemPrompt: string,
  userContent: string,
  maxTokens: number,
  // deno-lint-ignore no-explicit-any
  tools?: any[],
): Promise<string | null> {
  // deno-lint-ignore no-explicit-any
  const body: Record<string, any> = {
    model:    MODEL,
    max_tokens: maxTokens,
    system:   systemPrompt,
    messages: [{ role: 'user', content: userContent }],
  }
  if (tools) body.tools = tools

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key':         anthropicKey,
        'anthropic-version': '2023-06-01',
        'content-type':      'application/json',
      },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      console.error('Anthropic error:', res.status, await res.text())
      return null
    }
    // deno-lint-ignore no-explicit-any
    const data: any = await res.json()
    // deno-lint-ignore no-explicit-any
    const textBlock = data.content?.find((b: any) => b.type === 'text')
    return textBlock?.text ?? null
  } catch (e) {
    console.error('callSection fetch error:', e instanceof Error ? e.message : String(e))
    return null
  }
}

// Parse le JSON d'une réponse Claude et extrait le tableau voulu
function extractArray<T>(raw: string | null, key: string): T[] {
  if (!raw) return []
  const cleaned = raw.trim().replace(/^```json?\n?/, '').replace(/\n?```$/, '').trim()
  try {
    const parsed = JSON.parse(cleaned)
    return Array.isArray(parsed[key]) ? parsed[key] as T[] : []
  } catch {
    console.error(`extractArray(${key}) parse error, raw:`, cleaned.slice(0, 200))
    return []
  }
}

// Parse le JSON d'une réponse meta (subtitle + highlights)
// deno-lint-ignore no-explicit-any
function extractMeta(raw: string | null): { subtitle: string; highlights: string[] } | null {
  if (!raw) return null
  const cleaned = raw.trim().replace(/^```json?\n?/, '').replace(/\n?```$/, '').trim()
  try {
    const parsed = JSON.parse(cleaned)
    if (typeof parsed.subtitle === 'string' && Array.isArray(parsed.highlights)) {
      return { subtitle: parsed.subtitle, highlights: parsed.highlights }
    }
  } catch {
    console.error('extractMeta parse error, raw:', cleaned.slice(0, 200))
  }
  return null
}

// ── Helpers post-traitement ────────────────────────────────────────────────────

// Normalisation robuste : diacritiques, tirets→espace, ponctuation supprimée.
// Même logique appliquée côté DDragon et côté patch note → matching fiable.
function normName(s: string): string {
  return s.normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // strip combining diacritical marks
    .replace(/[^a-z0-9\s]/gi, ' ') // tirets, apostrophes, ponctuation → espace
    .toLowerCase()
    .replace(/\s+/g, ' ') // espaces multiples
    .trim()
}

// Infère le slot de sort depuis le label d'un changement champion.
// "R — PV bonus" → "R", "Passif — bouclier" → "passive", "Dégâts base" → undefined
function inferSpell(label: string): 'Q' | 'W' | 'E' | 'R' | 'passive' | undefined {
  if (!label) return undefined
  const m = label.match(/^\s*([QWERqwer]|passif|passive)\s*[-–—\s]/i)
  if (!m) return undefined
  const s = m[1].toLowerCase()
  if (s === 'passif' || s === 'passive') return 'passive'
  return m[1].toUpperCase() as 'Q' | 'W' | 'E' | 'R'
}

// Normalise un type d'entrée produit par le modèle vers les 4 valeurs canoniques.
// "adj"/"neutral"/"new" → "ajustement", "rework" → "refonte"
function normalizeEntryType(t: unknown): string {
  if (typeof t !== 'string') return 'ajustement'
  switch (t.toLowerCase().trim()) {
    case 'buff':                 return 'buff'
    case 'nerf':                 return 'nerf'
    case 'refonte': case 'rework': return 'refonte'
    default:                     return 'ajustement'
  }
}

// Charge item.json DDragon (fr_FR) → Map normName → ddragon_id numérique.
// Permet d'attacher l'id aux items que Claude n'a pas renseignés.
// Version COMPLÈTE "X.Y.Z" requise — DDragon 404 sur "X.Y".
async function loadItemMap(fullVersion: string): Promise<Map<string, number>> {
  const cacheKey = `ddragon-items-v1-${fullVersion}`
  const DDN      = 'https://ddragon.leagueoflegends.com'
  const cached   = await cacheGet(cacheKey) as { name: string; id: number }[] | null

  let entries: { name: string; id: number }[]
  if (cached) {
    entries = cached
    console.log(`[loadItemMap] cache hit — ${entries.length} items (${fullVersion})`)
  } else {
    const url = `${DDN}/cdn/${fullVersion}/data/fr_FR/item.json`
    console.log(`[loadItemMap] fetch ${url}`)
    try {
      const res = await fetch(url)
      console.log(`[loadItemMap] status ${res.status}`)
      if (!res.ok) { console.error(`[loadItemMap] failed: ${res.status}`); return new Map() }
      // deno-lint-ignore no-explicit-any
      const data: any = await res.json()
      entries = []
      // deno-lint-ignore no-explicit-any
      for (const [rawId, item] of Object.entries(data.data as Record<string, any>)) {
        const id = parseInt(rawId, 10)
        if (!isNaN(id) && (item as { name?: string }).name) {
          entries.push({ name: (item as { name: string }).name, id })
        }
      }
      console.log(`[loadItemMap] ${entries.length} items chargés`)
      await cacheSet(cacheKey, FN, entries)
    } catch (err) {
      console.error(`[loadItemMap] erreur: ${err instanceof Error ? err.message : String(err)}`)
      return new Map()
    }
  }

  return new Map(entries.map(e => [normName(e.name), e.id]))
}

// Charge la liste canonique DDragon (fr_FR) → Map normName → iconUrl.
// IMPORTANT : doit recevoir la version COMPLÈTE "X.Y.Z" (ex. "15.10.1"), pas la
// version tronquée "X.Y" — DDragon retourne 404 sur les chemins sans révision.
// L'icône est attachée ici pour éviter tout re-matching côté frontend.
// Retourne une Map vide si le chargement échoue (fail-safe).
async function loadRuneMap(fullVersion: string): Promise<Map<string, string>> {
  const cacheKey = `ddragon-runes-v2-${fullVersion}`
  const DDN      = 'https://ddragon.leagueoflegends.com'
  const cached   = await cacheGet(cacheKey) as { name: string; icon: string }[] | null

  let entries: { name: string; icon: string }[]
  if (cached) {
    entries = cached
    console.log(`[loadRuneMap] cache hit — ${entries.length} runes (${fullVersion})`)
  } else {
    const url = `${DDN}/cdn/${fullVersion}/data/fr_FR/runesReforged.json`
    console.log(`[loadRuneMap] fetch ${url}`)
    try {
      const res = await fetch(url)
      console.log(`[loadRuneMap] status ${res.status}`)
      if (!res.ok) {
        console.error(`[loadRuneMap] fetch échoué: ${res.status} — Map vide`)
        return new Map()
      }
      // deno-lint-ignore no-explicit-any
      const trees: any[] = await res.json()
      entries = []
      for (const tree of trees) {
        for (const slot of (tree.slots ?? [])) {
          for (const rune of (slot.runes ?? [])) {
            if (rune.name && rune.icon) {
              entries.push({ name: rune.name as string, icon: rune.icon as string })
            }
          }
        }
      }
      console.log(`[loadRuneMap] ${entries.length} runes chargées — ex: ${entries.slice(0, 3).map(e => `"${e.name}"`).join(', ')}`)
      await cacheSet(cacheKey, FN, entries)
    } catch (err) {
      console.error(`[loadRuneMap] erreur fetch: ${err instanceof Error ? err.message : String(err)}`)
      return new Map()
    }
  }

  // iconUrl sans numéro de version : cdn/img/{icon} (format spécifique aux runes DDragon)
  const map = new Map(entries.map(e => [normName(e.name), `${DDN}/cdn/img/${e.icon}`]))
  console.log(`[loadRuneMap] Map construite: ${map.size} entrées — ex: ${[...map.entries()].slice(0, 2).map(([k]) => `"${k}"`).join(', ')}`)
  return map
}

// Post-traitement déterministe (un seul passage sur tout le JSON) :
//   1. Normalise les types ("adj"→"ajustement", "rework"→"refonte", etc.)
//   2. Infère les spells manquants depuis les labels des changements champions
//   3. Retire les runes de items[] ET systeme[], les déplace dans runes[] avec icon_url
//   4. Dédoublonne systeme[] contre champions/items/runes
//   5. Recalcule les counts
// deno-lint-ignore no-explicit-any
function postProcess(patchData: any, runeMap: Map<string, string>, itemMap: Map<string, number>): any {
  const VALID_SPELLS = new Set(['Q', 'W', 'E', 'R', 'passive'])

  // deno-lint-ignore no-explicit-any
  function fixChange(c: any, isChampion: boolean): any {
    if (!isChampion) return c
    const spell = VALID_SPELLS.has(c.spell) ? c.spell : inferSpell(c.label ?? '')
    if (!spell) { const { spell: _s, ...rest } = c; return rest }
    return { ...c, spell }
  }

  // deno-lint-ignore no-explicit-any
  function fixEntry(e: any, isChampion: boolean): any {
    return {
      ...e,
      type:    normalizeEntryType(e.type),
      // deno-lint-ignore no-explicit-any
      changes: (e.changes ?? []).map((c: any) => fixChange(c, isChampion)),
    }
  }

  // deno-lint-ignore no-explicit-any
  const isRune = (e: any) => runeMap.has(normName(e.name ?? ''))

  // ── 1. Séparer items[] : vrais items vs runes mal classées
  // deno-lint-ignore no-explicit-any
  const rawCleanItems      = runeMap.size ? patchData.items.filter((e: any) => !isRune(e)) : patchData.items
  // deno-lint-ignore no-explicit-any
  const misplacedFromItems = runeMap.size ? patchData.items.filter(isRune) : []

  // ── 1b. Enrichir les items sans ddragon_id depuis item.json DDragon
  // deno-lint-ignore no-explicit-any
  const cleanItems = itemMap.size ? rawCleanItems.map((e: any) => {
    if (e.ddragon_id != null) return e
    const id = itemMap.get(normName(e.name ?? ''))
    return id != null ? { ...e, ddragon_id: id } : e
  }) : rawCleanItems

  // ── 2. Séparer systeme[] : vrai systeme vs runes mal classées
  // deno-lint-ignore no-explicit-any
  const tmpSysteme           = runeMap.size ? patchData.systeme.filter((e: any) => !isRune(e)) : patchData.systeme
  // deno-lint-ignore no-explicit-any
  const misplacedFromSysteme = runeMap.size ? patchData.systeme.filter(isRune) : []

  const allMisplaced = [...misplacedFromItems, ...misplacedFromSysteme]
  if (allMisplaced.length) {
    console.log(`[patch-notes] reclassify: ${allMisplaced.length} rune(s) retirée(s) de items[]/systeme[]`)
  }

  // ── 3. Construire runes[] : runes déjà bien classées + déplacées, avec icon_url attachée
  // Diagnostic : log des 3 premiers matchs pour vérifier normalisation des deux côtés
  const sampleRunes = [...patchData.runes, ...allMisplaced].slice(0, 3)
  for (const r of sampleRunes) {
    const key  = normName(r.name ?? '')
    const icon = runeMap.get(key)
    console.log(`[postProcess] rune "${r.name}" → normName="${key}" → icon=${icon ? 'OK' : 'MISS (runeMap.size=' + runeMap.size + ')'}`)
  }

  // deno-lint-ignore no-explicit-any
  const allRunes = [...patchData.runes, ...allMisplaced].map((e: any) => ({
    ...e,
    // icon_url attachée depuis la Map DDragon — fallback null si non trouvé
    icon_url: runeMap.get(normName(e.name ?? '')) ?? e.icon_url ?? null,
  }))
  // deno-lint-ignore no-explicit-any
  const runes = allRunes.map((e: any) => fixEntry(e, false))

  // ── 4. Dédoublonnage systeme[] contre champions + items propres + runes
  const alreadySeen = new Set([
    // deno-lint-ignore no-explicit-any
    ...patchData.champions.map((e: any) => normName(e.name ?? '')),
    // deno-lint-ignore no-explicit-any
    ...cleanItems.map((e: any)           => normName(e.name ?? '')),
    // deno-lint-ignore no-explicit-any
    ...runes.map((e: any)                => normName(e.name ?? '')),
  ])
  // deno-lint-ignore no-explicit-any
  const dedupedSysteme = tmpSysteme.filter((e: any) => !alreadySeen.has(normName(e.name ?? '')))
  if (dedupedSysteme.length < tmpSysteme.length) {
    console.log(`[patch-notes] dedup: ${tmpSysteme.length - dedupedSysteme.length} doublon(s) retiré(s) de systeme[]`)
  }

  return {
    ...patchData,
    // deno-lint-ignore no-explicit-any
    champions: patchData.champions.map((e: any) => fixEntry(e, true)),
    // deno-lint-ignore no-explicit-any
    items:     cleanItems.map((e: any) => fixEntry(e, false)),
    runes,
    // deno-lint-ignore no-explicit-any
    systeme:   dedupedSysteme.map((e: any) => fixEntry(e, false)),
    counts: {
      champions: patchData.champions.length,
      items:     cleanItems.length,
      runes:     runes.length,
      systeme:   dedupedSysteme.length,
    },
  }
}

// Complète les descriptions manquantes dans toutes les sections via un appel Claude ciblé.
// deno-lint-ignore no-explicit-any
async function completeMissingDescriptions(anthropicKey: string, patchData: any): Promise<any> {
  const SECTIONS = ['champions', 'items', 'runes', 'systeme'] as const

  // deno-lint-ignore no-explicit-any
  const stubs: { section: typeof SECTIONS[number]; idx: number; name: string; type: string }[] = []
  for (const sec of SECTIONS) {
    // deno-lint-ignore no-explicit-any
    ;(patchData[sec] as any[]).forEach((e: any, i: number) => {
      if (!e.description) stubs.push({ section: sec, idx: i, name: e.name, type: e.type })
    })
  }

  if (!stubs.length) return patchData
  console.log(`[patch-notes] completing ${stubs.length} description(s) manquante(s)`)

  const raw = await callSection(
    anthropicKey,
    'Expert League of Legends. Pour chaque entrée fournie, écris une description courte (1-2 phrases FR) expliquant le contexte ou la raison du changement (quel problème Riot adresse, quel impact est attendu). Retourne UNIQUEMENT un tableau JSON valide : [{"name":"...","description":"..."}]',
    JSON.stringify(stubs.map(s => ({ name: s.name, type: s.type }))),
    2048,
  )

  if (!raw) return patchData

  const cleaned = raw.trim().replace(/^```json?\n?/, '').replace(/\n?```$/, '').trim()
  // deno-lint-ignore no-explicit-any
  let filled: { name: string; description: string }[] = []
  try {
    const parsed = JSON.parse(cleaned)
    filled = Array.isArray(parsed) ? parsed : []
  } catch {
    console.error('[patch-notes] completeMissingDescriptions parse error')
    return patchData
  }

  const descMap = new Map(filled.map(e => [e.name, e.description]))
  const result  = { ...patchData }
  for (const sec of SECTIONS) {
    // deno-lint-ignore no-explicit-any
    result[sec] = (patchData[sec] as any[]).map((e: any) => ({
      ...e,
      description: e.description || descMap.get(e.name) || '',
    }))
  }
  return result
}

// ── Règles communes injectées dans chaque section ──────────────────────────────
const COMMON_RULES =
  'RÈGLES : ' +
  'types valides uniquement : buff, nerf, ajustement, refonte. ' +
  'Capture CHAQUE entrée de ta section — ne résume pas, n\'omets rien. ' +
  'Reformule en français, ne copie pas Riot mot pour mot. ' +
  'N\'invente aucun changement absent de la source. ' +
  'before/after : strings, omis si le changement est qualitatif. ' +
  'description : OBLIGATOIRE pour chaque entrée — 1 à 2 phrases expliquant le contexte ou la raison du changement (quel problème Riot adresse, quel impact est attendu). Ne jamais omettre ce champ. ' +
  'SORTIE : objet JSON valide UNIQUEMENT, pas de backticks, pas d\'explication.'

const DDRAGON_KEYS =
  'ddragon_key exact — ex: MonkeyKing (Wukong), AurelionSol, TahmKench, JarvanIV, XinZhao, DrMundo, MissFortune, MasterYi, LeeSin, Chogath, KogMaw, NunuWillump, RekSai, KhaZix, VelKoz.'

const ITEM_IDS =
  'ddragon_id : ID numérique DDragon si connu — ex: 3078 Force de la Trinité, ' +
  '3110 Cœur gelé, 3153 Lame du roi déchu, 3031 Lame infinie, 3033 Rappel mortel, ' +
  '3046 Fantôme de la Danse, 3091 Esprit du Faucon, 3190 Locket de l\'Iron Solari, ' +
  '3006 Boots of Speed → Bottes de vitesse. Omis si inconnu.'

const RUNE_NAMES =
  'runes[].name : nom exact tel qu\'affiché en jeu fr_FR — ex: "Conquérant", ' +
  '"Foulée Légère", "Électrocuter", "Tempo Grandiose", "Emprise de l\'Ivraie", ' +
  '"Coup Mortel", "Précision Absolue", "Coup de Grâce".'

// ── Prompts par section ────────────────────────────────────────────────────────

const SYS_META =
  'Tu extrais le résumé général d\'un patch League of Legends pour Wyrm Forge. ' +
  'SORTIE : {"subtitle":"accroche poétique courte ≤10 mots",' +
  '"highlights":["fait marquant 1",... 4 à 6 faits ...]}. ' +
  COMMON_RULES

const SYS_CHAMPIONS =
  'Tu extrais CHAQUE champion modifié dans ce patch League of Legends. ' +
  'N\'oublie aucun champion, même pour un ajustement mineur. ' +
  'SORTIE : {"champions":[{"name":"Nom FR","ddragon_key":"Clé","type":"buff|nerf|ajustement|refonte",' +
  '"description":"raison/contexte OBLIGATOIRE","changes":[{"label":"stat","spell":"Q|W|E|R|passive","before":"X","after":"Y"}]}]}. ' +
  'spell : slot du sort concerné — "Q", "W", "E", "R" ou "passive". ' +
  'Exemples : "Q — dégâts" → spell:"Q", "Passif — bouclier" → spell:"passive", "E — portée" → spell:"E". ' +
  'Omis si le changement concerne les stats de base (PV, dégâts d\'attaque, armure, etc.). ' +
  DDRAGON_KEYS + ' ' + COMMON_RULES

const SYS_ITEMS =
  'Tu extrais CHAQUE item modifié dans ce patch League of Legends. ' +
  'N\'oublie aucun item. ' +
  'SORTIE : {"items":[{"name":"Nom FR exact","ddragon_id":N,"type":"buff|nerf|ajustement|refonte",' +
  '"description":"raison/contexte OBLIGATOIRE","changes":[{"label":"stat","before":"X","after":"Y"}]}]}. ' +
  ITEM_IDS + ' ' + COMMON_RULES

// Pas de séparation stricte dans le prompt : Claude fait de son mieux, le post-traitement
// déterministe (reclassifyRunes) corrige les erreurs de classification.
const SYS_RUNES_SYSTEME =
  'Tu extrais CHAQUE rune modifiée ET chaque changement système dans ce patch League of Legends. ' +
  'runes[] = runes nommées (Conquérant, Foulée Légère, Électrocuter, Tempo Grandiose, etc.). ' +
  'systeme[] = mécaniques de jeu, économie, carte, file classée, tourelles, etc. ' +
  'SORTIE : {"runes":[{"name":"Nom fr_FR exact","type":"buff|nerf|ajustement|refonte",' +
  '"description":"raison/contexte OBLIGATOIRE","changes":[{"label":"stat","before":"X","after":"Y"}]}],' +
  '"systeme":[{"name":"Nom FR","type":"buff|nerf|ajustement|refonte",' +
  '"description":"raison/contexte OBLIGATOIRE","changes":[{"label":"description","before":"X","after":"Y"}]}]}. ' +
  RUNE_NAMES + ' ' + COMMON_RULES

// ── Prompt unifié (fallback web_search) ───────────────────────────────────────

const SYS_UNIFIED =
  'Tu génères un résumé COMPLET et EXHAUSTIF de patch notes League of Legends pour Wyrm Forge. ' +
  'Capture CHAQUE champion, item, rune et changement système — n\'omets rien. ' +
  'SORTIE : objet JSON valide UNIQUEMENT — pas de backticks. Structure : ' +
  '{"subtitle":"accroche ≤10 mots","highlights":["..."],' +
  '"counts":{"champions":N,"items":N,"runes":N,"systeme":N},' +
  '"champions":[{"name":"...","ddragon_key":"...","type":"buff|nerf|ajustement|refonte",' +
    '"description":"raison OBLIGATOIRE","changes":[{"label":"...","before":"X","after":"Y"}]}],' +
  '"items":[{"name":"...","ddragon_id":N,"type":"...","description":"raison OBLIGATOIRE","changes":[...]}],' +
  '"runes":[{"name":"nom fr_FR exact","type":"...","description":"raison OBLIGATOIRE","changes":[...]}],' +
  '"systeme":[{"name":"...","type":"...","description":"raison OBLIGATOIRE","changes":[...]}]}. ' +
  DDRAGON_KEYS + ' ' + ITEM_IDS + ' ' + RUNE_NAMES + ' ' + COMMON_RULES

// ─────────────────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  const cors = handleCors(req)
  if (cors) return cors

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Méthode non autorisée.' }, 405)
  }

  try {
    // ── Auth double ──────────────────────────────────────────────────────────
    let authorized = false

    const user = await getUser(req)
    if (user) {
      const db = adminDb()
      const { data: adminRow } = await db
        .from('admin_users')
        .select('user_id')
        .eq('user_id', user.id)
        .maybeSingle()
      if (adminRow) authorized = true
    }

    if (!authorized) {
      const cronSecret = Deno.env.get('PATCH_CRON_SECRET')
      const tokenHeader = req.headers.get('X-Internal-Token')
      if (cronSecret && await secretsMatch(tokenHeader, cronSecret)) authorized = true
    }

    if (!authorized) {
      return jsonResponse({ error: 'Accès refusé.' }, 403)
    }

    // ── Détection version DDragon ────────────────────────────────────────────
    const versionsCacheKey = 'ddragon-versions'
    let versionsData = await cacheGet(versionsCacheKey) as string[] | null

    if (!versionsData) {
      const vRes = await fetch('https://ddragon.leagueoflegends.com/api/versions.json')
      if (!vRes.ok) {
        return jsonResponse({ error: 'Impossible de récupérer les versions DDragon.' }, 503)
      }
      versionsData = await vRes.json() as string[]
      await cacheSet(versionsCacheKey, FN, versionsData)
    }

    const latestRaw      = versionsData[0]
    const ddragonVersion = normalizePatchVersion(latestRaw)
    const version        = toPublicPatchVersion(ddragonVersion)

    // ── Dédup + chargement rune set + résolution URL (en parallèle) ──────────
    const db = adminDb()
    const [{ data: existing }, runeMap, itemMap, { url: sourceUrl }] = await Promise.all([
      db.from('patch_notes').select('id').eq('version', version).maybeSingle(),
      loadRuneMap(latestRaw),   // version COMPLÈTE "X.Y.Z" — DDragon 404 sur "X.Y"
      loadItemMap(latestRaw),   // même exigence de version complète
      resolveSourceUrl(version),
    ])

    if (existing) {
      return jsonResponse({ skipped: true, reason: 'already_generated', version })
    }

    console.log(`[patch-notes] runeMap size = ${runeMap.size}`)

    // ── Récupération du contenu ──────────────────────────────────────────────
    let rawSource  = ''

    const controller = new AbortController()
    const timeout    = setTimeout(() => controller.abort(), 30_000)

    try {
      // Tentative 1 : Jina AI Reader (rend le JS de la page Riot)
      const jinaUrl = `https://r.jina.ai/${sourceUrl}`
      const jinaRes = await fetch(jinaUrl, {
        headers: { 'Accept': 'text/plain', 'X-Return-Format': 'text' },
        signal:  controller.signal,
      })
      if (jinaRes.ok) {
        const text = await jinaRes.text()
        if (text.length > 500) rawSource = text
      }

      // Tentative 2 : fetch direct (fallback si Jina est down)
      if (!rawSource) {
        const pageRes = await fetch(sourceUrl, { signal: controller.signal })
        if (pageRes.ok) {
          const html = await pageRes.text()
          rawSource  = stripHtml(html)
        }
      }
    } catch {
      // Timeout ou réseau — rawSource reste vide → web_search
    } finally {
      clearTimeout(timeout)
    }

    console.log(`[patch-notes] rawSource length = ${rawSource.length} chars`)
    console.log(`[patch-notes] useWebSearch = ${rawSource.length < 500}`)

    // ── Appel Anthropic ──────────────────────────────────────────────────────
    const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY')
    if (!anthropicKey) {
      return jsonResponse({ error: 'Configuration serveur incomplète.' }, 500)
    }

    // deno-lint-ignore no-explicit-any
    let patchData: any

    if (rawSource.length < 500) {
      // ── Fallback : 1 appel unifié avec web_search ──────────────────────────
      const userMsg = `Recherche et génère le patch ${version} de League of Legends en JSON exhaustif selon les instructions.`
      const raw = await callSection(anthropicKey, SYS_UNIFIED, userMsg, 8192, [
        { type: 'web_search_20250305', name: 'web_search', max_uses: 8 },
      ])

      if (!raw) return jsonResponse({ error: 'Aucun contenu généré par le modèle.' }, 500)

      const cleaned = raw.trim().replace(/^```json?\n?/, '').replace(/\n?```$/, '').trim()
      try { patchData = JSON.parse(cleaned) }
      catch {
        console.error('JSON parse error (unified), raw:', cleaned.slice(0, 500))
        return jsonResponse({ error: 'Réponse JSON invalide.' }, 500)
      }

    } else {
      // ── Génération par sections (4 appels parallèles) ─────────────────────
      const src = rawSource.slice(0, 40_000)
      const userPrefix = `Voici les notes du patch ${version} de League of Legends :\n\n---\n${src}\n---\n\n`

      const [metaRaw, champRaw, itemRaw, runeRaw] = await Promise.all([
        callSection(anthropicKey, SYS_META,           userPrefix + 'Génère le résumé général (subtitle + highlights) selon les instructions.', 1024),
        callSection(anthropicKey, SYS_CHAMPIONS,      userPrefix + 'Génère la liste COMPLÈTE des champions modifiés selon les instructions.',   6144),
        callSection(anthropicKey, SYS_ITEMS,          userPrefix + 'Génère la liste COMPLÈTE des items modifiés selon les instructions.',       4096),
        callSection(anthropicKey, SYS_RUNES_SYSTEME,  userPrefix + 'Génère la liste COMPLÈTE des runes et changements système selon les instructions.', 4096),
      ])

      console.log(`[patch-notes] section lengths — meta:${metaRaw?.length ?? 0} champ:${champRaw?.length ?? 0} item:${itemRaw?.length ?? 0} rune:${runeRaw?.length ?? 0}`)

      const meta      = extractMeta(metaRaw)
      // deno-lint-ignore no-explicit-any
      const champions = extractArray<any>(champRaw, 'champions')
      // deno-lint-ignore no-explicit-any
      const items     = extractArray<any>(itemRaw,  'items')
      // deno-lint-ignore no-explicit-any
      const runes     = extractArray<any>(runeRaw,  'runes')
      // deno-lint-ignore no-explicit-any
      const systeme   = extractArray<any>(runeRaw,  'systeme')

      // Comptes recalculés depuis les longueurs réelles (plus fiable que Claude)
      patchData = {
        subtitle:   meta?.subtitle   ?? `Patch ${version}`,
        highlights: meta?.highlights ?? [],
        counts: {
          champions: champions.length,
          items:     items.length,
          runes:     runes.length,
          systeme:   systeme.length,
        },
        champions,
        items,
        runes,
        systeme,
      }
    }

    // ── Post-traitement ──────────────────────────────────────────────────────
    // 1. Types + spells + reclassification runes + enrichissement items (déterministe)
    patchData = postProcess(patchData, runeMap, itemMap)
    // 2. Complétion des descriptions absentes via un appel Claude ciblé
    patchData = await completeMissingDescriptions(anthropicKey, patchData)

    if (!validatePatchData(patchData)) {
      console.error('JSON validation failed:', JSON.stringify(patchData).slice(0, 500))
      return jsonResponse({ error: 'Structure JSON incomplète.' }, 500)
    }

    // ── Stockage en base ─────────────────────────────────────────────────────
    const title = `Forge du patch ${version}`

    const { data: inserted, error: insertError } = await db
      .from('patch_notes')
      .insert({
        version,
        title,
        summary_jsonb: patchData,
        raw_source:    rawSource,
        status:        'draft',
        source_url:    sourceUrl,
        model:         MODEL,
      })
      .select('id')
      .single()

    if (insertError) {
      if (insertError.code === '23505') {
        return jsonResponse({ skipped: true, reason: 'race_condition', version })
      }
      console.error('Insert error:', insertError)
      return jsonResponse({ error: 'Erreur lors de la sauvegarde.' }, 500)
    }

    return jsonResponse({
      created:    true,
      version,
      id:         inserted.id,
      champions:  patchData.champions.length,
      items:      patchData.items.length,
      runes:      patchData.runes.length,
      systeme:    patchData.systeme.length,
      rawLen:     rawSource.length,
    })

  } catch (e) {
    console.error('patch-notes-generator error:', e instanceof Error ? e.message : String(e))
    return jsonResponse({ error: 'Erreur interne du serveur.' }, 500)
  }
})
