'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Icons } from '@/lib/icons'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useToast } from '@/hooks/use-toast'

interface Suggestion {
  id: string
  type: string
  suggestedCode: string
  suggestedLabelFr: string
  suggestedLabelAr: string | null
  reason: string | null
  occurrenceCount: number
  sampleUrls: string[]
  createdAt: string
}

interface TaxonomyItem {
  id: string
  type: string
  code: string
  labelFr: string
  labelAr: string
}

interface TaxonomySuggestionsProps {
  suggestions: Suggestion[]
  taxonomy: {
    category: TaxonomyItem[]
    domain: TaxonomyItem[]
    document_type: TaxonomyItem[]
    tribunal: TaxonomyItem[]
    chamber: TaxonomyItem[]
  }
}

const TYPE_LABELS: Record<string, string> = {
  category: 'Catégorie',
  domain: 'Domaine',
  document_type: 'Type de document',
  tribunal: 'Tribunal',
  chamber: 'Chambre',
}

export function TaxonomySuggestions({ suggestions, taxonomy }: TaxonomySuggestionsProps) {
  const router = useRouter()
  const { toast } = useToast()
  const [isActionDialogOpen, setIsActionDialogOpen] = useState(false)
  const [selectedSuggestion, setSelectedSuggestion] = useState<Suggestion | null>(null)
  const [action, setAction] = useState<'approve' | 'reject' | 'merge'>('approve')
  const [notes, setNotes] = useState('')
  const [mergeWithCode, setMergeWithCode] = useState('')
  const [parentCode, setParentCode] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  const handleAction = async () => {
    if (!selectedSuggestion) return

    setIsLoading(true)
    try {
      const response = await fetch('/api/super-admin/taxonomy/suggestions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          suggestionId: selectedSuggestion.id,
          action,
          parentCode: action === 'approve' ? parentCode : undefined,
          notes,
          mergeWithCode: action === 'merge' ? mergeWithCode : undefined,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Erreur lors du traitement')
      }

      toast({
        title: 'Succès',
        description: action === 'approve'
          ? 'Suggestion approuvée et élément créé'
          : action === 'reject'
          ? 'Suggestion rejetée'
          : 'Suggestion fusionnée',
      })

      setIsActionDialogOpen(false)
      setSelectedSuggestion(null)
      setNotes('')
      setMergeWithCode('')
      setParentCode('')
      router.refresh()
    } catch (error) {
      toast({
        title: 'Erreur',
        description: error instanceof Error ? error.message : 'Erreur lors du traitement',
        variant: 'destructive',
      })
    } finally {
      setIsLoading(false)
    }
  }

  const openActionDialog = (suggestion: Suggestion, actionType: 'approve' | 'reject' | 'merge') => {
    setSelectedSuggestion(suggestion)
    setAction(actionType)
    setIsActionDialogOpen(true)
  }

  const getAllTaxonomyItems = () => {
    return [
      ...taxonomy.category,
      ...taxonomy.domain,
      ...taxonomy.document_type,
      ...taxonomy.tribunal,
      ...taxonomy.chamber,
    ]
  }

  const getSameTypeItems = (type: string) => {
    switch (type) {
      case 'category': return taxonomy.category
      case 'domain': return taxonomy.domain
      case 'document_type': return taxonomy.document_type
      case 'tribunal': return taxonomy.tribunal
      case 'chamber': return taxonomy.chamber
      default: return []
    }
  }

  return (
    <>
      <div className="space-y-4">
        {suggestions.map((suggestion) => (
          <Card key={suggestion.id} className="bg-slate-800 border-slate-700">
            <CardContent className="pt-6">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <Badge variant="outline" className="text-yellow-500 border-yellow-500">
                      <Icons.sparkles className="h-3 w-3 mr-1" />
                      Suggestion IA
                    </Badge>
                    <Badge variant="secondary">
                      {TYPE_LABELS[suggestion.type] || suggestion.type}
                    </Badge>
                    <Badge variant="outline">
                      {suggestion.occurrenceCount} occurrence(s)
                    </Badge>
                  </div>

                  <div className="mb-3">
                    <div className="flex items-center gap-2 text-lg">
                      <span className="font-medium text-white">{suggestion.suggestedLabelFr}</span>
                      {suggestion.suggestedLabelAr && (
                        <>
                          <span className="text-slate-400">/</span>
                          <span className="text-slate-400" dir="rtl">{suggestion.suggestedLabelAr}</span>
                        </>
                      )}
                    </div>
                    <code className="text-xs text-slate-400 bg-slate-700 px-2 py-0.5 rounded">
                      {suggestion.suggestedCode}
                    </code>
                  </div>

                  {suggestion.reason && (
                    <p className="text-sm text-slate-400 mb-3">
                      <Icons.info className="h-4 w-4 inline mr-1" />
                      {suggestion.reason}
                    </p>
                  )}

                  {suggestion.sampleUrls.length > 0 && (
                    <div className="text-xs text-slate-400">
                      <p className="mb-1">URLs d'exemple:</p>
                      <ul className="list-disc list-inside">
                        {suggestion.sampleUrls.slice(0, 3).map((url, i) => (
                          <li key={i} className="truncate max-w-md">
                            <a href={url} target="_blank" rel="noopener noreferrer" className="hover:text-blue-400">
                              {url}
                            </a>
                          </li>
                        ))}
                        {suggestion.sampleUrls.length > 3 && (
                          <li>+{suggestion.sampleUrls.length - 3} autres</li>
                        )}
                      </ul>
                    </div>
                  )}
                </div>

                <div className="flex flex-col gap-2 ml-4">
                  <Button
                    size="sm"
                    onClick={() => openActionDialog(suggestion, 'approve')}
                    className="bg-green-600 hover:bg-green-700"
                  >
                    <Icons.check className="h-4 w-4 mr-1" />
                    Approuver
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => openActionDialog(suggestion, 'merge')}
                  >
                    <Icons.merge className="h-4 w-4 mr-1" />
                    Fusionner
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-red-500 hover:text-red-400"
                    onClick={() => openActionDialog(suggestion, 'reject')}
                  >
                    <Icons.x className="h-4 w-4 mr-1" />
                    Rejeter
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Dialog d'action */}
      <Dialog open={isActionDialogOpen} onOpenChange={setIsActionDialogOpen}>
        <DialogContent className="bg-slate-800 border-slate-700">
          <DialogHeader>
            <DialogTitle className="text-white">
              {action === 'approve' && 'Approuver la suggestion'}
              {action === 'reject' && 'Rejeter la suggestion'}
              {action === 'merge' && 'Fusionner avec un élément existant'}
            </DialogTitle>
            <DialogDescription className="text-slate-400">
              {selectedSuggestion?.suggestedLabelFr} ({selectedSuggestion?.suggestedCode})
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {action === 'approve' && (
              <div>
                <Label>Parent (optionnel)</Label>
                <Select value={parentCode} onValueChange={setParentCode}>
                  <SelectTrigger className="bg-slate-900 border-slate-700">
                    <SelectValue placeholder="Aucun parent" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Aucun parent</SelectItem>
                    {getAllTaxonomyItems().map(item => (
                      <SelectItem key={item.code} value={item.code}>
                        {item.labelFr} ({TYPE_LABELS[item.type]})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {action === 'merge' && (
              <div>
                <Label>Fusionner avec</Label>
                <Select value={mergeWithCode} onValueChange={setMergeWithCode}>
                  <SelectTrigger className="bg-slate-900 border-slate-700">
                    <SelectValue placeholder="Sélectionner un élément" />
                  </SelectTrigger>
                  <SelectContent>
                    {getSameTypeItems(selectedSuggestion?.type || '').map(item => (
                      <SelectItem key={item.code} value={item.code}>
                        {item.labelFr}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div>
              <Label>Notes (optionnel)</Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Raison de cette décision..."
                className="bg-slate-900 border-slate-700"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsActionDialogOpen(false)}>
              Annuler
            </Button>
            <Button
              onClick={handleAction}
              disabled={isLoading || (action === 'merge' && !mergeWithCode)}
              className={
                action === 'approve'
                  ? 'bg-green-600 hover:bg-green-700'
                  : action === 'reject'
                  ? 'bg-red-600 hover:bg-red-700'
                  : 'bg-blue-600 hover:bg-blue-700'
              }
            >
              {isLoading ? <Icons.spinner className="h-4 w-4 animate-spin mr-2" /> : null}
              {action === 'approve' && 'Approuver'}
              {action === 'reject' && 'Rejeter'}
              {action === 'merge' && 'Fusionner'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
