import { describe, it, expect, vi } from 'vitest'

// Importer Dashboard tire toute l'arborescence des onglets, dont `ScenariosTab`
// qui appelle `createClient()` AU NIVEAU MODULE — sans variables d'env,
// @supabase/ssr lève à l'import et le fichier de test ne collecte aucun test.
// On neutralise donc le client : aucun test ici ne touche à Supabase.
vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({}) }))

import { tabGroups, dashTabs, type TabDef } from '@/components/dashboard/Dashboard'

// `locked` est la SEULE source du badge « Pro » : il alimente `isLocked` dans
// SidebarBtn (sidebar desktop) et `locked={...}` dans DrawerTabBtn (drawer
// mobile, Nav.tsx). Ces tests verrouillent le dégating des DEUX onglets IA —
// un `locked: true` réintroduit par mégarde ferait réapparaître le badge dans
// les deux barres, et un compte Apprenti se retrouverait devant un écran
// verrouillé alors qu'il a les crédits pour lancer l'action.
//
// Pas de test de rendu ici : ni @testing-library/react ni jsdom ne sont
// installés, et la décision d'accès vit entièrement dans ces données.

const byId = (id: string): TabDef | undefined => dashTabs.find(t => t.id === id)

// Les deux onglets du groupe « Analyse IA », dégatés ensemble : Post Game le
// 2026-08-01, Match Up dans la foulée. Leur accès réel est arbitré par le solde
// « Chaleur de la Forge » (canAffordPostGame / canAfford), jamais par le tier.
describe.each(['postgame', 'matchup'])('Onglet IA « %s » — ouvert à tous les tiers', (id) => {
  it('est bien présent dans la navigation', () => {
    expect(byId(id)).toBeDefined()
  })

  it('ne porte PAS `locked` — donc aucun badge « Pro », pour aucun tier', () => {
    // `isLocked = !unlocked && t.locked` : sans `locked`, la valeur de
    // `unlocked` (isAdmin || isProTier) n'a plus aucun effet sur cet onglet.
    expect(byId(id)?.locked).toBeFalsy()
  })

  it('n\'est pas marqué « Bientôt » (il serait alors non cliquable)', () => {
    expect(byId(id)?.soon).toBeFalsy()
  })

  it('reste dans le groupe « Analyse IA »', () => {
    // Depuis le Lot 1 du chantier i18n, un groupe porte un `id` structurel et son
    // intitulé vit dans le dico (`nav.groups.ia`) : c'est l'`id` qu'on vérifie ici,
    // le libellé affiché n'étant plus une propriété de la structure.
    const group = tabGroups.find(g => g.tabs.some(t => t.id === id))
    expect(group?.id).toBe('ia')
  })
})

describe('Onglets encore gatés — décision NON modifiée par ces chantiers', () => {
  // Scénarios reste le seul `locked` du dashboard. Contrairement aux onglets IA,
  // il n'a aucun budget serveur qui arbitrerait son accès à la place du tier :
  // le dégater demanderait de décider d'un modèle d'accès, pas juste de retirer
  // un drapeau. Si c'est fait un jour, mettre à jour ce test ET la doc.
  it('Scénarios reste `locked`', () => {
    expect(byId('scenarios')?.locked).toBe(true)
  })

  it('est désormais le SEUL onglet verrouillé', () => {
    expect(dashTabs.filter(t => t.locked).map(t => t.id)).toEqual(['scenarios'])
  })
})
