'use client'

import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { createTemplateAction, updateTemplateAction } from '@/app/actions/templates'
import { templateSchema, type TemplateFormData, TYPE_DOCUMENT_LABELS, LANGUE_LABELS } from '@/lib/validations/template'

interface TemplateFormProps {
  initialData?: Partial<TemplateFormData>
  templateId?: string
}

export default function TemplateForm({ initialData, templateId }: TemplateFormProps) {
  const router = useRouter()
  const t = useTranslations('forms')
  const tErrors = useTranslations('errors')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [variables, setVariables] = useState<string[]>([])

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<TemplateFormData>({
    resolver: zodResolver(templateSchema),
    defaultValues: initialData || {
      titre: '',
      description: '',
      type_document: 'autre',
      langue: 'fr',
      contenu: '',
      est_public: false,
    },
  })

  // Surveiller le contenu et la langue pour extraire les variables
  const contenu = watch('contenu')
  const langue = watch('langue')

  // Extraire les variables quand le contenu change
  const extractVariables = (text: string) => {
    const regex = /{{([^}]+)}}/g
    const vars: string[] = []
    let match

    while ((match = regex.exec(text)) !== null) {
      vars.push(match[1])
    }

    // Retourner les variables uniques
    return [...new Set(vars)]
  }

  // Mettre à jour les variables quand le contenu change (via watch)
  useEffect(() => {
    if (contenu) {
      const newVariables = extractVariables(contenu)
      setVariables(newVariables)
    }
  }, [contenu])

  // Mettre à jour les variables quand le contenu change (via event)
  const handleContenuChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newVariables = extractVariables(e.target.value)
    setVariables(newVariables)
  }

  const onSubmit = async (data: TemplateFormData) => {
    setLoading(true)
    setError('')

    const result = templateId
      ? await updateTemplateAction(templateId, data)
      : await createTemplateAction(data)

    if (result.error) {
      setError(result.error)
      setLoading(false)
      return
    }

    router.push('/templates')
    router.refresh()
  }

  // Variables communes pour insertion rapide (FR et AR)
  const commonVariablesFr = [
    { label: t('helpers.clientName'), value: '{{client.nom}}' },
    { label: t('helpers.clientFirstName'), value: '{{client.prenom}}' },
    { label: t('helpers.clientCIN'), value: '{{client.cin}}' },
    { label: t('helpers.clientAddress'), value: '{{client.adresse}}' },
    { label: t('helpers.lawyerName'), value: '{{avocat.nom}}' },
    { label: t('helpers.lawyerFirstName'), value: '{{avocat.prenom}}' },
    { label: t('helpers.tribunalVar'), value: '{{tribunal}}' },
    { label: t('helpers.dateVar'), value: '{{date}}' },
    { label: t('helpers.locationVar'), value: '{{lieu}}' },
    { label: t('helpers.dossierNumberVar'), value: '{{numero}}' },
  ]

  const commonVariablesAr = [
    { label: 'اسم الحريف', value: '{{اسم_الحريف}}' },
    { label: 'لقب الحريف', value: '{{لقب_الحريف}}' },
    { label: 'رقم ب.ت.و', value: '{{رقم_بطاقة_التعريف}}' },
    { label: 'عنوان الحريف', value: '{{عنوان_الحريف}}' },
    { label: 'اسم المحامي', value: '{{اسم_المحامي}}' },
    { label: 'لقب المحامي', value: '{{لقب_المحامي}}' },
    { label: 'المحكمة', value: '{{المحكمة}}' },
    { label: 'التاريخ', value: '{{التاريخ}}' },
    { label: 'المكان', value: '{{المكان}}' },
    { label: 'رقم الملف', value: '{{رقم_الملف}}' },
  ]

  // Sélectionner les variables selon la langue
  const commonVariables = langue === 'ar' ? commonVariablesAr : commonVariablesFr

  const insertVariable = (variable: string) => {
    const textarea = document.querySelector('textarea[name="contenu"]') as HTMLTextAreaElement
    if (textarea) {
      const start = textarea.selectionStart
      const end = textarea.selectionEnd
      const text = textarea.value
      const newText = text.substring(0, start) + variable + text.substring(end)
      textarea.value = newText
      textarea.setSelectionRange(start + variable.length, start + variable.length)
      textarea.focus()

      // Trigger change event
      const event = new Event('input', { bubbles: true })
      textarea.dispatchEvent(event)

      // Mettre à jour les variables détectées
      setVariables(extractVariables(newText))
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      {/* Titre */}
      <div>
        <label htmlFor="titre" className="block text-sm font-medium text-foreground">
          {t('labels.templateTitleRequired')}
        </label>
        <input
          type="text"
          {...register('titre')}
          className="mt-1 block w-full rounded-md border border px-3 py-2 shadow-sm focus:border-blue-500 focus:ring-blue-500"
          placeholder={t('placeholders.enterTemplateTitle')}
        />
        {errors.titre && <p className="mt-1 text-sm text-red-600">{errors.titre.message}</p>}
      </div>

      {/* Description */}
      <div>
        <label htmlFor="description" className="block text-sm font-medium text-foreground">
          {t('labels.description')}
        </label>
        <textarea
          {...register('description')}
          rows={2}
          className="mt-1 block w-full rounded-md border border px-3 py-2 shadow-sm focus:border-blue-500 focus:ring-blue-500"
          placeholder={t('placeholders.templateDescription')}
        />
        {errors.description && (
          <p className="mt-1 text-sm text-red-600">{errors.description.message}</p>
        )}
      </div>

      {/* Type de document et Langue */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="type_document" className="block text-sm font-medium text-foreground">
            {t('labels.documentTypeRequired')}
          </label>
          <select
            {...register('type_document')}
            className="mt-1 block w-full rounded-md border border px-3 py-2 shadow-sm focus:border-blue-500 focus:ring-blue-500"
          >
            {Object.entries(TYPE_DOCUMENT_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          {errors.type_document && (
            <p className="mt-1 text-sm text-red-600">{errors.type_document.message}</p>
          )}
        </div>

        <div>
          <label htmlFor="langue" className="block text-sm font-medium text-foreground">
            {t('labels.language')} *
          </label>
          <select
            {...register('langue')}
            className="mt-1 block w-full rounded-md border border px-3 py-2 shadow-sm focus:border-blue-500 focus:ring-blue-500"
          >
            {Object.entries(LANGUE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {value === 'fr' ? '🇫🇷' : '🇹🇳'} {label}
              </option>
            ))}
          </select>
          {errors.langue && (
            <p className="mt-1 text-sm text-red-600">{errors.langue.message}</p>
          )}
        </div>
      </div>

      {/* Variables rapides */}
      <div>
        <label className="block text-sm font-medium text-foreground mb-2">
          {t('labels.insertVariable')}
        </label>
        <div className="flex flex-wrap gap-2">
          {commonVariables.map((v) => (
            <button
              key={v.value}
              type="button"
              onClick={() => insertVariable(v.value)}
              className="rounded-md border border bg-card px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted"
            >
              {v.label}
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          💡 {t('helpers.variablesTip')}
        </p>
      </div>

      {/* Contenu */}
      <div>
        <label htmlFor="contenu" className="block text-sm font-medium text-foreground">
          {t('labels.templateContentRequired')}
        </label>
        <textarea
          {...register('contenu')}
          rows={16}
          onChange={handleContenuChange}
          dir={langue === 'ar' ? 'rtl' : 'ltr'}
          className={`mt-1 block w-full rounded-md border border px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:ring-blue-500 ${
            langue === 'ar' ? 'font-arabic text-right' : 'font-mono'
          }`}
          placeholder={langue === 'ar' ? 'أدخل محتوى الوثيقة...' : t('placeholders.enterTemplateContent')}
        />
        {errors.contenu && <p className="mt-1 text-sm text-red-600">{errors.contenu.message}</p>}

        {/* Afficher les variables détectées */}
        {variables.length > 0 && (
          <div className="mt-2 rounded-md bg-blue-50 p-3">
            <p className="text-xs font-medium text-blue-900">
              {variables.length} {t('helpers.variablesDetected')}
            </p>
            <div className="mt-1 flex flex-wrap gap-1">
              {variables.map((v) => (
                <code key={v} className="rounded bg-blue-100 px-2 py-0.5 text-xs text-blue-800">
                  {`{{${v}}}`}
                </code>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Template public */}
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          {...register('est_public')}
          id="est_public"
          className="h-4 w-4 rounded border text-blue-600 focus:ring-blue-500"
        />
        <label htmlFor="est_public" className="text-sm text-foreground">
          {t('labels.makePublic')}
        </label>
      </div>

      {/* Message d'erreur */}
      {error && <div className="rounded-md bg-red-50 p-3 text-sm text-red-800">{error}</div>}

      {/* Boutons */}
      <div className="flex gap-3">
        <button
          type="submit"
          disabled={loading}
          className="flex-1 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? t('helpers.savingWithEmoji') : templateId ? t('helpers.updateWithEmoji') : t('helpers.createTemplateWithEmoji')}
        </button>

        <button
          type="button"
          onClick={() => router.back()}
          className="rounded-md border border bg-card px-4 py-2 text-sm font-medium text-foreground hover:bg-muted"
        >
          {t('buttons.cancel')}
        </button>
      </div>
    </form>
  )
}
