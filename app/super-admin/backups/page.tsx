import dynamic from 'next/dynamic'
import { Metadata } from 'next'
import { getSession } from '@/lib/auth/session'
import { redirect } from 'next/navigation'
import { Skeleton } from '@/components/ui/skeleton'
import { PageHeader } from '@/components/super-admin/shared/PageHeader'

const BackupsManager = dynamic(
  () => import('@/components/super-admin/backups/BackupsManager'),
  { loading: () => <Skeleton className="h-96 w-full" /> }
)

export const metadata: Metadata = {
  title: 'Backups - Super Admin',
  description: 'Gestion des sauvegardes système',
}

export default async function BackupsPage() {
  const session = await getSession()

  if (!session?.user || session.user.role !== 'super_admin') {
    redirect('/login')
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Sauvegardes Système"
        description="Gérez les backups PostgreSQL, MinIO et code source"
      />

      {/* Gestionnaire de backups */}
      <BackupsManager />
    </div>
  )
}
