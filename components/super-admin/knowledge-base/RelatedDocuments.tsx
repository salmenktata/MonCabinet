'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Icons } from '@/lib/icons'
import { CategoryBadge } from './CategorySelector'

interface RelatedDoc {
  id: string
  title: string
  description: string | null
  category: string
  subcategory: string | null
  language: 'ar' | 'fr'
  similarity: number
  chunkCount: number
  tags: string[]
}

interface RelatedDocumentsProps {
  documentId: string
  limit?: number
  threshold?: number
}

export function RelatedDocuments({
  documentId,
  limit = 5,
  threshold = 0.6,
}: RelatedDocumentsProps) {
  const [documents, setDocuments] = useState<RelatedDoc[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchRelated() {
      setLoading(true)
      setError(null)

      try {
        const res = await fetch(
          `/api/admin/knowledge-base/${documentId}/related?limit=${limit}&threshold=${threshold}`
        )

        if (!res.ok) {
          throw new Error('Erreur lors de la récupération')
        }

        const data = await res.json()
        setDocuments(data.related || [])
      } catch (err) {
        console.error('Erreur fetch related documents:', err)
        setError('Impossible de charger les documents similaires')
      } finally {
        setLoading(false)
      }
    }

    fetchRelated()
  }, [documentId, limit, threshold])

  // Couleur du badge de similarité
  function getSimilarityColor(similarity: number): string {
    if (similarity >= 80) return 'bg-green-500/20 text-green-300 border-green-500/30'
    if (similarity >= 70) return 'bg-blue-500/20 text-blue-300 border-blue-500/30'
    if (similarity >= 60) return 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30'
    return 'bg-slate-500/20 text-slate-300 border-slate-500/30'
  }

  return (
    <Card className="bg-slate-800 border-slate-700">
      <CardHeader className="pb-3">
        <CardTitle className="text-white text-base flex items-center gap-2">
          <Icons.link className="h-4 w-4 text-slate-400" />
          Documents similaires
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-center gap-2">
                <Skeleton className="h-4 w-4 rounded bg-slate-700" />
                <Skeleton className="h-4 flex-1 bg-slate-700" />
                <Skeleton className="h-5 w-12 bg-slate-700" />
              </div>
            ))}
          </div>
        ) : error ? (
          <p className="text-sm text-slate-400">{error}</p>
        ) : documents.length === 0 ? (
          <p className="text-sm text-slate-400">Aucun document similaire trouvé</p>
        ) : (
          <ul className="space-y-3">
            {documents.map((doc) => (
              <li key={doc.id}>
                <Link
                  href={`/super-admin/knowledge-base/${doc.id}`}
                  className="group flex items-start gap-2 p-2 -mx-2 rounded-md hover:bg-slate-700/50 transition"
                >
                  <Icons.fileText className="h-4 w-4 mt-0.5 text-slate-400 group-hover:text-blue-400 transition flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-slate-200 group-hover:text-white transition line-clamp-1">
                      {doc.title}
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                      <CategoryBadge
                        category={doc.category}
                        subcategory={doc.subcategory}
                        size="sm"
                      />
                    </div>
                  </div>
                  <Badge
                    variant="outline"
                    className={`text-xs flex-shrink-0 ${getSimilarityColor(doc.similarity)}`}
                  >
                    {doc.similarity}%
                  </Badge>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
