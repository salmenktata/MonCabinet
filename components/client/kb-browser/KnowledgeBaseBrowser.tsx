'use client'

import { useState, useCallback, useEffect } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { AnimatePresence, motion } from 'framer-motion'
import {
  Search, X, Shield, Scale, Briefcase, Gavel, Calculator, Users, Globe, FileText,
  BookOpen, ArrowRight, ClipboardList,
} from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
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
// DONNÉES STATIQUES
// =============================================================================

const POPULAR_SEARCHES = [
  { label: 'Article 47 code pénal', query: 'article 47 code pénal' },
  { label: 'Code des sociétés', query: 'code des sociétés commerciales' },
  { label: 'Contrat de travail', query: 'contrat de travail' },
  { label: 'Procédure civile', query: 'procédure civile' },
  { label: 'Droit de la famille', query: 'statut personnel famille' },
]

const QUICK_ACCESS = [
  { Icon: Scale, labelFr: 'Jurisprudence', labelAr: 'قضاء', category: 'jurisprudence' },
  { Icon: BookOpen, labelFr: 'Doctrine', labelAr: 'فقه', category: 'doctrine' },
  { Icon: FileText, labelFr: 'Formulaires', labelAr: 'نماذج', category: 'modeles' },
  { Icon: ClipboardList, labelFr: 'Procédures', labelAr: 'إجراءات', category: 'procedures' },
]

// =============================================================================
// COMPOSANT PRINCIPAL
// =============================================================================

