import dynamic from 'next/dynamic'
import { query } from '@/lib/db/postgres'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Icons } from '@/lib/icons'
import Link from 'next/link'
import { safeParseInt } from '@/lib/utils/safe-number'
import { PageHeader } from '@/components/super-admin/shared/PageHeader'
import { PaginationControls } from '@/components/super-admin/shared/PaginationControls'
import { EmptyState } from '@/components/super-admin/shared/EmptyState'
import { buildDynamicWhere } from '@/lib/db/query-builder'

const AuditLogsFilters = dynamic(
  () => import('@/components/super-admin/AuditLogsFilters').then(m => ({ default: m.AuditLogsFilters })),
  { loading: () => <div className="h-16 bg-card animate-pulse rounded-lg" /> }
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
  const page = safeParseInt(params.page, 1, 1, 9999)
  const limit = 50
  const offset = (page - 1) * limit

  const { whereClause, params: queryParams, nextIndex } = buildDynamicWhere([
    { condition: action !== 'all', sql: 'action_type = ?', value: action },
    { condition: target !== 'all', sql: 'target_type = ?', value: target },
    { condition: admin !== 'all', sql: 'admin_id = ?', value: admin },
  ])

  const [countResult, logsResult, adminsResult] = await Promise.all([
    query(`SELECT COUNT(*) as count FROM admin_audit_logs ${whereClause}`, queryParams),
    query(
      `SELECT * FROM admin_audit_logs ${whereClause} ORDER BY created_at DESC LIMIT $${nextIndex} OFFSET $${nextIndex + 1}`,
      [...queryParams, limit, offset]
    ),
    query(`SELECT DISTINCT admin_id, admin_email FROM admin_audit_logs ORDER BY admin_email`),
  ])

  const total = safeParseInt(countResult.rows[0]?.count, 0, 0)
  const totalPages = Math.ceil(total / limit)
  const filterQS = `action=${action}&target=${target}&admin=${admin}`

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
      impersonation_start: 'bg-orange-500/20 text-orange-500 border-orange-500/30',
      impersonation_stop: 'bg-orange-500/20 text-orange-500 border-orange-500/30',
      impersonation_expired: 'bg-red-500/20 text-red-500 border-red-500/30',
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
      impersonation_start: '🔐 Impersonation démarrée',
      impersonation_stop: '🔐 Impersonation arrêtée',
      impersonation_expired: '⏱️ Impersonation expirée',
    }
    return (
      <Badge className={colors[actionType] || 'bg-muted/20 text-muted-foreground'}>
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
        return <Badge variant="outline" className="border-border/30 text-muted-foreground">{targetType}</Badge>
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Audit Logs" description="Historique des actions administratives" />

      <Card className="bg-card border-border">
        <CardContent className="pt-6">
          <div className="flex flex-wrap gap-4 items-center">
            <AuditLogsFilters currentAction={action} currentTarget={target} />
            {(action !== 'all' || target !== 'all') && (
              <Link href="/super-admin/audit-logs">
                <Button variant="ghost" className="text-muted-foreground">
                  <Icons.close className="h-4 w-4 mr-2" />
                  Effacer filtres
                </Button>
              </Link>
            )}
            <div className="ml-auto text-sm text-muted-foreground">{total} entrées</div>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="text-foreground">Logs ({total})</CardTitle>
          <CardDescription className="text-muted-foreground">Page {page} sur {totalPages || 1}</CardDescription>
        </CardHeader>
        <CardContent>
          {logsResult.rows.length === 0 ? (
            <EmptyState icon="shield" message="Aucun log d'audit" />
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
                  className="flex items-start gap-4 p-4 rounded-lg bg-muted/50 hover:bg-muted/70 transition"
                >
                  <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center shrink-0">
                    <Icons.shield className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      {getActionBadge(log.action_type)}
                      {getTargetBadge(log.target_type)}
                    </div>
                    <p className="text-foreground mt-1">
                      <span className="text-muted-foreground">Par</span> {log.admin_email}
                    </p>
                    {log.target_identifier && (
                      <p className="text-sm text-muted-foreground">Cible: {log.target_identifier}</p>
                    )}
                    {(log.old_value || log.new_value) && (
                      <div className="mt-2 text-xs text-muted-foreground font-mono bg-card rounded p-2 overflow-x-auto">
                        {log.old_value && (
                          <div><span className="text-red-400">-</span> {JSON.stringify(log.old_value)}</div>
                        )}
                        {log.new_value && (
                          <div><span className="text-green-400">+</span> {JSON.stringify(log.new_value)}</div>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm text-foreground">
                      {new Date(log.created_at).toLocaleDateString('fr-FR')}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(log.created_at).toLocaleTimeString('fr-FR')}
                    </p>
                    {log.ip_address && (
                      <p className="text-xs text-muted-foreground mt-1">{log.ip_address}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          <PaginationControls
            page={page}
            totalPages={totalPages}
            prevHref={`/super-admin/audit-logs?${filterQS}&page=${Math.max(1, page - 1)}`}
            nextHref={`/super-admin/audit-logs?${filterQS}&page=${Math.min(totalPages, page + 1)}`}
          />
        </CardContent>
      </Card>
    </div>
  )
}
