import { query } from '@/lib/db/postgres'
import { getSession } from '@/lib/auth/session'
import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { SuperAdminLayout } from '@/components/super-admin/SuperAdminLayout'
import { safeParseInt } from '@/lib/utils/safe-number'

// Pages super-admin accessibles aux admins (en plus des super_admin)
const ADMIN_ALLOWED_PAGES = ['/super-admin/pipeline', '/super-admin/pipeline-status', '/super-admin/web-sources']

export default async function SuperAdminRootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await getSession()

  if (!session?.user?.id) {
    redirect('/login')
  }

  // Vérifier le rôle
  const userResult = await query(
    'SELECT id, email, nom, prenom, role FROM users WHERE id = $1',
    [session.user.id]
  )
  const user = userResult.rows[0]

  if (!user) {
    redirect('/dashboard')
  }

  // Super admin a accès à tout
  // Admin a accès uniquement aux pages autorisées
  if (user.role !== 'super_admin') {
    if (user.role === 'admin') {
      const headersList = await headers()
      const pathname = headersList.get('x-pathname') || ''
      const isAllowed = ADMIN_ALLOWED_PAGES.some(page => pathname.startsWith(page))
      if (!isAllowed) {
        redirect('/dashboard')
      }
    } else {
      redirect('/dashboard')
    }
  }

  // Récupérer le nombre d'utilisateurs en attente
  const pendingResult = await query(
    "SELECT COUNT(*) as count FROM users WHERE status = 'pending'"
  )
  const pendingCount = parseInt(pendingResult.rows[0]?.count || '0', 10)

  // Récupérer le nombre de suggestions de taxonomie en attente
  let pendingTaxonomySuggestions = 0
  try {
    const taxonomyResult = await query(
      "SELECT COUNT(*) as count FROM taxonomy_suggestions WHERE status = 'pending'"
    )
    pendingTaxonomySuggestions = parseInt(taxonomyResult.rows[0]?.count || '0', 10)
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
        pendingTaxonomySuggestions={pendingTaxonomySuggestions}
      >
        {children}
      </SuperAdminLayout>
    </>
  )
}