export function KnowledgeBaseBrowser() {
  const searchParams = useSearchParams()
  const router = useRouter()

  // Mode et sélection viennent de l'URL
  const urlMode = searchParams.get('mode') as 'textes' | 'general' | null
  const urlDomain = searchParams.get('domain') || undefined
  const urlCat = searchParams.get('cat') || undefined
  const urlQ = searchParams.get('q') || ''

  const mode = urlMode || 'landing'

  // État local temporaire (non persisté tant que non soumis)
  const [searchQuery, setSearchQuery] = useState(urlQ)
  const [searchError, setSearchError] = useState('')

  // Sync la query locale quand l'URL change (ex: navigation retour)
  useEffect(() => {
    setSearchQuery(urlQ)
  }, [urlQ])

  const { data: stats, isLoading: statsLoading } = useKBStats()

  // Statistiques par section
  const textesCategories = ['codes', 'constitution', 'legislation', 'conventions', 'jort']
  const textesCount = stats
    ? textesCategories.reduce((acc, cat) => acc + (stats.byCategory[cat] || 0), 0)
    : 0
  const jurisCount = stats?.byCategory?.jurisprudence || 0
  const doctrineCount = stats?.byCategory?.doctrine || 0
  const totalCount = stats?.totalDocuments || 0

  // Comptage par domaine (estimé via catégories)
  const getDomainCount = useCallback((domain: typeof LEGAL_DOMAINS[0]) => {
    if (!stats) return null
    return domain.categories.reduce((acc, cat) => acc + (stats.byCategory[cat] || 0), 0)
  }, [stats])

  // Comptage par catégorie pour Quick Access
  const getQACategoryCount = useCallback((category: string) => {
    return stats?.byCategory?.[category] || null
  }, [stats])

  const handleSearchTextes = useCallback(() => {
    const q = searchQuery.trim()
    if (!q) {
      setSearchError('Veuillez saisir un terme de recherche')
      return
    }
    setSearchError('')
    router.push(`/client/knowledge-base?mode=textes&q=${encodeURIComponent(q)}`)
  }, [searchQuery, router])

  const handlePopularSearch = useCallback((query: string) => {
    setSearchQuery(query)
    setSearchError('')
    router.push(`/client/knowledge-base?mode=textes&q=${encodeURIComponent(query)}`)
  }, [router])

  const handleDomainClick = useCallback((domainId: string) => {
    setSearchQuery('')
    setSearchError('')
    router.push(`/client/knowledge-base?mode=textes&domain=${encodeURIComponent(domainId)}`)
  }, [router])

  const handleQuickAccess = useCallback((category: string) => {
    setSearchQuery('')
    setSearchError('')
    router.push(`/client/knowledge-base?mode=general&cat=${encodeURIComponent(category)}`)
  }, [router])

  const handleGoGeneral = useCallback(() => {
    setSearchQuery('')
    setSearchError('')
    router.push('/client/knowledge-base?mode=general')
  }, [router])

  const handleBack = useCallback(() => {
    setSearchQuery('')
    setSearchError('')
    router.push('/client/knowledge-base')
  }, [router])

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
              initialCategory={urlDomain
                ? LEGAL_DOMAINS.find((d) => d.id === urlDomain)?.categories[0]
                : undefined}
              initialDomain={urlDomain}
              initialDocType="TEXTES"
              initialQuery={urlQ || undefined}
              onBack={handleBack}
            />
          ) : (
            <DocumentExplorer
              initialCategory={urlCat}
              initialQuery={urlQ || undefined}
              onBack={handleBack}
            />
          )}
        </motion.div>
      ) : (
        <motion.div key="landing" {...fadeSlide} className="container mx-auto space-y-10">
          {/* Hero */}
          <div className="text-center space-y-4 py-8">
            <div className="inline-flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground bg-muted px-3 py-1 rounded-full">
              <FileText className="h-3.5 w-3.5" />
              Base de Connaissances Juridique Tunisienne
            </div>
            <h1 className="text-3xl md:text-4xl font-bold tracking-tight">
              Explorez le droit tunisien
            </h1>

            {/* Barre de recherche */}
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

              {/* Suggestions populaires */}
              <div className="flex flex-wrap gap-2 mt-3 justify-center">
                {POPULAR_SEARCHES.map((item) => (
                  <Button
                    key={item.query}
                    variant="outline"
                    size="sm"
                    className="text-xs h-7"
                    onClick={() => handlePopularSearch(item.query)}
                  >
                    {item.label}
                  </Button>
                ))}
              </div>
            </div>

            {/* Stats tiles */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 max-w-2xl mx-auto pt-4">
              {statsLoading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-20 rounded-lg" />
                ))
              ) : (
                <>
                  <StatTile
                    value={totalCount}
                    label="Total documents"
                  />
                  <StatTile
                    value={textesCount}
                    label="Textes normatifs"
                  />
                  <StatTile
                    value={jurisCount}
                    label="Jurisprudence"
                  />
                  <StatTile
                    value={doctrineCount}
                    label="Doctrine"
                  />
                </>
              )}
            </div>
          </div>

          {/* Grille des 8 domaines */}
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-4">
              Explorer par domaine juridique
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              {LEGAL_DOMAINS.map((domain) => {
                const Icon = DOMAIN_ICON_MAP[domain.icon] || FileText
                const domainCount = getDomainCount(domain)

                return (
                  <Card
                    key={domain.id}
                    className="cursor-pointer border hover:border-primary/50 hover:bg-primary/5 hover:shadow-md transition-all focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 outline-none"
                    onClick={() => handleDomainClick(domain.id)}
                    onKeyDown={(e) => handleCardKeyDown(e, domain.id)}
                    role="button"
                    tabIndex={0}
                    aria-label={`${domain.labelFr} — ${domain.labelAr}`}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-start gap-3">
                        <div className="shrink-0 text-primary/70 mt-0.5">
                          <Icon className="h-5 w-5" />
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
                          {domainCount != null && domainCount > 0 && (
                            <Badge variant="secondary" className="text-xs mt-2">
                              {domainCount.toLocaleString('fr-FR')} docs
                            </Badge>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          </div>

          {/* Accès direct */}
          <div className="border-t pt-6">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-4">
              Accès direct
            </h2>
            <div className="flex flex-wrap gap-3">
              {QUICK_ACCESS.map((item) => {
                const count = getQACategoryCount(item.category)
                return (
                  <Card
                    key={item.category}
                    className="cursor-pointer border hover:border-primary/50 hover:bg-primary/5 hover:shadow-sm transition-all focus-visible:ring-2 focus-visible:ring-primary outline-none"
                    onClick={() => handleQuickAccess(item.category)}
                    role="button"
                    tabIndex={0}
                    aria-label={`${item.labelFr} — ${item.labelAr}`}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        handleQuickAccess(item.category)
                      }
                    }}
                  >
                    <CardContent className="p-3 flex items-center gap-3">
                      <item.Icon className="h-5 w-5 text-primary/70 shrink-0" />
                      <div>
                        <div className="font-medium text-sm">{item.labelFr}</div>
                        <div className="text-xs text-muted-foreground" dir="rtl">{item.labelAr}</div>
                      </div>
                      {count != null && count > 0 && (
                        <Badge variant="secondary" className="text-xs ml-auto">
                          {count.toLocaleString('fr-FR')}
                        </Badge>
                      )}
                    </CardContent>
                  </Card>
                )
              })}

              <Button
                variant="outline"
                onClick={handleGoGeneral}
                className="gap-2 h-auto py-3 px-4"
              >
                Toute la base
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

// =============================================================================
// STAT TILE
// =============================================================================

function StatTile({ value, label }: { value: number; label: string }) {
  return (
    <div className="border rounded-lg p-3 text-center bg-card">
      <div className="text-2xl font-bold tabular-nums">
        {value.toLocaleString('fr-FR')}
      </div>
      <div className="text-xs text-muted-foreground mt-0.5">{label}</div>
    </div>
  )
}
