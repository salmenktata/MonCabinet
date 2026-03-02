/**
 * Service LLM - Mode No-Fallback
 *
 * Chaque opération utilise UN SEUL provider fixe défini dans operations-config.ts.
 * Si le provider échoue → throw + alerte email (pas de dégradation silencieuse).
 *
 * En cas d'urgence, LLM_FALLBACK_ENABLED=true réactive le mode cascade legacy.
 *
 * Configuration définitive RAG Haute Qualité (Février 2026)
 */

import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'
import { aiConfig, SYSTEM_PROMPTS } from './config'
import { callGemini, callGeminiStream, GeminiResponse } from './gemini-client'
import { getOperationConfig, getOperationProvider, getOperationModel, type OperationName } from './operations-config'
import { logger } from '@/lib/logger'
import { getRedisClient } from '@/lib/cache/redis'

// =============================================================================
// TYPES
// =============================================================================

export type LLMProvider = 'gemini' | 'groq' | 'deepseek' | 'anthropic' | 'ollama' | 'openai'

/**
 * Contextes d'utilisation IA (rétrocompatibilité)
 */
export type AIContext =
  | 'rag-chat'
  | 'embeddings'
  | 'quality-analysis'
  | 'structuring'
  | 'translation'
  | 'web-scraping'
  | 'default'

export interface LLMMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
}

export interface LLMOptions {
  temperature?: number
  maxTokens?: number
  systemPrompt?: string
  /** @deprecated Utiliser operationName */
  context?: AIContext
  /** Type d'opération pour configuration fixe (1 provider, pas de fallback) */
  operationName?: OperationName
  /** Override du modèle pour un appel spécifique (utilisé dans fallbackChain) */
  modelOverride?: string
}

export interface LLMResponse {
  answer: string
  tokensUsed: {
    input: number
    output: number
    total: number
  }
  modelUsed: string
  provider: LLMProvider
  fallbackUsed: boolean
  originalProvider?: LLMProvider
}

// =============================================================================
// CONFIGURATION
// =============================================================================

/** Kill switch d'urgence: réactive le mode cascade legacy si true */
const LLM_FALLBACK_ENABLED = process.env.LLM_FALLBACK_ENABLED === 'true'

/** Ordre de fallback global (quand aucun fallbackChain n'est défini dans operations-config) */
const FALLBACK_ORDER: LLMProvider[] = ['groq', 'gemini', 'openai', 'ollama']

// =============================================================================
// CIRCUIT BREAKER
// =============================================================================

interface CircuitBreakerState {
  failCount: number
  cooldownUntil: number // timestamp ms
}

/**
 * Circuit breaker persisté dans Redis (P1 fix Feb 24, 2026).
 * Fallback in-memory si Redis indisponible (restart ne remet plus à zéro).
 * Clé Redis : circuit:state:{provider} → JSON CircuitBreakerState, TTL = cooldown
 */
const circuitBreakerMap = new Map<LLMProvider, CircuitBreakerState>() // fallback in-memory

const CIRCUIT_BREAKER_FAIL_THRESHOLD = 5
const CIRCUIT_BREAKER_INITIAL_COOLDOWN_MS = 60_000
const CIRCUIT_BREAKER_MAX_COOLDOWN_MS = 300_000

function _redisKey(provider: LLMProvider): string {
  return `circuit:state:${provider}`
}

/** Lit l'état du circuit breaker depuis Redis (ou fallback in-memory) */
async function _getCircuitState(provider: LLMProvider): Promise<CircuitBreakerState> {
  try {
    const redis = await getRedisClient()
    if (redis) {
      const raw = await redis.get(_redisKey(provider))
      if (raw) return JSON.parse(raw) as CircuitBreakerState
    }
  } catch { /* Ignore Redis errors, use in-memory fallback */ }
  return circuitBreakerMap.get(provider) ?? { failCount: 0, cooldownUntil: 0 }
}

/** Écrit l'état du circuit breaker dans Redis ET in-memory */
async function _setCircuitState(provider: LLMProvider, state: CircuitBreakerState): Promise<void> {
  circuitBreakerMap.set(provider, state)
  try {
    const redis = await getRedisClient()
    if (redis) {
      const ttlSec = state.cooldownUntil > 0
        ? Math.ceil((state.cooldownUntil - Date.now()) / 1000) + 10
        : CIRCUIT_BREAKER_MAX_COOLDOWN_MS / 1000
      await redis.set(_redisKey(provider), JSON.stringify(state), { EX: Math.max(ttlSec, 60) })
    }
  } catch { /* Ignore Redis errors */ }
}

/**
 * Enregistre un échec pour un provider. Ouvre le circuit si seuil atteint.
 */
