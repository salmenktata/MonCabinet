import { Suspense } from 'react'
import Link from 'next/link'
import { query } from '@/lib/db/postgres'
import { PageHeader } from '@/components/super-admin/shared/PageHeader'
import { StatCard } from '@/components/dashboard/StatCard'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Icons } from '@/lib/icons'
import {
  Users,
  Clock,
  Activity,
  XCircle,
  Database,
  DollarSign,
  GitBranch,
  BarChart2,
  FlaskConical,
  Settings,
} from 'lucide-react'

// =============================================================================
// UserStats — 4 StatCard avec variants
// =============================================================================
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
  const s = result.rows[0]

  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      <StatCard
        title="Total Utilisateurs"
        value={parseInt(s.total)}
        subtitle={`+${s.new_this_month} ce mois`}
        icon={Users}
        variant="default"
        href="/super-admin/users"
      />
      <StatCard
        title="En Attente"
        value={parseInt(s.pending)}
        subtitle="Requièrent approbation"
        icon={Clock}
        variant={parseInt(s.pending) > 0 ? 'warning' : 'default'}
        href="/super-admin/users?status=pending"
        trend={parseInt(s.pending) > 0 ? { value: 1, label: 'Action requise' } : undefined}
      />
      <div className="hidden sm:block">
        <StatCard
          title="Actifs (7 jours)"
          value={parseInt(s.active_7d)}
          subtitle={`${s.active_30d} actifs ce mois`}
          icon={Activity}
          variant="success"
        />
      </div>
      <div className="hidden sm:block">
        <StatCard
          title="Suspendus"
          value={parseInt(s.suspended)}
          subtitle={`${s.rejected} rejetés`}
          icon={XCircle}
          variant={parseInt(s.suspended) > 0 ? 'danger' : 'default'}
        />
      </div>
    </div>
  )
}

