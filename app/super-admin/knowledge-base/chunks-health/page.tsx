import { Suspense } from 'react'
import nextDynamic from 'next/dynamic'
import { Loader2 } from 'lucide-react'

export const dynamic = 'force-dynamic'

const ChunksHealthClient = nextDynamic(
  () => import('@/components/super-admin/knowledge-base/ChunksHealthClient').then(m => ({ default: m.ChunksHealthClient })),
  {
    loading: () => (
      <div className="flex h-96 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    ),
  }
)

export default function ChunksHealthPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-96">Chargement...</div>}>
      <ChunksHealthClient />
    </Suspense>
  )
}
