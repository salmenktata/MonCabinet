/**
 * Modal pour créer un dossier depuis une conversation chat
 * Utilise l'extraction LLM pour pré-remplir les champs
 *
 * @module components/chat
 * @see Sprint 2 - Workflow Chat → Dossier
 */

'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Loader2, AlertCircle, CheckCircle2, FileText, Sparkles } from 'lucide-react'
import { useLoadingOverlay, useToastNotifications } from '@/components/feedback'
import type { ChatMessage } from '@/components/assistant-ia'
import type { ChatDossierData } from '@/lib/ai/chat-to-dossier-extractor'

interface CreateDossierFromChatModalProps {
  /**
   * Ouvrir/fermer la modal
   */
  open: boolean
  onOpenChange: (open: boolean) => void

  /**
   * ID de la conversation
   */
  conversationId: string

  /**
   * Messages de la conversation
   */
  messages: ChatMessage[]

  /**
   * Titre de la conversation (optionnel)
   */
  conversationTitle?: string

  /**
   * Callback quand le dossier est créé (optionnel)
   */
  onDossierCreated?: (dossierId: string) => void
}

/**
 * Modal intelligente de création de dossier depuis chat
 */
export function CreateDossierFromChatModal({
  open,
  onOpenChange,
  conversationId,
  messages,
  conversationTitle,
  onDossierCreated,
}: CreateDossierFromChatModalProps) {
  const t = useTranslations('dossiers')
  const router = useRouter()
  const { execute, isLoading } = useLoadingOverlay()
  const toast = useToastNotifications()

  // État
  const [extractedData, setExtractedData] = useState<ChatDossierData | null>(null)
  const [isExtracting, setIsExtracting] = useState(false)
  const [extractionError, setExtractionError] = useState<string | null>(null)

  // Formulaire éditable
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')

  // Extraire les données quand la modal s'ouvre
  useEffect(() => {
    if (open && !extractedData && !isExtracting) {
      extractData()
    }
  }, [open])

  // Mettre à jour les champs quand les données sont extraites
  useEffect(() => {
    if (extractedData) {
      setTitle(extractedData.titrePropose)
      setDescription(extractedData.description)
    }
  }, [extractedData])

  /**
   * Extraction des données via API
   */
  const extractData = async () => {
    setIsExtracting(true)
    setExtractionError(null)

    try {
      const response = await fetch('/api/chat/extract-dossier', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversationId,
          messages,
        }),
      })

      if (!response.ok) {
        throw new Error('Erreur lors de l\'extraction des données')
      }

      const data: ChatDossierData = await response.json()
      setExtractedData(data)
    } catch (error) {
      console.error('Extraction error:', error)
      setExtractionError(error instanceof Error ? error.message : 'Erreur inconnue')

      // Fallback : utiliser le titre de la conversation
      setTitle(conversationTitle || 'Nouveau dossier')
      setDescription('Dossier créé depuis une conversation')
    } finally {
      setIsExtracting(false)
    }
  }

  /**
   * Créer le dossier
   */
  const handleCreateDossier = async () => {
    if (!title.trim()) {
      toast.warning('Titre requis', 'Veuillez saisir un titre pour le dossier')
      return
    }

    await execute(
      async () => {
        // Rediriger vers l'assistant avec les données pré-remplies
        const params = new URLSearchParams({
          from: 'chat',
          conversationId,
          seed: `${title}\n\n${description}`,
        })

        // Ajouter les faits extraits si disponibles
        if (extractedData?.faitsExtraits && extractedData.faitsExtraits.length > 0) {
          const factsText = extractedData.faitsExtraits
            .map((f) => `- ${f.label}: ${f.valeur}`)
            .join('\n')
          params.set('facts', factsText)
        }

        router.push(`/qadhya-ia/structure?${params.toString()}`)

        // Callback
        onDossierCreated?.('temp-id') // ID temporaire, sera créé dans l'assistant
        onOpenChange(false)

        toast.success('Redirection', 'Ouverture de l\'assistant de structuration...')
      },
      {
        type: 'api-mutation',
        message: 'Préparation du dossier...',
      }
    )
  }

  /**
   * Badge de qualité des données
   */
  const QualityBadge = () => {
    if (!extractedData) return null

    const quality = extractedData.confidence > 0.7 ? 'high' : extractedData.confidence > 0.4 ? 'medium' : 'low'

    const variants = {
      high: { color: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200', label: 'Qualité élevée', icon: CheckCircle2 },
      medium: { color: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200', label: 'Qualité moyenne', icon: AlertCircle },
      low: { color: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200', label: 'Qualité faible', icon: AlertCircle },
    }

    const config = variants[quality]
    const Icon = config.icon

    return (
      <Badge className={config.color} variant="outline">
        <Icon className="mr-1 h-3 w-3" />
        {config.label} ({Math.round(extractedData.confidence * 100)}%)
      </Badge>
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Créer un dossier depuis la conversation
          </DialogTitle>
          <DialogDescription>
            Les informations ont été extraites automatiquement de votre conversation.
            Vous pouvez les modifier avant de continuer.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* État extraction */}
          {isExtracting && (
            <Alert>
              <Loader2 className="h-4 w-4 animate-spin" />
              <AlertDescription>
                Analyse de la conversation en cours...
              </AlertDescription>
            </Alert>
          )}

          {/* Erreur extraction */}
          {extractionError && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                {extractionError}. Vous pouvez quand même créer le dossier manuellement.
              </AlertDescription>
            </Alert>
          )}

          {/* Données extraites */}
          {extractedData && (
            <div className="rounded-lg border bg-muted/50 p-4 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-primary" />
                  <span className="text-sm font-medium">Extraction intelligente</span>
                </div>
                <QualityBadge />
              </div>

              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">Messages analysés:</span>
                  <span className="ml-2 font-medium">{extractedData.messageCount}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Faits extraits:</span>
                  <span className="ml-2 font-medium">{extractedData.faitsExtraits.length}</span>
                </div>
                {extractedData.typeProcedure && (
                  <div className="col-span-2">
                    <span className="text-muted-foreground">Type procédure:</span>
                    <Badge className="ml-2" variant="outline">
                      {extractedData.typeProcedure}
                    </Badge>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Formulaire */}
          <div className="space-y-4">
            {/* Titre */}
            <div className="space-y-2">
              <Label htmlFor="title">
                Titre du dossier <span className="text-destructive">*</span>
              </Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Ex: Divorce - Pension alimentaire"
                disabled={isLoading}
                maxLength={100}
              />
              <p className="text-xs text-muted-foreground">
                {title.length}/100 caractères
              </p>
            </div>

            {/* Description */}
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Description du dossier..."
                rows={4}
                disabled={isLoading}
                maxLength={500}
              />
              <p className="text-xs text-muted-foreground">
                {description.length}/500 caractères
              </p>
            </div>

            {/* Faits extraits (aperçu) */}
            {extractedData && extractedData.faitsExtraits.length > 0 && (
              <div className="space-y-2">
                <Label>Faits extraits ({extractedData.faitsExtraits.length})</Label>
                <div className="rounded-md border bg-muted/30 p-3 max-h-40 overflow-y-auto">
                  <ul className="space-y-1 text-sm">
                    {extractedData.faitsExtraits.slice(0, 5).map((fait, idx) => (
                      <li key={idx} className="flex items-start gap-2">
                        <span className="text-muted-foreground">•</span>
                        <span>
                          <strong>{fait.label}:</strong> {fait.valeur}
                          {fait.confidence < 0.6 && (
                            <Badge className="ml-2 text-xs" variant="outline">
                              À vérifier
                            </Badge>
                          )}
                        </span>
                      </li>
                    ))}
                    {extractedData.faitsExtraits.length > 5 && (
                      <li className="text-muted-foreground">
                        ... et {extractedData.faitsExtraits.length - 5} autre(s)
                      </li>
                    )}
                  </ul>
                </div>
                <p className="text-xs text-muted-foreground">
                  Ces faits seront pré-remplis dans l'assistant de structuration
                </p>
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isLoading}
          >
            Annuler
          </Button>
          <Button
            onClick={handleCreateDossier}
            disabled={isLoading || !title.trim()}
          >
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Préparation...
              </>
            ) : (
              <>
                <Sparkles className="mr-2 h-4 w-4" />
                Structurer avec l'IA
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
