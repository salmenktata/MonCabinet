/**
 * Service d'Orchestration Provider - Sprint 3 Phase 2
 *
 * Extension du llm-fallback-service.ts pour TOUTES les opérations IA
 *
 * Objectifs :
 * - API unifiée pour toutes les opérations : chat, embedding, classification, extraction, generation
 * - Fallback automatique entre providers avec retry et backoff
 * - Circuit breaker pour protéger contre les cascades de failures
 * - Monitoring et métriques par opération
 * - Stratégies optimisées par type d'opération
 *
 * @module lib/ai/provider-orchestrator-service
 */

import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'
import { aiConfig } from './config'
import {
  callLLMWithFallback,
  type LLMMessage,
  type LLMResponse,
  type LLMProvider,
  type AIContext,
  getAvailableProviders,
} from './llm-fallback-service'
import { generateEmbedding, type EmbeddingResult } from './embeddings-service'
import { logUsage } from './usage-tracker'

// =============================================================================
// TYPES
// =============================================================================

/**
 * Type d'opération IA
 */
export type OperationType =
  | 'chat' // Conversation LLM
  | 'embedding' // Génération embeddings
  | 'classification' // Classification contenu
  | 'extraction' // Extraction données structurées
  | 'generation' // Génération texte (résumé, traduction, etc.)
  | 'reasoning' // Raisonnement multi-étapes

/**
 * Stratégie de fallback par opération
 */
export interface OperationStrategy {
  /** Providers autorisés pour cette opération (ordre = priorité) */
  allowedProviders: LLMProvider[]

  /** Timeout par provider (ms) */
  timeoutMs: number

  /** Nombre de retries par provider */
  maxRetries: number

  /** Backoff initial (ms) */
  initialBackoffMs: number

  /** Circuit breaker : nombre d'échecs avant d'ouvrir */
  circuitBreakerThreshold: number

  /** Circuit breaker : durée de reset (ms) */
  circuitBreakerResetMs: number

  /** Circuit breaker : nombre de succès pour refermer */
  circuitBreakerSuccessThreshold: number
}

/**
 * Options d'orchestration
 */
export interface OrchestrationOptions {
  /** Opération à exécuter */
  operation: OperationType

  /** Température (chat, generation) */
  temperature?: number

  /** Max tokens (chat, generation) */
  maxTokens?: number

  /** Contexte IA (pour stratégies) */
  context?: AIContext

  /** Forcer un provider spécifique */
  forceProvider?: LLMProvider

  /** Mode Premium (cloud providers) */
  usePremiumModel?: boolean

  /** Timeout custom (override stratégie) */
  timeoutMs?: number

  /** Métadonnées pour logging */
  metadata?: Record<string, unknown>
}

/**
 * Résultat d'orchestration
 */
export interface OrchestrationResult<T = unknown> {
  /** Résultat de l'opération */
  data: T

  /** Provider utilisé */
  provider: LLMProvider

  /** Modèle utilisé */
  model: string

  /** Tokens utilisés */
  tokensUsed?: {
    input: number
    output: number
    total: number
  }

  /** Latency (ms) */
  latencyMs: number

  /** Fallback utilisé */
  fallbackUsed: boolean

  /** Provider original (si fallback) */
  originalProvider?: LLMProvider

  /** Nombre de retries */
  retriesCount: number
}

/**
 * État du circuit breaker
 */
interface CircuitBreakerState {
  /** État actuel */
  state: 'closed' | 'open' | 'half-open'

  /** Nombre d'échecs consécutifs */
  failureCount: number

  /** Nombre de succès consécutifs */
  successCount: number

  /** Timestamp du dernier échec */
  lastFailureTime: number

  /** Timestamp d'ouverture */
  openedAt?: number
}

// =============================================================================
// CONFIGURATION
// =============================================================================

/**
 * Stratégies par défaut par type d'opération
 */
