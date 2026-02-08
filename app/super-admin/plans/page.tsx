import { Suspense } from 'react'
import { query } from '@/lib/db/postgres'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Icons } from '@/lib/icons'

// Stats des plans
async function PlansStats() {
  const result = await query(`
    SELECT
      plan,
      COUNT(*) as count
    FROM users
    WHERE status = 'approved'
    GROUP BY plan
    ORDER BY
      CASE plan
        WHEN 'enterprise' THEN 1
        WHEN 'pro' THEN 2
        WHEN 'free' THEN 3
      END
  `)

  const planInfo = {
    free: { label: 'Free', color: 'text-slate-400', bg: 'bg-slate-600', limits: '5 dossiers, 10 clients' },
    pro: { label: 'Pro', color: 'text-blue-500', bg: 'bg-blue-500/20', limits: '50 dossiers, 100 clients' },
    enterprise: { label: 'Enterprise', color: 'text-purple-500', bg: 'bg-purple-500/20', limits: 'Illimité' }
  }

  return (
    <div className="grid gap-4 md:grid-cols-3">
      {['free', 'pro', 'enterprise'].map(plan => {
        const info = planInfo[plan as keyof typeof planInfo]
        const stats = result.rows.find(r => r.plan === plan) || { count: '0' }

        return (
          <Card key={plan} className="bg-slate-800 border-slate-700">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className={`text-lg ${info.color}`}>{info.label}</CardTitle>
                <Badge className={info.bg}>{info.label}</Badge>
              </div>
              <CardDescription className="text-slate-400">
                {info.limits}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-4">
                <div className="text-4xl font-bold text-white">{stats.count}</div>
                <p className="text-sm text-slate-400">utilisateurs</p>
              </div>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}

// Liste des utilisateurs par plan
async function UsersByPlan() {
  const result = await query(`
    SELECT
      id, email, nom, prenom, plan, plan_expires_at, status
    FROM users
    WHERE status = 'approved' AND plan != 'free'
    ORDER BY
      CASE plan WHEN 'enterprise' THEN 1 WHEN 'pro' THEN 2 END,
      plan_expires_at ASC NULLS LAST
    LIMIT 20
  `)

  const getPlanBadge = (plan: string) => {
    switch (plan) {
      case 'pro':
        return <Badge className="bg-blue-500/20 text-blue-500 border-blue-500/30">Pro</Badge>
      case 'enterprise':
        return <Badge className="bg-purple-500/20 text-purple-500 border-purple-500/30">Enterprise</Badge>
      default:
        return <Badge variant="secondary">{plan}</Badge>
    }
  }

  return (
    <Card className="bg-slate-800 border-slate-700">
      <CardHeader>
        <CardTitle className="text-white">Abonnés Payants</CardTitle>
        <CardDescription className="text-slate-400">
          Utilisateurs Pro et Enterprise
        </CardDescription>
      </CardHeader>
      <CardContent>
        {result.rows.length === 0 ? (
          <div className="text-center py-8 text-slate-400">
            <Icons.creditCard className="h-12 w-12 mx-auto mb-2" />
            <p>Aucun abonné payant</p>
          </div>
        ) : (
          <div className="space-y-3">
            {result.rows.map((user: {
              id: string
              email: string
              nom: string
              prenom: string
              plan: string
              plan_expires_at: Date | null
            }) => (
              <div
                key={user.id}
                className="flex items-center justify-between p-3 rounded-lg bg-slate-700/50"
              >
                <div className="flex items-center gap-4">
                  <div>
                    <p className="font-medium text-white">
                      {user.prenom} {user.nom}
                    </p>
                    <p className="text-sm text-slate-400">{user.email}</p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  {getPlanBadge(user.plan)}
                  {user.plan_expires_at && (
                    <div className="text-right">
                      <p className="text-xs text-slate-400">Expire le</p>
                      <p className="text-sm text-white">
                        {new Date(user.plan_expires_at).toLocaleDateString('fr-FR')}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// Plans expirant bientôt
async function ExpiringPlans() {
  const result = await query(`
    SELECT
      id, email, nom, prenom, plan, plan_expires_at
    FROM users
    WHERE status = 'approved'
      AND plan_expires_at IS NOT NULL
      AND plan_expires_at BETWEEN NOW() AND NOW() + INTERVAL '30 days'
    ORDER BY plan_expires_at ASC
    LIMIT 10
  `)

  const getDaysRemaining = (date: Date) => {
    const diff = new Date(date).getTime() - Date.now()
    return Math.ceil(diff / (1000 * 60 * 60 * 24))
  }

  return (
    <Card className="bg-slate-800 border-slate-700">
      <CardHeader>
        <CardTitle className="text-white">Expirations à venir</CardTitle>
        <CardDescription className="text-slate-400">
          Plans expirant dans les 30 prochains jours
        </CardDescription>
      </CardHeader>
      <CardContent>
        {result.rows.length === 0 ? (
          <div className="text-center py-8 text-slate-400">
            <Icons.checkCircle className="h-12 w-12 mx-auto mb-2 text-green-500" />
            <p>Aucune expiration prévue</p>
          </div>
        ) : (
          <div className="space-y-3">
            {result.rows.map((user: {
              id: string
              email: string
              nom: string
              prenom: string
              plan: string
              plan_expires_at: Date
            }) => {
              const days = getDaysRemaining(user.plan_expires_at)
              const isUrgent = days <= 7

              return (
                <div
                  key={user.id}
                  className={`flex items-center justify-between p-3 rounded-lg ${
                    isUrgent ? 'bg-red-500/10 border border-red-500/30' : 'bg-slate-700/50'
                  }`}
                >
                  <div>
                    <p className="font-medium text-white">
                      {user.prenom} {user.nom}
                    </p>
                    <p className="text-sm text-slate-400">{user.email}</p>
                  </div>
                  <div className="text-right">
                    <Badge className={isUrgent ? 'bg-red-500' : 'bg-yellow-500/20 text-yellow-500'}>
                      {days} jour{days > 1 ? 's' : ''}
                    </Badge>
                    <p className="text-xs text-slate-400 mt-1">
                      {new Date(user.plan_expires_at).toLocaleDateString('fr-FR')}
                    </p>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export default function PlansPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-white">Plans & Abonnements</h2>
        <p className="text-slate-400">Gérer les plans utilisateurs</p>
      </div>

      {/* Stats */}
      <Suspense fallback={<div className="h-32 bg-slate-800 animate-pulse rounded-lg" />}>
        <PlansStats />
      </Suspense>

      {/* Limites des plans */}
      <Card className="bg-slate-800 border-slate-700">
        <CardHeader>
          <CardTitle className="text-white">Limites des Plans</CardTitle>
          <CardDescription className="text-slate-400">
            Configuration actuelle des limites
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-700">
                  <th className="text-left py-3 px-4 text-slate-400 font-medium">Fonctionnalité</th>
                  <th className="text-center py-3 px-4 text-slate-400 font-medium">Free</th>
                  <th className="text-center py-3 px-4 text-blue-500 font-medium">Pro</th>
                  <th className="text-center py-3 px-4 text-purple-500 font-medium">Enterprise</th>
                </tr>
              </thead>
              <tbody className="text-white">
                <tr className="border-b border-slate-700/50">
                  <td className="py-3 px-4">Dossiers</td>
                  <td className="text-center py-3 px-4">5</td>
                  <td className="text-center py-3 px-4">50</td>
                  <td className="text-center py-3 px-4">Illimité</td>
                </tr>
                <tr className="border-b border-slate-700/50">
                  <td className="py-3 px-4">Clients</td>
                  <td className="text-center py-3 px-4">10</td>
                  <td className="text-center py-3 px-4">100</td>
                  <td className="text-center py-3 px-4">Illimité</td>
                </tr>
                <tr className="border-b border-slate-700/50">
                  <td className="py-3 px-4">Assistant IA</td>
                  <td className="text-center py-3 px-4">
                    <Icons.xCircle className="h-5 w-5 mx-auto text-red-500" />
                  </td>
                  <td className="text-center py-3 px-4">100 req/mois</td>
                  <td className="text-center py-3 px-4">Illimité</td>
                </tr>
                <tr className="border-b border-slate-700/50">
                  <td className="py-3 px-4">Stockage documents</td>
                  <td className="text-center py-3 px-4">100 MB</td>
                  <td className="text-center py-3 px-4">5 GB</td>
                  <td className="text-center py-3 px-4">Illimité</td>
                </tr>
                <tr>
                  <td className="py-3 px-4">Support</td>
                  <td className="text-center py-3 px-4">Email</td>
                  <td className="text-center py-3 px-4">Email + Chat</td>
                  <td className="text-center py-3 px-4">Prioritaire</td>
                </tr>
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Grille 2 colonnes */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Suspense fallback={<div className="h-64 bg-slate-800 animate-pulse rounded-lg" />}>
          <UsersByPlan />
        </Suspense>

        <Suspense fallback={<div className="h-64 bg-slate-800 animate-pulse rounded-lg" />}>
          <ExpiringPlans />
        </Suspense>
      </div>
    </div>
  )
}
