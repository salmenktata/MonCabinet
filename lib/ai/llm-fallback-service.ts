/**
 * Service de Fallback LLM
 *
 * Gère automatiquement les erreurs 429 (rate limit) en basculant
 * vers le provider LLM suivant selon la hiérarchie:
 *
 * Groq (rapide, économique)
 *   ↓ [429 ou erreur]
 * DeepSeek (économique ~0.14$/M tokens)
 *   ↓ [429 ou erreur]
 * Anthropic Claude (puissant mais coûteux)
 *   ↓ [indisponible]
 * OpenAI (coûteux, dernier recours)
 */

import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'
import { aiConfig, SYSTEM_PROMPTS } from './config'

// =============================================================================
// TYPES
// =============================================================================

export type LLMProvider = 'groq' | 'deepseek' | 'anthropic' | 'openai' | 'ollama'

export interface LLMMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
}

export interface LLMOptions {
  temperature?: number
  maxTokens?: number
  systemPrompt?: string
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

/** Ordre de fallback des providers */
const FALLBACK_ORDER: LLMProvider[] = ['groq', 'deepseek', 'anthropic', 'openai']

/** Nombre maximum de retries par provider avant de passer au suivant */
const MAX_RETRIES_PER_PROVIDER = 2

/** Délai initial avant retry (en ms), double à chaque essai */
const INITIAL_RETRY_DELAY_MS = 1000

/** Activer/désactiver le fallback via env */
const LLM_FALLBACK_ENABLED = process.env.LLM_FALLBACK_ENABLED !== 'false'

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
    deepseekClient = new OpenAI({
      apiKey: aiConfig.deepseek.apiKey,
      baseURL: aiConfig.deepseek.baseUrl,
    })
  }
  return deepseekClient
}

function getOpenAIClient(): OpenAI {
  if (!openaiClient) {
    openaiClient = new OpenAI({
      apiKey: aiConfig.openai.apiKey,
    })
  }
  return openaiClient
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

  // Vérifier aussi les objets d'erreur avec status
  if (typeof error === 'object' && error !== null) {
    const err = error as { status?: number; statusCode?: number }
    return err.status === 429 || err.statusCode === 429
  }

  return false
}

/**
 * Vérifie si l'erreur est récupérable (retry possible)
 */
function isRetryableError(error: unknown): boolean {
  if (isRateLimitError(error)) return true

  if (error instanceof Error) {
    const message = error.message.toLowerCase()
    // Erreurs réseau/timeout qui méritent un retry
    return (
      message.includes('timeout') ||
      message.includes('econnreset') ||
      message.includes('network') ||
      message.includes('503') ||
      message.includes('502')
    )
  }

  return false
}

/**
 * Attend un délai avec backoff exponentiel
 */
async function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Retourne la liste des providers disponibles (avec clé API configurée)
 */
