import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import Breadcrumbs from '@/components/ui/Breadcrumbs'
import { GlobalKeyboardShortcuts } from '@/components/ui/KeyboardShortcuts'
import LanguageSwitcher from '@/components/ui/LanguageSwitcher'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  // Récupérer le profil
  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Navbar */}
      <nav className="border-b bg-white">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between">
            <div className="flex items-center gap-8">
              <Link href="/dashboard" className="text-2xl font-bold text-blue-900">
                Avocat
              </Link>

              <div className="flex gap-1">
                <Link
                  href="/dashboard"
                  className="rounded-md px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 hover:text-gray-900"
                >
                  Tableau de bord
                </Link>
                <Link
                  href="/clients"
                  className="rounded-md px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 hover:text-gray-900"
                >
                  Clients
                </Link>
                <Link
                  href="/dossiers"
                  className="rounded-md px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 hover:text-gray-900"
                >
                  Dossiers
                </Link>
                <Link
                  href="/factures"
                  className="rounded-md px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 hover:text-gray-900"
                >
                  Factures
                </Link>
                <Link
                  href="/echeances"
                  className="rounded-md px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 hover:text-gray-900"
                >
                  Échéances
                </Link>
                <Link
                  href="/time-tracking"
                  className="rounded-md px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 hover:text-gray-900"
                >
                  Time Tracking
                </Link>
                <Link
                  href="/documents"
                  className="rounded-md px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 hover:text-gray-900"
                >
                  Documents
                </Link>
                <Link
                  href="/templates"
                  className="rounded-md px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 hover:text-gray-900"
                >
                  Templates
                </Link>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <LanguageSwitcher />

              <div className="text-sm">
                <p className="font-medium text-gray-900">
                  {profile?.nom} {profile?.prenom}
                </p>
                <p className="text-gray-500">{user.email}</p>
              </div>

              <form action="/api/auth/signout" method="post">
                <button
                  type="submit"
                  className="rounded-md bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200"
                >
                  Déconnexion
                </button>
              </form>
            </div>
          </div>
        </div>
      </nav>

      {/* Contenu */}
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <Breadcrumbs />
        {children}
      </main>

      {/* Raccourcis clavier */}
      <GlobalKeyboardShortcuts />
    </div>
  )
}
