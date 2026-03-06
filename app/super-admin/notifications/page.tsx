import dynamic from 'next/dynamic'
import { query } from '@/lib/db/postgres'
import { getSession } from '@/lib/auth/session'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Icons } from '@/lib/icons'
import { Skeleton } from '@/components/ui/skeleton'
import Link from 'next/link'
import { safeParseInt } from '@/lib/utils/safe-number'
import { PageHeader } from '@/components/super-admin/shared/PageHeader'
import { PaginationControls } from '@/components/super-admin/shared/PaginationControls'
import { EmptyState } from '@/components/super-admin/shared/EmptyState'
import { KPICard } from '@/components/super-admin/shared/KPICard'
import { buildDynamicWhere } from '@/lib/db/query-builder'

const NotificationActions = dynamic(
  () => import('@/components/super-admin/notifications/NotificationActions').then(mod => mod.NotificationActions),
  { loading: () => <Skeleton className="h-9 w-32" /> }
)

interface PageProps {
  searchParams: Promise<{
    type?: string
    read?: string
    page?: string
  }>
}

export default async function NotificationsPage({ searchParams }: PageProps) {
  const session = await getSession()
  const params = await searchParams
  const type = params.type || 'all'
  const read = params.read || 'all'
  const page = safeParseInt(params.page, 1, 1, 9999)
  const limit = 20
  const offset = (page - 1) * limit

  const { whereClause, params: queryParams, nextIndex } = buildDynamicWhere(
    [
      { condition: type !== 'all', sql: 'notification_type = ?', value: type },
      { condition: read !== 'all', sql: 'is_read = ?', value: read === 'true' },
    ],
    1,
    'WHERE (expires_at IS NULL OR expires_at > NOW())'
  )

  const [countResult, unreadResult, notifsResult] = await Promise.all([
    query(`SELECT COUNT(*) as count FROM admin_notifications ${whereClause}`, queryParams),
    query(`SELECT COUNT(*) as count FROM admin_notifications WHERE is_read = FALSE AND (expires_at IS NULL OR expires_at > NOW())`),
    query(
      `SELECT n.*, u.email as target_email, u.nom as target_nom, u.prenom as target_prenom
       FROM admin_notifications n
       LEFT JOIN users u ON n.target_type = 'user' AND n.target_id = u.id
       ${whereClause}
       ORDER BY
         CASE n.priority WHEN 'urgent' THEN 1 WHEN 'high' THEN 2 WHEN 'normal' THEN 3 WHEN 'low' THEN 4 END,
         n.created_at DESC
       LIMIT $${nextIndex} OFFSET $${nextIndex + 1}`,
      [...queryParams, limit, offset]
    ),
  ])

  const total = safeParseInt(countResult.rows[0]?.count, 0, 0)
  const unreadCount = safeParseInt(unreadResult.rows[0]?.count, 0, 0)
  const totalPages = Math.ceil(total / limit)
  const filterQS = `type=${type}&read=${read}`

  const getPriorityBadge = (priority: string) => {
    switch (priority) {
      case 'urgent':
        return <Badge className="bg-red-500 text-foreground animate-pulse">Urgent</Badge>
      case 'high':
        return <Badge className="bg-orange-500/20 text-orange-500 border-orange-500/30">Haute</Badge>
      case 'normal':
        return <Badge className="bg-blue-500/20 text-blue-500 border-blue-500/30">Normale</Badge>
      case 'low':
        return <Badge variant="outline" className="border-border text-muted-foreground">Basse</Badge>
      default:
        return null
    }
  }

  const getTypeIcon = (notifType: string) => {
    switch (notifType) {
      case 'new_registration': return <Icons.users className="h-5 w-5 text-blue-500" />
      case 'user_activity':    return <Icons.activity className="h-5 w-5 text-green-500" />
      case 'system_alert':     return <Icons.alertTriangle className="h-5 w-5 text-yellow-500" />
      case 'kb_update':        return <Icons.bookOpen className="h-5 w-5 text-purple-500" />
      case 'plan_expiring':    return <Icons.creditCard className="h-5 w-5 text-orange-500" />
      default:                 return <Icons.bell className="h-5 w-5 text-muted-foreground" />
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Notifications"
        description="Centre de notifications administrateur"
        action={unreadCount > 0
          ? <NotificationActions unreadCount={unreadCount} adminId={session?.user?.id || ''} />
          : undefined
        }
      />

      <div className="grid gap-4 md:grid-cols-4">
        <KPICard value={unreadCount} label="Non lues" icon="bell" color="blue"
          href="/super-admin/notifications?read=false" isActive={read === 'false'} />
        <KPICard value="" label="Inscriptions" icon="users" color="green"
          href="/super-admin/notifications?type=new_registration" isActive={type === 'new_registration'} />
        <KPICard value="" label="Alertes système" icon="alertTriangle" color="yellow"
          href="/super-admin/notifications?type=system_alert" isActive={type === 'system_alert'} />
        <KPICard value={total} label="Total" icon="bell" color="slate"
          href="/super-admin/notifications" isActive={type === 'all' && read === 'all'} />
      </div>

      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="text-foreground">Notifications ({total})</CardTitle>
          <CardDescription className="text-muted-foreground">Page {page} sur {totalPages || 1}</CardDescription>
        </CardHeader>
        <CardContent>
          {notifsResult.rows.length === 0 ? (
            <EmptyState icon="checkCircle" message="Aucune notification" iconClassName="text-green-500" />
          ) : (
            <div className="space-y-3">
              {notifsResult.rows.map((notif: {
                id: string
                notification_type: string
                priority: string
                title: string
                message: string
                target_type: string
                target_id: string
                target_email: string
                target_nom: string
                target_prenom: string
                is_read: boolean
                is_actioned: boolean
                action_result: string
                created_at: Date
              }) => (
                <div
                  key={notif.id}
                  className={`flex items-start gap-4 p-4 rounded-lg transition ${
                    notif.is_read ? 'bg-muted/30' : 'bg-muted/50 border-l-4 border-blue-500'
                  }`}
                >
                  <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center shrink-0">
                    {getTypeIcon(notif.notification_type)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className={`font-medium ${notif.is_read ? 'text-muted-foreground' : 'text-foreground'}`}>
                        {notif.title}
                      </p>
                      {getPriorityBadge(notif.priority)}
                      {notif.is_actioned && (
                        <Badge variant="outline" className="border-green-500/30 text-green-500">
                          {notif.action_result === 'approved' ? 'Approuvé' :
                           notif.action_result === 'rejected' ? 'Rejeté' : notif.action_result}
                        </Badge>
                      )}
                    </div>
                    <p className={`text-sm mt-1 ${notif.is_read ? 'text-muted-foreground' : 'text-muted-foreground'}`}>
                      {notif.message}
                    </p>
                    {notif.target_type === 'user' && notif.target_email && (
                      <Link
                        href={`/super-admin/users/${notif.target_id}`}
                        className="inline-flex items-center gap-1 mt-2 text-sm text-blue-400 hover:text-blue-300"
                      >
                        <Icons.externalLink className="h-3 w-3" />
                        Voir {notif.target_prenom} {notif.target_nom}
                      </Link>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm text-muted-foreground">
                      {new Date(notif.created_at).toLocaleDateString('fr-FR')}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(notif.created_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}

          <PaginationControls
            page={page}
            totalPages={totalPages}
            prevHref={`/super-admin/notifications?${filterQS}&page=${Math.max(1, page - 1)}`}
            nextHref={`/super-admin/notifications?${filterQS}&page=${Math.min(totalPages, page + 1)}`}
          />
        </CardContent>
      </Card>
    </div>
  )
}
