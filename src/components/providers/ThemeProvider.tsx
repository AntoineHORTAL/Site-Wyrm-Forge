'use client'

import { createContext, useContext, useEffect, useState } from 'react'

type Theme = 'mythic' | 'classic'

interface ThemeCtx {
  theme: Theme
  setTheme: (t: Theme) => void
}

const Ctx = createContext<ThemeCtx>({ theme: 'mythic', setTheme: () => {} })

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>('mythic')

  useEffect(() => {
    const saved = localStorage.getItem('wf-theme') as Theme | null
    if (saved === 'classic' || saved === 'mythic') setThemeState(saved)
  }, [])

  function setTheme(t: Theme) {
    setThemeState(t)
    localStorage.setItem('wf-theme', t)
  }

  return (
    <Ctx.Provider value={{ theme, setTheme }}>
      <div data-theme={theme} style={{ minHeight: '100vh' }}>
        {children}
      </div>
    </Ctx.Provider>
  )
}

export const useTheme = () => useContext(Ctx)
