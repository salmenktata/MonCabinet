import { getSession } from '@/lib/auth/session'
import { db } from '@/lib/db/postgres'
import { redirect } from 'next/navigation'
import AgendaClient from './AgendaClient'
import type { CalendarEcheance } from '@/components/dashboard/CalendarWidget'

export const dynamic = 'force-dynamic'

async function getAgendaData(userId: string): Promise<CalendarEcheance[]> {
  const res = await db.query(
    `SELECT e.id, e.titre, e.type_echeance, e.date_echeance::text, e.statut, e.description,
            json_build_object('numero', d.numero, 'objet', d.objet) AS dossier
     FROM echeances e
     LEFT JOIN dossiers d ON e.dossier_id = d.id
     WHERE e.user_id = $1
       AND e.terminee = false
       AND e.statut = 'actif'
     ORDER BY e.date_echeance ASC`,
    [userId]
  )
  return res.rows.map(row => ({
    ...row,
    date_echeance: row.date_echeance.slice(0, 10), // "YYYY-MM-DD"
    dossier: row.dossier?.numero ? row.dossier : undefined,
  })) as CalendarEcheance[]
}

export default async function AgendaPage() {
  const session = await getSession()
  if (!session?.user?.id) redirect('/login')

  const echeances = await getAgendaData(session.user.id)

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">Agenda</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Toutes vos échéances et audiences — {echeances.length} actives
        </p>
      </div>

      <AgendaClient echeances={echeances} />
    </div>
  )
}
