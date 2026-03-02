import { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth/session'
import { AriidaPage } from './AriidaPage'

export const metadata: Metadata = {
  title: 'عريضة الدعوى | Qadhya',
  description: 'Générez une requête introductive d\'instance tunisienne complète avec qualification juridique',
}

export default async function Page() {
  const session = await getSession()
  if (!session?.user?.id) redirect('/login')

  return <AriidaPage userId={session.user.id} />
}
