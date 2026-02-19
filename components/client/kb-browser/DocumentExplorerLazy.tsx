/**
 * Lazy Loaded DocumentExplorer
 *
 * Sprint 5 - Performance & Lazy Loading
 *
 * Charge DocumentExplorer de manière asynchrone pour réduire le bundle initial.
 * Gain estimé : -100KB à -200KB
 */

'use client'

import dynamic from 'next/dynamic'
import { Loader2 } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import type { DocumentExplorerProps } from './DocumentExplorer'

// =============================================================================
// LOADING COMPONENT
// =============================================================================

function DocumentExplorerLoadingFallback() {
  return (
    <div className="space-y-4">
      {/* Search bar skeleton */}
      <Card>
        <CardContent className="p-4">
          <div className="flex gap-2">
            <div className="flex-1 animate-pulse">
              <div className="h-10 bg-muted rounded" />
            </div>
            <div className="animate-pulse">
              <div className="h-10 w-32 bg-muted rounded" />
            </div>
            <div className="animate-pulse">
              <div className="h-10 w-24 bg-muted rounded" />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Toolbar skeleton */}
      <div className="flex items-center justify-between">
        <div className="h-5 w-24 bg-muted rounded animate-pulse" />
        <div className="flex gap-2">
          <div className="h-9 w-20 bg-muted rounded animate-pulse" />
          <div className="h-9 w-16 bg-muted rounded animate-pulse" />
        </div>
      </div>

      {/* Content loading */}
      <Card>
        <CardContent className="p-12 text-center">
          <div className="flex flex-col items-center space-y-4">
            <Loader2 className="h-12 w-12 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">
              Chargement de l'explorateur de la base de connaissances...
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

// =============================================================================
// LAZY LOADED COMPONENT
// =============================================================================

/**
 * DocumentExplorer chargé de manière asynchrone avec Next.js dynamic()
 *
 * Options :
 * - ssr: false → Ne pas charger côté serveur (économie SSR bundle)
 * - loading → Composant affiché pendant chargement
 */
const DocumentExplorerLazy = dynamic<DocumentExplorerProps>(
  () => import('./DocumentExplorer').then((mod) => mod.DocumentExplorer),
  {
    loading: () => <DocumentExplorerLoadingFallback />,
    ssr: false, // Désactiver SSR pour économiser bundle serveur
  }
)

// =============================================================================
// EXPORT
// =============================================================================

export default DocumentExplorerLazy

/**
 * Export type pour compatibilité
 */
export type { DocumentExplorerProps }

/**
 * Re-export types utilisés par DocumentExplorer
 */
export type { DocumentFilters } from './DocumentExplorer'
