import { describe, it, expect, vi } from 'vitest'
import {
  resolveFlags, readFlag, flagFallback, startFlagsRefresh,
  LAUNCH_FLAG_KEYS, REFRESH_INTERVAL_MS,
  type FlagRow, type RefreshScheduleDeps,
} from './feature-flags'

/**
 * Feature flags — résolution de la hiérarchie, politique de repli, câblage du
 * rafraîchissement.
 *
 * Toute la logique de `FeatureFlagsProvider` vit dans ce module précisément pour
 * être testable ici, en environnement `node`, sans jsdom ni testing-library — le
 * choix assumé de ce dépôt (cf. l'en-tête de `vitest.config.ts`). Le provider
 * n'est qu'une coquille React : il appelle `resolveFlags` sur la réponse, `readFlag`
 * dans `useFlag`, et `startFlagsRefresh` dans son `useEffect`.
 */

/** Fabrique de ligne, au format exact renvoyé par PostgREST (value en TEXT). */
function row(key: string, value: boolean, kind: 'launch' | 'kill', parent: string | null = null): FlagRow {
  return { key, value: value ? 'true' : 'false', kind, parent_key: parent }
}

describe('résolution de la hiérarchie parent_key', () => {
  it('un enfant actif sous un parent COUPÉ est effectivement coupé', () => {
    const resolved = resolveFlags([
      row('ecailles_enabled', false, 'launch'),
      row('shop_enabled',     true,  'launch', 'ecailles_enabled'),
    ])

    // C'est tout l'intérêt de la hiérarchie : couper les Écailles doit éteindre la
    // boutique sans qu'aucun appelant ait à connaître la relation.
    expect(resolved['shop_enabled']).toBe(false)
    expect(resolved['ecailles_enabled']).toBe(false)
  })

  it('un enfant actif sous un parent actif reste actif', () => {
    const resolved = resolveFlags([
      row('ecailles_enabled', true, 'launch'),
      row('shop_enabled',     true, 'launch', 'ecailles_enabled'),
    ])

    expect(resolved['shop_enabled']).toBe(true)
  })

  it('un enfant COUPÉ le reste, même sous un parent actif', () => {
    const resolved = resolveFlags([
      row('ecailles_enabled', true,  'launch'),
      row('quests_enabled',   false, 'launch', 'ecailles_enabled'),
    ])

    expect(resolved['quests_enabled']).toBe(false)
  })

  it('remonte toute la chaîne, pas seulement le parent direct', () => {
    // Chaîne à 3 niveaux : seul le grand-parent est coupé.
    const resolved = resolveFlags([
      row('grand_parent', false, 'kill'),
      row('parent',       true,  'kill', 'grand_parent'),
      row('enfant',       true,  'kill', 'parent'),
    ])

    expect(resolved['enfant']).toBe(false)
  })

  it('les 18 flags overlay tombent avec leur maître', () => {
    // Le cas réel du catalogue : `overlay_enabled` parent de 18 enfants tous actifs.
    const children = ['overlay_show_baron_timer', 'overlay_show_gold_diff', 'overlay_show_item_build']
    const resolved = resolveFlags([
      row('overlay_enabled', false, 'kill'),
      ...children.map(k => row(k, true, 'kill', 'overlay_enabled')),
    ])

    for (const key of children) expect(resolved[key], key).toBe(false)
  })

  it('un parent ABSENT de la réponse est ignoré, pas traité comme coupé', () => {
    // Peut arriver si la RLS ne renvoie pas le parent, ou si la clé a été
    // supprimée. Traiter l'absence comme `false` ferait disparaître l'enfant pour
    // une raison strictement invisible côté client.
    const resolved = resolveFlags([
      row('orphelin', true, 'kill', 'parent_inexistant'),
    ])

    expect(resolved['orphelin']).toBe(true)
  })

  it('un cycle ne fait pas boucler la résolution', () => {
    // Aucune contrainte SQL n'interdit un cycle à deux nœuds : la borne de
    // profondeur est le seul filet.
    const resolved = resolveFlags([
      row('a', true, 'kill', 'b'),
      row('b', true, 'kill', 'a'),
    ])

    expect(resolved['a']).toBe(true)
    expect(resolved['b']).toBe(true)
  })

  it('une réponse vide donne une map vide (et non un plantage)', () => {
    expect(resolveFlags([])).toEqual({})
  })
})

