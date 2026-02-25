import { Skeleton } from '@/components/ui/skeleton'

export function StatCardSkeleton() {
  return (
    <div className="rounded-xl border bg-gradient-to-br from-muted/60 to-muted/20 border-border/50 p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 space-y-2">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-9 w-14" />
          <Skeleton className="h-3 w-24" />
        </div>
        <div className="flex flex-col items-end gap-3">
          <Skeleton className="h-9 w-9 rounded-lg" />
          <Skeleton className="h-6 w-10" />
        </div>
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

export function QuickActionsBarSkeleton() {
  return (
    <div className="flex items-center gap-2">
      {[1, 2, 3, 4].map((i) => (
        <Skeleton key={i} className="h-8 w-24 rounded-md" />
      ))}
    </div>
  )
}

export function WidgetSkeleton() {
  return (
    <div className="rounded-xl border bg-card/50 p-4 sm:p-5">
      <Skeleton className="h-5 w-40 mb-4" />
      <div className="space-y-3">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
      </div>
    </div>
  )
}

export function ChartWidgetSkeleton() {
  return (
    <div className="rounded-xl border bg-card/50 p-4 sm:p-5">
      <Skeleton className="h-5 w-32 mb-4" />
      <div className="grid grid-cols-2 gap-3 mb-5">
        <Skeleton className="h-16 rounded-lg" />
        <Skeleton className="h-16 rounded-lg" />
        <Skeleton className="h-16 rounded-lg" />
        <Skeleton className="h-16 rounded-lg" />
      </div>
      <Skeleton className="h-3 w-28 mb-2" />
      <Skeleton className="h-2 w-full mb-5" />
      <Skeleton className="h-20 w-full" />
    </div>
  )
}

export function ActivitySkeleton() {
  return (
    <div className="rounded-xl border bg-card/50 p-4 sm:p-5">
      <Skeleton className="h-5 w-36 mb-4" />
      <div className="space-y-3">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} className="flex items-start gap-3">
            <Skeleton className="h-2 w-2 rounded-full mt-2" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-3.5 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
            </div>
            <Skeleton className="h-3 w-10 shrink-0" />
          </div>
        ))}
      </div>
    </div>
  )
}

export function UrgentActionsSkeleton() {
  return (
    <div className="rounded-xl border bg-card/50">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/50">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-6 w-16" />
      </div>
      <div className="divide-y divide-border/30">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="flex items-center gap-3 px-4 py-2.5 border-l-2 border-l-muted">
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-3.5 w-2/3" />
              <Skeleton className="h-3 w-1/2" />
            </div>
            <Skeleton className="h-5 w-14 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  )
}

export function CalendarWidgetSkeleton() {
  return (
    <div className="rounded-xl border bg-card/50 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <div className="flex items-center gap-3">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-4 w-20 rounded-full" />
        </div>
        <div className="flex items-center gap-1">
          <Skeleton className="h-6 w-20 rounded" />
          <Skeleton className="h-7 w-7 rounded" />
          <Skeleton className="h-7 w-7 rounded" />
        </div>
      </div>
      {/* Grille */}
      <div className="p-3">
        <div className="grid grid-cols-7 mb-1">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="flex justify-center py-1">
              <Skeleton className="h-3 w-5" />
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-0.5">
          {Array.from({ length: 35 }).map((_, i) => (
            <Skeleton key={i} className="h-[52px] rounded-md" />
          ))}
        </div>
      </div>
      {/* Légende */}
      <div className="border-t px-4 py-2 flex items-center gap-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-1">
            <Skeleton className="h-2 w-2 rounded-full" />
            <Skeleton className="h-3 w-10" />
          </div>
        ))}
      </div>
    </div>
  )
}

export function TimeTrackingSkeleton() {
  return (
    <div className="rounded-xl border bg-card/50 p-4 sm:p-5">
      <div className="flex items-center justify-between mb-4">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-8 w-24 rounded-full" />
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <Skeleton className="h-20 rounded-lg" />
        <Skeleton className="h-20 rounded-lg" />
        <Skeleton className="h-20 rounded-lg" />
      </div>
    </div>
  )
}
