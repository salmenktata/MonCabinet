'use client'

import { Badge } from '@/components/ui/badge'
import { Icons } from '@/lib/icons'

interface CrawlLog {
  id: string
  started_at: string
  completed_at: string | null
  duration_ms: number | null
  pages_crawled: number
  pages_new: number
  pages_changed: number
  pages_failed: number
  status: string
  error_message: string | null
}

interface WebSourceLogsProps {
  logs: CrawlLog[]
}

export function WebSourceLogs({ logs }: WebSourceLogsProps) {
  if (logs.length === 0) {
    return (
      <div className="text-center py-8 text-slate-400">
        <Icons.history className="h-8 w-8 mx-auto mb-2" />
        <p className="text-sm">Aucun historique</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {logs.map((log) => {
        const statusColors: Record<string, string> = {
          completed: 'bg-green-500/20 text-green-400 border-green-500/30',
          running: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
          failed: 'bg-red-500/20 text-red-400 border-red-500/30',
          cancelled: 'bg-slate-500/20 text-slate-400 border-slate-500/30',
        }

        return (
          <div
            key={log.id}
            className="p-3 rounded-lg bg-slate-900/50"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-slate-300">
                {new Date(log.started_at).toLocaleString('fr-FR')}
              </span>
              <Badge className={statusColors[log.status] || statusColors.running}>
                {log.status === 'completed' ? 'Terminé' :
                 log.status === 'running' ? 'En cours' :
                 log.status === 'failed' ? 'Erreur' : log.status}
              </Badge>
            </div>

            <div className="flex items-center gap-4 text-xs text-slate-400">
              <span className="flex items-center gap-1">
                <Icons.fileText className="h-3 w-3" />
                {log.pages_crawled} pages
              </span>
              {log.pages_new > 0 && (
                <span className="text-green-400">+{log.pages_new} nouvelles</span>
              )}
              {log.pages_changed > 0 && (
                <span className="text-blue-400">{log.pages_changed} modifiées</span>
              )}
              {log.pages_failed > 0 && (
                <span className="text-red-400">{log.pages_failed} erreurs</span>
              )}
              {log.duration_ms && (
                <span>{formatDuration(log.duration_ms)}</span>
              )}
            </div>

            {log.error_message && (
              <p className="text-xs text-red-400 mt-2 line-clamp-1">
                {log.error_message}
              </p>
            )}
          </div>
        )
      })}
    </div>
  )
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  return `${Math.round(ms / 60000)}min`
}
