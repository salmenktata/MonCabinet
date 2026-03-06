'use client'

import { useRouter } from 'next/navigation'
import { useLocale } from 'next-intl'
import { useState, useCallback, useMemo } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Icons } from '@/lib/icons'
import { getAllCategoryOptions } from '@/lib/web-scraper/category-labels'
import { useDebouncedCallback } from 'use-debounce'
import type { SortField, SortDirection, ViewMode } from './types'

interface WebSourcesFiltersProps {
  category: string
  status: string
  search: string
  language: string
  sortBy: string
  sortDir: string
  view: ViewMode
}

const getStatuses = (locale: 'fr' | 'ar') => [
  { value: 'all', label: locale === 'ar' ? 'جميع الحالات' : 'Tous les statuts' },
  { value: 'active', label: locale === 'ar' ? 'نشطة' : 'Actives' },
  { value: 'inactive', label: locale === 'ar' ? 'غير نشطة' : 'Inactives' },
  { value: 'failing', label: locale === 'ar' ? 'خطأ' : 'En erreur' },
]

const LANGUAGES = [
  { value: 'all', label: 'Toutes les langues' },
  { value: 'ar', label: 'Arabe' },
  { value: 'fr', label: 'Francais' },
  { value: 'mixed', label: 'Mixte' },
]

const SORT_OPTIONS: { value: SortField; label: string }[] = [
  { value: 'priority', label: 'Priorite' },
  { value: 'name', label: 'Nom' },
  { value: 'last_crawl_at', label: 'Dernier crawl' },
  { value: 'pages_count', label: 'Pages' },
  { value: 'indexation_rate', label: 'Taux indexation' },
]

export function WebSourcesFilters({ category, status, search, language, sortBy, sortDir, view }: WebSourcesFiltersProps) {
  const router = useRouter()
  const locale = useLocale() as 'fr' | 'ar'
  const [searchValue, setSearchValue] = useState(search)

  const categories = useMemo(() => getAllCategoryOptions(locale), [locale])
  const statuses = useMemo(() => getStatuses(locale), [locale])

  const updateUrl = useCallback((params: Record<string, string>) => {
    const searchParams = new URLSearchParams()
    Object.entries(params).forEach(([key, value]) => {
      if (key === 'status') {
        // 'all' explicite dans l'URL pour outrepasser le défaut 'active'
        if (value && value !== 'active') searchParams.set(key, value)
        else if (value === 'active') searchParams.set(key, 'active')
      } else if (value && value !== 'all') {
        searchParams.set(key, value)
      }
    })
    router.push(`/super-admin/web-sources?${searchParams.toString()}`)
  }, [router])

  const currentParams = useCallback(() => ({
    category: category || '',
    status: status || '',
    search: searchValue,
    language: language || '',
    sortBy: sortBy || '',
    sortDir: sortDir || '',
    view: view || '',
  }), [category, status, searchValue, language, sortBy, sortDir, view])

  const debouncedSearch = useDebouncedCallback((value: string) => {
    updateUrl({ ...currentParams(), search: value })
  }, 300)

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    setSearchValue(value)
    debouncedSearch(value)
  }

  const handleCategoryChange = (value: string) => {
    updateUrl({ ...currentParams(), category: value })
  }

  const handleStatusChange = (value: string) => {
    updateUrl({ ...currentParams(), status: value })
  }

  const handleLanguageChange = (value: string) => {
    updateUrl({ ...currentParams(), language: value })
  }

  const handleSortChange = (value: string) => {
    updateUrl({ ...currentParams(), sortBy: value })
  }

  const handleSortDirToggle = () => {
    updateUrl({ ...currentParams(), sortDir: sortDir === 'asc' ? 'desc' : 'asc' })
  }

  const handleViewChange = (newView: ViewMode) => {
    updateUrl({ ...currentParams(), view: newView })
  }

  return (
    <div className="flex flex-wrap gap-3 items-center">
      {/* Search */}
      <div className="relative flex-1 min-w-[200px] max-w-md">
        <Icons.search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={searchValue}
          onChange={handleSearchChange}
          placeholder={locale === 'ar' ? 'البحث بالاسم أو الرابط...' : 'Rechercher par nom ou URL...'}
          className="pl-9 bg-card border-border text-foreground placeholder:text-muted-foreground"
          dir={locale === 'ar' ? 'rtl' : 'ltr'}
        />
      </div>

      {/* Category */}
      <Select value={category || 'all'} onValueChange={handleCategoryChange}>
        <SelectTrigger className="w-[220px] bg-card border-border text-foreground" aria-label="Filtrer par categorie">
          <SelectValue placeholder="Categorie" />
        </SelectTrigger>
        <SelectContent className="bg-card border-border">
          {categories.map((cat) => (
            <SelectItem
              key={cat.value}
              value={cat.value}
              className="text-foreground hover:bg-muted focus:bg-muted"
            >
              {cat.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Status */}
      <Select value={status || 'all'} onValueChange={handleStatusChange}>
        <SelectTrigger className="w-[140px] bg-card border-border text-foreground" aria-label="Filtrer par statut">
          <SelectValue placeholder="Statut" />
        </SelectTrigger>
        <SelectContent className="bg-card border-border">
          {statuses.map((st) => (
            <SelectItem
              key={st.value}
              value={st.value}
              className="text-foreground hover:bg-muted focus:bg-muted"
            >
              {st.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Language */}
      <Select value={language || 'all'} onValueChange={handleLanguageChange}>
        <SelectTrigger className="w-[150px] bg-card border-border text-foreground" aria-label="Filtrer par langue">
          <SelectValue placeholder="Langue" />
        </SelectTrigger>
        <SelectContent className="bg-card border-border">
          {LANGUAGES.map((lang) => (
            <SelectItem
              key={lang.value}
              value={lang.value}
              className="text-foreground hover:bg-muted focus:bg-muted"
            >
              {lang.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Sort */}
      <Select value={sortBy || 'priority'} onValueChange={handleSortChange}>
        <SelectTrigger className="w-[160px] bg-card border-border text-foreground" aria-label="Trier par">
          <SelectValue placeholder="Trier par" />
        </SelectTrigger>
        <SelectContent className="bg-card border-border">
          {SORT_OPTIONS.map((opt) => (
            <SelectItem
              key={opt.value}
              value={opt.value}
              className="text-foreground hover:bg-muted focus:bg-muted"
            >
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Sort direction */}
      <Button
        variant="outline"
        size="icon"
        onClick={handleSortDirToggle}
        className="bg-card border-border text-muted-foreground hover:bg-muted hover:text-foreground"
        title={sortDir === 'asc' ? 'Tri croissant' : 'Tri decroissant'}
      >
        {sortDir === 'asc' ? (
          <Icons.arrowUp className="h-4 w-4" />
        ) : (
          <Icons.arrowDown className="h-4 w-4" />
        )}
      </Button>

      {/* View toggle */}
      <div className="flex border border-border rounded-md overflow-hidden">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => handleViewChange('table')}
          className={`rounded-none h-9 w-9 ${view === 'table' ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
          title="Vue tableau"
        >
          <Icons.list className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => handleViewChange('cards')}
          className={`rounded-none h-9 w-9 ${view === 'cards' ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
          title="Vue cartes"
        >
          <Icons.grid className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => handleViewChange('pipeline')}
          className={`rounded-none h-9 w-9 ${view === 'pipeline' ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
          title="Vue pipeline"
        >
          <Icons.gitBranch className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}
