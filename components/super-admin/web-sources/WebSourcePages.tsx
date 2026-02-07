'use client'

import { Badge } from '@/components/ui/badge'
import { Icons } from '@/lib/icons'

interface Page {
  id: string
  url: string
  title: string | null
  status: string
  is_indexed: boolean
  word_count: number
  chunks_count: number
  last_crawled_at: string | null
}

interface WebSourcePagesProps {
  pages: Page[]
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  pending: { label: 'En attente', color: 'bg-slate-500/20 text-slate-400 border-slate-500/30' },
  crawled: { label: 'Crawlée', color: 'bg-blue-500/20 text-blue-400 border-blue-500/30' },
  indexed: { label: 'Indexée', color: 'bg-green-500/20 text-green-400 border-green-500/30' },
  failed: { label: 'Erreur', color: 'bg-red-500/20 text-red-400 border-red-500/30' },
  unchanged: { label: 'Inchangée', color: 'bg-slate-500/20 text-slate-400 border-slate-500/30' },
}

export function WebSourcePages({ pages }: WebSourcePagesProps) {
  if (pages.length === 0) {
    return (
      <div className="text-center py-8 text-slate-500">
        <Icons.fileText className="h-8 w-8 mx-auto mb-2" />
        <p className="text-sm">Aucune page crawlée</p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {pages.map((page) => {
        const statusInfo = STATUS_LABELS[page.status] || STATUS_LABELS.pending

        return (
          <div
            key={page.id}
            className="flex items-start gap-3 p-3 rounded-lg bg-slate-900/50 hover:bg-slate-900/70 transition"
          >
            <div className="shrink-0 mt-0.5">
              {page.is_indexed ? (
                <Icons.checkCircle className="h-4 w-4 text-green-400" />
              ) : (
                <Icons.file className="h-4 w-4 text-slate-500" />
              )}
            </div>

            <div className="flex-1 min-w-0">
              <p className="text-sm text-white truncate" title={page.title || page.url}>
                {page.title || extractPath(page.url)}
              </p>
              <p className="text-xs text-slate-500 truncate">{page.url}</p>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <Badge className={statusInfo.color + ' text-xs'}>
                {statusInfo.label}
              </Badge>
              {page.chunks_count > 0 && (
                <span className="text-xs text-slate-500">
                  {page.chunks_count} chunks
                </span>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function extractPath(url: string): string {
  try {
    const urlObj = new URL(url)
    return urlObj.pathname || '/'
  } catch {
    return url
  }
}
