'use client'

/**
 * Composant de filtres juridiques pour recherche enrichie
 *
 * Permet de filtrer la recherche RAG par :
 * - Tribunal (Cassation, Appel, etc.)
 * - Chambre (Civile, Commerciale, Pénale, etc.)
 * - Domaine juridique (Civil, Commercial, Pénal, etc.)
 * - Type de document (Jurisprudence, Code, Doctrine)
 * - Plage de dates
 * - Langue (AR/FR)
 * - Confiance minimum
 *
 * @module components/assistant-ia/LegalFilters
 *
 * Sprint 6 - Phase 2 : Migration React Query
 * - Remplacé fetch() manuel par useAllTaxonomies()
 * - Cache 30min taxonomie (données stables)
 */

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Calendar, Filter, X, ChevronDown, ChevronUp } from 'lucide-react'
import type { EnhancedSearchFilters } from '@/lib/ai/enhanced-rag-search-service'
import { useAllTaxonomies } from '@/lib/hooks/useTaxonomy'

// =============================================================================
// TYPES
// =============================================================================

interface LegalFiltersProps {
  /** Filtres actuels */
  filters: EnhancedSearchFilters
  /** Callback lors du changement de filtres */
  onChange: (filters: EnhancedSearchFilters) => void
  /** Afficher le composant en mode collapsed par défaut */
  defaultCollapsed?: boolean
  /** Classe CSS personnalisée */
  className?: string
}

// =============================================================================
// COMPOSANT PRINCIPAL
// =============================================================================

