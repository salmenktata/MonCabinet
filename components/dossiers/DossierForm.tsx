'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { dossierSchema, type DossierFormData } from '@/lib/validations/dossier'
import { createDossierAction, updateDossierAction } from '@/app/actions/dossiers'
import { WORKFLOW_CIVIL } from '@/lib/workflows/civil'

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
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const {
    register,
    handleSubmit,
    formState: { errors },
    setValue,
  } = useForm<DossierFormData>({
    resolver: zodResolver(dossierSchema),
    defaultValues: initialData || {
      client_id: preselectedClientId || '',
      type_procedure: 'CIVIL',
      statut: 'ACTIF',
      workflow_etape_actuelle: 'ASSIGNATION',
    },
  })

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
        setError(result.error)
        setLoading(false)
        return
      }

      router.push('/dossiers')
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

      {/* Client */}
      <div>
        <label className="block text-sm font-medium text-gray-700">
          Client *
        </label>
        <select
          {...register('client_id')}
          className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500"
        >
          <option value="">Sélectionner un client</option>
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

      {/* Informations principales */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700">
            Numéro de dossier *
          </label>
          <input
            {...register('numero_dossier')}
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500"
            placeholder="2025/001"
          />
          {errors.numero_dossier && (
            <p className="mt-1 text-sm text-red-600">
              {errors.numero_dossier.message}
            </p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">
            Type de procédure *
          </label>
          <select
            {...register('type_procedure')}
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500"
          >
            <option value="CIVIL">Civil</option>
            <option value="COMMERCIAL">Commercial</option>
            <option value="PENAL">Pénal</option>
            <option value="ADMINISTRATIF">Administratif</option>
            <option value="SOCIAL">Social</option>
            <option value="AUTRE">Autre</option>
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
        <label className="block text-sm font-medium text-gray-700">
          Objet du dossier *
        </label>
        <input
          {...register('objet')}
          className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500"
          placeholder="Ex: Action en recouvrement de créance"
        />
        {errors.objet && (
          <p className="mt-1 text-sm text-red-600">{errors.objet.message}</p>
        )}
      </div>

      {/* Description */}
      <div>
        <label className="block text-sm font-medium text-gray-700">
          Description
        </label>
        <textarea
          {...register('description')}
          rows={4}
          className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500"
          placeholder="Description détaillée de l'affaire..."
        />
        {errors.description && (
          <p className="mt-1 text-sm text-red-600">{errors.description.message}</p>
        )}
      </div>

      {/* Parties et tribunal */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700">
            Partie adverse
          </label>
          <input
            {...register('partie_adverse')}
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500"
            placeholder="Nom de la partie adverse"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">
            Avocat adverse
          </label>
          <input
            {...register('avocat_adverse')}
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500"
            placeholder="Nom de l'avocat adverse"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700">
            Tribunal
          </label>
          <input
            {...register('tribunal')}
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500"
            placeholder="Ex: Tribunal de Tunis"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">
            Numéro RG (Rôle Général)
          </label>
          <input
            {...register('numero_rg')}
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500"
            placeholder="Ex: 12345/2025"
          />
        </div>
      </div>

      {/* Date et montant */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700">
            Date d'ouverture
          </label>
          <input
            type="date"
            {...register('date_ouverture')}
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">
            Montant du litige (TND)
          </label>
          <input
            type="number"
            step="0.01"
            {...register('montant_litige', { valueAsNumber: true })}
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500"
            placeholder="0.00"
          />
        </div>
      </div>

      {/* Statut et étape */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700">
            Statut *
          </label>
          <select
            {...register('statut')}
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500"
          >
            <option value="ACTIF">Actif</option>
            <option value="CLOS">Clos</option>
            <option value="ARCHIVE">Archivé</option>
          </select>
          {errors.statut && (
            <p className="mt-1 text-sm text-red-600">{errors.statut.message}</p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">
            Étape du workflow
          </label>
          <select
            {...register('workflow_etape_actuelle')}
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500"
          >
            {WORKFLOW_CIVIL.etapes.map((etape) => (
              <option key={etape.id} value={etape.id}>
                {etape.nom}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Notes */}
      <div>
        <label className="block text-sm font-medium text-gray-700">Notes</label>
        <textarea
          {...register('notes')}
          rows={3}
          className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500"
          placeholder="Notes privées..."
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
