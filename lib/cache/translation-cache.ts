/**
 * Cache Redis pour les traductions AR ↔ FR
 *
 * Évite les appels API Groq répétés pour les mêmes traductions.
 * TTL: 30 jours par défaut (traductions stables).
 */

import {
  getRedisClient,
  isRedisAvailable,
  hashKey,
  CACHE_TTL,
} from './redis'

// =============================================================================
// TYPES
// =============================================================================

interface CachedTranslation {
  translatedText: string
  provider: string
  createdAt: number
}

// =============================================================================
// CLÉS REDIS
// =============================================================================

const TRANSLATION_KEY_PREFIX = 'trans'

/**
 * Génère la clé Redis pour une traduction
 */
async function getTranslationKey(
  text: string,
  from: 'ar' | 'fr',
  to: 'ar' | 'fr'
): Promise<string> {
  const textHash = await hashKey(text)
  return `${TRANSLATION_KEY_PREFIX}:${from}:${to}:${textHash}`
}

// =============================================================================
// CACHE TRADUCTIONS
// =============================================================================

/**
 * Récupère une traduction du cache
 * @param text - Texte original
 * @param from - Langue source
 * @param to - Langue cible
 * @returns Traduction si trouvée, null sinon
 */
export async function getCachedTranslation(
  text: string,
  from: 'ar' | 'fr',
  to: 'ar' | 'fr'
): Promise<string | null> {
  if (!isRedisAvailable()) {
    return null
  }

  try {
    const client = await getRedisClient()
    if (!client) return null

    const key = await getTranslationKey(text, from, to)
    const cached = await client.get(key)

    if (cached) {
      const data = JSON.parse(cached) as CachedTranslation
      console.log(`[TranslationCache] HIT: ${from}→${to} "${text.substring(0, 30)}..."`)
      return data.translatedText
    }

    return null
  } catch (error) {
    console.warn(
      '[TranslationCache] Erreur lecture:',
      error instanceof Error ? error.message : error
    )
    return null
  }
}

/**
 * Stocke une traduction dans le cache
 * @param text - Texte original
 * @param translatedText - Traduction
 * @param from - Langue source
 * @param to - Langue cible
 * @param provider - Provider utilisé (groq, etc.)
 */
export async function setCachedTranslation(
  text: string,
  translatedText: string,
  from: 'ar' | 'fr',
  to: 'ar' | 'fr',
  provider: string = 'groq'
): Promise<void> {
  if (!isRedisAvailable()) {
    return
  }

  try {
    const client = await getRedisClient()
    if (!client) return

    const key = await getTranslationKey(text, from, to)

    const data: CachedTranslation = {
      translatedText,
      provider,
      createdAt: Date.now(),
    }

    await client.setEx(key, CACHE_TTL.translation, JSON.stringify(data))
    console.log(`[TranslationCache] SET: ${from}→${to} (TTL: ${CACHE_TTL.translation}s)`)
  } catch (error) {
    console.warn(
      '[TranslationCache] Erreur écriture:',
      error instanceof Error ? error.message : error
    )
  }
}

/**
 * Invalide une traduction du cache
 */
export async function invalidateCachedTranslation(
  text: string,
  from: 'ar' | 'fr',
  to: 'ar' | 'fr'
): Promise<void> {
  if (!isRedisAvailable()) {
    return
  }

  try {
    const client = await getRedisClient()
    if (!client) return

    const key = await getTranslationKey(text, from, to)
    await client.del(key)
    console.log(`[TranslationCache] DEL: ${from}→${to}`)
  } catch (error) {
    console.warn(
      '[TranslationCache] Erreur suppression:',
      error instanceof Error ? error.message : error
    )
  }
}

/**
 * Statistiques du cache de traductions
 */
export async function getTranslationCacheStats(): Promise<{
  available: boolean
  keyCount?: number
  sizeByDirection?: Record<string, number>
}> {
  if (!isRedisAvailable()) {
    return { available: false }
  }

  try {
    const client = await getRedisClient()
    if (!client) return { available: false }

    // Compter les clés de traduction
    const keys = await client.keys(`${TRANSLATION_KEY_PREFIX}:*`)

    // Grouper par direction
    const sizeByDirection: Record<string, number> = {}
    for (const key of keys) {
      const parts = key.split(':')
      if (parts.length >= 3) {
        const direction = `${parts[1]}→${parts[2]}`
        sizeByDirection[direction] = (sizeByDirection[direction] || 0) + 1
      }
    }

    return {
      available: true,
      keyCount: keys.length,
      sizeByDirection,
    }
  } catch {
    return { available: false }
  }
}
