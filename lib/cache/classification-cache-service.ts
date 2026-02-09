/**
 * Service de cache Redis pour les classifications juridiques
 *
 * Évite de re-classifier des pages avec des patterns URL similaires
 * en cachant les résultats de classification pendant 7 jours.
 *
 * Gain attendu : -60% appels LLM, -20-30% temps total de classification
 */

import { getRedisClient } from '@/lib/cache/redis'
import { createHash } from 'crypto'
import type { LegalContentCategory, LegalDomain, DocumentNature } from '@/lib/web-scraper/types'

// =============================================================================
// TYPES
// =============================================================================

export interface CachedClassification {
  primaryCategory: LegalContentCategory
  domain: LegalDomain
  documentType: DocumentNature
  confidenceScore: number
  cachedAt: string
  sourceName: string
}

// =============================================================================
// CONFIGURATION
// =============================================================================

const CACHE_PREFIX = 'classification'
const DEFAULT_TTL = 604800 // 7 jours en secondes

// =============================================================================
// FONCTIONS PUBLIQUES
// =============================================================================

/**
 * Génère une clé de cache pour une URL en normalisant les patterns
 *
 * Exemple :
 *   /jurisprudence/123/details → /jurisprudence/{id}/details
 *   /lois/2024/45/texte → /lois/{year}/{id}/texte
 *
 * @param url URL de la page
 * @param sourceName Nom de la source (ex: "9anoun.tn")
 * @param category Catégorie de la source (ex: "jurisprudence")
 * @returns Clé de cache MD5
 */
export function generateCacheKey(url: string, sourceName: string, category: string): string {
  // Normaliser l'URL en remplaçant les IDs numériques par des placeholders
  let normalized = url

  // Remplacer segments numériques seuls : /123/ → /{id}/
  normalized = normalized.replace(/\/\d+\//g, '/{id}/')

  // Remplacer IDs à la fin : /article/456 → /article/{id}
  normalized = normalized.replace(/\/\d+$/g, '/{id}')

  // Remplacer années : /2024/ → /{year}/
  normalized = normalized.replace(/\/(19|20)\d{2}\//g, '/{year}/')

  // Remplacer query params avec IDs : ?id=123 → ?id={id}
  normalized = normalized.replace(/([?&]id=)\d+/g, '$1{id}')

  // Retirer trailing slash pour consistance
  normalized = normalized.replace(/\/$/, '')

  // Générer hash MD5 pour clé compacte
  const hash = createHash('md5')
    .update(`${sourceName}:${category}:${normalized}`)
    .digest('hex')

  return `${CACHE_PREFIX}:${hash}`
}

/**
 * Récupère une classification depuis le cache
 *
 * @param key Clé de cache générée par generateCacheKey()
 * @returns Classification cachée ou null si non trouvée
 */
export async function getCachedClassification(key: string): Promise<CachedClassification | null> {
  try {
    const redis = await getRedisClient()
    if (!redis) {
      return null
    }

    const cached = await redis.get(key)

    if (!cached) {
      return null
    }

    const parsed = JSON.parse(cached) as CachedClassification

    // Vérifier que les champs requis existent
    if (!parsed.primaryCategory || !parsed.domain || !parsed.confidenceScore) {
      console.warn('[ClassificationCache] Cache entry malformed, ignoring:', key)
      return null
    }

    return parsed
  } catch (error) {
    console.error('[ClassificationCache] Failed to get cached classification:', error)
    return null
  }
}

/**
 * Enregistre une classification dans le cache
 *
 * @param key Clé de cache générée par generateCacheKey()
 * @param classification Résultat de classification à cacher
 * @param ttl Durée de vie en secondes (défaut: 7 jours)
 */
export async function setCachedClassification(
  key: string,
  classification: CachedClassification,
  ttl: number = DEFAULT_TTL
): Promise<void> {
  try {
    const redis = await getRedisClient()
    if (!redis) {
      return
    }

    await redis.set(key, JSON.stringify(classification), { EX: ttl })
  } catch (error) {
    console.error('[ClassificationCache] Failed to set cached classification:', error)
    // Ne pas throw pour éviter de bloquer le pipeline d'indexation
  }
}

/**
 * Invalide le cache de classification pour une source donnée
 *
 * Utile après modification des règles de classification ou de la taxonomie
 *
 * @param sourceName Nom de la source (ex: "9anoun.tn")
 */
export async function invalidateCacheForSource(sourceName: string): Promise<number> {
  try {
    const redis = await getRedisClient()
    if (!redis) {
      return 0
    }

    // Scanner toutes les clés de cache de classification
    const pattern = `${CACHE_PREFIX}:*`
    const keys: string[] = []

    // Utiliser scanIterator pour éviter de bloquer Redis
    for await (const key of redis.scanIterator({ MATCH: pattern, COUNT: 100 })) {
      try {
        const keyStr = typeof key === 'string' ? key : key.toString()
        const cached = await redis.get(keyStr)
        if (cached) {
          const parsed = JSON.parse(cached) as CachedClassification
          if (parsed.sourceName === sourceName) {
            keys.push(keyStr)
          }
        }
      } catch (e) {
        // Ignorer erreurs de parsing
      }
    }

    // Supprimer les clés trouvées
    if (keys.length > 0) {
      await redis.del(...keys)
      console.log(`[ClassificationCache] Invalidated ${keys.length} cache entries for source: ${sourceName}`)
      return keys.length
    }

    return 0
  } catch (error) {
    console.error('[ClassificationCache] Failed to invalidate cache:', error)
    return 0
  }
}

/**
 * Récupère les statistiques du cache de classification
 *
 * @returns Nombre de clés en cache et taille estimée
 */
export async function getCacheStats(): Promise<{ count: number; exampleKeys: string[] }> {
  try {
    const redis = await getRedisClient()
    if (!redis) {
      return { count: 0, exampleKeys: [] }
    }

    const pattern = `${CACHE_PREFIX}:*`
    const keys: string[] = []

    // Utiliser scanIterator au lieu de scan direct (plus simple avec redis v5)
    for await (const key of redis.scanIterator({ MATCH: pattern, COUNT: 100 })) {
      const keyStr = typeof key === 'string' ? key : key.toString()
      keys.push(keyStr)
    }

    return {
      count: keys.length,
      exampleKeys: keys.slice(0, 5), // 5 premières clés pour debug
    }
  } catch (error) {
    console.error('[ClassificationCache] Failed to get cache stats:', error)
    return { count: 0, exampleKeys: [] }
  }
}
