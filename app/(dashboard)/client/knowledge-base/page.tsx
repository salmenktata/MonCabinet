import { Metadata } from 'next'
import { Suspense } from 'react'
import { KnowledgeBaseBrowser } from '@/components/client/kb-browser/KnowledgeBaseBrowser'
import { Skeleton } from '@/components/ui/skeleton'

export const metadata: Metadata = {
  title: 'Base de Connaissances | Qadhya',
  description: 'Explorez la base de connaissances juridique tunisienne avec recherche sémantique et filtres avancés',
}

function KBLandingSkeleton() {
  return (
    <div className="container mx-auto space-y-10 py-8">
      <div className="text-center space-y-4">
        <Skeleton className="h-6 w-48 mx-auto rounded-full" />
        <Skeleton className="h-10 w-80 mx-auto" />
        <Skeleton className="h-12 max-w-2xl mx-auto rounded-lg" />
        <div className="flex justify-center gap-2 flex-wrap">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-7 w-32 rounded-full" />
          ))}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 max-w-2xl mx-auto pt-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-lg" />
          ))}
        </div>
      </div>
    </div>
  )
}

export default function KnowledgeBasePage() {
  return (
    <Suspense fallback={<KBLandingSkeleton />}>
      <KnowledgeBaseBrowser />
    </Suspense>
  )
}
