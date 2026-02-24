'use client'

import { useState, useEffect } from 'react'
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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import { Textarea } from '@/components/ui/textarea'
import { toast } from 'sonner'
import { Loader2, ThumbsUp, ThumbsDown, ExternalLink, ChevronLeft, ChevronRight, Check } from 'lucide-react'
import { LEGAL_CATEGORY_TRANSLATIONS, type LegalCategory } from '@/lib/categories/legal-categories'
import { LEGAL_DOMAIN_TRANSLATIONS, DOCUMENT_NATURE_TRANSLATIONS, type LegalDomain, type DocumentNature } from '@/lib/web-scraper/types'

interface ReviewModalProps {
  pageId: string
  isOpen: boolean
  onClose: () => void
  onComplete: () => void
  // Navigation props (optionnels)
  items?: { web_page_id: string }[]
  currentIndex?: number
  onNavigate?: (index: number) => void
}

// Catégories depuis le système centralisé (bilingue AR — FR)
const CATEGORIES = (Object.keys(LEGAL_CATEGORY_TRANSLATIONS) as LegalCategory[]).map(code => ({
  value: code,
  label: `${LEGAL_CATEGORY_TRANSLATIONS[code].ar} (${LEGAL_CATEGORY_TRANSLATIONS[code].fr})`,
}))

// Domaines depuis le système centralisé (bilingue AR — FR)
const DOMAINS = (Object.keys(LEGAL_DOMAIN_TRANSLATIONS) as LegalDomain[]).map(code => ({
  value: code,
  label: `${LEGAL_DOMAIN_TRANSLATIONS[code].ar} (${LEGAL_DOMAIN_TRANSLATIONS[code].fr})`,
}))

// Types de documents depuis le système centralisé (bilingue AR — FR)
const DOCUMENT_TYPES = (Object.keys(DOCUMENT_NATURE_TRANSLATIONS) as DocumentNature[]).map(code => ({
  value: code,
  label: `${DOCUMENT_NATURE_TRANSLATIONS[code].ar} (${DOCUMENT_NATURE_TRANSLATIONS[code].fr})`,
}))

const PRIORITY_COLORS: Record<string, string> = {
  urgent: 'bg-red-100 text-red-800',
  high: 'bg-orange-100 text-orange-800',
  medium: 'bg-yellow-100 text-yellow-800',
  low: 'bg-green-100 text-green-800',
}

