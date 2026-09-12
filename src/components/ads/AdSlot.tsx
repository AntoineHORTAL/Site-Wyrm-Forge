'use client'

/**
 * Emplacement publicitaire générique — AUCUNE régie câblée.
 *
 * Ce composant ne connaît ni AdSense, ni The Moneytizer, ni aucun fournisseur :
 * il ne fait que deux choses, et c'est voulu.
 *
 *   1. RÉSERVER l'espace, aux dimensions exactes du format, dès le premier
 *      rendu et même si aucun script ne se charge jamais. C'est ce qui évite le
 *      CLS (Cumulative Layout Shift) : le contenu du dashboard ne bouge pas
 *      quand la pub apparaît, parce que la place était déjà prise.
 *
 *   2. GARDER le chargement derrière `hasAdConsent()`. Tant qu'aucune CMP
 *      n'existe, cette fonction renvoie `false` et il ne part strictement
 *      aucune requête tierce.
 *
 * Le verrou commercial (palier) N'EST PAS ici : il est appliqué par l'appelant
 * (`DashboardAdRail`), pour qu'un palier payant n'ait même pas la colonne dans
 * sa grille — réserver 300 px de vide à un abonné serait pire que rien.
 *
 * ── Brancher une régie plus tard ──────────────────────────────────────────
 * Tout se passe dans le `useEffect` ci-dessous, à l'endroit balisé. Le reste du
 * composant (dimensions, réservation, placeholder) n'a pas à changer.
 */

import { useEffect, useRef } from 'react'
import { AD_FORMATS, type AdFormat } from '@/lib/ads'
import { useAdConsent } from './use-ad-consent'

interface AdSlotProps {
  /** Format IAB à réserver. Détermine la taille du bloc. */
  format: AdFormat
  /**
   * Nom fonctionnel de l'emplacement (ex. `dashboard-rail`). Sert d'identifiant
   * stable pour la régie et de repère dans le DOM lors du débogage — il ne doit
   * PAS encoder le nom du fournisseur.
   */
  name: string
  /** Affiche un cadre pointillé étiqueté à la place du vide. Dev uniquement. */
  debug?: boolean
}

