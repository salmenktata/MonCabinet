import dynamic from 'next/dynamic'
import { query } from '@/lib/db/postgres'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Icons } from '@/lib/icons'
import Link from 'next/link'

// Dynamic import pour réduire le bundle initial
const AuditLogsFilters = dynamic(
  () => import('@/components/super-admin/AuditLogsFilters').then(m => ({ default: m.AuditLogsFilters })),
  { loading: () => <div className="h-16 bg-slate-800 animate-pulse rounded-lg" /> }
)

interface PageProps {
  searchParams: Promise<{
    action?: string
    target?: string
    admin?: string
    page?: string
  }>
}

export default async function AuditLogsPage({ searchParams }: PageProps) {
  const params = await searchParams
  const action = params.action || 'all'
  const target = params.target || 'all'
  const admin = params.admin || 'all'
  const page = parseInt(params.page || '1')
  const limit = 50
  const offset = (page - 1) * limit

  // Construire la requête avec filtres
  let whereClause = 'WHERE 1=1'
  const queryParams: (string | number)[] = []
  let paramIndex = 1

  if (action !== 'all') {
    whereClause += ` AND action_type = $${paramIndex}`
    queryParams.push(action)
    paramIndex++
  }

  if (target !== 'all') {
    whereClause += ` AND target_type = $${paramIndex}`
    queryParams.push(target)
    paramIndex++
  }

  if (admin !== 'all') {
    whereClause += ` AND admin_id = $${paramIndex}`
    queryParams.push(admin)
    paramIndex++
  }

  // Compter le total
  const countResult = await query(
    `SELECT COUNT(*) as count FROM admin_audit_logs ${whereClause}`,
    queryParams
  )
  const total = parseInt(countResult.rows[0]?.count || '0')

  // Récupérer les logs
  const logsResult = await query(
    `SELECT * FROM admin_audit_logs
     ${whereClause}
     ORDER BY created_at DESC
     LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
    [...queryParams, limit, offset]
  )

  // Récupérer les admins pour le filtre
  const adminsResult = await query(
    `SELECT DISTINCT admin_id, admin_email FROM admin_audit_logs ORDER BY admin_email`
  )

  const totalPages = Math.ceil(total / limit)

  const getActionBadge = (actionType: string) => {
    const colors: Record<string, string> = {
      user_approved: 'bg-green-500/20 text-green-500 border-green-500/30',
      user_rejected: 'bg-red-500/20 text-red-500 border-red-500/30',
      user_suspended: 'bg-red-500/20 text-red-500 border-red-500/30',
      user_reactivated: 'bg-green-500/20 text-green-500 border-green-500/30',
      user_deleted: 'bg-red-500/20 text-red-500 border-red-500/30',
      role_changed: 'bg-blue-500/20 text-blue-500 border-blue-500/30',
      plan_changed: 'bg-purple-500/20 text-purple-500 border-purple-500/30',
      kb_upload: 'bg-yellow-500/20 text-yellow-500 border-yellow-500/30',
      kb_delete: 'bg-red-500/20 text-red-500 border-red-500/30',
      kb_index: 'bg-blue-500/20 text-blue-500 border-blue-500/30',
    }

    const labels: Record<string, string> = {
      user_approved: 'Approbation',
      user_rejected: 'Rejet',
      user_suspended: 'Suspension',
      user_reactivated: 'Réactivation',
      user_deleted: 'Suppression',
      role_changed: 'Changement rôle',
      plan_changed: 'Changement plan',
      kb_upload: 'Upload KB',
      kb_delete: 'Suppression KB',
      kb_index: 'Indexation KB',
    }

    return (
      <Badge className={colors[actionType] || 'bg-slate-500/20 text-slate-400'}>
        {labels[actionType] || actionType}
      </Badge>
    )
  }

  const getTargetBadge = (targetType: string) => {
    switch (targetType) {
      case 'user':
        return <Badge variant="outline" className="border-blue-500/30 text-blue-400">Utilisateur</Badge>
      case 'knowledge_base':
        return <Badge variant="outline" className="border-purple-500/30 text-purple-400">Base KB</Badge>
      case 'config':
        return <Badge variant="outline" className="border-yellow-500/30 text-yellow-400">Config</Badge>
      default:
        return <Badge variant="outline" className="border-slate-500/30 text-slate-400">{targetType}</Badge>
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-white">Audit Logs</h2>
        <p className="text-slate-400">Historique des actions administratives</p>
      </div>

      {/* Filtres */}
      <Card className="bg-slate-800 border-slate-700">
        <CardContent className="pt-6">
          <div className="flex flex-wrap gap-4 items-center">
            <AuditLogsFilters currentAction={action} currentTarget={target} />

            {/* Clear */}
            {(action !== 'all' || target !== 'all') && (
              <Link href="/super-admin/audit-logs">
                <Button variant="ghost" className="text-slate-400">
                  <Icons.close className="h-4 w-4 mr-2" />
                  Effacer filtres
                </Button>
              </Link>
            )}

            <div className="ml-auto text-sm text-slate-400">
              {total} entrées
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Liste des logs */}
      <Card className="bg-slate-800 border-slate-700">
        <CardHeader>
          <CardTitle className="text-white">Logs ({total})</CardTitle>
          <CardDescription className="text-slate-400">
            Page {page} sur {totalPages || 1}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {logsResult.rows.length === 0 ? (
            <div className="text-center py-12 text-slate-400">
              <Icons.shield className="h-12 w-12 mx-auto mb-4" />
              <p>Aucun log d'audit</p>
            </div>
          ) : (
            <div className="space-y-3">
              {logsResult.rows.map((log: {
                id: string
                admin_id: string
                admin_email: string
                action_type: string
                target_type: string
                target_id: string
                target_identifier: string
                old_value: Record<string, unknown>
                new_value: Record<string, unknown>
                ip_address: string
                created_at: Date
              }) => (
                <div
                  key={log.id}
                  className="flex items-start gap-4 p-4 rounded-lg bg-slate-700/50 hover:bg-slate-700/70 transition"
                >
                  <div className="h-10 w-10 rounded-full bg-slate-600 flex items-center justify-center shrink-0">
                    <Icons.shield className="h-5 w-5 text-slate-300" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      {getActionBadge(log.action_type)}
                      {getTargetBadge(log.target_type)}
                    </div>
                    <p className="text-white mt-1">
                      <span className="text-slate-400">Par</span> {log.admin_email}
                    </p>
                    {log.target_identifier && (
                      <p className="text-sm text-slate-400">
                        Cible: {log.target_identifier}
                      </p>
                    )}
                    {(log.old_value || log.new_value) && (
                      <div className="mt-2 text-xs text-slate-400 font-mono bg-slate-800 rounded p-2 overflow-x-auto">
                        {log.old_value && (
                          <div>
                            <span className="text-red-400">-</span> {JSON.stringify(log.old_value)}
                          </div>
                        )}
                        {log.new_value && (
                          <div>
                            <span className="text-green-400">+</span> {JSON.stringify(log.new_value)}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm text-white">
                      {new Date(log.created_at).toLocaleDateString('fr-FR')}
                    </p>
                    <p className="text-xs text-slate-400">
                      {new Date(log.created_at).toLocaleTimeString('fr-FR')}
                    </p>
                    {log.ip_address && (
                      <p className="text-xs text-slate-600 mt-1">{log.ip_address}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 mt-6">
              <Link
                href={`/super-admin/audit-logs?action=${action}&target=${target}&page=${Math.max(1, page - 1)}`}
                aria-label="Page précédente"
              >
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  className="border-slate-600 text-slate-300"
                >
                  <Icons.chevronLeft className="h-4 w-4" />
                </Button>
              </Link>

              <span className="text-sm text-slate-400">
                Page {page} / {totalPages}
              </span>

              <Link
                href={`/super-admin/audit-logs?action=${action}&target=${target}&page=${Math.min(totalPages, page + 1)}`}
                aria-label="Page suivante"
              >
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages}
                  className="border-slate-600 text-slate-300"
                >
                  <Icons.chevronRight className="h-4 w-4" />
                </Button>
              </Link>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
