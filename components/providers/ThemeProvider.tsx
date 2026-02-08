'use client'

import * as React from 'react'
import { ThemeProvider as NextThemesProvider } from 'next-themes'

// Optimisation: charger le thème de manière synchrone depuis localStorage
// pour éviter le flash de contenu non stylé (FOUC)

/**
 * Provider pour gérer le thème dark/light de l'application
 * Utilise next-themes pour la gestion et la persistence du thème
 */
export function ThemeProvider({
  children,
  ...props
}: React.ComponentProps<typeof NextThemesProvider>) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="dark"
      enableSystem
      disableTransitionOnChange // Désactiver les transitions pour améliorer les performances
      storageKey="theme-preference"
      {...props}
    >
      {children}
    </NextThemesProvider>
  )
}
