import { defineConfig } from 'vitest/config'
import path from 'node:path'

// Config vitest minimale, ajoutée au Lot D3.
//
// Jusqu'ici les tests tournaient SANS config : les modules purs
// (`src/lib/matchup/*`, `src/lib/live-game.ts`) n'importent que du relatif,
// précisément parce que l'alias `@/` n'était pas résolu. Cette contrainte
// reste vraie et volontaire pour les modules de logique.
//
// L'alias est ajouté ici uniquement pour permettre de tester des COMPOSANTS
// (qui, eux, importent `@/lib/...` et `@/components/...` comme partout dans
// l'app Next). Il n'y a aucune raison de faire migrer les tests existants.
export default defineConfig({
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
})
