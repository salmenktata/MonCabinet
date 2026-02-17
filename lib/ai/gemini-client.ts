/**
 * Client Gemini 2.0 Flash-Lite
 *
 * Modèle économique de Google pour RAG à grande échelle.
 * - Tier gratuit: illimité en input/output (avec rate limiting 15 RPM)
 * - Tier payant: $0.075/M input, $0.30/M output
 * - Contexte: 1M tokens (excellent pour longs documents PDF)
 * - Langues: Excellent support AR/FR
 *
 * Intégré dans la stratégie LLM par contexte (RAG, web scraping, traduction)
 */

import { GoogleGenerativeAI, GenerateContentResult } from '@google/generative-ai'
import { aiConfig } from './config'

// =============================================================================
// TYPES
// =============================================================================

export interface GeminiMessage {
  role: 'user' | 'model' // Gemini utilise 'model' au lieu de 'assistant'
  parts: string | { text: string }
}

export interface GeminiOptions {
  temperature?: number
  maxTokens?: number
  systemInstruction?: string
}

export interface GeminiResponse {
  answer: string
  tokensUsed: {
    input: number
    output: number
    total: number
  }
  modelUsed: string
  finishReason: string
}

// =============================================================================
// CONFIGURATION
// =============================================================================

// Tier gratuit Gemini : 15 RPM (requêtes par minute)
// Source: https://ai.google.dev/pricing
const FREE_TIER_RPM_LIMIT = 15

// Seuil de sécurité Redis (marge de 2 pour éviter les races cross-instance)
const REDIS_RATE_LIMIT_THRESHOLD = 13

// Compteur in-memory pour les stats de monitoring (approximation locale)
let requestsThisMinute = 0
let currentMinuteTimestamp = Math.floor(Date.now() / 60000)

function resetRPMCounterIfNeeded(): void {
  const now = Math.floor(Date.now() / 60000)
  if (now > currentMinuteTimestamp) {
    requestsThisMinute = 0
    currentMinuteTimestamp = now
  }
}

/**
 * Vérifie le rate limit Gemini via Redis (partagé entre instances Docker).
 *
 * - Sliding window par minute (clé TTL 60s)
 * - Seuil 13/min (marge de sécurité sous la limite 15 RPM)
 * - Si Redis indisponible → fallback in-memory (fail open)
 * - Le throw '429:...' est capturé par isRateLimitError() dans llm-fallback-service.ts
 *   → cascade automatique vers Groq llama-3.3-70b
 */
async function checkGeminiRateLimitRedis(): Promise<void> {
  // Mise à jour compteur local pour les stats
  resetRPMCounterIfNeeded()
  requestsThisMinute++

  try {
    const { getRedisClient } = await import('../cache/redis')
    const client = await getRedisClient()

    if (!client) {
      // Redis indisponible → vérification in-memory uniquement
      if (requestsThisMinute > FREE_TIER_RPM_LIMIT) {
        throw new Error(`429: Gemini rate limit atteint (${requestsThisMinute}/${FREE_TIER_RPM_LIMIT} RPM in-memory)`)
      }
      return
    }

    // Clé Redis par minute (sliding window)
    const minuteKey = Math.floor(Date.now() / 60000)
    const key = `ratelimit:gemini:rpm:${minuteKey}`

    const count = await client.incr(key)
    if (count === 1) {
      // Première requête de cette minute → TTL 60s
      await client.expire(key, 60)
    }

    // Sync compteur local avec Redis
    requestsThisMinute = count

    if (count > REDIS_RATE_LIMIT_THRESHOLD) {
      throw new Error(`429: Gemini rate limit atteint (${count}/${FREE_TIER_RPM_LIMIT} RPM Redis)`)
    }
  } catch (error) {
    // Re-throw les erreurs de rate limit (429)
    if (error instanceof Error && (error.message.startsWith('429:') || error.message.includes('rate limit'))) {
      throw error
    }
    // Autres erreurs Redis (connexion, timeout…) → fail open pour ne pas bloquer le chat
    console.warn('[Gemini] Redis rate limit check failed, continuing:', error instanceof Error ? error.message : error)
  }
}

/**
 * Retourne les stats RPM pour monitoring (depuis compteur in-memory)
 */
export function getGeminiRPMStats(): {
  requestsThisMinute: number
  limit: number
  availableSlots: number
  minuteTimestamp: number
} {
  resetRPMCounterIfNeeded()
  return {
    requestsThisMinute,
    limit: FREE_TIER_RPM_LIMIT,
    availableSlots: Math.max(0, FREE_TIER_RPM_LIMIT - requestsThisMinute),
    minuteTimestamp: currentMinuteTimestamp,
  }
}

// =============================================================================
// CLIENT SINGLETON
// =============================================================================

let geminiClient: GoogleGenerativeAI | null = null

function getGeminiClient(): GoogleGenerativeAI {
  if (!geminiClient) {
    // Lire directement process.env pour éviter problème init module
    const apiKey = process.env.GOOGLE_API_KEY || aiConfig.gemini.apiKey
    if (!apiKey) {
      throw new Error(
        'GOOGLE_API_KEY non configuré. ' +
        'Créez une clé sur https://aistudio.google.com/app/apikey'
      )
    }
    geminiClient = new GoogleGenerativeAI(apiKey)
  }
  return geminiClient
}

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Convertit messages OpenAI format → Gemini format
 * OpenAI: { role: 'user' | 'assistant', content: string }
 * Gemini: { role: 'user' | 'model', parts: [{ text: string }] }
 */
