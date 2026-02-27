'use client'

import { useState, useEffect, useRef, useCallback, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Icons } from '@/lib/icons'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'

// ─── Types ────────────────────────────────────────────────────────────────────

interface SearchResults {
  clients: Array<{ id: string; nom: string; prenom: string; denomination: string; type_client: string; email: string }>
  dossiers: Array<{ id: string; numero: string; objet: string; statut: string; type_procedure: string; client_nom: string }>
  factures: Array<{ id: string; numero: string; montant_ttc: number; statut: string; client_nom: string }>
  documents: Array<{ id: string; nom_fichier: string; type_document: string }>
  echeances: Array<{ id: string; titre: string; date_echeance_fmt: string; statut: string }>
  templates: Array<{ id: string; nom: string; description: string; langue: string }>
}

const EMPTY_RESULTS: SearchResults = {
  clients: [], dossiers: [], factures: [], documents: [], echeances: [], templates: [],
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function totalCount(r: SearchResults) {
  return r.clients.length + r.dossiers.length + r.factures.length +
    r.documents.length + r.echeances.length + r.templates.length
}

function CountBadge({ count }: { count: number }) {
  if (count === 0) return null
  return (
    <span className="ml-1.5 inline-flex items-center justify-center rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
      {count}
    </span>
  )
}

function StatutBadge({ statut }: { statut: string }) {
  const map: Record<string, string> = {
    en_cours: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
    termine: 'text-green-400 bg-green-500/10 border-green-500/20',
    archive: 'text-muted-foreground bg-muted border-border',
    envoyee: 'text-orange-400 bg-orange-500/10 border-orange-500/20',
    payee: 'text-green-400 bg-green-500/10 border-green-500/20',
    brouillon: 'text-muted-foreground bg-muted border-border',
    actif: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
  }
  return (
    <span className={cn('inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium', map[statut] ?? 'text-muted-foreground bg-muted border-border')}>
      {statut}
    </span>
  )
}

function SkeletonRows() {
  return (
    <div className="space-y-2 py-2">
      {[...Array(4)].map((_, i) => (
        <div key={i} className="flex items-center gap-3 rounded-lg px-4 py-3 animate-pulse">
          <div className="h-8 w-8 rounded-full bg-muted shrink-0" />
          <div className="flex-1 space-y-1.5">
            <div className="h-3.5 w-32 rounded bg-muted" />
            <div className="h-3 w-48 rounded bg-muted/70" />
          </div>
        </div>
      ))}
    </div>
  )
}

function EmptyState({ query }: { query: string }) {
  if (!query || query.length < 2) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="h-16 w-16 rounded-full bg-muted/50 flex items-center justify-center mb-4">
          <Icons.search className="h-7 w-7 text-muted-foreground/50" />
        </div>
        <p className="text-base font-medium text-muted-foreground">Tapez pour chercher</p>
        <p className="text-sm text-muted-foreground/70 mt-1">
          Au moins 2 caractères — dossiers, clients, factures, échéances...
        </p>
      </div>
    )
  }
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="h-16 w-16 rounded-full bg-muted/50 flex items-center justify-center mb-4">
        <Icons.search className="h-7 w-7 text-muted-foreground/50" />
      </div>
      <p className="text-base font-medium text-muted-foreground">Aucun résultat pour « {query} »</p>
      <p className="text-sm text-muted-foreground/70 mt-1">Essayez un autre terme ou vérifiez l'orthographe.</p>
    </div>
  )
}

// ─── Result rows ──────────────────────────────────────────────────────────────

function ResultRow({ icon, title, subtitle, badge, href }: {
  icon: React.ReactNode
  title: string
  subtitle?: string
  badge?: React.ReactNode
  href: string
}) {
  return (
    <Link href={href} className="flex items-center gap-3 rounded-lg px-4 py-3 hover:bg-muted/50 transition-colors group">
      <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center shrink-0 group-hover:bg-muted/80">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{title}</p>
        {subtitle && <p className="text-xs text-muted-foreground truncate mt-0.5">{subtitle}</p>}
      </div>
      {badge}
    </Link>
  )
}

