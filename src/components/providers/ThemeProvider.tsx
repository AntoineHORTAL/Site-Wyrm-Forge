'use client'

import { createContext, useContext } from 'react'

type Theme = 'mythic' | 'classic'

interface ThemeCtx {
  theme: Theme
  setTheme: (t: Theme) => void
}

// Thème fixé sur 'mythic' — seul thème actif depuis le retrait du toggle du header.
// L'API (theme / setTheme) est volontairement conservée pour ne pas casser les ~30
// composants qui consomment useTheme() via `const c = theme === 'mythic'`.
// `setTheme` est un no-op : plus aucune bascule possible côté UI.
const Ctx = createContext<ThemeCtx>({ theme: 'mythic', setTheme: () => {} })

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <Ctx.Provider value={{ theme: 'mythic', setTheme: () => {} }}>
      <div data-theme="mythic" style={{ minHeight: '100vh' }}>
        {children}
      </div>
    </Ctx.Provider>
  )
}

export const useTheme = () => useContext(Ctx)
