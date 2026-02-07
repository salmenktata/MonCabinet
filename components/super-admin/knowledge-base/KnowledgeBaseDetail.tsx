'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { formatDistanceToNow, format } from 'date-fns'
import { fr } from 'date-fns/locale'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
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
import { Icons } from '@/lib/icons'
import { useToast } from '@/lib/hooks/use-toast'
import {
  deleteKnowledgeDocumentAction,
  indexKnowledgeDocumentAction,
} from '@/app/actions/knowledge-base'
import { CategoryBadge } from './CategorySelector'
import { TagsList } from './TagsInput'
import { MetadataDisplay } from './MetadataForm'
import { VersionHistory, VersionBadge } from './VersionHistory'
import { RelatedDocuments } from './RelatedDocuments'
import type { KnowledgeCategory } from '@/lib/knowledge-base/categories'

interface KnowledgeDocument {
  id: string
  category: string
  subcategory: string | null
  language: 'ar' | 'fr'
  title: string
  description: string | null
  metadata: Record<string, unknown>
  tags: string[]
  sourceFile: string | null
  fullText: string | null
  isIndexed: boolean
  isActive: boolean
  version: number
  chunkCount?: number
  uploadedBy: string | null
  uploadedByEmail?: string
  createdAt: Date | string
  updatedAt: Date | string
}

interface Version {
  id: string
  version: number
  title: string
  changeType: 'create' | 'update' | 'content_update' | 'file_replace' | 'restore'
  changeReason: string | null
  changedBy: string | null
  changedByEmail?: string
  changedAt: Date | string
}

interface KnowledgeBaseDetailProps {
  document: KnowledgeDocument
  versions: Version[]
}