export default function LegalFilters({
  filters,
  onChange,
  defaultCollapsed = false,
  className = '',
}: LegalFiltersProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed)
  const [localFilters, setLocalFilters] = useState<EnhancedSearchFilters>(filters)

  // Charger toutes les taxonomies avec React Query
  const taxonomies = useAllTaxonomies()

  // Données dérivées
  const tribunaux = taxonomies.tribunaux?.items || []
  const chambres = taxonomies.chambres?.items || []
  const domaines = taxonomies.domaines?.items || []
  const typesDocument = taxonomies.typesDocument?.items || []
  const loading = taxonomies.isLoading

  // Synchroniser avec les query params de l'URL
  useEffect(() => {
    const urlFilters: EnhancedSearchFilters = {}

    if (searchParams.get('tribunal')) {
      urlFilters.tribunal = searchParams.get('tribunal') || undefined
    }
    if (searchParams.get('chambre')) {
      urlFilters.chambre = searchParams.get('chambre') || undefined
    }
    if (searchParams.get('domain')) {
      urlFilters.domain = searchParams.get('domain') || undefined
    }
    if (searchParams.get('documentType')) {
      urlFilters.documentType = searchParams.get('documentType') || undefined
    }
    if (searchParams.get('language')) {
      urlFilters.language = searchParams.get('language') as 'ar' | 'fr' | 'bi' | undefined
    }
    if (searchParams.get('dateFrom')) {
      urlFilters.dateRange = {
        ...urlFilters.dateRange,
        from: new Date(searchParams.get('dateFrom')!),
      }
    }
    if (searchParams.get('dateTo')) {
      urlFilters.dateRange = {
        ...urlFilters.dateRange,
        to: new Date(searchParams.get('dateTo')!),
      }
    }
    if (searchParams.get('minConfidence')) {
      urlFilters.minConfidence = parseFloat(searchParams.get('minConfidence')!)
    }

    if (Object.keys(urlFilters).length > 0) {
      setLocalFilters(urlFilters)
      onChange(urlFilters)
    }
  }, [searchParams])

  // Fonction loadTaxonomyOptions supprimée - remplacée par useAllTaxonomies()

  const handleFilterChange = (key: keyof EnhancedSearchFilters, value: any) => {
    const newFilters = { ...localFilters, [key]: value }
    setLocalFilters(newFilters)
    onChange(newFilters)
    updateURLParams(newFilters)
  }

  const handleDateRangeChange = (type: 'from' | 'to', value: string) => {
    const newDateRange = {
      ...localFilters.dateRange,
      [type]: value ? new Date(value) : undefined,
    }
    handleFilterChange('dateRange', newDateRange)
  }

  const updateURLParams = (filters: EnhancedSearchFilters) => {
    const params = new URLSearchParams(searchParams.toString())

    // Mettre à jour les paramètres
    if (filters.tribunal) params.set('tribunal', filters.tribunal)
    else params.delete('tribunal')

    if (filters.chambre) params.set('chambre', filters.chambre)
    else params.delete('chambre')

    if (filters.domain) params.set('domain', filters.domain)
    else params.delete('domain')

    if (filters.documentType) params.set('documentType', filters.documentType)
    else params.delete('documentType')

    if (filters.language) params.set('language', filters.language)
    else params.delete('language')

    if (filters.dateRange?.from) {
      params.set('dateFrom', filters.dateRange.from.toISOString().split('T')[0])
    } else {
      params.delete('dateFrom')
    }

    if (filters.dateRange?.to) {
      params.set('dateTo', filters.dateRange.to.toISOString().split('T')[0])
    } else {
      params.delete('dateTo')
    }

    if (filters.minConfidence) {
      params.set('minConfidence', filters.minConfidence.toString())
    } else {
      params.delete('minConfidence')
    }

    router.replace(`?${params.toString()}`, { scroll: false })
  }

  const resetFilters = () => {
    const emptyFilters: EnhancedSearchFilters = {}
    setLocalFilters(emptyFilters)
    onChange(emptyFilters)
    router.replace(window.location.pathname, { scroll: false })
  }

  const hasActiveFilters = Object.keys(localFilters).length > 0

  return (
    <div className={`bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 ${className}`}>
      {/* Header */}
      <button
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="w-full flex items-center justify-between p-4 hover:bg-gray-50 dark:hover:bg-gray-750 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Filter className="w-5 h-5 text-primary-600 dark:text-primary-400" />
          <span className="font-semibold text-gray-900 dark:text-white">
            Filtres juridiques
          </span>
          {hasActiveFilters && (
            <span className="px-2 py-0.5 text-xs bg-primary-100 dark:bg-primary-900 text-primary-700 dark:text-primary-300 rounded-full">
              {Object.keys(localFilters).length} actif{Object.keys(localFilters).length > 1 ? 's' : ''}
            </span>
          )}
        </div>
        {isCollapsed ? (
          <ChevronDown className="w-5 h-5 text-gray-500" />
        ) : (
          <ChevronUp className="w-5 h-5 text-gray-500" />
        )}
      </button>

      {/* Filters content */}
      {!isCollapsed && (
        <div className="p-4 border-t border-gray-200 dark:border-gray-700 space-y-4">
          {loading ? (
            <div className="text-center py-4 text-gray-500">
              Chargement des filtres...
            </div>
          ) : (
            <>
              {/* Tribunal */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  🏛️ Tribunal
                </label>
                <select
                  value={localFilters.tribunal || ''}
                  onChange={(e) => handleFilterChange('tribunal', e.target.value || undefined)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                >
                  <option value="">Tous les tribunaux</option>
                  {tribunaux.map((tribunal) => (
                    <option key={tribunal.code} value={tribunal.code}>
                      {tribunal.labelFr} - {tribunal.labelAr}
                    </option>
                  ))}
                </select>
              </div>

              {/* Chambre */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  ⚖️ Chambre
                </label>
                <select
                  value={localFilters.chambre || ''}
                  onChange={(e) => handleFilterChange('chambre', e.target.value || undefined)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                >
                  <option value="">Toutes les chambres</option>
                  {chambres.map((chambre) => (
                    <option key={chambre.code} value={chambre.code}>
                      {chambre.labelFr} - {chambre.labelAr}
                    </option>
                  ))}
                </select>
              </div>

              {/* Domaine juridique */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  📚 Domaine juridique
                </label>
                <select
                  value={localFilters.domain || ''}
                  onChange={(e) => handleFilterChange('domain', e.target.value || undefined)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                >
                  <option value="">Tous les domaines</option>
                  {domaines.map((domaine) => (
                    <option key={domaine.code} value={domaine.code}>
                      {domaine.labelFr} - {domaine.labelAr}
                    </option>
                  ))}
                </select>
              </div>

              {/* Type de document */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  📄 Type de document
                </label>
                <select
                  value={localFilters.documentType || ''}
                  onChange={(e) => handleFilterChange('documentType', e.target.value || undefined)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                >
                  <option value="">Tous les types</option>
                  {typesDocument.map((type) => (
                    <option key={type.code} value={type.code}>
                      {type.labelFr} - {type.labelAr}
                    </option>
                  ))}
                </select>
              </div>

              {/* Plage de dates */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  <Calendar className="w-4 h-4 inline mr-1" />
                  Plage de dates
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
                      Du
                    </label>
                    <input
                      type="date"
                      value={localFilters.dateRange?.from?.toISOString().split('T')[0] || ''}
                      onChange={(e) => handleDateRangeChange('from', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
                      Au
                    </label>
                    <input
                      type="date"
                      value={localFilters.dateRange?.to?.toISOString().split('T')[0] || ''}
                      onChange={(e) => handleDateRangeChange('to', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent text-sm"
                    />
                  </div>
                </div>
              </div>

              {/* Langue */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  🌐 Langue
                </label>
                <select
                  value={localFilters.language || ''}
                  onChange={(e) => handleFilterChange('language', e.target.value || undefined)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                >
                  <option value="">Toutes les langues</option>
                  <option value="ar">Arabe (العربية)</option>
                  <option value="fr">Français</option>
                  <option value="bi">Bilingue (AR/FR)</option>
                </select>
              </div>

              {/* Confiance minimum */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  🎯 Confiance minimum : {localFilters.minConfidence ? `${Math.round(localFilters.minConfidence * 100)}%` : 'Aucune'}
                </label>
                <input
                  type="range"
                  min="0"
                  max="100"
                  step="5"
                  value={localFilters.minConfidence ? localFilters.minConfidence * 100 : 0}
                  onChange={(e) => {
                    const value = parseInt(e.target.value, 10)
                    handleFilterChange('minConfidence', value > 0 ? value / 100 : undefined)
                  }}
                  className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer accent-primary-600"
                />
                <div className="flex justify-between text-xs text-gray-500 mt-1">
                  <span>0%</span>
                  <span>50%</span>
                  <span>100%</span>
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-2 pt-4">
                <button
                  onClick={resetFilters}
                  disabled={!hasActiveFilters}
                  className="flex-1 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <X className="w-4 h-4 inline mr-1" />
                  Réinitialiser
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