function DossierRows({ items }: { items: SearchResults['dossiers'] }) {
  return (
    <>
      {items.map(d => (
        <ResultRow
          key={d.id}
          href={`/dossiers/${d.id}`}
          icon={<Icons.dossiers className="h-4 w-4 text-violet-400" />}
          title={d.numero}
          subtitle={[d.objet, d.client_nom].filter(Boolean).join(' · ')}
          badge={<StatutBadge statut={d.statut} />}
        />
      ))}
    </>
  )
}

function ClientRows({ items }: { items: SearchResults['clients'] }) {
  return (
    <>
      {items.map(c => (
        <ResultRow
          key={c.id}
          href={`/clients/${c.id}`}
          icon={<Icons.clients className="h-4 w-4 text-blue-400" />}
          title={c.denomination || [c.prenom, c.nom].filter(Boolean).join(' ') || 'Client'}
          subtitle={c.email || undefined}
          badge={<span className="text-[10px] text-muted-foreground">{c.type_client}</span>}
        />
      ))}
    </>
  )
}

function FactureRows({ items }: { items: SearchResults['factures'] }) {
  return (
    <>
      {items.map(f => (
        <ResultRow
          key={f.id}
          href={`/factures/${f.id}`}
          icon={<Icons.invoices className="h-4 w-4 text-green-400" />}
          title={f.numero}
          subtitle={f.client_nom ? `${f.client_nom} · ${f.montant_ttc?.toFixed(3)} TND` : `${f.montant_ttc?.toFixed(3)} TND`}
          badge={<StatutBadge statut={f.statut} />}
        />
      ))}
    </>
  )
}

function EcheanceRows({ items }: { items: SearchResults['echeances'] }) {
  return (
    <>
      {items.map(e => (
        <ResultRow
          key={e.id}
          href="/echeances"
          icon={<Icons.deadlines className="h-4 w-4 text-orange-400" />}
          title={e.titre}
          subtitle={e.date_echeance_fmt}
        />
      ))}
    </>
  )
}

function DocumentRows({ items }: { items: SearchResults['documents'] }) {
  return (
    <>
      {items.map(d => (
        <ResultRow
          key={d.id}
          href="/documents"
          icon={<Icons.documents className="h-4 w-4 text-amber-400" />}
          title={d.nom_fichier}
          subtitle={d.type_document || undefined}
        />
      ))}
    </>
  )
}

function TemplateRows({ items }: { items: SearchResults['templates'] }) {
  return (
    <>
      {items.map(t => (
        <ResultRow
          key={t.id}
          href={`/templates/${t.id}`}
          icon={<Icons.templates className="h-4 w-4 text-pink-400" />}
          title={t.nom}
          subtitle={t.description ? t.description.slice(0, 60) + (t.description.length > 60 ? '…' : '') : undefined}
          badge={t.langue ? <span className="text-[10px] uppercase text-muted-foreground">{t.langue}</span> : undefined}
        />
      ))}
    </>
  )
}

// ─── Main page content ────────────────────────────────────────────────────────

function RechercheContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const initialQ = searchParams.get('q') ?? ''

  const [query, setQuery] = useState(initialQ)
  const [results, setResults] = useState<SearchResults>(EMPTY_RESULTS)
  const [loading, setLoading] = useState(false)
  const [activeTab, setActiveTab] = useState('all')
  const inputRef = useRef<HTMLInputElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Autofocus à l'arrivée
  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  // Cmd+K → focus input
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        inputRef.current?.focus()
        inputRef.current?.select()
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [])

  // Recherche avec debounce
  const doSearch = useCallback(async (q: string) => {
    if (q.length < 2) {
      setResults(EMPTY_RESULTS)
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`)
      const data = await res.json()
      setResults(data.results ?? EMPTY_RESULTS)
    } catch {
      setResults(EMPTY_RESULTS)
    } finally {
      setLoading(false)
    }
  }, [])

  const handleChange = (value: string) => {
    setQuery(value)
    // Sync URL
    if (value.length >= 2) {
      router.replace(`/recherche?q=${encodeURIComponent(value)}`, { scroll: false })
    } else {
      router.replace('/recherche', { scroll: false })
    }
    // Debounce
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => doSearch(value), 300)
  }

  // Exécuter si query initiale depuis URL
  useEffect(() => {
    if (initialQ.length >= 2) doSearch(initialQ)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const total = totalCount(results)
  const hasQuery = query.length >= 2
  const hasResults = total > 0

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">Recherche</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Dossiers, clients, factures, échéances, documents, templates
          <kbd className="ml-2 inline-flex items-center gap-1 rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground">
            ⌘K
          </kbd>
        </p>
      </div>

      {/* Search input */}
      <div className="relative">
        <Icons.search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input
          ref={inputRef}
          type="search"
          value={query}
          onChange={e => handleChange(e.target.value)}
          placeholder="Rechercher un dossier, client, facture..."
          className="w-full rounded-xl border border-border bg-card pl-10 pr-4 py-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 transition"
        />
        {loading && (
          <Icons.loader className="absolute right-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground animate-spin" />
        )}
      </div>

      {/* Résultats */}
      {!hasQuery ? (
        <EmptyState query={query} />
      ) : loading ? (
        <SkeletonRows />
      ) : !hasResults ? (
        <EmptyState query={query} />
      ) : (
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="flex flex-wrap gap-1 h-auto bg-transparent p-0 mb-2">
            <TabsTrigger value="all" className="rounded-full border border-border data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:border-primary px-3 py-1.5 text-xs">
              Tout <CountBadge count={total} />
            </TabsTrigger>
            {results.dossiers.length > 0 && (
              <TabsTrigger value="dossiers" className="rounded-full border border-border data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:border-primary px-3 py-1.5 text-xs">
                Dossiers <CountBadge count={results.dossiers.length} />
              </TabsTrigger>
            )}
            {results.clients.length > 0 && (
              <TabsTrigger value="clients" className="rounded-full border border-border data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:border-primary px-3 py-1.5 text-xs">
                Clients <CountBadge count={results.clients.length} />
              </TabsTrigger>
            )}
            {results.factures.length > 0 && (
              <TabsTrigger value="factures" className="rounded-full border border-border data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:border-primary px-3 py-1.5 text-xs">
                Factures <CountBadge count={results.factures.length} />
              </TabsTrigger>
            )}
            {results.echeances.length > 0 && (
              <TabsTrigger value="echeances" className="rounded-full border border-border data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:border-primary px-3 py-1.5 text-xs">
                Échéances <CountBadge count={results.echeances.length} />
              </TabsTrigger>
            )}
            {results.documents.length > 0 && (
              <TabsTrigger value="documents" className="rounded-full border border-border data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:border-primary px-3 py-1.5 text-xs">
                Documents <CountBadge count={results.documents.length} />
              </TabsTrigger>
            )}
            {results.templates.length > 0 && (
              <TabsTrigger value="templates" className="rounded-full border border-border data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:border-primary px-3 py-1.5 text-xs">
                Templates <CountBadge count={results.templates.length} />
              </TabsTrigger>
            )}
          </TabsList>

          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <TabsContent value="all" className="m-0 divide-y divide-border">
              <DossierRows items={results.dossiers} />
              <ClientRows items={results.clients} />
              <FactureRows items={results.factures} />
              <EcheanceRows items={results.echeances} />
              <DocumentRows items={results.documents} />
              <TemplateRows items={results.templates} />
            </TabsContent>
            <TabsContent value="dossiers" className="m-0 divide-y divide-border">
              <DossierRows items={results.dossiers} />
            </TabsContent>
            <TabsContent value="clients" className="m-0 divide-y divide-border">
              <ClientRows items={results.clients} />
            </TabsContent>
            <TabsContent value="factures" className="m-0 divide-y divide-border">
              <FactureRows items={results.factures} />
            </TabsContent>
            <TabsContent value="echeances" className="m-0 divide-y divide-border">
              <EcheanceRows items={results.echeances} />
            </TabsContent>
            <TabsContent value="documents" className="m-0 divide-y divide-border">
              <DocumentRows items={results.documents} />
            </TabsContent>
            <TabsContent value="templates" className="m-0 divide-y divide-border">
              <TemplateRows items={results.templates} />
            </TabsContent>
          </div>
        </Tabs>
      )}
    </div>
  )
}

// ─── Page wrapper avec Suspense (useSearchParams) ─────────────────────────────

export default function RecherchePage() {
  return (
    <Suspense fallback={
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="h-8 w-32 rounded bg-muted animate-pulse" />
        <div className="h-12 w-full rounded-xl bg-muted animate-pulse" />
        <SkeletonRows />
      </div>
    }>
      <RechercheContent />
    </Suspense>
  )
}
