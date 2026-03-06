'use client'

import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Icons } from '@/lib/icons'
import { CronTriggerModal } from '@/components/super-admin/monitoring/CronTriggerModal'

interface CronAction {
  cronName: string
  label: string
  icon: keyof typeof Icons
  description: string
  estimatedDuration: number
  isRunning: boolean
}

const QUICK_ACTIONS: Omit<CronAction, 'isRunning'>[] = [
  {
    cronName: 'web-crawler',
    label: 'Crawler',
    icon: 'refresh',
    description: 'Crawl Sources Web (9anoun, cassation, iort)',
    estimatedDuration: 300000,
  },
  {
    cronName: 'index-kb',
    label: 'Indexer KB',
    icon: 'database',
    description: 'Indexation KB Progressive',
    estimatedDuration: 45000,
  },
  {
    cronName: 'pipeline-auto-advance',
    label: 'Pipeline',
    icon: 'zap',
    description: 'Pipeline Auto-Advance KB',
    estimatedDuration: 300000,
  },
  {
    cronName: 'analyze-web-pages-quality',
    label: 'Qualité pages',
    icon: 'search',
    description: 'Analyse Qualité Web Pages (quality_score NULL)',
    estimatedDuration: 600000,
  },
  {
    cronName: 'kb-quality-maintenance',
    label: 'Maintenance KB',
    icon: 'settings',
    description: 'Maintenance Qualité KB (qualité, rechunk, metadata)',
    estimatedDuration: 900000,
  },
]

export function WebSourcesQuickActions() {
  const [actions, setActions] = useState<CronAction[]>(
    QUICK_ACTIONS.map((a) => ({ ...a, isRunning: false }))
  )
  const [selectedCron, setSelectedCron] = useState<CronAction | null>(null)

  const fetchRunningStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/cron-executions/trigger')
      const data = await res.json()
      if (!data.success) return
      const runningMap = new Map<string, boolean>(
        data.crons.map((c: { cronName: string; isRunning: boolean }) => [c.cronName, c.isRunning])
      )
      setActions((prev) =>
        prev.map((a) => ({ ...a, isRunning: runningMap.get(a.cronName) ?? false }))
      )
    } catch {
      // silently ignore
    }
  }, [])

  useEffect(() => {
    fetchRunningStatus()
  }, [fetchRunningStatus])

  const handleSuccess = () => {
    setTimeout(fetchRunningStatus, 1500)
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 p-3 rounded-lg bg-card/40 border border-border/50">
        <span className="text-xs text-muted-foreground mr-1 shrink-0">Actions :</span>
        {actions.map((action) => {
          const Icon = Icons[action.icon]
          return (
            <Button
              key={action.cronName}
              size="sm"
              variant="outline"
              onClick={() => setSelectedCron(action)}
              disabled={action.isRunning}
              className="h-7 px-2.5 text-xs gap-1.5 border-border text-foreground hover:text-foreground hover:border-border disabled:opacity-60"
            >
              {action.isRunning ? (
                <Icons.loader className="h-3 w-3 animate-spin" />
              ) : (
                <Icon className="h-3 w-3" />
              )}
              {action.label}
              {action.isRunning && (
                <Badge className="ml-1 h-4 px-1 text-[10px] bg-blue-500/20 text-blue-400 border-0">
                  en cours
                </Badge>
              )}
            </Button>
          )
        })}
      </div>

      {selectedCron && (
        <CronTriggerModal
          isOpen={!!selectedCron}
          onClose={() => setSelectedCron(null)}
          cronName={selectedCron.cronName}
          description={selectedCron.description}
          estimatedDuration={selectedCron.estimatedDuration}
          onSuccess={handleSuccess}
        />
      )}
    </>
  )
}