describe('politique de repli asymétrique', () => {
  // ── Pendant le chargement initial ET en cas d'erreur réseau, la map est vide :
  //    les deux situations passent donc exactement par ce chemin.
  const catalogueAbsent: Record<string, boolean> = {}

  it('un flag de LANCEMENT inconnu échoue FERMÉ', () => {
    for (const key of LAUNCH_FLAG_KEYS) {
      expect(readFlag(catalogueAbsent, key), key).toBe(false)
    }
  })

  it('un KILL SWITCH inconnu échoue OUVERT', () => {
    // Une panne réseau ne doit jamais vider le site de ses fonctionnalités livrées.
    for (const key of [
      'ads_enabled', 'player_search_enabled', 'patch_notes_enabled',
      'matchup_ai_enabled', 'workshop_builds_enabled', 'prac_enabled',
    ]) {
      expect(readFlag(catalogueAbsent, key), key).toBe(true)
    }
  })

  it('une clé totalement inconnue reste ouverte', () => {
    // Une clé qu'aucun bundle ne connaît ne peut être interrogée que par du code
    // qui embarque la feature correspondante — donc un kill switch.
    expect(readFlag(catalogueAbsent, 'flag_invente_plus_tard')).toBe(true)
  })

  it('une valeur CONNUE l\'emporte toujours sur le repli', () => {
    // Y compris quand elle contredit le repli, dans les deux sens.
    expect(readFlag({ ads_enabled: false }, 'ads_enabled')).toBe(false)
    expect(readFlag({ shop_enabled: true }, 'shop_enabled')).toBe(true)
  })

  it('la liste des flags fermés est celle du catalogue de lancement', () => {
    // ⚠️ Doit rester alignée sur les lignes kind='launch' des migrations de
    // catalogue (20260905000001, puis 20260908000002), et — pour les seules clés
    // `surface` 'shared'/'app' — sur `ColdStartClosed` de
    // `Services/FeatureFlagService.cs` (app WPF). Sans ce test, les listes
    // divergeraient en silence.
    //
    // `kit_sur_mesure_enabled` est `surface='web'` : il n'a PAS de pendant côté
    // WPF, et c'est correct — l'app n'embarque pas la feature, elle ne peut donc
    // pas la laisser fuir. Les cinq autres restent la liste partagée.
    expect([...LAUNCH_FLAG_KEYS].sort()).toEqual([
      'cosmetics_enabled', 'ecailles_enabled', 'kit_sur_mesure_enabled',
      'quests_enabled', 'scenarios_enabled', 'shop_enabled',
    ])
    expect(flagFallback('ecailles_enabled')).toBe(false)
    expect(flagFallback('overlay_enabled')).toBe(true)

    // Le point de ce flag : tant qu'il n'est pas lancé, un catalogue absent ou
    // une panne réseau ne doit PAS ouvrir un service payant.
    expect(flagFallback('kit_sur_mesure_enabled')).toBe(false)
  })
})

