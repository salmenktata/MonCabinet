'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import Link from 'next/link'
import { ChevronLeft, ChevronRight, ExternalLink, Download } from 'lucide-react'

const USD_TO_TND = 3.1

interface UserRow {
  id: string
  email: string
  nom: string
  prenom: string
  plan: string
  status: string
  last_login_at: string | null
  login_count: number
  dossiers_count: number
  clients_count: number
  tokens_month: number
  cost_month_usd: number
  rag_7d: number
  satisfaction_pct: number
}

interface UsersData {
  users: UserRow[]
  total: number
  page: number
  totalPages: number
}

function formatDate(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function statusBadge(status: string) {
  const map: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
    approved: { label: 'Approuvé', variant: 'default' },
    pending: { label: 'En attente', variant: 'destructive' },
    suspended: { label: 'Suspendu', variant: 'destructive' },
    rejected: { label: 'Rejeté', variant: 'outline' },
  }
  const s = map[status] || { label: status, variant: 'secondary' as const }
  return <Badge variant={s.variant}>{s.label}</Badge>
}

function planBadge(plan: string) {
  const map: Record<string, string> = {
    free: 'Gratuit', pro: 'Pro', enterprise: 'Entreprise', trial: 'Essai',
  }
  return <Badge variant="outline">{map[plan] || plan}</Badge>
}

function exportCSV(users: UserRow[]) {
  const headers = ['Email', 'Nom', 'Prénom', 'Plan', 'Statut', 'Dernière connexion', 'Connexions', 'RAG 7j', 'Tokens (mois)', 'Coût USD (mois)', 'Dossiers', 'Clients', 'Satisfaction %']
  const rows = users.map(u => [
    u.email, u.nom, u.prenom, u.plan, u.status,
    u.last_login_at || '', u.login_count, u.rag_7d,
    u.tokens_month, u.cost_month_usd.toFixed(4),
    u.dossiers_count, u.clients_count,
    u.satisfaction_pct >= 0 ? u.satisfaction_pct : '',
  ])
  const csv = [headers, ...rows].map(r => r.join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `analytics-users-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

export function UsersTableTab() {
  const [data, setData] = useState<UsersData | null>(null)
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [statusFilter, setStatusFilter] = useState('all')
  const [planFilter, setPlanFilter] = useState('all')
  const [activityFilter, setActivityFilter] = useState('all')

  const fetchUsers = useCallback(async (p: number) => {
    setLoading(true)
    const params = new URLSearchParams({ page: String(p) })
    if (statusFilter !== 'all') params.set('status', statusFilter)
    if (planFilter !== 'all') params.set('plan', planFilter)
    if (activityFilter !== 'all') params.set('filter', activityFilter)

    try {
      const r = await fetch(`/api/admin/analytics/users?${params}`)
      const d = await r.json()
      if (d.success) setData(d)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [statusFilter, planFilter, activityFilter])

  useEffect(() => {
    setPage(1)
    fetchUsers(1)
  }, [statusFilter, planFilter, activityFilter, fetchUsers])

  useEffect(() => {
    fetchUsers(page)
  }, [page, fetchUsers])

  return (
    <div className="space-y-4">
      {/* Filtres */}
      <div className="flex flex-wrap gap-3 items-center justify-between">
        <div className="flex gap-3 flex-wrap">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-36">
              <SelectValue placeholder="Statut" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous statuts</SelectItem>
              <SelectItem value="approved">Approuvé</SelectItem>
              <SelectItem value="pending">En attente</SelectItem>
              <SelectItem value="suspended">Suspendu</SelectItem>
              <SelectItem value="rejected">Rejeté</SelectItem>
            </SelectContent>
          </Select>
          <Select value={planFilter} onValueChange={setPlanFilter}>
            <SelectTrigger className="w-36">
              <SelectValue placeholder="Plan" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous plans</SelectItem>
              <SelectItem value="free">Gratuit</SelectItem>
              <SelectItem value="pro">Pro</SelectItem>
              <SelectItem value="enterprise">Entreprise</SelectItem>
              <SelectItem value="trial">Essai</SelectItem>
            </SelectContent>
          </Select>
          <Select value={activityFilter} onValueChange={setActivityFilter}>
            <SelectTrigger className="w-44">
              <SelectValue placeholder="Activité" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous</SelectItem>
              <SelectItem value="never_connected">Jamais connectés</SelectItem>
              <SelectItem value="inactive">Inactifs 30j+</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {data && (
          <Button variant="outline" size="sm" onClick={() => exportCSV(data.users)}>
            <Download className="h-4 w-4 mr-2" />
            CSV
          </Button>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {data ? `${data.total} utilisateurs` : 'Utilisateurs'}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : !data || data.users.length === 0 ? (
            <p className="text-muted-foreground p-6 text-center">Aucun utilisateur trouvé.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="text-left px-4 py-3 font-medium">Utilisateur</th>
                    <th className="text-left px-4 py-3 font-medium">Plan / Statut</th>
                    <th className="text-left px-4 py-3 font-medium">Dernière connexion</th>
                    <th className="text-right px-4 py-3 font-medium">Connexions</th>
                    <th className="text-right px-4 py-3 font-medium">RAG 7j</th>
                    <th className="text-right px-4 py-3 font-medium">Tokens (mois)</th>
                    <th className="text-right px-4 py-3 font-medium">Coût (mois)</th>
                    <th className="text-right px-4 py-3 font-medium">Dossiers</th>
                    <th className="text-right px-4 py-3 font-medium">Satisfaction</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {data.users.map(user => (
                    <tr key={user.id} className="border-b hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3">
                        <div className="font-medium">{user.nom} {user.prenom}</div>
                        <div className="text-muted-foreground text-xs">{user.email}</div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-1">
                          {planBadge(user.plan)}
                          {statusBadge(user.status)}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground text-xs">
                        {user.last_login_at ? formatDate(user.last_login_at) : (
                          <Badge variant="destructive" className="text-xs">Jamais</Badge>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">{user.login_count}</td>
                      <td className="px-4 py-3 text-right">{user.rag_7d}</td>
                      <td className="px-4 py-3 text-right">{(user.tokens_month / 1000).toFixed(1)}K</td>
                      <td className="px-4 py-3 text-right">
                        <div className="text-xs">${user.cost_month_usd.toFixed(4)}</div>
                        <div className="text-muted-foreground text-xs">
                          {(user.cost_month_usd * USD_TO_TND).toFixed(3)} TND
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span title={`${user.clients_count} clients`}>
                          {user.dossiers_count} / {user.clients_count}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        {user.satisfaction_pct >= 0 ? (
                          <Badge variant={user.satisfaction_pct >= 70 ? 'default' : user.satisfaction_pct >= 50 ? 'secondary' : 'destructive'}>
                            {user.satisfaction_pct}%
                          </Badge>
                        ) : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <Link href={`/super-admin/users`} title="Voir dans Utilisateurs">
                          <Button variant="ghost" size="icon" className="h-7 w-7">
                            <ExternalLink className="h-3 w-3" />
                          </Button>
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {data && data.totalPages > 1 && (
        <div className="flex items-center justify-center gap-3">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm text-muted-foreground">
            Page {page} / {data.totalPages}
          </span>
          <Button variant="outline" size="sm" disabled={page >= data.totalPages} onClick={() => setPage(p => p + 1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  )
}
