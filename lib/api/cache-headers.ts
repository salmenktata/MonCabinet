/**
 * Utilitaires pour gérer les headers de cache HTTP
 *
 * Permet d'optimiser les performances en cachant les réponses API
 * côté client et CDN (Cloudflare).
 */

export interface CacheConfig {
  /**
   * Durée de cache en secondes
   * - Courte (60s) : Données changeantes (stats, notifications)
   * - Moyenne (300s = 5min) : Données semi-statiques (listes, configs)
   * - Longue (3600s = 1h) : Données statiques (taxonomie, métadonnées)
   */
  maxAge: number

  /**
   * Durée stale-while-revalidate en secondes
   * Permet de servir du cache périmé pendant qu'on revalide en arrière-plan
   */
  staleWhileRevalidate?: number

  /**
   * Cache privé (navigateur uniquement) ou public (CDN + navigateur)
   */
  cacheControl: 'private' | 'public'

  /**
   * Ajouter must-revalidate (force revalidation après expiration)
   */
  mustRevalidate?: boolean
}

/**
 * Configurations pré-définies pour différents types de données
 */
export const CACHE_PRESETS = {
  /** Pas de cache (données sensibles ou temps réel) */
  NO_CACHE: {
    maxAge: 0,
    cacheControl: 'private' as const,
    mustRevalidate: true,
  },

  /** Cache court - 1 minute (données changeantes) */
  SHORT: {
    maxAge: 60,
    staleWhileRevalidate: 30,
    cacheControl: 'public' as const,
  },

  /** Cache moyen - 5 minutes (données semi-statiques) */
  MEDIUM: {
    maxAge: 300,
    staleWhileRevalidate: 60,
    cacheControl: 'public' as const,
  },

  /** Cache long - 1 heure (données statiques) */
  LONG: {
    maxAge: 3600,
    staleWhileRevalidate: 600,
    cacheControl: 'public' as const,
  },

  /** Cache très long - 24 heures (données rarement modifiées) */
  VERY_LONG: {
    maxAge: 86400,
    staleWhileRevalidate: 3600,
    cacheControl: 'public' as const,
  },
} as const

/**
 * Génère la valeur du header Cache-Control
 */
function buildCacheControlHeader(config: CacheConfig): string {
  const parts: string[] = [config.cacheControl]

  if (config.maxAge > 0) {
    parts.push(`max-age=${config.maxAge}`)
    // s-maxage pour CDN (Cloudflare)
    parts.push(`s-maxage=${config.maxAge}`)
  } else {
    parts.push('no-store')
  }

  if (config.staleWhileRevalidate) {
    parts.push(`stale-while-revalidate=${config.staleWhileRevalidate}`)
  }

  if (config.mustRevalidate) {
    parts.push('must-revalidate')
  }

  return parts.join(', ')
}

/**
 * Ajoute les headers de cache à une Response
 *
 * @example
 * ```typescript
 * export async function GET() {
 *   const data = await fetchData()
 *   return withCacheHeaders(
 *     Response.json(data),
 *     CACHE_PRESETS.MEDIUM
 *   )
 * }
 * ```
 */
export function withCacheHeaders(
  response: Response,
  config: CacheConfig = CACHE_PRESETS.SHORT
): Response {
  const headers = new Headers(response.headers)
  headers.set('Cache-Control', buildCacheControlHeader(config))

  // ETag pour validation conditionnelle (généré par Next.js automatiquement)
  // On n'a pas besoin de le gérer manuellement

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}

/**
 * Helper pour NextResponse (route handlers Next.js 13+)
 *
 * @example
 * ```typescript
 * import { NextResponse } from 'next/server'
 *
 * export async function GET() {
 *   const data = await fetchData()
 *   return NextResponse.json(data, {
 *     headers: getCacheHeaders(CACHE_PRESETS.MEDIUM)
 *   })
 * }
 * ```
 */
export function getCacheHeaders(
  config: CacheConfig = CACHE_PRESETS.SHORT
): Record<string, string> {
  return {
    'Cache-Control': buildCacheControlHeader(config),
  }
}

/**
 * Désactive complètement le cache (pour données sensibles)
 *
 * @example
 * ```typescript
 * export async function GET() {
 *   const sensitiveData = await fetchUserData()
 *   return NextResponse.json(sensitiveData, {
 *     headers: getNoCacheHeaders()
 *   })
 * }
 * ```
 */
export function getNoCacheHeaders(): Record<string, string> {
  return {
    'Cache-Control': 'private, no-cache, no-store, must-revalidate',
    'Pragma': 'no-cache', // HTTP/1.0
    'Expires': '0', // Proxies
  }
}

/**
 * Recommandations de cache par type de route
 */
export const CACHE_BY_ROUTE_TYPE = {
  /** Routes publiques (listes, recherche) */
  PUBLIC_LIST: CACHE_PRESETS.MEDIUM,

  /** Routes publiques statiques (taxonomie, métadonnées) */
  PUBLIC_STATIC: CACHE_PRESETS.LONG,

  /** Routes privées utilisateur (dossiers, clients) */
  PRIVATE_DATA: CACHE_PRESETS.SHORT,

  /** Routes sensibles (auth, paiement) */
  SENSITIVE: CACHE_PRESETS.NO_CACHE,

  /** Stats et métriques (dashboard) */
  STATS: CACHE_PRESETS.SHORT,

  /** Configuration système */
  CONFIG: CACHE_PRESETS.VERY_LONG,
} as const
