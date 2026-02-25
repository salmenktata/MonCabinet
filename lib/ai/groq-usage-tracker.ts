/**
 * Tracking d'usage Groq — compteurs Redis daily
 *
 * Clés Redis :
 *   groq:usage:daily:{YYYY-MM-DD}:{model}   hash: { calls, tokens_in, tokens_out }
 *   groq:usage:daily:{YYYY-MM-DD}:total      hash: { calls }
 *
 * TTL : 35 jours
 *
 * Alerte free tier : si le 70b dépasse 11 500 calls/jour (80% de 14 400) → email
 */

import { createLogger } from '@/lib/logger'

const log = createLogger('GroqUsageTracker')

const TTL_SECONDS = 35 * 24 * 3600

// Seuil d'alerte = 80% du free tier Groq pour llama-3.3-70b (14 400 req/jour)
const GROQ_70B_ALERT_THRESHOLD = 11_500
// Anti-spam : une alerte par modèle toutes les 12h
const ALERT_COOLDOWN_SECONDS = 12 * 3600

/**
 * Incrémente les compteurs d'usage Groq dans Redis.
 * Fire-and-forget — ne bloque jamais l'appel LLM.
 */
export async function trackGroqUsage(
  model: string,
  tokensIn: number,
  tokensOut: number
): Promise<void> {
  try {
    const { getRedisClient } = await import('../cache/redis')
    const client = await getRedisClient()
    if (!client) return

    const dateKey = new Date().toISOString().slice(0, 10)
    const modelKey = `groq:usage:daily:${dateKey}:${model}`
    const totalKey = `groq:usage:daily:${dateKey}:total`

    await Promise.all([
      client.hIncrBy(modelKey, 'calls', 1),
      client.hIncrBy(modelKey, 'tokens_in', tokensIn),
      client.hIncrBy(modelKey, 'tokens_out', tokensOut),
      client.expire(modelKey, TTL_SECONDS),
      client.hIncrBy(totalKey, 'calls', 1),
      client.expire(totalKey, TTL_SECONDS),
    ])

    // Vérifier seuil free tier pour le 70b (async, non-bloquant)
    if (model.includes('70b')) {
      checkFreeTierAlert(client, model, dateKey, modelKey).catch(() => {/* silencieux */})
    }
  } catch (err) {
    log.warn('Erreur tracking Groq (non-bloquant):', err instanceof Error ? err.message : String(err))
  }
}

async function checkFreeTierAlert(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client: any,
  model: string,
  dateKey: string,
  modelKey: string
): Promise<void> {
  const callsStr = await client.hGet(modelKey, 'calls')
  const calls = parseInt(callsStr || '0', 10)

  if (calls < GROQ_70B_ALERT_THRESHOLD) return

  // Anti-spam : vérifier si alerte déjà envoyée aujourd'hui
  const alertKey = `groq:alert:free-tier:${dateKey}:${model}`
  const alreadySent = await client.get(alertKey)
  if (alreadySent) return

  await client.set(alertKey, '1', { EX: ALERT_COOLDOWN_SECONDS })

  // Alerte console (visible dans les logs VPS)
  log.warn(
    `[Groq Free Tier] ⚠️ ${calls} appels aujourd'hui pour ${model}` +
    ` (${Math.round(calls / 14400 * 100)}% du free tier — seuil ${GROQ_70B_ALERT_THRESHOLD})`
  )
}

/**
 * Récupère les statistiques Groq des N derniers jours.
 */
export async function getGroqDailyStats(days = 7): Promise<Array<{
  date: string
  totalCalls: number
  byModel: Record<string, { calls: number; tokensIn: number; tokensOut: number; estimatedCostUsd: number }>
}>> {
  try {
    const { getRedisClient } = await import('../cache/redis')
    const client = await getRedisClient()
    if (!client) return []

    const results = []

    for (let i = 0; i < days; i++) {
      const date = new Date()
      date.setDate(date.getDate() - i)
      const dateKey = date.toISOString().slice(0, 10)

      const totalData = await client.hGetAll(`groq:usage:daily:${dateKey}:total`)
      const totalCalls = parseInt(totalData?.calls || '0', 10)

      // Lire les modèles connus
      const models = ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant']
      const byModel: Record<string, { calls: number; tokensIn: number; tokensOut: number; estimatedCostUsd: number }> = {}

      for (const model of models) {
        const data = await client.hGetAll(`groq:usage:daily:${dateKey}:${model}`)
        if (!data || !data.calls) continue

        const calls = parseInt(data.calls || '0', 10)
        const tokensIn = parseInt(data.tokens_in || '0', 10)
        const tokensOut = parseInt(data.tokens_out || '0', 10)
        const isSmall = model.includes('8b') || model.includes('instant')
        const estimatedCostUsd = isSmall
          ? (tokensIn / 1_000_000) * 0.05 + (tokensOut / 1_000_000) * 0.08
          : (tokensIn / 1_000_000) * 0.59 + (tokensOut / 1_000_000) * 0.79

        byModel[model] = { calls, tokensIn, tokensOut, estimatedCostUsd }
      }

      results.push({ date: dateKey, totalCalls, byModel })
    }

    return results
  } catch {
    return []
  }
}
