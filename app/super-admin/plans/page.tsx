import { Suspense } from 'react'
import { query } from '@/lib/db/postgres'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Icons } from '@/lib/icons'

// Stats des plans (incluant trial)
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
        WHEN 'trial' THEN 3
        WHEN 'expired_trial' THEN 4
        WHEN 'free' THEN 5
      END
  `)

  const planInfo = {
    trial: { label: 'Essai (Trial)', color: 'text-emerald-400', bg: 'bg-emerald-500/20', limits: '30 req IA (sans limite de temps)' },
    pro: { label: 'Pro', color: 'text-blue-400', bg: 'bg-blue-500/20', limits: '200 req IA/mois' },
    enterprise: { label: 'Expert', color: 'text-purple-400', bg: 'bg-purple-500/20', limits: 'Illimité' },
    expired_trial: { label: 'Essai expiré', color: 'text-red-400', bg: 'bg-red-500/20', limits: 'Accès limité' },
    free: { label: 'Gratuit (legacy)', color: 'text-slate-400', bg: 'bg-slate-600', limits: 'Sans IA' },
  }

  const plans = ['enterprise', 'pro', 'trial', 'expired_trial', 'free']

  return (
    <div className="grid gap-4 md:grid-cols-5">
      {plans.map(plan => {
        const info = planInfo[plan as keyof typeof planInfo]
        const stats = result.rows.find(r => r.plan === plan) || { count: '0' }

        return (
          <Card key={plan} className="bg-slate-800 border-slate-700">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className={`text-sm ${info.color}`}>{info.label}</CardTitle>
                <Badge className={`text-xs ${info.bg}`}>{info.label}</Badge>
              </div>
              <CardDescription className="text-slate-400 text-xs">
                {info.limits}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <div className="text-3xl font-bold text-white">{stats.count}</div>
                <p className="text-xs text-slate-400">utilisateurs</p>
              </div>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}

// Taux de conversion trial → payant
async function ConversionStats() {
  const result = await query(`
    SELECT
      COUNT(*) FILTER (WHERE plan = 'trial') AS active_trials,
      COUNT(*) FILTER (WHERE plan = 'expired_trial') AS expired_trials,
      COUNT(*) FILTER (WHERE plan IN ('pro', 'enterprise')) AS paid_users,
      COUNT(*) FILTER (WHERE plan = 'trial' AND trial_started_at > NOW() - INTERVAL '14 days') AS new_trials_14d,
      COUNT(*) FILTER (
        WHERE plan IN ('pro', 'enterprise')
          AND plan_expires_at > NOW() - INTERVAL '30 days'
      ) AS converted_30d
    FROM users
    WHERE status = 'approved'
  `)

  const stats = result.rows[0]
  const totalTrials = parseInt(stats.active_trials || 0) + parseInt(stats.expired_trials || 0)
  const paidUsers = parseInt(stats.paid_users || 0)
  const conversionRate = totalTrials > 0 ? Math.round((paidUsers / totalTrials) * 100) : 0

  return (
    <Card className="bg-slate-800 border-slate-700">
      <CardHeader>
        <CardTitle className="text-white">Entonnoir de conversion</CardTitle>
        <CardDescription className="text-slate-400">
          Trial → Payant
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="text-center">
            <p className="text-2xl font-bold text-emerald-400">{stats.active_trials}</p>
            <p className="text-xs text-slate-400 mt-1">Trials actifs</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-red-400">{stats.expired_trials}</p>
            <p className="text-xs text-slate-400 mt-1">Essais expirés</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-blue-400">{stats.paid_users}</p>
            <p className="text-xs text-slate-400 mt-1">Abonnés payants</p>
          </div>
          <div className="text-center">
            <p className={`text-2xl font-bold ${conversionRate >= 15 ? 'text-emerald-400' : conversionRate >= 8 ? 'text-yellow-400' : 'text-red-400'}`}>
              {conversionRate}%
            </p>
            <p className="text-xs text-slate-400 mt-1">Taux conversion</p>
          </div>
        </div>

        {/* Barre de progression */}
        <div className="mt-4">
          <div className="flex justify-between text-xs text-slate-400 mb-1">
            <span>Conversion globale</span>
            <span>Objectif : 15%</span>
          </div>
          <div className="w-full bg-slate-700 rounded-full h-2">
            <div
              className={`h-2 rounded-full transition-all ${conversionRate >= 15 ? 'bg-emerald-500' : 'bg-blue-500'}`}
              style={{ width: `${Math.min(conversionRate, 100)}%` }}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// Trials en cours
async function ActiveTrials() {
  const result = await query(`
    SELECT
      id, email, nom, prenom,
      trial_started_at,
      trial_ai_uses_remaining
    FROM users
    WHERE status = 'approved' AND plan = 'trial'
    ORDER BY trial_started_at DESC
    LIMIT 15
  `)

  return (
    <Card className="bg-slate-800 border-slate-700">
      <CardHeader>
        <CardTitle className="text-white">Trials en cours</CardTitle>
        <CardDescription className="text-slate-400">
          Utilisateurs en période d'essai active
        </CardDescription>
      </CardHeader>
      <CardContent>
        {result.rows.length === 0 ? (
          <div className="text-center py-8 text-slate-400">
            <Icons.clock className="h-12 w-12 mx-auto mb-2" />
            <p>Aucun trial actif</p>
          </div>
        ) : (
          <div className="space-y-2">
            {result.rows.map((user: {
              id: string
              email: string
              nom: string
              prenom: string
              trial_started_at: Date
              trial_ai_uses_remaining: number
            }) => {
              const usesLeft = user.trial_ai_uses_remaining ?? 30
              const isLow = usesLeft <= 5

              return (
                <div
                  key={user.id}
                  className={`flex items-center justify-between p-3 rounded-lg ${
                    isLow ? 'bg-orange-500/10 border border-orange-500/30' : 'bg-slate-700/50'
                  }`}
                >
                  <div>
                    <p className="font-medium text-white text-sm">
                      {user.prenom} {user.nom}
                    </p>
                    <p className="text-xs text-slate-400">{user.email}</p>
                  </div>
                  <div className="flex items-center gap-3 text-right">
                    <div>
                      <p className="text-xs text-slate-400">IA restante</p>
                      <p className={`text-sm font-medium ${isLow ? 'text-orange-400' : 'text-emerald-400'}`}>
                        {usesLeft}/30
                      </p>
                    </div>
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

// Plans payants + expirations
async function PaidPlans() {
  const result = await query(`
    SELECT
      id, email, nom, prenom, plan, plan_expires_at,
      EXTRACT(DAY FROM (plan_expires_at - NOW())) AS days_remaining
    FROM users
    WHERE status = 'approved' AND plan IN ('pro', 'enterprise')
    ORDER BY plan_expires_at ASC NULLS LAST
    LIMIT 15
  `)

  const getPlanBadge = (plan: string) => {
    switch (plan) {
      case 'pro':
        return <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30">Solo</Badge>
      case 'enterprise':
        return <Badge className="bg-purple-500/20 text-purple-400 border-purple-500/30">Cabinet</Badge>
      default:
        return <Badge variant="secondary">{plan}</Badge>
    }
  }

  return (
    <Card className="bg-slate-800 border-slate-700">
      <CardHeader>
        <CardTitle className="text-white">Abonnés payants</CardTitle>
        <CardDescription className="text-slate-400">Solo et Cabinet</CardDescription>
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
              days_remaining: number | null
            }) => {
              const daysLeft = user.days_remaining !== null ? Math.ceil(user.days_remaining) : null
              const isExpiringSoon = daysLeft !== null && daysLeft <= 30

              return (
                <div
                  key={user.id}
                  className={`flex items-center justify-between p-3 rounded-lg ${
                    isExpiringSoon ? 'bg-yellow-500/10 border border-yellow-500/30' : 'bg-slate-700/50'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div>
                      <p className="font-medium text-white text-sm">
                        {user.prenom} {user.nom}
                      </p>
                      <p className="text-xs text-slate-400">{user.email}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
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
        <p className="text-slate-400">Gérer les plans utilisateurs et suivre les conversions</p>
      </div>

      {/* Stats par plan */}
      <Suspense fallback={<div className="h-32 bg-slate-800 animate-pulse rounded-lg" />}>
        <PlansStats />
      </Suspense>

      {/* Entonnoir de conversion */}
      <Suspense fallback={<div className="h-40 bg-slate-800 animate-pulse rounded-lg" />}>
        <ConversionStats />
      </Suspense>

      {/* Limites des plans */}
      <Card className="bg-slate-800 border-slate-700">
        <CardHeader>
          <CardTitle className="text-white">Limites des Plans</CardTitle>
          <CardDescription className="text-slate-400">
            Configuration actuelle
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-700">
                  <th className="text-left py-3 px-4 text-slate-400 font-medium">Fonctionnalité</th>
                  <th className="text-center py-3 px-4 text-emerald-400 font-medium">Essai</th>
                  <th className="text-center py-3 px-4 text-blue-400 font-medium">Solo</th>
                  <th className="text-center py-3 px-4 text-purple-400 font-medium">Cabinet</th>
                </tr>
              </thead>
              <tbody className="text-white">
                <tr className="border-b border-slate-700/50">
                  <td className="py-3 px-4">Durée</td>
                  <td className="text-center py-3 px-4 text-emerald-400">Sans limite</td>
                  <td className="text-center py-3 px-4">Illimité</td>
                  <td className="text-center py-3 px-4">Illimité</td>
                </tr>
                <tr className="border-b border-slate-700/50">
                  <td className="py-3 px-4">Dossiers</td>
                  <td className="text-center py-3 px-4">10</td>
                  <td className="text-center py-3 px-4">Illimité</td>
                  <td className="text-center py-3 px-4">Illimité</td>
                </tr>
                <tr className="border-b border-slate-700/50">
                  <td className="py-3 px-4">Clients</td>
                  <td className="text-center py-3 px-4">20</td>
                  <td className="text-center py-3 px-4">Illimité</td>
                  <td className="text-center py-3 px-4">Illimité</td>
                </tr>
                <tr className="border-b border-slate-700/50">
                  <td className="py-3 px-4">Assistant IA</td>
                  <td className="text-center py-3 px-4 text-emerald-400">30 req (total)</td>
                  <td className="text-center py-3 px-4">200 req/mois</td>
                  <td className="text-center py-3 px-4">Illimité</td>
                </tr>
                <tr className="border-b border-slate-700/50">
                  <td className="py-3 px-4">Stockage</td>
                  <td className="text-center py-3 px-4">500 Mo</td>
                  <td className="text-center py-3 px-4">10 Go</td>
                  <td className="text-center py-3 px-4">Illimité</td>
                </tr>
                <tr className="border-b border-slate-700/50">
                  <td className="py-3 px-4">Prix</td>
                  <td className="text-center py-3 px-4 text-emerald-400">Gratuit</td>
                  <td className="text-center py-3 px-4">89 DT/mois</td>
                  <td className="text-center py-3 px-4">229 DT/mois</td>
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
          <ActiveTrials />
        </Suspense>

        <Suspense fallback={<div className="h-64 bg-slate-800 animate-pulse rounded-lg" />}>
          <PaidPlans />
        </Suspense>
      </div>
    </div>
  )
}
