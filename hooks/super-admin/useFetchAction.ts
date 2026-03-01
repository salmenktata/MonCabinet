'use client'

/**
 * Hook pour encapsuler un appel API avec état loading + feedback toast.
 * Remplace le pattern try/catch/toast répété 80+ fois dans les composants super-admin.
 *
 * @example
 * const { trigger, loading } = useFetchAction('/api/admin/backup', {
 *   method: 'POST',
 *   successMessage: 'Backup lancé',
 *   errorMessage: 'Échec du backup',
 * })
 * <Button onClick={() => trigger({ type: 'all' })} disabled={loading}>Backup</Button>
 */

import { useState, useCallback } from 'react'
import { toast } from 'sonner'

interface UseFetchActionOptions {
  method?: 'POST' | 'DELETE' | 'PUT' | 'PATCH'
  successMessage?: string
  errorMessage?: string
  /** Si true, les erreurs API (data.error) ne déclenchent pas toast.error — le appelant gère */
  silentError?: boolean
}

interface UseFetchActionResult<T> {
  trigger: (body?: unknown) => Promise<T | null>
  loading: boolean
}

export function useFetchAction<T = unknown>(
  endpoint: string,
  options: UseFetchActionOptions = {}
): UseFetchActionResult<T> {
  const { method = 'POST', successMessage, errorMessage, silentError = false } = options
  const [loading, setLoading] = useState(false)

  const trigger = useCallback(
    async (body?: unknown): Promise<T | null> => {
      setLoading(true)
      try {
        const res = await fetch(endpoint, {
          method,
          headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
          body: body !== undefined ? JSON.stringify(body) : undefined,
        })

        const data = await res.json()

        if (!res.ok || data.success === false) {
          const msg = data.error || errorMessage || 'Une erreur est survenue'
          if (!silentError) toast.error(msg)
          return null
        }

        if (successMessage) toast.success(successMessage)
        return data as T
      } catch (err) {
        const msg = errorMessage || 'Erreur de connexion'
        if (!silentError) toast.error(msg)
        console.error(`[useFetchAction] ${endpoint}:`, err)
        return null
      } finally {
        setLoading(false)
      }
    },
    [endpoint, method, successMessage, errorMessage, silentError]
  )

  return { trigger, loading }
}
