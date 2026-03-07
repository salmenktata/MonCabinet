import { Suspense } from 'react'
import { Skeleton } from '@/components/ui/skeleton'
import { AnalyticsClient } from './AnalyticsClient'

export const dynamic = 'force-dynamic'

export default function AnalyticsPage() {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <AnalyticsClient />
    </Suspense>
  )
}