function recordProviderFailure(provider: LLMProvider): void {
  _getCircuitState(provider).then(state => {
    state.failCount += 1

    if (state.failCount >= CIRCUIT_BREAKER_FAIL_THRESHOLD) {
      // Backoff exponentiel : 60s → 120s → 240s → 300s max
      const exponent = Math.min(state.failCount - CIRCUIT_BREAKER_FAIL_THRESHOLD, 3)
      const cooldownMs = Math.min(
        CIRCUIT_BREAKER_INITIAL_COOLDOWN_MS * Math.pow(2, exponent),
        CIRCUIT_BREAKER_MAX_COOLDOWN_MS
      )
      state.cooldownUntil = Date.now() + cooldownMs
      logger.warn(
        `[CircuitBreaker] 🔴 ${provider} ouvert après ${state.failCount} échecs — cooldown ${cooldownMs / 1000}s (persisté Redis)`
      )
    }

    _setCircuitState(provider, state).catch(() => {})
  }).catch(() => {
    // Fallback synchrone in-memory si _getCircuitState échoue
    const state = circuitBreakerMap.get(provider) ?? { failCount: 0, cooldownUntil: 0 }
    state.failCount += 1
    circuitBreakerMap.set(provider, state)
  })
}

/**
 * Enregistre un succès pour un provider. Réinitialise le compteur d'échecs.
 */
function recordProviderSuccess(provider: LLMProvider): void {
  _getCircuitState(provider).then(state => {
    if (state.failCount > 0) {
      _setCircuitState(provider, { failCount: 0, cooldownUntil: 0 }).catch(() => {})
    }
  }).catch(() => {
    const state = circuitBreakerMap.get(provider)
    if (state && state.failCount > 0) {
      circuitBreakerMap.set(provider, { failCount: 0, cooldownUntil: 0 })
    }
  })
}

/**
 * Vérifie si un provider est disponible selon son état de circuit breaker.
 * Retourne false si le circuit est ouvert (en cooldown).
 * NOTE: version synchrone (lit le cache in-memory) pour ne pas bloquer le hot path.
 * La persistance Redis est async en arrière-plan.
 */
function isProviderCircuitClosed(provider: LLMProvider): boolean {
  const state = circuitBreakerMap.get(provider)
  if (!state) return true

  if (state.cooldownUntil > 0 && Date.now() < state.cooldownUntil) {
    const remainingSec = Math.ceil((state.cooldownUntil - Date.now()) / 1000)
    logger.warn(`[CircuitBreaker] ⛔ ${provider} en cooldown (${remainingSec}s restants)`)
    return false
  }

  // Cooldown expiré → circuit en half-open (on laisse passer 1 tentative)
  if (state.cooldownUntil > 0 && Date.now() >= state.cooldownUntil) {
    logger.info(`[CircuitBreaker] 🟡 ${provider} half-open — tentative de rétablissement`)
  }

  return true
}

/**
 * Initialise le circuit breaker depuis Redis au démarrage.
 * Appelé une fois à l'import (fire-and-forget).
 */
async function _restoreCircuitStateFromRedis(): Promise<void> {
  try {
    const redis = await getRedisClient()
    if (!redis) return
    const providers: LLMProvider[] = ['gemini', 'groq', 'deepseek', 'anthropic', 'openai', 'ollama']
    await Promise.all(providers.map(async (p) => {
      const raw = await redis.get(_redisKey(p))
      if (raw) {
        const state = JSON.parse(raw) as CircuitBreakerState
        // Ne restaurer que si le cooldown est encore actif
        if (state.cooldownUntil > Date.now()) {
          circuitBreakerMap.set(p, state)
          const remainingSec = Math.ceil((state.cooldownUntil - Date.now()) / 1000)
          logger.info(`[CircuitBreaker] 🔄 ${p} restauré depuis Redis — cooldown ${remainingSec}s restants`)
        }
      }
    }))
  } catch { /* Redis indisponible au démarrage — dégradation gracieuse */ }
}

// Restaurer l'état au démarrage (fire-and-forget)
_restoreCircuitStateFromRedis().catch(() => {})

// =============================================================================
// CLIENTS LLM (singletons)
// =============================================================================

let anthropicClient: Anthropic | null = null
let groqClient: OpenAI | null = null
let deepseekClient: OpenAI | null = null
let openaiClient: OpenAI | null = null

function getAnthropicClient(): Anthropic {
  if (!anthropicClient) {
    anthropicClient = new Anthropic({ apiKey: aiConfig.anthropic.apiKey })
  }
  return anthropicClient
}

function getGroqClient(): OpenAI {
  if (!groqClient) {
    groqClient = new OpenAI({
      apiKey: aiConfig.groq.apiKey,
      baseURL: aiConfig.groq.baseUrl,
    })
  }
  return groqClient
}

function getDeepSeekClient(): OpenAI {
  if (!deepseekClient) {
    const apiKey = process.env.DEEPSEEK_API_KEY || aiConfig.deepseek.apiKey
    if (!apiKey) {
      throw new Error('DEEPSEEK_API_KEY non configuré')
    }
    deepseekClient = new OpenAI({
      apiKey,
      baseURL: aiConfig.deepseek.baseUrl,
    })
  }
  return deepseekClient
}

function getOpenAIClient(): OpenAI {
  if (!openaiClient) {
    const apiKey = process.env.OPENAI_API_KEY || aiConfig.openai?.apiKey
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY non configuré')
    }
    openaiClient = new OpenAI({
      apiKey,
    })
  }
  return openaiClient
}

/**
 * Appelle Ollama directement via fetch
 */
