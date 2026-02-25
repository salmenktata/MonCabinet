'use client'

import { useState, useCallback, useEffect } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { AnimatePresence, motion } from 'framer-motion'
import {
  Search, X, Scale, BookOpen, FileText, ClipboardList, Globe, Newspaper,
  Sparkles, Database, TrendingUp, ArrowRight, ChevronRight,
} from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { useKBStats } from '@/lib/hooks/useKBStats'
import { DocumentExplorer } from './DocumentExplorer'
import { LegalPortalCard } from './LegalPortalCard'
import { CodeShowcase } from './CodeShowcase'

// =============================================================================
// DONNÉES STATIQUES
// =============================================================================

const POPULAR_SEARCHES = [
  { label: 'Art. 47 CP', query: 'article 47 code pénal' },
  { label: 'COC obligations', query: 'code obligations contrats' },
  { label: 'Licenciement', query: 'contrat de travail licenciement' },
  { label: 'Procédure civile', query: 'procédure civile appel' },
  { label: 'Statut personnel', query: 'code statut personnel mariage divorce' },
]

const PORTALS = [
  {
    key: 'codes',
    icon: BookOpen,
    titleFr: 'Codes & Législation',
    titleAr: 'المجلات والتشريعات',
    description: 'COC, Code Pénal, Code du Travail, Code de Commerce et tous les textes normatifs',
    categories: ['codes', 'legislation', 'constitution', 'conventions'],
    colorClass: 'bg-card border hover:border-indigo-300 hover:shadow-md dark:hover:border-indigo-700',
    iconBgClass: 'bg-indigo-50 text-indigo-600 dark:bg-indigo-950 dark:text-indigo-400',
    mode: 'textes' as const,
    cat: 'codes',
  },
  {
    key: 'jurisprudence',
    icon: Scale,
    titleFr: 'Jurisprudence',
    titleAr: 'الاجتهاد القضائي',
    description: 'Décisions de la Cour de Cassation, Cours d\'appel et Tribunaux de 1ère instance',
    categories: ['jurisprudence'],
    colorClass: 'bg-card border hover:border-purple-300 hover:shadow-md dark:hover:border-purple-700',
    iconBgClass: 'bg-purple-50 text-purple-600 dark:bg-purple-950 dark:text-purple-400',
    mode: 'general' as const,
    cat: 'jurisprudence',
  },
  {
    key: 'jort',
    icon: Newspaper,
    titleFr: 'JORT — Journal Officiel',
    titleAr: 'الرائد الرسمي',
    description: 'Publications officielles du Journal Officiel de la République Tunisienne',
    categories: ['jort'],
    colorClass: 'bg-card border hover:border-red-300 hover:shadow-md dark:hover:border-red-700',
    iconBgClass: 'bg-red-50 text-red-600 dark:bg-red-950 dark:text-red-400',
    mode: 'general' as const,
    cat: 'jort',
  },
  {
    key: 'doctrine',
    icon: BookOpen,
    titleFr: 'Doctrine & Commentaires',
    titleAr: 'الفقه والتعليقات',
    description: 'Articles juridiques, commentaires d\'arrêts et analyses doctrinales',
    categories: ['doctrine'],
    colorClass: 'bg-card border hover:border-green-300 hover:shadow-md dark:hover:border-green-700',
    iconBgClass: 'bg-green-50 text-green-600 dark:bg-green-950 dark:text-green-400',
    mode: 'general' as const,
    cat: 'doctrine',
  },
  {
    key: 'modeles',
    icon: FileText,
    titleFr: 'Formulaires & Modèles',
    titleAr: 'النماذج والوثائق',
    description: 'Modèles de contrats, lettres type et actes notariés',
    categories: ['modeles', 'formulaires'],
    colorClass: 'bg-card border hover:border-orange-300 hover:shadow-md dark:hover:border-orange-700',
    iconBgClass: 'bg-orange-50 text-orange-600 dark:bg-orange-950 dark:text-orange-400',
    mode: 'general' as const,
    cat: 'modeles',
  },
  {
    key: 'conventions',
    icon: Globe,
    titleFr: 'Conventions Internationales',
    titleAr: 'الاتفاقيات الدولية',
    description: 'Traités bilatéraux, conventions multilatérales ratifiées par la Tunisie',
    categories: ['conventions'],
    colorClass: 'bg-card border hover:border-teal-300 hover:shadow-md dark:hover:border-teal-700',
    iconBgClass: 'bg-teal-50 text-teal-600 dark:bg-teal-950 dark:text-teal-400',
    mode: 'general' as const,
    cat: 'conventions',
  },
  {
    key: 'procedures',
    icon: ClipboardList,
    titleFr: 'Procédures',
    titleAr: 'الإجراءات',
    description: 'Guides de procédures administratives et judiciaires',
    categories: ['procedures'],
    colorClass: 'bg-card border hover:border-cyan-300 hover:shadow-md dark:hover:border-cyan-700',
    iconBgClass: 'bg-cyan-50 text-cyan-600 dark:bg-cyan-950 dark:text-cyan-400',
    mode: 'general' as const,
    cat: 'procedures',
  },
  {
    key: 'all',
    icon: Database,
    titleFr: 'Toute la Base',
    titleAr: 'كامل القاعدة',
    description: 'Recherche libre dans l\'ensemble de la bibliothèque juridique tunisienne',
    categories: [],
    colorClass: 'bg-card border hover:border-foreground/30 hover:shadow-md',
    iconBgClass: 'bg-muted text-muted-foreground',
    mode: 'general' as const,
    cat: '',
  },
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
  const searchParams = useSearchParams()
  const router = useRouter()

  const urlMode = searchParams.get('mode') as 'textes' | 'general' | null
  const urlDomain = searchParams.get('domain') || undefined
  const urlCat = searchParams.get('cat') || undefined
  const urlQ = searchParams.get('q') || ''

  const mode = urlMode || 'landing'

  const [searchQuery, setSearchQuery] = useState(urlQ)
  const [searchError, setSearchError] = useState('')

  useEffect(() => {
    setSearchQuery(urlQ)
  }, [urlQ])

  const { data: stats, isLoading: statsLoading } = useKBStats()

  const getCategorySum = useCallback((categories: string[]) => {
    if (!stats || categories.length === 0) return null
    return categories.reduce((acc, cat) => acc + (stats.byCategory[cat] || 0), 0)
  }, [stats])

  const textesCategories = ['codes', 'constitution', 'legislation', 'conventions', 'jort']
  const textesCount = stats ? textesCategories.reduce((acc, c) => acc + (stats.byCategory[c] || 0), 0) : 0
  const jurisCount = stats?.byCategory?.jurisprudence || 0
  const doctrineCount = stats?.byCategory?.doctrine || 0
  const totalCount = stats?.totalDocuments || 0

  const handleSearch = useCallback(() => {
    const q = searchQuery.trim()
    if (!q) {
      setSearchError('Veuillez saisir un terme de recherche')
      return
    }
    setSearchError('')
    router.push(`/client/knowledge-base?mode=general&q=${encodeURIComponent(q)}`)
  }, [searchQuery, router])

  const handlePopularSearch = useCallback((query: string) => {
    setSearchError('')
    router.push(`/client/knowledge-base?mode=general&q=${encodeURIComponent(query)}`)
  }, [router])

  const handlePortalClick = useCallback((portal: typeof PORTALS[0]) => {
    if (portal.cat) {
      router.push(`/client/knowledge-base?mode=${portal.mode}&cat=${portal.cat}`)
    } else {
      router.push(`/client/knowledge-base?mode=general`)
    }
  }, [router])

  const handleBack = useCallback(() => {
    router.push('/client/knowledge-base')
  }, [router])

  return (
    <AnimatePresence mode="wait">
      {mode === 'textes' || mode === 'general' ? (
        <motion.div key="results" {...fadeSlide} className="container mx-auto">
          {mode === 'textes' ? (
            <DocumentExplorer
              initialCategory={urlCat}
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
        <motion.div key="landing" {...fadeSlide} className="container mx-auto space-y-12 pb-16">

          {/* ─── HERO ─────────────────────────────────────────────────────── */}
          <div className="pt-10 pb-4 text-center space-y-6 px-4">
            <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground border rounded-full px-3 py-1.5">
              <Sparkles className="h-3.5 w-3.5" />
              Bibliothèque Juridique Tunisienne
            </div>

            <div className="space-y-3">
              <h1 className="text-4xl md:text-5xl font-bold tracking-tight">
                La référence du droit tunisien
              </h1>
              <p className="text-muted-foreground max-w-lg mx-auto text-base leading-relaxed">
                Codes, jurisprudence, doctrine et textes officiels — recherche sémantique IA sur{' '}
                <span className="font-semibold text-foreground">
                  {statsLoading ? '…' : totalCount.toLocaleString('fr-FR')}
                </span>{' '}
                documents juridiques
              </p>
            </div>

            {/* Barre de recherche */}
            <div className="max-w-2xl mx-auto space-y-3">
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4.5 w-4.5 text-muted-foreground" />
                  <Input
                    placeholder="Rechercher un article, texte de loi, décision… (ex: article 47 CP)"
                    value={searchQuery}
                    onChange={(e) => { setSearchQuery(e.target.value); setSearchError('') }}
                    onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                    className="pl-11 h-12 text-sm bg-background border-border/80 focus:border-foreground/30"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery('')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-full hover:bg-muted transition-colors"
                      aria-label="Effacer"
                    >
                      <X className="h-3.5 w-3.5 text-muted-foreground" />
                    </button>
                  )}
                </div>
                <Button onClick={handleSearch} size="lg" className="h-12 px-6 shrink-0 gap-2">
                  <Search className="h-4 w-4" />
                  Rechercher
                </Button>
              </div>
              {searchError && (
                <p className="text-sm text-destructive">{searchError}</p>
              )}

              {/* Suggestions */}
              <div className="flex flex-wrap gap-1.5 justify-center">
                <span className="text-xs text-muted-foreground self-center mr-1">Ex :</span>
                {POPULAR_SEARCHES.map((item) => (
                  <button
                    key={item.query}
                    onClick={() => handlePopularSearch(item.query)}
                    className="text-xs px-3 py-1 rounded-full border bg-background hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* ─── STATS BAR ────────────────────────────────────────────────── */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {statsLoading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-20 rounded-xl" />
              ))
            ) : (
              <>
                <StatTile value={totalCount} label="Documents indexés" icon={<Database className="h-5 w-5" />} accent="border-t-slate-400" />
                <StatTile value={textesCount} label="Textes normatifs" icon={<FileText className="h-5 w-5" />} accent="border-t-indigo-400" />
                <StatTile value={jurisCount} label="Décisions" icon={<Scale className="h-5 w-5" />} accent="border-t-purple-400" />
                <StatTile value={doctrineCount} label="Articles doctrine" icon={<TrendingUp className="h-5 w-5" />} accent="border-t-green-400" />
              </>
            )}
          </div>

          {/* ─── PORTAILS THÉMATIQUES ─────────────────────────────────────── */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
                Portails thématiques
              </h2>
              <button
                onClick={() => router.push('/client/knowledge-base?mode=general')}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
              >
                Explorer tout <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {PORTALS.map((portal) => {
                const count = getCategorySum(portal.categories)
                return (
                  <LegalPortalCard
                    key={portal.key}
                    icon={portal.icon}
                    titleFr={portal.titleFr}
                    titleAr={portal.titleAr}
                    description={portal.description}
                    count={count}
                    colorClass={portal.colorClass}
                    iconBgClass={portal.iconBgClass}
                    onClick={() => handlePortalClick(portal)}
                  />
                )
              })}
            </div>
          </div>

          {/* ─── CODES PRINCIPAUX ─────────────────────────────────────────── */}
          <div className="border-t pt-10">
            <CodeShowcase />
          </div>

          {/* ─── ACCÈS RAPIDE BAS DE PAGE ─────────────────────────────────── */}
          <div className="border-t pt-6 flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Accès complet à la base de connaissances
            </p>
            <Button
              variant="outline"
              onClick={() => router.push('/client/knowledge-base?mode=general')}
              className="gap-2"
            >
              Explorer tout
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>

        </motion.div>
      )}
    </AnimatePresence>
  )
}

// =============================================================================
// STAT TILE — bordure top colorée (pattern Linear)
// =============================================================================

function StatTile({ value, label, icon, accent }: { value: number; label: string; icon: React.ReactNode; accent: string }) {
  return (
    <div className={`border rounded-xl p-4 bg-card flex items-center gap-3 border-t-2 ${accent}`}>
      <div className="text-muted-foreground shrink-0">{icon}</div>
      <div>
        <div className="text-2xl font-bold tabular-nums leading-none">
          {value.toLocaleString('fr-FR')}
        </div>
        <div className="text-xs text-muted-foreground mt-1">{label}</div>
      </div>
    </div>
  )
}
