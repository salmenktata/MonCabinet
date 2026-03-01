/**
 * Tracking d'usage DeepSeek — compteurs Redis daily
 *
 * Clés Redis :
 *   deepseek:usage:daily:{YYYY-MM-DD}:{model}   hash: { calls, tokens_in, tokens_out }
 *   deepseek:usage:daily:{YYYY-MM-DD}:total      hash: { calls }
 *
 * TTL : 35 jours
 *
 * Alerte budget : si le coût estimé dépasse $5/jour → log warn
 * (tarif cache hit : $0.028/M input, $0.42/M output — miss : $0.28/M)
 */

import { createLogger } from '@/lib/logger'

const log = createLogger('DeepSeekUsageTracker')

const TTL_SECONDS = 35 * 24 * 3600

// Tarif DeepSeek deepseek-chat (USD par token — vérifié mars 2026)
// https://api-docs.deepseek.com/quick_start/pricing
const PRICE_PER_TOKEN_IN_CACHE = 0.028 / 1_000_000   // cache hit input ($0.028/M)
const PRICE_PER_TOKEN_OUT = 0.42 / 1_000_000          // output ($0.42/M)

// Seuil d'alerte : $5/jour (protection anti-surprise)
const DAILY_COST_ALERT_USD = 5.0
// Anti-spam : une alerte toutes les 12h
const ALERT_COOLDOWN_SECONDS = 12 * 3600

/**
 * Incrémente les compteurs d'usage DeepSeek dans Redis.
 * Fire-and-forget — ne bloque jamais l'appel LLM.
 */
export async function trackDeepSeekUsage(
  model: string,
  tokensIn: number,
  tokensOut: number
): Promise<void> {
  try {
    const { getRedisClient } = await import('../cache/redis')
    const client = await getRedisClient()
    if (!client) return

    const dateKey = new Date().toISOString().slice(0, 10)
    const modelKey = `deepseek:usage:daily:${dateKey}:${model}`
    const totalKey = `deepseek:usage:daily:${dateKey}:total`

    await Promise.all([
      client.hIncrBy(modelKey, 'calls', 1),
      client.hIncrBy(modelKey, 'tokens_in', tokensIn),
      client.hIncrBy(modelKey, 'tokens_out', tokensOut),
      client.expire(modelKey, TTL_SECONDS),
      client.hIncrBy(totalKey, 'calls', 1),
      client.expire(totalKey, TTL_SECONDS),
    ])

    // Vérifier seuil budget (async, non-bloquant)
    checkBudgetAlert(client, dateKey, tokensIn, tokensOut).catch(() => {/* silencieux */})
  } catch (err) {
    log.warn('Erreur tracking DeepSeek (non-bloquant):', err instanceof Error ? err.message : String(err))
  }
}

async function checkBudgetAlert(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client: any,
  dateKey: string,
  latestTokensIn: number,
  latestTokensOut: number
): Promise<void> {
  // Lire tous les modèles connus pour agréger le coût journalier
  const models = ['deepseek-chat', 'deepseek-reasoner']
  let totalCostUsd = 0

  for (const model of models) {
    const data = await client.hGetAll(`deepseek:usage:daily:${dateKey}:${model}`)
    if (!data?.tokens_in) continue
    const tokIn = parseInt(data.tokens_in || '0', 10)
    const tokOut = parseInt(data.tokens_out || '0', 10)
    totalCostUsd += tokIn * PRICE_PER_TOKEN_IN_CACHE + tokOut * PRICE_PER_TOKEN_OUT
  }

  // Ajouter l'appel courant
  totalCostUsd += latestTokensIn * PRICE_PER_TOKEN_IN_CACHE + latestTokensOut * PRICE_PER_TOKEN_OUT

  if (totalCostUsd < DAILY_COST_ALERT_USD) return

  // Anti-spam
  const alertKey = `deepseek:alert:budget:${dateKey}`
  const alreadySent = await client.get(alertKey)
  if (alreadySent) return

  await client.set(alertKey, '1', { EX: ALERT_COOLDOWN_SECONDS })

  log.warn(
    `[DeepSeek Budget] ⚠️ Coût estimé $${totalCostUsd.toFixed(3)} aujourd'hui` +
    ` (seuil $${DAILY_COST_ALERT_USD} — vérifier les appels non-cachés)`
  )
}

/**
 * Récupère les statistiques DeepSeek des N derniers jours.
 */
export async function getDeepSeekDailyStats(days = 7): Promise<Array<{
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

      const totalData = await client.hGetAll(`deepseek:usage:daily:${dateKey}:total`)
      const totalCalls = parseInt(totalData?.calls || '0', 10)

      const models = ['deepseek-chat', 'deepseek-reasoner']
      const byModel: Record<string, { calls: number; tokensIn: number; tokensOut: number; estimatedCostUsd: number }> = {}

      for (const model of models) {
        const data = await client.hGetAll(`deepseek:usage:daily:${dateKey}:${model}`)
        if (!data || !data.calls) continue

        const calls = parseInt(data.calls || '0', 10)
        const tokensIn = parseInt(data.tokens_in || '0', 10)
        const tokensOut = parseInt(data.tokens_out || '0', 10)
        // Estimation coût (cache hit = tarif préférentiel)
        const estimatedCostUsd = tokensIn * PRICE_PER_TOKEN_IN_CACHE + tokensOut * PRICE_PER_TOKEN_OUT

        byModel[model] = { calls, tokensIn, tokensOut, estimatedCostUsd }
      }

      results.push({ date: dateKey, totalCalls, byModel })
    }

    return results
  } catch {
    return []
  }
}
