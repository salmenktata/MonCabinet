'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import {
  Users,
  MessageSquare,
  ThumbsUp,
  DollarSign,
  UserCheck,
  UserX,
  TrendingDown,
  Activity,
} from 'lucide-react'

const USD_TO_TND = 3.1

interface OverviewData {
  users: {
    total: number
    active_7d: number
    active_30d: number
    never_connected: number
    pending: number
    activation_rate: number
  }
  rag: {
    today: number
    week: number
    month: number
    abstention_rate_30d: number
  }
  feedback: {
    positive: number
    negative: number
    total: number
    satisfaction_rate: number
  }
  costs: {
    total_cost_usd: number
    total_tokens: number
  }
}

function StatCard({
  title,
  value,
  sub,
  icon: Icon,
  badge,
  badgeVariant = 'secondary',
}: {
  title: string
  value: string | number
  sub?: string
  icon: React.ElementType
  badge?: string
  badgeVariant?: 'default' | 'secondary' | 'destructive' | 'outline'
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
        {badge && <Badge variant={badgeVariant} className="mt-2 text-xs">{badge}</Badge>}
      </CardContent>
    </Card>
  )
}

export function OverviewTab() {
  const [data, setData] = useState<OverviewData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/admin/analytics/overview')
      .then(r => r.json())
      .then(d => { if (d.success) setData(d) })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-28 rounded-lg" />
        ))}
      </div>
    )
  }

  if (!data) return <p className="text-muted-foreground">Impossible de charger les données.</p>

  const { users, rag, feedback, costs } = data
  const costTND = (costs.total_cost_usd * USD_TO_TND).toFixed(3)
  const totalTokensK = (costs.total_tokens / 1000).toFixed(0)

  return (
    <div className="space-y-6">
      {/* Utilisateurs */}
      <div>
        <h3 className="text-sm font-semibold text-muted-foreground uppercase mb-3">Utilisateurs</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <StatCard title="Total" value={users.total} icon={Users} />
          <StatCard
            title="Actifs 7j"
            value={users.active_7d}
            icon={UserCheck}
            badge={`${Math.round((users.active_7d / Math.max(users.total, 1)) * 100)}%`}
            badgeVariant="default"
          />
          <StatCard
            title="Actifs 30j"
            value={users.active_30d}
            icon={Activity}
            badge={`${Math.round((users.active_30d / Math.max(users.total, 1)) * 100)}%`}
          />
          <StatCard
            title="Jamais connectés"
            value={users.never_connected}
            icon={UserX}
            badgeVariant="destructive"
          />
          <StatCard
            title="En attente"
            value={users.pending}
            icon={Users}
            badge={users.pending > 0 ? `${users.pending} à approuver` : undefined}
            badgeVariant="destructive"
          />
          <StatCard
            title="Taux d'activation"
            value={`${users.activation_rate}%`}
            icon={UserCheck}
            sub="Approuvés s'étant connectés"
          />
        </div>
      </div>

      {/* RAG */}
      <div>
        <h3 className="text-sm font-semibold text-muted-foreground uppercase mb-3">Requêtes RAG</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard title="Aujourd'hui" value={rag.today} icon={MessageSquare} />
          <StatCard title="Cette semaine" value={rag.week} icon={MessageSquare} />
          <StatCard title="Ce mois" value={rag.month} icon={MessageSquare} />
          <StatCard
            title="Taux d'abstention (30j)"
            value={`${rag.abstention_rate_30d}%`}
            icon={TrendingDown}
            badge={rag.abstention_rate_30d > 20 ? 'Élevé' : 'Normal'}
            badgeVariant={rag.abstention_rate_30d > 20 ? 'destructive' : 'secondary'}
          />
        </div>
      </div>

      {/* Feedback & Coûts */}
      <div>
        <h3 className="text-sm font-semibold text-muted-foreground uppercase mb-3">
          Satisfaction & Coûts IA (mois en cours)
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard
            title="Satisfaction (30j)"
            value={`${feedback.satisfaction_rate}%`}
            icon={ThumbsUp}
            sub={`${feedback.positive} pos. / ${feedback.negative} nég.`}
            badge={
              feedback.satisfaction_rate >= 70
                ? 'Bonne'
                : feedback.satisfaction_rate >= 50
                ? 'Moyenne'
                : 'Faible'
            }
            badgeVariant={
              feedback.satisfaction_rate >= 70
                ? 'default'
                : feedback.satisfaction_rate >= 50
                ? 'secondary'
                : 'destructive'
            }
          />
          <StatCard
            title="Coût IA du mois"
            value={`$${costs.total_cost_usd.toFixed(3)}`}
            icon={DollarSign}
            sub={`≈ ${costTND} TND`}
          />
          <StatCard
            title="Tokens consommés"
            value={`${totalTokensK}K`}
            icon={Activity}
            sub="Ce mois (input + output)"
          />
          <StatCard
            title="Feedbacks reçus (30j)"
            value={feedback.total}
            icon={ThumbsUp}
            sub={`${feedback.positive} positifs`}
          />
        </div>
      </div>
    </div>
  )
}
