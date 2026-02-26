'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useTranslations } from 'next-intl'
import { dossierSchema, type DossierFormData } from '@/lib/validations/dossier'
import { createDossierAction, updateDossierAction } from '@/app/actions/dossiers'
import { WORKFLOWS_DISPONIBLES, getWorkflowById } from '@/lib/workflows/workflows-config'
import DossierCommercialForm from './DossierCommercialForm'
import DossierDivorceForm from './DossierDivorceForm'
import { LimitReachedModal } from '@/components/plans/LimitReachedModal'

interface DossierFormProps {
  initialData?: any
  isEditing?: boolean
  clients?: any[]
  preselectedClientId?: string
}

export default function DossierForm({
  initialData,
  isEditing = false,
  clients = [],
  preselectedClientId,
}: DossierFormProps) {
  const router = useRouter()
  const t = useTranslations('forms')
  const tErrors = useTranslations('errors')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [limitModal, setLimitModal] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors },
    setValue,
    watch,
  } = useForm<DossierFormData>({
    resolver: zodResolver(dossierSchema),
    defaultValues: initialData || {
      client_id: preselectedClientId || '',
      type_procedure: 'civil_premiere_instance',
      statut: 'actif',
      workflow_etape_actuelle: 'ASSIGNATION',
    },
  })

  // Surveiller le type de procédure pour mettre à jour l'étape par défaut
  const typeProcedure = watch('type_procedure')

  useEffect(() => {
    if (typeProcedure && !isEditing) {
      const workflow = getWorkflowById(typeProcedure)
      if (workflow && workflow.etapes.length > 0) {
        setValue('workflow_etape_actuelle', workflow.etapes[0].id)
      }
    }
  }, [typeProcedure, setValue, isEditing])

  useEffect(() => {
    if (preselectedClientId) {
      setValue('client_id', preselectedClientId)
    }
  }, [preselectedClientId, setValue])

  const onSubmit = async (data: DossierFormData) => {
    setError('')
    setLoading(true)

    try {
      const result = isEditing
        ? await updateDossierAction(initialData.id, data)
        : await createDossierAction(data)

      if (result.error) {
        if ('limitReached' in result && result.limitReached) {
          setLimitModal(true)
        } else {
          setError(result.error)
        }
        setLoading(false)
        return
      }

      router.push('/dossiers')
      router.refresh()
    } catch (err) {
      setError(tErrors('generic'))
      setLoading(false)
    }
  }

  return (
    <>
    <LimitReachedModal
      open={limitModal}
      onClose={() => setLimitModal(false)}
      type="dossiers"
      limit={10}
    />
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      {error && (
        <div className="rounded-md bg-red-50 p-4 text-sm text-red-800">
          {error}
        </div>
      )}

      {/* Client */}
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

      {/* Informations principales */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-foreground">
            {t('labels.dossierNumberRequired')}
          </label>
          <input
            {...register('numero')}
            className="mt-1 block w-full rounded-md border border px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500"
            placeholder={t('placeholders.enterDossierNumber')}
          />
          {errors.numero && (
            <p className="mt-1 text-sm text-red-600">
              {errors.numero.message}
            </p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-foreground">
            {t('labels.procedureTypeRequired')}
          </label>
          <select
            {...register('type_procedure')}
            className="mt-1 block w-full rounded-md border border px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500"
          >
            {WORKFLOWS_DISPONIBLES.map((workflow) => (
              <option key={workflow.id} value={workflow.id}>
                {workflow.nom}
              </option>
            ))}
          </select>
          {errors.type_procedure && (
            <p className="mt-1 text-sm text-red-600">
              {errors.type_procedure.message}
            </p>
          )}
        </div>
      </div>

      {/* Objet */}
      <div>
        <label className="block text-sm font-medium text-foreground">
          {t('labels.objectRequired')}
        </label>
        <input
          {...register('objet')}
          className="mt-1 block w-full rounded-md border border px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500"
          placeholder={t('placeholders.enterObject')}
        />
        {errors.objet && (
          <p className="mt-1 text-sm text-red-600">{errors.objet.message}</p>
        )}
      </div>

      {/* Description */}
      <div>
        <label className="block text-sm font-medium text-foreground">
          {t('labels.description')}
        </label>
        <textarea
          {...register('notes')}
          rows={4}
          className="mt-1 block w-full rounded-md border border px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500"
          placeholder={t('placeholders.detailedDescription')}
        />
        {errors.notes && (
          <p className="mt-1 text-sm text-red-600">{errors.notes.message}</p>
        )}
      </div>

      {/* Parties et tribunal */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-foreground">
            {t('labels.adverseParty')}
          </label>
          <input
            {...register('partie_adverse')}
            className="mt-1 block w-full rounded-md border border px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500"
            placeholder={t('placeholders.adversePartyName')}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-foreground">
            {t('labels.adverseLawyer')}
          </label>
          <input
            {...register('avocat_adverse')}
            className="mt-1 block w-full rounded-md border border px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500"
            placeholder={t('placeholders.adverseLawyerName')}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-foreground">
            {t('labels.tribunal')}
          </label>
          <input
            {...register('tribunal')}
            className="mt-1 block w-full rounded-md border border px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500"
            placeholder={t('placeholders.exampleTribunal')}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-foreground">
            {t('labels.numeroRG')}
          </label>
          <input
            {...register('numero_rg')}
            className="mt-1 block w-full rounded-md border border px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500"
            placeholder={t('placeholders.exampleRG')}
          />
        </div>
      </div>

      {/* Date et montant */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-foreground">
            {t('labels.openingDate')}
          </label>
          <input
            type="date"
            {...register('date_ouverture')}
            className="mt-1 block w-full rounded-md border border px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-foreground">
            {t('labels.amountLitige')}
          </label>
          <input
            type="number"
            step="0.01"
            {...register('montant_litige', { valueAsNumber: true })}
            className="mt-1 block w-full rounded-md border border px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500"
            placeholder={t('placeholders.enterAmount')}
          />
        </div>
      </div>

      {/* Statut et étape */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-foreground">
            {t('labels.statusRequired')}
          </label>
          <select
            {...register('statut')}
            className="mt-1 block w-full rounded-md border border px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500"
          >
            <option value="actif">{t('options.statusActive')}</option>
            <option value="clos">{t('options.statusClosed')}</option>
            <option value="archive">{t('options.statusArchived')}</option>
          </select>
          {errors.statut && (
            <p className="mt-1 text-sm text-red-600">{errors.statut.message}</p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-foreground">
            {t('labels.workflowStep')}
          </label>
          <select
            {...register('workflow_etape_actuelle')}
            className="mt-1 block w-full rounded-md border border px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500"
          >
            {(() => {
              const workflow = getWorkflowById(typeProcedure || 'civil_premiere_instance')
              return workflow?.etapes.map((etape) => (
                <option key={etape.id} value={etape.id}>
                  {etape.libelle}
                </option>
              )) || []
            })()}
          </select>
        </div>
      </div>

      {/* Notes */}
      <div>
        <label className="block text-sm font-medium text-foreground">{t('labels.notes')}</label>
        <textarea
          {...register('notes')}
          rows={3}
          className="mt-1 block w-full rounded-md border border px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500"
          placeholder={t('placeholders.privateNotes')}
        />
      </div>

      {/* Section spécialisée selon type de procédure */}
      {typeProcedure === 'commercial' && (
        <div className="rounded-lg border-2 border-purple-200 bg-purple-50 dark:bg-purple-950/20 p-6">
          <h3 className="text-lg font-semibold text-purple-900 dark:text-purple-100 mb-4 flex items-center gap-2">
            <span>💼</span> Informations commerciales
          </h3>
          <p className="text-sm text-muted-foreground mb-4">
            Champs spécifiques aux litiges commerciaux (calcul intérêts, chèques, registre commerce)
          </p>
          <DossierCommercialForm
            register={register}
            watch={watch}
            errors={errors}
            setValue={setValue}
          />
        </div>
      )}

      {typeProcedure === 'divorce' && (
        <div className="rounded-lg border-2 border-amber-200 bg-amber-50 dark:bg-amber-950/20 p-6">
          <h3 className="text-lg font-semibold text-amber-900 dark:text-amber-100 mb-4 flex items-center gap-2">
            <span>👨‍👩‍👧</span> Informations divorce
          </h3>
          <p className="text-sm text-muted-foreground mb-4">
            Champs spécifiques aux procédures de divorce (pension compensatoire, garde, conciliation)
          </p>
          <DossierDivorceForm
            register={register}
            watch={watch}
            errors={errors}
            setValue={setValue}
          />
        </div>
      )}

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
    </>
  )
}
