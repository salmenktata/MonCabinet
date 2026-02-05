import Link from 'next/link'
import { useTranslations } from 'next-intl'
import LanguageSwitcher from '@/components/ui/LanguageSwitcher'

export default function HomePage() {
  const t = useTranslations('home')

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-blue-50 to-white">
      <div className="absolute top-4 right-4">
        <LanguageSwitcher />
      </div>

      <main className="container mx-auto px-4 text-center">
        <h1 className="mb-6 text-5xl font-bold text-blue-900">
          {t('title')}
        </h1>
        <p className="mb-8 text-xl text-gray-600">
          {t('subtitle')}
        </p>

        <div className="flex gap-4 justify-center">
          <Link
            href="/login"
            className="rounded-lg bg-blue-600 px-8 py-3 text-white font-semibold hover:bg-blue-700 transition-colors"
          >
            {t('loginButton')}
          </Link>
          <Link
            href="/register"
            className="rounded-lg border-2 border-blue-600 px-8 py-3 text-blue-600 font-semibold hover:bg-blue-50 transition-colors"
          >
            {t('registerButton')}
          </Link>
        </div>

        <div className="mt-16 grid gap-8 md:grid-cols-3 max-w-5xl mx-auto">
          <div className="rounded-lg border bg-white p-6 shadow-sm">
            <h3 className="mb-2 text-lg font-semibold">{t('features.dossiers.title')}</h3>
            <p className="text-gray-600">
              {t('features.dossiers.description')}
            </p>
          </div>
          <div className="rounded-lg border bg-white p-6 shadow-sm">
            <h3 className="mb-2 text-lg font-semibold">{t('features.delais.title')}</h3>
            <p className="text-gray-600">
              {t('features.delais.description')}
            </p>
          </div>
          <div className="rounded-lg border bg-white p-6 shadow-sm">
            <h3 className="mb-2 text-lg font-semibold">{t('features.facturation.title')}</h3>
            <p className="text-gray-600">
              {t('features.facturation.description')}
            </p>
          </div>
        </div>
      </main>
    </div>
  )
}