export function KnowledgeBaseDetail({ document, versions }: KnowledgeBaseDetailProps) {
  const router = useRouter()
  const { toast } = useToast()
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [indexing, setIndexing] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const handleIndex = async () => {
    setIndexing(true)
    try {
      const result = await indexKnowledgeDocumentAction(document.id)
      if (result.error) {
        toast({
          title: 'Erreur',
          description: result.error,
          variant: 'destructive',
        })
      } else {
        toast({
          title: 'Document indexé',
          description: `${result.chunksCreated} chunks créés.`,
        })
        router.refresh()
      }
    } catch {
      toast({
        title: 'Erreur',
        description: 'Erreur lors de l\'indexation',
        variant: 'destructive',
      })
    } finally {
      setIndexing(false)
    }
  }

  const handleDelete = async () => {
    setDeleting(true)
    try {
      const result = await deleteKnowledgeDocumentAction(document.id)
      if (result.error) {
        toast({
          title: 'Erreur',
          description: result.error,
          variant: 'destructive',
        })
      } else {
        toast({
          title: 'Document supprimé',
          description: 'Le document a été supprimé.',
        })
        router.push('/super-admin/knowledge-base')
      }
    } catch {
      toast({
        title: 'Erreur',
        description: 'Erreur lors de la suppression',
        variant: 'destructive',
      })
    } finally {
      setDeleting(false)
      setDeleteDialogOpen(false)
    }
  }

  const createdAt = typeof document.createdAt === 'string' ? new Date(document.createdAt) : document.createdAt
  const updatedAt = typeof document.updatedAt === 'string' ? new Date(document.updatedAt) : document.updatedAt

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Link
              href="/super-admin/knowledge-base"
              className="text-slate-400 hover:text-white transition"
            >
              <Icons.arrowLeft className="h-5 w-5" />
            </Link>
            <h1 className="text-2xl font-bold text-white">{document.title}</h1>
            <VersionBadge version={document.version} />
          </div>
          <div className="flex items-center gap-3">
            <CategoryBadge
              category={document.category}
              subcategory={document.subcategory}
            />
            <Badge variant={document.language === 'ar' ? 'secondary' : 'outline'}>
              {document.language === 'ar' ? 'العربية' : 'Français'}
            </Badge>
            {document.isIndexed ? (
              <Badge className="bg-green-500/20 text-green-300">
                <Icons.check className="h-3 w-3 mr-1" />
                Indexé ({document.chunkCount || 0} chunks)
              </Badge>
            ) : (
              <Badge className="bg-yellow-500/20 text-yellow-300">
                <Icons.clock className="h-3 w-3 mr-1" />
                Non indexé
              </Badge>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {!document.isIndexed && (
            <Button
              onClick={handleIndex}
              disabled={indexing}
              variant="outline"
              className="border-blue-500 text-blue-400 hover:bg-blue-500/20"
            >
              {indexing ? (
                <Icons.loader className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Icons.zap className="h-4 w-4 mr-2" />
              )}
              Indexer
            </Button>
          )}
          <Link href={`/super-admin/knowledge-base/${document.id}/edit`}>
            <Button variant="outline" className="border-slate-600 text-slate-300">
              <Icons.edit className="h-4 w-4 mr-2" />
              Modifier
            </Button>
          </Link>
          <Button
            variant="destructive"
            onClick={() => setDeleteDialogOpen(true)}
          >
            <Icons.trash className="h-4 w-4 mr-2" />
            Supprimer
          </Button>
        </div>
      </div>

      {/* Main content */}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          {/* Description */}
          {document.description && (
            <Card className="bg-slate-800 border-slate-700">
              <CardHeader className="pb-3">
                <CardTitle className="text-white text-base">Description</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-slate-300">{document.description}</p>
              </CardContent>
            </Card>
          )}

          {/* Tags */}
          {document.tags && document.tags.length > 0 && (
            <Card className="bg-slate-800 border-slate-700">
              <CardHeader className="pb-3">
                <CardTitle className="text-white text-base">Tags</CardTitle>
              </CardHeader>
              <CardContent>
                <TagsList tags={document.tags} size="md" />
              </CardContent>
            </Card>
          )}

          {/* Contenu */}
          <Card className="bg-slate-800 border-slate-700">
            <CardHeader className="pb-3">
              <CardTitle className="text-white text-base flex items-center justify-between">
                <span>Contenu</span>
                {document.fullText && (
                  <span className="text-sm font-normal text-slate-400">
                    {document.fullText.length.toLocaleString()} caractères
                  </span>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="preview">
                <TabsList className="bg-slate-700">
                  <TabsTrigger value="preview">Aperçu</TabsTrigger>
                  <TabsTrigger value="full">Texte complet</TabsTrigger>
                </TabsList>
                <TabsContent value="preview" className="mt-4">
                  <div
                    className="text-slate-300 prose prose-invert prose-sm max-w-none line-clamp-10"
                    dir={document.language === 'ar' ? 'rtl' : 'ltr'}
                  >
                    {document.fullText
                      ? document.fullText.substring(0, 2000) + (document.fullText.length > 2000 ? '...' : '')
                      : 'Aucun contenu'}
                  </div>
                </TabsContent>
                <TabsContent value="full" className="mt-4">
                  <div
                    className="text-slate-300 whitespace-pre-wrap text-sm max-h-[500px] overflow-auto bg-slate-900 p-4 rounded-lg"
                    dir={document.language === 'ar' ? 'rtl' : 'ltr'}
                  >
                    {document.fullText || 'Aucun contenu'}
                  </div>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Informations */}
          <Card className="bg-slate-800 border-slate-700">
            <CardHeader className="pb-3">
              <CardTitle className="text-white text-base">Informations</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-400">Créé</span>
                <span className="text-slate-200" title={format(createdAt, 'PPpp', { locale: fr })}>
                  {formatDistanceToNow(createdAt, { addSuffix: true, locale: fr })}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Modifié</span>
                <span className="text-slate-200" title={format(updatedAt, 'PPpp', { locale: fr })}>
                  {formatDistanceToNow(updatedAt, { addSuffix: true, locale: fr })}
                </span>
              </div>
              {document.uploadedByEmail && (
                <div className="flex justify-between">
                  <span className="text-slate-400">Par</span>
                  <span className="text-slate-200">{document.uploadedByEmail}</span>
                </div>
              )}
              {document.sourceFile && (
                <div className="flex justify-between">
                  <span className="text-slate-400">Fichier</span>
                  <span className="text-slate-200 truncate max-w-[150px]" title={document.sourceFile}>
                    {document.sourceFile.split('/').pop()}
                  </span>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Métadonnées */}
          {Object.keys(document.metadata || {}).length > 0 && (
            <Card className="bg-slate-800 border-slate-700">
              <CardHeader className="pb-3">
                <CardTitle className="text-white text-base">Métadonnées</CardTitle>
              </CardHeader>
              <CardContent>
                <MetadataDisplay
                  category={document.category as KnowledgeCategory}
                  metadata={document.metadata}
                />
              </CardContent>
            </Card>
          )}

          {/* Documents similaires */}
          {document.isIndexed && (
            <RelatedDocuments documentId={document.id} limit={5} threshold={0.6} />
          )}

          {/* Historique des versions */}
          <VersionHistory
            documentId={document.id}
            versions={versions}
            currentVersion={document.version}
            onVersionRestored={() => router.refresh()}
          />
        </div>
      </div>

      {/* Dialog de confirmation de suppression */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent className="bg-slate-800 border-slate-700">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">
              Supprimer ce document ?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-slate-400">
              Cette action est irréversible. Le document &quot;{document.title}&quot; et
              tous ses chunks seront définitivement supprimés.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-slate-700 text-white border-slate-600">
              Annuler
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-red-600 hover:bg-red-700"
            >
              {deleting ? (
                <>
                  <Icons.loader className="h-4 w-4 mr-2 animate-spin" />
                  Suppression...
                </>
              ) : (
                'Supprimer'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
