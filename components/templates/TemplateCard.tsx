'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { deleteTemplateAction, duplicateTemplateAction } from '@/app/actions/templates'
import { TYPE_DOCUMENT_LABELS } from '@/lib/validations/template'

interface TemplateCardProps {
  template: any
}

const typeColors: Record<string, string> = {
  assignation: 'bg-blue-100 text-blue-700',
  requete: 'bg-purple-100 text-purple-700',
  conclusions_demandeur: 'bg-green-100 text-green-700',
  conclusions_defenseur: 'bg-orange-100 text-orange-700',
  constitution_avocat: 'bg-indigo-100 text-indigo-700',
  mise_en_demeure: 'bg-red-100 text-red-700',
  appel: 'bg-yellow-100 text-yellow-700',
  refere: 'bg-pink-100 text-pink-700',
  procuration: 'bg-teal-100 text-teal-700',
  autre: 'bg-gray-100 text-gray-700',
}

export default function TemplateCard({ template }: TemplateCardProps) {
  const router = useRouter()
  const t = useTranslations('templates')
  const tConfirm = useTranslations('confirmations')
  const tCards = useTranslations('cards')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [showActions, setShowActions] = useState(false)

  const handleDelete = async () => {
    if (!confirm(tConfirm('deleteTemplate'))) return

    setLoading(true)
    const result = await deleteTemplateAction(template.id)

    if (result.error) {
      setError(result.error)
      setLoading(false)
      return
    }

    router.refresh()
  }

  const handleDuplicate = async () => {
    setLoading(true)
    setError('')

    const result = await duplicateTemplateAction(template.id)

    if (result.error) {
      setError(result.error)
      setLoading(false)
      return
    }

    router.refresh()
    setLoading(false)
  }

  const variableCount = Array.isArray(template.variables) ? template.variables.length : 0

  return (
    <div className="rounded-lg border bg-white p-5 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          {/* Titre */}
          <div className="flex items-start gap-2">
            <h3 className="font-semibold text-gray-900 text-lg truncate">{template.titre}</h3>
            {template.est_public && (
              <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                {t('public')}
              </span>
            )}
          </div>

          {/* Description */}
          {template.description && (
            <p className="mt-1 text-sm text-gray-600 line-clamp-2">{template.description}</p>
          )}

          {/* Métadonnées */}
          <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-gray-500">
            {/* Type */}
            <span
              className={`inline-flex items-center rounded-full px-2.5 py-1 font-medium ${
                typeColors[template.type_document] || typeColors.autre
              }`}
            >
              {TYPE_DOCUMENT_LABELS[template.type_document] || 'Autre'}
            </span>

            {/* Variables */}
            {variableCount > 0 && (
              <span className="flex items-center gap-1">
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
                    d="M7 20l4-16m2 16l4-16M6 9h14M4 15h14"
                  />
                </svg>
                {variableCount} variable{variableCount > 1 ? 's' : ''}
              </span>
            )}

            {/* Utilisations */}
            {template.nombre_utilisations > 0 && (
              <span className="flex items-center gap-1">
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
                    d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                {template.nombre_utilisations} utilisation{template.nombre_utilisations > 1 ? 's' : ''}
              </span>
            )}

            {/* Date */}
            <span>
              {new Date(template.created_at).toLocaleDateString('fr-FR', {
                day: 'numeric',
                month: 'short',
                year: 'numeric',
              })}
            </span>
          </div>
        </div>

        {/* Bouton Actions */}
        <button
          onClick={() => setShowActions(!showActions)}
          disabled={loading}
          className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          {showActions ? 'Fermer' : 'Actions'}
        </button>
      </div>

      {/* Message d'erreur */}
      {error && (
        <div className="mt-3 rounded-md bg-red-50 p-2 text-sm text-red-800">{error}</div>
      )}

      {/* Menu d'actions */}
      {showActions && (
        <div className="mt-4 flex flex-wrap gap-2 border-t pt-4">
          <Link
            href={`/templates/${template.id}`}
            className="flex-1 rounded-md bg-blue-600 px-3 py-2 text-center text-sm font-medium text-white hover:bg-blue-700"
          >
            📄 Voir détails
          </Link>

          <Link
            href={`/templates/${template.id}/edit`}
            className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            ✏️ Modifier
          </Link>

          <button
            onClick={handleDuplicate}
            disabled={loading}
            className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            📋 Dupliquer
          </button>

          <Link
            href={`/templates/${template.id}/generate`}
            className="rounded-md border border-green-300 bg-green-50 px-3 py-2 text-sm font-medium text-green-700 hover:bg-green-100"
          >
            ⚡ Générer
          </Link>

          <button
            onClick={handleDelete}
            disabled={loading}
            className="rounded-md border border-red-300 bg-white px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
          >
            🗑️ Supprimer
          </button>
        </div>
      )}
    </div>
  )
}
