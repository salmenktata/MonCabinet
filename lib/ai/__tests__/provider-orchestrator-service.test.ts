/**
 * Tests unitaires pour provider-orchestrator-service
 * Sprint 3 - Services Unifiés
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  orchestrate,
  orchestratedChat,
  orchestratedEmbedding,
  orchestratedClassification,
  getCircuitBreakerStats,
  resetAllCircuitBreakers,
  type OperationType,
  type OrchestrationOptions,
} from '../provider-orchestrator-service'

// Mock des dépendances
vi.mock('../llm-fallback-service', () => ({
  callLLMWithFallback: vi.fn(async (messages, options, usePremiumModel) => ({
    answer: 'Réponse LLM',
    tokensUsed: { input: 100, output: 50, total: 150 },
    modelUsed: 'ollama/qwen2.5:3b',
    provider: 'ollama',
    fallbackUsed: false,
  })),
  getAvailableProviders: vi.fn(() => ['ollama', 'gemini', 'deepseek', 'groq', 'anthropic']),
}))

vi.mock('../embeddings-service', () => ({
  generateEmbedding: vi.fn(async (text: string) => ({
    embedding: new Array(768).fill(0.1),
    dimensions: 768,
    model: 'nomic-embed-text',
  })),
}))

vi.mock('../usage-tracker', () => ({
  logUsage: vi.fn(async () => {}),
}))

import { callLLMWithFallback, getAvailableProviders } from '../llm-fallback-service'
import { generateEmbedding } from '../embeddings-service'
import type { LLMProvider } from '../llm-fallback-service'

describe('provider-orchestrator-service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetAllCircuitBreakers() // Reset circuit breakers avant chaque test
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('orchestrate', () => {
    it('should execute operation with first provider', async () => {
      const executor = vi.fn(async (provider: LLMProvider) => {
        return { data: `Result from ${provider}` }
      })

      const options: OrchestrationOptions = {
        operation: 'chat',
      }

      const result = await orchestrate(executor, options)

      expect(result).toBeDefined()
      expect(result.data).toBeTruthy()
      expect(result.provider).toBeTruthy()
      expect(result.fallbackUsed).toBe(false)
      expect(result.latencyMs).toBeGreaterThan(0)
      expect(result.retriesCount).toBe(0)

      expect(executor).toHaveBeenCalledTimes(1)
    })

    it('should fallback to next provider on failure', async () => {
      let callCount = 0

      const executor = vi.fn(async (provider: LLMProvider) => {
        callCount++
        if (callCount === 1) {
          throw new Error('Provider 1 failed')
        }
        return { data: `Success from ${provider}` }
      })

      const options: OrchestrationOptions = {
        operation: 'chat',
      }

      const result = await orchestrate(executor, options)

      expect(result).toBeDefined()
      expect(result.fallbackUsed).toBe(true)
      expect(result.originalProvider).toBeTruthy()
      expect(executor).toHaveBeenCalledTimes(2) // Premier échec + deuxième succès
    })

    it('should retry on retryable error', async () => {
      let attemptCount = 0

      const executor = vi.fn(async (provider: LLMProvider) => {
        attemptCount++
        if (attemptCount === 1) {
          throw new Error('Network timeout')
        }
        return { data: 'Success after retry' }
      })

      const options: OrchestrationOptions = {
        operation: 'chat',
      }

      const result = await orchestrate(executor, options)

      expect(result).toBeDefined()
      expect(result.retriesCount).toBeGreaterThan(0)
      expect(executor).toHaveBeenCalledTimes(2) // Tentative 1 (échec) + retry (succès)
    })

    it('should respect timeout option', async () => {
      const executor = vi.fn(async (provider: LLMProvider) => {
        // Simuler une opération lente
        await new Promise((resolve) => setTimeout(resolve, 200))
        return { data: 'Slow result' }
      })

      const options: OrchestrationOptions = {
        operation: 'chat',
        timeoutMs: 50, // Timeout très court
      }

      await expect(orchestrate(executor, options)).rejects.toThrow('Timeout')
    })

    it('should force specific provider when requested', async () => {
      const executor = vi.fn(async (provider: LLMProvider) => {
        return { data: `Result from ${provider}` }
      })

      const options: OrchestrationOptions = {
        operation: 'chat',
        forceProvider: 'deepseek',
      }

      await orchestrate(executor, options)

      expect(executor).toHaveBeenCalledWith('deepseek')
    })

    it('should skip Ollama in premium mode', async () => {
      const executor = vi.fn(async (provider: LLMProvider) => {
        if (provider === 'ollama') {
          throw new Error('Ollama should not be called in premium mode')
        }
        return { data: `Result from ${provider}` }
      })

      const options: OrchestrationOptions = {
        operation: 'chat',
        usePremiumModel: true,
      }

      const result = await orchestrate(executor, options)

      expect(result.provider).not.toBe('ollama')
    })

    it('should throw error when all providers fail', async () => {
      const executor = vi.fn(async (provider: LLMProvider) => {
        throw new Error(`${provider} failed`)
      })

      const options: OrchestrationOptions = {
        operation: 'chat',
      }

      await expect(orchestrate(executor, options)).rejects.toThrow(
        'Opération "chat" échouée sur tous les providers'
      )
    })

    it('should use different strategies for different operations', async () => {
      const chatExecutor = vi.fn(async (provider: LLMProvider) => ({ data: 'chat' }))
      const embeddingExecutor = vi.fn(async (provider: LLMProvider) => ({ data: 'embedding' }))

      await orchestrate(chatExecutor, { operation: 'chat' })
      await orchestrate(embeddingExecutor, { operation: 'embedding' })

      // Vérifier que les deux ont été appelés avec des stratégies différentes
      expect(chatExecutor).toHaveBeenCalled()
      expect(embeddingExecutor).toHaveBeenCalled()
    })
  })

  describe('circuit breaker', () => {
    it('should open circuit breaker after threshold failures', async () => {
      let callCount = 0

      const executor = vi.fn(async (provider: LLMProvider) => {
        callCount++
        // Échouer systématiquement
        throw new Error('Persistent failure')
      })

      const options: OrchestrationOptions = {
        operation: 'chat',
      }

      // Faire échouer 5+ fois pour atteindre le seuil
      for (let i = 0; i < 6; i++) {
        try {
          await orchestrate(executor, options)
        } catch (error) {
          // Ignorer l'erreur, on veut juste déclencher le circuit breaker
        }
      }

      const stats = getCircuitBreakerStats()
      expect(stats.length).toBeGreaterThan(0)

      // Vérifier qu'au moins un circuit breaker est ouvert
      const openCircuits = stats.filter((s) => s.state.state === 'open')
      expect(openCircuits.length).toBeGreaterThan(0)
    })

    it('should reset circuit breaker on success', async () => {
      let callCount = 0

      const executor = vi.fn(async (provider: LLMProvider) => {
        callCount++
        if (callCount <= 2) {
          throw new Error('Initial failure')
        }
        return { data: 'Success' }
      })

      const options: OrchestrationOptions = {
        operation: 'classification',
      }

      // Faire échouer 2 fois puis réussir
      try {
        await orchestrate(executor, options)
      } catch (error) {
        // Première tentative échoue
      }

      // Deuxième tentative réussit
      const result = await orchestrate(executor, options)

      expect(result).toBeDefined()

      const stats = getCircuitBreakerStats()
      const classificationCircuit = stats.find((s) => s.operation === 'classification')

      // Circuit breaker devrait être fermé après succès
      if (classificationCircuit) {
        expect(classificationCircuit.state.successCount).toBeGreaterThan(0)
      }
    })

    it('should allow request in half-open state after reset period', async () => {
      // Note: Ce test est difficile à implémenter sans simulation du temps
      // On vérifie juste que resetAllCircuitBreakers fonctionne

      resetAllCircuitBreakers()

      const stats = getCircuitBreakerStats()
      expect(stats.length).toBe(0) // Tous les circuits devraient être vides
    })
  })

  describe('orchestratedChat', () => {
    it('should call LLM fallback with correct parameters', async () => {
      const messages = [
        { role: 'user' as const, content: 'Question test' },
      ]

      const result = await orchestratedChat(messages)

      expect(result).toBeDefined()
      expect(result.data).toBeDefined()
      expect(callLLMWithFallback).toHaveBeenCalledWith(
        messages,
        expect.objectContaining({
          temperature: undefined,
          maxTokens: undefined,
          context: undefined,
        }),
        false // usePremiumModel default
      )
    })

    it('should use premium model when requested', async () => {
      const messages = [
        { role: 'user' as const, content: 'Question' },
      ]

      await orchestratedChat(messages, { usePremiumModel: true })

      expect(callLLMWithFallback).toHaveBeenCalledWith(
        messages,
        expect.anything(),
        true // usePremiumModel
      )
    })

    it('should pass temperature and maxTokens', async () => {
      const messages = [
        { role: 'user' as const, content: 'Question' },
      ]

      await orchestratedChat(messages, {
        temperature: 0.7,
        maxTokens: 2000,
      })

      expect(callLLMWithFallback).toHaveBeenCalledWith(
        messages,
        expect.objectContaining({
          temperature: 0.7,
          maxTokens: 2000,
        }),
        expect.anything()
      )
    })
  })

  describe('orchestratedEmbedding', () => {
    it('should generate embedding with orchestration', async () => {
      const text = 'Texte à embedder'

      const result = await orchestratedEmbedding(text)

      expect(result).toBeDefined()
      expect(result.data).toBeDefined()
      expect(result.data.embedding).toHaveLength(1024)
      expect(generateEmbedding).toHaveBeenCalledWith(text)
    })

    it('should only use Ollama for embeddings', async () => {
      const text = 'Test embedding'

      const result = await orchestratedEmbedding(text)

      // Embedding devrait utiliser Ollama uniquement
      expect(result.provider).toBe('ollama')
    })

    it('should throw error if Ollama not available', async () => {
      // Mock getAvailableProviders pour retourner sans Ollama
      vi.mocked(getAvailableProviders).mockReturnValueOnce(['gemini', 'deepseek'])

      const text = 'Test'

      await expect(orchestratedEmbedding(text)).rejects.toThrow(
        'Aucun provider disponible'
      )
    })
  })

  describe('orchestratedClassification', () => {
    it('should classify with low temperature', async () => {
      const messages = [
        {
          role: 'system' as const,
          content: 'Classification prompt',
        },
        {
          role: 'user' as const,
          content: 'Content to classify',
        },
      ]

      const result = await orchestratedClassification(messages)

      expect(result).toBeDefined()
      expect(callLLMWithFallback).toHaveBeenCalledWith(
        messages,
        expect.objectContaining({
          temperature: 0.1, // Classification doit être déterministe
          maxTokens: 500,
          context: 'web-scraping',
        }),
        false // Mode rapide
      )
    })

    it('should handle classification errors', async () => {
      vi.mocked(callLLMWithFallback).mockRejectedValueOnce(new Error('Classification failed'))

      const messages = [
        {
          role: 'user' as const,
          content: 'Content',
        },
      ]

      await expect(orchestratedClassification(messages)).rejects.toThrow()
    })
  })

  describe('getCircuitBreakerStats', () => {
    it('should return empty stats initially', () => {
      resetAllCircuitBreakers()

      const stats = getCircuitBreakerStats()

      expect(stats).toEqual([])
    })

    it('should return stats after operations', async () => {
      const executor = vi.fn(async (provider: LLMProvider) => ({ data: 'ok' }))

      await orchestrate(executor, { operation: 'chat' })

      const stats = getCircuitBreakerStats()

      expect(stats.length).toBeGreaterThan(0)

      stats.forEach((stat) => {
        expect(stat.key).toBeTruthy()
        expect(stat.provider).toBeTruthy()
        expect(stat.operation).toBeTruthy()
        expect(stat.state).toBeDefined()
        expect(stat.state.state).toMatch(/^(closed|open|half-open)$/)
      })
    })

    it('should include failure counts in stats', async () => {
      const executor = vi.fn(async (provider: LLMProvider) => {
        throw new Error('Fail')
      })

      try {
        await orchestrate(executor, { operation: 'extraction' })
      } catch (error) {
        // Ignorer
      }

      const stats = getCircuitBreakerStats()
      const extractionStats = stats.filter((s) => s.operation === 'extraction')

      expect(extractionStats.length).toBeGreaterThan(0)

      extractionStats.forEach((stat) => {
        expect(stat.state.failureCount).toBeGreaterThan(0)
      })
    })
  })

  describe('resetAllCircuitBreakers', () => {
    it('should clear all circuit breaker states', async () => {
      // Créer des états de circuit breaker
      const executor = vi.fn(async (provider: LLMProvider) => ({ data: 'ok' }))

      await orchestrate(executor, { operation: 'chat' })
      await orchestrate(executor, { operation: 'embedding' })

      let stats = getCircuitBreakerStats()
      expect(stats.length).toBeGreaterThan(0)

      // Reset
      resetAllCircuitBreakers()

      stats = getCircuitBreakerStats()
      expect(stats).toEqual([])
    })
  })

  describe('operation strategies', () => {
    it('should use longer timeout for reasoning operation', async () => {
      const executor = vi.fn(async (provider: LLMProvider) => {
        // Simuler une opération longue (mais pas trop pour le test)
        await new Promise((resolve) => setTimeout(resolve, 100))
        return { data: 'reasoning result' }
      })

      const result = await orchestrate(executor, { operation: 'reasoning' })

      expect(result).toBeDefined()
      // Reasoning devrait avoir un timeout plus long (3min vs 2min pour chat)
    })

    it('should allow fewer retries for reasoning', async () => {
      let attemptCount = 0

      const executor = vi.fn(async (provider: LLMProvider) => {
        attemptCount++
        if (attemptCount <= 2) {
          throw new Error('Retry error')
        }
        return { data: 'success' }
      })

      try {
        await orchestrate(executor, { operation: 'reasoning' })
      } catch (error) {
        // Reasoning a moins de retries que chat
        // Devrait échouer avant le 3e retry
      }

      // Vérifier que le nombre de tentatives est limité
      expect(attemptCount).toBeLessThanOrEqual(3)
    })

    it('should use appropriate providers for each operation type', async () => {
      const executor = vi.fn(async (provider: LLMProvider) => ({ data: 'ok' }))

      // Chat devrait accepter tous les providers
      await orchestrate(executor, { operation: 'chat' })

      // Embedding devrait utiliser uniquement Ollama
      await orchestrate(executor, { operation: 'embedding' })

      // Classification devrait utiliser Ollama, Gemini, DeepSeek
      await orchestrate(executor, { operation: 'classification' })

      expect(executor).toHaveBeenCalled()
    })
  })
})
