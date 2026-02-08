import { query } from '@/lib/db/postgres'
import { getSession } from '@/lib/auth/session'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Icons } from '@/lib/icons'
import Link from 'next/link'
import { NotificationActions } from '@/components/super-admin/notifications/NotificationActions'

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
  const page = parseInt(params.page || '1')
  const limit = 20
  const offset = (page - 1) * limit

  // Construire la requête avec filtres
  let whereClause = 'WHERE (expires_at IS NULL OR expires_at > NOW())'
  const queryParams: (string | number | boolean)[] = []
  let paramIndex = 1

  if (type !== 'all') {
    whereClause += ` AND notification_type = $${paramIndex}`
    queryParams.push(type)
    paramIndex++
  }

  if (read !== 'all') {
    whereClause += ` AND is_read = $${paramIndex}`
    queryParams.push(read === 'true')
    paramIndex++
  }

  // Compter le total
  const countResult = await query(
    `SELECT COUNT(*) as count FROM admin_notifications ${whereClause}`,
    queryParams
  )
  const total = parseInt(countResult.rows[0]?.count || '0')

  // Compter non lues
  const unreadResult = await query(
    `SELECT COUNT(*) as count FROM admin_notifications WHERE is_read = FALSE AND (expires_at IS NULL OR expires_at > NOW())`
  )
  const unreadCount = parseInt(unreadResult.rows[0]?.count || '0')

  // Récupérer les notifications
  const notifsResult = await query(
    `SELECT n.*, u.email as target_email, u.nom as target_nom, u.prenom as target_prenom
     FROM admin_notifications n
     LEFT JOIN users u ON n.target_type = 'user' AND n.target_id = u.id
     ${whereClause}
     ORDER BY
       CASE n.priority
         WHEN 'urgent' THEN 1
         WHEN 'high' THEN 2
         WHEN 'normal' THEN 3
         WHEN 'low' THEN 4
       END,
       n.created_at DESC
     LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
    [...queryParams, limit, offset]
  )

  const totalPages = Math.ceil(total / limit)

  const getPriorityBadge = (priority: string) => {
    switch (priority) {
      case 'urgent':
        return <Badge className="bg-red-500 text-white animate-pulse">Urgent</Badge>
      case 'high':
        return <Badge className="bg-orange-500/20 text-orange-500 border-orange-500/30">Haute</Badge>
      case 'normal':
        return <Badge className="bg-blue-500/20 text-blue-500 border-blue-500/30">Normale</Badge>
      case 'low':
        return <Badge variant="outline" className="border-slate-600 text-slate-400">Basse</Badge>
      default:
        return null
    }
  }

  const getTypeIcon = (notifType: string) => {
    switch (notifType) {
      case 'new_registration':
        return <Icons.users className="h-5 w-5 text-blue-500" />
      case 'user_activity':
        return <Icons.activity className="h-5 w-5 text-green-500" />
      case 'system_alert':
        return <Icons.alertTriangle className="h-5 w-5 text-yellow-500" />
      case 'kb_update':
        return <Icons.bookOpen className="h-5 w-5 text-purple-500" />
      case 'plan_expiring':
        return <Icons.creditCard className="h-5 w-5 text-orange-500" />
      default:
        return <Icons.bell className="h-5 w-5 text-slate-400" />
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white">Notifications</h2>
          <p className="text-slate-400">Centre de notifications administrateur</p>
        </div>
        {unreadCount > 0 && (
          <NotificationActions unreadCount={unreadCount} adminId={session?.user?.id || ''} />
        )}
      </div>

      {/* Stats rapides */}
      <div className="grid gap-4 md:grid-cols-4">
        <Link href="/super-admin/notifications?read=false">
          <Card className={`bg-slate-800 border-slate-700 cursor-pointer hover:bg-slate-750 transition ${read === 'false' ? 'ring-2 ring-blue-500' : ''}`}>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-2xl font-bold text-blue-500">{unreadCount}</p>
                  <p className="text-sm text-slate-400">Non lues</p>
                </div>
                <Icons.bell className="h-8 w-8 text-blue-500/20" />
              </div>
            </CardContent>
          </Card>
        </Link>

        <Link href="/super-admin/notifications?type=new_registration">
          <Card className={`bg-slate-800 border-slate-700 cursor-pointer hover:bg-slate-750 transition ${type === 'new_registration' ? 'ring-2 ring-green-500' : ''}`}>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-400">Inscriptions</p>
                </div>
                <Icons.users className="h-8 w-8 text-green-500/20" />
              </div>
            </CardContent>
          </Card>
        </Link>

        <Link href="/super-admin/notifications?type=system_alert">
          <Card className={`bg-slate-800 border-slate-700 cursor-pointer hover:bg-slate-750 transition ${type === 'system_alert' ? 'ring-2 ring-yellow-500' : ''}`}>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-400">Alertes système</p>
                </div>
                <Icons.alertTriangle className="h-8 w-8 text-yellow-500/20" />
              </div>
            </CardContent>
          </Card>
        </Link>

        <Link href="/super-admin/notifications">
          <Card className={`bg-slate-800 border-slate-700 cursor-pointer hover:bg-slate-750 transition ${type === 'all' && read === 'all' ? 'ring-2 ring-slate-500' : ''}`}>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-2xl font-bold text-white">{total}</p>
                  <p className="text-sm text-slate-400">Total</p>
                </div>
                <Icons.bell className="h-8 w-8 text-slate-400/20" />
              </div>
            </CardContent>
          </Card>
        </Link>
      </div>

      {/* Liste des notifications */}
      <Card className="bg-slate-800 border-slate-700">
        <CardHeader>
          <CardTitle className="text-white">Notifications ({total})</CardTitle>
          <CardDescription className="text-slate-400">
            Page {page} sur {totalPages || 1}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {notifsResult.rows.length === 0 ? (
            <div className="text-center py-12 text-slate-400">
              <Icons.checkCircle className="h-12 w-12 mx-auto mb-4 text-green-500" />
              <p>Aucune notification</p>
            </div>
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
                    notif.is_read
                      ? 'bg-slate-700/30'
                      : 'bg-slate-700/50 border-l-4 border-blue-500'
                  }`}
                >
                  <div className="h-10 w-10 rounded-full bg-slate-600 flex items-center justify-center shrink-0">
                    {getTypeIcon(notif.notification_type)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className={`font-medium ${notif.is_read ? 'text-slate-400' : 'text-white'}`}>
                        {notif.title}
                      </p>
                      {getPriorityBadge(notif.priority)}
                      {notif.is_actioned && (
                        <Badge variant="outline" className="border-green-500/30 text-green-500">
                          {notif.action_result === 'approved' ? 'Approuvé' :
                           notif.action_result === 'rejected' ? 'Rejeté' :
                           notif.action_result}
                        </Badge>
                      )}
                    </div>
                    <p className={`text-sm mt-1 ${notif.is_read ? 'text-slate-400' : 'text-slate-300'}`}>
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
                    <p className="text-sm text-slate-400">
                      {new Date(notif.created_at).toLocaleDateString('fr-FR')}
                    </p>
                    <p className="text-xs text-slate-400">
                      {new Date(notif.created_at).toLocaleTimeString('fr-FR', {
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 mt-6">
              <Link
                href={`/super-admin/notifications?type=${type}&read=${read}&page=${Math.max(1, page - 1)}`}
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
                href={`/super-admin/notifications?type=${type}&read=${read}&page=${Math.min(totalPages, page + 1)}`}
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
