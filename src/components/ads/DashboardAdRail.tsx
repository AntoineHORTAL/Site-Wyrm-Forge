'use client'

/**
 * Colonne publicitaire du dashboard — troisième piste de la grille `.dash-layout`.
 *
 * TROIS blocs, globaux au layout : pas de logement par fonctionnalité
 * (rien dans le Builder, rien dans MatchUp). Tout ce qui s'affiche derrière le
 * dashboard hérite de cette colonne sans rien avoir à déclarer, et il n'y a
 * qu'un endroit à modifier le jour où les formats ou la régie changent.
 *
 * ⚠️ Ce composant doit rester un ENFANT DIRECT de `.dash-layout` : c'est ce qui
 * en fait une piste de la grille CSS (et, accessoirement, ce qui le fait
 * disparaître à l'impression via la règle `.dash-layout > :not(.dash-main)`
 * déjà présente dans `globals.css`).
 *
 * ── Pourquoi UN SEUL des deux est collant ────────────────────────────────
 * Rendre la pile entière collante demanderait 97 (offset de départ) + 600 + 24
 * (gouttière) + 250 = 971 px de viewport. Or les résolutions courantes sur
 * lesquelles la colonne existe (elle n'apparaît qu'à partir de 1280 px de
 * large) plafonnent bien en dessous :
 *
 *     1920×1080 maximisé  → ~953 px de viewport   (18 px de trop)
 *     1920×1080 fenêtré   → ~849 px               (122 px de trop)
 *     MacBook Air 1440×900→ ~800 px               (171 px de trop)
 *     laptop 1600×900     → ~773 px               (198 px de trop)
 *     2560×1440 maximisé  → ~1313 px              ✅ le seul qui tienne
 *
 * Un collant plus haut que la fenêtre est pire qu'un non-collant : le bas du
 * bloc n'est JAMAIS atteignable, donc la deuxième créa ne serait jamais vue en
 * entier — ce que les régies comptent comme non visible. Le 300×600 reste donc
 * seul collant, et le 300×250 défile avec le contenu du dashboard.
 *
 * Le collant est porté par `.dash-adrail-inner`, lui-même enfermé dans
 * `.dash-adrail-track` : c'est cette piste qui borne sa course et l'empêche de
 * venir recouvrir le 300×250 en fin de scroll (cf. globals.css).
 */

import AdSlot from './AdSlot'
import HouseAdSlot from './HouseAdSlot'

interface DashboardAdRailProps {
  /**
   * Ouvre la page tarifs — uniquement consommé par `HouseAdSlot`, le seul bloc
   * de la colonne qui soit cliquable. Les deux `AdSlot` sont, eux, totalement
   * agnostiques : ils ne savent rien du site qui les héberge.
   */
  onSeePricing: () => void
}

export default function DashboardAdRail({ onSeePricing }: DashboardAdRailProps) {
  return (
    <aside className="dash-adrail" aria-label="Publicité">
      {/* Piste collante — voir `.dash-adrail-track` dans globals.css : elle prend
          toute la hauteur restante de la colonne et sert de butée basse au
          collant. */}
      <div className="dash-adrail-track">
        <div className="dash-adrail-inner">
          {/*
            Format NOMINAL. La largeur réelle est pilotée par le CSS
            (`--ad-slot-w` sur `.dash-adrail`), qui passe à 160 px entre 1280 et
            1439 px de viewport. Les deux formats font 600 px de haut : la bascule
            d'un format à l'autre ne change donc jamais la hauteur réservée, et ne
            peut pas provoquer de décalage vertical.
          */}
          <AdSlot
            format="halfpage-300"
            name="dashboard-rail"
            debug={process.env.NODE_ENV !== 'production'}
          />
        </div>
      </div>

      {/*
        Queue de la colonne : l'encart d'auto-promotion puis un second
        emplacement de régie, tous deux en 300×250 (format IAB que toutes les
        régies savent servir). Elle n'existe QU'À PARTIR DE 1440 px de viewport,
        parce qu'en dessous la piste ne fait que 160 px de large et ne peut pas
        accueillir une créa de 300. Cette bascule est faite en CSS
        (`.dash-adrail-tail`), donc l'espace est réservé ou libéré dès la
        première peinture — jamais après coup par du JS, ce qui décalerait le
        contenu (CLS).

        Pas de `--ad-slot-w` à gérer ici : au-delà de 1440 px la variable vaut
        déjà 300 px, soit exactement la largeur nominale du format.
      */}
      <div className="dash-adrail-tail">
        {/*
          Auto-promotion, AVANT le second emplacement de régie. L'ordre n'est pas
          neutre : c'est le seul bloc qui affiche réellement quelque chose tant
          qu'aucune régie n'est branchée, donc le mettre au-dessus lui donne la
          meilleure position des deux. Il hérite du verrou de palier de toute la
          colonne — il n'a aucune condition propre.
        */}
        <HouseAdSlot onSeePricing={onSeePricing} />

        <AdSlot
          format="rectangle-300"
          name="dashboard-rail-2"
          debug={process.env.NODE_ENV !== 'production'}
        />
      </div>
    </aside>
  )
}
