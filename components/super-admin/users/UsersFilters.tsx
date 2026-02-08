'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useState, useCallback } from 'react'
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

interface UsersFiltersProps {
  currentStatus: string
  currentRole: string
  currentPlan: string
  currentSearch: string
}

export function UsersFilters({
  currentStatus,
  currentRole,
  currentPlan,
  currentSearch
}: UsersFiltersProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [search, setSearch] = useState(currentSearch)

  const updateFilters = useCallback((key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString())
    if (value && value !== 'all') {
      params.set(key, value)
    } else {
      params.delete(key)
    }
    params.delete('page') // Reset pagination on filter change
    router.push(`/super-admin/users?${params.toString()}`)
  }, [router, searchParams])

  const handleSearch = useCallback(() => {
    updateFilters('search', search)
  }, [search, updateFilters])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch()
    }
  }, [handleSearch])

  const clearFilters = useCallback(() => {
    router.push('/super-admin/users')
    setSearch('')
  }, [router])

  const hasFilters = currentStatus !== 'all' || currentRole !== 'all' || currentPlan !== 'all' || currentSearch

  return (
    <div className="flex flex-wrap gap-4 items-center">
      {/* Recherche */}
      <div className="flex gap-2 flex-1 min-w-[200px] max-w-md">
        <Input
          placeholder="Rechercher par email, nom..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={handleKeyDown}
          className="bg-slate-800 border-slate-600 text-white placeholder:text-slate-400"
        />
        <Button
          onClick={handleSearch}
          variant="secondary"
          className="bg-slate-700 hover:bg-slate-600"
          aria-label="Rechercher"
        >
          <Icons.search className="h-4 w-4" />
        </Button>
      </div>

      {/* Filtre Status */}
      <Select value={currentStatus} onValueChange={(v) => updateFilters('status', v)}>
        <SelectTrigger className="w-[150px] bg-slate-800 border-slate-600 text-white" aria-label="Filtrer par statut">
          <SelectValue placeholder="Status" />
        </SelectTrigger>
        <SelectContent className="bg-slate-800 border-slate-600">
          <SelectItem value="all" className="text-white hover:bg-slate-700">Tous les status</SelectItem>
          <SelectItem value="pending" className="text-yellow-500 hover:bg-slate-700">En attente</SelectItem>
          <SelectItem value="approved" className="text-green-500 hover:bg-slate-700">Approuvés</SelectItem>
          <SelectItem value="suspended" className="text-red-500 hover:bg-slate-700">Suspendus</SelectItem>
          <SelectItem value="rejected" className="text-slate-400 hover:bg-slate-700">Rejetés</SelectItem>
        </SelectContent>
      </Select>

      {/* Filtre Rôle */}
      <Select value={currentRole} onValueChange={(v) => updateFilters('role', v)}>
        <SelectTrigger className="w-[150px] bg-slate-800 border-slate-600 text-white" aria-label="Filtrer par rôle">
          <SelectValue placeholder="Rôle" />
        </SelectTrigger>
        <SelectContent className="bg-slate-800 border-slate-600">
          <SelectItem value="all" className="text-white hover:bg-slate-700">Tous les rôles</SelectItem>
          <SelectItem value="user" className="text-white hover:bg-slate-700">Utilisateur</SelectItem>
          <SelectItem value="admin" className="text-white hover:bg-slate-700">Admin</SelectItem>
          <SelectItem value="super_admin" className="text-blue-500 hover:bg-slate-700">Super Admin</SelectItem>
        </SelectContent>
      </Select>

      {/* Filtre Plan */}
      <Select value={currentPlan} onValueChange={(v) => updateFilters('plan', v)}>
        <SelectTrigger className="w-[150px] bg-slate-800 border-slate-600 text-white" aria-label="Filtrer par plan">
          <SelectValue placeholder="Plan" />
        </SelectTrigger>
        <SelectContent className="bg-slate-800 border-slate-600">
          <SelectItem value="all" className="text-white hover:bg-slate-700">Tous les plans</SelectItem>
          <SelectItem value="free" className="text-slate-400 hover:bg-slate-700">Free</SelectItem>
          <SelectItem value="pro" className="text-blue-500 hover:bg-slate-700">Pro</SelectItem>
          <SelectItem value="enterprise" className="text-purple-500 hover:bg-slate-700">Enterprise</SelectItem>
        </SelectContent>
      </Select>

      {/* Clear filters */}
      {hasFilters && (
        <Button
          variant="ghost"
          onClick={clearFilters}
          className="text-slate-400 hover:text-white"
        >
          <Icons.close className="h-4 w-4 mr-2" />
          Effacer filtres
        </Button>
      )}
    </div>
  )
}
