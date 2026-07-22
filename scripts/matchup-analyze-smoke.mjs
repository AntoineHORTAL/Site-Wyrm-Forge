// ════════════════════════════════════════════════════════════════════════════
//  Smoke test RÉEL (non mocké) de l'Edge Function matchup-analyze — Lot 3
// ════════════════════════════════════════════════════════════════════════════
// Appelle l'EF déployée avec un vrai JWT utilisateur pour vérifier :
//   1. le format envoyé par le web (buildScenarioPayload) est ACCEPTÉ (200),
//   2. le quota DÉCOMPTE (used +1 / remaining -1 après un POST),
//   3. le BLOCAGE propre à 0 (429 over_quota, puis appels suivants bloqués).
//
// ⚠️ Chaque POST consomme une unité de quota et déclenche un appel Anthropic
//    payant côté serveur. L'exhaustion (étape 3) n'est lancée que si le quota
//    restant est petit (<= EXHAUST_MAX) ou si MATCHUP_TEST_EXHAUST=1, pour ne
//    pas brûler 100 appels Sonnet sur un compte Maître/admin.
//
// Auth (au choix) :
//   MATCHUP_TEST_TOKEN=<access_token>            (le plus simple)
//   — ou —
//   MATCHUP_TEST_EMAIL=... MATCHUP_TEST_PASSWORD=...  (sign-in via supabase-js)
//
// Usage :
//   node scripts/matchup-analyze-smoke.mjs
//   MATCHUP_TEST_EXHAUST=1 node scripts/matchup-analyze-smoke.mjs
// ════════════════════════════════════════════════════════════════════════════
import { readFileSync } from 'node:fs'

const EXHAUST_MAX = Number(process.env.MATCHUP_TEST_EXHAUST_MAX ?? 8)

// ── Lecture de .env.local (URL + anon) sans dépendance ────────────────────────
function loadEnv() {
  const env = { ...process.env }
  try {
    for (const line of readFileSync(new URL('../.env.local', import.meta.url), 'utf8').split('\n')) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
      if (m && !env[m[1]]) env[m[1]] = m[2].trim()
    }
  } catch { /* pas de .env.local → on s'appuie sur process.env */ }
  return env
}

const env = loadEnv()
const URL_BASE = env.NEXT_PUBLIC_SUPABASE_URL
const ANON     = env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const FN_URL   = `${URL_BASE}/functions/v1/matchup-analyze`

if (!URL_BASE || !ANON) {
  console.error('❌ NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY introuvables.')
  process.exit(2)
}

// ── Résolution du token utilisateur ───────────────────────────────────────────
async function resolveToken() {
  if (env.MATCHUP_TEST_TOKEN) return env.MATCHUP_TEST_TOKEN
  if (env.MATCHUP_TEST_EMAIL && env.MATCHUP_TEST_PASSWORD) {
    const { createClient } = await import('@supabase/supabase-js')
    const supa = createClient(URL_BASE, ANON)
    const { data, error } = await supa.auth.signInWithPassword({
      email: env.MATCHUP_TEST_EMAIL, password: env.MATCHUP_TEST_PASSWORD,
    })
    if (error || !data.session) { console.error('❌ Sign-in échoué:', error?.message); process.exit(2) }
    return data.session.access_token
  }
  console.error('❌ Fournis MATCHUP_TEST_TOKEN, ou MATCHUP_TEST_EMAIL + MATCHUP_TEST_PASSWORD.')
  process.exit(2)
}

// ── Scénario de test : format identique à buildScenarioPayload (web) ──────────
const SCENARIO = {
  mode: '1v1',
  allies: [{
    name: 'Ahri', level: 6,
    stats: [
      { label: 'hp', value: '1052.0' }, { label: 'armor', value: '39.0' },
      { label: 'attackdamage', value: '68.0' }, { label: 'spellblock', value: '30.0' },
    ],
    build: ['Coiffe de Rabadon', "Bâton du néant"],
  }],
  enemies: [{
    name: 'Zed', level: 6,
    stats: [
      { label: 'hp', value: '1150.0' }, { label: 'armor', value: '45.0' },
      { label: 'attackdamage', value: '80.0' },
    ],
    build: ['Duskblade', 'Edge of Night'],
  }],
}

// Même scénario mais AVEC un rôle par champion (Lot 1 — contrat EF étendu).
// Sert à vérifier que l'EF accepte le champ `role` et ne dégrade pas.
const SCENARIO_WITH_ROLE = {
  ...SCENARIO,
  allies:  SCENARIO.allies.map(c => ({ ...c, role: 'TOP' })),
  enemies: SCENARIO.enemies.map(c => ({ ...c, role: 'TOP' })),
}

