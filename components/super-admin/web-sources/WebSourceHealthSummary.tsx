import { Icons } from '@/lib/icons'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatDistanceToNow } from 'date-fns'
import { fr } from 'date-fns/locale'

interface WebSourceHealthSummaryProps {
  lastCrawlAt: string | null
  nextCrawlAt: string | null
  totalPages: number
  failedPages: number
  healthStatus: string
}

export function WebSourceHealthSummary({
  lastCrawlAt,
  nextCrawlAt,
  totalPages,
  failedPages,
  healthStatus,
}: WebSourceHealthSummaryProps) {
  const successRate = totalPages > 0 ? ((totalPages - failedPages) / totalPages) * 100 : 0

  const healthConfig = {
    healthy: { icon: Icons.checkCircle, color: 'text-green-400', bg: 'bg-green-500/10' },
    degraded: { icon: Icons.alertCircle, color: 'text-yellow-400', bg: 'bg-yellow-500/10' },
    failing: { icon: Icons.xCircle, color: 'text-red-400', bg: 'bg-red-500/10' },
    unknown: { icon: Icons.info, color: 'text-slate-400', bg: 'bg-slate-500/10' },
  }

  const config = healthConfig[healthStatus as keyof typeof healthConfig] || healthConfig.unknown
  const HealthIcon = config.icon

  return (
    <Card className="bg-slate-800 border-slate-700">
      <CardHeader>
        <CardTitle className="text-white text-base flex items-center gap-2">
          <HealthIcon className={`h-5 w-5 ${config.color}`} />
          Santé de la source
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Dernier crawl */}
          <div className={`rounded-lg p-3 ${config.bg}`}>
            <div className="flex items-start gap-2">
              <Icons.clock className={`h-4 w-4 mt-0.5 ${config.color}`} />
              <div className="flex-1 min-w-0">
                <p className="text-xs text-slate-400 mb-1">Dernier crawl</p>
                <p className={`text-sm font-medium ${config.color}`}>
                  {lastCrawlAt
                    ? formatDistanceToNow(new Date(lastCrawlAt), {
                        addSuffix: true,
                        locale: fr,
                      })
                    : 'Jamais'}
                </p>
                {lastCrawlAt && totalPages > 0 && (
                  <p className="text-xs text-slate-500 mt-0.5">{totalPages} pages</p>
                )}
              </div>
            </div>
          </div>

          {/* Prochain crawl */}
          <div className={`rounded-lg p-3 ${config.bg}`}>
            <div className="flex items-start gap-2">
              <Icons.calendar className={`h-4 w-4 mt-0.5 ${config.color}`} />
              <div className="flex-1 min-w-0">
                <p className="text-xs text-slate-400 mb-1">Prochain crawl</p>
                <p className={`text-sm font-medium ${config.color}`}>
                  {nextCrawlAt
                    ? formatDistanceToNow(new Date(nextCrawlAt), {
                        addSuffix: true,
                        locale: fr,
                      })
                    : 'Non planifié'}
                </p>
                <p className="text-xs text-slate-500 mt-0.5">Automatique</p>
              </div>
            </div>
          </div>

          {/* Taux de succès */}
          <div className={`rounded-lg p-3 ${config.bg}`}>
            <div className="flex items-start gap-2">
              <Icons.target className={`h-4 w-4 mt-0.5 ${config.color}`} />
              <div className="flex-1 min-w-0">
                <p className="text-xs text-slate-400 mb-1">Taux de succès</p>
                <p className={`text-sm font-medium ${config.color}`}>
                  {successRate.toFixed(1)}%
                </p>
                {failedPages > 0 ? (
                  <p className="text-xs text-red-400 mt-0.5">
                    {failedPages} erreur{failedPages > 1 ? 's' : ''}/{totalPages}
                  </p>
                ) : (
                  <p className="text-xs text-slate-500 mt-0.5">Aucune erreur</p>
                )}
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
