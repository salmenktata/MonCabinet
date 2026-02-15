import { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth/session'
import { ConsultPage } from './ConsultPage'

export const metadata: Metadata = {
  title: 'Consultation Juridique | Qadhya',
  description: 'Obtenez une consultation juridique formelle avec analyse IRAC complète',
}

export default async function Page() {
  const session = await getSession()
  if (!session?.user?.id) redirect('/login')

  return <ConsultPage />
}
