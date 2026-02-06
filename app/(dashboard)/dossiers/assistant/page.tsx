import { getSession } from '@/lib/auth/session'
import { redirect } from 'next/navigation'
import { query } from '@/lib/db/postgres'
import AssistantPage from './AssistantPage'

export default async function DossierAssistantPage() {
  const session = await getSession()

  if (!session?.user?.id) {
    redirect('/login')
  }

  // Récupérer les clients pour la sélection
  const clientsResult = await query(
    `SELECT id, nom, prenom, type_client
     FROM clients
     WHERE user_id = $1
     ORDER BY nom, prenom`,
    [session.user.id]
  )

  return <AssistantPage clients={clientsResult.rows} />
}