describe('routes publiques — décision prise côté serveur', () => {
  /**
   * `isPublicFlagEnabled` fait une I/O (fetch) et n'est donc pas testable ici,
   * mais toute sa DÉCISION est composée de deux fonctions pures déjà couvertes
   * plus haut : `resolveFlags` sur les lignes reçues, puis le repli de
   * `flagFallback` quand la clé manque. Ces cas rejouent cette composition sur
   * les réponses que PostgREST peut réellement renvoyer.
   *
   * ⚠️ Ce qu'on protège ici est un invariant BINAIRE : côté serveur, il n'existe
   * pas d'état « en cours de chargement ». Le rendu attend le `await`, donc le
   * HTML porte toujours une décision ferme — c'est exactement ce qui supprime à
   * la fois le flash de contenu et le trou de contenu au premier rendu.
   */
  const decideServerSide = (rows: FlagRow[], key: string): boolean => {
    const flags = rows.filter(r => r.kind === 'launch' || r.kind === 'kill')
    if (flags.length === 0) return flagFallback(key)
    const value = resolveFlags(flags)[key]
    return value === undefined ? flagFallback(key) : value
  }

  it('flag actif → le HTML porte le contenu', () => {
    expect(decideServerSide([row('player_search_enabled', true, 'kill')], 'player_search_enabled'))
      .toBe(true)
  })

  it('flag coupé → le HTML porte l\'encart, dès le premier octet', () => {
    expect(decideServerSide([row('player_search_enabled', false, 'kill')], 'player_search_enabled'))
      .toBe(false)
  })

  it('réponse vide ou base injoignable → fail-open sur un kill switch', () => {
    // Une panne de base ne doit pas fermer les pages publiques. Le fetch en
    // échec retombe sur ce même chemin.
    expect(decideServerSide([], 'player_search_enabled')).toBe(true)
  })

  it('les valeurs de tuning ne peuvent pas être prises pour un flag', () => {
    // Si la réponse ne contenait QUE des lignes kind='setting' (RLS élargie,
    // requête mal filtrée), la décision doit retomber sur le repli et non lire
    // un '12' comme un booléen.
    const rows = [{ key: 'cap_daily_scales', value: '12', kind: 'setting', parent_key: null } as FlagRow]
    expect(decideServerSide(rows, 'player_search_enabled')).toBe(true)
  })

  it('la hiérarchie s\'applique aussi côté serveur', () => {
    // Même code de résolution que le client : les deux chemins ne peuvent pas
    // diverger, c'est précisément pourquoi ils partagent ce module.
    const rows = [
      row('parent_coupe', false, 'kill'),
      row('player_search_enabled', true, 'kill', 'parent_coupe'),
    ]
    expect(decideServerSide(rows, 'player_search_enabled')).toBe(false)
  })

  it('aucun état intermédiaire n\'est représentable', () => {
    // L'invariant qui fait tout l'intérêt du passage au serveur : la décision est
    // un booléen, pas une machine à trois états. Il n'y a donc rien qui puisse
    // s'afficher puis disparaître.
    for (const rows of [
      [row('player_search_enabled', true, 'kill')],
      [row('player_search_enabled', false, 'kill')],
      [] as FlagRow[],
    ]) {
      expect(typeof decideServerSide(rows, 'player_search_enabled')).toBe('boolean')
    }
  })
})

