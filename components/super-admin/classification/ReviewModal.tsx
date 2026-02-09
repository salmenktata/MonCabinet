'use client'

/**
 * Composant: ReviewModal
 *
 * Modal de révision et correction de classification d'une page
 */

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Loader2, ThumbsUp, ThumbsDown, ExternalLink, Sparkles } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'

// =============================================================================
// TYPES
// =============================================================================

interface ReviewModalProps {
  pageId: string
  onClose: () => void
  onComplete: () => void
}

interface PageClassification {
  url: string
  title: string | null
  currentCategory: string
  currentDomain: string
  currentDocumentType: string | null
  confidenceScore: number
  signals: Array<{
    source: string
    category: string
    confidence: number
  }>
}

interface CorrectionRequest {
  pageId: string
  correctedCategory: string
  correctedDomain?: string | null
  correctedDocumentType?: string | null
  correctedBy: string
  feedback?: {
    isUseful: boolean
    notes?: string
  }
}

// Taxonomie simplifiée (à remplacer par fetch API /api/admin/taxonomy)
const CATEGORIES = [
  { value: 'jurisprudence', label: 'Jurisprudence' },
  { value: 'legislation', label: 'Législation' },
  { value: 'doctrine', label: 'Doctrine' },
  { value: 'jort', label: 'JORT' },
  { value: 'modeles', label: 'Modèles & Formulaires' },
  { value: 'procedures', label: 'Procédures' },
]

const DOMAINS = [
  { value: 'civil', label: 'Civil' },
  { value: 'penal', label: 'Pénal' },
  { value: 'commercial', label: 'Commercial' },
  { value: 'administratif', label: 'Administratif' },
  { value: 'social', label: 'Social' },
  { value: 'fiscal', label: 'Fiscal' },
  { value: 'immobilier', label: 'Immobilier' },
  { value: 'famille', label: 'Famille' },
]

const DOCUMENT_TYPES = [
  { value: 'arret', label: 'Arrêt' },
  { value: 'jugement', label: 'Jugement' },
  { value: 'loi', label: 'Loi' },
  { value: 'decret', label: 'Décret' },
  { value: 'arrete', label: 'Arrêté' },
  { value: 'circulaire', label: 'Circulaire' },
  { value: 'article', label: 'Article' },
  { value: 'formulaire', label: 'Formulaire' },
]

// =============================================================================
// COMPONENT
// =============================================================================

