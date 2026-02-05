'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command'
import { Badge } from '@/components/ui/badge'
import { Users, Briefcase, Receipt, FileText, Search, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

interface SearchResult {
  id: string
  type: 'client' | 'dossier' | 'facture' | 'document'
  title: string
  subtitle?: string
  badge?: string
  url: string
}

export default function GlobalSearch() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const supabase = createClient()

  // Ouvrir avec Cmd+K / Ctrl+K
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setOpen((open) => !open)
      }
    }

    document.addEventListener('keydown', down)
    return () => document.removeEventListener('keydown', down)
  }, [])

  // Recherche avec debounce
  useEffect(() => {
    if (!query || query.length < 2) {
      setResults([])
      return
    }

    const timeoutId = setTimeout(() => {
      performSearch(query)
    }, 300) // Debounce 300ms

    return () => clearTimeout(timeoutId)
  }, [query])

  const performSearch = async (searchQuery: string) => {
    setLoading(true)
    try {
      const response = await fetch(`/api/search?q=${encodeURIComponent(searchQuery)}`)
      const data = await response.json()

      const searchResults: SearchResult[] = []

      // Clients
      if (data.results.clients) {
        data.results.clients.forEach((client: any) => {
          searchResults.push({
            id: client.id,
            type: 'client',
            title: client.denomination || `${client.nom} ${client.prenom || ''}`.trim(),
            subtitle: client.cin ? `CIN: ${client.cin}` : client.telephone,
            badge: client.type_client,
            url: `/dashboard/clients/${client.id}`,
          })
        })
      }

      // Dossiers
      if (data.results.dossiers) {
        data.results.dossiers.forEach((dossier: any) => {
          searchResults.push({
            id: dossier.id,
            type: 'dossier',
            title: dossier.numero_dossier,
            subtitle: dossier.objet?.substring(0, 60) + (dossier.objet?.length > 60 ? '...' : ''),
            badge: dossier.statut,
            url: `/dashboard/dossiers/${dossier.id}`,
          })
        })
      }

      // Factures
      if (data.results.factures) {
        data.results.factures.forEach((facture: any) => {
          searchResults.push({
            id: facture.id,
            type: 'facture',
            title: facture.numero_facture,
            subtitle: `${facture.montant_ttc} TND`,
            badge: facture.statut,
            url: `/dashboard/factures/${facture.id}`,
          })
        })
      }

      // Documents
      if (data.results.documents) {
        data.results.documents.forEach((document: any) => {
          searchResults.push({
            id: document.id,
            type: 'document',
            title: document.nom_fichier,
            subtitle: document.type_fichier,
            url: `/dashboard/documents/${document.id}`,
          })
        })
      }

      setResults(searchResults)
    } catch (error) {
      console.error('Erreur recherche:', error)
      setResults([])
    } finally {
      setLoading(false)
    }
  }

  const handleSelect = (url: string) => {
    setOpen(false)
    setQuery('')
    setResults([])
    router.push(url)
  }

  const getIcon = (type: string) => {
    switch (type) {
      case 'client':
        return <Users className="h-4 w-4 text-blue-600" />
      case 'dossier':
        return <Briefcase className="h-4 w-4 text-green-600" />
      case 'facture':
        return <Receipt className="h-4 w-4 text-orange-600" />
      case 'document':
        return <FileText className="h-4 w-4 text-purple-600" />
      default:
        return <Search className="h-4 w-4" />
    }
  }

  const getBadgeVariant = (type: string, badge?: string) => {
    if (type === 'dossier') {
      if (badge === 'ACTIF') return 'default'
      if (badge === 'TERMINE') return 'secondary'
      if (badge === 'ARCHIVE') return 'outline'
    }
    if (type === 'facture') {
      if (badge === 'PAYEE') return 'default'
      if (badge === 'IMPAYEE') return 'destructive'
      if (badge === 'PARTIELLE') return 'secondary'
    }
    return 'outline'
  }

  // Grouper résultats par type
  const groupedResults = results.reduce((acc, result) => {
    if (!acc[result.type]) {
      acc[result.type] = []
    }
    acc[result.type].push(result)
    return acc
  }, {} as Record<string, SearchResult[]>)

  const typeLabels = {
    client: 'Clients',
    dossier: 'Dossiers',
    facture: 'Factures',
    document: 'Documents',
  }

  return (
    <>
      {/* Bouton déclencheur */}
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground hover:text-foreground border rounded-lg hover:bg-accent transition-colors"
      >
        <Search className="h-4 w-4" />
        <span>Rechercher...</span>
        <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground opacity-100">
          <span className="text-xs">⌘</span>K
        </kbd>
      </button>

      {/* Command Dialog */}
      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput
          placeholder="Rechercher clients, dossiers, factures, documents..."
          value={query}
          onValueChange={setQuery}
        />
        <CommandList>
          {loading && (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          )}

          {!loading && query && results.length === 0 && (
            <CommandEmpty>
              <div className="flex flex-col items-center justify-center py-6 text-center">
                <Search className="h-8 w-8 text-muted-foreground mb-2" />
                <p className="text-sm text-muted-foreground">Aucun résultat trouvé</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Essayez avec un autre terme de recherche
                </p>
              </div>
            </CommandEmpty>
          )}

          {!loading && results.length > 0 && (
            <>
              {Object.entries(groupedResults).map(([type, items], index) => (
                <div key={type}>
                  {index > 0 && <CommandSeparator />}
                  <CommandGroup heading={typeLabels[type as keyof typeof typeLabels]}>
                    {items.map((result) => (
                      <CommandItem
                        key={result.id}
                        value={result.id}
                        onSelect={() => handleSelect(result.url)}
                        className="flex items-center gap-3 py-3 cursor-pointer"
                      >
                        {getIcon(result.type)}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{result.title}</p>
                          {result.subtitle && (
                            <p className="text-xs text-muted-foreground truncate">{result.subtitle}</p>
                          )}
                        </div>
                        {result.badge && (
                          <Badge variant={getBadgeVariant(result.type, result.badge)} className="shrink-0">
                            {result.badge}
                          </Badge>
                        )}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </div>
              ))}
            </>
          )}

          {!loading && !query && (
            <div className="flex flex-col items-center justify-center py-8 text-center px-4">
              <Search className="h-12 w-12 text-muted-foreground/50 mb-3" />
              <p className="text-sm font-medium text-muted-foreground">Recherche rapide</p>
              <p className="text-xs text-muted-foreground mt-2">
                Tapez pour rechercher dans les clients, dossiers, factures et documents
              </p>
              <div className="mt-4 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                <div className="flex items-center gap-2">
                  <Users className="h-3 w-3 text-blue-600" />
                  <span>Clients</span>
                </div>
                <div className="flex items-center gap-2">
                  <Briefcase className="h-3 w-3 text-green-600" />
                  <span>Dossiers</span>
                </div>
                <div className="flex items-center gap-2">
                  <Receipt className="h-3 w-3 text-orange-600" />
                  <span>Factures</span>
                </div>
                <div className="flex items-center gap-2">
                  <FileText className="h-3 w-3 text-purple-600" />
                  <span>Documents</span>
                </div>
              </div>
            </div>
          )}
        </CommandList>
      </CommandDialog>
    </>
  )
}
