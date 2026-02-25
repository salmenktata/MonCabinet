'use client'

import { useState, useCallback, useEffect } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { AnimatePresence, motion } from 'framer-motion'
import {
  Search, X, Scale, BookOpen, FileText, ClipboardList, Globe, Newspaper,
  Sparkles, Database, TrendingUp, ArrowRight,
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
  { label: 'Article 47 CP', query: 'article 47 code pénal' },
  { label: 'COC obligations', query: 'code obligations contrats' },
  { label: 'Contrat de travail', query: 'contrat de travail licenciement' },
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
    colorClass: 'bg-indigo-50 border-indigo-200 text-indigo-900 hover:bg-indigo-100/80 dark:bg-indigo-950 dark:border-indigo-800 dark:text-indigo-100',
    iconBgClass: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300',
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
    colorClass: 'bg-purple-50 border-purple-200 text-purple-900 hover:bg-purple-100/80 dark:bg-purple-950 dark:border-purple-800 dark:text-purple-100',
    iconBgClass: 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300',
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
    colorClass: 'bg-red-50 border-red-200 text-red-900 hover:bg-red-100/80 dark:bg-red-950 dark:border-red-800 dark:text-red-100',
    iconBgClass: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300',
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
    colorClass: 'bg-green-50 border-green-200 text-green-900 hover:bg-green-100/80 dark:bg-green-950 dark:border-green-800 dark:text-green-100',
    iconBgClass: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300',
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
    colorClass: 'bg-orange-50 border-orange-200 text-orange-900 hover:bg-orange-100/80 dark:bg-orange-950 dark:border-orange-800 dark:text-orange-100',
    iconBgClass: 'bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300',
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
    colorClass: 'bg-teal-50 border-teal-200 text-teal-900 hover:bg-teal-100/80 dark:bg-teal-950 dark:border-teal-800 dark:text-teal-100',
    iconBgClass: 'bg-teal-100 text-teal-700 dark:bg-teal-900 dark:text-teal-300',
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
    colorClass: 'bg-cyan-50 border-cyan-200 text-cyan-900 hover:bg-cyan-100/80 dark:bg-cyan-950 dark:border-cyan-800 dark:text-cyan-100',
    iconBgClass: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900 dark:text-cyan-300',
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
    colorClass: 'bg-slate-50 border-slate-200 text-slate-900 hover:bg-slate-100/80 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-100',
    iconBgClass: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
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
        <motion.div key="landing" {...fadeSlide} className="container mx-auto space-y-10 pb-12">

          {/* ─── HERO ─────────────────────────────────────────────────────── */}
          <div className="relative text-center space-y-5 py-10 px-4 rounded-2xl bg-gradient-to-b from-slate-50 to-white dark:from-slate-900/50 dark:to-background border border-slate-100 dark:border-slate-800/50">
            <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-indigo-600 bg-indigo-50 dark:bg-indigo-950 dark:text-indigo-400 px-3 py-1.5 rounded-full border border-indigo-200 dark:border-indigo-800">
              <Sparkles className="h-3.5 w-3.5" />
              Bibliothèque Juridique Tunisienne
            </div>

            <div className="space-y-2">
              <h1 className="text-3xl md:text-4xl font-bold tracking-tight">
                La référence du droit tunisien
              </h1>
              <p className="text-muted-foreground max-w-xl mx-auto text-sm leading-relaxed">
                Codes, jurisprudence, doctrine et textes officiels — recherche sémantique IA sur{' '}
                {statsLoading ? '…' : totalCount.toLocaleString('fr-FR')} documents juridiques
              </p>
            </div>

            {/* Barre de recherche */}
            <div className="max-w-2xl mx-auto">
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                  <Input
                    placeholder="Rechercher un article, un texte de loi, une décision… (ex: article 47 CP)"
                    value={searchQuery}
                    onChange={(e) => { setSearchQuery(e.target.value); setSearchError('') }}
                    onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                    className="pl-12 h-12 text-base"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery('')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-full hover:bg-muted transition-colors"
                      aria-label="Effacer"
                    >
                      <X className="h-4 w-4 text-muted-foreground" />
                    </button>
                  )}
                </div>
                <Button onClick={handleSearch} size="lg" className="h-12 px-6 shrink-0">
                  <Search className="h-4 w-4 mr-2" />
                  Rechercher
                </Button>
              </div>
              {searchError && (
                <p className="text-sm text-destructive mt-2">{searchError}</p>
              )}

              <div className="flex flex-wrap gap-2 mt-3 justify-center">
                <span className="text-xs text-muted-foreground self-center">Suggestions :</span>
                {POPULAR_SEARCHES.map((item) => (
                  <Button
                    key={item.query}
                    variant="outline"
                    size="sm"
                    className="text-xs h-7 rounded-full"
                    onClick={() => handlePopularSearch(item.query)}
                  >
                    {item.label}
                  </Button>
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
                <StatTile value={totalCount} label="Documents indexés" icon={<Database className="h-4 w-4" />} />
                <StatTile value={textesCount} label="Textes normatifs" icon={<FileText className="h-4 w-4" />} />
                <StatTile value={jurisCount} label="Décisions" icon={<Scale className="h-4 w-4" />} />
                <StatTile value={doctrineCount} label="Articles doctrine" icon={<TrendingUp className="h-4 w-4" />} />
              </>
            )}
          </div>

          {/* ─── PORTAILS PRINCIPAUX ──────────────────────────────────────── */}
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-4">
              Portails thématiques
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
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
          <div className="border-t pt-8">
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
// STAT TILE
// =============================================================================

function StatTile({ value, label, icon }: { value: number; label: string; icon: React.ReactNode }) {
  return (
    <div className="border rounded-xl p-4 bg-card flex items-center gap-3">
      <div className="text-muted-foreground">{icon}</div>
      <div>
        <div className="text-xl font-bold tabular-nums leading-none">
          {value.toLocaleString('fr-FR')}
        </div>
        <div className="text-xs text-muted-foreground mt-0.5">{label}</div>
      </div>
    </div>
  )
}