export function ReviewModal({ pageId, onClose, onComplete }: ReviewModalProps) {
  const { toast } = useToast()
  const queryClient = useQueryClient()

  const [correctedCategory, setCorrectedCategory] = useState<string>('')
  const [correctedDomain, setCorrectedDomain] = useState<string>('')
  const [correctedDocumentType, setCorrectedDocumentType] = useState<string>('')
  const [feedback, setFeedback] = useState<boolean | null>(null)

  // Fetch page classification data
  const { data: pageData, isLoading } = useQuery<PageClassification>({
    queryKey: ['page-classification', pageId],
    queryFn: async () => {
      // TODO: Créer API GET /api/admin/web-pages/[id]/classification
      // Pour l'instant, mock data
      return {
        url: 'https://example.com/page',
        title: 'Page exemple',
        currentCategory: 'jurisprudence',
        currentDomain: 'civil',
        currentDocumentType: 'arret',
        confidenceScore: 0.65,
        signals: [
          { source: 'structure', category: 'jurisprudence', confidence: 0.7 },
          { source: 'keywords', category: 'jurisprudence', confidence: 0.6 },
          { source: 'llm', category: 'legislation', confidence: 0.5 },
        ],
      }
    },
  })

  // Mutation save correction
  const saveMutation = useMutation({
    mutationFn: async (data: CorrectionRequest) => {
      const response = await fetch('/api/super-admin/classification/corrections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })

      if (!response.ok) {
        throw new Error('Erreur lors de la sauvegarde')
      }

      return response.json()
    },
    onSuccess: (result) => {
      toast({
        title: 'Correction enregistrée',
        description: result.hasGeneratedRule
          ? '✨ Une règle de classification a été générée automatiquement !'
          : 'La correction a été enregistrée avec succès',
      })
      queryClient.invalidateQueries({ queryKey: ['classification-queue'] })
      queryClient.invalidateQueries({ queryKey: ['classification-corrections'] })
      onComplete()
    },
    onError: (error) => {
      toast({
        title: 'Erreur',
        description: error instanceof Error ? error.message : 'Erreur inconnue',
        variant: 'destructive',
      })
    },
  })

  const handleSave = () => {
    if (!correctedCategory) {
      toast({
        title: 'Champ requis',
        description: 'Veuillez sélectionner une catégorie',
        variant: 'destructive',
      })
      return
    }

    const correctionData: CorrectionRequest = {
      pageId,
      correctedCategory,
      correctedDomain: correctedDomain || null,
      correctedDocumentType: correctedDocumentType || null,
      correctedBy: 'admin@example.com', // TODO: Récupérer depuis session utilisateur
      feedback: feedback !== null ? { isUseful: feedback } : undefined,
    }

    saveMutation.mutate(correctionData)
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Réviser Classification</DialogTitle>
          <DialogDescription>
            Corrigez la classification automatique de cette page
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
        ) : pageData ? (
          <div className="space-y-6">
            {/* Page Info */}
            <div className="space-y-2">
              <div className="font-medium">{pageData.title}</div>
              <a
                href={pageData.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-blue-600 hover:underline flex items-center gap-1"
              >
                <ExternalLink className="h-3 w-3" />
                {pageData.url}
              </a>
            </div>

            {/* Current Classification */}
            <div className="bg-gray-50 p-4 rounded-lg space-y-3 border">
              <div className="font-medium text-sm">Classification Actuelle</div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <div className="text-xs text-muted-foreground">Catégorie</div>
                  <div className="font-medium">{pageData.currentCategory}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Domaine</div>
                  <div className="font-medium">{pageData.currentDomain}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Confiance</div>
                  <Badge
                    variant="outline"
                    className={
                      pageData.confidenceScore >= 0.7
                        ? 'bg-green-100 text-green-800'
                        : pageData.confidenceScore >= 0.5
                        ? 'bg-yellow-100 text-yellow-800'
                        : 'bg-red-100 text-red-800'
                    }
                  >
                    {(pageData.confidenceScore * 100).toFixed(0)}%
                  </Badge>
                </div>
              </div>
            </div>

            {/* Signals Used (Accordion) */}
            <Accordion type="single" collapsible>
              <AccordionItem value="signals">
                <AccordionTrigger className="text-sm">
                  Signaux Utilisés ({pageData.signals.length})
                </AccordionTrigger>
                <AccordionContent>
                  <div className="space-y-2">
                    {pageData.signals.map((signal, i) => (
                      <div key={i} className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline">{signal.source}</Badge>
                          <span>{signal.category}</span>
                        </div>
                        <span className="text-muted-foreground">
                          {(signal.confidence * 100).toFixed(0)}%
                        </span>
                      </div>
                    ))}
                  </div>
                </AccordionContent>
              </AccordionItem>
            </Accordion>

            {/* Correction Form */}
            <div className="space-y-4 border-t pt-4">
              <div className="font-medium text-sm">Correction</div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="category">
                    Catégorie <span className="text-red-500">*</span>
                  </Label>
                  <Select value={correctedCategory} onValueChange={setCorrectedCategory}>
                    <SelectTrigger id="category">
                      <SelectValue placeholder="Sélectionner..." />
                    </SelectTrigger>
                    <SelectContent>
                      {CATEGORIES.map(cat => (
                        <SelectItem key={cat.value} value={cat.value}>
                          {cat.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="domain">Domaine</Label>
                  <Select value={correctedDomain} onValueChange={setCorrectedDomain}>
                    <SelectTrigger id="domain">
                      <SelectValue placeholder="Sélectionner..." />
                    </SelectTrigger>
                    <SelectContent>
                      {DOMAINS.map(dom => (
                        <SelectItem key={dom.value} value={dom.value}>
                          {dom.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="docType">Type Document</Label>
                  <Select value={correctedDocumentType} onValueChange={setCorrectedDocumentType}>
                    <SelectTrigger id="docType">
                      <SelectValue placeholder="Sélectionner..." />
                    </SelectTrigger>
                    <SelectContent>
                      {DOCUMENT_TYPES.map(type => (
                        <SelectItem key={type.value} value={type.value}>
                          {type.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            {/* Feedback */}
            <div className="space-y-2 border-t pt-4">
              <Label>Cette classification était-elle utile ?</Label>
              <div className="flex gap-2">
                <Button
                  variant={feedback === true ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setFeedback(true)}
                  className="gap-2"
                >
                  <ThumbsUp className="h-4 w-4" />
                  Utile
                </Button>
                <Button
                  variant={feedback === false ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setFeedback(false)}
                  className="gap-2"
                >
                  <ThumbsDown className="h-4 w-4" />
                  Pas utile
                </Button>
              </div>
            </div>
          </div>
        ) : null}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saveMutation.isPending}>
            Annuler
          </Button>
          <Button
            onClick={handleSave}
            disabled={saveMutation.isPending || !correctedCategory}
            className="gap-2"
          >
            {saveMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Enregistrement...
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" />
                Sauvegarder
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
