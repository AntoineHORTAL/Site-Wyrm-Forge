import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * CONFORMITÉ des kill switches dans les Edge Functions.
 *
 * ⚠️ POURQUOI UN TEST STATIQUE ET NON UN TEST DE COMPORTEMENT.
 * Ces fonctions tournent sous DENO : elles appellent `Deno.serve` au chargement du
 * module et importent depuis `https://esm.sh/…`. Les exécuter avec des mocks
 * demanderait soit un runtime Deno (absent de ce dépôt et de la CI), soit
 * d'extraire les 11 handlers hors de `Deno.serve` pour les rendre appelables —
 * une refonte de code de production bien plus risquée que ce qu'elle couvrirait.
 *
 * Ce fichier vérifie donc l'INVARIANT plutôt que l'exécution, et il le fait sur
 * la seule chose qui compte vraiment ici : **aucune opération coûteuse ne peut
 * précéder la garde**. C'est précisément la régression réaliste — quelqu'un qui
 * ajoute un appel Riot au-dessus du flag, ou qui déplace la garde sous l'auth.
 * Un test de comportement avec mocks ne l'attraperait pas mieux.
 *
 * Il verrouille aussi l'INVENTAIRE : toute nouvelle fonction appelant Riot ou
 * Claude doit être déclarée ici, gardée ou explicitement exemptée. C'est ce qui
 * empêche qu'une feature coûteuse arrive un jour sans kill switch, en silence.
 */

const FUNCTIONS_DIR = dirname(fileURLToPath(import.meta.url))

/** Fonctions gardées, avec le flag attendu. Doit refléter le catalogue app_settings. */
const GUARDED: Record<string, string> = {
  // Posées avant ce chantier
  'shop-purchase':     'shop_enabled',
  'quest-claim':       'quests_enabled',
  'riot-live-game':    'live_game_enabled',
  // Étape 5
  'riot-matches':      'riot_history_enabled',
  'riot-match-detail': 'riot_history_enabled',
  'riot-rank':         'riot_history_enabled',
  'matchup-analyze':   'matchup_ai_enabled',
  'postgame-analyze':  'postgame_ai_enabled',
  'patch-notes':       'patch_notes_enabled',
  'riot-link-init':    'riot_link_enabled',
  'riot-link-verify':  'riot_link_enabled',
}

/**
 * Fonctions qui touchent Riot ou Claude SANS kill switch, et pourquoi.
 *
 * ⚠️ Cette liste n'est pas une permission générale : c'est une dette assumée,
 * nommée, et signalée à HORTAL. Aucun flag n'a été inventé pour elles — le
 * catalogue de la migration 20260905000001 n'en prévoit pas, et en ajouter un
 * relève de l'étape 1, pas d'ici.
 */
const KNOWN_UNGUARDED: Record<string, string> = {
  'riot-rotation':
    "Rotation gratuite des champions. Appelle Riot, publique (verify_jwt=false), " +
    "consommée par l'accueil du site ET de l'app WPF. Aucun flag au catalogue.",
  'patch-notes-generator':
    "Génération des patch notes par Claude. Réservée aux admins / au cron interne. " +
    "Son comportement est réglé par `patch_auto_publish`, qui n'est PAS un kill switch.",
}

