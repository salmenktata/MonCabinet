import { query } from '@/lib/db/postgres'
import { getSession } from '@/lib/auth/session'
import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'
import { AppLayout } from '@/components/layout/AppLayout'
import { TrialBanner } from '@/components/layout/TrialBanner'
import { GlobalKeyboardShortcuts } from '@/components/ui/KeyboardShortcuts'
import { GlobalErrorBoundary } from '@/components/providers/GlobalErrorBoundary'
import { StanceProviderWrapper } from '@/components/providers/StanceProviderWrapper'
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

  // Récupérer le profil cabinet et les infos user
  const [profileResult, userResult] = await Promise.all([
    query('SELECT * FROM profiles WHERE user_id = $1', [session.user.id]),
    query('SELECT role, nom, prenom FROM users WHERE id = $1', [session.user.id])
  ])

  const profile = profileResult.rows[0]
  const userRow = userResult.rows[0]
  const userRole = userRow?.role || 'user'

  return (
    <GlobalErrorBoundary>
      <StanceProviderWrapper>
        <div dir="ltr">
        <TrialBanner />
        <AppLayout
          user={{
            email: session.user.email!,
            nom: userRow?.nom || profile?.nom || '',
            prenom: userRow?.prenom || profile?.prenom || '',
            role: userRole,
          }}
        >
          {children}
        </AppLayout>
        </div>
        <GlobalKeyboardShortcuts />
        <ToastManager />
        <LoadingOverlay />
      </StanceProviderWrapper>
    </GlobalErrorBoundary>
  )
}
