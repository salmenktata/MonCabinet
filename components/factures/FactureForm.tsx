'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useTranslations } from 'next-intl'
import { factureSchema, type FactureFormData } from '@/lib/validations/facture'
import { createFactureAction, updateFactureAction } from '@/app/actions/factures'

interface FactureFormProps {
  factureId?: string
  initialData?: any
  isEditing?: boolean
  clients: any[]
  dossiers?: any[]
  preselectedClientId?: string
  preselectedDossierId?: string
}

export default function FactureForm({
  factureId,
  initialData,
  isEditing = false,
  clients,
  dossiers = [],
  preselectedClientId,
  preselectedDossierId,
}: FactureFormProps) {
  const router = useRouter()
  const t = useTranslations('forms')
  const tErrors = useTranslations('errors')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
    setValue,
  } = useForm<FactureFormData>({
    resolver: zodResolver(factureSchema),
    defaultValues: initialData || {
      client_id: preselectedClientId || '',
      dossier_id: preselectedDossierId || '',
      taux_tva: 19,
      statut: 'BROUILLON',
      date_emission: new Date().toISOString().split('T')[0],
    },
  })

  const montantHT = watch('montant_ht') || 0
  const tauxTVA = watch('taux_tva') || 19
  const montantTVA = (montantHT * tauxTVA) / 100
  const montantTTC = montantHT + montantTVA

  const onSubmit = async (data: FactureFormData) => {
    setError('')
    setLoading(true)

    try {
      const result = isEditing && factureId
        ? await updateFactureAction(factureId, data)
        : await createFactureAction(data)

      if (result.error) {
        setError(result.error)
        setLoading(false)
        return
      }

      router.push('/factures')
      router.refresh()
    } catch (err) {
      setError(tErrors('generic'))
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      {error && (
        <div className="rounded-md bg-red-50 p-4 text-sm text-red-800">
          {error}
        </div>
      )}

      {/* Client et Dossier */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-foreground">
            {t('labels.clientRequired')}
          </label>
          <select
            {...register('client_id')}
            className="mt-1 block w-full rounded-md border border px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500"
          >
            <option value="">{t('placeholders.selectClient')}</option>
            {clients.map((client) => {
              const displayName =
                client.type_client === 'personne_physique'
                  ? `${client.nom} ${client.prenom || ''}`.trim()
                  : client.nom
              return (
                <option key={client.id} value={client.id}>
                  {displayName}
                </option>
              )
            })}
          </select>
          {errors.client_id && (
            <p className="mt-1 text-sm text-red-600">{errors.client_id.message}</p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-foreground">
            {t('labels.dossierOptional')}
          </label>
          <select
            {...register('dossier_id')}
            className="mt-1 block w-full rounded-md border border px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500"
          >
            <option value="">{t('placeholders.noDossier')}</option>
            {dossiers.map((dossier) => (
              <option key={dossier.id} value={dossier.id}>
                {dossier.numero} - {dossier.objet}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Objet */}
      <div>
        <label className="block text-sm font-medium text-foreground">
          {t('labels.invoiceObjectRequired')}
        </label>
        <input
          {...register('objet')}
          className="mt-1 block w-full rounded-md border border px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500"
          placeholder={t('placeholders.enterInvoiceObject')}
        />
        {errors.objet && (
          <p className="mt-1 text-sm text-red-600">{errors.objet.message}</p>
        )}
      </div>

      {/* Montants */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-foreground">
            {t('labels.amountHTRequired')}
          </label>
          <input
            type="number"
            step="0.001"
            {...register('montant_ht', { valueAsNumber: true })}
            className="mt-1 block w-full rounded-md border border px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500"
            placeholder={t('placeholders.enterAmountHT')}
          />
          {errors.montant_ht && (
            <p className="mt-1 text-sm text-red-600">{errors.montant_ht.message}</p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-foreground">
            {t('labels.tva')}
          </label>
          <input
            type="number"
            step="0.01"
            {...register('taux_tva', { valueAsNumber: true })}
            className="mt-1 block w-full rounded-md border border px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500"
          />
          {errors.taux_tva && (
            <p className="mt-1 text-sm text-red-600">{errors.taux_tva.message}</p>
          )}
        </div>
      </div>

      {/* Calcul automatique */}
      <div className="rounded-lg bg-blue-50 p-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
          <div>
            <span className="text-muted-foreground">{t('helpers.amountHTLabel')}</span>
            <p className="font-semibold text-foreground">
              {montantHT.toFixed(3)} TND
            </p>
          </div>
          <div>
            <span className="text-muted-foreground">{t('helpers.tvaLabel')} ({tauxTVA}%):</span>
            <p className="font-semibold text-foreground">
              {montantTVA.toFixed(3)} TND
            </p>
          </div>
          <div>
            <span className="text-muted-foreground">{t('helpers.amountTTCLabel')}</span>
            <p className="text-lg font-bold text-blue-600">
              {montantTTC.toFixed(3)} TND
            </p>
          </div>
        </div>
      </div>

      {/* Dates */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-foreground">
            {t('labels.issueDateRequired')}
          </label>
          <input
            type="date"
            {...register('date_emission')}
            className="mt-1 block w-full rounded-md border border px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500"
          />
          {errors.date_emission && (
            <p className="mt-1 text-sm text-red-600">
              {errors.date_emission.message}
            </p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-foreground">
            {t('labels.dueDate')}
          </label>
          <input
            type="date"
            {...register('date_echeance')}
            className="mt-1 block w-full rounded-md border border px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500"
          />
        </div>
      </div>

      {/* Statut */}
      <div>
        <label className="block text-sm font-medium text-foreground">
          {t('labels.statusRequired')}
        </label>
        <select
          {...register('statut')}
          className="mt-1 block w-full rounded-md border border px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500"
        >
          <option value="brouillon">{t('options.statusDraft')}</option>
          <option value="envoyee">{t('options.statusSent')}</option>
          <option value="payee">{t('options.statusPaid')}</option>
          <option value="impayee">{t('options.statusUnpaid')}</option>
        </select>
        {errors.statut && (
          <p className="mt-1 text-sm text-red-600">{errors.statut.message}</p>
        )}
      </div>

      {/* Notes */}
      <div>
        <label className="block text-sm font-medium text-foreground">{t('labels.notes')}</label>
        <textarea
          {...register('notes')}
          rows={3}
          className="mt-1 block w-full rounded-md border border px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500"
          placeholder={t('placeholders.internalNotes')}
        />
      </div>

      {/* Actions */}
      <div className="flex gap-4">
        <button
          type="submit"
          disabled={loading}
          className="rounded-md bg-blue-600 px-6 py-2 text-white font-semibold hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? t('buttons.saving') : isEditing ? t('buttons.edit') : t('buttons.create')}
        </button>

        <button
          type="button"
          onClick={() => router.back()}
          className="rounded-md border border bg-card px-6 py-2 text-foreground font-semibold hover:bg-muted focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
        >
          {t('buttons.cancel')}
        </button>
      </div>
    </form>
  )
}
