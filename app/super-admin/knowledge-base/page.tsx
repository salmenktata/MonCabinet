import { Suspense } from 'react'
import Link from 'next/link'
import nextDynamic from 'next/dynamic'
import { query } from '@/lib/db/postgres'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Icons } from '@/lib/icons'
import { getCategoriesForContext } from '@/lib/categories/legal-categories'

export const dynamic = 'force-dynamic'

const KnowledgeBaseUploadDialog = nextDynamic(
  () => import('@/components/super-admin/knowledge-base/KnowledgeBaseUploadDialog').then(m => ({ default: m.KnowledgeBaseUploadDialog })),
  { loading: () => <Button disabled className="bg-blue-600"><Icons.plus className="h-4 w-4 mr-2" />Ajouter document</Button> }
)

const KnowledgeBaseList = nextDynamic(
  () => import('@/components/super-admin/knowledge-base/KnowledgeBaseList').then(m => ({ default: m.KnowledgeBaseList })),
  { loading: () => <div className="h-64 bg-slate-800 animate-pulse rounded-lg" /> }
)

const KnowledgeBaseTreeView = nextDynamic(
  () => import('@/components/super-admin/knowledge-base/KnowledgeBaseTreeView').then(m => ({ default: m.KnowledgeBaseTreeView })),
  { loading: () => <div className="h-64 bg-slate-800 animate-pulse rounded-lg" /> }
)

const KnowledgeBaseViewToggle = nextDynamic(
  () => import('@/components/super-admin/knowledge-base/KnowledgeBaseViewToggle').then(m => ({ default: m.KnowledgeBaseViewToggle })),
  { loading: () => <div className="h-9 w-40 bg-slate-800 animate-pulse rounded-lg" /> }
)

interface PageProps {
  searchParams: Promise<{
    category?: string
    subcategory?: string
    indexed?: string
    approved?: string
    search?: string
    page?: string
    view?: string
    abroge?: string
  }>
}

