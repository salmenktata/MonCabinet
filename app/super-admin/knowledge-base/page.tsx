import { Suspense } from 'react'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { query } from '@/lib/db/postgres'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Icons } from '@/lib/icons'
import { getCategoryLabel } from '@/lib/knowledge-base/categories'

// Dynamic imports pour réduire le bundle initial
const KnowledgeBaseUpload = dynamic(
  () => import('@/components/super-admin/knowledge-base/KnowledgeBaseUpload').then(m => ({ default: m.KnowledgeBaseUpload })),
  { loading: () => <div className="h-32 bg-slate-800 animate-pulse rounded-lg" /> }
)

const KnowledgeBaseList = dynamic(
  () => import('@/components/super-admin/knowledge-base/KnowledgeBaseList').then(m => ({ default: m.KnowledgeBaseList })),
  { loading: () => <div className="h-64 bg-slate-800 animate-pulse rounded-lg" /> }
)

interface PageProps {
  searchParams: Promise<{
    category?: string
    subcategory?: string
    indexed?: string
    search?: string
    page?: string
  }>
}

async function KnowledgeBaseStats() {
  const result = await query(`
    SELECT
      COUNT(*) FILTER (WHERE is_active = TRUE) as total_docs,
      COUNT(*) FILTER (WHERE is_indexed = TRUE AND is_active = TRUE) as indexed_docs,
      (SELECT COUNT(*) FROM knowledge_base_chunks kbc
       JOIN knowledge_base kb ON kbc.knowledge_base_id = kb.id
       WHERE kb.is_active = TRUE) as total_chunks
    FROM knowledge_base
  `)
  const stats = result.rows[0]

  // Répartition par catégorie
  const categoryResult = await query(`
    SELECT category, COUNT(*) as count
    FROM knowledge_base
    WHERE is_active = TRUE
    GROUP BY category
    ORDER BY count DESC
  `)

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
              <p className="text-2xl font-bold text-green-500">{stats.indexed_docs}</p>
              <p className="text-sm text-slate-400">Indexés</p>
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

      <Card className="bg-slate-800 border-slate-700">
        <CardContent className="pt-6">
          <div className="flex flex-wrap gap-2">
            {categoryResult.rows.map((cat: { category: string; count: string }) => (
              <Badge key={cat.category} variant="secondary" className="bg-slate-700 text-slate-300">
                {getCategoryLabel(cat.category, 'fr')}: {cat.count}
              </Badge>
            ))}
          </div>
          <p className="text-sm text-slate-400 mt-2">Par catégorie</p>
        </CardContent>
      </Card>
    </div>
  )
}

// Composant de filtres
function FiltersForm({
  category,
  subcategory,
  indexed,
  search,
}: {
  category: string
  subcategory: string
  indexed: string
  search: string
}) {
  return (
    <Card className="bg-slate-800 border-slate-700">
      <CardContent className="pt-6">
        <form className="flex flex-wrap items-end gap-4">
          {/* Recherche */}
          <div className="flex-1 min-w-[200px]">
            <label className="text-sm text-slate-400 mb-1 block">Recherche</label>
            <div className="relative">
              <Icons.search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                name="search"
                defaultValue={search}
                placeholder="Rechercher..."
                className="pl-9 bg-slate-700 border-slate-600 text-white"
              />
            </div>
          </div>

          {/* Catégorie */}
          <div className="w-48">
            <label htmlFor="filter-category" className="text-sm text-slate-400 mb-1 block">Catégorie</label>
            <select
              id="filter-category"
              name="category"
              defaultValue={category}
              className="w-full h-10 px-3 rounded-md bg-slate-700 border border-slate-600 text-white text-sm"
            >
              <option value="all">Toutes</option>
              <option value="legislation">Législation</option>
              <option value="jurisprudence">Jurisprudence</option>
              <option value="doctrine">Doctrine</option>
              <option value="modeles">Modèles</option>
              <option value="procedures">Procédures</option>
              <option value="jort">JORT</option>
              <option value="formulaires">Formulaires</option>
              <option value="code">Code (ancien)</option>
              <option value="modele">Modèle (ancien)</option>
              <option value="autre">Autre</option>
            </select>
          </div>

          {/* Statut indexation */}
          <div className="w-40">
            <label htmlFor="filter-indexed" className="text-sm text-slate-400 mb-1 block">Indexation</label>
            <select
              id="filter-indexed"
              name="indexed"
              defaultValue={indexed}
              className="w-full h-10 px-3 rounded-md bg-slate-700 border border-slate-600 text-white text-sm"
            >
              <option value="all">Tous</option>
              <option value="true">Indexés</option>
              <option value="false">Non indexés</option>
            </select>
          </div>

          {/* Boutons */}
          <Button type="submit" className="bg-blue-600 hover:bg-blue-700">
            <Icons.search className="h-4 w-4 mr-2" />
            Filtrer
          </Button>

          <Link href="/super-admin/knowledge-base">
            <Button type="button" variant="ghost" className="text-slate-400">
              Réinitialiser
            </Button>
          </Link>
        </form>
      </CardContent>
    </Card>
  )
}

export default async function KnowledgeBasePage({ searchParams }: PageProps) {
  const params = await searchParams
  const category = params.category || 'all'
  const subcategory = params.subcategory || ''
  const indexed = params.indexed || 'all'
  const search = params.search || ''
  const page = parseInt(params.page || '1')
  const limit = 20
  const offset = (page - 1) * limit

  // Construire la requête avec filtres
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

  if (search) {
    whereClause += ` AND (kb.title ILIKE $${paramIndex} OR kb.description ILIKE $${paramIndex})`
    queryParams.push(`%${search}%`)
    paramIndex++
  }

  // Compter le total
  const countResult = await query(
    `SELECT COUNT(*) as count FROM knowledge_base kb ${whereClause}`,
    queryParams
  )
  const total = parseInt(countResult.rows[0]?.count || '0')

  // Récupérer les documents avec les nouveaux champs
  const docsResult = await query(
    `SELECT
      kb.id, kb.title, kb.description, kb.category, kb.subcategory,
      kb.language, kb.tags, kb.version,
      kb.is_indexed,
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

  const totalPages = Math.ceil(total / limit)

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white">Base de Connaissances</h2>
          <p className="text-slate-400">Gérer les documents juridiques pour l'IA</p>
        </div>
      </div>

      {/* Stats */}
      <Suspense fallback={<div className="h-24 bg-slate-800 animate-pulse rounded-lg" />}>
        <KnowledgeBaseStats />
      </Suspense>

      {/* Upload */}
      <KnowledgeBaseUpload />

      {/* Filtres */}
      <FiltersForm
        category={category}
        subcategory={subcategory}
        indexed={indexed}
        search={search}
      />

      {/* Liste des documents */}
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
            search={search}
          />
        </CardContent>
      </Card>
    </div>
  )
}