/** Marqueurs d'une opération coûteuse : appel réseau sortant ou écriture en base. */
const COSTLY = /fetch\(|\.rpc\(|\.insert\(|\.upsert\(|\.update\(|\.delete\(/

function source(fn: string): string {
  return readFileSync(join(FUNCTIONS_DIR, fn, 'index.ts'), 'utf8')
}

/** Numéro (1-based) de la première ligne de code — hors commentaire — qui matche. */
function firstCodeLine(src: string, re: RegExp, after = 0): number | null {
  const lines = src.split(/\r?\n/)
  for (let i = after; i < lines.length; i++) {
    const t = lines[i].trim()
    if (t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')) continue
    if (re.test(lines[i])) return i + 1
  }
  return null
}

describe('kill switches des Edge Functions — inventaire', () => {
  it('chaque fonction gardée existe et importe l\'utilitaire partagé', () => {
    for (const fn of Object.keys(GUARDED)) {
      expect(existsSync(join(FUNCTIONS_DIR, fn, 'index.ts')), fn).toBe(true)
      // L'utilitaire est unique et fail-closed : personne ne réimplémente sa
      // propre lecture de flag dans une fonction.
      expect(source(fn), fn).toContain("from '../_shared/feature-flags.ts'")
    }
  })

  it('AUCUNE fonction appelant Riot ou Claude n\'échappe à l\'inventaire', () => {
    // ⚠️ Le test qui rend l'inventaire auto-entretenu. Une nouvelle Edge Function
    // qui tape Riot ou Anthropic échoue ici tant qu'elle n'est pas soit gardée,
    // soit exemptée explicitement — elle ne peut pas passer inaperçue.
    const external = readdirSync(FUNCTIONS_DIR, { withFileTypes: true })
      .filter(d => d.isDirectory() && d.name !== '_shared')
      .filter(d => existsSync(join(FUNCTIONS_DIR, d.name, 'index.ts')))
      .filter(d => /api\.riotgames\.com|api\.anthropic\.com/.test(source(d.name)))
      .map(d => d.name)
      .sort()

    const accounted = [...Object.keys(GUARDED), ...Object.keys(KNOWN_UNGUARDED)]
    const orphans = external.filter(fn => !accounted.includes(fn))

    expect(orphans, `Edge Function(s) touchant Riot/Claude sans flag ni exemption : ${orphans.join(', ')}`)
      .toEqual([])
  })

  it('documente pourquoi les fonctions non gardées ne le sont pas', () => {
    // Une exemption sans motif écrit est une dette qu'on oublie.
    for (const [fn, why] of Object.entries(KNOWN_UNGUARDED)) {
      expect(existsSync(join(FUNCTIONS_DIR, fn, 'index.ts')), fn).toBe(true)
      expect(why.length, fn).toBeGreaterThan(40)
    }
  })
})

describe('kill switches des Edge Functions — placement de la garde', () => {
  it('chaque fonction vérifie EXACTEMENT le flag attendu du catalogue', () => {
    for (const [fn, key] of Object.entries(GUARDED)) {
      expect(source(fn), fn).toContain(`isFeatureEnabled('${key}')`)
    }
  })

  it('la garde précède TOUTE opération coûteuse du handler', () => {
    // ⚠️ L'invariant central. Vérifier le flag après un appel Riot ou une
    // écriture, c'est payer le coût qu'on prétend couper : la coupure ne
    // protégerait plus ni le quota Riot, ni la facture Anthropic.
    for (const fn of Object.keys(GUARDED)) {
      const src = source(fn)
      const serve = firstCodeLine(src, /Deno\.serve/)
      expect(serve, `${fn} : Deno.serve introuvable`).not.toBeNull()

      const guard = firstCodeLine(src, /isFeatureEnabled\(/, serve!)
      expect(guard, `${fn} : garde absente du handler`).not.toBeNull()

      const costly = firstCodeLine(src, COSTLY, serve!)
      if (costly !== null) {
        expect(guard!, `${fn} : opération coûteuse ligne ${costly}, AVANT la garde ligne ${guard}`)
          .toBeLessThan(costly)
      }
    }
  })

  it('répond 403 avec le format d\'erreur commun', () => {
    // Même contrat que riot-live-game, le premier à l'avoir posé : les clients
    // (site ET app WPF) lisent `error` et distinguent la coupure d'une panne.
    for (const fn of Object.keys(GUARDED)) {
      const src = source(fn)
      const i = src.indexOf('isFeatureEnabled(')
      const after = src.slice(i, i + 400)

      expect(after, `${fn} : pas de réponse 403 après la garde`).toMatch(/jsonResponse\(\s*\{\s*error:/)
      expect(after, `${fn} : statut attendu 403`).toContain('403')
    }
  })
})

describe('cas particuliers des deux fonctions IA', () => {
  // Le solde de « Chaleur de la Forge » est PARTAGÉ par les deux fonctions
  // (`consume_ai_credits` sur `usage_counters`). Leur GET est une lecture pure
  // de ce solde, sans appel Claude et sans écriture.
  for (const fn of ['matchup-analyze', 'postgame-analyze']) {
    it(`${fn} ne coupe que le POST, pas la lecture du solde partagé`, () => {
      // Couper le GET aveuglerait l'utilisateur sur des braises qu'il peut
      // toujours dépenser dans l'AUTRE feature — une coupure qui déborde sur ce
      // qu'elle n'était pas censée toucher.
      const src = source(fn)
      expect(src).toMatch(/req\.method === 'POST' && !await isFeatureEnabled\(/)
    })
  }

  it('matchup-analyze est le seul « degraded » et le dit', () => {
    expect(source('matchup-analyze')).toContain('degraded')
  })
})
