'use client'

import { useState, useCallback } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Search, X, BookOpen, Gavel, Scale, ClipboardCheck, Briefcase, FileText } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useKBStats } from '@/lib/hooks/useKBStats'
import {
  LEGAL_CATEGORY_TRANSLATIONS,
  LEGAL_CATEGORY_DESCRIPTIONS,
  getCategoriesForContext,
} from '@/lib/categories/legal-categories'
import type { LegalCategory } from '@/lib/categories/legal-categories'
import { DocumentExplorer } from './DocumentExplorer'
import { getCategoryCardStyles } from './kb-browser-utils'

// =============================================================================
// ICON MAP (catégorie → composant lucide-react)
// =============================================================================

const CATEGORY_ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  codes: BookOpen,
  jurisprudence: Gavel,
  doctrine: BookOpen,
  legislation: Scale,
  procedures: ClipboardCheck,
  conventions: Briefcase,
  constitution: FileText,
  jort: FileText,
}

// Catégories principales à afficher sur la landing
const MAIN_CATEGORIES: LegalCategory[] = [
  'codes',
  'jurisprudence',
  'doctrine',
  'legislation',
  'procedures',
  'conventions',
]

const fadeSlide = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -12 },
  transition: { duration: 0.2 },
}

// =============================================================================
// COMPOSANT PRINCIPAL
// =============================================================================

export function KnowledgeBaseBrowser() {
  const [mode, setMode] = useState<'landing' | 'results'>('landing')
  const [searchQuery, setSearchQuery] = useState('')
  const [searchError, setSearchError] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string | undefined>()

  const { data: stats, isLoading: statsLoading } = useKBStats()

  const handleSearch = useCallback(() => {
    const q = searchQuery.trim()
    if (!q) {
      setSearchError('Veuillez saisir un terme de recherche')
      return
    }
    setSearchError('')
    setSelectedCategory(undefined)
    setMode('results')
  }, [searchQuery])

  const handleCategoryClick = useCallback((category: string) => {
    setSelectedCategory(category)
    setSearchQuery('')
    setSearchError('')
    setMode('results')
  }, [])

  const handleBack = useCallback(() => {
    setMode('landing')
    setSearchQuery('')
    setSearchError('')
    setSelectedCategory(undefined)
  }, [])

  const handleClearSearch = useCallback(() => {
    setSearchQuery('')
    setSearchError('')
  }, [])

  const handleCardKeyDown = useCallback((e: React.KeyboardEvent, category: string) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      handleCategoryClick(category)
    }
  }, [handleCategoryClick])

  return (
    <AnimatePresence mode="wait">
      {mode === 'results' ? (
        <motion.div key="results" {...fadeSlide} className="container mx-auto">
          <DocumentExplorer
            initialCategory={selectedCategory}
            initialQuery={searchQuery || undefined}
            onBack={handleBack}
          />
        </motion.div>
      ) : (
        <motion.div key="landing" {...fadeSlide} className="container mx-auto space-y-10">
          {/* Hero Search */}
          <div className="text-center space-y-4 py-8">
            <h1 className="text-3xl font-bold tracking-tight">
              Base de Connaissances Juridique
            </h1>
            <p className="text-muted-foreground text-lg">
              {statsLoading ? (
                <Skeleton className="h-5 w-48 mx-auto" />
              ) : (
                `${(stats?.totalDocuments || 0).toLocaleString('fr-FR')}+ documents juridiques tunisiens`
              )}
            </p>

            {/* Grande barre de recherche */}
            <div className="max-w-2xl mx-auto pt-2">
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                  <Input
                    placeholder="Rechercher un texte de loi, un arrêt, une doctrine..."
                    value={searchQuery}
                    onChange={(e) => { setSearchQuery(e.target.value); setSearchError('') }}
                    onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                    className={`pl-12 ${searchQuery ? 'pr-10' : ''} h-12 text-base`}
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={handleClearSearch}
                      className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-full hover:bg-muted transition-colors"
                      aria-label="Effacer la recherche"
                    >
                      <X className="h-4 w-4 text-muted-foreground" />
                    </button>
                  )}
                </div>
                <Button onClick={handleSearch} size="lg" className="h-12 px-6">
                  Rechercher
                </Button>
              </div>
              {searchError && (
                <p className="text-sm text-destructive mt-2">{searchError}</p>
              )}
            </div>
          </div>

          {/* Grille de catégories */}
          <div>
            <h2 className="text-lg font-semibold mb-4">Explorer par catégorie</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {MAIN_CATEGORIES.map((cat) => {
                const Icon = CATEGORY_ICON_MAP[cat] || BookOpen
                const label = LEGAL_CATEGORY_TRANSLATIONS[cat]?.fr || cat
                const description = LEGAL_CATEGORY_DESCRIPTIONS[cat]?.fr || ''
                const count = stats?.byCategory[cat] || 0
                const styles = getCategoryCardStyles(cat)

                return (
                  <Card
                    key={cat}
                    className={`cursor-pointer border-l-4 transition-colors focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 outline-none ${styles.borderClass} ${styles.hoverBg}`}
                    onClick={() => handleCategoryClick(cat)}
                    onKeyDown={(e) => handleCardKeyDown(e, cat)}
                    role="button"
                    tabIndex={0}
                    aria-label={`${label} — ${count} documents`}
                  >
                    <CardContent className="p-5">
                      <div className="flex items-start gap-4">
                        <div className={`shrink-0 ${styles.iconColor}`}>
                          <Icon className="h-8 w-8" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <h3 className="font-semibold">{label}</h3>
                            {statsLoading ? (
                              <Skeleton className="h-5 w-10 rounded-full" />
                            ) : (
                              <span className="text-sm text-muted-foreground shrink-0">
                                {count.toLocaleString('fr-FR')}
                              </span>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                            {description}
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          </div>

          {/* Autres catégories (si elles ont des docs) */}
          {stats && (() => {
            const kbCategories = getCategoriesForContext('knowledge_base', 'fr')
            const otherCats = kbCategories.filter(
              c => !MAIN_CATEGORIES.includes(c.value as LegalCategory) && (stats.byCategory[c.value] || 0) > 0
            )
            if (otherCats.length === 0) return null
            return (
              <div>
                <h2 className="text-lg font-semibold mb-3">Autres catégories</h2>
                <div className="flex flex-wrap gap-2">
                  {otherCats.map((cat) => (
                    <Button
                      key={cat.value}
                      variant="outline"
                      size="sm"
                      onClick={() => handleCategoryClick(cat.value)}
                    >
                      {LEGAL_CATEGORY_TRANSLATIONS[cat.value as LegalCategory]?.fr || cat.label}
                      <span className="ml-2 text-muted-foreground">
                        ({(stats.byCategory[cat.value] || 0).toLocaleString('fr-FR')})
                      </span>
                    </Button>
                  ))}
                </div>
              </div>
            )
          })()}
        </motion.div>
      )}
    </AnimatePresence>
  )
}
