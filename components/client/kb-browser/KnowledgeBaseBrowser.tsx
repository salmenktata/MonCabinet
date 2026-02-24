'use client'

import { useState, useCallback } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  Search, X, Shield, Scale, Briefcase, Gavel, Calculator, Users, Globe, FileText,
  BookOpen, ArrowRight,
} from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useKBStats } from '@/lib/hooks/useKBStats'
import { LEGAL_DOMAINS } from '@/lib/categories/legal-domains'
import { DocumentExplorer } from './DocumentExplorer'

// =============================================================================
// ICON MAP (legal-domain icon id → composant lucide-react)
// =============================================================================

const DOMAIN_ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  Shield,
  Scale,
  Briefcase,
  Gavel,
  Calculator,
  Users,
  Globe,
  FileText,
  BookOpen,
}

// Regex détection "Article X" / "art. X" / "الفصل X"
const ARTICLE_REGEX = /\b(article|art\.?|الفصل|فصل)\s+(\d+)/i

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
  const [mode, setMode] = useState<'landing' | 'textes' | 'general'>('landing')
  const [searchQuery, setSearchQuery] = useState('')
  const [searchError, setSearchError] = useState('')
  const [selectedDomain, setSelectedDomain] = useState<string | undefined>()
  const [selectedCategory, setSelectedCategory] = useState<string | undefined>()
  const [articleHint, setArticleHint] = useState<string | undefined>()

  const { data: stats, isLoading: statsLoading } = useKBStats()

  // Nombre total de textes normatifs (TEXTES doc_type approximé via catégories connues)
  const textesCategories = ['codes', 'constitution', 'legislation', 'conventions', 'jort']
  const textesCount = stats
    ? textesCategories.reduce((acc, cat) => acc + (stats.byCategory[cat] || 0), 0)
    : 0

  const handleSearchTextes = useCallback(() => {
    const q = searchQuery.trim()
    if (!q) {
      setSearchError('Veuillez saisir un terme de recherche')
      return
    }
    setSearchError('')
    const match = ARTICLE_REGEX.exec(q)
    setArticleHint(match ? `article_${match[2]}` : undefined)
    setSelectedDomain(undefined)
    setSelectedCategory(undefined)
    setMode('textes')
  }, [searchQuery])

  const handleDomainClick = useCallback((domainId: string) => {
    setSelectedDomain(domainId)
    setSelectedCategory(undefined)
    setSearchQuery('')
    setSearchError('')
    setArticleHint(undefined)
    setMode('textes')
  }, [])

  const handleGoGeneral = useCallback(() => {
    setSelectedDomain(undefined)
    setSelectedCategory(undefined)
    setSearchQuery('')
    setSearchError('')
    setArticleHint(undefined)
    setMode('general')
  }, [])

  const handleBack = useCallback(() => {
    setMode('landing')
    setSearchQuery('')
    setSearchError('')
    setSelectedDomain(undefined)
    setSelectedCategory(undefined)
    setArticleHint(undefined)
  }, [])

  const handleClearSearch = useCallback(() => {
    setSearchQuery('')
    setSearchError('')
  }, [])

  const handleCardKeyDown = useCallback((e: React.KeyboardEvent, domainId: string) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      handleDomainClick(domainId)
    }
  }, [handleDomainClick])

  return (
    <AnimatePresence mode="wait">
      {mode === 'textes' || mode === 'general' ? (
        <motion.div key="results" {...fadeSlide} className="container mx-auto">
          {mode === 'textes' ? (
            <DocumentExplorer
              initialCategory={selectedDomain
                ? LEGAL_DOMAINS.find((d) => d.id === selectedDomain)?.categories[0]
                : undefined}
              initialDomain={selectedDomain}
              initialDocType="TEXTES"
              initialQuery={searchQuery || undefined}
              onBack={handleBack}
            />
          ) : (
            <DocumentExplorer
              initialCategory={selectedCategory}
              initialQuery={searchQuery || undefined}
              onBack={handleBack}
            />
          )}
        </motion.div>
      ) : (
        <motion.div key="landing" {...fadeSlide} className="container mx-auto space-y-10">
          {/* Hero — Textes Juridiques */}
          <div className="text-center space-y-4 py-8">
            <div className="inline-flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground bg-muted px-3 py-1 rounded-full">
              <FileText className="h-3.5 w-3.5" />
              Textes normatifs tunisiens
            </div>
            <h1 className="text-3xl font-bold tracking-tight">
              Textes Juridiques Tunisiens
            </h1>
            <div className="text-muted-foreground text-lg">
              {statsLoading ? (
                <Skeleton className="h-5 w-64 mx-auto" />
              ) : (
                `${textesCount.toLocaleString('fr-FR')} textes normatifs — Constitution, Codes, Lois, Conventions`
              )}
            </div>

            {/* Grande barre de recherche */}
            <div className="max-w-2xl mx-auto pt-2">
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                  <Input
                    placeholder="Rechercher un texte ou un article… (ex: article 47 code pénal)"
                    value={searchQuery}
                    onChange={(e) => { setSearchQuery(e.target.value); setSearchError('') }}
                    onKeyDown={(e) => e.key === 'Enter' && handleSearchTextes()}
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
                <Button onClick={handleSearchTextes} size="lg" className="h-12 px-6">
                  Rechercher
                </Button>
              </div>
              {searchError && (
                <p className="text-sm text-destructive mt-2">{searchError}</p>
              )}
              {articleHint && (
                <p className="text-xs text-muted-foreground mt-1">
                  Recherche par article détectée — les résultats seront filtrés sur cet article
                </p>
              )}
              <p className="text-xs text-muted-foreground mt-2">
                Recherche dans les textes normatifs uniquement
              </p>
            </div>
          </div>

          {/* Grille des 8 domaines */}
          <div>
            <h2 className="text-lg font-semibold mb-4">Explorer par domaine juridique</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {LEGAL_DOMAINS.map((domain) => {
                const Icon = DOMAIN_ICON_MAP[domain.icon] || FileText

                return (
                  <Card
                    key={domain.id}
                    className="cursor-pointer border hover:border-primary/50 hover:shadow-md transition-all focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 outline-none"
                    onClick={() => handleDomainClick(domain.id)}
                    onKeyDown={(e) => handleCardKeyDown(e, domain.id)}
                    role="button"
                    tabIndex={0}
                    aria-label={`${domain.labelFr} — ${domain.labelAr}`}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-start gap-3">
                        <div className="shrink-0 text-primary/70 mt-0.5">
                          <Icon className="h-6 w-6" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-semibold text-sm leading-tight">
                            {domain.labelFr}
                          </div>
                          <div className="text-xs text-muted-foreground mt-0.5 font-medium" dir="rtl">
                            {domain.labelAr}
                          </div>
                          {domain.description && (
                            <p className="text-xs text-muted-foreground mt-1.5 line-clamp-2">
                              {domain.description}
                            </p>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          </div>

          {/* Section secondaire — Toute la base */}
          <div className="border-t pt-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold">Jurisprudence &amp; Doctrine</h2>
                <p className="text-sm text-muted-foreground mt-0.5">
                  {statsLoading ? (
                    <Skeleton className="h-4 w-48 inline-block" />
                  ) : (
                    `${(stats?.totalDocuments || 0).toLocaleString('fr-FR')} documents au total — arrêts, doctrine, procédures…`
                  )}
                </p>
              </div>
              <Button
                variant="outline"
                onClick={handleGoGeneral}
                className="gap-2 shrink-0"
              >
                Explorer toute la base
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
