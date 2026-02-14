/**
 * Hook React: Status et test providers
 *
 * Features:
 * - Test provider connectivity
 * - Track test results
 * - Loading states par provider
 */

import { useState, useCallback } from 'react'
import { toast } from 'sonner'
import type { LLMProvider } from '@/lib/ai/llm-fallback-service'
import type { OperationName } from '@/lib/ai/operations-config'
import type { ProviderTestResult, ProviderAvailability } from '@/lib/types/ai-config.types'

interface TestState {
  loading: boolean
  result: ProviderTestResult | null
  error: string | null
}

export function useProviderStatus() {
  const [testStates, setTestStates] = useState<Record<string, TestState>>({})
  const [providerAvailability, setProviderAvailability] = useState<
    Record<LLMProvider, ProviderAvailability>
  >({} as any)

  /**
   * Teste un provider
   */
  const testProvider = useCallback(
    async (
      provider: LLMProvider,
      testType: 'chat' | 'embedding' = 'chat',
      operationName?: OperationName
    ): Promise<ProviderTestResult> => {
      const key = `${provider}-${testType}-${operationName || 'default'}`

      try {
        // Set loading
        setTestStates((prev) => ({
          ...prev,
          [key]: { loading: true, result: null, error: null },
        }))

        const response = await fetch('/api/admin/operations-config/test-provider', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            provider,
            testType,
            operationName,
          }),
        })

        const data = await response.json()

        if (!response.ok && response.status !== 503) {
          throw new Error(data.error || 'Erreur lors du test')
        }

        const result = data.result as ProviderTestResult

        // Update state
        setTestStates((prev) => ({
          ...prev,
          [key]: { loading: false, result, error: null },
        }))

        // Toast
        if (result.available) {
          toast.success(
            <div>
              <p className="font-semibold">✅ {provider.toUpperCase()} OK</p>
              {result.latencyMs && <p className="text-xs">Latence: {result.latencyMs}ms</p>}
              {result.modelUsed && <p className="text-xs">Modèle: {result.modelUsed}</p>}
            </div>,
            { duration: 3000 }
          )
        } else {
          toast.error(
            <div>
              <p className="font-semibold">❌ {provider.toUpperCase()} échoué</p>
              {result.error && <p className="text-xs">{result.error}</p>}
            </div>,
            { duration: 5000 }
          )
        }

        return result
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Erreur inconnue'

        setTestStates((prev) => ({
          ...prev,
          [key]: {
            loading: false,
            result: null,
            error: errorMessage,
          },
        }))

        toast.error(`Erreur test ${provider}: ${errorMessage}`)

        return {
          available: false,
          latencyMs: null,
          modelUsed: null,
          tokensUsed: null,
          error: errorMessage,
        }
      }
    },
    []
  )

  /**
   * Teste tous les providers pour une opération
   */
  const testAllProviders = useCallback(
    async (providers: LLMProvider[], operationName?: OperationName) => {
      const results = await Promise.all(
        providers.map((provider) => testProvider(provider, 'chat', operationName))
      )

      const successCount = results.filter((r) => r.available).length
      const totalCount = results.length

      if (successCount === totalCount) {
        toast.success(`✅ ${successCount}/${totalCount} providers fonctionnels`)
      } else if (successCount > 0) {
        toast.warning(`⚠️ ${successCount}/${totalCount} providers fonctionnels`)
      } else {
        toast.error(`❌ Aucun provider fonctionnel`)
      }

      return results
    },
    [testProvider]
  )

  /**
   * Fetch provider availability pour une opération
   */
  const fetchProviderAvailability = useCallback(async (operationName: OperationName) => {
    try {
      const response = await fetch(`/api/admin/operations-config/${operationName}`)
      const data = await response.json()

      if (data.success && data.providerAvailability) {
        setProviderAvailability(data.providerAvailability)
        return data.providerAvailability
      }
    } catch (err) {
      console.error('Error fetching provider availability:', err)
    }
  }, [])

  /**
   * Get test state pour un provider
   */
  const getTestState = useCallback(
    (provider: LLMProvider, testType: 'chat' | 'embedding' = 'chat', operationName?: string) => {
      const key = `${provider}-${testType}-${operationName || 'default'}`
      return testStates[key] || { loading: false, result: null, error: null }
    },
    [testStates]
  )

  return {
    testProvider,
    testAllProviders,
    fetchProviderAvailability,
    getTestState,
    testStates,
    providerAvailability,
  }
}
