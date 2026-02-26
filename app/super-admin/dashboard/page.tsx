import { Suspense } from 'react'
import { query } from '@/lib/db/postgres'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Icons } from '@/lib/icons'
import Link from 'next/link'

// Composant pour les stats utilisateurs
async function UserStats() {
  const result = await query(`
    SELECT
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE status = 'pending') as pending,
      COUNT(*) FILTER (WHERE status = 'approved') as approved,
      COUNT(*) FILTER (WHERE status = 'suspended') as suspended,
      COUNT(*) FILTER (WHERE status = 'rejected') as rejected,
      COUNT(*) FILTER (WHERE last_login_at > NOW() - INTERVAL '7 days') as active_7d,
      COUNT(*) FILTER (WHERE last_login_at > NOW() - INTERVAL '30 days') as active_30d,
      COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '30 days') as new_this_month
    FROM users
  `)
  const stats = result.rows[0]

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      <Card className="bg-slate-800 border-slate-700">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium text-slate-300">Total Utilisateurs</CardTitle>
          <Icons.users className="h-4 w-4 text-slate-400" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-white">{stats.total}</div>
          <p className="text-xs text-slate-400">
            +{stats.new_this_month} ce mois
          </p>
        </CardContent>
      </Card>

      <Card className="bg-slate-800 border-slate-700">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium text-slate-300">En Attente</CardTitle>
          <Icons.clock className="h-4 w-4 text-yellow-500" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-yellow-500">{stats.pending}</div>
          <p className="text-xs text-slate-400">
            Requièrent approbation
          </p>
        </CardContent>
      </Card>

      <Card className="bg-slate-800 border-slate-700">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium text-slate-300">Actifs (7j)</CardTitle>
          <Icons.activity className="h-4 w-4 text-green-500" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-green-500">{stats.active_7d}</div>
          <p className="text-xs text-slate-400">
            {stats.active_30d} actifs ce mois
          </p>
        </CardContent>
      </Card>

      <Card className="bg-slate-800 border-slate-700">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium text-slate-300">Suspendus</CardTitle>
          <Icons.xCircle className="h-4 w-4 text-red-500" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-red-500">{stats.suspended}</div>
          <p className="text-xs text-slate-400">
            {stats.rejected} rejetés
          </p>
        </CardContent>
      </Card>
    </div>
  )
}

