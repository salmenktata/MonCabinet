import { notFound } from 'next/navigation'
import { query } from '@/lib/db/postgres'
import { KnowledgeBaseDetail } from '@/components/super-admin/knowledge-base/KnowledgeBaseDetail'
import { safeParseInt } from '@/lib/utils/safe-number'

export const dynamic = 'force-dynamic'

interface FilterParams {
  category?: string
  subcategory?: string
  indexed?: string
  approved?: string
  search?: string
  abroge?: string
  page?: string
}

interface PageProps {
  params: Promise<{ id: string }>
  searchParams: Promise<FilterParams>
}

async function getDocument(id: string) {
  const result = await query(
    `SELECT kb.*,
            COUNT(kbc.id) as chunk_count,
            u.email as uploaded_by_email
     FROM knowledge_base kb
     LEFT JOIN knowledge_base_chunks kbc ON kb.id = kbc.knowledge_base_id
     LEFT JOIN users u ON kb.uploaded_by = u.id
     WHERE kb.id = $1
     GROUP BY kb.id, u.email`,
    [id]
  )

  if (result.rows.length === 0) {
    return null
  }

  const row = result.rows[0]
  return {
    id: row.id,
    category: row.category,
    subcategory: row.subcategory,
    docType: row.doc_type ?? null,
    normLevel: row.norm_level ?? null,
    sourceOrigin: row.source_origin ?? null,
    ragEnabled: row.rag_enabled !== false,
    language: row.language || 'ar',
    title: row.title,
    description: row.description,
    metadata: row.metadata || {},
    tags: row.tags || [],
    sourceFile: row.source_file,
    fullText: row.full_text,
    isIndexed: row.is_indexed,
    isActive: row.is_active !== false,
    isApproved: row.is_approved === true,
    isAbroge: row.is_abroge ?? null,
    abrogeSuspected: row.abroge_suspected ?? null,
    abrogeConfidence: row.abroge_confidence ?? null,
    version: row.version || 1,
    chunkCount: parseInt(row.chunk_count, 10) || 0,
    uploadedBy: row.uploaded_by,
    uploadedByEmail: row.uploaded_by_email,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    qualityScore: row.quality_score ?? null,
    qualityClarity: row.quality_clarity ?? undefined,
    qualityStructure: row.quality_structure ?? undefined,
    qualityCompleteness: row.quality_completeness ?? undefined,
    qualityReliability: row.quality_reliability ?? undefined,
    qualityAnalysisSummary: row.quality_analysis_summary ?? null,
    qualityDetectedIssues: row.quality_detected_issues ?? [],
    qualityRecommendations: row.quality_recommendations ?? [],
    qualityRequiresReview: row.quality_requires_review ?? false,
  }
}

async function getAdjacentDocuments(id: string, filters: FilterParams) {
  const queryParams: (string | boolean)[] = []
  let paramIndex = 1
  let whereClause = 'WHERE kb.is_active = TRUE'

  if (filters.category && filters.category !== 'all') {
    whereClause += ` AND kb.category = $${paramIndex++}`
    queryParams.push(filters.category)
  }
  if (filters.subcategory) {
    whereClause += ` AND kb.subcategory = $${paramIndex++}`
    queryParams.push(filters.subcategory)
  }
  if (filters.indexed && filters.indexed !== 'all') {
    whereClause += ` AND kb.is_indexed = $${paramIndex++}`
    queryParams.push(filters.indexed === 'true')
  }
  if (filters.approved && filters.approved !== 'all') {
    whereClause += ` AND kb.is_approved = $${paramIndex++}`
    queryParams.push(filters.approved === 'true')
  }
  if (filters.abroge === 'true') {
    whereClause += ` AND kb.is_abroge = TRUE`
  } else if (filters.abroge === 'suspected') {
    whereClause += ` AND kb.abroge_suspected = TRUE AND (kb.is_abroge IS NULL OR kb.is_abroge = FALSE)`
  }
  if (filters.search) {
    whereClause += ` AND (kb.title ILIKE $${paramIndex} OR kb.description ILIKE $${paramIndex})`
    queryParams.push(`%${filters.search}%`)
    paramIndex++
  }

  queryParams.push(id)
  const idParam = `$${paramIndex}`

  const result = await query(
    `WITH ordered AS (
      SELECT kb.id, kb.title,
        LAG(kb.id) OVER (ORDER BY kb.created_at DESC, kb.id DESC) AS prev_id,
        LAG(kb.title) OVER (ORDER BY kb.created_at DESC, kb.id DESC) AS prev_title,
        LEAD(kb.id) OVER (ORDER BY kb.created_at DESC, kb.id DESC) AS next_id,
        LEAD(kb.title) OVER (ORDER BY kb.created_at DESC, kb.id DESC) AS next_title
      FROM knowledge_base kb
      ${whereClause}
    )
    SELECT prev_id, prev_title, next_id, next_title FROM ordered WHERE id = ${idParam}`,
    queryParams
  )

  if (result.rows.length === 0) return null
  const row = result.rows[0]
  return {
    prevDoc: row.prev_id ? { id: row.prev_id, title: row.prev_title as string } : null,
    nextDoc: row.next_id ? { id: row.next_id, title: row.next_title as string } : null,
  }
}

async function getVersions(documentId: string) {
  const result = await query(
    `SELECT * FROM get_knowledge_base_versions($1, $2, $3)`,
    [documentId, 20, 0]
  )

  return result.rows.map((row) => ({
    id: row.id,
    version: row.version,
    title: row.title,
    changeType: row.change_type,
    changeReason: row.change_reason,
    changedBy: row.changed_by,
    changedByEmail: row.changed_by_email,
    changedAt: row.changed_at,
  }))
}

export default async function KnowledgeBaseDetailPage({ params, searchParams }: PageProps) {
  const { id } = await params
  const filters = await searchParams

  const [document, versions, adjacent] = await Promise.all([
    getDocument(id),
    getVersions(id),
    getAdjacentDocuments(id, filters),
  ])

  if (!document) {
    notFound()
  }

  const filterQs = new URLSearchParams()
  if (filters.category) filterQs.set('category', filters.category)
  if (filters.subcategory) filterQs.set('subcategory', filters.subcategory)
  if (filters.indexed) filterQs.set('indexed', filters.indexed)
  if (filters.approved) filterQs.set('approved', filters.approved)
  if (filters.search) filterQs.set('search', filters.search)
  if (filters.abroge && filters.abroge !== 'all') filterQs.set('abroge', filters.abroge)
  if (filters.page && filters.page !== '1') filterQs.set('page', filters.page)
  const qs = filterQs.toString()
  const backUrl = `/super-admin/knowledge-base${qs ? `?${qs}` : ''}`

  return (
    <div className="-m-6">
      <KnowledgeBaseDetail
        document={document}
        versions={versions}
        prevDoc={adjacent?.prevDoc ?? null}
        nextDoc={adjacent?.nextDoc ?? null}
        backUrl={backUrl}
        filterQs={qs}
      />
    </div>
  )
}
