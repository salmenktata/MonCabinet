'use client'

import { useState, useEffect, useCallback } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { fr } from 'date-fns/locale'
import { Button } from '@/components/ui/button'
import { Icons } from '@/lib/icons'
import { HealthBadge } from './HealthBadge'
import { CategoryBadge } from './CategoryBadge'
import type { SourcePipelineStats } from '@/app/api/admin/web-sources/pipeline-stats/route'

interface WebSourcePipelineViewProps {
  category?: string
  search?: string
  isActive?: boolean
}

export function WebSourcePipelineView({ category, search, isActive }: WebSourcePipelineViewProps) {
  const [stats, setStats] = useState<SourcePipelineStats[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchStats = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      if (category) params.set('category', category)
      if (search) params.set('search', search)
      if (isActive !== undefined) params.set('isActive', String(isActive))

      const res = await fetch(`/api/admin/web-sources/pipeline-stats?${params.toString()}`)
      if (!res.ok) throw new Error(`Erreur ${res.status}`)
      const data = await res.json()
      setStats(data.stats)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue')
    } finally {
      setLoading(false)
    }
  }, [category, search, isActive])

  useEffect(() => {
    fetchStats()
  }, [fetchStats])

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-64 bg-slate-800 animate-pulse rounded-lg" />
        ))}
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3 text-slate-400">
        <Icons.alertCircle className="h-8 w-8 text-red-400" />
        <p className="text-sm">{error}</p>
        <Button variant="outline" size="sm" onClick={fetchStats} className="bg-slate-800 border-slate-700 text-slate-300">
          Réessayer
        </Button>
      </div>
    )
  }

  if (stats.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3 text-slate-400">
        <Icons.gitBranch className="h-8 w-8" />
        <p className="text-sm">Aucune source trouvée</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex justify-between items-center">
        <p className="text-sm text-slate-400">{stats.length} source{stats.length > 1 ? 's' : ''}</p>
        <Button
          variant="outline"
          size="sm"
          onClick={fetchStats}
          className="bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700 hover:text-white"
        >
          <Icons.refresh className="h-3.5 w-3.5 mr-1.5" />
          Actualiser
        </Button>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {stats.map((source) => (
          <PipelineSourceCard key={source.id} source={source} />
        ))}
      </div>
    </div>
  )
}

// =============================================================================
// Card individuelle
// =============================================================================