// Composant pour les stats base de connaissance
async function KnowledgeBaseStats() {
  const result = await query(`
    SELECT
      COUNT(*) FILTER (WHERE is_active = TRUE) as total_docs,
      COUNT(*) FILTER (WHERE is_indexed = TRUE AND is_active = TRUE) as indexed_docs,
      COALESCE(SUM(chunk_count) FILTER (WHERE is_active = TRUE), 0) as total_chunks
    FROM knowledge_base
  `)
  const stats = result.rows[0]

  // Répartition par catégorie (sources actives uniquement)
  const categoryResult = await query(`
    SELECT category, COUNT(*) as count
    FROM knowledge_base
    WHERE is_active = TRUE
    GROUP BY category
    ORDER BY count DESC
  `)

  return (
    <Card className="bg-slate-800 border-slate-700">
      <CardHeader>
        <CardTitle className="text-white">Base de Connaissances</CardTitle>
        <CardDescription className="text-slate-400">
          Documents et indexation
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4 md:grid-cols-3">
          <div className="text-center">
            <div className="text-3xl font-bold text-white">{stats.total_docs}</div>
            <p className="text-sm text-slate-400">Documents</p>
          </div>
          <div className="text-center">
            <div className="text-3xl font-bold text-green-500">{stats.indexed_docs}</div>
            <p className="text-sm text-slate-400">Indexés</p>
          </div>
          <div className="text-center">
            <div className="text-3xl font-bold text-blue-500">{stats.total_chunks}</div>
            <p className="text-sm text-slate-400">Chunks</p>
          </div>
        </div>

        {categoryResult.rows.length > 0 && (
          <div className="mt-4 pt-4 border-t border-slate-700">
            <p className="text-sm text-slate-400 mb-2">Par catégorie :</p>
            <div className="flex flex-wrap gap-2">
              {categoryResult.rows.map((cat: { category: string; count: string }) => (
                <Badge key={cat.category} variant="secondary" className="bg-slate-700 text-slate-300">
                  {cat.category}: {cat.count}
                </Badge>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// Taux de change USD -> TND
const USD_TO_TND = 3.1

// Composant pour les coûts IA
async function AICostsStats() {
  const result = await query(`
    SELECT
      COALESCE(SUM(estimated_cost_usd), 0) as total_cost,
      COUNT(*) as total_operations,
      COUNT(DISTINCT user_id) as unique_users
    FROM ai_usage_logs
    WHERE created_at > NOW() - INTERVAL '30 days'
  `)
  const stats = result.rows[0]
  const costUSD = parseFloat(stats.total_cost)
  const costTND = (costUSD * USD_TO_TND).toFixed(3)

  return (
    <Card className="bg-slate-800 border-slate-700">
      <CardHeader>
        <CardTitle className="text-white">Coûts IA (30 jours)</CardTitle>
        <CardDescription className="text-slate-400">
          OpenAI embeddings + DeepSeek dossiers (Groq/Ollama = gratuit)
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4 md:grid-cols-3">
          <div className="text-center">
            <div className="text-3xl font-bold text-white">
              ${costUSD.toFixed(2)}
            </div>
            <p className="text-sm text-slate-400">{costTND} TND</p>
          </div>
          <div className="text-center">
            <div className="text-3xl font-bold text-blue-500">{stats.total_operations}</div>
            <p className="text-sm text-slate-400">Opérations</p>
          </div>
          <div className="text-center">
            <div className="text-3xl font-bold text-purple-500">{stats.unique_users}</div>
            <p className="text-sm text-slate-400">Utilisateurs</p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// Composant pour les inscriptions en attente
async function PendingRegistrations() {
  const result = await query(`
    SELECT id, email, nom, prenom, created_at
    FROM users
    WHERE status = 'pending'
    ORDER BY created_at DESC
    LIMIT 5
  `)

  return (
    <Card className="bg-slate-800 border-slate-700">
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-white">Inscriptions en attente</CardTitle>
          <CardDescription className="text-slate-400">
            Utilisateurs attendant approbation
          </CardDescription>
        </div>
        <Link href="/super-admin/users?status=pending">
          <Button variant="outline" size="sm" className="border-slate-600 text-slate-300 hover:bg-slate-700">
            Voir tout
          </Button>
        </Link>
      </CardHeader>
      <CardContent>
        {result.rows.length === 0 ? (
          <div className="text-center py-6 text-slate-400">
            <Icons.checkCircle className="h-12 w-12 mx-auto mb-2 text-green-500" />
            <p>Aucune demande en attente</p>
          </div>
        ) : (
          <div className="space-y-3">
            {result.rows.map((user: {
              id: string
              email: string
              nom: string
              prenom: string
              created_at: Date
            }) => (
              <div
                key={user.id}
                className="flex items-center justify-between p-3 rounded-lg bg-slate-700/50"
              >
                <div>
                  <p className="font-medium text-white">
                    {user.prenom} {user.nom}
                  </p>
                  <p className="text-sm text-slate-400">{user.email}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-400">
                    {new Date(user.created_at).toLocaleDateString('fr-FR')}
                  </span>
                  <Link href={`/super-admin/users/${user.id}`}>
                    <Button size="sm" className="bg-blue-600 hover:bg-blue-700">
                      Examiner
                    </Button>
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// Composant pour l'activité récente
async function RecentActivity() {
  const result = await query(`
    SELECT
      id, admin_email, action_type, target_identifier, created_at
    FROM admin_audit_logs
    ORDER BY created_at DESC
    LIMIT 10
  `)

  const getActionLabel = (action: string) => {
    const labels: Record<string, string> = {
      user_approved: 'Utilisateur approuvé',
      user_rejected: 'Utilisateur rejeté',
      user_suspended: 'Utilisateur suspendu',
      user_reactivated: 'Utilisateur réactivé',
      role_changed: 'Rôle modifié',
      plan_changed: 'Plan modifié',
      kb_upload: 'Document uploadé',
      kb_delete: 'Document supprimé',
      kb_index: 'Document indexé',
    }
    return labels[action] || action
  }

  return (
    <Card className="bg-slate-800 border-slate-700">
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-white">Activité récente</CardTitle>
          <CardDescription className="text-slate-400">
            Dernières actions administratives
          </CardDescription>
        </div>
        <Link href="/super-admin/audit-logs">
          <Button variant="outline" size="sm" className="border-slate-600 text-slate-300 hover:bg-slate-700">
            Voir tout
          </Button>
        </Link>
      </CardHeader>
      <CardContent>
        {result.rows.length === 0 ? (
          <div className="text-center py-6 text-slate-400">
            <Icons.activity className="h-12 w-12 mx-auto mb-2" />
            <p>Aucune activité récente</p>
          </div>
        ) : (
          <div className="space-y-2">
            {result.rows.map((log: {
              id: string
              admin_email: string
              action_type: string
              target_identifier: string
              created_at: Date
            }) => (
              <div
                key={log.id}
                className="flex items-center justify-between p-2 rounded-lg hover:bg-slate-700/50"
              >
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-full bg-slate-700 flex items-center justify-center">
                    <Icons.shield className="h-4 w-4 text-slate-400" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-white">
                      {getActionLabel(log.action_type)}
                    </p>
                    <p className="text-xs text-slate-400">
                      {log.target_identifier} par {log.admin_email}
                    </p>
                  </div>
                </div>
                <span className="text-xs text-slate-400">
                  {new Date(log.created_at).toLocaleString('fr-FR', {
                    day: '2-digit',
                    month: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit'
                  })}
                </span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export default function SuperAdminDashboard() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-white">Dashboard Super Admin</h2>
        <p className="text-slate-400">Vue d'ensemble de la plateforme</p>
      </div>

      {/* Stats utilisateurs */}
      <Suspense fallback={<div className="h-32 bg-slate-800 animate-pulse rounded-lg" />}>
        <UserStats />
      </Suspense>

      {/* Grille 2 colonnes */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Suspense fallback={<div className="h-64 bg-slate-800 animate-pulse rounded-lg" />}>
          <KnowledgeBaseStats />
        </Suspense>

        <Suspense fallback={<div className="h-64 bg-slate-800 animate-pulse rounded-lg" />}>
          <AICostsStats />
        </Suspense>
      </div>

      {/* Grille 2 colonnes */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Suspense fallback={<div className="h-96 bg-slate-800 animate-pulse rounded-lg" />}>
          <PendingRegistrations />
        </Suspense>

        <Suspense fallback={<div className="h-96 bg-slate-800 animate-pulse rounded-lg" />}>
          <RecentActivity />
        </Suspense>
      </div>
    </div>
  )
}
