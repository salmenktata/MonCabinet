/**
 * Service de parsing et respect du fichier robots.txt
 * Cache les règles en mémoire pour éviter les requêtes répétées
 */

import { getRedisClient, CACHE_TTL } from '@/lib/cache/redis'
import type { RobotsRules } from './types'

// Cache en mémoire pour les règles robots.txt (fallback si Redis indisponible)
const robotsCache = new Map<string, { rules: RobotsRules; expiresAt: number }>()

// TTL du cache: 1 heure
const ROBOTS_CACHE_TTL = 60 * 60 * 1000

/**
 * Parse le contenu d'un fichier robots.txt
 */
function parseRobotsTxt(content: string, userAgent: string = 'QadhyaBot'): RobotsRules {
  const lines = content.split('\n').map(line => line.trim())

  let currentUserAgent = ''
  let matchesOurBot = false
  let matchesWildcard = false

  const disallowedPaths: string[] = []
  const sitemaps: string[] = []
  let crawlDelay: number | null = null

  const ourAgentLower = userAgent.toLowerCase()

  for (const line of lines) {
    // Ignorer les commentaires et lignes vides
    if (line.startsWith('#') || line === '') continue

    const colonIndex = line.indexOf(':')
    if (colonIndex === -1) continue

    const directive = line.substring(0, colonIndex).trim().toLowerCase()
    const value = line.substring(colonIndex + 1).trim()

    switch (directive) {
      case 'user-agent':
        currentUserAgent = value.toLowerCase()
        if (currentUserAgent === ourAgentLower || currentUserAgent.includes(ourAgentLower)) {
          matchesOurBot = true
        } else if (currentUserAgent === '*') {
          matchesWildcard = true
        } else {
          matchesOurBot = false
        }
        break

      case 'disallow':
        if ((matchesOurBot || matchesWildcard) && value) {
          disallowedPaths.push(value)
        }
        break

      case 'allow':
        // On pourrait gérer les règles Allow mais on garde simple pour l'instant
        break

      case 'crawl-delay':
        if (matchesOurBot || matchesWildcard) {
          const delay = parseFloat(value)
          if (!isNaN(delay)) {
            crawlDelay = delay * 1000 // Convertir en millisecondes
          }
        }
        break

      case 'sitemap':
        // Les sitemaps sont globaux, pas spécifiques au user-agent
        if (value) {
          sitemaps.push(value)
        }
        break
    }
  }

  return {
    allowed: true, // Par défaut autorisé sauf si path disallowed
    crawlDelay,
    sitemaps,
    disallowedPaths,
  }
}

/**
 * Vérifie si un chemin est autorisé selon les règles robots.txt
 */
function isPathAllowed(path: string, disallowedPaths: string[]): boolean {
  for (const disallowed of disallowedPaths) {
    // Gérer les wildcards simples
    if (disallowed.endsWith('*')) {
      const prefix = disallowed.slice(0, -1)
      if (path.startsWith(prefix)) {
        return false
      }
    } else if (disallowed.endsWith('$')) {
      // Correspondance exacte
      const exact = disallowed.slice(0, -1)
      if (path === exact) {
        return false
      }
    } else {
      // Correspondance de préfixe
      if (path.startsWith(disallowed)) {
        return false
      }
    }
  }
  return true
}

/**
 * Récupère et parse le robots.txt d'un domaine
 */
export async function getRobotsRules(
  baseUrl: string,
  userAgent: string = 'QadhyaBot'
): Promise<RobotsRules> {
  const url = new URL(baseUrl)
  const domain = url.origin
  const cacheKey = `robots:${domain}`

  // Vérifier le cache mémoire
  const cached = robotsCache.get(cacheKey)
  if (cached && cached.expiresAt > Date.now()) {
    return cached.rules
  }

  // Vérifier le cache Redis
  try {
    const redis = await getRedisClient()
    if (redis) {
      const cachedStr = await redis.get(cacheKey)
      if (cachedStr) {
        const rules = JSON.parse(cachedStr) as RobotsRules
        // Mettre aussi en cache mémoire
        robotsCache.set(cacheKey, {
          rules,
          expiresAt: Date.now() + ROBOTS_CACHE_TTL,
        })
        return rules
      }
    }
  } catch (error) {
    console.warn('[Robots] Erreur cache Redis:', error)
  }

  // Récupérer le robots.txt
  const robotsUrl = `${domain}/robots.txt`

  try {
    const response = await fetch(robotsUrl, {
      headers: {
        'User-Agent': userAgent,
      },
      signal: AbortSignal.timeout(10000),
    })

    if (!response.ok) {
      // Si pas de robots.txt, tout est autorisé
      const defaultRules: RobotsRules = {
        allowed: true,
        crawlDelay: null,
        sitemaps: [],
        disallowedPaths: [],
      }
      await cacheRules(cacheKey, defaultRules)
      return defaultRules
    }

    const content = await response.text()
    const rules = parseRobotsTxt(content, userAgent)

    await cacheRules(cacheKey, rules)
    return rules

  } catch (error) {
    console.warn(`[Robots] Erreur récupération ${robotsUrl}:`, error)

    // En cas d'erreur, on autorise le crawl mais avec un délai de prudence
    const fallbackRules: RobotsRules = {
      allowed: true,
      crawlDelay: 2000, // 2 secondes par précaution
      sitemaps: [],
      disallowedPaths: [],
    }
    return fallbackRules
  }
}

/**
 * Cache les règles en mémoire et Redis
 */
async function cacheRules(cacheKey: string, rules: RobotsRules): Promise<void> {
  // Cache mémoire
  robotsCache.set(cacheKey, {
    rules,
    expiresAt: Date.now() + ROBOTS_CACHE_TTL,
  })

  // Cache Redis
  try {
    const redis = await getRedisClient()
    if (redis) {
      await redis.setEx(cacheKey, CACHE_TTL.search, JSON.stringify(rules))
    }
  } catch (error) {
    console.warn('[Robots] Erreur écriture cache Redis:', error)
  }
}

/**
 * Vérifie si une URL est autorisée au crawl
 */
export async function isUrlAllowed(
  url: string,
  userAgent: string = 'QadhyaBot'
): Promise<{ allowed: boolean; crawlDelay: number | null }> {
  try {
    const urlObj = new URL(url)
    const rules = await getRobotsRules(url, userAgent)

    const allowed = isPathAllowed(urlObj.pathname, rules.disallowedPaths)

    return {
      allowed,
      crawlDelay: rules.crawlDelay,
    }
  } catch (error) {
    console.warn(`[Robots] Erreur vérification URL ${url}:`, error)
    return { allowed: true, crawlDelay: null }
  }
}

/**
 * Récupère les sitemaps déclarés dans robots.txt
 */
export async function getSitemapsFromRobots(baseUrl: string): Promise<string[]> {
  try {
    const rules = await getRobotsRules(baseUrl)
    return rules.sitemaps
  } catch (error) {
    console.warn('[Robots] Erreur récupération sitemaps:', error)
    return []
  }
}

/**
 * Nettoie le cache robots.txt
 */
export function clearRobotsCache(): void {
  robotsCache.clear()
}
