/**
 * Page Super Admin - Documents Juridiques
 * Liste des documents juridiques avec stats, filtres et pagination
 */

import Link from 'next/link'
import { db } from '@/lib/db/postgres'
import { Icons } from '@/lib/icons'
import { getStalenessThreshold } from '@/lib/legal-documents/freshness-service'
import { LegalDocumentsTable } from '@/components/super-admin/legal-documents/LegalDocumentsTable'
import { LegalHierarchyNav } from '@/components/super-admin/legal-documents/LegalHierarchyNav'
import { LegalDocumentsFiltersBar } from '@/components/super-admin/legal-documents/LegalDocumentsFiltersBar'
import { ImportLegalDocumentsDialog } from '@/components/super-admin/legal-documents/ImportLegalDocumentsDialog'
import { KnowledgeBaseUploadDialog } from '@/components/super-admin/knowledge-base/KnowledgeBaseUploadDialog'
import { IndexPendingButton } from '@/components/super-admin/legal-documents/IndexPendingButton'
import { normalizeLegalCategory } from '@/lib/categories/legal-categories'

export const dynamic = 'force-dynamic'

interface PageProps {
  searchParams: Promise<{
    page?: string
    category?: string
    type?: string
    status?: string
    norm_level?: string
    q?: string
  }>
}

function buildFilterParams(
  current: { category?: string; type?: string; status?: string; norm_level?: string; q?: string },
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
  filters: { category?: string; type?: string; status?: string; norm_level?: string; q?: string },
  page: number
): string {
  const params = new URLSearchParams()
  if (filters.category) params.set('category', filters.category)
  if (filters.type) params.set('type', filters.type)
  if (filters.status) params.set('status', filters.status)
  if (filters.norm_level) params.set('norm_level', filters.norm_level)
  if (filters.q) params.set('q', filters.q)
  params.set('page', String(page))
  return `?${params.toString()}`
}

function buildPageNumbers(current: number, total: number): (number | '…')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)
  const pages: (number | '…')[] = [1]
  if (current > 3) pages.push('…')
  for (let p = Math.max(2, current - 1); p <= Math.min(total - 1, current + 1); p++) {
    pages.push(p)
  }
  if (current < total - 2) pages.push('…')
  pages.push(total)
  return pages
}

