'use client'

/**
 * Hook pour gérer les filtres + pagination d'une table de données.
 * Remplace le pattern [page, search, filter1, filter2, ...] répété 50+ fois.
 *
 * @example
 * const { filters, setFilter, page, setPage, resetFilters, buildParams } = useTableFilters({
 *   status: 'all',
 *   cronName: 'all',
 *   search: '',
 * })
 *
 * // Dans un useEffect / useCallback :
 * const params = buildParams({ limit: '20' })
 * const res = await fetch(`/api/admin/executions?${params}`)
 *
 * // Réinitialiser la page lors d'un changement de filtre :
 * setFilter('status', 'running')  // reset page à 1 automatiquement
 */

import { useState, useCallback } from 'react'

interface UseTableFiltersResult<F extends Record<string, string>> {
  filters: F
  /** Met à jour un filtre et remet la page à 1 */
  setFilter: (key: keyof F, value: string) => void
  page: number
  setPage: (page: number) => void
  resetFilters: () => void
  /** Construit un URLSearchParams avec les filtres actifs + la page courante */
  buildParams: (extra?: Record<string, string>) => URLSearchParams
}

export function useTableFilters<F extends Record<string, string>>(
  defaults: F
): UseTableFiltersResult<F> {
  const [filters, setFilters] = useState<F>({ ...defaults })
  const [page, setPage] = useState(1)

  const setFilter = useCallback((key: keyof F, value: string) => {
    setFilters((prev) => ({ ...prev, [key]: value }))
    setPage(1) // Reset pagination on filter change
  }, [])

  const resetFilters = useCallback(() => {
    setFilters({ ...defaults })
    setPage(1)
  }, [defaults])

  const buildParams = useCallback(
    (extra?: Record<string, string>): URLSearchParams => {
      const params = new URLSearchParams()
      params.set('page', String(page))
      for (const [key, value] of Object.entries(filters)) {
        if (value && value !== 'all') {
          params.set(key, value)
        }
      }
      if (extra) {
        for (const [key, value] of Object.entries(extra)) {
          params.set(key, value)
        }
      }
      return params
    },
    [filters, page]
  )

  return { filters, setFilter, page, setPage, resetFilters, buildParams }
}
