'use client'

import { cn } from '@/lib/utils'
import { Icons } from '@/lib/icons'
import type { LegalStance } from '@/lib/ai/legal-reasoning-prompts'

interface StanceSelectorProps {
  stance: LegalStance
  onChange: (stance: LegalStance) => void
  disabled?: boolean
}

const STANCE_OPTIONS: {
  value: LegalStance
  labelFr: string
  labelAr: string
  icon: keyof typeof Icons
  activeClass: string
  hoverClass: string
}[] = [
  {
    value: 'defense',
    labelFr: 'Défense',
    labelAr: 'دفاع',
    icon: 'shield',
    activeClass: 'bg-blue-50 border-blue-400 text-blue-700 dark:bg-blue-950/40 dark:border-blue-500 dark:text-blue-300',
    hoverClass: 'hover:bg-blue-50/60 hover:border-blue-300 dark:hover:bg-blue-950/20 dark:hover:border-blue-600',
  },
  {
    value: 'neutral',
    labelFr: 'Neutre',
    labelAr: 'محايد',
    icon: 'scale',
    activeClass: 'bg-gray-100 border-gray-400 text-gray-700 dark:bg-gray-800/60 dark:border-gray-500 dark:text-gray-200',
    hoverClass: 'hover:bg-gray-50 hover:border-gray-300 dark:hover:bg-gray-800/30 dark:hover:border-gray-600',
  },
  {
    value: 'attack',
    labelFr: 'Attaque',
    labelAr: 'هجوم',
    icon: 'target',
    activeClass: 'bg-red-50 border-red-400 text-red-700 dark:bg-red-950/40 dark:border-red-500 dark:text-red-300',
    hoverClass: 'hover:bg-red-50/60 hover:border-red-300 dark:hover:bg-red-950/20 dark:hover:border-red-600',
  },
]

export function StanceSelector({ stance, onChange, disabled = false }: StanceSelectorProps) {
  return (
    <div className="flex items-center gap-1.5 px-3 py-1.5">
      <span className="text-[10px] text-muted-foreground uppercase tracking-wider mr-1">
        Posture
      </span>
      <div className="flex gap-1">
        {STANCE_OPTIONS.map((option) => {
          const Icon = Icons[option.icon]
          const isActive = stance === option.value
          return (
            <button
              key={option.value}
              type="button"
              disabled={disabled}
              onClick={() => onChange(option.value)}
              className={cn(
                'flex items-center gap-1 px-2 py-1 rounded-full border text-[11px] font-medium transition-all duration-150',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                'disabled:opacity-50 disabled:cursor-not-allowed',
                isActive
                  ? option.activeClass
                  : cn('border-border/50 text-muted-foreground', option.hoverClass)
              )}
              title={`${option.labelAr} — ${option.labelFr}`}
            >
              <Icon className="h-3 w-3 shrink-0" />
              <span>{option.labelFr}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
