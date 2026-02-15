import { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth/session'
import { query } from '@/lib/db/postgres'
import { StructurePage } from './StructurePage'

export const metadata: Metadata = {
  title: 'Structuration de Dossiers | Qadhya',
  description: 'Structurez automatiquement vos dossiers juridiques avec l\'IA',
}

export default async function Page() {
  const session = await getSession()
  if (!session?.user?.id) redirect('/login')

  const clientsResult = await query(
    `SELECT id, nom, prenom, type_client
     FROM clients
     WHERE user_id = $1
     ORDER BY nom, prenom`,
    [session.user.id]
  )

  return <StructurePage clients={clientsResult.rows} />
}
