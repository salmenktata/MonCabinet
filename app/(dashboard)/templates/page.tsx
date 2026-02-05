import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import TemplateCard from '@/components/templates/TemplateCard'
import { getTranslations } from 'next-intl/server'

export default async function TemplatesPage() {
  const t = await getTranslations('templates')
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  // Récupérer tous les templates (propres + publics)
  const { data: templates, error } = await supabase
    .from('templates')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) {
    console.error('Erreur chargement templates:', error)
  }

  // Séparer mes templates des templates publics
  const mesTemplates = templates?.filter((t) => t.user_id === user.id) || []
  const templatesPublics = templates?.filter((t) => t.user_id !== user.id && t.est_public) || []

  // Statistiques
  const stats = {
    total: mesTemplates.length,
    publics: mesTemplates.filter((t) => t.est_public).length,
    utilisationsTotal: mesTemplates.reduce((acc, t) => acc + (t.nombre_utilisations || 0), 0),
  }

  return (
    <div className="space-y-6">
      {/* En-tête */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">{t('title')}</h1>
          <p className="mt-1 text-sm text-gray-500">
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

      {/* Statistiques */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
        <div className="rounded-lg border bg-white p-5 shadow-sm">
          <p className="text-sm font-medium text-gray-600">{t('myTemplates')}</p>
          <p className="mt-1 text-3xl font-semibold text-gray-900">{stats.total}</p>
        </div>

        <div className="rounded-lg border bg-white p-5 shadow-sm">
          <p className="text-sm font-medium text-gray-600">{t('publicTemplates')}</p>
          <p className="mt-1 text-3xl font-semibold text-green-600">{stats.publics}</p>
        </div>

        <div className="rounded-lg border bg-white p-5 shadow-sm">
          <p className="text-sm font-medium text-gray-600">{t('totalUsages')}</p>
          <p className="mt-1 text-3xl font-semibold text-blue-600">{stats.utilisationsTotal}</p>
        </div>
      </div>

      {/* Mes templates */}
      {mesTemplates.length === 0 && templatesPublics.length === 0 ? (
        <div className="rounded-lg border border-dashed bg-white p-12 text-center">
          <svg
            className="mx-auto h-12 w-12 text-gray-400"
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
          <h3 className="mt-2 text-sm font-medium text-gray-900">{t('noTemplates')}</h3>
          <p className="mt-1 text-sm text-gray-500">
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
              <h2 className="mb-3 text-lg font-semibold text-gray-900">
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
              <h2 className="mb-3 text-lg font-semibold text-gray-900">
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