async function callOllamaAPI(
  messages: Array<{ role: string; content: string }>,
  temperature: number,
  maxTokens: number
): Promise<{ content: string; tokens?: number }> {
  const model = aiConfig.ollama.chatModelDefault
  const timeout = aiConfig.ollama.chatTimeoutDefault

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeout)

  try {
    const response = await fetch(`${aiConfig.ollama.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages,
        stream: false,
        think: false,
        options: {
          temperature,
          num_predict: maxTokens,
        },
      }),
      signal: controller.signal,
    })

    if (!response.ok) {
      throw new Error(`Erreur Ollama: ${response.status}`)
    }

    const data = await response.json()
    // Supprimer les balises <think>...</think> (qwen3 thinking mode résiduel)
    const rawContent: string = data.message?.content || ''
    const content = rawContent.replace(/<think>[\s\S]*?<\/think>\n?/g, '').trim()
    return {
      content,
      tokens: data.eval_count || 0,
    }
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`Timeout après ${timeout / 1000}s (modèle: ${model})`)
    }
    throw error
  } finally {
    clearTimeout(timeoutId)
  }
}

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Vérifie si l'erreur est une erreur de rate limit (429)
 */
export function isRateLimitError(error: unknown): boolean {
  if (error instanceof Error) {
    const message = error.message.toLowerCase()
    return (
      message.includes('429') ||
      message.includes('rate limit') ||
      message.includes('rate_limit') ||
      message.includes('too many requests') ||
      message.includes('quota exceeded')
    )
  }

  if (typeof error === 'object' && error !== null) {
    const err = error as { status?: number; statusCode?: number }
    return err.status === 429 || err.statusCode === 429
  }

  return false
}

/**
 * Vérifie si l'erreur est une erreur serveur ou timeout (récupérable par fallback)
 */
export function isServerOrTimeoutError(error: unknown): boolean {
  if (error instanceof Error) {
    const message = error.message.toLowerCase()
    return (
      message.includes('timeout') ||
      message.includes('timed out') ||
      message.includes('abort') ||
      message.includes('503') ||
      message.includes('502') ||
      message.includes('500') ||
      message.includes('service unavailable') ||
      message.includes('internal server error') ||
      message.includes('overloaded')
    )
  }
  if (typeof error === 'object' && error !== null) {
    const err = error as { status?: number; statusCode?: number }
    return [500, 502, 503, 504].includes(err.status ?? err.statusCode ?? 0)
  }
  return false
}

/**
 * Vérifie si l'erreur est due à un dépassement de la fenêtre de contexte (context_length_exceeded).
 * Ces erreurs sont récupérables en passant à un provider avec un contexte plus grand.
 */
export function isContextLengthExceeded(error: unknown): boolean {
  if (error instanceof Error) {
    const msg = error.message.toLowerCase()
    return (
      msg.includes('context_length_exceeded') ||
      msg.includes('maximum context length') ||
      msg.includes('context window') ||
      msg.includes('too many tokens') ||
      msg.includes('reduce the length') ||
      msg.includes('input is too long') ||
      msg.includes('tokens in the messages') ||
      (msg.includes('400') && msg.includes('token'))
    )
  }
  if (typeof error === 'object' && error !== null) {
    const err = error as { code?: string }
    return err.code === 'context_length_exceeded'
  }
  return false
}

/**
 * Retourne la liste des providers disponibles (avec clé API configurée)
 * Note: vérifie uniquement la présence de clé — utiliser checkProviderHealth() pour un ping réel
 */
export function getAvailableProviders(): LLMProvider[] {
  return FALLBACK_ORDER.filter((provider) => {
    switch (provider) {
      case 'gemini':
        return !!(process.env.GOOGLE_API_KEY || aiConfig.gemini.apiKey)
      case 'groq':
        return !!(process.env.GROQ_API_KEY || aiConfig.groq.apiKey)
      case 'deepseek':
        return !!(process.env.DEEPSEEK_API_KEY || aiConfig.deepseek.apiKey)
      case 'anthropic':
        return !!(process.env.ANTHROPIC_API_KEY || aiConfig.anthropic.apiKey)
      case 'openai':
        return !!(process.env.OPENAI_API_KEY || aiConfig.openai?.apiKey)
      case 'ollama':
        return process.env.OLLAMA_ENABLED === 'true' || aiConfig.ollama.enabled
      default:
        return false
    }
  })
}

// =============================================================================
// HEALTH CHECK PROVIDERS (Fix P2 Feb 24, 2026)
// =============================================================================

/** Cache en mémoire des résultats health check (TTL 5 min) */
const _healthCheckCache = new Map<LLMProvider, { ok: boolean; ts: number }>()
const HEALTH_CHECK_TTL_MS = 5 * 60 * 1000 // 5 min

/**
 * Vérifie si un provider est réellement opérationnel via un ping léger.
 * Résultat mis en cache 5 min. Utilisé pour détecter clés expirées / quotas.
 * Appelé de manière proactive (pas dans le hot path).
 */
export async function checkProviderHealth(provider: LLMProvider): Promise<boolean> {
  const cached = _healthCheckCache.get(provider)
  if (cached && Date.now() - cached.ts < HEALTH_CHECK_TTL_MS) {
    return cached.ok
  }

  let ok = false
  try {
    switch (provider) {
      case 'groq': {
        const client = getGroqClient()
        await client.chat.completions.create({
          model: aiConfig.groq.model,
          messages: [{ role: 'user', content: 'ping' }],
          max_tokens: 1,
          temperature: 0,
        })
        ok = true
        break
      }
      case 'gemini': {
        const resp = await callGemini(
          [{ role: 'user', content: 'ping' }],
          { temperature: 0, maxTokens: 1 }
        )
        ok = resp.answer !== undefined
        break
      }
      case 'openai': {
        const client = getOpenAIClient()
        await client.chat.completions.create({
          model: aiConfig.openai?.chatModel || 'gpt-4o-mini',
          messages: [{ role: 'user', content: 'ping' }],
          max_tokens: 1,
          temperature: 0,
        })
        ok = true
        break
      }
      case 'ollama': {
        const resp = await fetch(`${aiConfig.ollama.baseUrl}/api/tags`, { signal: AbortSignal.timeout(3000) })
        ok = resp.ok
        break
      }
      default:
        ok = getAvailableProviders().includes(provider)
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    const isQuotaOrAuth = msg.includes('401') || msg.includes('403') || msg.includes('quota') || msg.includes('billing')
    if (isQuotaOrAuth) {
      logger.error(`[HealthCheck] 🔑 ${provider} clé invalide/quota dépassé: ${msg.substring(0, 80)}`)
      // Ouvrir le circuit breaker immédiatement
      _setCircuitState(provider, {
        failCount: CIRCUIT_BREAKER_FAIL_THRESHOLD,
        cooldownUntil: Date.now() + CIRCUIT_BREAKER_MAX_COOLDOWN_MS,
      }).catch(() => {})
    } else {
      logger.warn(`[HealthCheck] ${provider} ping échoué: ${msg.substring(0, 80)}`)
    }
    ok = false
  }

  _healthCheckCache.set(provider, { ok, ts: Date.now() })
  logger.info(`[HealthCheck] ${provider}: ${ok ? '✅ OK' : '❌ KO'}`)
  return ok
}

/**
 * Vérifie tous les providers configurés et retourne un résumé.
 * À appeler depuis un endpoint de monitoring ou un cron léger.
 */
export async function checkAllProvidersHealth(): Promise<Record<LLMProvider, boolean>> {
  const providers = getAvailableProviders()
  const results = await Promise.allSettled(providers.map(p => checkProviderHealth(p)))
  const summary: Partial<Record<LLMProvider, boolean>> = {}
  providers.forEach((p, i) => {
    summary[p] = results[i].status === 'fulfilled' ? results[i].value : false
  })
  return summary as Record<LLMProvider, boolean>
}

// =============================================================================
// APPELS LLM PAR PROVIDER
// =============================================================================

/**
 * Appelle un provider spécifique
 */
async function callProvider(
  provider: LLMProvider,
  messages: LLMMessage[],
  options: LLMOptions
): Promise<LLMResponse> {
  const systemPrompt = options.systemPrompt || SYSTEM_PROMPTS.qadhya
  const temperature = options.temperature ?? 0.3
  const maxTokens = options.maxTokens || aiConfig.anthropic.maxTokens

  const userMessages = messages.filter((m) => m.role !== 'system')

  switch (provider) {
    case 'gemini': {
      const geminiResponse: GeminiResponse = await callGemini(
        [{ role: 'system', content: systemPrompt }, ...userMessages],
        { temperature, maxTokens, systemInstruction: systemPrompt, model: options.modelOverride }
      )

      return {
        answer: geminiResponse.answer,
        tokensUsed: geminiResponse.tokensUsed,
        modelUsed: geminiResponse.modelUsed,
        provider: 'gemini',
        fallbackUsed: false,
      }
    }

    case 'groq': {
      const client = getGroqClient()
      const model = options.modelOverride || aiConfig.groq.model
      const response = await client.chat.completions.create({
        model,
        max_tokens: maxTokens,
        messages: [{ role: 'system', content: systemPrompt }, ...userMessages],
        temperature,
      })

      return {
        answer: response.choices[0]?.message?.content || '',
        tokensUsed: {
          input: response.usage?.prompt_tokens || 0,
          output: response.usage?.completion_tokens || 0,
          total: response.usage?.total_tokens || 0,
        },
        modelUsed: model,
        provider: 'groq',
        fallbackUsed: false,
      }
    }

    case 'deepseek': {
      const client = getDeepSeekClient()
      const response = await client.chat.completions.create({
        model: aiConfig.deepseek.model,
        max_tokens: maxTokens,
        messages: [{ role: 'system', content: systemPrompt }, ...userMessages],
        temperature,
      })

      return {
        answer: response.choices[0]?.message?.content || '',
        tokensUsed: {
          input: response.usage?.prompt_tokens || 0,
          output: response.usage?.completion_tokens || 0,
          total: response.usage?.total_tokens || 0,
        },
        modelUsed: `deepseek/${aiConfig.deepseek.model}`,
        provider: 'deepseek',
        fallbackUsed: false,
      }
    }

    case 'openai': {
      const client = getOpenAIClient()
      const model = options.modelOverride || aiConfig.openai?.chatModel || 'gpt-4.1-mini'
      const response = await client.chat.completions.create({
        model,
        max_tokens: maxTokens,
        messages: [{ role: 'system', content: systemPrompt }, ...userMessages],
        temperature,
      })

      return {
        answer: response.choices[0]?.message?.content || '',
        tokensUsed: {
          input: response.usage?.prompt_tokens || 0,
          output: response.usage?.completion_tokens || 0,
          total: response.usage?.total_tokens || 0,
        },
        modelUsed: `openai/${model}`,
        provider: 'openai',
        fallbackUsed: false,
      }
    }

    case 'anthropic': {
      const client = getAnthropicClient()
      const anthropicMessages = userMessages.map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      }))

      const response = await client.messages.create({
        model: aiConfig.anthropic.model,
        max_tokens: maxTokens,
        system: systemPrompt,
        messages: anthropicMessages,
        temperature,
      })

      return {
        answer: response.content[0].type === 'text' ? response.content[0].text : '',
        tokensUsed: {
          input: response.usage.input_tokens,
          output: response.usage.output_tokens,
          total: response.usage.input_tokens + response.usage.output_tokens,
        },
        modelUsed: aiConfig.anthropic.model,
        provider: 'anthropic',
        fallbackUsed: false,
      }
    }

    case 'ollama': {
      const ollamaResponse = await callOllamaAPI(
        [{ role: 'system', content: systemPrompt }, ...userMessages],
        temperature,
        maxTokens
      )

      return {
        answer: ollamaResponse.content,
        tokensUsed: {
          input: 0,
          output: ollamaResponse.tokens || 0,
          total: ollamaResponse.tokens || 0,
        },
        modelUsed: `ollama/${aiConfig.ollama.chatModelDefault}`,
        provider: 'ollama',
        fallbackUsed: false,
      }
    }

    default:
      throw new Error(`Provider non supporté: ${provider}`)
  }
}

// =============================================================================
// ALERTES EN CAS D'ÉCHEC
// =============================================================================

/**
 * Envoie une alerte quand un provider échoue (mode no-fallback)
 * Utilise le système d'alertes existant (checkAndSendAlerts via cron)
 * + log structuré pour détection par monitoring
 */
async function sendProviderFailureAlert(
  provider: LLMProvider,
  operationName: string | undefined,
  error: Error
): Promise<void> {
  // Log structuré détectable par le monitoring cron
  logger.error('LLM_PROVIDER_FAILURE', JSON.stringify({
    provider,
    operation: operationName || 'default',
    error: error.message,
    timestamp: new Date().toISOString(),
    severity: 'critical',
  }))
}

// =============================================================================
// FONCTION PRINCIPALE - MODE NO-FALLBACK
// =============================================================================

/**
 * Appelle le LLM configuré pour l'opération donnée.
 *
 * Mode No-Fallback (défaut):
 * - 1 appel = 1 provider fixe (défini dans operations-config.ts)
 * - Si échec → throw + alerte email
 *
 * Mode Legacy (LLM_FALLBACK_ENABLED=true):
 * - Cascade de providers (kill switch d'urgence)
 *
 * @param messages - Messages de la conversation
 * @param options - Options LLM (operationName recommandé)
 * @param usePremiumModel - Ignoré en mode no-fallback
 */
export async function callLLMWithFallback(
  messages: LLMMessage[],
  options: LLMOptions = {},
  usePremiumModel: boolean = false
): Promise<LLMResponse> {
  // Extraire le system message si présent dans les messages
  const systemMessage = messages.find(m => m.role === 'system')
  if (systemMessage && !options.systemPrompt) {
    options = { ...options, systemPrompt: systemMessage.content }
  }

  // Résoudre le provider depuis la config opération
  let operationConfig
  if (options.operationName) {
    operationConfig = getOperationConfig(options.operationName)
    options.temperature = options.temperature ?? operationConfig.llmConfig?.temperature
    options.maxTokens = options.maxTokens || operationConfig.llmConfig?.maxTokens
  }

  // =========================================================================
  // MODE NO-FALLBACK (défaut) : 1 provider fixe par opération
  // =========================================================================
  if (!LLM_FALLBACK_ENABLED) {
    // Déterminer le provider unique
    let provider: LLMProvider

    if (operationConfig) {
      provider = operationConfig.model.provider
    } else {
      // Pas d'operationName → utiliser le provider par défaut selon l'env
      const isDev = process.env.NODE_ENV === 'development'
      if (isDev && aiConfig.ollama.enabled) {
        provider = 'ollama'
      } else if (aiConfig.groq.apiKey) {
        provider = 'groq'
      } else if (aiConfig.gemini.apiKey) {
        provider = 'gemini'
      } else if (aiConfig.openai?.apiKey) {
        provider = 'openai'
      } else if (aiConfig.ollama.enabled) {
        provider = 'ollama'
      } else {
        throw new Error(
          'Aucun provider LLM configuré. Définissez GROQ_API_KEY, GOOGLE_API_KEY, OPENAI_API_KEY ou OLLAMA_ENABLED=true'
        )
      }
    }

    // Vérifier le circuit breaker avant d'appeler le provider
    if (!isProviderCircuitClosed(provider)) {
      // Circuit ouvert → chercher un fallback disponible immédiatement
      const available = getAvailableProviders().filter(p => p !== provider && isProviderCircuitClosed(p))
      if (available.length > 0) {
        const fallbackProvider = available[0]
        logger.warn(
          `[LLM] ⚡ Circuit ouvert pour ${provider}, redirection directe → ${fallbackProvider} (${options.operationName || 'default'})`
        )
        try {
          const response = await callProvider(fallbackProvider, messages, options)
          recordProviderSuccess(fallbackProvider)
          return { ...response, fallbackUsed: true, originalProvider: provider }
        } catch (fallbackErr) {
          recordProviderFailure(fallbackProvider)
          throw new Error(
            `Circuit ouvert pour ${provider} et fallback ${fallbackProvider} échoué: ${fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr)}`
          )
        }
      }
      throw new Error(
        `Circuit ouvert pour ${provider} (${options.operationName || 'default'}) et aucun provider alternatif disponible`
      )
    }

    logger.info(
      `[LLM] ${options.operationName || 'default'} → ${provider} (no-fallback)`
    )

    try {
      const response = await callProvider(provider, messages, options)
      recordProviderSuccess(provider)
      // Tracking daily usage (fire-and-forget — ne bloque pas la réponse)
      if (provider === 'deepseek' && response.tokensUsed) {
        import('./deepseek-usage-tracker').then(({ trackDeepSeekUsage }) =>
          trackDeepSeekUsage(response.modelUsed || 'unknown', response.tokensUsed.input, response.tokensUsed.output)
        ).catch(() => {/* silencieux */})
      }
      if (provider === 'groq' && response.tokensUsed) {
        import('./groq-usage-tracker').then(({ trackGroqUsage }) =>
          trackGroqUsage(response.modelUsed || 'unknown', response.tokensUsed.input, response.tokensUsed.output)
        ).catch(() => {/* silencieux */})
      }
      return response
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error))

      // Sur erreur récupérable (429, context_length_exceeded, 5xx, timeout) → cascade fallback
      const isRecoverable = isRateLimitError(error) || isServerOrTimeoutError(error) || isContextLengthExceeded(error)
      if (isRecoverable) {
        recordProviderFailure(provider)
        const reason = isRateLimitError(error) ? 'rate-limité'
          : isContextLengthExceeded(error) ? 'context-dépassé'
          : 'erreur serveur/timeout'
        logger.warn(
          `[LLM] ⚠️ ${provider} ${reason} pour ${options.operationName || 'default'}, cascade fallback...`
        )

        // Utiliser fallbackChain de la config opération si disponible, sinon FALLBACK_ORDER global
        const fallbackEntries = (operationConfig?.fallbackChain && operationConfig.fallbackChain.length > 0)
          ? operationConfig.fallbackChain
              .filter(fb => isProviderCircuitClosed(fb.provider))
              .map(fb => ({ provider: fb.provider, modelOverride: fb.model }))
          : getAvailableProviders()
              .filter(p => p !== provider && isProviderCircuitClosed(p))
              .map(p => ({ provider: p, modelOverride: undefined }))

        for (const { provider: fallbackProvider, modelOverride } of fallbackEntries) {
          try {
            const fallbackOptions = modelOverride ? { ...options, modelOverride } : options
            const response = await callProvider(fallbackProvider, messages, fallbackOptions)
            recordProviderSuccess(fallbackProvider)
            if (fallbackProvider === 'groq' && response.tokensUsed) {
              import('./groq-usage-tracker').then(({ trackGroqUsage }) =>
                trackGroqUsage(response.modelUsed || 'unknown', response.tokensUsed.input, response.tokensUsed.output)
              ).catch(() => {/* silencieux */})
            }
            logger.info(`[LLM] ✓ Fallback réussi: ${provider} → ${fallbackProvider}${modelOverride ? `/${modelOverride}` : ''} (${reason})`)
            return {
              ...response,
              fallbackUsed: true,
              originalProvider: provider,
            }
          } catch (fallbackErr) {
            recordProviderFailure(fallbackProvider)
            logger.warn(`[LLM] ⚠ Fallback ${fallbackProvider} échoué:`, fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr))
          }
        }
        // Si tous les fallbacks échouent aussi
        throw new Error(
          `Provider ${provider} indisponible (${reason}) et aucun fallback pour ${options.operationName || 'default'}: ${err.message}`
        )
      }

      // Enregistrer l'échec non-récupérable dans le circuit breaker
      recordProviderFailure(provider)

      // Envoyer alerte si opération critique
      if (operationConfig?.alerts?.onFailure === 'email') {
        sendProviderFailureAlert(provider, options.operationName, err).catch(() => {})
      }

      logger.error(
        `[LLM] ❌ ${provider} échoué pour ${options.operationName || 'default'}:`,
        err.message
      )

      throw new Error(
        `Provider ${provider} indisponible pour ${options.operationName || 'default'}: ${err.message}`
      )
    }
  }

  // =========================================================================
  // MODE CASCADE LEGACY (kill switch: LLM_FALLBACK_ENABLED=true)
  // =========================================================================
  logger.warn('[LLM] ⚠️ Mode cascade legacy activé (LLM_FALLBACK_ENABLED=true)')

  // Déterminer l'ordre des providers
  let providers: LLMProvider[]
  if (operationConfig) {
    providers = [operationConfig.model.provider, ...FALLBACK_ORDER.filter(p => p !== operationConfig!.model.provider)]
  } else {
    providers = [...FALLBACK_ORDER]
  }

  // Filtrer par disponibilité
  const available = getAvailableProviders()
  const activeProviders = providers.filter(p => available.includes(p))

  if (activeProviders.length === 0) {
    throw new Error('Aucun provider LLM disponible')
  }

  const errors: { provider: LLMProvider; error: string }[] = []

  for (let i = 0; i < activeProviders.length; i++) {
    const provider = activeProviders[i]

    try {
      const response = await callProvider(provider, messages, options)

      if (i > 0) {
        logger.info(`[LLM] ✓ Fallback réussi: ${activeProviders[0]} → ${provider}`)
        return {
          ...response,
          fallbackUsed: true,
          originalProvider: activeProviders[0],
        }
      }

      return response
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      errors.push({ provider, error: errorMessage })
      logger.warn(`[LLM] ⚠ ${provider} erreur: ${errorMessage}, tentative suivante...`)
    }
  }

  const errorSummary = errors.map((e) => `${e.provider}: ${e.error}`).join('; ')
  throw new Error(`Tous les providers LLM sont indisponibles. Erreurs: ${errorSummary}`)
}

/**
 * Appelle un provider spécifique sans fallback
 */
export async function callSpecificProvider(
  provider: LLMProvider,
  messages: LLMMessage[],
  options: LLMOptions = {}
): Promise<LLMResponse> {
  const available = getAvailableProviders()
  if (!available.includes(provider)) {
    throw new Error(`Provider ${provider} non configuré. Clé API manquante.`)
  }

  return callProvider(provider, messages, options)
}

/**
 * Alias pour callLLMWithFallback (rétrocompatibilité)
 */
export const callLLM = callLLMWithFallback

// =============================================================================
// STREAMING
// =============================================================================

/**
 * Résultat d'usage tokens pour le streaming (capturé depuis le dernier chunk)
 */
export interface StreamTokenUsage {
  input: number
  output: number
  total: number
}

/**
 * Stream Ollama via fetch NDJSON.
 * Ollama retourne des lignes JSON newline-delimited avec message.content + flag done.
 * Le timeout utilise le timeout de l'opération (ex: 60s pour assistant-ia).
 */
async function* callOllamaStream(
  messages: Array<{ role: string; content: string }>,
  options: {
    maxTokens?: number
    temperature?: number
    systemInstruction?: string
    timeout?: number
  },
  usageOut?: StreamTokenUsage
): AsyncGenerator<string> {
  const model = aiConfig.ollama.chatModelDefault
  const timeout = options.timeout ?? 60000 // 60s par défaut pour streaming (pas le chatTimeoutDefault=15s)

  const allMessages: Array<{ role: string; content: string }> = []
  if (options.systemInstruction) {
    allMessages.push({ role: 'system', content: options.systemInstruction })
  }
  for (const m of messages) {
    allMessages.push(m)
  }

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeout)

  try {
    const response = await fetch(`${aiConfig.ollama.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: allMessages,
        stream: true,
        think: false,
        options: {
          temperature: options.temperature ?? 0.1,
          num_predict: options.maxTokens ?? 2048,
        },
      }),
      signal: controller.signal,
    })

    if (!response.ok) {
      throw new Error(`Erreur Ollama streaming: ${response.status}`)
    }

    const reader = response.body?.getReader()
    if (!reader) throw new Error('Ollama: pas de body dans la réponse streaming')

    const decoder = new TextDecoder()
    let buffer = ''
    // Filtre <think>...</think> en streaming : accumuler les tokens pendant le bloc thinking
    let inThinkBlock = false
    let thinkBuffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''

      for (const line of lines) {
        if (!line.trim()) continue
        try {
          const data = JSON.parse(line)
          let text: string = data.message?.content || ''

          if (text) {
            // Gestion du bloc <think> potentiellement fragmenté sur plusieurs tokens
            thinkBuffer += text
            if (inThinkBlock) {
              const endIdx = thinkBuffer.indexOf('</think>')
              if (endIdx !== -1) {
                inThinkBlock = false
                text = thinkBuffer.slice(endIdx + 8) // après </think>
                thinkBuffer = ''
              } else {
                text = '' // encore dans le bloc thinking
              }
            } else {
              const startIdx = thinkBuffer.indexOf('<think>')
              if (startIdx !== -1) {
                const before = thinkBuffer.slice(0, startIdx)
                const endIdx = thinkBuffer.indexOf('</think>', startIdx)
                if (endIdx !== -1) {
                  // Bloc complet dans ce chunk
                  text = before + thinkBuffer.slice(endIdx + 8)
                  thinkBuffer = ''
                } else {
                  // Début de bloc, pas encore la fin
                  inThinkBlock = true
                  text = before
                  thinkBuffer = thinkBuffer.slice(startIdx)
                }
              } else {
                thinkBuffer = ''
              }
            }
            if (text) yield text
          }

          if (data.done && usageOut) {
            usageOut.input = data.prompt_eval_count || 0
            usageOut.output = data.eval_count || 0
            usageOut.total = (data.prompt_eval_count || 0) + (data.eval_count || 0)
          }
        } catch {
          // Ignorer les lignes NDJSON mal formées
        }
      }
    }
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`Ollama streaming timeout après ${timeout / 1000}s (modèle: ${model})`)
    }
    throw error
  } finally {
    clearTimeout(timeoutId)
  }
}

