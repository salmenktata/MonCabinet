'use client'

import { useState, useCallback, useEffect } from 'react'
import { Clock, Trash2, History } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

const STORAGE_KEY = 'qadhya_kb_recent_searches'
const MAX_ENTRIES = 5

export function saveRecentSearch(query: string) {
  if (typeof window === 'undefined' || !query.trim()) return
  try {
    const existing: string[] = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')
    const next = [query.trim(), ...existing.filter(q => q !== query.trim())].slice(0, MAX_ENTRIES)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    // localStorage indisponible
  }
}

export function loadRecentSearches(): string[] {
  if (typeof window === 'undefined') return []
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')
  } catch {
    return []
  }
}

interface RecentSearchesDropdownProps {
  onSelect: (query: string) => void
  /** Permet au parent d'obtenir la fonction saveRecentSearch */
  registerSave?: (fn: (query: string) => void) => void
}

export function RecentSearchesDropdown({ onSelect, registerSave }: RecentSearchesDropdownProps) {
  const [recents, setRecents] = useState<string[]>([])
  const [open, setOpen] = useState(false)

  // Expose la fonction de sauvegarde au parent via registerSave
  const save = useCallback((query: string) => {
    saveRecentSearch(query)
    setRecents(loadRecentSearches())
  }, [])

  useEffect(() => {
    if (registerSave) {
      registerSave(save)
    }
  }, [registerSave, save])

  useEffect(() => {
    if (open) {
      setRecents(loadRecentSearches())
    }
  }, [open])

  const handleClear = useCallback(() => {
    try {
      localStorage.removeItem(STORAGE_KEY)
    } catch {
      // ignore
    }
    setRecents([])
  }, [])

  if (recents.length === 0 && !open) {
    // Bouton discret quand pas d'historique
    return null
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          title="Recherches récentes"
          aria-label="Afficher les recherches récentes"
        >
          <History className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel className="flex items-center gap-2">
          <Clock className="h-3.5 w-3.5" />
          Recherches récentes
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {recents.length === 0 ? (
          <div className="px-2 py-3 text-sm text-muted-foreground text-center">
            Aucune recherche récente
          </div>
        ) : (
          <>
            {recents.map((q) => (
              <DropdownMenuItem
                key={q}
                className="cursor-pointer"
                onSelect={() => {
                  onSelect(q)
                  setOpen(false)
                }}
              >
                <Clock className="h-3.5 w-3.5 mr-2 text-muted-foreground shrink-0" />
                <span className="truncate">{q}</span>
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-muted-foreground cursor-pointer"
              onSelect={handleClear}
            >
              <Trash2 className="h-3.5 w-3.5 mr-2" />
              Effacer l&apos;historique
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
