'use client'

import { useTranslations } from 'next-intl'
import type { SuggestedAction } from '@/lib/ai/dossier-structuring-service'

interface ActionsSectionProps {
  actions: SuggestedAction[]
  onChange: (actions: SuggestedAction[]) => void
}

const PRIORITY_CONFIG: Record<
  SuggestedAction['priorite'],
  { colorClass: string; label: string }
> = {
  urgent: { colorClass: 'bg-red-100 text-red-800', label: 'Urgent' },
  haute: { colorClass: 'bg-amber-100 text-amber-800', label: 'Haute' },
  moyenne: { colorClass: 'bg-blue-100 text-blue-800', label: 'Moyenne' },
  basse: { colorClass: 'bg-gray-100 text-gray-800', label: 'Basse' },
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
          const priorityConfig = PRIORITY_CONFIG[action.priorite] || {
            colorClass: 'bg-gray-100 text-gray-800',
            label: action.priorite || 'Normal',
          }

          return (
            <label
              key={index}
              className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${
                action.checked
                  ? 'border-blue-200 bg-blue-50/50'
                  : 'border-muted hover:border-blue-200'
              }`}
            >
              <input
                type="checkbox"
                checked={action.checked}
                onChange={() => handleToggle(index)}
                className="mt-1 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />

              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-foreground">
                    {action.titre}
                  </span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${priorityConfig.colorClass}`}
                  >
                    {priorityConfig.label}
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
