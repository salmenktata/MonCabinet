'use client'

import Link from 'next/link'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { deleteClientAction } from '@/app/actions/clients'

interface ClientCardProps {
  client: any
}

export default function ClientCard({ client }: ClientCardProps) {
  const router = useRouter()
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState('')

  const handleDelete = async () => {
    setDeleting(true)
    setError('')

    const result = await deleteClientAction(client.id)

    if (result.error) {
      setError(result.error)
      setDeleting(false)
      return
    }

    router.refresh()
  }

  const displayName =
    client.type === 'PERSONNE_PHYSIQUE'
      ? `${client.nom} ${client.prenom || ''}`.trim()
      : client.denomination

  return (
    <div className="rounded-lg border bg-white p-6 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-semibold text-gray-900">
              {displayName}
            </h3>
            <span
              className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${
                client.type === 'PERSONNE_PHYSIQUE'
                  ? 'bg-blue-100 text-blue-700'
                  : 'bg-purple-100 text-purple-700'
              }`}
            >
              {client.type === 'PERSONNE_PHYSIQUE' ? 'Physique' : 'Morale'}
            </span>
          </div>

          <div className="mt-2 space-y-1 text-sm text-gray-600">
            {client.type === 'PERSONNE_PHYSIQUE' && client.cin && (
              <p>CIN: {client.cin}</p>
            )}
            {client.type === 'PERSONNE_MORALE' && client.registre_commerce && (
              <p>RC: {client.registre_commerce}</p>
            )}
            {client.email && (
              <p className="flex items-center gap-1">
                <svg
                  className="h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                  />
                </svg>
                {client.email}
              </p>
            )}
            {client.telephone && (
              <p className="flex items-center gap-1">
                <svg
                  className="h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"
                  />
                </svg>
                {client.telephone}
              </p>
            )}
            {client.ville && (
              <p className="flex items-center gap-1">
                <svg
                  className="h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
                  />
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
                  />
                </svg>
                {client.ville}
              </p>
            )}
          </div>
        </div>
      </div>

      {error && (
        <div className="mt-4 rounded-md bg-red-50 p-3 text-sm text-red-800">
          {error}
        </div>
      )}

      {showDeleteConfirm ? (
        <div className="mt-4 rounded-md bg-red-50 p-4">
          <p className="text-sm text-red-800 font-medium">
            Confirmer la suppression ?
          </p>
          <div className="mt-3 flex gap-2">
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="rounded-md bg-red-600 px-3 py-1 text-sm text-white hover:bg-red-700 disabled:opacity-50"
            >
              {deleting ? 'Suppression...' : 'Oui, supprimer'}
            </button>
            <button
              onClick={() => setShowDeleteConfirm(false)}
              className="rounded-md border border-gray-300 bg-white px-3 py-1 text-sm text-gray-700 hover:bg-gray-50"
            >
              Annuler
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-4 flex gap-2">
          <Link
            href={`/clients/${client.id}`}
            className="flex-1 rounded-md border border-blue-600 bg-white px-3 py-2 text-center text-sm font-medium text-blue-600 hover:bg-blue-50"
          >
            Voir détails
          </Link>
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="rounded-md border border-red-300 bg-white px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
          >
            Supprimer
          </button>
        </div>
      )}
    </div>
  )
}
