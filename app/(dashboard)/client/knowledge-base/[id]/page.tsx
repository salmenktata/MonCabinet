import { cache } from 'react'
import { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import { Suspense } from 'react'
import { getSession } from '@/lib/auth/session'
import { query } from '@/lib/db/postgres'
import { DocumentDetailPage } from '@/components/client/kb-browser/DocumentDetailPage'
import { Skeleton } from '@/components/ui/skeleton'
import { getCategoryLabel } from '@/components/client/kb-browser/kb-browser-utils'
import type { SearchResultItem } from '@/components/client/kb-browser/DocumentExplorer'

interface PageProps {
  params: Promise<{ id: string }>
}

interface FullTextChunk {
  index: number
  content: string
  metadata: Record<string, unknown>
}

/**
 * Fetches all document data server-side (metadata, structured metadata, chunks, relations).
 * Uses React cache() to deduplicate between generateMetadata and the page component
 * within the same request.
 */
const fetchAllDocumentData = cache(async (id: string) => {
  const [metaResult, structuredMetaResult, chunksResult, relationsResult] = await Promise.all([
    // 1. Base metadata
    query<{
      id: string
      title: string
      category: string
      doc_type: string | null
      norm_level: string | null
      updated_at: string
      metadata: Record<string, unknown> | null
    }>(
      `SELECT id, title, category, doc_type, norm_level::text AS norm_level, updated_at, metadata
       FROM knowledge_base
       WHERE id = $1 AND is_indexed = true AND is_active = true`,
      [id]
    ),

    // 2. Structured metadata (tribunal, chambre, citations count)
    query<{
      tribunal_code: string | null
      tribunal_label_ar: string | null
      tribunal_label_fr: string | null
      chambre_code: string | null
      chambre_label_ar: string | null
      chambre_label_fr: string | null
      decision_date: string | null
      decision_number: string | null
      legal_basis: string[] | null
      extraction_confidence: number | null
      cites_count: string
      cited_by_count: string
    }>(
      `SELECT
        meta.tribunal_code,
        trib_tax.label_ar AS tribunal_label_ar,
        trib_tax.label_fr AS tribunal_label_fr,
        meta.chambre_code,
        chambre_tax.label_ar AS chambre_label_ar,
        chambre_tax.label_fr AS chambre_label_fr,
        meta.decision_date,
        meta.decision_number,
        meta.legal_basis,
        meta.extraction_confidence,
        (SELECT COUNT(*) FROM kb_legal_relations WHERE source_kb_id = $1 AND validated = true)::text AS cites_count,
        (SELECT COUNT(*) FROM kb_legal_relations WHERE target_kb_id = $1 AND validated = true)::text AS cited_by_count
      FROM kb_structured_metadata meta
      LEFT JOIN legal_taxonomy trib_tax ON meta.tribunal_code = trib_tax.code
      LEFT JOIN legal_taxonomy chambre_tax ON meta.chambre_code = chambre_tax.code
      WHERE meta.knowledge_base_id = $1`,
      [id]
    ),

    // 3. Full text chunks
    query<{
      index: number
      content: string
      metadata: Record<string, unknown> | null
    }>(
      `SELECT chunk_index AS index, content, metadata
       FROM knowledge_base_chunks
       WHERE knowledge_base_id = $1
       ORDER BY chunk_index ASC`,
      [id]
    ),

    // 4. Legal relations (outgoing + incoming)
    query<{
      direction: string
      relation_type: string
      related_kb_id: string
      related_title: string
      related_category: string
      context: string | null
      confidence: number | null
    }>(
      `SELECT 'outgoing' AS direction, r.relation_type, r.target_kb_id AS related_kb_id,
              kb_t.title AS related_title, kb_t.category AS related_category, r.context, r.confidence
       FROM kb_legal_relations r
       JOIN knowledge_base kb_t ON r.target_kb_id = kb_t.id
       WHERE r.source_kb_id = $1 AND r.validated = true
       UNION ALL
       SELECT 'incoming' AS direction, r.relation_type, r.source_kb_id AS related_kb_id,
              kb_s.title AS related_title, kb_s.category AS related_category, r.context, r.confidence
       FROM kb_legal_relations r
       JOIN knowledge_base kb_s ON r.source_kb_id = kb_s.id
       WHERE r.target_kb_id = $1 AND r.validated = true
       ORDER BY confidence DESC NULLS LAST
       LIMIT 100`,
      [id]
    ),
  ])

  if (metaResult.rows.length === 0) return null

  const row = metaResult.rows[0]
  const sm = structuredMetaResult.rows[0]

  // Merge structured metadata over base metadata
  const enrichedMetadata: SearchResultItem['metadata'] = {
    ...(row.metadata || {}),
    ...(sm
      ? {
          tribunalCode: sm.tribunal_code,
          tribunalLabelAr: sm.tribunal_label_ar,
          tribunalLabelFr: sm.tribunal_label_fr,
          chambreCode: sm.chambre_code,
          chambreLabelAr: sm.chambre_label_ar,
          chambreLabelFr: sm.chambre_label_fr,
          decisionDate: sm.decision_date,
          decisionNumber: sm.decision_number,
          legalBasis: sm.legal_basis,
          extractionConfidence: sm.extraction_confidence,
          citesCount: parseInt(sm.cites_count || '0', 10),
          citedByCount: parseInt(sm.cited_by_count || '0', 10),
        }
      : {}),
  }

  const document: SearchResultItem = {
    kbId: row.id,
    title: row.title,
    category: row.category,
    docType: row.doc_type,
    normLevel: row.norm_level,
    updatedAt: row.updated_at,
    similarity: null,
    metadata: enrichedMetadata,
  }

  const chunks: FullTextChunk[] = chunksResult.rows.map((c) => ({
    index: c.index,
    content: c.content,
    metadata: c.metadata || {},
  }))

  // Parse relations
  const relations: NonNullable<SearchResultItem['relations']> = {
    cites: [],
    citedBy: [],
    supersedes: [],
    supersededBy: [],
    relatedCases: [],
  }
  for (const rel of relationsResult.rows) {
    const item = {
      relationType: rel.relation_type,
      relatedKbId: rel.related_kb_id,
      relatedTitle: rel.related_title,
      relatedCategory: rel.related_category,
      context: rel.context,
      confidence: rel.confidence,
    }
    if (rel.relation_type === 'cites' && rel.direction === 'outgoing') relations.cites!.push(item)
    else if (rel.relation_type === 'cites' && rel.direction === 'incoming') relations.citedBy!.push(item)
    else if (rel.relation_type === 'supersedes' && rel.direction === 'outgoing') relations.supersedes!.push(item)
    else if (rel.relation_type === 'supersedes' && rel.direction === 'incoming') relations.supersededBy!.push(item)
    else if (rel.relation_type === 'related_case') relations.relatedCases!.push(item)
  }

  return { document, chunks, relations }
})

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params
  const data = await fetchAllDocumentData(id)

  if (!data) {
    return { title: 'Document introuvable | Qadhya' }
  }

  const { document } = data
  const categoryLabel = getCategoryLabel(document.category)
  const description =
    (document.metadata?.summary as string | undefined) ||
    `Consulter ce document juridique tunisien — ${categoryLabel}`

  return {
    title: `${document.title} | Qadhya`,
    description: description.slice(0, 160),
    openGraph: {
      title: document.title,
      description: description.slice(0, 160),
      type: 'article',
    },
  }
}

function DocumentPageSkeleton() {
  return (
    <div className="container mx-auto max-w-5xl space-y-6 py-8">
      <div className="flex items-center gap-2">
        <Skeleton className="h-8 w-8 rounded" />
        <Skeleton className="h-4 w-48" />
      </div>
      <Skeleton className="h-8 w-3/4" />
      <div className="flex gap-2">
        <Skeleton className="h-6 w-20 rounded-full" />
        <Skeleton className="h-6 w-24 rounded-full" />
      </div>
      <Skeleton className="h-10 w-full rounded-lg" />
      <Skeleton className="h-64 w-full rounded-lg" />
    </div>
  )
}

export default async function DocumentDetailRoute({ params }: PageProps) {
  const session = await getSession()
  if (!session?.user) {
    redirect('/auth/signin')
  }

  const { id } = await params

  const data = await fetchAllDocumentData(id)
  if (!data) {
    notFound()
  }

  const { document, chunks, relations } = data

  return (
    <Suspense fallback={<DocumentPageSkeleton />}>
      <DocumentDetailPage
        documentId={id}
        initialDocument={document}
        initialChunks={chunks}
        initialRelations={relations}
      />
    </Suspense>
  )
}
