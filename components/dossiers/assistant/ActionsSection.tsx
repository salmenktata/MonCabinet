'use client'

import { useTranslations } from 'next-intl'
import type { SuggestedAction } from '@/lib/ai/dossier-structuring-service'

interface ActionsSectionProps {
  actions: SuggestedAction[]
  onChange: (actions: SuggestedAction[]) => void
}

const PRIORITY_COLORS: Record<string, string> = {
  urgent: 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300',
  haute: 'bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300',
  moyenne: 'bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300',
  basse: 'bg-muted dark:bg-gray-800 text-foreground dark:text-gray-300',
  // Arabic mappings
  عاجل: 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300',
  عالي: 'bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300',
  عالية: 'bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300',
  متوسط: 'bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300',
  متوسطة: 'bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300',
  منخفض: 'bg-muted dark:bg-gray-800 text-foreground dark:text-gray-300',
  منخفضة: 'bg-muted dark:bg-gray-800 text-foreground dark:text-gray-300',
}

// Normaliser la priorité vers la clé de traduction
const normalizePriority = (priority: string): string => {
  const mapping: Record<string, string> = {
    urgent: 'urgent',
    haute: 'haute',
    moyenne: 'moyenne',
    basse: 'basse',
    عاجل: 'urgent',
    عالي: 'haute',
    عالية: 'haute',
    متوسط: 'moyenne',
    متوسطة: 'moyenne',
    منخفض: 'basse',
    منخفضة: 'basse',
  }
  return mapping[priority] || 'moyenne'
}

export default function ActionsSection({
  actions,
  onChange,
}: ActionsSectionProps) {
  const t = useTranslations('assistant')

  const handleToggle = (index: number) => {
    const newActions = [...actions]
    newActions[index] = {
      ...newActions[index],
      checked: !newActions[index].checked,
    }
    onChange(newActions)
  }

  const handleToggleAll = (checked: boolean) => {
    const newActions = actions.map((action) => ({ ...action, checked }))
    onChange(newActions)
  }

  const checkedCount = actions.filter((a) => a.checked).length

  return (
    <div className="rounded-lg border bg-card p-6 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="text-xl">&#9989;</span>
          <h3 className="text-lg font-semibold text-foreground">
            {t('actions.title')}
          </h3>
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
            {checkedCount}/{actions.length}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => handleToggleAll(true)}
            className="text-sm text-blue-600 hover:text-blue-700"
          >
            {t('actions.selectAll')}
          </button>
          <span className="text-muted-foreground">|</span>
          <button
            onClick={() => handleToggleAll(false)}
            className="text-sm text-blue-600 hover:text-blue-700"
          >
            {t('actions.deselectAll')}
          </button>
        </div>
      </div>

      <p className="text-sm text-muted-foreground mb-4">
        {t('actions.description')}
      </p>

      <div className="space-y-2">
        {actions.map((action, index) => {
          const normalizedPriority = normalizePriority(action.priorite)
          const priorityColor = PRIORITY_COLORS[action.priorite] || PRIORITY_COLORS[normalizedPriority] || 'bg-muted dark:bg-gray-800 text-foreground dark:text-gray-300'
          const priorityLabel = t(`actions.priority.${normalizedPriority}`)

          return (
            <label
              key={index}
              className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${
                action.checked
                  ? 'border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-900/20'
                  : 'border-muted hover:border-blue-200 dark:hover:border-blue-800'
              }`}
            >
              <input
                type="checkbox"
                checked={action.checked}
                onChange={() => handleToggle(index)}
                className="mt-1 h-4 w-4 rounded border-border text-blue-600 focus:ring-blue-500"
              />

              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-foreground">
                    {action.titre}
                  </span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${priorityColor}`}
                  >
                    {priorityLabel}
                  </span>
                </div>
                {action.description && (
                  <p className="text-sm text-muted-foreground mt-0.5">
                    {action.description}
                  </p>
                )}
                {action.delaiJours != null && action.delaiJours > 0 && (
                  <span className="text-xs text-muted-foreground">
                    {t('actions.deadline', { days: action.delaiJours })}
                  </span>
                )}
              </div>
            </label>
          )
        })}
      </div>
    </div>
  )
}
