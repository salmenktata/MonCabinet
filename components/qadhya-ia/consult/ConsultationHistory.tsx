'use client'

import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import { Plus, History, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ConsultationHistoryItem } from '@/app/actions/consultation'

interface ConsultationHistoryProps {
  items: ConsultationHistoryItem[]
  isLoading: boolean
  selectedId: string | null
  onSelect: (id: string) => void
  onNewConsultation: () => void
}

function groupByDate(
  items: ConsultationHistoryItem[],
  t: (key: string) => string
): { label: string; items: ConsultationHistoryItem[] }[] {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const yesterday = new Date(today.getTime() - 86400000)
  const weekAgo = new Date(today.getTime() - 7 * 86400000)

  const groups: Record<string, ConsultationHistoryItem[]> = {}
  const labels: Record<string, string> = {}

  for (const item of items) {
    const date = new Date(item.created_at)
    let key: string

    if (date >= today) {
      key = 'today'
      labels[key] = t('history.today')
    } else if (date >= yesterday) {
      key = 'yesterday'
      labels[key] = t('history.yesterday')
    } else if (date >= weekAgo) {
      key = 'thisWeek'
      labels[key] = t('history.thisWeek')
    } else {
      key = 'earlier'
      labels[key] = t('history.earlier')
    }

    if (!groups[key]) groups[key] = []
    groups[key].push(item)
  }

  const order = ['today', 'yesterday', 'thisWeek', 'earlier']
  return order
    .filter((key) => groups[key])
    .map((key) => ({ label: labels[key], items: groups[key] }))
}

function truncate(text: string, max: number) {
  if (text.length <= max) return text
  return text.slice(0, max).trim() + '...'
}

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMin = Math.floor(diffMs / 60000)

  if (diffMin < 1) return 'maintenant'
  if (diffMin < 60) return `${diffMin}min`
  const diffH = Math.floor(diffMin / 60)
  if (diffH < 24) return `${diffH}h`
  const diffD = Math.floor(diffH / 24)
  return `${diffD}j`
}

export default function ConsultationHistory({
  items,
  isLoading,
  selectedId,
  onSelect,
  onNewConsultation,
}: ConsultationHistoryProps) {
  const t = useTranslations('consultation')

  const grouped = groupByDate(items, t)

  return (
    <div className="flex h-full flex-col">
      <div className="border-b p-3">
        <Button
          onClick={onNewConsultation}
          className="w-full"
          size="sm"
        >
          <Plus className="mr-1.5 h-4 w-4" />
          {t('newConsultation')}
        </Button>
      </div>

      <ScrollArea className="flex-1">
        {isLoading ? (
          <div className="flex items-center justify-center p-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-8 text-center">
            <History className="h-10 w-10 text-muted-foreground/40 mb-3" />
            <p className="text-sm text-muted-foreground">{t('history.empty')}</p>
          </div>
        ) : (
          <div className="p-2">
            {grouped.map((group) => (
              <div key={group.label} className="mb-3">
                <p className="px-2 py-1 text-[11px] font-medium uppercase text-muted-foreground tracking-wider">
                  {group.label}
                </p>
                {group.items.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => onSelect(item.id)}
                    className={cn(
                      'w-full rounded-md px-2 py-2 text-left transition-colors',
                      'hover:bg-muted/80',
                      selectedId === item.id && 'bg-muted'
                    )}
                  >
                    <p className="text-sm font-medium truncate" dir="auto">
                      {truncate(item.question, 80)}
                    </p>
                    <div className="mt-1 flex items-center gap-2">
                      {item.domain && (
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                          {item.domain}
                        </Badge>
                      )}
                      <span className="text-[11px] text-muted-foreground">
                        {formatRelativeTime(item.created_at)}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  )
}
