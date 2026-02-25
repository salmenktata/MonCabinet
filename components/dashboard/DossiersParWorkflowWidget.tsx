'use client'

import { memo, useMemo } from 'react'
import { useTranslations } from 'next-intl'
import { getWorkflowById } from '@/lib/workflows/workflows-config'

interface DossiersParWorkflowWidgetProps {
  dossiers: any[]
}

function DossiersParWorkflowWidgetComponent({ dossiers }: DossiersParWorkflowWidgetProps) {
  const t = useTranslations('widgets.dossiersParWorkflow')

  // Calculs mémorisés pour éviter les recalculs inutiles
  const { workflows, total } = useMemo(() => {
    // Regrouper par type de procédure
    const parWorkflow = dossiers.reduce((acc: Record<string, number>, d) => {
      const type = d.type_procedure || 'autre'
      acc[type] = (acc[type] || 0) + 1
      return acc
    }, {})

    const wfs = Object.entries(parWorkflow)
      .map(([id, count]) => {
        const workflow = getWorkflowById(id)
        return {
          id,
          nom: workflow?.nom || id,
          count: count as number,
          couleur: getCouleur(id),
        }
      })
      .sort((a, b) => b.count - a.count)

    return {
      workflows: wfs,
      total: dossiers.length,
    }
  }, [dossiers])

  return (
    <div className="rounded-xl border bg-card/50 backdrop-blur-sm p-4 sm:p-5">
      <h2 className="text-sm font-semibold text-foreground mb-4">{t('title')}</h2>

      {workflows.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">{t('noActiveDossiers')}</p>
      ) : (
        <div className="space-y-3">
          {workflows.map((w) => {
            const pourcentage = total > 0 ? (w.count / total) * 100 : 0

            return (
              <div key={w.id}>
                <div className="flex items-center justify-between text-xs mb-1.5">
                  <span className="font-medium text-foreground truncate">{w.nom}</span>
                  <span className="font-semibold text-muted-foreground shrink-0 ml-2">
                    {w.count} <span className="text-muted-foreground/60">({pourcentage.toFixed(0)}%)</span>
                  </span>
                </div>
                <div className="h-1.5 bg-muted/50 rounded-full overflow-hidden">
                  <div
                    className={`h-full ${w.couleur} transition-all duration-300`}
                    style={{ width: `${pourcentage}%` }}
                  />
                </div>
              </div>
            )
          })}

          {/* Total */}
          <div className="mt-4 pt-3 border-t border-border/50">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">{t('totalActiveDossiers')}</span>
              <span className="text-2xl font-bold text-primary">{total}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function getCouleur(workflowId: string): string {
  const couleurs: Record<string, string> = {
    civil_premiere_instance: 'bg-blue-500',
    divorce: 'bg-purple-500',
    commercial: 'bg-green-500',
    refere: 'bg-orange-500',
    autre: 'bg-muted0',
  }
  return couleurs[workflowId] || 'bg-muted0'
}

export default memo(DossiersParWorkflowWidgetComponent)
