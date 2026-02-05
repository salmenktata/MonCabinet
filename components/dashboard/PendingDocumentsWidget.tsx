/**
 * Widget Documents en Attente WhatsApp
 * Affiche les documents reçus par WhatsApp en attente de rattachement manuel
 * (quand client a plusieurs dossiers actifs ou 0 dossier)
 */

'use client'

import { useEffect, useState, useTransition } from 'react'
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
import { Clock, Check, X, MessageSquare, AlertCircle } from 'lucide-react'
import {
  getPendingDocumentsAction,
  attachPendingDocumentAction,
  rejectPendingDocumentAction,
} from '@/app/actions/messaging'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'

interface PendingDocument {
  id: string
  file_name: string
  file_type: string
  file_size: number
  sender_phone: string
  sender_name?: string
  received_at: string
  clients: {
    id: string
    type: string
    nom: string
    prenom: string
    denomination: string
    telephone: string
  } | null
}

interface Dossier {
  id: string
  numero: string
  objet: string
  client_id: string
}

interface PendingDocumentsWidgetProps {
  dossiers: Dossier[]
}

export default function PendingDocumentsWidget({ dossiers }: PendingDocumentsWidgetProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [documents, setDocuments] = useState<PendingDocument[]>([])
  const [selectedDossiers, setSelectedDossiers] = useState<{ [key: string]: string }>({})
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false)
  const [documentToReject, setDocumentToReject] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  // Charger documents en attente
  useEffect(() => {
    loadDocuments()
  }, [])

  const loadDocuments = async () => {
    setLoading(true)
    const result = await getPendingDocumentsAction()

    if (result.error) {
      toast.error(result.error)
      setLoading(false)
      return
    }

    setDocuments(result.data || [])
    setLoading(false)
  }

  // Rattacher un document à un dossier
  const handleAttach = async (documentId: string) => {
    const dossierId = selectedDossiers[documentId]

    if (!dossierId) {
      toast.error('Veuillez sélectionner un dossier')
      return
    }

    startTransition(async () => {
      const result = await attachPendingDocumentAction(documentId, dossierId)

      if (result.error) {
        toast.error(result.error)
        return
      }

      toast.success(result.message || 'Document rattaché avec succès')

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
  }

  // Rejeter un document
  const handleReject = async () => {
    if (!documentToReject) return

    startTransition(async () => {
      const result = await rejectPendingDocumentAction(documentToReject)

      if (result.error) {
        toast.error(result.error)
        return
      }

      toast.success('Document rejeté')

      // Retirer document de la liste
      setDocuments((prev) => prev.filter((d) => d.id !== documentToReject))

      setRejectDialogOpen(false)
      setDocumentToReject(null)
      router.refresh()
    })
  }

  // Formater taille fichier
  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return bytes + ' B'
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
  }

  // Formater date
  const formatDate = (dateString: string): string => {
    return new Date(dateString).toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  // Obtenir nom client formaté
  const getClientName = (doc: PendingDocument): string => {
    if (!doc.clients) {
      return doc.sender_name || doc.sender_phone
    }

    if (doc.clients.type === 'PERSONNE_PHYSIQUE') {
      return `${doc.clients.prenom} ${doc.clients.nom}`
    }

    return doc.clients.denomination
  }

  // Si aucun document en attente, ne pas afficher le widget
  if (!loading && documents.length === 0) {
    return null
  }

  return (
    <>
      <Card className="border-blue-200 bg-blue-50/50">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="rounded-lg bg-blue-100 p-2">
                <Clock className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <CardTitle className="text-lg">Documents WhatsApp en Attente</CardTitle>
                <CardDescription>
                  Ces documents ont été reçus par WhatsApp et nécessitent un rattachement manuel
                </CardDescription>
              </div>
            </div>
            <Badge variant="outline" className="bg-blue-100 text-blue-700">
              {documents.length} {documents.length > 1 ? 'documents' : 'document'}
            </Badge>
          </div>
        </CardHeader>

        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
          ) : (
            <div className="space-y-4">
              {documents.map((doc) => {
                // Filtrer dossiers du client (si client identifié)
                const availableDossiers = doc.clients
                  ? dossiers.filter((d) => d.client_id === doc.clients!.id)
                  : dossiers

                return (
                  <div
                    key={doc.id}
                    className="flex items-start gap-4 rounded-lg border bg-white p-4"
                  >
                    {/* Icône WhatsApp */}
                    <div className="flex-shrink-0 rounded-lg bg-green-100 p-2">
                      <MessageSquare className="h-5 w-5 text-green-600" />
                    </div>

                    {/* Informations document */}
                    <div className="flex-1 space-y-2">
                      <div>
                        <h4 className="font-medium">{doc.file_name}</h4>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <span>De : {getClientName(doc)}</span>
                          <span>•</span>
                          <span>{formatFileSize(doc.file_size)}</span>
                          <span>•</span>
                          <span>{formatDate(doc.received_at)}</span>
                        </div>
                        {doc.clients && (
                          <div className="mt-1">
                            <Badge variant="outline" className="text-xs">
                              Client : {getClientName(doc)}
                            </Badge>
                          </div>
                        )}
                      </div>

                      {/* Sélection dossier */}
                      <div className="flex items-center gap-2">
                        {availableDossiers.length > 0 ? (
                          <>
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
                                {availableDossiers.map((dossier) => (
                                  <SelectItem key={dossier.id} value={dossier.id}>
                                    Dossier {dossier.numero}
                                    {dossier.objet && ` - ${dossier.objet}`}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>

                            <Button
                              size="sm"
                              onClick={() => handleAttach(doc.id)}
                              disabled={isPending || !selectedDossiers[doc.id]}
                              className="flex-shrink-0"
                            >
                              <Check className="mr-1 h-4 w-4" />
                              Rattacher
                            </Button>
                          </>
                        ) : (
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <AlertCircle className="h-4 w-4" />
                            <span>
                              Aucun dossier disponible
                              {doc.clients && ' pour ce client'}. Créez un dossier d&apos;abord.
                            </span>
                          </div>
                        )}

                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setDocumentToReject(doc.id)
                            setRejectDialogOpen(true)
                          }}
                          disabled={isPending}
                          className="flex-shrink-0"
                        >
                          <X className="mr-1 h-4 w-4" />
                          Rejeter
                        </Button>
                      </div>
                    </div>
                  </div>
                )
              })}

              {/* Message info */}
              <div className="flex items-start gap-2 rounded-lg bg-blue-50 p-3 text-sm text-blue-800">
                <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium">Pourquoi ces documents nécessitent un rattachement manuel ?</p>
                  <p className="mt-1 text-xs">
                    Ces documents ont été reçus par WhatsApp mais le client a plusieurs dossiers actifs
                    ou aucun dossier actif. Veuillez sélectionner le dossier approprié pour chaque document.
                  </p>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dialog confirmation rejeter */}
      <AlertDialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Rejeter ce document ?</AlertDialogTitle>
            <AlertDialogDescription>
              Le document sera masqué de cette liste et marqué comme rejeté. Cette action est irréversible.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={handleReject} disabled={isPending}>
              {isPending ? 'En cours...' : 'Rejeter'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