export function convertMessagesToGeminiFormat(
  messages: Array<{ role: string; content: string }>,
  systemPrompt?: string
): { systemInstruction?: string; contents: Array<{ role: string; parts: Array<{ text: string }> }> } {
  // Séparer system message des autres
  const userMessages = messages.filter((m) => m.role !== 'system')

  // Mapper role 'assistant' → 'model'
  const geminiMessages = userMessages.map((m) => ({
    role: m.role === 'assistant' ? 'model' : m.role,
    parts: [{ text: m.content }],
  }))

  return {
    systemInstruction: systemPrompt,
    contents: geminiMessages,
  }
}

/**
 * Parse la réponse Gemini et extrait les tokens
 */
function parseGeminiResponse(result: GenerateContentResult): GeminiResponse {
  const response = result.response
  const text = response.text()

  // Extraire les tokens depuis usage metadata
  const usage = response.usageMetadata || {
    promptTokenCount: 0,
    candidatesTokenCount: 0,
    totalTokenCount: 0,
  }

  return {
    answer: text,
    tokensUsed: {
      input: usage.promptTokenCount || 0,
      output: usage.candidatesTokenCount || 0,
      total: usage.totalTokenCount || 0,
    },
    modelUsed: `gemini/${aiConfig.gemini.model}`,
    finishReason: response.candidates?.[0]?.finishReason || 'STOP',
  }
}

// =============================================================================
// FONCTIONS PRINCIPALES
// =============================================================================

/**
 * Appelle Gemini 2.0 Flash-Lite avec rate limiting automatique
 *
 * @param messages - Messages de conversation (format OpenAI compatible)
 * @param options - Options de génération
 * @returns Réponse Gemini avec tracking tokens
 */
export async function callGemini(
  messages: Array<{ role: string; content: string }>,
  options: GeminiOptions = {}
): Promise<GeminiResponse> {
  // Vérifier rate limit Redis (partagé entre instances Docker)
  await checkGeminiRateLimitRedis()

  const client = getGeminiClient()
  const model = client.getGenerativeModel({
    model: aiConfig.gemini.model,
    systemInstruction: options.systemInstruction,
  })

  // Convertir messages au format Gemini
  const { contents } = convertMessagesToGeminiFormat(messages, options.systemInstruction)

  // Préparer les paramètres de génération
  const generationConfig = {
    temperature: options.temperature ?? 0.3,
    maxOutputTokens: options.maxTokens || 4000,
  }

  try {
    const result = await model.generateContent({
      contents,
      generationConfig,
    })

    return parseGeminiResponse(result)
  } catch (error) {
    // Si erreur 429 (rate limit), logger pour monitoring
    if (error instanceof Error && error.message.includes('429')) {
      console.error('[Gemini] Rate limit error:', error.message)
      throw new Error(
        `Gemini quota épuisé ou rate limit atteint. ` +
        `Erreur: ${error.message}`
      )
    }

    // Si erreur 503 (service unavailable), retry possible
    if (error instanceof Error && error.message.includes('503')) {
      throw new Error(
        `Gemini temporairement indisponible (503). ` +
        `Le fallback va prendre le relais.`
      )
    }

    // Autres erreurs
    throw new Error(
      `Gemini error: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}

/**
 * Appelle Gemini en mode streaming (pour UI temps réel)
 * Note: À implémenter si besoin futur
 */
export async function* callGeminiStream(
  messages: Array<{ role: string; content: string }>,
  options: GeminiOptions = {}
): AsyncGenerator<string, void, unknown> {
  // Vérifier rate limit Redis (partagé entre instances Docker)
  await checkGeminiRateLimitRedis()

  const client = getGeminiClient()
  const model = client.getGenerativeModel({
    model: aiConfig.gemini.model,
    systemInstruction: options.systemInstruction,
  })

  const { contents } = convertMessagesToGeminiFormat(messages, options.systemInstruction)

  const result = await model.generateContentStream({
    contents,
    generationConfig: {
      temperature: options.temperature ?? 0.3,
      maxOutputTokens: options.maxTokens || 4000,
    },
  })

  for await (const chunk of result.stream) {
    const text = chunk.text()
    if (text) {
      yield text
    }
  }
}

/**
 * Vérifie la disponibilité de Gemini (health check)
 */
export async function checkGeminiHealth(): Promise<{
  available: boolean
  rpmStats: ReturnType<typeof getGeminiRPMStats>
  error?: string
}> {
  try {
    const stats = getGeminiRPMStats()

    // Si rate limit local atteint (approximation in-memory), retourner indisponible
    if (stats.availableSlots <= 0) {
      return {
        available: false,
        rpmStats: stats,
        error: 'Rate limit atteint (15 RPM)',
      }
    }

    // Test simple avec un prompt minimal
    const result = await callGemini([
      { role: 'user', content: 'Réponds "OK"' },
    ], { maxTokens: 10 })

    return {
      available: true,
      rpmStats: getGeminiRPMStats(),
    }
  } catch (error) {
    return {
      available: false,
      rpmStats: getGeminiRPMStats(),
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

/**
 * Retourne les informations sur le modèle Gemini
 */
export function getGeminiInfo(): {
  model: string
  contextWindow: number
  costInput: string
  costOutput: string
  freeTier: boolean
  rpmLimit: number
} {
  return {
    model: aiConfig.gemini.model,
    contextWindow: 1_000_000, // 1M tokens
    costInput: '$0.075/M',
    costOutput: '$0.30/M',
    freeTier: true,
    rpmLimit: FREE_TIER_RPM_LIMIT,
  }
}