/**
 * Stream DeepSeek via OpenAI SDK compatible (même API que Groq).
 * Le paramètre `usageOut` permet de capturer les stats de tokens depuis le dernier chunk.
 */
async function* callDeepSeekStream(
  messages: Array<{ role: string; content: string }>,
  options: { maxTokens?: number; temperature?: number; systemInstruction?: string },
  usageOut?: StreamTokenUsage
): AsyncGenerator<string> {
  const client = getDeepSeekClient()
  const model = aiConfig.deepseek.model

  const allMessages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = []
  if (options.systemInstruction) {
    allMessages.push({ role: 'system', content: options.systemInstruction })
  }
  for (const m of messages) {
    allMessages.push({ role: m.role as 'system' | 'user' | 'assistant', content: m.content })
  }

  const stream = await client.chat.completions.create({
    model,
    messages: allMessages,
    stream: true,
    stream_options: { include_usage: true },
    max_tokens: options.maxTokens ?? 8000,
    temperature: options.temperature ?? 0.1,
  })

  for await (const chunk of stream) {
    const text = chunk.choices[0]?.delta?.content || ''
    if (text) yield text
    if (chunk.usage && usageOut) {
      usageOut.input = chunk.usage.prompt_tokens || 0
      usageOut.output = chunk.usage.completion_tokens || 0
      usageOut.total = chunk.usage.total_tokens || 0
    }
  }
}

