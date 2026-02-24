import { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import { Suspense } from 'react'
import { getSession } from '@/lib/auth/session'
import { query } from '@/lib/db/postgres'
import { DocumentDetailPage } from '@/components/client/kb-browser/DocumentDetailPage'
import { Skeleton } from '@/components/ui/skeleton'
import { getCategoryLabel } from '@/components/client/kb-browser/kb-browser-utils'

interface PageProps {
  params: Promise<{ id: string }>
}

async function fetchDocumentMeta(id: string) {
  try {
    const result = await query<{
      id: string
      title: string
      category: string
      metadata: Record<string, unknown> | null
    }>(
      `SELECT id, title, category, metadata
       FROM knowledge_base
       WHERE id = $1 AND is_indexed = true AND is_active = true`,
      [id]
    )
    return result.rows[0] ?? null
  } catch {
    return null
  }
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params
  const doc = await fetchDocumentMeta(id)

  if (!doc) {
    return { title: 'Document introuvable | Qadhya' }
  }

  const categoryLabel = getCategoryLabel(doc.category)
  const description = (doc.metadata?.summary as string | undefined)
    || `Consulter ce document juridique tunisien — ${categoryLabel}`

  return {
    title: `${doc.title} | Qadhya`,
    description: description.slice(0, 160),
    openGraph: {
      title: doc.title,
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

  const doc = await fetchDocumentMeta(id)
  if (!doc) {
    notFound()
  }

  return (
    <Suspense fallback={<DocumentPageSkeleton />}>
      <DocumentDetailPage documentId={id} />
    </Suspense>
  )
}
