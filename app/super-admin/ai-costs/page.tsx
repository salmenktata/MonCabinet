import { Suspense } from 'react'
import { query } from '@/lib/db/postgres'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Icons } from '@/lib/icons'

// Taux de change USD -> TND (approximatif)
const USD_TO_TND = 3.1

function formatTND(usdAmount: number): string {
  return (usdAmount * USD_TO_TND).toFixed(3)
}

// Stats globales
async function AICostsStats() {
  const result = await query(`
    SELECT
      COALESCE(SUM(cost_usd), 0) as total_cost,
      COUNT(*) as total_operations,
      COUNT(DISTINCT user_id) as unique_users,
      COALESCE(SUM(input_tokens + output_tokens), 0) as total_tokens
    FROM ai_usage_logs
    WHERE created_at > NOW() - INTERVAL '30 days'
  `)
  const stats = result.rows[0]

  // Stats par période
  const periodsResult = await query(`
    SELECT
      DATE_TRUNC('day', created_at) as date,
      SUM(cost_usd) as cost,
      COUNT(*) as operations
    FROM ai_usage_logs
    WHERE created_at > NOW() - INTERVAL '7 days'
    GROUP BY DATE_TRUNC('day', created_at)
    ORDER BY date DESC
  `)

  return (
    <>
      <div className="grid gap-4 md:grid-cols-4">
        <Card className="bg-slate-800 border-slate-700">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-slate-300">Coût Total (30j)</CardTitle>
            <Icons.dollar className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white">
              {formatTND(parseFloat(stats.total_cost))} TND
            </div>
            <p className="text-xs text-slate-500">${parseFloat(stats.total_cost).toFixed(2)} USD</p>
          </CardContent>
        </Card>

        <Card className="bg-slate-800 border-slate-700">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-slate-300">Opérations</CardTitle>
            <Icons.zap className="h-4 w-4 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white">{stats.total_operations}</div>
          </CardContent>
        </Card>

        <Card className="bg-slate-800 border-slate-700">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-slate-300">Utilisateurs IA</CardTitle>
            <Icons.users className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white">{stats.unique_users}</div>
          </CardContent>
        </Card>

        <Card className="bg-slate-800 border-slate-700">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-slate-300">Tokens Utilisés</CardTitle>
            <Icons.activity className="h-4 w-4 text-purple-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white">
              {parseInt(stats.total_tokens).toLocaleString()}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Coûts par jour */}
      <Card className="bg-slate-800 border-slate-700">
        <CardHeader>
          <CardTitle className="text-white">Coûts des 7 derniers jours</CardTitle>
        </CardHeader>
        <CardContent>
          {periodsResult.rows.length === 0 ? (
            <div className="text-center py-8 text-slate-500">
              Aucune donnée disponible
            </div>
          ) : (
            <div className="space-y-2">
              {periodsResult.rows.map((day: { date: Date; cost: string; operations: string }) => (
                <div
                  key={day.date.toString()}
                  className="flex items-center justify-between p-3 rounded-lg bg-slate-700/50"
                >
                  <div>
                    <p className="font-medium text-white">
                      {new Date(day.date).toLocaleDateString('fr-FR', {
                        weekday: 'long',
                        day: 'numeric',
                        month: 'long'
                      })}
                    </p>
                    <p className="text-sm text-slate-400">{day.operations} opérations</p>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-bold text-green-500">
                      {formatTND(parseFloat(day.cost))} TND
                    </p>
                    <p className="text-xs text-slate-500">${parseFloat(day.cost).toFixed(2)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </>
  )
}

// Top utilisateurs IA
async function TopAIUsers() {
  const result = await query(`
    SELECT
      u.id, u.email, u.nom, u.prenom,
      COUNT(*) as operations,
      SUM(a.cost_usd) as total_cost,
      SUM(a.input_tokens + a.output_tokens) as total_tokens
    FROM ai_usage_logs a
    JOIN users u ON a.user_id = u.id
    WHERE a.created_at > NOW() - INTERVAL '30 days'
    GROUP BY u.id, u.email, u.nom, u.prenom
    ORDER BY total_cost DESC
    LIMIT 10
  `)

  return (
    <Card className="bg-slate-800 border-slate-700">
      <CardHeader>
        <CardTitle className="text-white">Top Utilisateurs IA</CardTitle>
        <CardDescription className="text-slate-400">
          Consommation sur les 30 derniers jours
        </CardDescription>
      </CardHeader>
      <CardContent>
        {result.rows.length === 0 ? (
          <div className="text-center py-8 text-slate-500">
            <Icons.zap className="h-12 w-12 mx-auto mb-2" />
            <p>Aucune utilisation IA</p>
          </div>
        ) : (
          <div className="space-y-3">
            {result.rows.map((user: {
              id: string
              email: string
              nom: string
              prenom: string
              operations: string
              total_cost: string
              total_tokens: string
            }, index: number) => (
              <div
                key={user.id}
                className="flex items-center justify-between p-3 rounded-lg bg-slate-700/50"
              >
                <div className="flex items-center gap-4">
                  <div className="h-8 w-8 rounded-full bg-slate-600 flex items-center justify-center text-white font-bold">
                    {index + 1}
                  </div>
                  <div>
                    <p className="font-medium text-white">
                      {user.prenom} {user.nom}
                    </p>
                    <p className="text-sm text-slate-400">{user.email}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-lg font-bold text-green-500">
                    {formatTND(parseFloat(user.total_cost))} TND
                  </p>
                  <p className="text-xs text-slate-500">
                    {user.operations} ops • {parseInt(user.total_tokens).toLocaleString()} tokens
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// Répartition par type d'opération
async function OperationTypes() {
  const result = await query(`
    SELECT
      operation_type,
      COUNT(*) as count,
      SUM(cost_usd) as cost,
      SUM(input_tokens + output_tokens) as tokens
    FROM ai_usage_logs
    WHERE created_at > NOW() - INTERVAL '30 days'
    GROUP BY operation_type
    ORDER BY cost DESC
  `)

  const operationLabels: Record<string, string> = {
    chat: 'Chat Assistant',
    embedding: 'Embeddings',
    completion: 'Complétion',
    analysis: 'Analyse',
    summary: 'Résumé',
    search: 'Recherche RAG'
  }

  return (
    <Card className="bg-slate-800 border-slate-700">
      <CardHeader>
        <CardTitle className="text-white">Par Type d'Opération</CardTitle>
        <CardDescription className="text-slate-400">
          Répartition des coûts par type
        </CardDescription>
      </CardHeader>
      <CardContent>
        {result.rows.length === 0 ? (
          <div className="text-center py-8 text-slate-500">
            <Icons.pieChart className="h-12 w-12 mx-auto mb-2" />
            <p>Aucune donnée</p>
          </div>
        ) : (
          <div className="space-y-3">
            {result.rows.map((op: {
              operation_type: string
              count: string
              cost: string
              tokens: string
            }) => (
              <div
                key={op.operation_type}
                className="flex items-center justify-between p-3 rounded-lg bg-slate-700/50"
              >
                <div>
                  <p className="font-medium text-white">
                    {operationLabels[op.operation_type] || op.operation_type}
                  </p>
                  <p className="text-sm text-slate-400">{op.count} opérations</p>
                </div>
                <div className="text-right">
                  <p className="text-lg font-bold text-green-500">
                    {formatTND(parseFloat(op.cost))} TND
                  </p>
                  <p className="text-xs text-slate-500">
                    {parseInt(op.tokens).toLocaleString()} tokens
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export default function AICostsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-white">Coûts IA</h2>
        <p className="text-slate-400">Monitoring de l'utilisation OpenAI</p>
      </div>

      {/* Stats */}
      <Suspense fallback={<div className="h-32 bg-slate-800 animate-pulse rounded-lg" />}>
        <AICostsStats />
      </Suspense>

      {/* Grille 2 colonnes */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Suspense fallback={<div className="h-64 bg-slate-800 animate-pulse rounded-lg" />}>
          <TopAIUsers />
        </Suspense>

        <Suspense fallback={<div className="h-64 bg-slate-800 animate-pulse rounded-lg" />}>
          <OperationTypes />
        </Suspense>
      </div>
    </div>
  )
}