/**
 * Stream Groq via OpenAI SDK compatible.
 * Le paramètre `usageOut` permet de capturer les stats de tokens depuis le dernier chunk.
 */
export async function* callGroqStream(
  messages: Array<{ role: string; content: string }>,
  options: { maxTokens?: number; temperature?: number; model?: string; systemInstruction?: string },
  usageOut?: StreamTokenUsage
): AsyncGenerator<string> {
  const client = getGroqClient()
  const model = options.model ?? aiConfig.groq.model

  const allMessages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = []
  if (options.systemInstruction) {
    allMessages.push({ role: 'system', content: options.systemInstruction })
  }
  for (const m of messages) {
    allMessages.push({ role: m.role as 'system' | 'user' | 'assistant', content: m.content })
  }

  let stream: Awaited<ReturnType<typeof client.chat.completions.create>>
  try {
    stream = await client.chat.completions.create({
      model,
      messages: allMessages,
      stream: true,
      stream_options: { include_usage: true },
      max_tokens: options.maxTokens ?? 8000,
      temperature: options.temperature ?? 0.1,
    })
  } catch (err) {
    // Protection 429 : rate limit Groq → throw message explicite + enregistre l'échec
    if (isRateLimitError(err)) {
      recordProviderFailure('groq')
      logger.warn(`[Groq Stream] 429 rate limit atteint pour modèle ${model}`)
      throw new Error(`Assistant temporairement surchargé (rate limit Groq). Réessayez dans quelques secondes.`)
    }
    throw err
  }

  try {
    for await (const chunk of stream) {
      const text = chunk.choices[0]?.delta?.content || ''
      if (text) yield text
      // Groq envoie usage dans le dernier chunk quand stream_options.include_usage=true
      if (chunk.usage && usageOut) {
        usageOut.input = chunk.usage.prompt_tokens || 0
        usageOut.output = chunk.usage.completion_tokens || 0
        usageOut.total = chunk.usage.total_tokens || 0
      }
    }
  } catch (err) {
    if (isRateLimitError(err)) {
      recordProviderFailure('groq')
      logger.warn(`[Groq Stream] 429 en cours de streaming pour modèle ${model}`)
      throw new Error(`Assistant temporairement surchargé (rate limit Groq). Réessayez dans quelques secondes.`)
    }
    throw err
  }
}

