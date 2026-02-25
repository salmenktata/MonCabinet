'use client'

import { useTranslations } from 'next-intl'
import { cn } from '@/lib/utils'
import { Icons } from '@/lib/icons'

export type ActionType = 'chat' | 'structure'

interface ActionButtonsProps {
  selected: ActionType
  onSelect: (action: ActionType) => void
  disabled?: boolean
}

export function ActionButtons({ selected, onSelect, disabled }: ActionButtonsProps) {
  const t = useTranslations('qadhyaIA.actions')

  const actions: Array<{
    type: ActionType
    label: string
    icon: keyof typeof Icons
  }> = [
    {
      type: 'chat',
      label: t('chat.label'),
      icon: 'messageSquare',
    },
    {
      type: 'structure',
      label: t('structure.label'),
      icon: 'edit',
    },
  ]

  return (
    <div className="flex items-center justify-center">
      <div className="inline-flex items-center gap-1 p-1 rounded-xl bg-muted/60 border border-border/40">
        {actions.map((action) => {
          const Icon = Icons[action.icon]
          const isSelected = selected === action.type

          return (
            <button
              key={action.type}
              disabled={disabled}
              onClick={() => onSelect(action.type)}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium',
                'transition-all duration-200 ease-out',
                'disabled:opacity-50 disabled:pointer-events-none',
                isSelected
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground hover:bg-background/50'
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              <span>{action.label}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