function PipelineSourceCard({ source }: { source: SourcePipelineStats }) {
  const borderColor =
    source.health_status === 'healthy'
      ? 'border-l-green-500'
      : source.health_status === 'degraded'
      ? 'border-l-yellow-500'
      : source.health_status === 'failing'
      ? 'border-l-red-500'
      : 'border-l-slate-600'

  return (
    <div className={`bg-slate-800 rounded-lg border border-slate-700 border-l-4 ${borderColor} overflow-hidden`}>
      {/* Header */}
      <div className="p-4 border-b border-slate-700/50">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-white truncate">{source.name}</h3>
            <p className="text-xs text-slate-500 truncate mt-0.5">{source.base_url}</p>
          </div>
          <HealthBadge status={source.health_status} consecutiveFailures={source.consecutive_failures} size="sm" />
        </div>
        <div className="flex flex-wrap gap-1.5 mt-2">
          <CategoryBadge category={source.category} />
          {source.is_active ? (
            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-green-500/10 text-green-400 border border-green-500/20">
              Actif
            </span>
          ) : (
            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-500/10 text-slate-400 border border-slate-500/20">
              Inactif
            </span>
          )}
          {source.rag_enabled && (
            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-500/10 text-blue-400 border border-blue-500/20">
              RAG
            </span>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="p-4 space-y-4">
        {/* Section PAGES */}
        <PipelineSection
          title={`PAGES (${source.pages.total.toLocaleString('fr-FR')} découvertes)`}
          hasContent={source.pages.total > 0}
        >
          <ProgressBar
            value={source.pages.indexed}
            total={source.pages.total}
            colorClass="bg-green-500"
          />
          <StatusRow icon="✅" label="Indexées" count={source.pages.indexed} total={source.pages.total} />
          {source.pages.crawled_pending > 0 && (
            <StatusRow icon="🔄" label="Crawlées (en attente)" count={source.pages.crawled_pending} total={source.pages.total} />
          )}
          {source.pages.pending > 0 && (
            <StatusRow icon="⚡" label="En attente" count={source.pages.pending} total={source.pages.total} />
          )}
          {source.pages.failed > 0 && (
            <StatusRow icon="❌" label="Échouées" count={source.pages.failed} total={source.pages.total} colorClass="text-red-400" />
          )}
          {source.pages.unchanged > 0 && (
            <StatusRow icon="🔁" label="Inchangées" count={source.pages.unchanged} total={source.pages.total} />
          )}
        </PipelineSection>

        {/* Section FICHIERS (masquée si aucun fichier) */}
        {source.files.total > 0 && (
          <PipelineSection
            title={`FICHIERS (${source.files.total.toLocaleString('fr-FR')} détectés)`}
          >
            <ProgressBar
              value={source.files.indexed}
              total={source.files.total}
              colorClass="bg-blue-500"
            />
            <StatusRow icon="✅" label="Indexés" count={source.files.indexed} total={source.files.total} />
            {source.files.downloaded > source.files.indexed && (
              <StatusRow icon="📥" label="Téléchargés" count={source.files.downloaded} total={source.files.total} />
            )}
            {source.files.download_failed > 0 && (
              <StatusRow icon="❌" label="Échec télécharg." count={source.files.download_failed} total={source.files.total} colorClass="text-red-400" />
            )}
            {source.files.parse_failed > 0 && (
              <StatusRow icon="⚠️" label="Échec parse" count={source.files.parse_failed} total={source.files.total} colorClass="text-yellow-400" />
            )}
          </PipelineSection>
        )}

        {/* Section KB */}
        <PipelineSection title="KNOWLEDGE BASE">
          <div className="flex gap-4">
            <div className="flex items-center gap-1.5">
              <Icons.database className="h-3.5 w-3.5 text-purple-400" />
              <span className="text-xs text-slate-300">
                <span className="font-semibold">{source.kb.docs_count.toLocaleString('fr-FR')}</span>
                <span className="text-slate-500 ml-1">docs KB</span>
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <Icons.layers className="h-3.5 w-3.5 text-indigo-400" />
              <span className="text-xs text-slate-300">
                <span className="font-semibold">{source.kb.total_chunks.toLocaleString('fr-FR')}</span>
                <span className="text-slate-500 ml-1">chunks</span>
              </span>
            </div>
          </div>
        </PipelineSection>
      </div>

      {/* Footer : dernier & prochain crawl */}
      <div className="px-4 py-3 border-t border-slate-700/50 space-y-1">
        <CrawlFooter source={source} />
      </div>
    </div>
  )
}

// =============================================================================
// Sous-composants
// =============================================================================

function PipelineSection({
  title,
  children,
  hasContent = true,
}: {
  title: string
  children: React.ReactNode
  hasContent?: boolean
}) {
  if (!hasContent) {
    return (
      <div>
        <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">{title}</p>
        <p className="text-xs text-slate-600 italic">Aucun élément</p>
      </div>
    )
  }
  return (
    <div>
      <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">{title}</p>
      <div className="space-y-1">{children}</div>
    </div>
  )
}

function ProgressBar({
  value,
  total,
  colorClass,
}: {
  value: number
  total: number
  colorClass: string
}) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0
  return (
    <div className="flex items-center gap-2 mb-1.5">
      <div className="flex-1 h-1.5 bg-slate-700 rounded-full overflow-hidden">
        <div
          className={`h-full ${colorClass} rounded-full transition-all`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-[10px] font-medium text-slate-400 w-8 text-right">{pct}%</span>
    </div>
  )
}

function StatusRow({
  icon,
  label,
  count,
  total,
  colorClass = 'text-slate-300',
}: {
  icon: string
  label: string
  count: number
  total: number
  colorClass?: string
}) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-xs text-slate-400 flex items-center gap-1.5">
        <span>{icon}</span>
        <span>{label}</span>
      </span>
      <span className={`text-xs font-medium tabular-nums ${colorClass}`}>
        {count.toLocaleString('fr-FR')}
        <span className="text-slate-600 ml-1 font-normal">{pct}%</span>
      </span>
    </div>
  )
}

function CrawlFooter({ source }: { source: SourcePipelineStats }) {
  const log = source.last_crawl_log

  return (
    <div className="space-y-1">
      {/* Dernier crawl */}
      <div className="flex items-center justify-between text-xs text-slate-500">
        <span className="flex items-center gap-1">
          <Icons.clock className="h-3 w-3" />
          Dernier crawl
        </span>
        <span>
          {source.last_crawl_at
            ? formatDistanceToNow(new Date(source.last_crawl_at), { addSuffix: true, locale: fr })
            : '—'}
        </span>
      </div>

      {/* Métriques du dernier log */}
      {log && (
        <div className="flex gap-3 text-[10px] text-slate-500">
          {log.pages_new > 0 && (
            <span className="text-green-500">+{log.pages_new} nouv.</span>
          )}
          {log.pages_changed > 0 && (
            <span className="text-blue-400">+{log.pages_changed} modif.</span>
          )}
          {log.pages_failed > 0 && (
            <span className="text-red-400">×{log.pages_failed} éch.</span>
          )}
          {log.duration_ms > 0 && (
            <span>{Math.round(log.duration_ms / 1000)}s</span>
          )}
        </div>
      )}

      {/* Prochain crawl */}
      {source.next_crawl_at && (
        <div className="flex items-center justify-between text-xs text-slate-500">
          <span className="flex items-center gap-1">
            <Icons.calendar className="h-3 w-3" />
            Prochain crawl
          </span>
          <span>
            {formatDistanceToNow(new Date(source.next_crawl_at), { addSuffix: true, locale: fr })}
          </span>
        </div>
      )}
    </div>
  )
}
