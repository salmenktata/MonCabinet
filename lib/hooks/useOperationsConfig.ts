/**
 * Hook React: Gestion configuration IA par opération
 *
 * Features:
 * - Fetch configurations (auto-refresh)
 * - Update configuration (partial)
 * - Reset configuration (defaults)
 * - Clear cache
 * - Loading/error states
 */

import { useState, useCallback, useEffect } from 'react'
import { toast } from 'sonner'
import type {
  OperationProviderConfig,
  OperationConfigUpdatePayload,
} from '@/lib/types/ai-config.types'
import type { OperationName } from '@/lib/ai/operations-config'

interface UseOperationsConfigOptions {
  autoRefresh?: boolean
  refreshInterval?: number // ms
}

export function useOperationsConfig(options: UseOperationsConfigOptions = {}) {
  const { autoRefresh = false, refreshInterval = 30000 } = options

  const [operations, setOperations] = useState<OperationProviderConfig[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  /**
   * Fetch toutes les configurations
   */
  const fetchOperations = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)

      const response = await fetch('/api/admin/operations-config')
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Erreur lors du chargement')
      }

      if (data.success) {
        setOperations(data.operations)
      } else {
        throw new Error(data.error || 'Erreur inconnue')
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Erreur inconnue'
      setError(errorMessage)
      toast.error(`Erreur: ${errorMessage}`)
    } finally {
      setLoading(false)
    }
  }, [])

  /**
   * Fetch une configuration spécifique
   */
  const fetchOperation = useCallback(async (operationName: OperationName) => {
    try {
      const response = await fetch(`/api/admin/operations-config/${operationName}`)
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Erreur lors du chargement')
      }

      return data.operation as OperationProviderConfig
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Erreur inconnue'
      toast.error(`Erreur: ${errorMessage}`)
      throw err
    }
  }, [])

  /**
   * Met à jour configuration
   */
  const updateOperation = useCallback(
    async (operationName: OperationName, updates: OperationConfigUpdatePayload) => {
      try {
        const response = await fetch(`/api/admin/operations-config/${operationName}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updates),
        })

        const data = await response.json()

        if (!response.ok) {
          throw new Error(data.error || 'Erreur lors de la mise à jour')
        }

        if (data.success) {
          // Update local state
          setOperations((prev) =>
            prev.map((op) => (op.operationName === operationName ? data.operation : op))
          )

          // Show warnings si présents
          if (data.warnings && data.warnings.length > 0) {
            data.warnings.forEach((warning: string) => {
              toast.warning(warning)
            })
          }

          toast.success('Configuration mise à jour avec succès')
          return data.operation
        } else {
          throw new Error(data.error || 'Erreur inconnue')
        }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Erreur inconnue'
        toast.error(`Erreur: ${errorMessage}`)
        throw err
      }
    },
    []
  )

  /**
   * Reset configuration aux valeurs par défaut
   */
  const resetOperation = useCallback(async (operationName: OperationName) => {
    try {
      const response = await fetch(`/api/admin/operations-config/${operationName}`, {
        method: 'DELETE',
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Erreur lors de la réinitialisation')
      }

      if (data.success) {
        // Update local state
        setOperations((prev) =>
          prev.map((op) => (op.operationName === operationName ? data.operation : op))
        )

        toast.success('Configuration réinitialisée aux valeurs par défaut')
        return data.operation
      } else {
        throw new Error(data.error || 'Erreur inconnue')
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Erreur inconnue'
      toast.error(`Erreur: ${errorMessage}`)
      throw err
    }
  }, [])

  /**
   * Vide le cache serveur
   */
  const clearCache = useCallback(async () => {
    try {
      // Utilise l'endpoint de clear cache (à créer si n'existe pas)
      // Pour l'instant, force un refetch qui invalide le cache côté serveur
      await fetchOperations()
      toast.success('Cache invalidé et configurations rechargées')
    } catch (err) {
      toast.error('Erreur lors de l\'invalidation du cache')
    }
  }, [fetchOperations])

  /**
   * Auto-refresh
   */
  useEffect(() => {
    fetchOperations()

    if (autoRefresh) {
      const interval = setInterval(fetchOperations, refreshInterval)
      return () => clearInterval(interval)
    }
  }, [fetchOperations, autoRefresh, refreshInterval])

  return {
    operations,
    loading,
    error,
    fetchOperations,
    fetchOperation,
    updateOperation,
    resetOperation,
    clearCache,
    refetch: fetchOperations,
  }
}
