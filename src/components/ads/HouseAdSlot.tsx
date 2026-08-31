'use client'

/**
 * Encart d'AUTO-PROMOTION — deuxième bloc de la colonne publicitaire.
 *
 * Ce n'est PAS un `AdSlot` et ça ne doit pas le devenir : `AdSlot` réserve de
 * l'espace pour une régie externe et reste bloqué derrière `hasAdConsent()`.
 * Ici tout est first-party — aucun script tiers, aucun cookie, aucune requête
 * sortante — donc rien à demander à une CMP. C'est précisément ce qui permet à
 * cet encart d'être le seul des trois blocs à afficher réellement quelque chose
 * aujourd'hui, et de combler la colonne tant qu'aucune régie n'est branchée.
 *
 * Format 300×250, repris de `AD_FORMATS['rectangle-300']` plutôt que codé en
 * dur : l'encart doit rester exactement de la taille du vrai slot qu'il
 * surplombe, sinon la colonne devient bancale dès que le format change.
 *
 * Le verrou commercial N'EST PAS ici : comme les deux `AdSlot`, cet encart est
 * rendu par `DashboardAdRail`, qui n'existe lui-même que pour le palier
 * gratuit. Un abonné n'a pas la colonne du tout — on ne fait donc jamais la
 * promotion d'un abonnement à quelqu'un qui l'a déjà.
 */

import { useEffect, useState } from 'react'
import { useTheme } from '@/components/providers/ThemeProvider'
import { useLanguage } from '@/components/providers/LanguageProvider'
import { AD_FORMATS } from '@/lib/ads'

/**
 * Les créas disponibles — UNE PAR PALIER PAYANT.
 *
 * Ajouter un palier (Légion, Architecte…) = ajouter UNE LIGNE ici, rien
 * d'autre : pas de composant, pas de condition, pas de style. Le tirage
 * ci-dessous s'adapte tout seul à la longueur de la liste.
 *
 * ⚠️ Aucun texte de palier n'est écrit ici. Le nom affiché, la tagline et les
 * fonctionnalités viennent du dictionnaire de la vitrine (`t.pricing.tiers`),
 * déjà traduit et déjà tenu à jour à chaque évolution de l'offre. Les dupliquer
 * ici garantirait qu'ils divergent de la page tarifs — or l'encart et la page
 * tarifs doivent promettre exactement la même chose.
 */
interface HouseCreative {
  /**
   * Valeur `profiles.tier` en base (partagée avec l'app WPF). Sert de clé
   * stable et de repère dans le DOM ; n'est JAMAIS affichée telle quelle.
   */
  tier: string
  /**
   * Index dans `t.pricing.tiers` (src/locales/landing.ts), dont l'ordre est
   * celui du tableau `tiers` de `Pricing.tsx` : Apprenti 0, Forgeron 1,
   * Maître 2. Le dictionnaire documente déjà cet ordre comme un contrat.
   */
  localeIndex: number
  /**
   * Index des fonctionnalités à mettre en avant, dans le `features` du même
   * palier. Trois maximum : au-delà, ça ne tient pas dans 250 px de haut.
   */
  features: number[]
}

const HOUSE_CREATIVES: HouseCreative[] = [
  { tier: 'forgeron', localeIndex: 1, features: [0, 2, 5] },
  { tier: 'maître',   localeIndex: 2, features: [0, 2, 3] },
]

/**
 * Chrome de l'encart. Volontairement LOCAL et non dans
 * `src/locales/dashboard/` : le périmètre de ce dictionnaire est validé et
 * n'inclut pas la colonne publicitaire. La forme (le FR fait foi, l'EN en
 * dérive par `typeof`) est exactement celle des modules du dico, pour que
 * promouvoir ce bloc en `locales/dashboard/houseAd.ts` reste un simple
 * déplacement de fichier le jour où l'encart grossit.
 *
 * `{tier}` est remplacé par le nom TRADUIT du palier — d'où la nécessité d'une
 * version EN : « Découvre le palier Blacksmith » serait un mélange visible.
 */
const houseAdFr = {
  eyebrow: 'Passe au niveau supérieur',
  cta:     'Découvre le palier {tier}',
  label:   'Promotion Wyrm Forge',
}
const houseAdEn: typeof houseAdFr = {
  eyebrow: 'Take it further',
  cta:     'Discover the {tier} tier',
  label:   'Wyrm Forge promotion',
}

interface HouseAdSlotProps {
  /**
   * Ouvre la page tarifs. Câblé par `Dashboard` sur l'onglet caché `tarifs`,
   * exactement comme le fait déjà la popup de renouvellement (`onRenew` dans
   * `page.tsx`).
   *
   * Un `<Link href="/?tab=tarifs">` NE MARCHERAIT PAS ici : ce lien fonctionne
   * depuis /profil parce qu'il change de route, mais le dashboard EST déjà `/`.
   * Une navigation client vers la même route ne remonte pas `Home`, donc
   * l'effet qui lit `?tab=` ne serait jamais rejoué et l'onglet ne changerait
   * pas. D'où un rappel plutôt qu'un lien.
   */
  onSeePricing: () => void
}