const OPERATION_STRATEGIES: Record<OperationType, OperationStrategy> = {
  chat: {
    allowedProviders: ['ollama', 'gemini', 'deepseek', 'groq', 'anthropic'],
    timeoutMs: 120000, // 2min
    maxRetries: 2,
    initialBackoffMs: 1000,
    circuitBreakerThreshold: 5,
    circuitBreakerResetMs: 60000, // 1min
    circuitBreakerSuccessThreshold: 1,
  },
  embedding: {
    allowedProviders: ['ollama'], // Ollama uniquement (économie)
    timeoutMs: 120000, // 2min
    maxRetries: 2,
    initialBackoffMs: 1000,
    circuitBreakerThreshold: 5,
    circuitBreakerResetMs: 60000,
    circuitBreakerSuccessThreshold: 2,
  },
  classification: {
    allowedProviders: ['ollama', 'gemini', 'deepseek'],
    timeoutMs: 60000, // 1min
    maxRetries: 2,
    initialBackoffMs: 500,
    circuitBreakerThreshold: 5,
    circuitBreakerResetMs: 60000,
    circuitBreakerSuccessThreshold: 1,
  },
  extraction: {
    allowedProviders: ['ollama', 'deepseek', 'gemini'],
    timeoutMs: 90000, // 1.5min
    maxRetries: 2,
    initialBackoffMs: 1000,
    circuitBreakerThreshold: 5,
    circuitBreakerResetMs: 60000,
    circuitBreakerSuccessThreshold: 1,
  },
  generation: {
    allowedProviders: ['ollama', 'gemini', 'groq'],
    timeoutMs: 60000, // 1min
    maxRetries: 2,
    initialBackoffMs: 500,
    circuitBreakerThreshold: 5,
    circuitBreakerResetMs: 60000,
    circuitBreakerSuccessThreshold: 1,
  },
  reasoning: {
    allowedProviders: ['deepseek', 'anthropic', 'gemini'],
    timeoutMs: 180000, // 3min (raisonnement long)
    maxRetries: 1,
    initialBackoffMs: 2000,
    circuitBreakerThreshold: 3,
    circuitBreakerResetMs: 120000, // 2min
    circuitBreakerSuccessThreshold: 2,
  },
}

// =============================================================================
// CIRCUIT BREAKER
// =============================================================================

/** État des circuit breakers par provider + opération */
const circuitBreakers = new Map<string, CircuitBreakerState>()

/**
 * Récupère l'état du circuit breaker
 */
function getCircuitBreakerState(provider: LLMProvider, operation: OperationType): CircuitBreakerState {
  const key = `${provider}:${operation}`

  if (!circuitBreakers.has(key)) {
    circuitBreakers.set(key, {
      state: 'closed',
      failureCount: 0,
      successCount: 0,
      lastFailureTime: 0,
    })
  }

  return circuitBreakers.get(key)!
}

/**
 * Enregistre un succès
 */
function recordSuccess(provider: LLMProvider, operation: OperationType, strategy: OperationStrategy): void {
  const state = getCircuitBreakerState(provider, operation)

  state.successCount++
  state.failureCount = 0 // Reset failures

  // Passer de half-open à closed si seuil atteint
  if (state.state === 'half-open' && state.successCount >= strategy.circuitBreakerSuccessThreshold) {
    console.log(`[ProviderOrchestrator] Circuit breaker ${provider}:${operation} fermé (${state.successCount} succès)`)
    state.state = 'closed'
    state.successCount = 0
  }
}

/**
 * Enregistre un échec
 */
function recordFailure(provider: LLMProvider, operation: OperationType, strategy: OperationStrategy): void {
  const state = getCircuitBreakerState(provider, operation)

  state.failureCount++
  state.successCount = 0
  state.lastFailureTime = Date.now()

  // Ouvrir le circuit si seuil atteint
  if (state.state === 'closed' && state.failureCount >= strategy.circuitBreakerThreshold) {
    console.warn(
      `[ProviderOrchestrator] Circuit breaker ${provider}:${operation} OUVERT (${state.failureCount} échecs)`
    )
    state.state = 'open'
    state.openedAt = Date.now()
  }
}

/**
 * Vérifie si le circuit breaker autorise une requête
 */
function isCircuitBreakerOpen(provider: LLMProvider, operation: OperationType, strategy: OperationStrategy): boolean {
  const state = getCircuitBreakerState(provider, operation)

  if (state.state === 'closed') {
    return false // Circuit fermé, requête autorisée
  }

  if (state.state === 'open') {
    // Vérifier si période de reset écoulée
    const elapsed = Date.now() - (state.openedAt || 0)

    if (elapsed >= strategy.circuitBreakerResetMs) {
      console.log(`[ProviderOrchestrator] Circuit breaker ${provider}:${operation} half-open (période reset)`)
      state.state = 'half-open'
      state.failureCount = 0
      state.successCount = 0
      return false // Autoriser une tentative en half-open
    }

    return true // Circuit ouvert, bloquer la requête
  }

  // État half-open : autoriser la requête (test)
  return false
}

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Attend avec backoff exponentiel
 */
async function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Vérifie si une erreur est retryable
 */
