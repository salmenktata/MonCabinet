'use client'

import { useCallback, useState, useTransition } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Icons } from '@/lib/icons'
import { LEGAL_CATEGORY_TRANSLATIONS, type LegalCategory } from '@/lib/categories/legal-categories'

const TYPE_LABELS: Record<string, string> = {
  code: 'Code',
  loi: 'Loi',
  decret: 'Décret',
  arrete: 'Arrêté',
  circulaire: 'Circulaire',
  jurisprudence: 'Jurisprudence',
  doctrine: 'Doctrine',
  guide: 'Guide',
  formulaire: 'Formulaire',
  autre: 'Autre',
}

interface LegalDocumentsFiltersBarProps {
  categories: string[]
  types: string[]
  currentCategory: string | null
  currentType: string | null
  currentStatus: string | null
  currentSearch: string | null
  filteredCount: number
  hasFilters: boolean
}

export function LegalDocumentsFiltersBar({
  categories,
  types,
  currentCategory,
  currentType,
  currentStatus,
  currentSearch,
  filteredCount,
  hasFilters,
}: LegalDocumentsFiltersBarProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [, startTransition] = useTransition()
  const [searchValue, setSearchValue] = useState(currentSearch || '')

  const updateFilter = useCallback(
    (key: string, value: string | null) => {
      const params = new URLSearchParams(searchParams.toString())
      if (value) {
        params.set(key, value)
      } else {
        params.delete(key)
      }
      params.set('page', '1')
      startTransition(() => router.push(`?${params.toString()}`))
    },
    [searchParams, router]
  )

  const handleSearchSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault()
      updateFilter('q', searchValue.trim() || null)
    },
    [searchValue, updateFilter]
  )

  const handleClearSearch = useCallback(() => {
    setSearchValue('')
    updateFilter('q', null)
  }, [updateFilter])

  const resetFilters = useCallback(() => {
    setSearchValue('')
    startTransition(() => router.push('?'))
  }, [router])

  return (
    <div className="flex flex-col gap-3 p-4 bg-slate-900/50 border border-slate-700 rounded-lg">
      <div className="flex flex-wrap items-center gap-3">
        {/* Barre de recherche */}
        <form onSubmit={handleSearchSubmit} className="relative flex items-center gap-2 flex-1 min-w-48 max-w-sm">
          <div className="relative flex-1">
            <Icons.search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-500" />
            <input
              value={searchValue}
              onChange={e => setSearchValue(e.target.value)}
              placeholder="Rechercher..."
              className="w-full pl-9 pr-8 py-1.5 text-sm bg-slate-800 border border-slate-600 text-white placeholder:text-slate-500 rounded-md focus:outline-none focus:border-blue-500 transition-colors"
            />
            {searchValue && (
              <button
                type="button"
                onClick={handleClearSearch}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white transition-colors"
              >
                <Icons.x className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </form>

        {/* Divider */}
        <div className="h-5 w-px bg-slate-700 hidden sm:block" />

        {/* Catégorie */}
        <select
          value={currentCategory || ''}
          onChange={e => updateFilter('category', e.target.value || null)}
          className="text-sm bg-slate-800 border border-slate-600 text-slate-300 rounded-md px-3 py-1.5 focus:outline-none focus:border-blue-500 transition-colors cursor-pointer"
        >
          <option value="">Catégorie</option>
          {categories.map(c => (
            <option key={c} value={c}>
              {LEGAL_CATEGORY_TRANSLATIONS[c as LegalCategory]?.fr || c}
            </option>
          ))}
        </select>

        {/* Type */}
        <select
          value={currentType || ''}
          onChange={e => updateFilter('type', e.target.value || null)}
          className="text-sm bg-slate-800 border border-slate-600 text-slate-300 rounded-md px-3 py-1.5 focus:outline-none focus:border-blue-500 transition-colors cursor-pointer"
        >
          <option value="">Type</option>
          {types.map(t => (
            <option key={t} value={t}>
              {TYPE_LABELS[t] || t}
            </option>
          ))}
        </select>

        {/* Statut */}
        <select
          value={currentStatus || ''}
          onChange={e => updateFilter('status', e.target.value || null)}
          className="text-sm bg-slate-800 border border-slate-600 text-slate-300 rounded-md px-3 py-1.5 focus:outline-none focus:border-blue-500 transition-colors cursor-pointer"
        >
          <option value="">Statut</option>
          <option value="approved">Approuvés</option>
          <option value="complete">Consolidés</option>
          <option value="pending">En attente</option>
        </select>

        {/* Reset + Count */}
        <div className="flex items-center gap-3 ml-auto">
          {hasFilters && (
            <button
              onClick={resetFilters}
              className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition-colors"
            >
              <Icons.x className="h-3.5 w-3.5" />
              Réinitialiser
            </button>
          )}
          {hasFilters && (
            <span className="text-sm text-slate-400 tabular-nums">
              {filteredCount.toLocaleString('fr-FR')} résultat{filteredCount !== 1 ? 's' : ''}
            </span>
          )}
        </div>
      </div>

      {/* Active filters pills */}
      {hasFilters && (
        <div className="flex flex-wrap gap-1.5">
          {currentSearch && (
            <ActivePill
              label={`"${currentSearch}"`}
              onRemove={() => { setSearchValue(''); updateFilter('q', null) }}
            />
          )}
          {currentCategory && (
            <ActivePill
              label={LEGAL_CATEGORY_TRANSLATIONS[currentCategory as LegalCategory]?.fr || currentCategory}
              onRemove={() => updateFilter('category', null)}
            />
          )}
          {currentType && (
            <ActivePill
              label={TYPE_LABELS[currentType] || currentType}
              onRemove={() => updateFilter('type', null)}
            />
          )}
          {currentStatus && (
            <ActivePill
              label={currentStatus === 'approved' ? 'Approuvés' : currentStatus === 'complete' ? 'Consolidés' : 'En attente'}
              onRemove={() => updateFilter('status', null)}
            />
          )}
        </div>
      )}
    </div>
  )
}

function ActivePill({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-blue-500/15 text-blue-300 border border-blue-500/25">
      {label}
      <button onClick={onRemove} className="hover:text-white transition-colors ml-0.5">
        <Icons.x className="h-3 w-3" />
      </button>
    </span>
  )
}