/**
 * Dispatcher streaming générique selon le provider configuré pour l'opération.
 * Supporte Ollama, DeepSeek, Groq et Gemini — sélection automatique via operations-config.
 * Le paramètre `usageOut` capture les stats de tokens.
 */
export async function* callLLMStream(
  messages: Array<{ role: string; content: string }>,
  options: {
    maxTokens?: number
    temperature?: number
    operationName?: OperationName
    systemInstruction?: string
  },
  usageOut?: StreamTokenUsage
): AsyncGenerator<string> {
  const provider = options.operationName
    ? getOperationProvider(options.operationName)
    : 'ollama'

  if (provider === 'ollama') {
    const opConfig = options.operationName ? getOperationConfig(options.operationName) : null
    const timeout = opConfig?.timeouts?.chat ?? 60000
    yield* callOllamaStream(messages, { ...options, timeout }, usageOut)
  } else if (provider === 'deepseek') {
    yield* callDeepSeekStream(messages, options, usageOut)
  } else if (provider === 'groq') {
    const model = options.operationName ? getOperationModel(options.operationName) : undefined
    yield* callGroqStream(messages, { ...options, model }, usageOut)
  } else {
    // Fallback Gemini pour tout autre provider (gemini, openai, anthropic)
    yield* callGeminiStream(messages, {
      temperature: options.temperature,
      maxTokens: options.maxTokens,
      systemInstruction: options.systemInstruction,
    })
  }
}
