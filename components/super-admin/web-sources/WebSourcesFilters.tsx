'use client'

import { useRouter } from 'next/navigation'
import { useState, useCallback } from 'react'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Icons } from '@/lib/icons'
import { useDebouncedCallback } from 'use-debounce'

interface WebSourcesFiltersProps {
  category: string
  status: string
  search: string
}

const CATEGORIES = [
  { value: 'all', label: 'Toutes les catégories' },
  { value: 'legislation', label: 'Législation' },
  { value: 'jurisprudence', label: 'Jurisprudence' },
  { value: 'doctrine', label: 'Doctrine' },
  { value: 'jort', label: 'JORT' },
  { value: 'modeles', label: 'Modèles' },
  { value: 'procedures', label: 'Procédures' },
  { value: 'formulaires', label: 'Formulaires' },
  { value: 'autre', label: 'Autre' },
]

const STATUSES = [
  { value: 'all', label: 'Tous les statuts' },
  { value: 'active', label: 'Actives' },
  { value: 'inactive', label: 'Inactives' },
  { value: 'failing', label: 'En erreur' },
]

export function WebSourcesFilters({ category, status, search }: WebSourcesFiltersProps) {
  const router = useRouter()
  const [searchValue, setSearchValue] = useState(search)

  const updateUrl = useCallback((params: Record<string, string>) => {
    const searchParams = new URLSearchParams()
    Object.entries(params).forEach(([key, value]) => {
      if (value) searchParams.set(key, value)
    })
    router.push(`/super-admin/web-sources?${searchParams.toString()}`)
  }, [router])

  const debouncedSearch = useDebouncedCallback((value: string) => {
    updateUrl({ category, status, search: value })
  }, 300)

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    setSearchValue(value)
    debouncedSearch(value)
  }

  const handleCategoryChange = (value: string) => {
    updateUrl({ category: value === 'all' ? '' : value, status: status === 'all' ? '' : status, search: searchValue })
  }

  const handleStatusChange = (value: string) => {
    updateUrl({ category: category === 'all' ? '' : category, status: value === 'all' ? '' : value, search: searchValue })
  }

  return (
    <div className="flex flex-wrap gap-4 items-center">
      <div className="relative flex-1 min-w-[200px] max-w-md">
        <Icons.search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
        <Input
          value={searchValue}
          onChange={handleSearchChange}
          placeholder="Rechercher par nom ou URL..."
          className="pl-9 bg-slate-800 border-slate-700 text-white placeholder:text-slate-400"
        />
      </div>

      <Select value={category || 'all'} onValueChange={handleCategoryChange}>
        <SelectTrigger className="w-[180px] bg-slate-800 border-slate-700 text-white" aria-label="Filtrer par catégorie">
          <SelectValue placeholder="Catégorie" />
        </SelectTrigger>
        <SelectContent className="bg-slate-800 border-slate-700">
          {CATEGORIES.map((cat) => (
            <SelectItem
              key={cat.value}
              value={cat.value}
              className="text-slate-200 hover:bg-slate-700 focus:bg-slate-700"
            >
              {cat.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={status || 'all'} onValueChange={handleStatusChange}>
        <SelectTrigger className="w-[150px] bg-slate-800 border-slate-700 text-white" aria-label="Filtrer par statut">
          <SelectValue placeholder="Statut" />
        </SelectTrigger>
        <SelectContent className="bg-slate-800 border-slate-700">
          {STATUSES.map((st) => (
            <SelectItem
              key={st.value}
              value={st.value}
              className="text-slate-200 hover:bg-slate-700 focus:bg-slate-700"
            >
              {st.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
