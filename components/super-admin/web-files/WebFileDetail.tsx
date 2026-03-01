'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Icons } from '@/lib/icons'
import { toast } from 'sonner'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'

interface WebFileChunk {
  id: string
  chunkIndex: number
  content: string
  tokenCount: number
}

interface WebFileData {
  id: string
  webPageId: string
  webSourceId: string
  knowledgeBaseId: string | null
  url: string
  filename: string
  fileType: string
  fileSize: number
  contentHash: string | null
  textContent: string | null
  wordCount: number | null
  chunksCount: number | null
  extractedTitle: string | null
  extractedAuthor: string | null
  extractedDate: string | null
  pageCount: number | null
  isDownloaded: boolean
  isIndexed: boolean
  downloadError: string | null
  parseError: string | null
  downloadedAt: string | null
  indexedAt: string | null
  createdAt: string
  updatedAt: string
  sourceName: string | null
  sourceCategory: string | null
  pageUrl: string | null
  pageTitle: string | null
  kbTitle: string | null
  status: 'pending' | 'downloaded' | 'indexed' | 'error'
}

interface Props {
  file: WebFileData
  chunks: WebFileChunk[]
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function StatusBadge({ status }: { status: WebFileData['status'] }) {
  const config = {
    indexed: { label: 'Indexé', className: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' },
    downloaded: { label: 'Téléchargé', className: 'bg-blue-500/20 text-blue-400 border-blue-500/30' },
    pending: { label: 'En attente', className: 'bg-slate-500/20 text-slate-400 border-slate-500/30' },
    error: { label: 'Erreur', className: 'bg-red-500/20 text-red-400 border-red-500/30' },
  }
  const c = config[status]
  return <Badge className={`${c.className} border`}>{c.label}</Badge>
}

export default function WebFileDetail({ file, chunks }: Props) {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<'preview' | 'chunks'>('preview')
  const [reindexLoading, setReindexLoading] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [deleteLoading, setDeleteLoading] = useState(false)

  async function handleReindex() {
    setReindexLoading(true)
    try {
      const res = await fetch(`/api/admin/web-files/${file.id}`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erreur réindexation')
      toast.success(`Réindexé : ${data.chunksCreated} chunks créés`)
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur')
    } finally {
      setReindexLoading(false)
    }
  }

  async function handleDelete() {
    setDeleteLoading(true)
    try {
      const res = await fetch(`/api/admin/web-files/${file.id}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erreur suppression')
      toast.success('Fichier supprimé')
      router.push('/super-admin/web-files')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur')
      setDeleteLoading(false)
    }
  }

  const fileTypeIcon = file.fileType === 'pdf' ? '📄' : file.fileType === 'docx' || file.fileType === 'doc' ? '📝' : '📁'

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-slate-400">
        <Link href="/super-admin/web-files" className="hover:text-slate-200 transition-colors">
          Fichiers Web
        </Link>
        <Icons.chevronRight className="h-4 w-4" />
        <span className="text-slate-200 truncate max-w-xs">{file.filename}</span>
      </div>

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3 min-w-0">
          <span className="text-3xl mt-1">{fileTypeIcon}</span>
          <div className="min-w-0">
            <h1 className="text-2xl font-bold text-slate-100 break-words">
              {file.extractedTitle || file.filename}
            </h1>
            {file.extractedTitle && (
              <p className="text-sm text-slate-400 mt-0.5 break-all">{file.filename}</p>
            )}
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <StatusBadge status={file.status} />
              <Badge className="bg-slate-700 text-slate-300 uppercase text-xs">{file.fileType}</Badge>
              {file.sourceName && (
                <Badge className="bg-slate-700/50 text-slate-400 text-xs">{file.sourceName}</Badge>
              )}
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <Button
            variant="outline"
            size="sm"
            onClick={() => window.open(file.url, '_blank')}
            className="border-slate-700 text-slate-300 hover:bg-slate-700"
          >
            <Icons.externalLink className="h-4 w-4 mr-2" />
            Voir l&apos;original
          </Button>
          {file.isDownloaded && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleReindex}
              disabled={reindexLoading}
              className="border-purple-700 text-purple-400 hover:bg-purple-700/20"
            >
              {reindexLoading ? (
                <Icons.loader className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Icons.refresh className="h-4 w-4 mr-2" />
              )}
              Réindexer
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowDeleteDialog(true)}
            className="border-red-700 text-red-400 hover:bg-red-700/20"
          >
            <Icons.trash className="h-4 w-4 mr-2" />
            Supprimer
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Colonne principale */}
        <div className="lg:col-span-2 space-y-4">
          {/* Erreurs */}
          {(file.downloadError || file.parseError) && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <Icons.alertCircle className="h-4 w-4 text-red-400" />
                <span className="text-red-400 font-medium text-sm">
                  {file.downloadError ? 'Erreur de téléchargement' : 'Erreur de parsing'}
                </span>
              </div>
              <p className="text-red-300 text-sm font-mono">
                {file.downloadError || file.parseError}
              </p>
            </div>
          )}

          {/* Tabs contenu */}
          <div className="bg-slate-800/50 rounded-lg border border-slate-700">
            <div className="flex border-b border-slate-700">
              <button
                onClick={() => setActiveTab('preview')}
                className={`px-4 py-3 text-sm font-medium transition-colors ${
                  activeTab === 'preview'
                    ? 'text-slate-100 border-b-2 border-blue-500'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Aperçu du texte
              </button>
              <button
                onClick={() => setActiveTab('chunks')}
                className={`px-4 py-3 text-sm font-medium transition-colors ${
                  activeTab === 'chunks'
                    ? 'text-slate-100 border-b-2 border-blue-500'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Chunks KB
                {chunks.length > 0 && (
                  <span className="ml-2 bg-slate-700 text-slate-300 text-xs px-1.5 py-0.5 rounded">
                    {chunks.length}
                  </span>
                )}
              </button>
            </div>

            <div className="p-4">
              {activeTab === 'preview' && (
                <div>
                  {file.textContent ? (
                    <pre className="text-sm text-slate-300 whitespace-pre-wrap font-sans leading-relaxed max-h-[600px] overflow-y-auto">
                      {file.textContent}
                    </pre>
                  ) : (
                    <div className="text-center py-12 text-slate-500">
                      <Icons.fileText className="h-12 w-12 mx-auto mb-3 opacity-30" />
                      <p>Aucun texte extrait disponible</p>
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'chunks' && (
                <div className="space-y-3 max-h-[600px] overflow-y-auto pr-1">
                  {chunks.length === 0 ? (
                    <div className="text-center py-12 text-slate-500">
                      <Icons.database className="h-12 w-12 mx-auto mb-3 opacity-30" />
                      <p>Aucun chunk — document non indexé</p>
                    </div>
                  ) : (
                    chunks.map((chunk) => (
                      <div
                        key={chunk.id}
                        className="bg-slate-900/50 rounded-lg p-3 border border-slate-700/50"
                      >
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs text-slate-500 font-mono">
                            Chunk #{chunk.chunkIndex + 1}
                          </span>
                          <span className="text-xs text-slate-500">{chunk.tokenCount} tokens</span>
                        </div>
                        <p className="text-sm text-slate-300 leading-relaxed">{chunk.content}</p>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          {/* Informations fichier */}
          <div className="bg-slate-800/50 rounded-lg border border-slate-700 p-4">
            <h3 className="text-sm font-semibold text-slate-200 mb-3">Informations</h3>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-slate-400">Taille</dt>
                <dd className="text-slate-200">{formatBytes(file.fileSize)}</dd>
              </div>
              {file.pageCount && (
                <div className="flex justify-between">
                  <dt className="text-slate-400">Pages</dt>
                  <dd className="text-slate-200">{file.pageCount}</dd>
                </div>
              )}
              {file.wordCount && (
                <div className="flex justify-between">
                  <dt className="text-slate-400">Mots</dt>
                  <dd className="text-slate-200">{file.wordCount.toLocaleString('fr-FR')}</dd>
                </div>
              )}
              {file.chunksCount !== null && (
                <div className="flex justify-between">
                  <dt className="text-slate-400">Chunks</dt>
                  <dd className="text-slate-200">{file.chunksCount}</dd>
                </div>
              )}
              {file.extractedAuthor && (
                <div className="flex justify-between">
                  <dt className="text-slate-400">Auteur</dt>
                  <dd className="text-slate-200 text-right max-w-[60%] truncate">{file.extractedAuthor}</dd>
                </div>
              )}
              {file.extractedDate && (
                <div className="flex justify-between">
                  <dt className="text-slate-400">Date doc.</dt>
                  <dd className="text-slate-200">{new Date(file.extractedDate).toLocaleDateString('fr-FR')}</dd>
                </div>
              )}
              {file.contentHash && (
                <div className="flex justify-between">
                  <dt className="text-slate-400">Hash</dt>
                  <dd className="text-slate-400 font-mono text-xs">{file.contentHash.slice(0, 12)}…</dd>
                </div>
              )}
            </dl>
          </div>

          {/* Dates */}
          <div className="bg-slate-800/50 rounded-lg border border-slate-700 p-4">
            <h3 className="text-sm font-semibold text-slate-200 mb-3">Historique</h3>
            <dl className="space-y-2 text-sm">
              <div>
                <dt className="text-slate-400">Créé le</dt>
                <dd className="text-slate-300 text-xs mt-0.5">{formatDate(file.createdAt)}</dd>
              </div>
              {file.downloadedAt && (
                <div>
                  <dt className="text-slate-400">Téléchargé le</dt>
                  <dd className="text-slate-300 text-xs mt-0.5">{formatDate(file.downloadedAt)}</dd>
                </div>
              )}
              {file.indexedAt && (
                <div>
                  <dt className="text-slate-400">Indexé le</dt>
                  <dd className="text-slate-300 text-xs mt-0.5">{formatDate(file.indexedAt)}</dd>
                </div>
              )}
            </dl>
          </div>

          {/* Source */}
          <div className="bg-slate-800/50 rounded-lg border border-slate-700 p-4">
            <h3 className="text-sm font-semibold text-slate-200 mb-3">Provenance</h3>
            <div className="space-y-3 text-sm">
              {file.sourceName && (
                <div>
                  <p className="text-slate-400 mb-1">Source web</p>
                  <Link
                    href={`/super-admin/web-sources/${file.webSourceId}/files`}
                    className="text-blue-400 hover:text-blue-300 transition-colors flex items-center gap-1"
                  >
                    <Icons.folder className="h-3.5 w-3.5" />
                    {file.sourceName}
                  </Link>
                </div>
              )}
              {file.pageUrl && (
                <div>
                  <p className="text-slate-400 mb-1">Page d&apos;origine</p>
                  <a
                    href={file.pageUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-400 hover:text-blue-300 transition-colors flex items-center gap-1 break-all"
                  >
                    <Icons.externalLink className="h-3.5 w-3.5 flex-shrink-0" />
                    <span className="text-xs">{file.pageTitle || file.pageUrl}</span>
                  </a>
                </div>
              )}
              {file.knowledgeBaseId && (
                <div>
                  <p className="text-slate-400 mb-1">Document KB</p>
                  <Link
                    href={`/super-admin/knowledge-base/${file.knowledgeBaseId}`}
                    className="text-emerald-400 hover:text-emerald-300 transition-colors flex items-center gap-1"
                  >
                    <Icons.database className="h-3.5 w-3.5" />
                    <span className="text-xs">{file.kbTitle || 'Voir dans la KB'}</span>
                  </Link>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Dialog suppression */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent className="bg-slate-800 border-slate-700">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-slate-100">Supprimer ce fichier ?</AlertDialogTitle>
            <AlertDialogDescription className="text-slate-400">
              Le fichier <strong className="text-slate-200">{file.filename}</strong> sera supprimé
              du stockage ainsi que ses chunks KB. Cette action est irréversible.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-slate-700 text-slate-200 border-slate-600 hover:bg-slate-600">
              Annuler
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleteLoading}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {deleteLoading ? (
                <Icons.loader className="h-4 w-4 mr-2 animate-spin" />
              ) : null}
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
