/**
 * Page Super Admin - Documents Juridiques
 * Liste des documents juridiques avec stats, filtres et pagination
 */

import Link from 'next/link'
import { db } from '@/lib/db/postgres'
import { Button } from '@/components/ui/button'
import { Icons } from '@/lib/icons'
import { getStalenessThreshold } from '@/lib/legal-documents/freshness-service'
import { LegalDocumentsTable } from '@/components/super-admin/legal-documents/LegalDocumentsTable'
import { ImportLegalDocumentsDialog } from '@/components/super-admin/legal-documents/ImportLegalDocumentsDialog'
import { normalizeLegalCategory, LEGAL_CATEGORY_TRANSLATIONS } from '@/lib/categories/legal-categories'

export const dynamic = 'force-dynamic'

interface PageProps {
  searchParams: Promise<{
    page?: string
    category?: string
    type?: string
    status?: string
  }>
}

const TYPE_COLORS: Record<string, string> = {
  code: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  loi: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  decret: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  arrete: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
  circulaire: 'bg-teal-500/20 text-teal-400 border-teal-500/30',
  jurisprudence: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  doctrine: 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30',
  guide: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  formulaire: 'bg-pink-500/20 text-pink-400 border-pink-500/30',
  autre: 'bg-slate-500/20 text-slate-400 border-slate-500/30',
}

const TYPE_LABELS: Record<string, string> = {
  code: 'Code',
  loi: 'Loi',
  decret: 'Décret',
  arrete: 'Arrêté',
  circulaire: 'Circulaire',
  jurisprudence: 'Jurisprudence',
  doctrine: 'Doctrine',
  guide: 'Guide',
  formulaire: 'Formulaire',
  autre: 'Autre',
}

const CONSOLIDATION_COLORS: Record<string, string> = {
  pending: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  partial: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  complete: 'bg-green-500/20 text-green-400 border-green-500/30',
}

const CONSOLIDATION_LABELS: Record<string, string> = {
  pending: 'En attente',
  partial: 'Partiel',
  complete: 'Complet',
}

function buildFilterParams(
  current: { category?: string; type?: string; status?: string },
  override: Record<string, string | undefined>
): string {
  const merged = { ...current, ...override, page: '1' }
  const params = new URLSearchParams()
  for (const [key, val] of Object.entries(merged)) {
    if (val) params.set(key, val)
  }
  const str = params.toString()
  return str ? `?${str}` : '?'
}

function buildPaginationParams(
  filters: { category?: string; type?: string; status?: string },
  page: number
): string {
  const params = new URLSearchParams()
  if (filters.category) params.set('category', filters.category)
  if (filters.type) params.set('type', filters.type)
  if (filters.status) params.set('status', filters.status)
  params.set('page', String(page))
  return `?${params.toString()}`
}