export default function HouseAdSlot({ onSeePricing }: HouseAdSlotProps) {
  const { width, height } = AD_FORMATS['rectangle-300']
  const { theme } = useTheme()
  const c = theme === 'mythic'
  const { t, lang } = useLanguage()
  const copy = lang === 'en' ? houseAdEn : houseAdFr

  // Tirage au sort de la créa, UNE FOIS par chargement de page.
  //
  // Fait dans un effet, et non pendant le rendu, pour la même raison que le
  // garde de consentement d'`AdSlot` : un `Math.random()` évalué au rendu
  // donnerait une créa côté serveur et une autre côté client, donc une erreur
  // d'hydratation. `[]` en dépendances = aucun re-tirage tant que la page reste
  // ouverte — pas de minuteur, pas de rotation, c'est voulu.
  //
  // L'encart apparaît donc une frame après la première peinture. Sans aucun
  // effet sur le CLS : la boîte ci-dessous fait 300×250 dès le premier rendu,
  // qu'elle soit remplie ou non.
  const [pick, setPick] = useState<number | null>(null)
  useEffect(() => {
    setPick(Math.floor(Math.random() * HOUSE_CREATIVES.length))
  }, [])

  const creative = pick === null ? null : HOUSE_CREATIVES[pick]
  // Repli silencieux si le dictionnaire a bougé sous nos pieds (palier retiré de
  // la vitrine sans que la liste des créas suive) : on préfère un bloc vide à un
  // « undefined » affiché dans la colonne.
  const tierCopy = creative ? t.pricing.tiers[creative.localeIndex] : undefined

  // Mêmes teintes que le bouton « Lier mon compte » (`btnPrimaryStyle` dans
  // RiotLinkBlock.tsx) : l'encart doit se lire comme un bloc du site, pas comme
  // une bannière rapportée. Les variables de thème ne suffisent pas ici — aucune
  // ne porte cet accent, qui bascule de l'or (mythic) au violet (classic).
  const accent  = c ? '#BA7517' : '#7F77DD'
  const accentD = c ? '#8B5E0A' : '#534AB7'

  return (
    <div
      data-house-ad={creative?.tier}
      aria-label={copy.label}
      style={{
        // Réservation d'espace identique à celle d'`AdSlot` : dimensions fixes,
        // appliquées qu'il y ait une créa ou non. `--ad-slot-w` vaut 300 px
        // partout où ce bloc est visible (il vit dans `.dash-adrail-tail`, qui
        // n'existe qu'au-delà de 1440 px) — la variable est reprise pour rester
        // alignée sur le slot voisin si le rail était un jour élargi.
        width: `var(--ad-slot-w, ${width}px)`,
        height, flex: 'none',
        boxSizing: 'border-box',
        overflow: 'hidden',
        borderRadius: 12,
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        padding: 18,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
      }}
    >
      {tierCopy && creative && (
        <>
          <div>
            <div style={{
              fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase',
              color: 'var(--text-dim)', marginBottom: 8,
            }}>
              {copy.eyebrow}
            </div>

            {/* `.font-mythic` et `.accent-text` sont les classes de titre du
                site : elles basculent déjà seules entre les deux thèmes. */}
            <div className="font-mythic" style={{ fontSize: 21, fontWeight: 600, lineHeight: 1.15 }}>
              <span className="accent-text">{tierCopy.name}</span>
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
              {tierCopy.tagline}
            </div>

            <ul style={{ listStyle: 'none', margin: '12px 0 0', padding: 0, display: 'grid', gap: 5 }}>
              {creative.features
                .map(i => tierCopy.features[i])
                .filter(Boolean)
                .map(f => (
                  <li key={f} style={{
                    fontSize: 11.5, color: 'var(--text-muted)', lineHeight: 1.3,
                    display: 'flex', gap: 6, alignItems: 'baseline',
                  }}>
                    <span aria-hidden style={{ color: accent, fontSize: 10 }}>◆</span>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f}</span>
                  </li>
                ))}
            </ul>
          </div>

          <button
            onClick={onSeePricing}
            style={{
              width: '100%',
              padding: '9px 12px',
              borderRadius: 6,
              background: `linear-gradient(135deg,${accent},${accentD})`,
              border: 'none',
              color: 'white',
              fontSize: 12.5,
              fontWeight: 600,
              cursor: 'pointer',
              fontFamily: 'inherit',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {copy.cta.replace('{tier}', tierCopy.name)}
          </button>
        </>
      )}
    </div>
  )
}
