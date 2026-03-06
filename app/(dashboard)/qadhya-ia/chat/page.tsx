import { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth/session'
import { query } from '@/lib/db/postgres'
import { ChatPage } from './ChatPage'

export const metadata: Metadata = {
  title: 'Assistant IA | Qadhya',
  description: 'Posez vos questions juridiques à l\'assistant IA',
}

export default async function Page() {
  const session = await getSession()
  if (!session?.user?.id) redirect('/login')

  const userResult = await query(
    'SELECT ui_preferences FROM users WHERE id = $1',
    [session.user.id]
  )
  const uiPrefs = userResult.rows[0]?.ui_preferences ?? {}
  // Réduit par défaut (true) sauf si l'utilisateur a explicitement ouvert (false)
  const initialHistoryCollapsed = uiPrefs['chat-history-collapsed'] !== false

  return <ChatPage userId={session.user.id} initialHistoryCollapsed={initialHistoryCollapsed} />
}
