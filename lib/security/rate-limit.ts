/**
 * Rate Limiting simple basé sur la mémoire
 * Pour production, utiliser Redis ou un service externe
 */

interface RateLimitEntry {
  count: number
  resetTime: number
}

// Store en mémoire (pour dev/petit déploiement)
const rateLimitStore = new Map<string, RateLimitEntry>()

// Nettoyer les entrées expirées périodiquement
setInterval(() => {
  const now = Date.now()
  for (const [key, entry] of rateLimitStore.entries()) {
    if (entry.resetTime < now) {
      rateLimitStore.delete(key)
    }
  }
}, 60000) // Nettoyer toutes les minutes

interface RateLimitConfig {
  /** Nombre maximum de requêtes */
  limit: number
  /** Fenêtre de temps en secondes */
  windowSeconds: number
}

interface RateLimitResult {
  success: boolean
  remaining: number
  resetIn: number
}

/**
 * Vérifie et incrémente le rate limit pour une clé donnée
 */
export function checkRateLimit(
  key: string,
  config: RateLimitConfig
): RateLimitResult {
  const now = Date.now()
  const windowMs = config.windowSeconds * 1000
  const entry = rateLimitStore.get(key)

  if (!entry || entry.resetTime < now) {
    // Nouvelle fenêtre
    rateLimitStore.set(key, {
      count: 1,
      resetTime: now + windowMs,
    })
    return {
      success: true,
      remaining: config.limit - 1,
      resetIn: config.windowSeconds,
    }
  }

  // Fenêtre existante
  if (entry.count >= config.limit) {
    return {
      success: false,
      remaining: 0,
      resetIn: Math.ceil((entry.resetTime - now) / 1000),
    }
  }

  entry.count++
  return {
    success: true,
    remaining: config.limit - entry.count,
    resetIn: Math.ceil((entry.resetTime - now) / 1000),
  }
}

/**
 * Configurations prédéfinies pour différents types d'endpoints
 */
export const RATE_LIMITS = {
  // Actions admin sensibles (emails, triggers)
  ADMIN_ACTION: { limit: 5, windowSeconds: 60 },
  // API standard
  API_STANDARD: { limit: 100, windowSeconds: 60 },
  // Login/Auth
  AUTH: { limit: 5, windowSeconds: 300 },
  // Actions très sensibles (suppression, etc.)
  DESTRUCTIVE: { limit: 3, windowSeconds: 300 },
} as const