export default async function LegalDocumentsPage({ searchParams }: PageProps) {
  const params = await searchParams
  const page = parseInt(params.page || '1')
  const pageSize = 20
  const offset = (page - 1) * pageSize

  const categoryFilter = params.category ? normalizeLegalCategory(params.category) : null
  const typeFilter = params.type || null
  const statusFilter = params.status || null

  // Build dynamic WHERE conditions
  const conditions: string[] = []
  const queryParams: (string | number)[] = []
  let paramIndex = 1

  if (categoryFilter) {
    // Matcher aussi les anciennes valeurs non normalisées (ex: code ET codes)
    conditions.push(`(ld.primary_category = $${paramIndex} OR ld.primary_category = $${paramIndex + 1})`)
    queryParams.push(categoryFilter, params.category || categoryFilter)
    paramIndex += 2
  }
  if (typeFilter) {
    conditions.push(`ld.document_type = $${paramIndex}`)
    queryParams.push(typeFilter)
    paramIndex++
  }
  if (statusFilter === 'approved') {
    conditions.push(`ld.is_approved = true`)
  } else if (statusFilter === 'complete') {
    conditions.push(`ld.consolidation_status = 'complete'`)
  } else if (statusFilter === 'pending') {
    conditions.push(`ld.is_approved = false AND ld.consolidation_status != 'complete'`)
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

  const [statsResult, docsResult, countResult, categoriesResult, typesResult, sourcesResult] = await Promise.all([
    // Stats globales (non filtrées)
    db.query<{
      total_docs: string
      consolidated: string
      approved: string
      total_pages: string
      total_amendments: string
    }>(`
      SELECT
        (SELECT COUNT(*) FROM legal_documents)::TEXT as total_docs,
        (SELECT COUNT(*) FROM legal_documents WHERE consolidation_status = 'complete')::TEXT as consolidated,
        (SELECT COUNT(*) FROM legal_documents WHERE is_approved = true)::TEXT as approved,
        (SELECT COUNT(*) FROM web_pages_documents)::TEXT as total_pages,
        (SELECT COUNT(*) FROM legal_document_amendments)::TEXT as total_amendments
    `),
    // Documents filtrés
    db.query<{
      id: string
      citation_key: string
      document_type: string
      primary_category: string | null
      official_title_ar: string | null
      official_title_fr: string | null
      consolidation_status: string
      is_abrogated: boolean
      is_approved: boolean
      page_count: number
      last_verified_at: string | null
      created_at: string
      linked_pages: string
      articles_count: string
      chunks_count: string
      staleness_days: number | null
    }>(`
      SELECT ld.*,
        (SELECT COUNT(*) FROM web_pages_documents wpd WHERE wpd.legal_document_id = ld.id)::TEXT as linked_pages,
        (SELECT COUNT(*) FROM web_pages_documents wpd WHERE wpd.legal_document_id = ld.id AND wpd.contribution_type = 'article')::TEXT as articles_count,
        (SELECT COUNT(*) FROM knowledge_base_chunks kbc WHERE kbc.knowledge_base_id = ld.knowledge_base_id)::TEXT as chunks_count,
        EXTRACT(DAY FROM NOW() - COALESCE(ld.last_verified_at, ld.created_at))::INTEGER as staleness_days
      FROM legal_documents ld
      ${whereClause}
      ORDER BY ld.citation_key ASC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `, [...queryParams, pageSize, offset]),
    // Count filtré
    db.query<{ count: string }>(`
      SELECT COUNT(*)::TEXT as count FROM legal_documents ld ${whereClause}
    `, queryParams),
    // Catégories distinctes pour le filtre
    db.query<{ primary_category: string }>(`
      SELECT DISTINCT primary_category FROM legal_documents
      WHERE primary_category IS NOT NULL
      ORDER BY primary_category
    `),
    // Types distincts pour le filtre
    db.query<{ document_type: string }>(`
      SELECT DISTINCT document_type FROM legal_documents
      WHERE document_type IS NOT NULL
      ORDER BY document_type
    `),
    // Web sources actives pour l'import
    db.query<{ id: string; name: string; base_url: string }>(`
      SELECT id, name, base_url FROM web_sources
      WHERE is_active = true
      ORDER BY name
    `),
  ])

  const stats = statsResult.rows[0]
  const docs = docsResult.rows
  const filteredCount = parseInt(countResult.rows[0].count)
  const totalPages = Math.ceil(filteredCount / pageSize)
  // Normaliser et dédupliquer les catégories (ex: code → codes)
  const categoriesRaw = categoriesResult.rows.map(r => r.primary_category)
  const categoriesNormalized = [...new Set(categoriesRaw.map(c => normalizeLegalCategory(c)))]
  const categories = categoriesNormalized.sort()
  const types = typesResult.rows.map(r => r.document_type)
  const sources = sourcesResult.rows

  const hasFilters = categoryFilter || typeFilter || statusFilter
  const currentFilters = {
    category: categoryFilter || undefined,
    type: typeFilter || undefined,
    status: statusFilter || undefined,
  }

  // Pre-compute freshness data server-side for the client component
  const serializedDocs = docs.map((doc) => {
    const threshold = getStalenessThreshold(doc.document_type || 'autre')
    const stalenessDays = doc.staleness_days ?? 0
    const freshnessColor = stalenessDays > threshold
      ? 'text-red-400'
      : stalenessDays > threshold * 0.75
        ? 'text-yellow-400'
        : 'text-green-400'

    return {
      id: doc.id,
      citation_key: doc.citation_key,
      document_type: doc.document_type,
      primary_category: doc.primary_category,
      official_title_ar: doc.official_title_ar,
      official_title_fr: doc.official_title_fr,
      consolidation_status: doc.consolidation_status,
      is_abrogated: doc.is_abrogated,
      is_approved: doc.is_approved,
      page_count: doc.page_count,
      last_verified_at: doc.last_verified_at,
      created_at: doc.created_at,
      linked_pages: doc.linked_pages,
      articles_count: doc.articles_count,
      chunks_count: doc.chunks_count,
      staleness_days: doc.staleness_days,
      staleness_threshold: threshold,
      freshness_color: freshnessColor,
    }
  })

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Documents Juridiques</h1>
          <p className="text-slate-400 mt-1">
            Couche document juridique - consolidation, fraicheur et liens KB
          </p>
        </div>
        <ImportLegalDocumentsDialog sources={sources} />
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <StatCard
          label="Total documents"
          value={parseInt(stats.total_docs)}
          icon={Icons.scale}
          color="text-slate-400"
        />
        <StatCard
          label="Consolidés"
          value={parseInt(stats.consolidated)}
          icon={Icons.check}
          color="text-blue-400"
        />
        <StatCard
          label="Approuvés"
          value={parseInt(stats.approved)}
          icon={Icons.check}
          color="text-green-400"
        />
        <StatCard
          label="Pages liées"
          value={parseInt(stats.total_pages)}
          icon={Icons.fileText}
          color="text-blue-400"
        />
        <StatCard
          label="Amendements"
          value={parseInt(stats.total_amendments)}
          icon={Icons.alertTriangle}
          color="text-orange-400"
        />
      </div>

      {/* Filtres */}
      <div className="flex flex-wrap items-center gap-3 p-4 bg-slate-900/50 border border-slate-700 rounded-lg">
        <Icons.filter className="h-4 w-4 text-slate-400" />

        {/* Filtre catégorie */}
        <FilterSelect
          label="Catégorie"
          value={categoryFilter}
          options={categories.map(c => ({
            value: c,
            label: LEGAL_CATEGORY_TRANSLATIONS[c]?.fr || c,
          }))}
          buildHref={(val) => buildFilterParams(currentFilters, { category: val })}
        />

        {/* Filtre type */}
        <FilterSelect
          label="Type"
          value={typeFilter}
          options={types.map(t => ({
            value: t,
            label: TYPE_LABELS[t] || t,
          }))}
          buildHref={(val) => buildFilterParams(currentFilters, { type: val })}
        />

        {/* Filtre statut */}
        <FilterSelect
          label="Statut"
          value={statusFilter}
          options={[
            { value: 'approved', label: 'Approuvés' },
            { value: 'complete', label: 'Consolidés' },
            { value: 'pending', label: 'En attente' },
          ]}
          buildHref={(val) => buildFilterParams(currentFilters, { status: val })}
        />

        {hasFilters && (
          <Link
            href="?"
            className="ml-2 text-xs text-slate-400 hover:text-white transition-colors"
          >
            Réinitialiser
          </Link>
        )}

        {hasFilters && (
          <span className="ml-auto text-sm text-slate-400">
            {filteredCount} résultat{filteredCount !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* Table avec sélection bulk */}
      <LegalDocumentsTable
        docs={serializedDocs}
        hasFilters={!!hasFilters}
        typeColors={TYPE_COLORS}
        consolidationColors={CONSOLIDATION_COLORS}
        consolidationLabels={CONSOLIDATION_LABELS}
      />

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <div className="text-sm text-slate-400">
            Page {page} sur {totalPages} ({filteredCount} documents)
          </div>
          <div className="flex gap-2">
            <Link
              href={buildPaginationParams(currentFilters, page - 1)}
              className={page <= 1 ? 'pointer-events-none opacity-50' : ''}
            >
              <Button variant="outline" size="sm" disabled={page <= 1}>
                <Icons.chevronLeft className="h-4 w-4" />
              </Button>
            </Link>
            <Link
              href={buildPaginationParams(currentFilters, page + 1)}
              className={page >= totalPages ? 'pointer-events-none opacity-50' : ''}
            >
              <Button variant="outline" size="sm" disabled={page >= totalPages}>
                <Icons.chevronRight className="h-4 w-4" />
              </Button>
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}

function FilterSelect({
  label,
  value,
  options,
  buildHref,
}: {
  label: string
  value: string | null
  options: { value: string; label: string }[]
  buildHref: (val: string | undefined) => string
}) {
  return (
    <div className="relative inline-flex items-center gap-1.5">
      <span className="text-xs text-slate-500">{label}:</span>
      <div className="flex flex-wrap gap-1">
        <Link
          href={buildHref(undefined)}
          className={`px-2 py-0.5 rounded text-xs transition-colors ${
            !value
              ? 'bg-slate-600 text-white'
              : 'text-slate-400 hover:text-white hover:bg-slate-700'
          }`}
        >
          Tous
        </Link>
        {options.map((opt) => (
          <Link
            key={opt.value}
            href={buildHref(opt.value)}
            className={`px-2 py-0.5 rounded text-xs transition-colors ${
              value === opt.value
                ? 'bg-slate-600 text-white'
                : 'text-slate-400 hover:text-white hover:bg-slate-700'
            }`}
          >
            {opt.label}
          </Link>
        ))}
      </div>
    </div>
  )
}

function StatCard({
  label,
  value,
  icon: Icon,
  color,
}: {
  label: string
  value: number
  icon: React.ComponentType<{ className?: string }>
  color: string
}) {
  return (
    <div className="p-4 bg-slate-900/50 border border-slate-700 rounded-lg">
      <div className="flex items-center justify-between">
        <span className="text-sm text-slate-400">{label}</span>
        <Icon className={`h-4 w-4 ${color}`} />
      </div>
      <div className="text-2xl font-bold text-white mt-1">{value}</div>
    </div>
  )
}
