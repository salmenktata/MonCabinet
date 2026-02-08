'use client'

import { cn } from '@/lib/utils'
import { Icons } from '@/lib/icons'
import { Button } from '@/components/ui/button'

export type SourceType = 'all' | 'document' | 'jurisprudence' | 'knowledge_base'

interface SourceTypeFilterProps {
  activeFilter: SourceType
  onFilterChange: (filter: SourceType) => void
  counts: {
    all: number
    document: number
    jurisprudence: number
    knowledge_base: number
  }
}

export function SourceTypeFilter({
  activeFilter,
  onFilterChange,
  counts,
}: SourceTypeFilterProps) {
  const filters: { type: SourceType; label: string; icon: React.ReactNode }[] = [
    {
      type: 'all',
      label: 'Tous',
      icon: <Icons.layers className="h-4 w-4" />,
    },
    {
      type: 'document',
      label: 'Documents',
      icon: <Icons.fileText className="h-4 w-4" />,
    },
    {
      type: 'jurisprudence',
      label: 'Jurisprudence',
      icon: <Icons.scale className="h-4 w-4" />,
    },
    {
      type: 'knowledge_base',
      label: 'Base de connaissances',
      icon: <Icons.bookOpen className="h-4 w-4" />,
    },
  ]

  return (
    <div className="flex flex-wrap gap-2">
      {filters.map((filter) => {
        const count = counts[filter.type]
        const isActive = activeFilter === filter.type

        // Ne pas afficher le filtre si aucune source de ce type
        if (filter.type !== 'all' && count === 0) return null

        return (
          <Button
            key={filter.type}
            variant={isActive ? 'default' : 'outline'}
            size="sm"
            className={cn(
              'h-8 text-xs gap-1.5',
              isActive && 'shadow-sm'
            )}
            onClick={() => onFilterChange(filter.type)}
          >
            {filter.icon}
            <span>{filter.label}</span>
            <span
              className={cn(
                'ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium',
                isActive
                  ? 'bg-primary-foreground/20 text-primary-foreground'
                  : 'bg-muted text-muted-foreground'
              )}
            >
              {count}
            </span>
          </Button>
        )
      })}
    </div>
  )
}
