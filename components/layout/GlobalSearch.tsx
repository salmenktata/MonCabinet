'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command'
import { Icons } from '@/lib/icons'
import { cn } from '@/lib/utils'

interface SearchResult {
  id: string
  type: 'client' | 'dossier' | 'facture' | 'document'
  title: string
  subtitle?: string
  url: string
  icon: keyof typeof Icons
  badge?: {
    text: string
    variant: 'default' | 'success' | 'warning' | 'destructive'
  }
}

interface GlobalSearchProps {
  className?: string
}

export function GlobalSearch({ className }: GlobalSearchProps) {
  const router = useRouter()
  const t = useTranslations('search')
  const [open, setOpen] = React.useState(false)
  const [query, setQuery] = React.useState('')
  const [results, setResults] = React.useState<SearchResult[]>([])
  const [isSearching, setIsSearching] = React.useState(false)

  // Écouter le raccourci clavier CMD+K / CTRL+K
  React.useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setOpen((open) => !open)
      }
    }

    document.addEventListener('keydown', down)
    return () => document.removeEventListener('keydown', down)
  }, [])

  // Debounced search (300ms) avec AbortController pour annuler les requêtes précédentes
  React.useEffect(() => {
    if (!query.trim()) {
      setResults([])
      setIsSearching(false)
      return
    }

    setIsSearching(true)
    const abortController = new AbortController()

    const timer = setTimeout(async () => {
      try {
        const response = await fetch(
          `/api/search?q=${encodeURIComponent(query)}`,
          { signal: abortController.signal }
        )

        if (response.ok) {
          const data = await response.json()
          setResults(data.results || [])
        } else {
          setResults([])
        }
      } catch (error) {
        // Ignorer les erreurs d'abort (requête annulée)
        if (error instanceof Error && error.name === 'AbortError') {
          return
        }
        console.error('Search error:', error)
        setResults([])
      } finally {
        if (!abortController.signal.aborted) {
          setIsSearching(false)
        }
      }
    }, 300)

    return () => {
      clearTimeout(timer)
      abortController.abort()
    }
  }, [query])

  // Grouper les résultats par type
  const groupedResults = React.useMemo(() => {
    const groups: Record<string, SearchResult[]> = {
      client: [],
      dossier: [],
      facture: [],
      document: [],
    }

    results.forEach((result) => {
      if (groups[result.type]) {
        groups[result.type].push(result)
      }
    })

    return groups
  }, [results])

  const handleSelect = (url: string) => {
    setOpen(false)
    setQuery('')
    router.push(url)
  }

  const getGroupLabel = (type: string) => {
    const labels: Record<string, string> = {
      client: 'Clients',
      dossier: 'Dossiers',
      facture: 'Factures',
      document: 'Documents',
    }
    return labels[type] || type
  }

  const getBadgeColor = (variant: NonNullable<SearchResult['badge']>['variant']) => {
    const colors = {
      default: 'bg-primary/10 text-primary',
      success: 'bg-green-100 dark:bg-green-900/20 text-green-700 dark:text-green-400',
      warning: 'bg-orange-100 dark:bg-orange-900/20 text-orange-700 dark:text-orange-400',
      destructive: 'bg-red-100 dark:bg-red-900/20 text-red-700 dark:text-red-400',
    }
    return colors[variant] || colors.default
  }

  return (
    <>
      {/* Bouton de recherche dans la topbar */}
      <button
        onClick={() => setOpen(true)}
        className={cn(
          'flex h-9 w-full max-w-sm items-center gap-2 rounded-md border border-input bg-transparent px-3 py-2 text-sm text-muted-foreground shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground',
          className
        )}
      >
        <Icons.search className="h-4 w-4 shrink-0" />
        <span className="flex-1 text-left">Rechercher...</span>
        <kbd className="pointer-events-none hidden h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium opacity-100 md:flex">
          <span className="text-xs">⌘</span>K
        </kbd>
      </button>

      {/* Dialog de recherche */}
      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput
          placeholder="Rechercher clients, dossiers, factures..."
          value={query}
          onValueChange={setQuery}
        />
        <CommandList>
          {isSearching && (
            <div className="flex items-center justify-center py-6">
              <Icons.loader className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          )}

          {!isSearching && query && results.length === 0 && (
            <CommandEmpty>
              <div className="flex flex-col items-center justify-center py-6 text-center">
                <Icons.search className="h-12 w-12 text-muted-foreground/50 mb-2" />
                <p className="text-sm font-medium">Aucun résultat trouvé</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Essayez avec d&apos;autres mots-clés
                </p>
              </div>
            </CommandEmpty>
          )}

          {!isSearching && !query && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Icons.command className="h-12 w-12 text-muted-foreground/50 mb-2" />
              <p className="text-sm font-medium">Recherche rapide</p>
              <p className="text-xs text-muted-foreground mt-1">
                Tapez pour rechercher dans vos données
              </p>
              <div className="mt-4 flex flex-wrap gap-2 justify-center">
                <kbd className="px-2 py-1 text-xs bg-muted rounded">Clients</kbd>
                <kbd className="px-2 py-1 text-xs bg-muted rounded">Dossiers</kbd>
                <kbd className="px-2 py-1 text-xs bg-muted rounded">Factures</kbd>
                <kbd className="px-2 py-1 text-xs bg-muted rounded">Documents</kbd>
              </div>
            </div>
          )}

          {!isSearching && results.length > 0 && (
            <>
              {Object.entries(groupedResults).map(([type, items], index) => {
                if (items.length === 0) return null

                return (
                  <React.Fragment key={type}>
                    {index > 0 && <CommandSeparator />}
                    <CommandGroup heading={getGroupLabel(type)}>
                      {items.map((result) => {
                        const Icon = Icons[result.icon]
                        return (
                          <CommandItem
                            key={result.id}
                            value={`${result.type}-${result.id}-${result.title}`}
                            onSelect={() => handleSelect(result.url)}
                            className="flex items-center gap-3 py-3"
                          >
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                              <Icon className="h-5 w-5 text-primary" />
                            </div>
                            <div className="flex-1 overflow-hidden">
                              <div className="flex items-center gap-2">
                                <p className="text-sm font-medium truncate">
                                  {result.title}
                                </p>
                                {result.badge && (
                                  <span
                                    className={cn(
                                      'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
                                      getBadgeColor(result.badge.variant)
                                    )}
                                  >
                                    {result.badge.text}
                                  </span>
                                )}
                              </div>
                              {result.subtitle && (
                                <p className="text-xs text-muted-foreground truncate">
                                  {result.subtitle}
                                </p>
                              )}
                            </div>
                            <Icons.arrowRight className="h-4 w-4 text-muted-foreground" />
                          </CommandItem>
                        )
                      })}
                    </CommandGroup>
                  </React.Fragment>
                )
              })}
            </>
          )}
        </CommandList>

        {/* Footer avec raccourcis */}
        <div className="hidden sm:flex border-t border-border px-4 py-2 items-center justify-between text-xs text-muted-foreground">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 bg-muted rounded">↑↓</kbd>
              <span>Naviguer</span>
            </div>
            <div className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 bg-muted rounded">↵</kbd>
              <span>Ouvrir</span>
            </div>
            <div className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 bg-muted rounded">Esc</kbd>
              <span>Fermer</span>
            </div>
          </div>
        </div>
      </CommandDialog>
    </>
  )
}
