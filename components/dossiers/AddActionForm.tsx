'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useTranslations } from 'next-intl'
import { actionSchema, type ActionFormData } from '@/lib/validations/dossier'
import { createActionDossierAction } from '@/app/actions/actions-dossier'

interface AddActionFormProps {
  dossierId: string
  onCancel: () => void
}

export default function AddActionForm({ dossierId, onCancel }: AddActionFormProps) {
  const router = useRouter()
  const t = useTranslations('actions')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ActionFormData>({
    resolver: zodResolver(actionSchema),
    defaultValues: {
      dossier_id: dossierId,
      type: 'AUTRE',
      priorite: 'NORMALE',
      statut: 'A_FAIRE',
    },
  })

  const onSubmit = async (data: ActionFormData) => {
    setError('')
    setLoading(true)

    const result = await createActionDossierAction(data)

    if (result.error) {
      setError(result.error)
      setLoading(false)
      return
    }

    router.refresh()
    onCancel()
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      {error && (
        <div className="rounded-md bg-red-50 p-3 text-sm text-red-800">{error}</div>
      )}

      <div>
        <label className="block text-sm font-medium text-gray-700">{t('titleRequired')}</label>
        <input
          {...register('titre')}
          className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500"
          placeholder={t('placeholders.title')}
        />
        {errors.titre && (
          <p className="mt-1 text-sm text-red-600">{errors.titre.message}</p>
        )}
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700">{t('description')}</label>
        <textarea
          {...register('description')}
          rows={2}
          className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500"
          placeholder={t('placeholders.description')}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700">{t('typeRequired')}</label>
          <select
            {...register('type')}
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500"
          >
            <option value="AUDIENCE">{t('types.audience')}</option>
            <option value="DEADLINE">{t('types.deadline')}</option>
            <option value="RDV_CLIENT">{t('types.clientMeeting')}</option>
            <option value="REDACTION">{t('types.writing')}</option>
            <option value="AUTRE">{t('types.other')}</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">{t('priorityRequired')}</label>
          <select
            {...register('priorite')}
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500"
          >
            <option value="BASSE">{t('priorities.low')}</option>
            <option value="NORMALE">{t('priorities.normal')}</option>
            <option value="HAUTE">{t('priorities.high')}</option>
            <option value="URGENTE">{t('priorities.urgent')}</option>
          </select>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700">{t('deadline')}</label>
        <input
          type="date"
          {...register('date_limite')}
          className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500"
        />
      </div>

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={loading}
          className="flex-1 rounded-md bg-blue-600 px-4 py-2 text-white font-medium hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? t('adding') : t('add')}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 rounded-md border border-gray-300 bg-white px-4 py-2 text-gray-700 font-medium hover:bg-gray-50"
        >
          {t('cancel')}
        </button>
      </div>
    </form>
  )
}
