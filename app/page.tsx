import Link from 'next/link'

export default function HomePage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-blue-50 to-white">
      <main className="container mx-auto px-4 text-center">
        <h1 className="mb-6 text-5xl font-bold text-blue-900">
          Avocat
        </h1>
        <p className="mb-8 text-xl text-gray-600">
          Plateforme de gestion de cabinet juridique pour avocats tunisiens
        </p>

        <div className="flex gap-4 justify-center">
          <Link
            href="/login"
            className="rounded-lg bg-blue-600 px-8 py-3 text-white font-semibold hover:bg-blue-700 transition-colors"
          >
            Se connecter
          </Link>
          <Link
            href="/register"
            className="rounded-lg border-2 border-blue-600 px-8 py-3 text-blue-600 font-semibold hover:bg-blue-50 transition-colors"
          >
            Créer un compte
          </Link>
        </div>

        <div className="mt-16 grid gap-8 md:grid-cols-3 max-w-5xl mx-auto">
          <div className="rounded-lg border bg-white p-6 shadow-sm">
            <h3 className="mb-2 text-lg font-semibold">Gestion des dossiers</h3>
            <p className="text-gray-600">
              Suivez tous vos dossiers juridiques en un seul endroit
            </p>
          </div>
          <div className="rounded-lg border bg-white p-6 shadow-sm">
            <h3 className="mb-2 text-lg font-semibold">Calcul des délais</h3>
            <p className="text-gray-600">
              Calcul automatique des délais légaux tunisiens
            </p>
          </div>
          <div className="rounded-lg border bg-white p-6 shadow-sm">
            <h3 className="mb-2 text-lg font-semibold">Facturation</h3>
            <p className="text-gray-600">
              Créez et gérez vos factures facilement
            </p>
          </div>
        </div>
      </main>
    </div>
  )
}
