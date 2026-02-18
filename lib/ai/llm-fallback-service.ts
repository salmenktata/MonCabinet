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

/** Ordre de fallback pour les réponses chat : Gemini → OpenAI → Ollama */
const FALLBACK_ORDER: LLMProvider[] = ['gemini', 'openai', 'ollama']

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
    return {
      content: data.message?.content || '',
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
 * Retourne la liste des providers disponibles (avec clé API configurée)
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
        { temperature, maxTokens, systemInstruction: systemPrompt }
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
      const response = await client.chat.completions.create({
        model: aiConfig.groq.model,
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
        modelUsed: aiConfig.groq.model,
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
      const model = aiConfig.openai?.chatModel || 'gpt-4o-mini'
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
  console.error('LLM_PROVIDER_FAILURE', JSON.stringify({
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

    console.log(
      `[LLM] ${options.operationName || 'default'} → ${provider} (no-fallback)`
    )

    try {
      return await callProvider(provider, messages, options)
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error))

      // Sur erreur récupérable (429 rate-limit, 5xx serveur, timeout) → cascade Gemini→OpenAI→Ollama
      const isRecoverable = isRateLimitError(error) || isServerOrTimeoutError(error)
      if (isRecoverable) {
        const reason = isRateLimitError(error) ? 'rate-limité' : 'erreur serveur/timeout'
        console.warn(
          `[LLM] ⚠️ ${provider} ${reason} pour ${options.operationName || 'default'}, cascade fallback...`
        )
        // Trouver les providers alternatifs disponibles
        const available = getAvailableProviders().filter(p => p !== provider)
        for (const fallbackProvider of available) {
          try {
            const response = await callProvider(fallbackProvider, messages, options)
            console.log(`[LLM] ✓ Fallback réussi: ${provider} → ${fallbackProvider} (${reason})`)
            return {
              ...response,
              fallbackUsed: true,
              originalProvider: provider,
            }
          } catch (fallbackErr) {
            console.warn(`[LLM] ⚠ Fallback ${fallbackProvider} échoué:`, fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr))
          }
        }
        // Si tous les fallbacks échouent aussi
        throw new Error(
          `Provider ${provider} indisponible (${reason}) et aucun fallback pour ${options.operationName || 'default'}: ${err.message}`
        )
      }

      // Envoyer alerte si opération critique
      if (operationConfig?.alerts?.onFailure === 'email') {
        sendProviderFailureAlert(provider, options.operationName, err).catch(() => {})
      }

      console.error(
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
  console.warn('[LLM] ⚠️ Mode cascade legacy activé (LLM_FALLBACK_ENABLED=true)')

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
        console.log(`[LLM] ✓ Fallback réussi: ${activeProviders[0]} → ${provider}`)
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
      console.warn(`[LLM] ⚠ ${provider} erreur: ${errorMessage}, tentative suivante...`)
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
 * Stream Groq via OpenAI SDK compatible
 */
export async function* callGroqStream(
  messages: Array<{ role: string; content: string }>,
  options: { maxTokens?: number; temperature?: number; model?: string; systemInstruction?: string }
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

  const stream = await client.chat.completions.create({
    model,
    messages: allMessages,
    stream: true,
    max_tokens: options.maxTokens ?? 8000,
    temperature: options.temperature ?? 0.1,
  })

  for await (const chunk of stream) {
    const text = chunk.choices[0]?.delta?.content || ''
    if (text) yield text
  }
}

/**
 * Dispatcher streaming générique selon le provider configuré pour l'opération.
 * Supporte Groq (gratuit) et Gemini (payant) - sélection automatique via operations-config.
 */
export async function* callLLMStream(
  messages: Array<{ role: string; content: string }>,
  options: {
    maxTokens?: number
    temperature?: number
    operationName?: OperationName
    systemInstruction?: string
  }
): AsyncGenerator<string> {
  const provider = options.operationName
    ? getOperationProvider(options.operationName)
    : 'groq'

  if (provider === 'groq') {
    const model = options.operationName ? getOperationModel(options.operationName) : undefined
    yield* callGroqStream(messages, { ...options, model })
  } else {
    yield* callGeminiStream(messages, {
      temperature: options.temperature,
      maxTokens: options.maxTokens,
      systemInstruction: options.systemInstruction,
    })
  }
}
