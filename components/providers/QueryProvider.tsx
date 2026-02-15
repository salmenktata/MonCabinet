/**
 * QueryProvider Global pour React Query
 *
 * Sprint 6 - Phase 3 : Cache & Performance
 *
 * Provider global React Query avec configuration optimisée pour l'app.
 * Configure staleTime, gcTime, retry, devtools.
 */

'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { type ReactNode, lazy, Suspense } from 'react'

// Devtools optionnels (seulement en dev) - Import lazy pour éviter les problèmes de timing
const ReactQueryDevtoolsProduction = lazy(() =>
  import('@tanstack/react-query-devtools/build/modern/production.js').then(
    (d) => ({
      default: d.ReactQueryDevtools,
    })
  )
)

const ReactQueryDevtools =
  process.env.NODE_ENV === 'development'
    ? lazy(() =>
        import('@tanstack/react-query-devtools').then((d) => ({
          default: d.ReactQueryDevtools,
        }))
      )
    : null

// =============================================================================
// CONFIGURATION
// =============================================================================

/**
 * Configuration par défaut React Query
 *
 * Optimisations :
 * - staleTime: 5 minutes (données considérées fraîches)
 * - gcTime (ex-cacheTime): 30 minutes (garde en mémoire)
 * - retry: 2 tentatives (3 au total)
 * - refetchOnWindowFocus: false (évite requêtes inutiles)
 * - refetchOnReconnect: true (sync après reconnexion)
 */
function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // Cache settings
        staleTime: 5 * 60 * 1000, // 5 minutes
        gcTime: 30 * 60 * 1000, // 30 minutes (ex-cacheTime)

        // Retry settings
        retry: 2, // 2 retries = 3 total attempts
        retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000), // Exponential backoff

        // Refetch settings
        refetchOnWindowFocus: false, // Ne pas refetch automatiquement au focus
        refetchOnReconnect: true, // Refetch après reconnexion réseau
        refetchOnMount: false, // Ne pas refetch si données en cache

        // Error handling
        throwOnError: false, // Ne pas throw, utiliser error state
      },
      mutations: {
        // Retry settings for mutations
        retry: 1, // 1 retry = 2 total attempts
        retryDelay: 1000, // 1 second between retries

        // Error handling
        throwOnError: false,
      },
    },
  })
}

// Singleton pour SSR (pas de new QueryClient à chaque render)
let browserQueryClient: QueryClient | undefined = undefined

function getQueryClient() {
  if (typeof window === 'undefined') {
    // Server: toujours créer nouveau client
    return makeQueryClient()
  } else {
    // Browser: singleton
    if (!browserQueryClient) browserQueryClient = makeQueryClient()
    return browserQueryClient
  }
}

// =============================================================================
// PROVIDER
// =============================================================================

export interface QueryProviderProps {
  children: ReactNode
}

/**
 * Provider React Query global
 *
 * Usage (dans app/layout.tsx) :
 * ```tsx
 * import { QueryProvider } from '@/components/providers/QueryProvider'
 *
 * export default function RootLayout({ children }) {
 *   return (
 *     <html>
 *       <body>
 *         <QueryProvider>
 *           {children}
 *         </QueryProvider>
 *       </body>
 *     </html>
 *   )
 * }
 * ```
 */
export function QueryProvider({ children }: QueryProviderProps) {
  // NOTE: Pas de useState() ici car on utilise getQueryClient() qui gère le singleton
  // useState() causerait un nouveau client à chaque render
  const queryClient = getQueryClient()

  return (
    <QueryClientProvider client={queryClient}>
      {children}

      {/* DevTools uniquement en développement */}
      {process.env.NODE_ENV === 'development' && ReactQueryDevtools && (
        <Suspense fallback={null}>
          <ReactQueryDevtools
            initialIsOpen={false}
            buttonPosition="bottom-right"
          />
        </Suspense>
      )}
    </QueryClientProvider>
  )
}

// =============================================================================
// UTILITIES
// =============================================================================

/**
 * Hook pour accès direct au QueryClient (usage avancé)
 *
 * Usage :
 * ```tsx
 * import { useQueryClient } from '@tanstack/react-query'
 * import { getCachedRAGSearch } from '@/lib/hooks/useRAGSearch'
 *
 * const queryClient = useQueryClient()
 * const cached = getCachedRAGSearch(queryClient, 'prescription')
 * ```
 */
export { useQueryClient } from '@tanstack/react-query'

/**
 * Clear all cache (logout, etc.)
 *
 * Usage :
 * ```tsx
 * import { clearAllCache } from '@/components/providers/QueryProvider'
 *
 * const handleLogout = () => {
 *   clearAllCache()
 *   // ... logout logic
 * }
 * ```
 */
export function clearAllCache() {
  if (browserQueryClient) {
    browserQueryClient.clear()
  }
}

/**
 * Get cache stats (monitoring)
 *
 * Usage :
 * ```tsx
 * import { getCacheStats } from '@/components/providers/QueryProvider'
 *
 * const stats = getCacheStats()
 * console.log(`Queries en cache: ${stats.queriesCount}`)
 * ```
 */
export function getCacheStats() {
  if (!browserQueryClient) {
    return {
      queriesCount: 0,
      mutationsCount: 0,
      isFetching: 0,
      isMutating: 0,
    }
  }

  const queryCache = browserQueryClient.getQueryCache()
  const mutationCache = browserQueryClient.getMutationCache()

  return {
    queriesCount: queryCache.getAll().length,
    mutationsCount: mutationCache.getAll().length,
    isFetching: browserQueryClient.isFetching(),
    isMutating: browserQueryClient.isMutating(),
  }
}

/**
 * Prefetch multiple queries (navigation anticipée)
 *
 * Usage :
 * ```tsx
 * import { prefetchQueries } from '@/components/providers/QueryProvider'
 * import { ragSearchKeys } from '@/lib/hooks/useRAGSearch'
 *
 * const handleNavigate = async () => {
 *   await prefetchQueries([
 *     {
 *       queryKey: ragSearchKeys.search('prescription'),
 *       queryFn: () => fetch('/api/...').then(r => r.json()),
 *     },
 *   ])
 *   router.push('/recherche')
 * }
 * ```
 */
export async function prefetchQueries(
  queries: Array<{
    queryKey: unknown[]
    queryFn: () => Promise<unknown>
  }>
) {
  if (!browserQueryClient) return

  await Promise.all(
    queries.map((query) =>
      browserQueryClient!.prefetchQuery({
        queryKey: query.queryKey,
        queryFn: query.queryFn,
      })
    )
  )
}