export default async function LegalDocumentsPage({ searchParams }: PageProps) {
  const params = await searchParams
  const page = parseInt(params.page || '1', 10)
  const pageSize = 20
  const offset = (page - 1) * pageSize

  const categoryFilter = params.category ? normalizeLegalCategory(params.category) : null
  const typeFilter = params.type || null
  const statusFilter = params.status || null
  const normLevelFilter = params.norm_level || null
  const searchQuery = params.q?.trim() || null

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
  if (normLevelFilter && normLevelFilter !== 'null') {
    conditions.push(`ld.norm_level = $${paramIndex}::norm_level`)
    queryParams.push(normLevelFilter)
    paramIndex++
  } else if (normLevelFilter === 'null') {
    conditions.push(`ld.norm_level IS NULL`)
  }
  if (searchQuery) {
    conditions.push(`(
      ld.citation_key ILIKE $${paramIndex}
      OR ld.official_title_ar ILIKE $${paramIndex}
      OR ld.official_title_fr ILIKE $${paramIndex}
    )`)
    queryParams.push(`%${searchQuery}%`)
    paramIndex++
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

  const [statsResult, docsResult, countResult, categoriesResult, typesResult, sourcesResult, normLevelCountsResult, pendingIndexResult] = await Promise.all([
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
      norm_level: string | null
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
      kb_is_active: boolean | null
      kb_rag_enabled: boolean | null
    }>(`
      SELECT ld.*,
        (SELECT COUNT(*) FROM web_pages_documents wpd WHERE wpd.legal_document_id = ld.id)::TEXT as linked_pages,
        (SELECT COUNT(*) FROM web_pages_documents wpd WHERE wpd.legal_document_id = ld.id AND wpd.contribution_type IN ('article', 'section'))::TEXT as articles_count,
        (SELECT COUNT(*) FROM knowledge_base_chunks kbc WHERE kbc.knowledge_base_id = ld.knowledge_base_id)::TEXT as chunks_count,
        EXTRACT(DAY FROM NOW() - COALESCE(ld.last_verified_at, ld.created_at))::INTEGER as staleness_days,
        kb.is_active AS kb_is_active,
        kb.rag_enabled AS kb_rag_enabled
      FROM legal_documents ld
      LEFT JOIN knowledge_base kb ON kb.id = ld.knowledge_base_id
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
    // Counts par niveau hiérarchique (pour le nav)
    db.query<{ norm_level: string; count: string }>(`
      SELECT COALESCE(norm_level::text, 'null') as norm_level, COUNT(*)::TEXT as count
      FROM legal_documents
      GROUP BY norm_level
    `),
    // Docs approuvés + consolidés sans chunks KB (à indexer)
    db.query<{ count: string }>(`
      SELECT COUNT(*)::TEXT as count
      FROM legal_documents ld
      WHERE ld.is_approved = true
        AND ld.consolidation_status = 'complete'
        AND ld.is_abrogated = false
        AND (
          ld.knowledge_base_id IS NULL
          OR (SELECT COUNT(*) FROM knowledge_base_chunks kbc WHERE kbc.knowledge_base_id = ld.knowledge_base_id) = 0
        )
    `),
  ])

  const stats = statsResult.rows[0]
  const docs = docsResult.rows
  const filteredCount = parseInt(countResult.rows[0].count, 10)
  const pendingIndexCount = parseInt(pendingIndexResult.rows[0]?.count || '0', 10)
  const totalPages = Math.ceil(filteredCount / pageSize)
  // Normaliser et dédupliquer les catégories (ex: code → codes)
  const categoriesRaw = categoriesResult.rows.map(r => r.primary_category)
  const categoriesNormalized = [...new Set(categoriesRaw.map(c => normalizeLegalCategory(c)))]
  const categories = categoriesNormalized.sort()
  const types = typesResult.rows.map(r => r.document_type)
  const sources = sourcesResult.rows

  // Construire le Record<normLevel, count> pour LegalHierarchyNav
  const normLevelCounts: Record<string, number> = {}
  for (const row of normLevelCountsResult.rows) {
    normLevelCounts[row.norm_level] = parseInt(row.count, 10)
  }

  const totalDocsCount = parseInt(stats.total_docs, 10)
  const totalConsolidated = parseInt(stats.consolidated, 10)
  const totalApproved = parseInt(stats.approved, 10)

  const hasFilters = !!(categoryFilter || typeFilter || statusFilter || normLevelFilter || searchQuery)
  const currentFilters = {
    category: categoryFilter || undefined,
    type: typeFilter || undefined,
    status: statusFilter || undefined,
    norm_level: normLevelFilter || undefined,
    q: searchQuery || undefined,
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
      norm_level: doc.norm_level || null,
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
      kb_is_active: doc.kb_is_active ?? null,
      kb_rag_enabled: doc.kb_rag_enabled ?? null,
    }
  })

  return (
    <div className="space-y-5">

      {/* ── Header ───────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Documents Juridiques</h1>
          <p className="text-slate-400 mt-1 text-sm">
            Gestion de la couche document — consolidation, approbation et indexation KB
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <IndexPendingButton pendingCount={pendingIndexCount} />
          <KnowledgeBaseUploadDialog />
          <ImportLegalDocumentsDialog sources={sources} />
        </div>
      </div>

      {/* ── Stats ────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <StatCard
          label="Total"
          value={totalDocsCount}
          icon={Icons.scale}
          iconColor="text-slate-400"
        />
        <StatCard
          label="Consolidés"
          value={totalConsolidated}
          total={totalDocsCount}
          icon={Icons.checkCircle}
          iconColor="text-blue-400"
          barColor="bg-blue-500"
        />
        <StatCard
          label="Approuvés"
          value={totalApproved}
          total={totalDocsCount}
          icon={Icons.check}
          iconColor="text-green-400"
          barColor="bg-green-500"
        />
        <StatCard
          label="Pages liées"
          value={parseInt(stats.total_pages, 10)}
          icon={Icons.fileText}
          iconColor="text-sky-400"
        />
        <StatCard
          label="Amendements"
          value={parseInt(stats.total_amendments, 10)}
          icon={Icons.alertTriangle}
          iconColor="text-orange-400"
        />
      </div>

      {/* ── Navigation hiérarchique ──────────────────────────────────── */}
      <div className="p-4 bg-slate-900/50 border border-slate-700 rounded-lg">
        <LegalHierarchyNav
          normLevelCounts={normLevelCounts}
          selectedNormLevel={normLevelFilter}
          buildHref={(normLevel) => buildFilterParams(currentFilters, { norm_level: normLevel })}
          totalCount={totalDocsCount}
        />
      </div>

      {/* ── Filtres + Recherche ──────────────────────────────────────── */}
      <LegalDocumentsFiltersBar
        categories={categories}
        types={types}
        currentCategory={categoryFilter}
        currentType={typeFilter}
        currentStatus={statusFilter}
        currentSearch={searchQuery}
        filteredCount={filteredCount}
        hasFilters={hasFilters}
      />

      {/* ── Table ────────────────────────────────────────────────────── */}
      <LegalDocumentsTable
        docs={serializedDocs}
        hasFilters={hasFilters}
      />

      {/* ── Pagination ───────────────────────────────────────────────── */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-slate-500">
            Page <span className="text-slate-300">{page}</span> sur{' '}
            <span className="text-slate-300">{totalPages}</span>
            {' '}— {filteredCount.toLocaleString('fr-FR')} document{filteredCount !== 1 ? 's' : ''}
          </p>
          <div className="flex items-center gap-1">
            <PaginationLink href={buildPaginationParams(currentFilters, page - 1)} disabled={page <= 1}>
              <Icons.chevronLeft className="h-4 w-4" />
            </PaginationLink>
            {buildPageNumbers(page, totalPages).map((item, i) =>
              item === '…' ? (
                <span key={`ellipsis-${i}`} className="px-1 text-slate-600 text-sm select-none">…</span>
              ) : (
                <PaginationLink
                  key={item}
                  href={buildPaginationParams(currentFilters, item as number)}
                  active={(item as number) === page}
                >
                  {item}
                </PaginationLink>
              )
            )}
            <PaginationLink href={buildPaginationParams(currentFilters, page + 1)} disabled={page >= totalPages}>
              <Icons.chevronRight className="h-4 w-4" />
            </PaginationLink>
          </div>
        </div>
      )}
    </div>
  )
}

function StatCard({
  label,
  value,
  total,
  icon: Icon,
  iconColor,
  barColor,
}: {
  label: string
  value: number
  total?: number
  icon: React.ComponentType<{ className?: string }>
  iconColor: string
  barColor?: string
}) {
  const pct = total && total > 0 ? Math.round((value / total) * 100) : null

  return (
    <div className="p-4 bg-slate-900/50 border border-slate-700 rounded-lg space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs text-slate-400 font-medium">{label}</span>
        <Icon className={`h-3.5 w-3.5 ${iconColor}`} />
      </div>
      <div className="flex items-end justify-between gap-2">
        <span className="text-2xl font-bold text-white tabular-nums">
          {value.toLocaleString('fr-FR')}
        </span>
        {pct !== null && (
          <span className="text-sm text-slate-400 tabular-nums mb-0.5">{pct}%</span>
        )}
      </div>
      {pct !== null && barColor && (
        <div className="h-1 bg-slate-700 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${barColor}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      )}
    </div>
  )
}

function PaginationLink({
  href,
  children,
  disabled,
  active,
}: {
  href: string
  children: React.ReactNode
  disabled?: boolean
  active?: boolean
}) {
  if (disabled) {
    return (
      <span className="inline-flex items-center justify-center h-8 min-w-8 px-2 rounded text-sm text-slate-600 cursor-not-allowed select-none">
        {children}
      </span>
    )
  }
  return (
    <Link
      href={href}
      className={`inline-flex items-center justify-center h-8 min-w-8 px-2 rounded text-sm transition-colors select-none ${
        active
          ? 'bg-slate-600 text-white font-medium'
          : 'text-slate-400 hover:text-white hover:bg-slate-700/60'
      }`}
    >
      {children}
    </Link>
  )
}