function isRetryableError(error: unknown): boolean {
  if (error instanceof Error) {
    const message = error.message.toLowerCase()
    return (
      message.includes('timeout') ||
      message.includes('econnreset') ||
      message.includes('network') ||
      message.includes('503') ||
      message.includes('502') ||
      message.includes('429') || // Rate limit
      message.includes('rate limit')
    )
  }

  return false
}

// =============================================================================
// API PUBLIQUE
// =============================================================================

/**
 * Orchestre une opération IA avec fallback automatique
 *
 * @param executor Fonction exécutant l'opération sur un provider
 * @param options Options d'orchestration
 * @returns Résultat avec métadonnées
 *
 * @example
 * ```typescript
 * const result = await orchestrate(
 *   async (provider) => {
 *     // Logique spécifique au provider
 *     if (provider === 'ollama') {
 *       return await callOllamaAPI(...)
 *     }
 *     // ...
 *   },
 *   {
 *     operation: 'chat',
 *     context: 'rag-chat',
 *     usePremiumModel: false
 *   }
 * )
 * ```
 */
export async function orchestrate<T>(
  executor: (provider: LLMProvider) => Promise<T>,
  options: OrchestrationOptions
): Promise<OrchestrationResult<T>> {
  const { operation, forceProvider, usePremiumModel = false } = options

  const strategy = OPERATION_STRATEGIES[operation]
  const availableProviders = getAvailableProviders()

  // Filtrer providers selon stratégie et disponibilité
  let providers = strategy.allowedProviders.filter((p) => availableProviders.includes(p))

  // Mode Premium : skip Ollama
  if (usePremiumModel) {
    providers = providers.filter((p) => p !== 'ollama')
  }

  // Forcer un provider spécifique
  if (forceProvider && providers.includes(forceProvider)) {
    providers = [forceProvider]
  }

  if (providers.length === 0) {
    throw new Error(`Aucun provider disponible pour opération "${operation}"`)
  }

  console.log(`[ProviderOrchestrator] ${operation} → Stratégie: [${providers.join(' → ')}]`)

  const originalProvider = providers[0]
  const startTime = Date.now()
  let totalRetries = 0

  for (let i = 0; i < providers.length; i++) {
    const provider = providers[i]

    // Vérifier circuit breaker
    if (isCircuitBreakerOpen(provider, operation, strategy)) {
      console.warn(`[ProviderOrchestrator] ${provider} circuit breaker ouvert, skip`)
      continue
    }

    // Retry loop pour ce provider
    let backoffMs = strategy.initialBackoffMs

    for (let retry = 0; retry < strategy.maxRetries; retry++) {
      try {
        // Timeout wrapper
        const timeoutMs = options.timeoutMs || strategy.timeoutMs

        const result = await Promise.race<T>([
          executor(provider),
          new Promise<T>((_, reject) =>
            setTimeout(() => reject(new Error(`Timeout après ${timeoutMs}ms`)), timeoutMs)
          ),
        ])

        // Succès !
        const latencyMs = Date.now() - startTime

        recordSuccess(provider, operation, strategy)

        console.log(
          `[ProviderOrchestrator] ✓ ${operation} réussi via ${provider} (${latencyMs}ms, ${totalRetries} retries)`
        )

        return {
          data: result,
          provider,
          model: `${provider}/${operation}`,
          latencyMs,
          fallbackUsed: i > 0,
          originalProvider: i > 0 ? originalProvider : undefined,
          retriesCount: totalRetries,
        }
      } catch (error) {
        totalRetries++

        const errorMessage = error instanceof Error ? error.message : String(error)

        console.warn(
          `[ProviderOrchestrator] ⚠ ${provider} échec (tentative ${retry + 1}/${strategy.maxRetries}): ${errorMessage}`
        )

        // Si non-retryable ou dernier retry, enregistrer échec et passer au provider suivant
        if (!isRetryableError(error) || retry === strategy.maxRetries - 1) {
          recordFailure(provider, operation, strategy)
          break // Sortir du retry loop, passer au provider suivant
        }

        // Retry avec backoff
        if (retry < strategy.maxRetries - 1) {
          console.log(`[ProviderOrchestrator] Retry dans ${backoffMs}ms...`)
          await delay(backoffMs)
          backoffMs *= 2 // Backoff exponentiel
        }
      }
    }
  }

  // Tous les providers ont échoué
  throw new Error(
    `Opération "${operation}" échouée sur tous les providers disponibles (${providers.join(', ')})`
  )
}

