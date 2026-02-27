'use client'

import Link from 'next/link'
import { Icons } from '@/lib/icons'
import { WebSourcePages } from './WebSourcePages'
import { WebSourceLogs } from './WebSourceLogs'

interface WebSourceActivityTabsProps {
  pages: any[]
  logs: any[]
  sourceId: string
}

export function WebSourceActivityTabs({ pages, logs, sourceId }: WebSourceActivityTabsProps) {
  return (
    <div className="space-y-5">
      {/* Dernières pages */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-medium text-slate-300 flex items-center gap-2">
            <Icons.fileText className="h-4 w-4 text-slate-400" />
            Dernières pages
          </h3>
          <Link
            href={`/super-admin/web-sources/${sourceId}/pages`}
            className="text-xs text-slate-400 hover:text-blue-400 flex items-center gap-1 transition-colors"
          >
            Voir tout
            <Icons.chevronRight className="h-3 w-3" />
          </Link>
        </div>
        <WebSourcePages pages={pages.slice(0, 5)} sourceId={sourceId} />
      </div>

      {/* Historique crawls */}
      <div className="border-t border-slate-700/50 pt-5">
        <h3 className="text-sm font-medium text-slate-300 flex items-center gap-2 mb-3">
          <Icons.history className="h-4 w-4 text-slate-400" />
          Historique crawls
        </h3>
        <WebSourceLogs logs={logs} />
      </div>
    </div>
  )
}
