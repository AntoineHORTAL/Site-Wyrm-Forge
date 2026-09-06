import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { isValidElement, type ReactElement, type ReactNode } from 'react'
import SubViewTabs, { type SubViewDef } from './SubViewTabs'

/**
 * RENDU et CÂBLAGE de la barre de sous-onglets partagée.
 *
 * Rendu en HTML statique via `react-dom/server` — ni jsdom ni testing-library,
 * comme `SettingToggle.test.tsx` et `LiveComposition.test.tsx`.
 *
 * `renderToStaticMarkup` perd les gestionnaires d'événements : il ne peut donc
 * rien dire du clic. Pour cette partie, les composants de ce lot sont écrits
 * SANS hook, ce qui permet de les appeler comme de simples fonctions et de
 * parcourir l'arbre d'éléments retourné pour déclencher le `onClick` réel —
 * sans ajouter de dépendance de test au projet.
 */

/**
 * Exécute un composant SANS hook pour obtenir son arbre d'éléments.
 * `<SubViewTabs …/>` n'est qu'une description : tant que la fonction n'est pas
 * appelée, aucun `onClick` n'existe encore.
 */
function render(el: ReactElement): ReactNode {
  const run = el.type as (props: unknown) => ReactNode
  return run(el.props)
}

/** Collecte les éléments porteurs d'un `onClick` dans l'arbre rendu. */
function clickables(node: ReactNode, out: ReactElement[] = []): ReactElement[] {
  if (Array.isArray(node)) { node.forEach(n => clickables(n, out)); return out }
  if (!isValidElement(node)) return out
  const props = node.props as { onClick?: unknown; children?: ReactNode }
  if (typeof props.onClick === 'function') out.push(node)
  clickables(props.children, out)
  return out
}

/** Déclenche le clic du i-ème élément cliquable de l'arbre. */
function click(tree: ReactNode, index: number) {
  const found = clickables(tree)
  const el = found[index]
  if (!el) throw new Error(`aucun élément cliquable à l'index ${index} (${found.length} trouvés)`)
  ;(el.props as { onClick: () => void }).onClick()
}

type Id = 'a' | 'b' | 'c'

const VIEWS: SubViewDef<Id>[] = [
  { id: 'a', label: 'Alpha' },
  { id: 'b', label: 'Bravo' },
  { id: 'c', label: 'Charlie' },
]

function bar(active: Id, views: SubViewDef<Id>[] = VIEWS, onSelect: (id: Id) => void = () => {}) {
  return (
    <SubViewTabs
      views={views}
      active={active}
      onSelect={onSelect}
      accent="#EF9F27"
      activeBg="rgba(186,117,23,0.2)"
      border="#27272A"
      ariaLabel="Sections de test"
    />
  )
}

describe('rendu de la barre', () => {
  it('affiche tous les libellés', () => {
    const html = renderToStaticMarkup(bar('a'))

    expect(html).toContain('Alpha')
    expect(html).toContain('Bravo')
    expect(html).toContain('Charlie')
  })

  it('marque une seule pastille active', () => {
    const html = renderToStaticMarkup(bar('b'))

    expect(html.match(/aria-selected="true"/g)).toHaveLength(1)
    expect(html.match(/aria-selected="false"/g)).toHaveLength(2)
  })

  it('porte l\'accent et le fond sur la pastille active uniquement', () => {
    const html = renderToStaticMarkup(bar('a'))

    expect(html).toContain('rgba(186,117,23,0.2)')      // fond actif
    expect(html).toContain('#EF9F27')                    // libellé actif
    expect(html.match(/rgba\(186,117,23,0\.2\)/g)).toHaveLength(1)
  })

  it('conserve le rendu extrait d\'EcaillesTab', () => {
    // Extraction, pas restyle : ces valeurs viennent telles quelles de la barre
    // inline d'origine. Les changer serait un changement visuel, pas un refactor.
    const html = renderToStaticMarkup(bar('a'))

    expect(html).toContain('background:rgba(255,255,255,0.03)')
    expect(html).toContain('border-radius:10px')
    expect(html).toContain('min-width:110px')
  })

  it('expose le groupe et les onglets aux lecteurs d\'écran', () => {
    const html = renderToStaticMarkup(bar('a'))

    expect(html).toContain('role="tablist"')
    expect(html).toContain('aria-label="Sections de test"')
    expect(html.match(/role="tab"/g)).toHaveLength(3)
  })

  it('rend des boutons de type button', () => {
    // Sans `type`, un bouton dans un futur <form> soumettrait la page.
    const html = renderToStaticMarkup(bar('a'))

    expect(html.match(/type="button"/g)).toHaveLength(3)
  })
})

describe('compteur d\'alerte', () => {
  it('affiche le nombre quand il est positif', () => {
    const html = renderToStaticMarkup(bar('a', [
      { id: 'a', label: 'Alpha' },
      { id: 'b', label: 'Bravo', badge: 3 },
      { id: 'c', label: 'Charlie' },
    ]))

    expect(html).toContain('>3<')
    expect(html).toContain('#E24B4A')     // rouge d'alarme, comme les kill switches
  })

  it('n\'affiche RIEN à zéro', () => {
    // « 0 coupure » se dit en ne peignant pas de pastille — un badge à 0 ferait
    // croire à un incident.
    const html = renderToStaticMarkup(bar('a', [
      { id: 'a', label: 'Alpha' },
      { id: 'b', label: 'Bravo', badge: 0 },
      { id: 'c', label: 'Charlie' },
    ]))

    expect(html).not.toContain('#E24B4A')
    expect(html).not.toContain('>0<')
  })

  it('n\'affiche rien quand le badge est absent ou null', () => {
    const html = renderToStaticMarkup(bar('a', [
      { id: 'a', label: 'Alpha' },
      { id: 'b', label: 'Bravo', badge: null },
      { id: 'c', label: 'Charlie' },
    ]))

    expect(html).not.toContain('#E24B4A')
  })
})

describe('sélection', () => {
  it('remonte l\'identifiant de la pastille cliquée', () => {
    const onSelect = vi.fn()
    click(render(bar('a', VIEWS, onSelect)), 1)

    expect(onSelect).toHaveBeenCalledExactlyOnceWith('b')
  })

  it('remonte aussi un clic sur la pastille déjà active', () => {
    // Aucune garde « déjà actif » : le parent décide, la barre ne filtre pas.
    const onSelect = vi.fn()
    click(render(bar('a', VIEWS, onSelect)), 0)

    expect(onSelect).toHaveBeenCalledExactlyOnceWith('a')
  })

  it('câble une pastille par vue', () => {
    expect(clickables(render(bar('a')))).toHaveLength(3)
  })
})