export function getAvailableProviders(): LLMProvider[] {
  return FALLBACK_ORDER.filter((provider) => {
    switch (provider) {
      case 'groq':
        return !!aiConfig.groq.apiKey
      case 'deepseek':
        return !!aiConfig.deepseek.apiKey
      case 'anthropic':
        return !!aiConfig.anthropic.apiKey
      case 'openai':
        return !!aiConfig.openai.apiKey
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

  // Séparer le system message des autres
  const userMessages = messages.filter((m) => m.role !== 'system')

  switch (provider) {
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

    case 'anthropic': {
      const client = getAnthropicClient()
      // Anthropic utilise un format de messages différent
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

    case 'openai': {
      const client = getOpenAIClient()
      const response = await client.chat.completions.create({
        model: aiConfig.openai.chatModel,
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
        modelUsed: aiConfig.openai.chatModel,
        provider: 'openai',
        fallbackUsed: false,
      }
    }

    default:
      throw new Error(`Provider non supporté: ${provider}`)
  }
}

/**
 * Appelle un provider avec retry et backoff exponentiel
 */
async function callProviderWithRetry(
  provider: LLMProvider,
  messages: LLMMessage[],
  options: LLMOptions
): Promise<LLMResponse> {
  let lastError: Error | null = null
  let delayMs = INITIAL_RETRY_DELAY_MS

  for (let attempt = 0; attempt < MAX_RETRIES_PER_PROVIDER; attempt++) {
    try {
      return await callProvider(provider, messages, options)
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))

      // Si rate limit, on ne retry pas, on passe au provider suivant
      if (isRateLimitError(error)) {
        console.warn(
          `[LLM-Fallback] ${provider} rate limited (429), skipping retries`
        )
        throw error
      }

      // Si erreur non-retryable, on throw directement
      if (!isRetryableError(error)) {
        throw error
      }

      // Sinon on retry avec backoff
      if (attempt < MAX_RETRIES_PER_PROVIDER - 1) {
        console.warn(
          `[LLM-Fallback] ${provider} erreur temporaire, retry dans ${delayMs}ms (tentative ${attempt + 1}/${MAX_RETRIES_PER_PROVIDER})`
        )
        await delay(delayMs)
        delayMs *= 2 // Backoff exponentiel
      }
    }
  }

  throw lastError || new Error(`${provider} indisponible après ${MAX_RETRIES_PER_PROVIDER} tentatives`)
}

// =============================================================================
// FONCTION PRINCIPALE AVEC FALLBACK
// =============================================================================

/**
 * Appelle un LLM avec fallback automatique sur erreur 429
 *
 * Essaie les providers dans l'ordre: Groq → DeepSeek → Anthropic → OpenAI
 * Bascule automatiquement au provider suivant en cas d'erreur 429 ou indisponibilité
 *
 * @param messages - Messages de la conversation
 * @param options - Options LLM (temperature, maxTokens, systemPrompt)
 * @returns Réponse LLM avec informations sur le provider utilisé
 */
export async function callLLMWithFallback(
  messages: LLMMessage[],
  options: LLMOptions = {}
): Promise<LLMResponse> {
  const availableProviders = getAvailableProviders()

  if (availableProviders.length === 0) {
    throw new Error(
      'Aucun provider LLM configuré. Configurez au moins une clé API: GROQ_API_KEY, DEEPSEEK_API_KEY, ANTHROPIC_API_KEY ou OPENAI_API_KEY'
    )
  }

  // Si fallback désactivé, utiliser uniquement le premier provider
  if (!LLM_FALLBACK_ENABLED) {
    console.log(`[LLM-Fallback] Fallback désactivé, utilisation de ${availableProviders[0]} uniquement`)
    return callProviderWithRetry(availableProviders[0], messages, options)
  }

  const originalProvider = availableProviders[0]
  const errors: { provider: LLMProvider; error: string }[] = []

  for (let i = 0; i < availableProviders.length; i++) {
    const provider = availableProviders[i]

    try {
      const response = await callProviderWithRetry(provider, messages, options)

      // Marquer si on a utilisé un fallback
      if (i > 0) {
        console.log(
          `[LLM-Fallback] ✓ Fallback réussi: ${originalProvider} → ${provider}`
        )
        return {
          ...response,
          fallbackUsed: true,
          originalProvider,
        }
      }

      return response
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      errors.push({ provider, error: errorMessage })

      if (isRateLimitError(error)) {
        console.warn(
          `[LLM-Fallback] ⚠ ${provider} rate limited (429), tentative du provider suivant...`
        )
      } else {
        console.warn(
          `[LLM-Fallback] ⚠ ${provider} erreur: ${errorMessage}, tentative du provider suivant...`
        )
      }

      // Continuer avec le provider suivant
      continue
    }
  }

  // Tous les providers ont échoué
  const errorSummary = errors
    .map((e) => `${e.provider}: ${e.error}`)
    .join('; ')

  throw new Error(
    `Tous les providers LLM sont indisponibles. Erreurs: ${errorSummary}`
  )
}

/**
 * Appelle un provider spécifique sans fallback
 * Utile pour les tests ou quand on veut forcer un provider
 */
export async function callSpecificProvider(
  provider: LLMProvider,
  messages: LLMMessage[],
  options: LLMOptions = {}
): Promise<LLMResponse> {
  // Vérifier que le provider est disponible
  const available = getAvailableProviders()
  if (!available.includes(provider)) {
    throw new Error(
      `Provider ${provider} non configuré. Clé API manquante.`
    )
  }

  return callProviderWithRetry(provider, messages, options)
}
