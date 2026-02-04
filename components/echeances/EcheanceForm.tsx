'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { echeanceSchema, type EcheanceFormData } from '@/lib/validations/echeance'
import { createEcheanceAction, updateEcheanceAction, calculateEcheanceAction } from '@/app/actions/echeances'
import { calculerEcheance } from '@/lib/utils/delais-tunisie'

interface EcheanceFormProps {
  echeanceId?: string
  initialData?: any
  isEditing?: boolean
  dossierId: string
}

export default function EcheanceForm({
  echeanceId,
  initialData,
  isEditing = false,
  dossierId,
}: EcheanceFormProps) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [showCalculator, setShowCalculator] = useState(false)

  // Calcul automatique
  const [dateDepart, setDateDepart] = useState('')
  const [nombreJours, setNombreJours] = useState<number>(0)
  const [typeDelai, setTypeDelai] = useState<'jours_calendaires' | 'jours_ouvrables' | 'jours_francs'>('jours_ouvrables')
  const [dateCalculee, setDateCalculee] = useState('')

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
    setValue,
  } = useForm<EcheanceFormData>({
    resolver: zodResolver(echeanceSchema),
    defaultValues: initialData || {
      dossier_id: dossierId,
      type_echeance: 'delai_legal',
      statut: 'actif',
      rappel_j15: false,
      rappel_j7: true,
      rappel_j3: true,
      rappel_j1: true,
    },
  })

  const typeEcheance = watch('type_echeance')

  const handleCalculer = () => {
    if (!dateDepart || !nombreJours) {
      setError('Veuillez renseigner une date de départ et un nombre de jours')
      return
    }

    try {
      const date = calculerEcheance(
        new Date(dateDepart),
        nombreJours,
        typeDelai,
        true // Exclure vacances judiciaires
      )

      const dateFormatted = date.toISOString().split('T')[0]
      setDateCalculee(dateFormatted)
      setValue('date_echeance', dateFormatted)
      setValue('date_point_depart', dateDepart)
      setValue('nombre_jours', nombreJours)
      setValue('delai_type', typeDelai)
      setError('')
    } catch (err) {
      setError('Erreur lors du calcul de l\'échéance')
    }
  }

  const onSubmit = async (data: EcheanceFormData) => {
    setError('')
    setLoading(true)

    try {
      const result = isEditing && echeanceId
        ? await updateEcheanceAction(echeanceId, data)
        : await createEcheanceAction(data)

      if (result.error) {
        setError(result.error)
        setLoading(false)
        return
      }

      router.push(`/dossiers/${dossierId}`)
      router.refresh()
    } catch (err) {
      setError('Une erreur est survenue')
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

      {/* Type d'échéance */}
      <div>
        <label className="block text-sm font-medium text-gray-700">
          Type d&apos;échéance *
        </label>
        <select
          {...register('type_echeance')}
          className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500"
        >
          <option value="audience">Audience</option>
          <option value="delai_legal">Délai légal</option>
          <option value="delai_interne">Délai interne</option>
          <option value="autre">Autre</option>
        </select>
        {errors.type_echeance && (
          <p className="mt-1 text-sm text-red-600">{errors.type_echeance.message}</p>
        )}
      </div>

      {/* Titre */}
      <div>
        <label className="block text-sm font-medium text-gray-700">
          Titre *
        </label>
        <input
          {...register('titre')}
          className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500"
          placeholder="Ex: Dépôt des conclusions"
        />
        {errors.titre && (
          <p className="mt-1 text-sm text-red-600">{errors.titre.message}</p>
        )}
      </div>

      {/* Description */}
      <div>
        <label className="block text-sm font-medium text-gray-700">Description</label>
        <textarea
          {...register('description')}
          rows={3}
          className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500"
          placeholder="Détails sur l'échéance..."
        />
      </div>

      {/* Calculateur de délais */}
      {typeEcheance === 'delai_legal' && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-blue-900">
              🧮 Calculateur de délais légaux
            </h3>
            <button
              type="button"
              onClick={() => setShowCalculator(!showCalculator)}
              className="text-sm text-blue-600 hover:text-blue-700"
            >
              {showCalculator ? 'Masquer' : 'Afficher'}
            </button>
          </div>

          {showCalculator && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    Date de départ
                  </label>
                  <input
                    type="date"
                    value={dateDepart}
                    onChange={(e) => setDateDepart(e.target.value)}
                    className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    Nombre de jours
                  </label>
                  <input
                    type="number"
                    value={nombreJours || ''}
                    onChange={(e) => setNombreJours(parseInt(e.target.value) || 0)}
                    className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500"
                    min="1"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Type de délai
                </label>
                <select
                  value={typeDelai}
                  onChange={(e) => setTypeDelai(e.target.value as any)}
                  className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500"
                >
                  <option value="jours_calendaires">Jours calendaires</option>
                  <option value="jours_ouvrables">Jours ouvrables</option>
                  <option value="jours_francs">Jours francs</option>
                </select>
                <p className="mt-1 text-xs text-gray-500">
                  {typeDelai === 'jours_calendaires' && 'Tous les jours sont comptés'}
                  {typeDelai === 'jours_ouvrables' && 'Exclut week-ends, fériés et vacances judiciaires'}
                  {typeDelai === 'jours_francs' && 'Délai franc : exclut le jour de départ et d\'arrivée'}
                </p>
              </div>

              <button
                type="button"
                onClick={handleCalculer}
                className="w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
              >
                Calculer l&apos;échéance
              </button>

              {dateCalculee && (
                <div className="rounded-md bg-green-50 p-3">
                  <p className="text-sm font-medium text-green-800">
                    📅 Date d&apos;échéance calculée :{' '}
                    <span className="font-bold">
                      {new Date(dateCalculee).toLocaleDateString('fr-FR', {
                        weekday: 'long',
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                      })}
                    </span>
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Date d'échéance */}
      <div>
        <label className="block text-sm font-medium text-gray-700">
          Date d&apos;échéance *
        </label>
        <input
          type="date"
          {...register('date_echeance')}
          className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500"
        />
        {errors.date_echeance && (
          <p className="mt-1 text-sm text-red-600">{errors.date_echeance.message}</p>
        )}
      </div>

      {/* Rappels */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-3">
          Rappels automatiques
        </label>
        <div className="space-y-2">
          <label className="flex items-center">
            <input type="checkbox" {...register('rappel_j15')} className="rounded" />
            <span className="ml-2 text-sm text-gray-700">15 jours avant</span>
          </label>
          <label className="flex items-center">
            <input type="checkbox" {...register('rappel_j7')} className="rounded" />
            <span className="ml-2 text-sm text-gray-700">7 jours avant</span>
          </label>
          <label className="flex items-center">
            <input type="checkbox" {...register('rappel_j3')} className="rounded" />
            <span className="ml-2 text-sm text-gray-700">3 jours avant</span>
          </label>
          <label className="flex items-center">
            <input type="checkbox" {...register('rappel_j1')} className="rounded" />
            <span className="ml-2 text-sm text-gray-700">1 jour avant</span>
          </label>
        </div>
      </div>

      {/* Notes */}
      <div>
        <label className="block text-sm font-medium text-gray-700">Notes</label>
        <textarea
          {...register('notes')}
          rows={2}
          className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500"
          placeholder="Notes internes..."
        />
      </div>

      {/* Actions */}
      <div className="flex gap-4">
        <button
          type="submit"
          disabled={loading}
          className="rounded-md bg-blue-600 px-6 py-2 text-white font-semibold hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? 'Enregistrement...' : isEditing ? 'Modifier' : 'Créer'}
        </button>

        <button
          type="button"
          onClick={() => router.back()}
          className="rounded-md border border-gray-300 bg-white px-6 py-2 text-gray-700 font-semibold hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
        >
          Annuler
        </button>
      </div>
    </form>
  )
}
