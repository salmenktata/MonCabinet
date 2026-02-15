import type { ActionType } from '@/components/qadhya-ia/ActionButtons'

export interface ModeConfig {
  icon: 'messageSquare' | 'edit' | 'scale'
  accentColor: 'blue' | 'amber' | 'emerald'
  iconBgClass: string
  iconTextClass: string
  badgeClass: string
  gradientClass: string
  ringClass: string
  translationKey: 'chat' | 'structure' | 'consult'
}

export const MODE_CONFIGS: Record<ActionType, ModeConfig> = {
  chat: {
    icon: 'messageSquare',
    accentColor: 'blue',
    iconBgClass: 'bg-blue-100 dark:bg-blue-900/30',
    iconTextClass: 'text-blue-600 dark:text-blue-400',
    badgeClass: 'border-blue-200 text-blue-700 dark:border-blue-800 dark:text-blue-300',
    gradientClass: 'from-background via-background to-blue-50/30 dark:to-blue-950/20',
    ringClass: 'focus-visible:ring-blue-500',
    translationKey: 'chat',
  },
  structure: {
    icon: 'edit',
    accentColor: 'amber',
    iconBgClass: 'bg-amber-100 dark:bg-amber-900/30',
    iconTextClass: 'text-amber-600 dark:text-amber-400',
    badgeClass: 'border-amber-200 text-amber-700 dark:border-amber-800 dark:text-amber-300',
    gradientClass: 'from-background via-background to-amber-50/30 dark:to-amber-950/20',
    ringClass: 'focus-visible:ring-amber-500',
    translationKey: 'structure',
  },
  consult: {
    icon: 'scale',
    accentColor: 'emerald',
    iconBgClass: 'bg-emerald-100 dark:bg-emerald-900/30',
    iconTextClass: 'text-emerald-600 dark:text-emerald-400',
    badgeClass: 'border-emerald-200 text-emerald-700 dark:border-emerald-800 dark:text-emerald-300',
    gradientClass: 'from-background via-background to-emerald-50/30 dark:to-emerald-950/20',
    ringClass: 'focus-visible:ring-emerald-500',
    translationKey: 'consult',
  },
}
