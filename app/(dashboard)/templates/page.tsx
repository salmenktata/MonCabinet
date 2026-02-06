import { query } from '@/lib/db/postgres'
import { getSession } from '@/lib/auth/session'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import TemplateCard from '@/components/templates/TemplateCard'
import TemplateLanguageFilter from '@/components/templates/TemplateLanguageFilter'
import { getTranslations } from 'next-intl/server'

interface TemplatesPageProps {
  searchParams: Promise<{ langue?: string }>
}

export default async function TemplatesPage({ searchParams }: TemplatesPageProps) {
  const t = await getTranslations('templates')
  const session = await getSession()

  if (!session?.user?.id) {
    redirect('/login')
  }

  // Awaiter searchParams (Next.js 15)
  const params = await searchParams

  // Filtre de langue
  const langueFilter = params.langue || 'all'

  // Récupérer tous les templates (propres + publics)
  const result = await query(
    'SELECT * FROM templates ORDER BY created_at DESC'
  )
  let templates = result.rows

  // Appliquer le filtre de langue si spécifié
  if (langueFilter !== 'all') {
    templates = templates.filter((t: any) => {
      // Pour le français, inclure aussi les templates sans langue définie
      if (langueFilter === 'fr') {
        return t.langue === 'fr' || !t.langue
      }
      return t.langue === langueFilter
    })
  }

  // Séparer mes templates des templates publics
  const mesTemplates = templates?.filter((t: any) => t.user_id === session.user.id) || []
  const templatesPublics = templates?.filter((t: any) => t.user_id !== session.user.id && t.est_public) || []

  // Statistiques (sur tous les templates, pas filtrés)
  const allTemplates = result.rows
  const stats = {
    total: allTemplates.filter((t: any) => t.user_id === session.user.id).length,
    publics: allTemplates.filter((t: any) => t.user_id === session.user.id && t.est_public).length,
    utilisationsTotal: allTemplates
      .filter((t: any) => t.user_id === session.user.id)
      .reduce((acc: number, t: any) => acc + (t.nombre_utilisations || 0), 0),
    fr: allTemplates.filter((t: any) => t.langue === 'fr' || !t.langue).length,
    ar: allTemplates.filter((t: any) => t.langue === 'ar').length,
  }

  return (
    <div className="space-y-6">
      {/* En-tête */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">{t('title')}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t('subtitle')}
          </p>
        </div>

        <Link
          href="/templates/new"
          className="inline-flex items-center rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          ➕ {t('newTemplate')}
        </Link>
      </div>

      {/* Filtre par langue */}
      <div className="flex items-center justify-between">
        <TemplateLanguageFilter currentFilter={langueFilter} />
        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          <span className="flex items-center gap-1">
            🇫🇷 <strong>{stats.fr}</strong> FR
          </span>
          <span className="flex items-center gap-1">
            🇹🇳 <strong>{stats.ar}</strong> عربي
          </span>
        </div>
      </div>

      {/* Statistiques */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
        <div className="rounded-lg border bg-card p-5 shadow-sm">
          <p className="text-sm font-medium text-muted-foreground">{t('myTemplates')}</p>
          <p className="mt-1 text-3xl font-semibold text-foreground">{stats.total}</p>
        </div>

        <div className="rounded-lg border bg-card p-5 shadow-sm">
          <p className="text-sm font-medium text-muted-foreground">{t('publicTemplates')}</p>
          <p className="mt-1 text-3xl font-semibold text-green-600">{stats.publics}</p>
        </div>

        <div className="rounded-lg border bg-card p-5 shadow-sm">
          <p className="text-sm font-medium text-muted-foreground">{t('totalUsages')}</p>
          <p className="mt-1 text-3xl font-semibold text-blue-600">{stats.utilisationsTotal}</p>
        </div>
      </div>

      {/* Mes templates */}
      {mesTemplates.length === 0 && templatesPublics.length === 0 ? (
        <div className="rounded-lg border border-dashed bg-card p-12 text-center">
          <svg
            className="mx-auto h-12 w-12 text-muted-foreground"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
            />
          </svg>
          <h3 className="mt-2 text-sm font-medium text-foreground">{t('noTemplates')}</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {t('createFirstTemplate')}
          </p>
          <div className="mt-6">
            <Link
              href="/templates/new"
              className="inline-flex items-center rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              ➕ {t('createFirstTemplateShort')}
            </Link>
          </div>
        </div>
      ) : (
        <>
          {/* Mes templates */}
          {mesTemplates.length > 0 && (
            <div>
              <h2 className="mb-3 text-lg font-semibold text-foreground">
                {t('myTemplates')} ({mesTemplates.length})
              </h2>
              <div className="grid gap-4">
                {mesTemplates.map((template) => (
                  <TemplateCard key={template.id} template={template} />
                ))}
              </div>
            </div>
          )}

          {/* Templates publics */}
          {templatesPublics.length > 0 && (
            <div>
              <h2 className="mb-3 text-lg font-semibold text-foreground">
                {t('publicTemplates')} ({templatesPublics.length})
              </h2>
              <div className="grid gap-4">
                {templatesPublics.map((template) => (
                  <TemplateCard key={template.id} template={template} />
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
