import { Metadata } from 'next'
import { Suspense } from 'react'
import { DocumentDetailPage } from '@/components/client/kb-browser/DocumentDetailPage'
import { Skeleton } from '@/components/ui/skeleton'

interface PageProps {
  params: Promise<{ id: string }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params
  return {
    title: `Document Juridique | Qadhya`,
    description: `Consulter le document juridique ${id} dans la base de connaissances Qadhya`,
  }
}

function DocumentPageSkeleton() {
  return (
    <div className="container mx-auto max-w-4xl space-y-6 py-6">
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
  const { id } = await params
  return (
    <Suspense fallback={<DocumentPageSkeleton />}>
      <DocumentDetailPage documentId={id} />
    </Suspense>
  )
}
