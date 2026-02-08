'use client'

import { useState, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { Icons } from '@/lib/icons'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'

interface SearchResult {
  id: string
  conversationId: string
  conversationTitle: string
  role: 'user' | 'assistant'
  content: string
  excerpt: string
  createdAt: string
  highlightedContent?: string
}

interface AdvancedSearchProps {
  onSelectConversation?: (conversationId: string) => void
}

export function AdvancedSearch({ onSelectConversation }: AdvancedSearchProps) {
  const t = useTranslations('assistantIA')
  const router = useRouter()

  const [isOpen, setIsOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [total, setTotal] = useState(0)

  // Filtres
  const [roleFilter, setRoleFilter] = useState<string>('')
  const [dateFrom, setDateFrom] = useState<string>('')
  const [dateTo, setDateTo] = useState<string>('')

  // Recherche
  const handleSearch = useCallback(async () => {
    if (!query || query.length < 2) return

    setIsLoading(true)
    try {
      const params = new URLSearchParams({
        q: query,
        limit: '20',
        ...(roleFilter && { role: roleFilter }),
        ...(dateFrom && { dateFrom }),
        ...(dateTo && { dateTo }),
      })

      const response = await fetch(`/api/chat/search?${params}`)
      if (!response.ok) throw new Error('Erreur de recherche')

      const data = await response.json()
      setResults(data.results || [])
      setTotal(data.total || 0)
    } catch (error) {
      console.error('Erreur recherche:', error)
      setResults([])
    } finally {
      setIsLoading(false)
    }
  }, [query, roleFilter, dateFrom, dateTo])

  // Gestion de la sélection d'un résultat
  const handleSelectResult = (result: SearchResult) => {
    if (onSelectConversation) {
      onSelectConversation(result.conversationId)
    } else {
      router.push(`/assistant-ia?conversation=${result.conversationId}`)
    }
    setIsOpen(false)
  }

  // Reset des filtres
  const handleReset = () => {
    setQuery('')
    setRoleFilter('')
    setDateFrom('')
    setDateTo('')
    setResults([])
    setTotal(0)
  }

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Icons.search className="h-4 w-4 mr-2" />
          {t('advancedSearch')}
        </Button>
      </DialogTrigger>

      <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Icons.search className="h-5 w-5" />
            {t('searchInConversations')}
          </DialogTitle>
        </DialogHeader>

        {/* Barre de recherche */}
        <div className="space-y-4">
          <div className="flex gap-2">
            <Input
              placeholder={t('searchPlaceholder')}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              className="flex-1"
            />
            <Button onClick={handleSearch} disabled={isLoading || query.length < 2}>
              {isLoading ? (
                <Icons.loader className="h-4 w-4 animate-spin" />
              ) : (
                <Icons.search className="h-4 w-4" />
              )}
            </Button>
          </div>

          {/* Filtres */}
          <div className="flex flex-wrap gap-3">
            <div className="flex items-center gap-2">
              <Label className="text-xs text-muted-foreground">{t('role')}:</Label>
              <Select value={roleFilter} onValueChange={setRoleFilter}>
                <SelectTrigger className="w-32 h-8">
                  <SelectValue placeholder={t('all')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">{t('all')}</SelectItem>
                  <SelectItem value="user">{t('user')}</SelectItem>
                  <SelectItem value="assistant">{t('assistant')}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-2">
              <Label className="text-xs text-muted-foreground">{t('from')}:</Label>
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="w-36 h-8"
              />
            </div>

            <div className="flex items-center gap-2">
              <Label className="text-xs text-muted-foreground">{t('to')}:</Label>
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="w-36 h-8"
              />
            </div>

            <Button variant="ghost" size="sm" onClick={handleReset}>
              <Icons.refresh className="h-3 w-3 mr-1" />
              {t('reset')}
            </Button>
          </div>
        </div>

        {/* Résultats */}
        <div className="flex-1 overflow-y-auto mt-4 space-y-3">
          {isLoading ? (
            // Skeleton de chargement
            <>
              {[1, 2, 3].map((i) => (
                <Card key={i}>
                  <CardContent className="p-4">
                    <Skeleton className="h-4 w-1/3 mb-2" />
                    <Skeleton className="h-3 w-full mb-1" />
                    <Skeleton className="h-3 w-2/3" />
                  </CardContent>
                </Card>
              ))}
            </>
          ) : results.length > 0 ? (
            <>
              <p className="text-sm text-muted-foreground">
                {total} {t('resultsFound', { count: total })}
              </p>

              {results.map((result) => (
                <Card
                  key={result.id}
                  className="cursor-pointer hover:bg-muted/50 transition-colors"
                  onClick={() => handleSelectResult(result)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <Badge variant={result.role === 'user' ? 'default' : 'secondary'}>
                          {result.role === 'user' ? t('you') : 'Qadhya'}
                        </Badge>
                        <span className="text-sm font-medium truncate">
                          {result.conversationTitle}
                        </span>
                      </div>
                      <span className="text-xs text-muted-foreground shrink-0">
                        {new Date(result.createdAt).toLocaleDateString('fr-FR')}
                      </span>
                    </div>

                    {/* Contenu avec mise en surbrillance */}
                    <p
                      className="text-sm text-muted-foreground line-clamp-2"
                      dangerouslySetInnerHTML={{
                        __html: result.highlightedContent || result.excerpt,
                      }}
                    />
                  </CardContent>
                </Card>
              ))}
            </>
          ) : query.length >= 2 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Icons.search className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>{t('noResults')}</p>
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <Icons.search className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>{t('enterSearchTerm')}</p>
            </div>
          )}
        </div>
      </DialogContent>

      {/* Style pour la mise en surbrillance */}
      <style jsx global>{`
        mark {
          background-color: hsl(var(--primary) / 0.3);
          color: inherit;
          padding: 0 2px;
          border-radius: 2px;
        }
      `}</style>
    </Dialog>
  )
}