function req(method, body) {
  return fetch(FN_URL, {
    method,
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${TOKEN}`, 'apikey': ANON },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
}

let TOKEN
let failures = 0
const check = (ok, label) => { console.log(`${ok ? '✅' : '❌'} ${label}`); if (!ok) failures++ }

async function main() {
  TOKEN = await resolveToken()
  console.log(`→ EF : ${FN_URL}\n`)

  // 1) GET quota initial
  const g = await req('GET')
  const gq = await g.json().catch(() => null)
  check(g.status === 200 && gq, `GET quota → 200 (${gq?.used}/${gq?.limit}, restant ${gq?.remaining}, ${gq?.model})`)
  if (g.status !== 200 || !gq) return end()

  if (gq.remaining <= 0) {
    console.log('\nℹ️ Quota déjà à 0 — vérification directe du blocage.')
    const p = await req('POST', { advanced: false, scenario: SCENARIO })
    const pj = await p.json().catch(() => null)
    check(p.status === 429 && pj?.over_quota === true && pj?.remaining === 0, `POST à 0 → 429 over_quota (blocage propre)`)
    return end()
  }

  // 2) POST rapide → 200 + décompte
  const usedBefore = gq.used
  const p1 = await req('POST', { advanced: false, scenario: SCENARIO })
  const j1 = await p1.json().catch(() => null)
  check(p1.status === 200, `POST rapide → 200 (format accepté)`)
  check(typeof j1?.analysis === 'string' && j1.analysis.trim().length > 0, `analyse non vide reçue (${j1?.analysis?.length ?? 0} car.)`)
  check(j1?.used === usedBefore + 1, `quota décompte : used ${usedBefore} → ${j1?.used}`)
  check(typeof j1?.truncated === 'boolean', `champ truncated présent (${j1?.truncated})`)
  if (p1.status === 200 && j1?.analysis) console.log(`\n--- extrait analyse (SANS rôle) ---\n${j1.analysis.slice(0, 200)}…\n-----------------------\n`)

  // 2b) POST AVEC rôle → doit être accepté (200) au même titre que sans rôle.
  //     (Lot 1 : extension du contrat. Rétrocompat = 2) sans rôle passe déjà.)
  if ((j1?.remaining ?? 0) > 0) {
    const p2 = await req('POST', { advanced: false, scenario: SCENARIO_WITH_ROLE })
    const j2 = await p2.json().catch(() => null)
    check(p2.status === 200, `POST AVEC rôle (role=TOP) → 200 (nouveau champ accepté)`)
    check(typeof j2?.analysis === 'string' && j2.analysis.trim().length > 0, `analyse non vide reçue (avec rôle)`)
    if (p2.status === 200 && j2?.analysis) console.log(`\n--- extrait analyse (AVEC rôle TOP) ---\n${j2.analysis.slice(0, 200)}…\n-----------------------\n`)
  } else {
    console.log('ℹ️ Plus de quota pour le cas AVEC rôle — relance sur un compte au quota disponible.')
  }

  // 3) Blocage à 0 — seulement si peu d'unités restantes (coût) ou EXHAUST=1
  const remaining = j1?.remaining ?? 0
  const doExhaust = env.MATCHUP_TEST_EXHAUST === '1' || remaining <= EXHAUST_MAX
  if (!doExhaust) {
    console.log(`ℹ️ Exhaustion NON lancée (${remaining} unités restantes > ${EXHAUST_MAX}). ` +
                `Relance avec MATCHUP_TEST_EXHAUST=1 pour vérifier le 429, de préférence sur un compte bas tier.`)
    return end()
  }

  console.log(`→ Exhaustion du quota (${remaining} restant)…`)
  let last = null
  for (let i = 0; i < remaining + 1; i++) {
    const r = await req('POST', { advanced: false, scenario: SCENARIO })
    last = { status: r.status, body: await r.json().catch(() => null) }
    if (r.status === 429) break
    check(r.status === 200, `  analyse ${i + 1} → 200 (restant ${last.body?.remaining})`)
  }
  check(last?.status === 429 && last.body?.over_quota === true && last.body?.remaining === 0,
        `plafond atteint → 429 over_quota, remaining 0`)

  // Un appel de plus doit rester bloqué (429), sans nouvel appel Anthropic
  const blocked = await req('POST', { advanced: false, scenario: SCENARIO })
  const bj = await blocked.json().catch(() => null)
  check(blocked.status === 429 && bj?.over_quota === true, `appel suivant reste bloqué → 429 (blocage propre à 0)`)

  end()
}

function end() {
  console.log(`\n${failures === 0 ? '✅ SMOKE OK' : `❌ ${failures} échec(s)`}`)
  process.exit(failures === 0 ? 0 : 1)
}

main().catch(e => { console.error('❌ Exception:', e); process.exit(1) })