describe('câblage du rafraîchissement', () => {
  /**
   * Fausses dépendances — c'est ce qui permet de tester le câblage sans DOM.
   * `fire()` rejoue l'événement comme le ferait le navigateur.
   */
  function harness(hidden = false) {
    const listeners = new Map<string, () => void>()
    let intervalHandler: (() => void) | null = null
    let intervalMs = 0
    let cleared = 0
    const onRefresh = vi.fn()

    const deps: RefreshScheduleDeps = {
      onRefresh,
      addEventListener: (type, handler) => listeners.set(type, handler),
      removeEventListener: type => listeners.delete(type),
      setInterval: (handler, ms) => { intervalHandler = handler; intervalMs = ms; return 'timer-id' },
      clearInterval: () => { cleared++ },
      isHidden: () => hidden,
    }

    return {
      deps, onRefresh, listeners,
      fire: (type: string) => listeners.get(type)?.(),
      tick: () => intervalHandler?.(),
      get intervalMs() { return intervalMs },
      get cleared() { return cleared },
    }
  }

  it('un retour sur l\'onglet déclenche un rafraîchissement', () => {
    const h = harness(false)          // onglet VISIBLE
    startFlagsRefresh(h.deps)

    expect(h.onRefresh).not.toHaveBeenCalled()
    h.fire('visibilitychange')
    expect(h.onRefresh).toHaveBeenCalledTimes(1)
  })

  it('QUITTER l\'onglet ne déclenche rien', () => {
    // `visibilitychange` se lève dans les deux sens. Sans le test sur `isHidden`,
    // chaque aller-retour coûterait DEUX requêtes au lieu d'une, dont une pour un
    // onglet que personne ne regarde.
    const h = harness(true)           // onglet CACHÉ
    startFlagsRefresh(h.deps)

    h.fire('visibilitychange')
    expect(h.onRefresh).not.toHaveBeenCalled()
  })

  it('le poll de fond tourne à 60 s', () => {
    const h = harness()
    startFlagsRefresh(h.deps)

    expect(h.intervalMs).toBe(REFRESH_INTERVAL_MS)
    expect(REFRESH_INTERVAL_MS).toBe(60_000)

    h.tick()
    expect(h.onRefresh).toHaveBeenCalledTimes(1)
  })

  it('le nettoyage retire l\'écouteur ET l\'intervalle', () => {
    // Sans cela, un useEffect empilerait un timer par montage — le double montage
    // du mode strict de React suffit déjà à en laisser un orphelin.
    const h = harness()
    const stop = startFlagsRefresh(h.deps)

    expect(h.listeners.size).toBe(1)
    stop()

    expect(h.listeners.size).toBe(0)
    expect(h.cleared).toBe(1)

    h.fire('visibilitychange')
    expect(h.onRefresh).not.toHaveBeenCalled()
  })
})

describe('migration des lectures directes — comportement préservé', () => {
  /**
   * `EcaillesTab` lisait `shop_enabled` / `quests_enabled` par une requête
   * `app_settings` au montage, et recevait `ecaillesEnabled` en prop depuis la
   * session. Les trois passent par `useFlag`. Ces cas rejouent, sur la map
   * résolue, EXACTEMENT les décisions que l'onglet prend.
   */
  const decideEcaillesScreen = (flags: Record<string, boolean>, isAdmin: boolean) =>
    !isAdmin && !readFlag(flags, 'ecailles_enabled') ? 'bientôt' : 'forge'

  it('non-admin, Écailles coupées → écran « bientôt »', () => {
    const flags = resolveFlags([row('ecailles_enabled', false, 'launch')])
    expect(decideEcaillesScreen(flags, false)).toBe('bientôt')
  })

  it('ADMIN, Écailles coupées → la Forge quand même (recette avant lancement)', () => {
    const flags = resolveFlags([row('ecailles_enabled', false, 'launch')])
    expect(decideEcaillesScreen(flags, true)).toBe('forge')
  })

  it('non-admin, Écailles ouvertes → la Forge', () => {
    const flags = resolveFlags([row('ecailles_enabled', true, 'launch')])
    expect(decideEcaillesScreen(flags, false)).toBe('forge')
  })

  it('pendant le chargement, un non-admin ne voit PAS la Forge', () => {
    // Le repli fail-closed des flags de lancement couvre la fenêtre de chargement :
    // même si l'onglet ne gardait pas son `isLoading`, rien ne fuiterait.
    expect(decideEcaillesScreen({}, false)).toBe('bientôt')
  })

  it('couper les Écailles éteint boutique ET quêtes, sans les toucher', () => {
    // La bascule que faisait EcaillesTab à la main — il ne lisait QUE shop/quests
    // et n'aurait pas vu la coupure du parent. La hiérarchie s'en charge désormais.
    const flags = resolveFlags([
      row('ecailles_enabled', false, 'launch'),
      row('shop_enabled',     true,  'launch', 'ecailles_enabled'),
      row('quests_enabled',   true,  'launch', 'ecailles_enabled'),
    ])

    expect(readFlag(flags, 'shop_enabled')).toBe(false)
    expect(readFlag(flags, 'quests_enabled')).toBe(false)
  })
})
