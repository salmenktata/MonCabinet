/**
 * Hook React Query pour Taxonomie Juridique
 *
 * Sprint 6 - Phase 2 : Cache & Performance
 *
 * Gestion cache taxonomie (tribunaux, chambres, domaines, types documents).
 * Gain attendu : -100% requêtes après premier chargement, données stables
 */

'use client'

import { useQuery } from '@tanstack/react-query'

// =============================================================================
// TYPES
// =============================================================================

export interface TaxonomyOption {
  code: string
  labelFr: string
  labelAr: string
}

export type TaxonomyType = 'tribunal' | 'chambre' | 'domain' | 'document_type'

export interface TaxonomyResult {
  items: TaxonomyOption[]
  total: number
}

// =============================================================================
// QUERY KEYS
// =============================================================================

export const taxonomyKeys = {
  all: ['taxonomy'] as const,
  lists: () => [...taxonomyKeys.all, 'list'] as const,
  list: (type: TaxonomyType) => [...taxonomyKeys.lists(), type] as const,
}

// =============================================================================
// API FUNCTIONS
// =============================================================================

async function fetchTaxonomy(type: TaxonomyType): Promise<TaxonomyResult> {
  const response = await fetch(`/api/taxonomy?type=${type}`)

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Erreur de chargement' }))
    throw new Error(error.error || `HTTP ${response.status}`)
  }

  const data = await response.json()

  return {
    items: data.items || [],
    total: data.total || data.items?.length || 0,
  }
}

// =============================================================================
// HOOKS
// =============================================================================

/**
 * Hook pour charger une taxonomie par type
 *
 * Usage :
 * ```tsx
 * const { data: tribunaux, isLoading } = useTaxonomy('tribunal')
 *
 * // Accès aux items
 * tribunaux?.items.map(tribunal => (
 *   <option key={tribunal.code} value={tribunal.code}>
 *     {tribunal.labelFr}
 *   </option>
 * ))
 * ```
 */
export function useTaxonomy(
  type: TaxonomyType,
  options?: {
    enabled?: boolean
    staleTime?: number
    cacheTime?: number
  }
) {
  const { enabled = true, staleTime = 30 * 60 * 1000, cacheTime = 60 * 60 * 1000 } = options || {}

  return useQuery({
    queryKey: taxonomyKeys.list(type),
    queryFn: () => fetchTaxonomy(type),
    enabled,
    staleTime, // 30 minutes par défaut (données stables)
    gcTime: cacheTime, // 60 minutes (données rarement modifiées)
  })
}

/**
 * Hook pour charger toutes les taxonomies en parallèle
 *
 * Usage :
 * ```tsx
 * const taxonomies = useAllTaxonomies()
 *
 * if (taxonomies.isLoading) return <Loading />
 *
 * const tribunaux = taxonomies.tribunaux?.items || []
 * const chambres = taxonomies.chambres?.items || []
 * const domaines = taxonomies.domaines?.items || []
 * const typesDoc = taxonomies.typesDocument?.items || []
 * ```
 */
export function useAllTaxonomies(options?: {
  enabled?: boolean
  staleTime?: number
  cacheTime?: number
}) {
  const { enabled = true, staleTime = 30 * 60 * 1000, cacheTime = 60 * 60 * 1000 } = options || {}

  const tribunaux = useTaxonomy('tribunal', { enabled, staleTime, cacheTime })
  const chambres = useTaxonomy('chambre', { enabled, staleTime, cacheTime })
  const domaines = useTaxonomy('domain', { enabled, staleTime, cacheTime })
  const typesDocument = useTaxonomy('document_type', { enabled, staleTime, cacheTime })

  return {
    tribunaux: tribunaux.data,
    chambres: chambres.data,
    domaines: domaines.data,
    typesDocument: typesDocument.data,
    isLoading:
      tribunaux.isLoading ||
      chambres.isLoading ||
      domaines.isLoading ||
      typesDocument.isLoading,
    isError: tribunaux.isError || chambres.isError || domaines.isError || typesDocument.isError,
    error: tribunaux.error || chambres.error || domaines.error || typesDocument.error,
  }
}

// =============================================================================
// UTILITIES
// =============================================================================

/**
 * Find taxonomy option by code
 */
export function findTaxonomyOption(
  items: TaxonomyOption[] | undefined,
  code: string
): TaxonomyOption | undefined {
  if (!items) return undefined
  return items.find((item) => item.code === code)
}

/**
 * Get label for taxonomy option in specified language
 */
export function getTaxonomyLabel(
  items: TaxonomyOption[] | undefined,
  code: string,
  language: 'fr' | 'ar' = 'fr'
): string {
  const option = findTaxonomyOption(items, code)
  if (!option) return code

  return language === 'ar' ? option.labelAr : option.labelFr
}

/**
 * Filter taxonomy options by search query
 */
export function filterTaxonomyOptions(
  items: TaxonomyOption[] | undefined,
  query: string,
  language: 'fr' | 'ar' = 'fr'
): TaxonomyOption[] {
  if (!items || !query) return items || []

  const lowerQuery = query.toLowerCase()

  return items.filter((item) => {
    const label = language === 'ar' ? item.labelAr : item.labelFr
    return (
      label.toLowerCase().includes(lowerQuery) ||
      item.code.toLowerCase().includes(lowerQuery)
    )
  })
}
