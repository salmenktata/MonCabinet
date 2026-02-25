/**
 * Sémaphore Redis pour limiter la concurrence des appels LLM sur /api/chat
 *
 * Protège le VPS (8 Go RAM) contre les bursts de requêtes simultanées.
 * Utilise un compteur Redis INCR/DECR avec récupération automatique en cas de crash.
 *
 * Clé Redis : chat:semaphore:count
 * MAX_CONCURRENT : env CHAT_MAX_CONCURRENT (défaut 15)
 *
 * Usage :
 *   const acquired = await acquireChatSemaphore()
 *   if (!acquired) return NextResponse.json({ error: '...' }, { status: 503 })
 *   try {
 *     // appel LLM
 *   } finally {
 *     await releaseChatSemaphore()
 *   }
 */

import { createLogger } from '@/lib/logger'

const log = createLogger('ChatSemaphore')

const SEMAPHORE_KEY = 'chat:semaphore:count'
const MAX_CONCURRENT = parseInt(process.env.CHAT_MAX_CONCURRENT || '15', 10)

// Si le compteur dépasse ce seuil, on suppose une fuite et on le remet à 0
const STUCK_THRESHOLD = MAX_CONCURRENT * 3

/**
 * Tente d'acquérir un slot de concurrence.
 * @returns true si acquis, false si le maximum est atteint (→ renvoyer 503)
 */
export async function acquireChatSemaphore(): Promise<boolean> {
  try {
    const { getRedisClient } = await import('../cache/redis')
    const client = await getRedisClient()
    if (!client) return true // Redis indisponible → laisser passer (fail open)

    const count = await client.incr(SEMAPHORE_KEY)

    // Récupération automatique : compteur manifestement bloqué
    if (count > STUCK_THRESHOLD) {
      log.warn(`[ChatSemaphore] Compteur bloqué (${count} > ${STUCK_THRESHOLD}) → reset`)
      await client.set(SEMAPHORE_KEY, '1')
      return true
    }

    if (count > MAX_CONCURRENT) {
      await client.decr(SEMAPHORE_KEY)
      log.warn(`[ChatSemaphore] Capacité max atteinte (${MAX_CONCURRENT} requêtes simultanées)`)
      return false
    }

    return true
  } catch (err) {
    log.warn('Erreur sémaphore (non-bloquant):', err instanceof Error ? err.message : String(err))
    return true // fail open
  }
}

/**
 * Libère un slot de concurrence.
 * Toujours appeler dans un bloc finally.
 */
export async function releaseChatSemaphore(): Promise<void> {
  try {
    const { getRedisClient } = await import('../cache/redis')
    const client = await getRedisClient()
    if (!client) return

    // DECR sans descendre en dessous de 0
    const current = await client.get(SEMAPHORE_KEY)
    const val = parseInt(current || '0', 10)
    if (val > 0) {
      await client.decr(SEMAPHORE_KEY)
    }
  } catch (err) {
    log.warn('Erreur release sémaphore:', err instanceof Error ? err.message : String(err))
  }
}

/**
 * Retourne le nombre de requêtes LLM en cours.
 */
export async function getChatConcurrency(): Promise<number> {
  try {
    const { getRedisClient } = await import('../cache/redis')
    const client = await getRedisClient()
    if (!client) return 0
    const val = await client.get(SEMAPHORE_KEY)
    return Math.max(0, parseInt(val || '0', 10))
  } catch {
    return 0
  }
}

export { MAX_CONCURRENT }
