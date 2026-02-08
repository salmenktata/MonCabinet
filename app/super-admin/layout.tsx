import { query } from '@/lib/db/postgres'
import { getSession } from '@/lib/auth/session'
import { redirect } from 'next/navigation'
import { SuperAdminLayout } from '@/components/super-admin/SuperAdminLayout'
import { Toaster } from '@/components/ui/toaster'

export default async function SuperAdminRootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await getSession()

  if (!session?.user?.id) {
    redirect('/login')
  }

  // Vérifier le rôle super_admin
  const userResult = await query(
    'SELECT id, email, nom, prenom, role FROM users WHERE id = $1',
    [session.user.id]
  )
  const user = userResult.rows[0]

  if (!user || user.role !== 'super_admin') {
    // Rediriger vers le dashboard normal si pas super admin
    redirect('/dashboard')
  }

  // Récupérer le nombre d'utilisateurs en attente
  const pendingResult = await query(
    "SELECT COUNT(*) as count FROM users WHERE status = 'pending'"
  )
  const pendingCount = parseInt(pendingResult.rows[0]?.count || '0')

  // Récupérer le nombre de notifications non lues
  const notifResult = await query(
    'SELECT COUNT(*) as count FROM admin_notifications WHERE is_read = FALSE'
  )
  const unreadNotifications = parseInt(notifResult.rows[0]?.count || '0')

  // Récupérer le nombre de suggestions de taxonomie en attente
  let pendingTaxonomySuggestions = 0
  try {
    const taxonomyResult = await query(
      "SELECT COUNT(*) as count FROM taxonomy_suggestions WHERE status = 'pending'"
    )
    pendingTaxonomySuggestions = parseInt(taxonomyResult.rows[0]?.count || '0')
  } catch {
    // Table n'existe pas encore, ignorer
  }

  return (
    <>
      <SuperAdminLayout
        user={{
          email: user.email,
          nom: user.nom,
          prenom: user.prenom,
        }}
        pendingCount={pendingCount}
        unreadNotifications={unreadNotifications}
        pendingTaxonomySuggestions={pendingTaxonomySuggestions}
      >
        {children}
      </SuperAdminLayout>
      <Toaster />
    </>
  )
}
