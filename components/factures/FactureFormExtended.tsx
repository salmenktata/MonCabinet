'use client'

import { useState, useEffect } from 'react'
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

export default function FactureFormExtended({
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
      type_honoraires: 'forfait',
      montant_debours: 0,
      provisions_recues: 0,
    },
  })

  const typeHonoraires = watch('type_honoraires')
  const tauxHoraire = watch('taux_horaire') || 0
  const heures = watch('heures') || 0
  const pourcentageResultat = watch('pourcentage_resultat') || 0
  const montantHT = watch('montant_ht') || 0
  const montantDebours = watch('montant_debours') || 0
  const tauxTVA = watch('taux_tva') || 19
  const provisionsRecues = watch('provisions_recues') || 0

  // Calculs automatiques
  useEffect(() => {
    let calculatedHT = 0

    if (typeHonoraires === 'horaire') {
      calculatedHT = tauxHoraire * heures + montantDebours
      setValue('montant_ht', calculatedHT)
    } else if (typeHonoraires === 'mixte') {
      calculatedHT = tauxHoraire * heures + montantDebours
      // Pour mixte, on peut ajouter le résultat, mais il faut une base
      // Pour simplifier, on laisse l'utilisateur saisir montant_ht directement
    }
  }, [typeHonoraires, tauxHoraire, heures, montantDebours, setValue])

  const montantTVA = (montantHT * tauxTVA) / 100
  const montantTTC = montantHT + montantTVA
  const soldeAPayer = montantTTC - provisionsRecues

  const onSubmit = async (data: FactureFormData) => {
    setError('')
    setLoading(true)

    try {
      const result =
        isEditing && factureId
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
        <div className="rounded-md bg-red-50 p-4 text-sm text-red-800">{error}</div>
      )}

      {/* Client et Dossier */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-foreground">
            {t('labels.clientRequired')}
          </label>
          <select
            {...register('client_id')}
            className="mt-1 block w-full rounded-md border px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500"
          >
            <option value="">{t('placeholders.selectClient')}</option>
            {clients.map((client) => {
              const displayName =
                client.type === 'PERSONNE_PHYSIQUE'
                  ? `${client.nom} ${client.prenom || ''}`.trim()
                  : client.denomination
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
            className="mt-1 block w-full rounded-md border px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500"
          >
            <option value="">{t('placeholders.noDossier')}</option>
            {dossiers.map((dossier) => (
              <option key={dossier.id} value={dossier.id}>
                {dossier.numero_dossier} - {dossier.objet}
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
          className="mt-1 block w-full rounded-md border px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500"
          placeholder={t('placeholders.enterInvoiceObject')}
        />
        {errors.objet && (
          <p className="mt-1 text-sm text-red-600">{errors.objet.message}</p>
        )}
      </div>

      {/* Section Honoraires ONAT */}
      <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
        <h3 className="mb-4 text-lg font-semibold text-blue-900">
          💼 Honoraires (conformité ONAT)
        </h3>

        {/* Type d'honoraires */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-foreground">
            Type d&apos;honoraires <span className="text-red-500">*</span>
          </label>
          <select
            {...register('type_honoraires')}
            className="mt-1 block w-full rounded-md border px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500 bg-white"
          >
            <option value="forfait">Forfait (montant fixe)</option>
            <option value="horaire">Horaire (taux × heures)</option>
            <option value="resultat">Au résultat (% du gain obtenu)</option>
            <option value="mixte">Mixte (combinaison)</option>
          </select>
          <p className="mt-1 text-xs text-muted-foreground">
            {typeHonoraires === 'forfait' &&
              'Montant convenu à l\'avance, indépendant du temps passé'}
            {typeHonoraires === 'horaire' &&
              'Basé sur votre taux horaire et le temps facturé'}
            {typeHonoraires === 'resultat' &&
              'Pourcentage du résultat financier obtenu pour le client'}
            {typeHonoraires === 'mixte' &&
              'Combinaison de plusieurs modes (ex: forfait + résultat)'}
          </p>
          {errors.type_honoraires && (
            <p className="mt-1 text-sm text-red-600">{errors.type_honoraires.message}</p>
          )}
        </div>

        {/* Champs conditionnels selon type */}
        {(typeHonoraires === 'horaire' || typeHonoraires === 'mixte') && (
          <div className="mb-4 grid grid-cols-2 gap-4 rounded-md bg-white p-4">
            <div>
              <label className="block text-sm font-medium text-foreground">
                Taux horaire (TND) <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                step="0.01"
                {...register('taux_horaire', { valueAsNumber: true })}
                className="mt-1 block w-full rounded-md border px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500"
                placeholder="Ex: 150.00"
              />
              {errors.taux_horaire && (
                <p className="mt-1 text-sm text-red-600">{errors.taux_horaire.message}</p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground">
                Nombre d&apos;heures <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                step="0.25"
                {...register('heures', { valueAsNumber: true })}
                className="mt-1 block w-full rounded-md border px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500"
                placeholder="Ex: 12.50"
              />
              {errors.heures && (
                <p className="mt-1 text-sm text-red-600">{errors.heures.message}</p>
              )}
            </div>
            {typeHonoraires === 'horaire' && tauxHoraire > 0 && heures > 0 && (
              <div className="col-span-2 rounded-md bg-green-50 p-3">
                <p className="text-sm font-semibold text-green-900">
                  💡 Honoraires calculés: {(tauxHoraire * heures).toFixed(3)} TND
                </p>
              </div>
            )}
          </div>
        )}

        {(typeHonoraires === 'resultat' || typeHonoraires === 'mixte') && (
          <div className="mb-4 space-y-4 rounded-md bg-white p-4">
            <div>
              <label className="block text-sm font-medium text-foreground">
                Pourcentage du résultat (%) <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                max="100"
                {...register('pourcentage_resultat', { valueAsNumber: true })}
                className="mt-1 block w-full rounded-md border px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500"
                placeholder="Ex: 15"
              />
              {errors.pourcentage_resultat && (
                <p className="mt-1 text-sm text-red-600">
                  {errors.pourcentage_resultat.message}
                </p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground">
                Base de calcul détaillée <span className="text-red-500">*</span>
              </label>
              <textarea
                {...register('base_calcul')}
                rows={3}
                className="mt-1 block w-full rounded-md border px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500"
                placeholder="Ex: 15% du montant obtenu en dommages et intérêts (200 000 TND) = 30 000 TND"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Expliquez en détail le résultat obtenu et comment les honoraires sont
                calculés (obligation légale)
              </p>
              {errors.base_calcul && (
                <p className="mt-1 text-sm text-red-600">{errors.base_calcul.message}</p>
              )}
            </div>
          </div>
        )}

        {/* Montant HT (saisie manuelle pour forfait/résultat/mixte) */}
        {typeHonoraires !== 'horaire' && (
          <div className="mb-4">
            <label className="block text-sm font-medium text-foreground">
              Montant honoraires HT (TND) <span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              step="0.001"
              {...register('montant_ht', { valueAsNumber: true })}
              className="mt-1 block w-full rounded-md border px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500 bg-white"
              placeholder="Montant des honoraires hors taxes"
            />
            {errors.montant_ht && (
              <p className="mt-1 text-sm text-red-600">{errors.montant_ht.message}</p>
            )}
          </div>
        )}
      </div>

      {/* Section Débours */}
      <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-4">
        <h3 className="mb-4 text-lg font-semibold text-yellow-900">
          📋 Débours et frais
        </h3>
        <div>
          <label className="block text-sm font-medium text-foreground">
            Montant total débours (TND)
          </label>
          <input
            type="number"
            step="0.001"
            {...register('montant_debours', { valueAsNumber: true })}
            className="mt-1 block w-full rounded-md border px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500 bg-white"
            placeholder="Ex: frais greffe, huissier, expertise..."
          />
          <p className="mt-1 text-xs text-muted-foreground">
            Frais engagés pour le compte du client (greffe, huissier, expert, etc.)
            Séparés des honoraires pour conformité ONAT
          </p>
          {errors.montant_debours && (
            <p className="mt-1 text-sm text-red-600">{errors.montant_debours.message}</p>
          )}
        </div>
      </div>

      {/* Section Provisions */}
      <div className="rounded-lg border border-purple-200 bg-purple-50 p-4">
        <h3 className="mb-4 text-lg font-semibold text-purple-900">
          💰 Provisions (acomptes versés)
        </h3>
        <div>
          <label className="block text-sm font-medium text-foreground">
            Total provisions reçues (TND)
          </label>
          <input
            type="number"
            step="0.001"
            {...register('provisions_recues', { valueAsNumber: true })}
            className="mt-1 block w-full rounded-md border px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500 bg-white"
            placeholder="Acomptes déjà versés par le client"
          />
          <p className="mt-1 text-xs text-muted-foreground">
            Sommes déjà versées par le client à déduire du montant TTC
          </p>
          {errors.provisions_recues && (
            <p className="mt-1 text-sm text-red-600">{errors.provisions_recues.message}</p>
          )}
        </div>
      </div>

      {/* TVA */}
      <div>
        <label className="block text-sm font-medium text-foreground">
          {t('labels.tva')}
        </label>
        <input
          type="number"
          step="0.01"
          {...register('taux_tva', { valueAsNumber: true })}
          className="mt-1 block w-full rounded-md border px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500"
        />
        {errors.taux_tva && (
          <p className="mt-1 text-sm text-red-600">{errors.taux_tva.message}</p>
        )}
      </div>

      {/* Calcul automatique */}
      <div className="rounded-lg border-2 border-blue-300 bg-gradient-to-r from-blue-50 to-blue-100 p-6">
        <h3 className="mb-4 text-lg font-bold text-blue-900">📊 Récapitulatif</h3>
        <div className="space-y-3">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Honoraires HT:</span>
            <span className="font-semibold">
              {(montantHT - montantDebours).toFixed(3)} TND
            </span>
          </div>
          {montantDebours > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Débours:</span>
              <span className="font-semibold">{montantDebours.toFixed(3)} TND</span>
            </div>
          )}
          <div className="flex justify-between border-t border-blue-200 pt-2 text-sm">
            <span className="text-muted-foreground">Total HT:</span>
            <span className="font-semibold">{montantHT.toFixed(3)} TND</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">TVA ({tauxTVA}%):</span>
            <span className="font-semibold">{montantTVA.toFixed(3)} TND</span>
          </div>
          <div className="flex justify-between border-t-2 border-blue-300 pt-2">
            <span className="font-bold text-blue-900">Total TTC:</span>
            <span className="text-xl font-bold text-blue-600">
              {montantTTC.toFixed(3)} TND
            </span>
          </div>
          {provisionsRecues > 0 && (
            <>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Provisions reçues:</span>
                <span className="font-semibold text-green-600">
                  - {provisionsRecues.toFixed(3)} TND
                </span>
              </div>
              <div className="flex justify-between border-t-2 border-blue-300 pt-2">
                <span className="font-bold text-blue-900">SOLDE À PAYER:</span>
                <span
                  className={`text-xl font-bold ${
                    soldeAPayer > 0 ? 'text-orange-600' : 'text-green-600'
                  }`}
                >
                  {soldeAPayer.toFixed(3)} TND
                </span>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Dates */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-foreground">
            {t('labels.issueDateRequired')}
          </label>
          <input
            type="date"
            {...register('date_emission')}
            className="mt-1 block w-full rounded-md border px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500"
          />
          {errors.date_emission && (
            <p className="mt-1 text-sm text-red-600">{errors.date_emission.message}</p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-foreground">
            {t('labels.dueDate')}
          </label>
          <input
            type="date"
            {...register('date_echeance')}
            className="mt-1 block w-full rounded-md border px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500"
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
          className="mt-1 block w-full rounded-md border px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500"
        >
          <option value="BROUILLON">{t('options.statusDraft')}</option>
          <option value="ENVOYEE">{t('options.statusSent')}</option>
          <option value="PAYEE">{t('options.statusPaid')}</option>
          <option value="IMPAYEE">{t('options.statusUnpaid')}</option>
        </select>
        {errors.statut && (
          <p className="mt-1 text-sm text-red-600">{errors.statut.message}</p>
        )}
      </div>

      {/* Notes */}
      <div>
        <label className="block text-sm font-medium text-foreground">
          {t('labels.notes')}
        </label>
        <textarea
          {...register('notes')}
          rows={3}
          className="mt-1 block w-full rounded-md border px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500"
          placeholder={t('placeholders.internalNotes')}
        />
      </div>

      {/* Actions */}
      <div className="flex gap-4">
        <button
          type="submit"
          disabled={loading}
          className="rounded-md bg-blue-600 px-6 py-2 font-semibold text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading
            ? t('buttons.saving')
            : isEditing
              ? t('buttons.edit')
              : t('buttons.create')}
        </button>

        <button
          type="button"
          onClick={() => router.back()}
          className="rounded-md border bg-card px-6 py-2 font-semibold text-foreground hover:bg-muted focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
        >
          {t('buttons.cancel')}
        </button>
      </div>

      {/* Info ONAT */}
      <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
        <h4 className="mb-2 font-semibold text-blue-900">ℹ️ Conformité ONAT</h4>
        <ul className="space-y-1 text-xs text-blue-800">
          <li>
            • Les honoraires doivent être clairement distingués des débours (obligation
            légale)
          </li>
          <li>
            • Les provisions reçues doivent être mentionnées sur la note d&apos;honoraires
          </li>
          <li>
            • Pour les honoraires au résultat, la base de calcul doit être détaillée
          </li>
          <li>
            • Une convention d&apos;honoraires écrite est obligatoire (générée
            automatiquement)
          </li>
        </ul>
      </div>
    </form>
  )
}