/**
 * Chat avec orchestration automatique
 *
 * Wrapper autour de callLLMWithFallback avec métriques et circuit breaker
 *
 * @param messages Messages LLM
 * @param options Options
 * @returns Réponse LLM
 */
export async function orchestratedChat(
  messages: LLMMessage[],
  options: Omit<OrchestrationOptions, 'operation'> = {}
): Promise<OrchestrationResult<LLMResponse>> {
  return orchestrate(
    async (provider) => {
      return await callLLMWithFallback(
        messages,
        {
          temperature: options.temperature,
          maxTokens: options.maxTokens,
          context: options.context,
        },
        options.usePremiumModel
      )
    },
    {
      ...options,
      operation: 'chat',
    }
  )
}

/**
 * Embedding avec orchestration automatique
 *
 * Wrapper autour de generateEmbedding avec métriques et circuit breaker
 *
 * @param text Texte à embedder
 * @param options Options
 * @returns Embedding
 */
export async function orchestratedEmbedding(
  text: string,
  options: Omit<OrchestrationOptions, 'operation'> = {}
): Promise<OrchestrationResult<EmbeddingResult>> {
  return orchestrate(
    async (provider) => {
      // Pour l'instant, uniquement Ollama supporté pour embeddings
      if (provider !== 'ollama') {
        throw new Error(`Provider ${provider} non supporté pour embeddings`)
      }

      return await generateEmbedding(text)
    },
    {
      ...options,
      operation: 'embedding',
    }
  )
}

/**
 * Classification avec orchestration automatique
 *
 * @param messages Messages LLM pour classification
 * @param options Options
 * @returns Résultat classification
 */
export async function orchestratedClassification(
  messages: LLMMessage[],
  options: Omit<OrchestrationOptions, 'operation'> = {}
): Promise<OrchestrationResult<LLMResponse>> {
  return orchestrate(
    async (provider) => {
      return await callLLMWithFallback(
        messages,
        {
          temperature: 0.1, // Classification = déterministe
          maxTokens: 500,
          context: 'web-scraping' as AIContext,
        },
        false // Mode rapide (Ollama prioritaire)
      )
    },
    {
      ...options,
      operation: 'classification',
    }
  )
}

/**
 * Extraction de données structurées avec orchestration
 *
 * @param messages Messages LLM pour extraction
 * @param options Options
 * @returns Données extraites
 */
export async function orchestratedExtraction(
  messages: LLMMessage[],
  options: Omit<OrchestrationOptions, 'operation'> = {}
): Promise<OrchestrationResult<LLMResponse>> {
  return orchestrate(
    async (provider) => {
      return await callLLMWithFallback(
        messages,
        {
          temperature: 0.1, // Extraction = déterministe
          maxTokens: 2000,
          context: 'structuring' as AIContext,
        },
        options.usePremiumModel
      )
    },
    {
      ...options,
      operation: 'extraction',
    }
  )
}

/**
 * Génération de texte (résumé, traduction, etc.) avec orchestration
 *
 * @param messages Messages LLM pour génération
 * @param options Options
 * @returns Texte généré
 */
export async function orchestratedGeneration(
  messages: LLMMessage[],
  options: Omit<OrchestrationOptions, 'operation'> = {}
): Promise<OrchestrationResult<LLMResponse>> {
  return orchestrate(
    async (provider) => {
      return await callLLMWithFallback(
        messages,
        {
          temperature: options.temperature ?? 0.3,
          maxTokens: options.maxTokens || 2000,
          context: options.context || ('default' as AIContext),
        },
        options.usePremiumModel
      )
    },
    {
      ...options,
      operation: 'generation',
    }
  )
}

/**
 * Récupère les statistiques des circuit breakers
 *
 * Utile pour monitoring et debugging
 *
 * @returns État de tous les circuit breakers
 */
export function getCircuitBreakerStats(): Array<{
  key: string
  provider: LLMProvider
  operation: OperationType
  state: CircuitBreakerState
}> {
  const stats: Array<{
    key: string
    provider: LLMProvider
    operation: OperationType
    state: CircuitBreakerState
  }> = []

  circuitBreakers.forEach((state, key) => {
    const [provider, operation] = key.split(':') as [LLMProvider, OperationType]

    stats.push({
      key,
      provider,
      operation,
      state: { ...state }, // Clone pour éviter mutations
    })
  })

  return stats
}

/**
 * Reset tous les circuit breakers
 *
 * Utile pour debugging ou après maintenance
 */
export function resetAllCircuitBreakers(): void {
  circuitBreakers.clear()
  console.log('[ProviderOrchestrator] Tous les circuit breakers ont été reset')
}
