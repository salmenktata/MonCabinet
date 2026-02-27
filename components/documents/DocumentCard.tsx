'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { deleteDocumentAction, getDocumentUrlAction } from '@/app/actions/documents'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'

interface DocumentCardProps {
  document: any
}

const categorieColors: Record<string, string> = {
  contrat: 'bg-blue-100 text-blue-700',
  jugement: 'bg-purple-100 text-purple-700',
  correspondance: 'bg-green-100 text-green-700',
  piece: 'bg-yellow-100 text-yellow-700',
  autre: 'bg-muted text-foreground',
}

export default function DocumentCard({ document }: DocumentCardProps) {
  const router = useRouter()
  const t = useTranslations('documents.categories')
  const tConfirm = useTranslations('confirmations')
  const tCommon = useTranslations('common')
  const tCards = useTranslations('cards')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [showActions, setShowActions] = useState(false)
  const [textViewerOpen, setTextViewerOpen] = useState(false)
  const [textContent, setTextContent] = useState<string | null>(null)
  const [textLoading, setTextLoading] = useState(false)
  const [textError, setTextError] = useState('')
  const [textMeta, setTextMeta] = useState<{ wordCount?: number; pageCount?: number; language?: string } | null>(null)

  const categorieLabels: Record<string, string> = {
    contrat: t('contrat'),
    jugement: t('jugement'),
    correspondance: t('correspondance'),
    piece: t('piece'),
    autre: t('autre'),
  }

  const handleDownload = async () => {
    setLoading(true)
    setError('')

    const result = await getDocumentUrlAction(document.id)

    if (result.error) {
      setError(result.error)
      setLoading(false)
      return
    }

    // Ouvrir l'URL dans un nouvel onglet
    if (result.url) {
      window.open(result.url, '_blank')
    }

    setLoading(false)
  }

  const canExtractText = () => {
    const mime = document.type_fichier || ''
    const ext = (document.nom_fichier || '').split('.').pop()?.toLowerCase()
    return (
      document.storage_provider === 'minio' &&
      (mime.includes('pdf') || mime.includes('word') || mime.includes('text') ||
        ext === 'pdf' || ext === 'docx' || ext === 'doc' || ext === 'txt')
    )
  }

  const handleReadText = async () => {
    setTextViewerOpen(true)
    if (textContent !== null) return // déjà chargé

    setTextLoading(true)
    setTextError('')
    try {
      const res = await fetch(
        `/api/dossiers/${document.dossier_id}/documents/${document.id}/extract-text`
      )
      const data = await res.json()
      if (!res.ok) {
        setTextError(data.error || 'Erreur lors de l\'extraction')
      } else {
        setTextContent(data.text)
        setTextMeta({ wordCount: data.wordCount, pageCount: data.pageCount, language: data.language })
      }
    } catch {
      setTextError('Erreur réseau lors de l\'extraction')
    } finally {
      setTextLoading(false)
    }
  }

  const handleDelete = async () => {
    if (!confirm(tConfirm('deleteDocument'))) return

    setLoading(true)
    const result = await deleteDocumentAction(document.id)

    if (result.error) {
      setError(result.error)
      setLoading(false)
      return
    }

    router.refresh()
  }

  const formatFileSize = (bytes: number) => {
    if (!bytes) return 'N/A'
    if (bytes < 1024) return bytes + ' B'
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
  }

  const getFileIcon = (fileName: string, type: string) => {
    const ext = fileName.split('.').pop()?.toLowerCase()

    if (ext === 'pdf' || type?.includes('pdf')) {
      return (
        <svg className="h-8 w-8 text-red-500" fill="currentColor" viewBox="0 0 20 20">
          <path d="M4 4a2 2 0 012-2h8a2 2 0 012 2v12a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 0v12h8V4H6z" />
        </svg>
      )
    }

    if (['doc', 'docx'].includes(ext || '') || type?.includes('word')) {
      return (
        <svg className="h-8 w-8 text-blue-500" fill="currentColor" viewBox="0 0 20 20">
          <path d="M4 4a2 2 0 012-2h8a2 2 0 012 2v12a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm3 2h6v2H7V6zm0 4h6v2H7v-2z" />
        </svg>
      )
    }

    if (['xls', 'xlsx'].includes(ext || '') || type?.includes('excel') || type?.includes('spreadsheet')) {
      return (
        <svg className="h-8 w-8 text-green-500" fill="currentColor" viewBox="0 0 20 20">
          <path d="M3 4a1 1 0 011-1h12a1 1 0 011 1v12a1 1 0 01-1 1H4a1 1 0 01-1-1V4zm2 0v12h10V4H5zm2 2h6v2H7V6zm0 4h6v2H7v-2z" />
        </svg>
      )
    }

    if (['jpg', 'jpeg', 'png', 'gif'].includes(ext || '') || type?.includes('image')) {
      return (
        <svg className="h-8 w-8 text-purple-500" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z" clipRule="evenodd" />
        </svg>
      )
    }

    return (
      <svg className="h-8 w-8 text-muted-foreground" fill="currentColor" viewBox="0 0 20 20">
        <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clipRule="evenodd" />
      </svg>
    )
  }

  return (
    <div className="rounded-lg border bg-card p-4 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-start gap-3">
        {/* Icône fichier */}
        <div className="flex-shrink-0">
          {getFileIcon(document.nom_fichier, document.type_fichier)}
        </div>

        {/* Informations */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <h3 className="font-medium text-foreground truncate">{document.nom_fichier}</h3>

              {document.description && (
                <p className="mt-1 text-sm text-muted-foreground">{document.description}</p>
              )}

              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                {document.categorie && (
                  <span
                    className={`inline-flex items-center rounded-full px-2 py-1 font-medium ${
                      categorieColors[document.categorie] || categorieColors.autre
                    }`}
                  >
                    {categorieLabels[document.categorie] || 'Autre'}
                  </span>
                )}

                <span>{formatFileSize(document.taille_fichier)}</span>

                <span>•</span>

                <span>
                  {new Date(document.created_at).toLocaleDateString('fr-FR', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                  })}
                </span>
              </div>
            </div>

            <button
              onClick={() => setShowActions(!showActions)}
              disabled={loading}
              className="rounded-md border border bg-card px-2 py-1 text-xs font-medium text-foreground hover:bg-muted"
            >
              {showActions ? tCards('close') : tCards('actions')}
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="mt-3 rounded-md bg-red-50 p-2 text-sm text-red-800">
          {error}
        </div>
      )}

      {showActions && (
        <div className="mt-3 flex flex-wrap gap-2 border-t pt-3">
          <button
            onClick={handleDownload}
            disabled={loading}
            className="flex-1 rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? '⏳' : '📥'} {loading ? tCommon('loading') : 'Télécharger'}
          </button>

          {canExtractText() && (
            <button
              onClick={handleReadText}
              disabled={loading}
              className="rounded-md border border-slate-300 bg-card px-3 py-2 text-sm font-medium text-foreground hover:bg-muted disabled:opacity-50"
            >
              📄 Lire le texte
            </button>
          )}

          <button
            onClick={handleDelete}
            disabled={loading}
            className="rounded-md border border-red-300 bg-card px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
          >
            🗑️ {tCommon('delete')}
          </button>
        </div>
      )}

      {/* Viewer de texte extrait */}
      <Sheet open={textViewerOpen} onOpenChange={setTextViewerOpen}>
        <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="text-base font-semibold truncate pr-4">
              📄 {document.nom_fichier}
            </SheetTitle>
            {textMeta && (
              <p className="text-xs text-muted-foreground">
                {textMeta.wordCount?.toLocaleString()} mots
                {textMeta.pageCount ? ` • ${textMeta.pageCount} pages` : ''}
                {textMeta.language ? ` • ${textMeta.language.toUpperCase()}` : ''}
              </p>
            )}
          </SheetHeader>

          <div className="mt-4">
            {textLoading && (
              <div className="flex items-center justify-center py-16 text-muted-foreground">
                <span className="animate-spin mr-2">⏳</span>
                Extraction en cours...
              </div>
            )}
            {textError && (
              <div className="rounded-md bg-red-50 p-3 text-sm text-red-800">
                {textError}
              </div>
            )}
            {!textLoading && !textError && textContent !== null && (
              <div
                className="whitespace-pre-wrap text-sm text-foreground leading-relaxed"
                dir={textMeta?.language === 'ar' ? 'rtl' : 'ltr'}
              >
                {textContent || 'Aucun texte extrait'}
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  )
}
