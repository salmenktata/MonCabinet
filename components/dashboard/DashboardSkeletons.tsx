import { Skeleton } from '@/components/ui/skeleton'

export function StatCardSkeleton() {
  return (
    <div className="rounded-lg border bg-card p-6 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-8 w-16" />
          <Skeleton className="h-3 w-24" />
        </div>
        <Skeleton className="h-12 w-12 rounded-full" />
      </div>
    </div>
  )
}

export function StatsGridSkeleton() {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      <StatCardSkeleton />
      <StatCardSkeleton />
      <StatCardSkeleton />
      <StatCardSkeleton />
    </div>
  )
}

export function WidgetSkeleton() {
  return (
    <div className="rounded-lg border bg-card p-6 shadow-sm">
      <Skeleton className="h-6 w-40 mb-4" />
      <div className="space-y-3">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    </div>
  )
}

export function ChartWidgetSkeleton() {
  return (
    <div className="rounded-lg border bg-card p-6 shadow-sm">
      <Skeleton className="h-6 w-32 mb-4" />
      <div className="grid grid-cols-2 gap-4 mb-6">
        <Skeleton className="h-20 rounded-lg" />
        <Skeleton className="h-20 rounded-lg" />
        <Skeleton className="h-20 rounded-lg" />
        <Skeleton className="h-20 rounded-lg" />
      </div>
      <Skeleton className="h-4 w-28 mb-2" />
      <Skeleton className="h-2 w-full mb-6" />
      <Skeleton className="h-24 w-full" />
    </div>
  )
}

export function ActivitySkeleton() {
  return (
    <div className="rounded-lg border bg-card p-6 shadow-sm">
      <Skeleton className="h-6 w-36 mb-4" />
      <div className="space-y-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="flex items-start gap-3">
            <Skeleton className="h-10 w-10 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export function TimeTrackingSkeleton() {
  return (
    <div className="rounded-lg border bg-card p-6 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-8 w-24 rounded-full" />
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <Skeleton className="h-24 rounded-lg" />
        <Skeleton className="h-24 rounded-lg" />
        <Skeleton className="h-24 rounded-lg" />
      </div>
    </div>
  )
}
