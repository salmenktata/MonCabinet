/**
 * Client Redis singleton pour le cache sémantique
 *
 * Gère:
 * - Cache des embeddings (TTL 7 jours)
 * - Cache des résultats de recherche (TTL 1 heure)
 */

import { createClient, RedisClientType } from 'redis'

// =============================================================================
// CONFIGURATION
// =============================================================================

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379'

// TTL par défaut en secondes
export const CACHE_TTL = {
  embedding: parseInt(process.env.EMBEDDING_CACHE_TTL || '604800', 10), // 7 jours
  search: parseInt(process.env.SEARCH_CACHE_TTL || '3600', 10), // 1 heure
  translation: parseInt(process.env.TRANSLATION_CACHE_TTL || '2592000', 10), // 30 jours
  feedbackBoost: parseInt(process.env.FEEDBACK_CACHE_TTL || '86400', 10), // 24 heures
}

// Seuil de similarité pour considérer un cache hit
export const SEARCH_CACHE_THRESHOLD = parseFloat(
  process.env.SEARCH_CACHE_THRESHOLD || '0.95'
)

// =============================================================================
// CLIENT SINGLETON
// =============================================================================

let redisClient: RedisClientType | null = null
let isConnected = false
let connectionPromise: Promise<void> | null = null

/**
 * Obtient ou crée le client Redis singleton
 */
export async function getRedisClient(): Promise<RedisClientType | null> {
  // Si déjà connecté, retourner le client
  if (redisClient && isConnected) {
    return redisClient
  }

  // Si connexion en cours, attendre
  if (connectionPromise) {
    await connectionPromise
    return redisClient
  }

  // Créer une nouvelle connexion
  connectionPromise = connectRedis()
  await connectionPromise
  connectionPromise = null

  return redisClient
}

/**
 * Connexion à Redis avec gestion d'erreurs
 */
async function connectRedis(): Promise<void> {
  try {
    redisClient = createClient({
      url: REDIS_URL,
      socket: {
        connectTimeout: 5000,
        reconnectStrategy: (retries) => {
          if (retries > 3) {
            console.warn('[Redis] Abandon reconnexion après 3 tentatives')
            return false
          }
          return Math.min(retries * 100, 3000)
        },
      },
    })

    // Gestionnaires d'événements
    redisClient.on('error', (err) => {
      console.error('[Redis] Erreur:', err.message)
      isConnected = false
    })

    redisClient.on('connect', () => {
      console.log('[Redis] Connexion établie')
      isConnected = true
    })

    redisClient.on('disconnect', () => {
      console.log('[Redis] Déconnecté')
      isConnected = false
    })

    redisClient.on('reconnecting', () => {
      console.log('[Redis] Reconnexion en cours...')
    })

    await redisClient.connect()
    isConnected = true
  } catch (error) {
    console.warn(
      '[Redis] Connexion échouée - cache désactivé:',
      error instanceof Error ? error.message : error
    )
    redisClient = null
    isConnected = false
  }
}

/**
 * Vérifie si Redis est disponible
 */
export function isRedisAvailable(): boolean {
  return isConnected && redisClient !== null
}

/**
 * Ferme la connexion Redis
 */
export async function closeRedis(): Promise<void> {
  if (redisClient) {
    await redisClient.quit()
    redisClient = null
    isConnected = false
    console.log('[Redis] Connexion fermée')
  }
}

/**
 * Health check Redis
 */
export async function redisHealthCheck(): Promise<boolean> {
  try {
    const client = await getRedisClient()
    if (!client) return false
    await client.ping()
    return true
  } catch {
    return false
  }
}

// =============================================================================
// UTILITAIRES
// =============================================================================

/**
 * Génère un hash SHA256 pour une clé de cache
 */
export async function hashKey(text: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(text)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
}

/**
 * Préfixes de clés Redis
 */
export const REDIS_KEYS = {
  embedding: (hash: string) => `emb:${hash}`,
  search: (hash: string, scope: string) => `search:${scope}:${hash}`,
  searchIndex: (scope: string) => `search_idx:${scope}`,
}