export function ReviewModal({
  pageId,
  isOpen,
  onClose,
  onComplete,
  items,
  currentIndex = 0,
  onNavigate,
}: ReviewModalProps) {
  const queryClient = useQueryClient()

  // Index local pour la navigation
  const [localIndex, setLocalIndex] = useState(currentIndex)

  // Dériver le pageId actif
  const activePageId = items && items.length > 0 && localIndex < items.length
    ? items[localIndex].web_page_id
    : pageId

  const [correctedCategory, setCorrectedCategory] = useState<string>('')
  const [correctedDomain, setCorrectedDomain] = useState<string>('')
  const [correctedDocumentType, setCorrectedDocumentType] = useState<string>('')
  const [feedbackUseful, setFeedbackUseful] = useState<boolean | null>(null)
  const [feedbackNotes, setFeedbackNotes] = useState<string>('')

  // Sync localIndex quand le parent change currentIndex
  useEffect(() => {
    setLocalIndex(currentIndex)
  }, [currentIndex])

  // Reset form lors de la navigation
  useEffect(() => {
    setCorrectedCategory('')
    setCorrectedDomain('')
    setCorrectedDocumentType('')
    setFeedbackUseful(null)
    setFeedbackNotes('')
  }, [localIndex])

  const { data, isLoading } = useQuery({
    queryKey: ['page-classification', activePageId],
    queryFn: async () => {
      const response = await fetch(`/api/admin/web-pages/${activePageId}/classification`)
      if (!response.ok) throw new Error('Failed to fetch classification')
      return response.json()
    },
    enabled: isOpen && !!activePageId,
  })

  useEffect(() => {
    if (data?.classification) {
      setCorrectedCategory(data.classification.primaryCategory || '')
      setCorrectedDomain(data.classification.domain || '')
      setCorrectedDocumentType(data.classification.documentNature || '')
    }
  }, [data])

  const saveMutation = useMutation({
    mutationFn: async (correctionData: any) => {
      const response = await fetch('/api/super-admin/classification/corrections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(correctionData),
      })
      if (!response.ok) throw new Error('Failed to save correction')
      return response.json()
    },
    onSuccess: (result: { hasGeneratedRule: boolean }) => {
      toast.success(result.hasGeneratedRule
          ? 'Correction enregistrée — Une règle de classification a été générée automatiquement !'
          : 'Correction enregistrée — La correction a été enregistrée avec succès')
      queryClient.invalidateQueries({ queryKey: ['classification-queue'] })
      navigateOrClose()
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })

  const quickValidateMutation = useMutation({
    mutationFn: async (pid: string) => {
      const response = await fetch('/api/super-admin/classification/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pageId: pid, action: 'approve' }),
      })
      if (!response.ok) throw new Error('Failed to validate')
      return response.json()
    },
    onSuccess: () => {
      toast.success('Page validée telle quelle')
      queryClient.invalidateQueries({ queryKey: ['classification-queue'] })
      navigateOrClose()
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })

  /** Passe à l'item suivant ou ferme le modal si c'est le dernier */
  const navigateOrClose = () => {
    if (items && localIndex < items.length - 1) {
      const nextIndex = localIndex + 1
      setLocalIndex(nextIndex)
      onNavigate?.(nextIndex)
    } else {
      onComplete()
      onClose()
    }
  }

  const handleSave = () => {
    if (!correctedCategory) {
      toast.error('Champ requis — Veuillez sélectionner une catégorie')
      return
    }

    saveMutation.mutate({
      pageId: activePageId,
      correctedCategory,
      correctedDomain,
      correctedDocumentType,
      feedback: feedbackUseful !== null ? {
        isUseful: feedbackUseful,
        notes: feedbackNotes || undefined,
      } : undefined,
    })
  }

  const handleQuickValidate = () => {
    if (quickValidateMutation.isPending) return
    quickValidateMutation.mutate(activePageId)
  }

  const handleNavigate = (direction: 'prev' | 'next') => {
    if (!items) return
    const newIndex = direction === 'next'
      ? Math.min(localIndex + 1, items.length - 1)
      : Math.max(localIndex - 1, 0)
    setLocalIndex(newIndex)
    onNavigate?.(newIndex)
  }

  // Raccourcis clavier
  useEffect(() => {
    if (!isOpen) return

    const handleKey = (e: KeyboardEvent) => {
      // Ne pas déclencher lors de la saisie dans un champ
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        (e.target instanceof HTMLElement && e.target.getAttribute('role') === 'combobox')
      ) return

      const isPending = saveMutation.isPending || quickValidateMutation.isPending

      switch (e.key) {
        case 'ArrowRight':
        case 'n':
          if (items && localIndex < items.length - 1) {
            e.preventDefault()
            handleNavigate('next')
          }
          break
        case 'ArrowLeft':
        case 'p':
          if (items && localIndex > 0) {
            e.preventDefault()
            handleNavigate('prev')
          }
          break
        case 'v':
          if (!isPending) {
            e.preventDefault()
            handleQuickValidate()
          }
          break
        case 'Enter':
          if (correctedCategory && !isPending) {
            e.preventDefault()
            handleSave()
          }
          break
      }
    }

    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, localIndex, items, correctedCategory, saveMutation.isPending, quickValidateMutation.isPending])

  const hasNavigation = items && items.length > 1
  const isPending = saveMutation.isPending || quickValidateMutation.isPending

  if (!isOpen) return null

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <div>
              <DialogTitle>Révision de Classification</DialogTitle>
              <DialogDescription>
                Corrigez la classification automatique si nécessaire
                {hasNavigation && (
                  <span className="ml-2 text-xs text-muted-foreground">
                    ({localIndex + 1} / {items.length})
                  </span>
                )}
              </DialogDescription>
            </div>
            {hasNavigation && (
              <div className="flex items-center gap-1 mr-8">
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => handleNavigate('prev')}
                  disabled={localIndex === 0 || isPending}
                  title="Précédent (← ou p)"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => handleNavigate('next')}
                  disabled={localIndex === items.length - 1 || isPending}
                  title="Suivant (→ ou n)"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>
        </DialogHeader>

        {isLoading && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        )}

        {data && (
          <div className="space-y-6">
            {/* Page Info */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Page</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex items-start gap-2">
                  <span className="text-sm font-medium">URL:</span>
                  <a
                    href={data.page.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 text-sm text-blue-600 hover:underline flex items-center gap-1"
                  >
                    {data.page.url}
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
                {data.page.title && (
                  <div className="flex items-start gap-2">
                    <span className="text-sm font-medium">Titre:</span>
                    <span className="flex-1 text-sm">{data.page.title}</span>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Current Classification */}
            {data.classification && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center justify-between">
                    <span>Classification Actuelle</span>
                    <div className="flex gap-2">
                      {data.classification.reviewPriority && (
                        <Badge className={PRIORITY_COLORS[data.classification.reviewPriority]}>
                          {data.classification.reviewPriority}
                        </Badge>
                      )}
                      <Badge variant="outline">
                        {Math.round(data.classification.confidenceScore * 100)}% confiance
                      </Badge>
                    </div>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-3 gap-4 text-sm">
                    <div>
                      <span className="font-medium">الفئة / Catégorie:</span>
                      <div className="mt-1">
                        {data.classification.primaryCategory && LEGAL_CATEGORY_TRANSLATIONS[data.classification.primaryCategory as LegalCategory]
                          ? `${LEGAL_CATEGORY_TRANSLATIONS[data.classification.primaryCategory as LegalCategory].ar} (${LEGAL_CATEGORY_TRANSLATIONS[data.classification.primaryCategory as LegalCategory].fr})`
                          : data.classification.primaryCategory}
                      </div>
                    </div>
                    <div>
                      <span className="font-medium">المجال / Domaine:</span>
                      <div className="mt-1">
                        {data.classification.domain && LEGAL_DOMAIN_TRANSLATIONS[data.classification.domain as LegalDomain]
                          ? `${LEGAL_DOMAIN_TRANSLATIONS[data.classification.domain as LegalDomain].ar} (${LEGAL_DOMAIN_TRANSLATIONS[data.classification.domain as LegalDomain].fr})`
                          : data.classification.domain || 'غير محدد (Non spécifié)'}
                      </div>
                    </div>
                    <div>
                      <span className="font-medium">النوع / Type:</span>
                      <div className="mt-1">
                        {data.classification.documentNature && DOCUMENT_NATURE_TRANSLATIONS[data.classification.documentNature as DocumentNature]
                          ? `${DOCUMENT_NATURE_TRANSLATIONS[data.classification.documentNature as DocumentNature].ar} (${DOCUMENT_NATURE_TRANSLATIONS[data.classification.documentNature as DocumentNature].fr})`
                          : data.classification.documentNature || 'غير محدد (Non spécifié)'}
                      </div>
                    </div>
                  </div>

                  {data.classification.validationReason && (
                    <div className="rounded-lg bg-muted p-3 text-sm">
                      <span className="font-medium">Raison:</span>
                      <p className="mt-1 text-muted-foreground">{data.classification.validationReason}</p>
                    </div>
                  )}

                  {/* Signals Accordion */}
                  {data.classification.signalsUsed?.length > 0 && (
                    <Accordion type="single" collapsible className="border-t pt-3">
                      <AccordionItem value="signals" className="border-0">
                        <AccordionTrigger className="text-sm hover:no-underline">
                          Signaux utilisés ({data.classification.signalsUsed.length})
                        </AccordionTrigger>
                        <AccordionContent>
                          <div className="space-y-2">
                            {data.classification.signalsUsed.map((signal: any, index: number) => (
                              <div key={index} className="rounded-lg bg-muted p-3 text-sm">
                                <div className="flex justify-between items-start mb-1">
                                  <Badge variant="outline">{signal.source}</Badge>
                                  <span className="text-xs text-muted-foreground">
                                    {Math.round(signal.confidence * 100)}%
                                  </span>
                                </div>
                                <div className="mt-2">
                                  <span className="font-medium">{signal.category}</span>
                                  {signal.domain && <span className="text-muted-foreground"> / {signal.domain}</span>}
                                </div>
                              </div>
                            ))}
                          </div>
                        </AccordionContent>
                      </AccordionItem>
                    </Accordion>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Correction Form */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Correction</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="category">Catégorie *</Label>
                    <Select value={correctedCategory} onValueChange={setCorrectedCategory}>
                      <SelectTrigger id="category">
                        <SelectValue placeholder="Sélectionner" />
                      </SelectTrigger>
                      <SelectContent>
                        {CATEGORIES.map((cat) => (
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
                        <SelectValue placeholder="Sélectionner" />
                      </SelectTrigger>
                      <SelectContent>
                        {DOMAINS.map((dom) => (
                          <SelectItem key={dom.value} value={dom.value}>
                            {dom.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="documentType">Type</Label>
                    <Select value={correctedDocumentType} onValueChange={setCorrectedDocumentType}>
                      <SelectTrigger id="documentType">
                        <SelectValue placeholder="Sélectionner" />
                      </SelectTrigger>
                      <SelectContent>
                        {DOCUMENT_TYPES.map((type) => (
                          <SelectItem key={type.value} value={type.value}>
                            {type.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Feedback */}
                <div className="space-y-3 border-t pt-4">
                  <Label>Classification utile ?</Label>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant={feedbackUseful === true ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setFeedbackUseful(true)}
                    >
                      <ThumbsUp className="h-4 w-4 mr-2" />
                      Utile
                    </Button>
                    <Button
                      type="button"
                      variant={feedbackUseful === false ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setFeedbackUseful(false)}
                    >
                      <ThumbsDown className="h-4 w-4 mr-2" />
                      Pas utile
                    </Button>
                  </div>

                  {feedbackUseful === false && (
                    <div className="space-y-2">
                      <Label htmlFor="notes">Notes</Label>
                      <Textarea
                        id="notes"
                        placeholder="Qu'est-ce qui n'a pas fonctionné ?"
                        value={feedbackNotes}
                        onChange={(e) => setFeedbackNotes(e.target.value)}
                        rows={2}
                      />
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={isPending}>
            Annuler
          </Button>
          <Button
            variant="outline"
            onClick={handleQuickValidate}
            disabled={isPending || !data}
            className="text-green-700 border-green-300 hover:bg-green-50"
            title="Valider tel quel sans correction (v)"
          >
            {quickValidateMutation.isPending
              ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              : <Check className="mr-2 h-4 w-4" />
            }
            Valider tel quel
          </Button>
          <Button onClick={handleSave} disabled={isPending || !data}>
            {saveMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Enregistrer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
