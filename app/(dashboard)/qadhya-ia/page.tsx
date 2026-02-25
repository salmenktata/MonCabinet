import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth/session'

export default async function QadhyaIAPage() {
  const session = await getSession()
  if (!session?.user?.id) redirect('/login')

  // Rediriger vers la page Chat par défaut
  redirect('/qadhya-ia/structure')
}