export default function AdSlot({ format, name, debug = false }: AdSlotProps) {
  const { width, height } = AD_FORMATS[format]
  // Abonné, pas lu une fois : voir la note de dépendance de l'effet ci-dessous.
  const granted = useAdConsent()
  const boxRef = useRef<HTMLDivElement>(null)
  const hostRef = useRef<HTMLDivElement>(null)
  const placeholderRef = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    // Le consentement est une notion purement CLIENT : il ne peut pas être
    // évalué pendant le rendu. Le faire produirait un serveur qui rend « pas de
    // pub » et un client qui rend « pub » — donc une erreur d'hydratation. On
    // part donc toujours de l'état réservé, et c'est cet effet qui bascule.
    //
    // 🔴 `granted` est une DÉPENDANCE de l'effet, et c'est ce qui fait que la
    // publicité apparaît sans rechargement : quand la personne accepte,
    // `useAdConsent()` re-rend, l'effet rejoue, et l'emplacement s'initialise.
    // Lire `hasAdConsent()` ici (comme avant) figerait l'emplacement sur l'état
    // qu'avait le consentement à l'instant du montage.
    if (!granted) return

    const box = boxRef.current
    const host = hostRef.current
    // Capturé en variable locale : lire `placeholderRef.current` depuis le
    // nettoyage pointerait potentiellement un autre noeud que celui manipulé
    // ici, React ayant pu re-rendre entre-temps.
    const placeholder = placeholderRef.current
    if (!box || !host) return

    // Un emplacement masqué par le CSS ne doit charger AUCUNE créa : une pub
    // servie dans un conteneur `display: none` n'est jamais visible, ce que les
    // régies comptent comme une impression invalide. Cas réel aujourd'hui : le
    // 300×250 du rail (`.dash-adrail-tail`) est masqué sous 1440 px de viewport.
    // `offsetParent` vaut `null` exactement dans ce cas.
    //
    // ⚠️ Ce test n'est fait qu'au montage : il ne rattrape pas un redimensionnement
    // de la fenêtre qui franchirait le seuil. C'est sans conséquence tant que le
    // point d'insertion ci-dessous est vide ; le jour où une régie y est branchée,
    // doubler ce garde d'un `matchMedia` réévalué.
    if (box.offsetParent === null) return

    // Bascule d'état faite en DIRECT sur le DOM plutôt que par un `setState` :
    // l'attribut n'est qu'un marqueur de débogage, le passer par l'état React
    // déclencherait un rendu en cascade à chaque montage d'emplacement pour un
    // résultat que React n'a pas besoin de connaître.
    box.dataset.adState = 'loaded'
    if (placeholder) placeholder.style.display = 'none'

    // ─────────────────────────────────────────────────────────────────────
    // POINT D'INSERTION DE LA RÉGIE — volontairement vide aujourd'hui.
    //
    // Y injecter le script du fournisseur retenu, en visant `host` comme
    // conteneur. Trois invariants à ne pas casser :
    //   - ne rien insérer AVANT ce point (le garde de consentement est au-dessus) ;
    //   - ne pas modifier la taille de `box` : c'est elle qui tient l'anti-CLS ;
    //   - viser `host`, jamais `box` : `host` est laissé vide par React, donc
    //     le manipuler impérativement n'entre pas en conflit avec le rendu.
    //
    // La largeur réellement servie dépend du viewport (160 ou 300 px, cf.
    // `--ad-slot-w` dans globals.css). Une régie qui a besoin de la connaître
    // la lira sur `host.getBoundingClientRect().width` — ne pas la déduire de
    // `format`, qui n'est que la valeur nominale.
    // ─────────────────────────────────────────────────────────────────────

    return () => {
      // Le conteneur est vidé au démontage pour qu'un script de régie ne laisse
      // pas de noeud orphelin quand l'utilisateur change d'onglet du dashboard.
      host.replaceChildren()
      box.dataset.adState = 'reserved'
      if (placeholder) placeholder.style.display = ''
    }
  }, [format, name, granted])

  return (
    <div
      ref={boxRef}
      data-ad-slot={name}
      data-ad-format={format}
      data-ad-state="reserved"
      style={{
        // Dimensions FIXES, appliquées quoi qu'il arrive : c'est la réservation
        // d'espace. `flex: none` empêche un parent flex de les comprimer.
        //
        // La largeur accepte une surcharge CSS via `--ad-slot-w`, posée par le
        // conteneur. Seul cas d'usage aujourd'hui : le rail du dashboard, qui
        // sert un 160×600 entre 1280 et 1439 px de viewport et un 300×600
        // au-delà. Passer par une variable CSS plutôt que par du JS est
        // délibéré — la largeur est ainsi connue AVANT le premier rendu React,
        // ce qui est la condition même de l'absence de CLS. Le repli est la
        // largeur nominale du format, pour tout usage simple.
        width: `var(--ad-slot-w, ${width}px)`,
        height, flex: 'none',
        overflow: 'hidden',
        borderRadius: 8,
        // En attente de consentement, l'emplacement reste un vide discret plutôt
        // qu'un cadre visible : afficher « emplacement publicitaire » à un
        // utilisateur qui n'a encore rien accepté serait du bruit pour rien.
        border: debug ? '1px dashed rgba(127,119,221,0.45)' : undefined,
        display: debug ? 'flex' : undefined,
        alignItems: debug ? 'center' : undefined,
        justifyContent: debug ? 'center' : undefined,
      }}
    >
      {debug && (
        <span
          ref={placeholderRef}
          style={{
            position: 'absolute',
            fontSize: 11, letterSpacing: 1, textTransform: 'uppercase',
            color: 'var(--text-dim)', textAlign: 'center', padding: 8,
            pointerEvents: 'none',
          }}
        >
          {name}<br />{width}×{height}
        </span>
      )}
      {/* Laissé VIDE par React : c'est la zone que la régie remplira. */}
      <div ref={hostRef} style={{ width: '100%', height: '100%' }} />
    </div>
  )
}
