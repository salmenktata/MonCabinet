import { query } from '@/lib/db/postgres'
import { getSession } from '@/lib/auth/session'
import { redirect } from 'next/navigation'
import { AppLayout } from '@/components/layout/AppLayout'
import { GlobalKeyboardShortcuts } from '@/components/ui/KeyboardShortcuts'
import { Toaster } from '@/components/ui/toaster'
import { GlobalErrorBoundary } from '@/components/providers/GlobalErrorBoundary'
import { ToastManager, LoadingOverlay } from '@/components/feedback'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await getSession()

  if (!session?.user?.id) {
    redirect('/login')
  }

  // Récupérer le profil et le rôle
  const [profileResult, userResult] = await Promise.all([
    query('SELECT * FROM profiles WHERE id = $1', [session.user.id]),
    query('SELECT role FROM users WHERE id = $1', [session.user.id])
  ])

  const profile = profileResult.rows[0]
  const userRole = userResult.rows[0]?.role || 'user'

  // Protection NULL safety: créer profil par défaut si inexistant
  // Note: Le profil devrait toujours exister, mais évite crash si données corrompues
  if (!profile) {
    console.error('[Layout] Profil manquant pour user:', session.user.id)
  }

  return (
    <GlobalErrorBoundary>
      <AppLayout
        user={{
          email: session.user.email!,
          nom: profile?.nom || '',
          prenom: profile?.prenom || '',
          role: userRole,
        }}
      >
        {children}
      </AppLayout>
      <GlobalKeyboardShortcuts />
      <Toaster />
      <ToastManager />
      <LoadingOverlay />
    </GlobalErrorBoundary>
  )
}
