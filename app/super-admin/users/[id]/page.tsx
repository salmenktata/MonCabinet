import { notFound } from 'next/navigation'
import { query } from '@/lib/db/postgres'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Icons } from '@/lib/icons'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { UserActions } from '@/components/super-admin/users/UserActions'

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function UserDetailPage({ params }: PageProps) {
  const { id } = await params

  // Récupérer l'utilisateur
  const userResult = await query(
    `SELECT
      u.*,
      approver.email as approved_by_email
    FROM users u
    LEFT JOIN users approver ON u.approved_by = approver.id
    WHERE u.id = $1`,
    [id]
  )

  if (userResult.rows.length === 0) {
    notFound()
  }

  const user = userResult.rows[0]

  // Récupérer l'historique d'audit pour cet utilisateur
  const auditResult = await query(
    `SELECT * FROM admin_audit_logs
     WHERE target_id = $1
     ORDER BY created_at DESC
     LIMIT 20`,
    [id]
  )

  // Récupérer les stats d'utilisation
  const statsResult = await query(
    `SELECT
      (SELECT COUNT(*) FROM clients WHERE user_id = $1) as clients_count,
      (SELECT COUNT(*) FROM dossiers WHERE user_id = $1) as dossiers_count,
      (SELECT COUNT(*) FROM factures WHERE user_id = $1) as factures_count,
      (SELECT COUNT(*) FROM documents WHERE user_id = $1) as documents_count
    `,
    [id]
  )
  const stats = statsResult.rows[0]

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return <Badge className="bg-yellow-500/20 text-yellow-500 border-yellow-500/30">En attente</Badge>
      case 'approved':
        return <Badge className="bg-green-500/20 text-green-500 border-green-500/30">Approuvé</Badge>
      case 'suspended':
        return <Badge className="bg-red-500/20 text-red-500 border-red-500/30">Suspendu</Badge>
      case 'rejected':
        return <Badge className="bg-slate-500/20 text-slate-400 border-slate-500/30">Rejeté</Badge>
      default:
        return <Badge variant="secondary">{status}</Badge>
    }
  }

  const getPlanBadge = (plan: string) => {
    switch (plan) {
      case 'free':
        return <Badge variant="secondary" className="bg-slate-600">Free</Badge>
      case 'pro':
        return <Badge className="bg-blue-500/20 text-blue-500 border-blue-500/30">Pro</Badge>
      case 'enterprise':
        return <Badge className="bg-purple-500/20 text-purple-500 border-purple-500/30">Enterprise</Badge>
      default:
        return <Badge variant="secondary">{plan}</Badge>
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/super-admin/users">
            <Button variant="ghost" size="icon" className="text-slate-400 hover:text-white">
              <Icons.arrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div>
            <h2 className="text-2xl font-bold text-white">
              {user.prenom} {user.nom}
            </h2>
            <p className="text-slate-400">{user.email}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {getStatusBadge(user.status)}
          {getPlanBadge(user.plan)}
        </div>
      </div>

      {/* Bandeau demande d'upgrade */}
      {user.upgrade_requested_plan && (
        <div className="rounded-xl border border-orange-500/30 bg-orange-500/10 px-5 py-4 flex items-start gap-4">
          <span className="text-2xl">🚀</span>
          <div className="flex-1 min-w-0">
            <p className="text-orange-300 font-semibold text-sm">
              Demande de passage au plan {user.upgrade_requested_plan === 'solo' ? 'Solo (89 DT/mois)' : 'Cabinet (229 DT/mois)'}
            </p>
            {user.upgrade_request_note && (
              <p className="text-orange-400 text-xs mt-1 italic">"{user.upgrade_request_note}"</p>
            )}
            <p className="text-orange-500 text-xs mt-1">
              Demande le {user.upgrade_requested_at ? new Date(user.upgrade_requested_at).toLocaleString('fr-FR') : '—'}
            </p>
          </div>
        </div>
      )}

      {/* Actions */}
      <UserActions user={user} />

      {/* Infos principales */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="bg-slate-800 border-slate-700">
          <CardHeader>
            <CardTitle className="text-white">Informations</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-slate-400">Email</p>
                <p className="text-white">{user.email}</p>
              </div>
              <div>
                <p className="text-sm text-slate-400">Rôle</p>
                <p className="text-white capitalize">{user.role || 'user'}</p>
              </div>
              <div>
                <p className="text-sm text-slate-400">Inscrit le</p>
                <p className="text-white">
                  {new Date(user.created_at).toLocaleDateString('fr-FR', {
                    day: '2-digit',
                    month: 'long',
                    year: 'numeric'
                  })}
                </p>
              </div>
              <div>
                <p className="text-sm text-slate-400">Dernière connexion</p>
                <p className="text-white">
                  {user.last_login_at
                    ? new Date(user.last_login_at).toLocaleString('fr-FR')
                    : 'Jamais'
                  }
                </p>
              </div>
              <div>
                <p className="text-sm text-slate-400">Nombre de connexions</p>
                <p className="text-white">{user.login_count || 0}</p>
              </div>
              <div>
                <p className="text-sm text-slate-400">Email vérifié</p>
                <p className="text-white">
                  {user.email_verified ? (
                    <Icons.checkCircle className="h-5 w-5 text-green-500" />
                  ) : (
                    <Icons.xCircle className="h-5 w-5 text-red-500" />
                  )}
                </p>
              </div>
            </div>

            {/* Infos d'approbation */}
            {user.approved_at && (
              <div className="pt-4 border-t border-slate-700">
                <p className="text-sm text-slate-400 mb-2">Approbation</p>
                <p className="text-white">
                  Approuvé le {new Date(user.approved_at).toLocaleDateString('fr-FR')}
                  {user.approved_by_email && ` par ${user.approved_by_email}`}
                </p>
              </div>
            )}

            {user.rejected_at && (
              <div className="pt-4 border-t border-slate-700">
                <p className="text-sm text-slate-400 mb-2">Rejet</p>
                <p className="text-white">
                  Rejeté le {new Date(user.rejected_at).toLocaleDateString('fr-FR')}
                </p>
                {user.rejection_reason && (
                  <p className="text-slate-400 mt-1">Raison: {user.rejection_reason}</p>
                )}
              </div>
            )}

            {user.suspended_at && (
              <div className="pt-4 border-t border-slate-700">
                <p className="text-sm text-slate-400 mb-2">Suspension</p>
                <p className="text-white">
                  Suspendu le {new Date(user.suspended_at).toLocaleDateString('fr-FR')}
                </p>
                {user.suspension_reason && (
                  <p className="text-slate-400 mt-1">Raison: {user.suspension_reason}</p>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Stats d'utilisation */}
        <Card className="bg-slate-800 border-slate-700">
          <CardHeader>
            <CardTitle className="text-white">Utilisation</CardTitle>
            <CardDescription className="text-slate-400">
              Statistiques du compte
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 rounded-lg bg-slate-700/50 text-center">
                <Icons.users className="h-8 w-8 mx-auto mb-2 text-blue-500" />
                <p className="text-2xl font-bold text-white">{stats.clients_count}</p>
                <p className="text-sm text-slate-400">Clients</p>
              </div>
              <div className="p-4 rounded-lg bg-slate-700/50 text-center">
                <Icons.dossiers className="h-8 w-8 mx-auto mb-2 text-green-500" />
                <p className="text-2xl font-bold text-white">{stats.dossiers_count}</p>
                <p className="text-sm text-slate-400">Dossiers</p>
              </div>
              <div className="p-4 rounded-lg bg-slate-700/50 text-center">
                <Icons.fileText className="h-8 w-8 mx-auto mb-2 text-purple-500" />
                <p className="text-2xl font-bold text-white">{stats.factures_count}</p>
                <p className="text-sm text-slate-400">Factures</p>
              </div>
              <div className="p-4 rounded-lg bg-slate-700/50 text-center">
                <Icons.documents className="h-8 w-8 mx-auto mb-2 text-orange-500" />
                <p className="text-2xl font-bold text-white">{stats.documents_count}</p>
                <p className="text-sm text-slate-400">Documents</p>
              </div>
            </div>

            {/* Plan */}
            <div className="mt-6 p-4 rounded-lg bg-slate-700/50">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-400">Plan actuel</p>
                  <p className="text-lg font-semibold text-white capitalize">{user.plan || 'free'}</p>
                </div>
                {user.plan_expires_at && (
                  <div className="text-right">
                    <p className="text-sm text-slate-400">Expire le</p>
                    <p className="text-white">
                      {new Date(user.plan_expires_at).toLocaleDateString('fr-FR')}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Historique d'audit */}
      <Card className="bg-slate-800 border-slate-700">
        <CardHeader>
          <CardTitle className="text-white">Historique des actions</CardTitle>
          <CardDescription className="text-slate-400">
            Actions administratives sur ce compte
          </CardDescription>
        </CardHeader>
        <CardContent>
          {auditResult.rows.length === 0 ? (
            <div className="text-center py-6 text-slate-400">
              <Icons.activity className="h-12 w-12 mx-auto mb-2" />
              <p>Aucun historique</p>
            </div>
          ) : (
            <div className="space-y-3">
              {auditResult.rows.map((log: {
                id: string
                admin_email: string
                action_type: string
                old_value: Record<string, unknown>
                new_value: Record<string, unknown>
                created_at: Date
              }) => (
                <div
                  key={log.id}
                  className="flex items-start gap-4 p-3 rounded-lg bg-slate-700/50"
                >
                  <div className="h-8 w-8 rounded-full bg-slate-600 flex items-center justify-center shrink-0">
                    <Icons.shield className="h-4 w-4 text-slate-300" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white">
                      {log.action_type.replace(/_/g, ' ')}
                    </p>
                    <p className="text-xs text-slate-400">
                      Par {log.admin_email}
                    </p>
                    {log.new_value && (
                      <p className="text-xs text-slate-400 mt-1">
                        {JSON.stringify(log.new_value)}
                      </p>
                    )}
                  </div>
                  <span className="text-xs text-slate-400 shrink-0">
                    {new Date(log.created_at).toLocaleString('fr-FR')}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
