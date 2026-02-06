import { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth/session'
import { ChatPage } from './ChatPage'

export const metadata: Metadata = {
  title: 'Assistant IA Juridique | MonCabinet',
  description: 'Chat conversationnel avec l\'assistant IA juridique',
}

export default async function AssistantIAPage() {
  const session = await getSession()

  if (!session?.user?.id) {
    redirect('/login')
  }

  return <ChatPage userId={session.user.id} />
}
