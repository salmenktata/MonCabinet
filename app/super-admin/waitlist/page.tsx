import { Suspense } from 'react'
import { query } from '@/lib/db/postgres'
import { PageHeader } from '@/components/super-admin/shared/PageHeader'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { WaitlistActions, WaitlistInviteButton } from './WaitlistActions'

async function WaitlistStats() {
  const result = await query(`
    SELECT
      COUNT(*) FILTER (WHERE status = 'pending') AS pending,
      COUNT(*) FILTER (WHERE status = 'invited') AS invited,
      COUNT(*) FILTER (WHERE status = 'converted') AS converted,
      COUNT(*) AS total
    FROM waitlist
  `)
  const s = result.rows[0]

  return (
    <div className="grid gap-4 grid-cols-4">
      {[
        { label: 'En attente', value: s.pending, color: 'text-yellow-400' },
        { label: 'Invités', value: s.invited, color: 'text-blue-400' },
        { label: 'Convertis', value: s.converted, color: 'text-emerald-400' },
        { label: 'Total inscrits', value: s.total, color: 'text-foreground' },
      ].map((stat) => (
        <Card key={stat.label} className="bg-card border-border">
          <CardContent className="pt-6">
            <p className={`text-3xl font-bold ${stat.color}`}>{stat.value}</p>
            <p className="text-sm text-muted-foreground mt-1">{stat.label}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

async function WaitlistTable() {
  const result = await query(`
    SELECT
      w.id, w.email, w.nom, w.prenom, w.source,
      w.status, w.invited_at, w.converted_at,
      w.created_at, w.admin_notes
    FROM waitlist w
    ORDER BY
      CASE w.status WHEN 'pending' THEN 1 WHEN 'invited' THEN 2 ELSE 3 END,
      w.created_at ASC
    LIMIT 100
  `)

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30">En attente</Badge>
      case 'invited':
        return <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30">Invité</Badge>
      case 'converted':
        return <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30">Converti</Badge>
      default:
        return <Badge variant="secondary">{status}</Badge>
    }
  }

  return (
    <Card className="bg-card border-border">
      <CardHeader>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <CardTitle className="text-foreground">Liste d'attente</CardTitle>
            <CardDescription className="text-muted-foreground">
              {result.rows.length} inscrit{result.rows.length > 1 ? 's' : ''}
            </CardDescription>
          </div>
          <WaitlistActions pendingIds={result.rows.filter(r => r.status === 'pending').map(r => r.id)} />
        </div>
      </CardHeader>
      <CardContent>
        {result.rows.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <p className="text-lg font-medium mb-2">Aucune inscription pour le moment</p>
            <p className="text-sm">Partagez le lien <code className="text-blue-400">/acces-anticipe</code> pour commencer</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-3 px-3 text-muted-foreground font-medium">Nom</th>
                  <th className="text-left py-3 px-3 text-muted-foreground font-medium">Email</th>
                  <th className="text-left py-3 px-3 text-muted-foreground font-medium">Source</th>
                  <th className="text-left py-3 px-3 text-muted-foreground font-medium">Statut</th>
                  <th className="text-left py-3 px-3 text-muted-foreground font-medium">Inscrit le</th>
                  <th className="text-left py-3 px-3 text-muted-foreground font-medium">Action</th>
                </tr>
              </thead>
              <tbody>
                {result.rows.map((row: {
                  id: string
                  email: string
                  nom: string
                  prenom: string
                  source: string
                  status: string
                  invited_at: Date | null
                  converted_at: Date | null
                  created_at: Date
                }) => (
                  <tr key={row.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                    <td className="py-3 px-3 text-foreground">
                      {row.prenom} {row.nom}
                    </td>
                    <td className="py-3 px-3 text-muted-foreground">{row.email}</td>
                    <td className="py-3 px-3">
                      <span className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded">
                        {row.source}
                      </span>
                    </td>
                    <td className="py-3 px-3">{getStatusBadge(row.status)}</td>
                    <td className="py-3 px-3 text-muted-foreground text-xs">
                      {new Date(row.created_at).toLocaleDateString('fr-FR')}
                    </td>
                    <td className="py-3 px-3">
                      {row.status === 'pending' && (
                        <WaitlistInviteButton waitlistId={row.id} email={row.email} name={`${row.prenom} ${row.nom}`} />
                      )}
                      {row.status === 'invited' && row.invited_at && (
                        <span className="text-xs text-muted-foreground">
                          Invité le {new Date(row.invited_at).toLocaleDateString('fr-FR')}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export default function WaitlistPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Liste d'attente (Beta)"
        description="Gérer les invitations — Phase 1 & 2"
        action={
          <div className="text-sm text-muted-foreground">
            URL publique :{' '}
            <code className="text-blue-400 bg-card px-2 py-1 rounded">/acces-anticipe</code>
          </div>
        }
      />

      <Suspense fallback={<div className="h-24 bg-card animate-pulse rounded-lg" />}>
        <WaitlistStats />
      </Suspense>

      <Suspense fallback={<div className="h-64 bg-card animate-pulse rounded-lg" />}>
        <WaitlistTable />
      </Suspense>
    </div>
  )
}
