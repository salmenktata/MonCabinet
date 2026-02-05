'use client'

import { useEffect, useState, useTransition, useCallback, useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
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
import { FileQuestion, Check, X, FolderOpen, AlertCircle } from 'lucide-react'
import {
  getUnclassifiedDocumentsAction,
  classifyDocumentAction,
  ignoreUnclassifiedDocumentAction,
} from '@/app/actions/documents'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'

interface UnclassifiedDocument {
  id: string
  nom_fichier: string
  type_fichier: string
  taille_fichier: number
  external_sharing_link: string
  created_at: string
  source_type: string
  dossiers: {
    id: string
    numero: string
    objet: string
    clients: {
      id: string
      nom: string
      prenom: string
      type_client: string
    }
  } | null
}

interface Dossier {
  id: string
  numero: string
  objet: string
  client_id: string
}

interface UnclassifiedDocumentsWidgetProps {
  dossiers: Dossier[]
}

export default function UnclassifiedDocumentsWidget({
  dossiers,
}: UnclassifiedDocumentsWidgetProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [documents, setDocuments] = useState<UnclassifiedDocument[]>([])
  const [selectedDossiers, setSelectedDossiers] = useState<{ [key: string]: string }>({})
  const [ignoreDialogOpen, setIgnoreDialogOpen] = useState(false)
  const [documentToIgnore, setDocumentToIgnore] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  // Fonctions de formatage mémorisées
  const formatFileSize = useCallback((bytes: number): string => {
    if (bytes < 1024) return bytes + ' B'
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
  }, [])

  const formatDate = useCallback((dateString: string): string => {
    return new Date(dateString).toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }, [])

  // Charger documents non classés
  const loadDocuments = useCallback(async () => {
    setLoading(true)
    const result = await getUnclassifiedDocumentsAction()

    if (result.error) {
      toast.error(result.error)
      setLoading(false)
      return
    }

    setDocuments(result.data || [])
    setLoading(false)
  }, [])

  useEffect(() => {
    loadDocuments()
  }, [loadDocuments])

  // Classer un document
  const handleClassify = useCallback(async (documentId: string) => {
    const dossierId = selectedDossiers[documentId]

    if (!dossierId) {
      toast.error('Veuillez sélectionner un dossier')
      return
    }

    startTransition(async () => {
      const result = await classifyDocumentAction(documentId, dossierId)

      if (result.error) {
        toast.error(result.error)
        return
      }

      toast.success('Document classé avec succès')

      // Retirer document de la liste
      setDocuments((prev) => prev.filter((d) => d.id !== documentId))

      // Nettoyer sélection
      setSelectedDossiers((prev) => {
        const newState = { ...prev }
        delete newState[documentId]
        return newState
      })

      router.refresh()
    })
  }, [selectedDossiers, router])

  // Ignorer un document
  const handleIgnore = useCallback(async () => {
    if (!documentToIgnore) return

    startTransition(async () => {
      const result = await ignoreUnclassifiedDocumentAction(documentToIgnore)

      if (result.error) {
        toast.error(result.error)
        return
      }

      toast.success('Document ignoré')

      // Retirer document de la liste
      setDocuments((prev) => prev.filter((d) => d.id !== documentToIgnore))

      setIgnoreDialogOpen(false)
      setDocumentToIgnore(null)
      router.refresh()
    })
  }, [documentToIgnore, router])

  // Si aucun document non classé, ne pas afficher le widget
  if (!loading && documents.length === 0) {
    return null
  }

  return (
    <>
      <Card className="border-orange-200 bg-orange-50/50">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="rounded-lg bg-orange-100 p-2">
                <FileQuestion className="h-5 w-5 text-orange-600" />
              </div>
              <div>
                <CardTitle className="text-lg">Documents à Classer</CardTitle>
                <CardDescription>
                  Ces documents ont été ajoutés dans Google Drive et nécessitent un rattachement
                </CardDescription>
              </div>
            </div>
            <Badge variant="outline" className="bg-orange-100 text-orange-700">
              {documents.length} {documents.length > 1 ? 'documents' : 'document'}
            </Badge>
          </div>
        </CardHeader>

        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-600"></div>
            </div>
          ) : (
            <div className="space-y-4">
              {documents.map((doc) => (
                <div
                  key={doc.id}
                  className="flex items-start gap-4 rounded-lg border bg-white p-4"
                >
                  {/* Icône fichier */}
                  <div className="flex-shrink-0 rounded-lg bg-muted p-2">
                    <FolderOpen className="h-5 w-5 text-muted-foreground" />
                  </div>

                  {/* Informations document */}
                  <div className="flex-1 space-y-2">
                    <div>
                      <h4 className="font-medium">{doc.nom_fichier}</h4>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span>{formatFileSize(doc.taille_fichier)}</span>
                        <span>•</span>
                        <span>{formatDate(doc.created_at)}</span>
                        <span>•</span>
                        <Badge variant="outline" className="text-xs">
                          {doc.source_type === 'google_drive_sync'
                            ? 'Ajouté manuellement dans Drive'
                            : doc.source_type === 'whatsapp'
                            ? 'Reçu par WhatsApp'
                            : 'Upload manuel'}
                        </Badge>
                      </div>
                    </div>

                    {/* Sélection dossier */}
                    <div className="flex items-center gap-2">
                      <Select
                        value={selectedDossiers[doc.id] || ''}
                        onValueChange={(value) =>
                          setSelectedDossiers((prev) => ({ ...prev, [doc.id]: value }))
                        }
                        disabled={isPending}
                      >
                        <SelectTrigger className="w-full max-w-md">
                          <SelectValue placeholder="Sélectionner un dossier..." />
                        </SelectTrigger>
                        <SelectContent>
                          {dossiers.length === 0 ? (
                            <div className="p-2 text-sm text-muted-foreground">
                              Aucun dossier disponible
                            </div>
                          ) : (
                            dossiers.map((dossier) => (
                              <SelectItem key={dossier.id} value={dossier.id}>
                                Dossier {dossier.numero}
                                {dossier.objet && ` - ${dossier.objet}`}
                              </SelectItem>
                            ))
                          )}
                        </SelectContent>
                      </Select>

                      <Button
                        size="sm"
                        onClick={() => handleClassify(doc.id)}
                        disabled={isPending || !selectedDossiers[doc.id]}
                        className="flex-shrink-0"
                      >
                        <Check className="mr-1 h-4 w-4" />
                        Classer
                      </Button>

                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setDocumentToIgnore(doc.id)
                          setIgnoreDialogOpen(true)
                        }}
                        disabled={isPending}
                        className="flex-shrink-0"
                      >
                        <X className="mr-1 h-4 w-4" />
                        Ignorer
                      </Button>

                      {doc.external_sharing_link && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => window.open(doc.external_sharing_link, '_blank')}
                          className="flex-shrink-0"
                        >
                          Voir dans Drive
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              ))}

              {/* Message info */}
              <div className="flex items-start gap-2 rounded-lg bg-blue-50 p-3 text-sm text-blue-800">
                <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium">Comment ces documents sont-ils arrivés ici ?</p>
                  <p className="mt-1 text-xs">
                    Ces documents ont été ajoutés manuellement dans le dossier "Documents non
                    classés/" de votre Google Drive, ou reçus par WhatsApp sans dossier unique
                    identifié. Veuillez les rattacher à un dossier juridique.
                  </p>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dialog confirmation ignorer */}
      <AlertDialog open={ignoreDialogOpen} onOpenChange={setIgnoreDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Ignorer ce document ?</AlertDialogTitle>
            <AlertDialogDescription>
              Le document sera masqué de cette liste mais restera accessible dans votre Google
              Drive. Vous pourrez toujours le classer plus tard si nécessaire.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={handleIgnore} disabled={isPending}>
              {isPending ? 'En cours...' : 'Ignorer'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