// =============================================================================
// KnowledgeBaseStats — avec barre de progression d'indexation
// =============================================================================
async function KnowledgeBaseStats() {
  const result = await query(`
    SELECT
      COUNT(*) FILTER (WHERE is_active = TRUE) as total_docs,
      COUNT(*) FILTER (WHERE is_indexed = TRUE AND is_active = TRUE) as indexed_docs,
      COALESCE(SUM(chunk_count) FILTER (WHERE is_active = TRUE), 0) as total_chunks
    FROM knowledge_base
  `)
  const s = result.rows[0]

  const categoryResult = await query(`
    SELECT category, COUNT(*) as count
    FROM knowledge_base
    WHERE is_active = TRUE
    GROUP BY category
    ORDER BY count DESC
  `)

  const total = parseInt(s.total_docs)
  const indexed = parseInt(s.indexed_docs)
  const chunks = parseInt(s.total_chunks)
  const indexRate = total > 0 ? Math.round((indexed / total) * 100) : 0

  return (
    <Card className="bg-slate-800 border-slate-700">
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <div>
          <CardTitle className="text-white flex items-center gap-2">
            <Database className="h-4 w-4 text-blue-400" />
            Base de Connaissances
          </CardTitle>
          <CardDescription className="text-slate-400">Documents et indexation RAG</CardDescription>
        </div>
        <Link href="/super-admin/knowledge-base">
          <Button variant="ghost" size="sm" className="text-slate-400 hover:text-white text-xs">
            Gérer →
          </Button>
        </Link>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-3 gap-4">
          <div>
            <div className="text-2xl font-bold text-white">{total.toLocaleString('fr-FR')}</div>
            <p className="text-xs text-slate-400">Documents</p>
          </div>
          <div>
            <div className="text-2xl font-bold text-green-400">{indexed.toLocaleString('fr-FR')}</div>
            <p className="text-xs text-slate-400">Indexés</p>
          </div>
          <div>
            <div className="text-2xl font-bold text-blue-400">{chunks.toLocaleString('fr-FR')}</div>
            <p className="text-xs text-slate-400">Chunks</p>
          </div>
        </div>

        {/* Barre de progression d'indexation */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-slate-400">Taux d'indexation</span>
            <span className="text-xs font-medium text-slate-300">{indexRate}%</span>
          </div>
          <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-green-500 rounded-full transition-all"
              style={{ width: `${indexRate}%` }}
            />
          </div>
        </div>

        {categoryResult.rows.length > 0 && (
          <div className="pt-2 border-t border-slate-700">
            <p className="text-xs text-slate-400 mb-2">Par catégorie</p>
            <div className="flex flex-wrap gap-1.5">
              {categoryResult.rows.map((cat: { category: string; count: string }) => (
                <Badge key={cat.category} variant="secondary" className="bg-slate-700 text-slate-300 text-xs">
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

// =============================================================================
// AICostsStats — avec icône et layout amélioré
// =============================================================================
const USD_TO_TND = 3.1

async function AICostsStats() {
  const result = await query(`
    SELECT
      COALESCE(SUM(estimated_cost_usd), 0) as total_cost,
      COUNT(*) as total_operations,
      COUNT(DISTINCT user_id) as unique_users
    FROM ai_usage_logs
    WHERE created_at > NOW() - INTERVAL '30 days'
  `)
  const s = result.rows[0]
  const costUSD = parseFloat(s.total_cost)
  const costTND = (costUSD * USD_TO_TND).toFixed(3)

  return (
    <Card className="bg-slate-800 border-slate-700">
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <div>
          <CardTitle className="text-white flex items-center gap-2">
            <DollarSign className="h-4 w-4 text-green-400" />
            Coûts IA (30 jours)
          </CardTitle>
          <CardDescription className="text-slate-400">
            DeepSeek + OpenAI embeddings (Groq/Ollama = gratuit)
          </CardDescription>
        </div>
        <Link href="/super-admin/monitoring?tab=costs">
          <Button variant="ghost" size="sm" className="text-slate-400 hover:text-white text-xs">
            Détail →
          </Button>
        </Link>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <div className="text-2xl font-bold text-white">${costUSD.toFixed(2)}</div>
            <p className="text-xs text-slate-400">{costTND} TND</p>
          </div>
          <div>
            <div className="text-2xl font-bold text-blue-400">{parseInt(s.total_operations).toLocaleString('fr-FR')}</div>
            <p className="text-xs text-slate-400">Opérations</p>
          </div>
          <div>
            <div className="text-2xl font-bold text-purple-400">{parseInt(s.unique_users).toLocaleString('fr-FR')}</div>
            <p className="text-xs text-slate-400">Utilisateurs</p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// =============================================================================
// PendingRegistrations
// =============================================================================
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
            <Icons.checkCircle className="h-10 w-10 mx-auto mb-2 text-green-500" />
            <p className="text-sm">Aucune demande en attente</p>
          </div>
        ) : (
          <div className="space-y-2">
            {result.rows.map((user: {
              id: string
              email: string
              nom: string
              prenom: string
              created_at: Date
            }) => (
              <div
                key={user.id}
                className="flex items-center justify-between p-3 rounded-lg bg-slate-700/50 hover:bg-slate-700 transition-colors"
              >
                <div>
                  <p className="text-sm font-medium text-white">
                    {user.prenom} {user.nom}
                  </p>
                  <p className="text-xs text-slate-400">{user.email}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-500">
                    {new Date(user.created_at).toLocaleDateString('fr-FR')}
                  </span>
                  <Link href={`/super-admin/users/${user.id}`}>
                    <Button size="sm" className="bg-blue-600 hover:bg-blue-700 h-9 sm:h-7 text-xs">
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

// =============================================================================
// RecentActivity
// =============================================================================
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
      kb_rag_toggle: 'RAG document modifié',
    }
    return labels[action] || action
  }

  const getActionColor = (action: string) => {
    if (action.includes('approved') || action.includes('reactivated')) return 'text-green-500'
    if (action.includes('rejected') || action.includes('suspended') || action.includes('delete')) return 'text-red-400'
    return 'text-blue-400'
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
            <Icons.activity className="h-10 w-10 mx-auto mb-2" />
            <p className="text-sm">Aucune activité récente</p>
          </div>
        ) : (
          <div className="space-y-1">
            {result.rows.map((log: {
              id: string
              admin_email: string
              action_type: string
              target_identifier: string
              created_at: Date
            }) => (
              <div
                key={log.id}
                className="flex items-center justify-between p-2 rounded-lg hover:bg-slate-700/50 transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="h-7 w-7 rounded-full bg-slate-700 flex items-center justify-center shrink-0">
                    <Icons.shield className={`h-3.5 w-3.5 ${getActionColor(log.action_type)}`} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-white truncate">
                      {getActionLabel(log.action_type)}
                    </p>
                    <p className="text-xs text-slate-400 truncate">
                      {log.target_identifier} · {log.admin_email}
                    </p>
                  </div>
                </div>
                <span className="text-xs text-slate-500 shrink-0 ml-2">
                  {new Date(log.created_at).toLocaleString('fr-FR', {
                    day: '2-digit',
                    month: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
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

// =============================================================================
// Raccourcis rapides
// =============================================================================
const SHORTCUTS = [
  { label: 'Pipeline', href: '/super-admin/pipeline', icon: GitBranch, desc: 'Validation documents', color: 'text-blue-400' },
  { label: 'Évaluation RAG', href: '/super-admin/evaluation', icon: FlaskConical, desc: 'Benchmarks & métriques', color: 'text-purple-400' },
  { label: 'Monitoring', href: '/super-admin/monitoring', icon: BarChart2, desc: 'Santé système', color: 'text-green-400' },
  { label: 'Configuration', href: '/super-admin/settings', icon: Settings, desc: 'Paramètres globaux', color: 'text-slate-400' },
] as const

function QuickShortcuts() {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {SHORTCUTS.map((s) => (
        <Link key={s.href} href={s.href}>
          <div className="flex items-center gap-3 p-3 rounded-lg bg-slate-800 border border-slate-700 hover:bg-slate-700 hover:border-slate-600 transition-all cursor-pointer group">
            <s.icon className={`h-5 w-5 shrink-0 ${s.color} group-hover:scale-110 transition-transform`} />
            <div className="min-w-0">
              <p className="text-sm font-medium text-white truncate">{s.label}</p>
              <p className="text-xs text-slate-400 truncate">{s.desc}</p>
            </div>
          </div>
        </Link>
      ))}
    </div>
  )
}

// =============================================================================
// Page principale
// =============================================================================
export default function SuperAdminDashboard() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard Super Admin"
        description="Vue d'ensemble de la plateforme Qadhya"
      />

      {/* Stats utilisateurs */}
      <Suspense fallback={
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-28 bg-slate-800 animate-pulse rounded-xl border border-slate-700" />
          ))}
        </div>
      }>
        <UserStats />
      </Suspense>

      {/* KB + Coûts */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Suspense fallback={<div className="h-56 bg-slate-800 animate-pulse rounded-xl border border-slate-700" />}>
          <KnowledgeBaseStats />
        </Suspense>
        <Suspense fallback={<div className="h-56 bg-slate-800 animate-pulse rounded-xl border border-slate-700" />}>
          <AICostsStats />
        </Suspense>
      </div>

      {/* Inscriptions + Activité */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Suspense fallback={<div className="h-72 bg-slate-800 animate-pulse rounded-xl border border-slate-700" />}>
          <PendingRegistrations />
        </Suspense>
        <Suspense fallback={<div className="h-72 bg-slate-800 animate-pulse rounded-xl border border-slate-700" />}>
          <RecentActivity />
        </Suspense>
      </div>

      {/* Raccourcis rapides */}
      <div>
        <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-3">Raccourcis</p>
        <QuickShortcuts />
      </div>
    </div>
  )
}