async function KnowledgeBaseStats() {
  const result = await query(`
    SELECT
      COUNT(*) FILTER (WHERE is_active = TRUE) as total_docs,
      COUNT(*) FILTER (WHERE is_indexed = TRUE AND is_active = TRUE) as indexed_docs,
      COUNT(*) FILTER (WHERE is_approved = TRUE AND is_active = TRUE) as approved_docs,
      (SELECT COUNT(*) FROM knowledge_base_chunks kbc
       JOIN knowledge_base kb ON kbc.knowledge_base_id = kb.id
       WHERE kb.is_active = TRUE) as total_chunks
    FROM knowledge_base
  `)
  const stats = result.rows[0]

  const indexedPercentage = stats.total_docs > 0
    ? ((parseInt(stats.indexed_docs, 10) / parseInt(stats.total_docs, 10)) * 100).toFixed(1)
    : '0'

  const approvedPercentage = stats.total_docs > 0
    ? ((parseInt(stats.approved_docs, 10) / parseInt(stats.total_docs, 10)) * 100).toFixed(1)
    : '0'

  return (
    <div className="grid gap-4 md:grid-cols-4">
      <Card className="bg-slate-800 border-slate-700">
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-2xl font-bold text-white">{stats.total_docs}</p>
              <p className="text-sm text-slate-400">Total documents</p>
            </div>
            <Icons.bookOpen className="h-8 w-8 text-blue-500/20" />
          </div>
        </CardContent>
      </Card>

      <Card className="bg-slate-800 border-slate-700">
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-2xl font-bold text-emerald-500">{stats.approved_docs}</p>
              <p className="text-sm text-slate-400">Approuvés ({approvedPercentage}%)</p>
            </div>
            <Icons.shield className="h-8 w-8 text-emerald-500/20" />
          </div>
        </CardContent>
      </Card>

      <Card className="bg-slate-800 border-slate-700">
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-2xl font-bold text-green-500">{stats.indexed_docs}</p>
              <p className="text-sm text-slate-400">Indexés ({indexedPercentage}%)</p>
            </div>
            <Icons.checkCircle className="h-8 w-8 text-green-500/20" />
          </div>
        </CardContent>
      </Card>

      <Card className="bg-slate-800 border-slate-700">
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-2xl font-bold text-purple-500">{stats.total_chunks}</p>
              <p className="text-sm text-slate-400">Chunks vectoriels</p>
            </div>
            <Icons.layers className="h-8 w-8 text-purple-500/20" />
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

export default async function KnowledgeBasePage({ searchParams }: PageProps) {
  const params = await searchParams
  const category = params.category || 'all'
  const subcategory = params.subcategory || ''
  const indexed = params.indexed || 'all'
  const approved = params.approved || 'all'
  const search = params.search || ''
  const abroge = params.abroge || 'all'
  const page = parseInt(params.page || '1', 10)
  const view = params.view || 'list'
  const limit = 20
  const offset = (page - 1) * limit

  const isTreeView = view === 'tree'

  let total = 0
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let docsResult: { rows: any[] } = { rows: [] }
  let totalPages = 0

  if (!isTreeView) {
    let whereClause = 'WHERE kb.is_active = TRUE'
    const queryParams: (string | number | boolean)[] = []
    let paramIndex = 1

    if (category !== 'all') {
      whereClause += ` AND kb.category = $${paramIndex}`
      queryParams.push(category)
      paramIndex++
    }

    if (subcategory) {
      whereClause += ` AND kb.subcategory = $${paramIndex}`
      queryParams.push(subcategory)
      paramIndex++
    }

    if (indexed !== 'all') {
      whereClause += ` AND kb.is_indexed = $${paramIndex}`
      queryParams.push(indexed === 'true')
      paramIndex++
    }

    if (approved !== 'all') {
      whereClause += ` AND kb.is_approved = $${paramIndex}`
      queryParams.push(approved === 'true')
      paramIndex++
    }

    if (abroge === 'true') {
      whereClause += ` AND kb.is_abroge = TRUE`
    } else if (abroge === 'suspected') {
      whereClause += ` AND kb.abroge_suspected = TRUE AND (kb.is_abroge IS NULL OR kb.is_abroge = FALSE)`
    }

    if (search) {
      whereClause += ` AND (kb.title ILIKE $${paramIndex} OR kb.description ILIKE $${paramIndex})`
      queryParams.push(`%${search}%`)
      paramIndex++
    }

    const countResult = await query(
      `SELECT COUNT(*) as count FROM knowledge_base kb ${whereClause}`,
      queryParams
    )
    total = parseInt(countResult.rows[0]?.count || '0', 10)

    docsResult = await query(
      `SELECT
        kb.id, kb.title, kb.description, kb.category, kb.subcategory,
        kb.language, kb.tags, kb.version,
        kb.is_indexed, kb.is_approved,
        kb.is_abroge, kb.abroge_suspected, kb.abroge_confidence,
        kb.quality_score, kb.quality_requires_review,
        kb.doc_type, kb.norm_level,
        (SELECT COUNT(*) FROM knowledge_base_chunks WHERE knowledge_base_id = kb.id) as chunk_count,
        kb.source_file as file_name, kb.source_file as file_type,
        kb.created_at, kb.updated_at,
        u.email as uploaded_by_email
      FROM knowledge_base kb
      LEFT JOIN users u ON kb.uploaded_by = u.id
      ${whereClause}
      ORDER BY kb.created_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      [...queryParams, limit, offset]
    )

    totalPages = Math.ceil(total / limit)
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Base de Connaissances</h1>
          <p className="text-slate-400 mt-1">Gérer les documents juridiques pour l&apos;IA</p>
        </div>
        <div className="flex items-center gap-2">
          <Suspense fallback={<Button disabled className="bg-blue-600"><Icons.plus className="h-4 w-4 mr-2" />Ajouter</Button>}>
            <KnowledgeBaseUploadDialog />
          </Suspense>
          <Suspense fallback={<div className="h-9 w-40 bg-slate-800 animate-pulse rounded-lg" />}>
            <KnowledgeBaseViewToggle />
          </Suspense>
        </div>
      </div>

      {/* Stats */}
      <Suspense fallback={<div className="h-24 bg-slate-800 animate-pulse rounded-lg" />}>
        <KnowledgeBaseStats />
      </Suspense>

      {isTreeView ? (
        <KnowledgeBaseTreeView />
      ) : (
        <>
          {/* Filtres */}
          <Card className="bg-slate-800 border-slate-700">
            <CardContent className="pt-4 pb-4">
              <form className="flex flex-wrap items-center gap-3">
                <div className="flex-1 min-w-[250px]">
                  <div className="relative">
                    <Icons.search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <Input
                      name="search"
                      defaultValue={search}
                      placeholder="Rechercher un document..."
                      className="pl-9 bg-slate-700 border-slate-600 text-white h-9"
                    />
                  </div>
                </div>

                <select
                  name="category"
                  defaultValue={category}
                  className="h-9 px-3 rounded-md bg-slate-700 border border-slate-600 text-white text-sm min-w-[150px]"
                >
                  {getCategoriesForContext('knowledge_base', 'fr', true).map((cat) => (
                    <option key={cat.value} value={cat.value}>
                      {cat.label}
                    </option>
                  ))}
                </select>

                <select
                  name="indexed"
                  defaultValue={indexed}
                  className="h-9 px-3 rounded-md bg-slate-700 border border-slate-600 text-white text-sm min-w-[130px]"
                >
                  <option value="all">Indexation</option>
                  <option value="true">Indexés</option>
                  <option value="false">Non indexés</option>
                </select>

                <select
                  name="approved"
                  defaultValue={approved}
                  className="h-9 px-3 rounded-md bg-slate-700 border border-slate-600 text-white text-sm min-w-[130px]"
                >
                  <option value="all">Approbation</option>
                  <option value="true">Approuvés</option>
                  <option value="false">En attente</option>
                </select>

                <select
                  name="abroge"
                  defaultValue={abroge}
                  className="h-9 px-3 rounded-md bg-slate-700 border border-slate-600 text-white text-sm min-w-[130px]"
                >
                  <option value="all">Abrogation</option>
                  <option value="true">Abrogés</option>
                  <option value="suspected">Suspectés</option>
                </select>

                <Button type="submit" size="sm" className="bg-blue-600 hover:bg-blue-700 h-9">
                  <Icons.search className="h-4 w-4 mr-2" />
                  Filtrer
                </Button>

                <Link href="/super-admin/knowledge-base">
                  <Button type="button" size="sm" variant="ghost" className="text-slate-400 h-9">
                    Réinitialiser
                  </Button>
                </Link>
              </form>
            </CardContent>
          </Card>

          {/* Liste */}
          <Card className="bg-slate-800 border-slate-700">
            <CardHeader>
              <CardTitle className="text-white">Documents ({total})</CardTitle>
              <CardDescription className="text-slate-400">
                Page {page} sur {totalPages || 1}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <KnowledgeBaseList
                documents={docsResult.rows}
                currentPage={page}
                totalPages={totalPages}
                category={category}
                subcategory={subcategory}
                indexed={indexed}
                approved={approved}
                search={search}
                abroge={abroge}
              />
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
