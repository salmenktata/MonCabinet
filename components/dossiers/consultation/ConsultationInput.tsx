'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { Icons } from '@/lib/icons'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { submitConsultation, type ConsultationResponse } from '@/app/actions/consultation'
import { useDossierList } from '@/lib/hooks/useDossiers'
import { StanceSelector } from '@/components/qadhya-ia/StanceSelector'
import { useStance } from '@/contexts/StanceContext'

interface ConsultationInputProps {
  onComplete: (response: ConsultationResponse) => void
  isLoading: boolean
  setIsLoading: (loading: boolean) => void
  initialQuestion?: string
  initialContext?: string
}

export function ConsultationInput({
  onComplete,
  isLoading,
  setIsLoading,
  initialQuestion = '',
  initialContext = '',
}: ConsultationInputProps) {
  const t = useTranslations('consultation')
  const { stance, setStance } = useStance()
  const [question, setQuestion] = useState(initialQuestion)
  const [context, setContext] = useState(initialContext)
  const [selectedDossierId, setSelectedDossierId] = useState<string>('none')

  // Charger les dossiers de l'utilisateur avec React Query
  const { data: dossiersData, isLoading: loadingDossiers } = useDossierList({
    limit: 50,
    status: 'open', // Dossiers actifs
    sortBy: 'updatedAt',
    sortOrder: 'desc',
  })

  const dossiers = dossiersData?.dossiers || []

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!question.trim()) return

    setIsLoading(true)

    try {
      const result = await submitConsultation({
        question: question.trim(),
        context: context.trim() || undefined,
        dossierId: selectedDossierId !== 'none' ? selectedDossierId : undefined,
        stance,
      })

      if (result.success && result.data) {
        onComplete(result.data)
      } else {
        console.error('Erreur consultation:', result.error)
        toast.error(t('errorTitle'), {
          description: result.error || t('errorGeneric'),
        })
      }
    } catch (error) {
      console.error('Erreur consultation:', error)
      toast.error(t('errorTitle'), {
        description: error instanceof Error ? error.message : t('errorGeneric'),
      })
    } finally {
      setIsLoading(false)
    }
  }

  // Exemples de questions
  const exampleQuestions = [
    t('exampleQuestion1'),
    t('exampleQuestion2'),
    t('exampleQuestion3'),
  ]

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Question principale */}
      <div className="space-y-2">
        <Label htmlFor="question" className="text-base font-medium">
          {t('questionLabel')} <span className="text-destructive">*</span>
        </Label>
        <Textarea
          id="question"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder={t('questionPlaceholder')}
          rows={4}
          className="resize-none"
          disabled={isLoading}
          required
        />
        <p className="text-xs text-muted-foreground">
          {question.length}/2000 caractères
        </p>
      </div>

      {/* Exemples de questions */}
      <div className="space-y-2">
        <p className="text-sm text-muted-foreground">{t('examplesTitle')}</p>
        <div className="flex flex-wrap gap-2">
          {exampleQuestions.map((example, index) => (
            <Badge
              key={index}
              variant="outline"
              className="cursor-pointer hover:bg-primary/10 transition-colors"
              onClick={() => !isLoading && setQuestion(example)}
            >
              {example.length > 50 ? example.substring(0, 50) + '...' : example}
            </Badge>
          ))}
        </div>
      </div>

      {/* Contexte optionnel */}
      <div className="space-y-2">
        <Label htmlFor="context" className="text-base font-medium">
          {t('contextLabel')}
          <span className="text-xs text-muted-foreground ml-2">({t('optional')})</span>
        </Label>
        <Textarea
          id="context"
          value={context}
          onChange={(e) => setContext(e.target.value)}
          placeholder={t('contextPlaceholder')}
          rows={3}
          className="resize-none"
          disabled={isLoading}
        />
      </div>

      {/* Sélecteur de dossier */}
      <div className="space-y-2">
        <Label htmlFor="dossier" className="text-base font-medium">
          {t('dossierLabel')}
          <span className="text-xs text-muted-foreground ml-2">({t('optional')})</span>
        </Label>
        <Select
          value={selectedDossierId}
          onValueChange={setSelectedDossierId}
          disabled={isLoading || loadingDossiers}
        >
          <SelectTrigger>
            <SelectValue placeholder={t('dossierPlaceholder')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">
              <span className="text-muted-foreground">{t('noDossier')}</span>
            </SelectItem>
            {dossiers.map((dossier) => (
              <SelectItem key={dossier.id} value={dossier.id}>
                <div className="flex items-center gap-2">
                  <Icons.folder className="h-4 w-4 text-muted-foreground" />
                  <span>{dossier.titre}</span>
                  {dossier.numeroAffaire && (
                    <span className="text-xs text-muted-foreground">
                      ({dossier.numeroAffaire})
                    </span>
                  )}
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">{t('dossierHint')}</p>
      </div>

      {/* Posture stratégique */}
      <div className="space-y-1">
        <Label className="text-base font-medium">Posture stratégique</Label>
        <div className="flex items-center rounded-md border border-border/60 bg-muted/30 w-fit">
          <StanceSelector stance={stance} onChange={setStance} disabled={isLoading} />
        </div>
      </div>

      {/* Bouton de soumission */}
      <div className="flex justify-end gap-4">
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            setQuestion('')
            setContext('')
            setSelectedDossierId('none')
          }}
          disabled={isLoading}
        >
          <Icons.refresh className="h-4 w-4 mr-2" />
          {t('reset')}
        </Button>

        <Button type="submit" disabled={isLoading || !question.trim()}>
          {isLoading ? (
            <>
              <Icons.loader className="h-4 w-4 mr-2 animate-spin" />
              {t('consulting')}
            </>
          ) : (
            <>
              <Icons.zap className="h-4 w-4 mr-2" />
              {t('consult')}
            </>
          )}
        </Button>
      </div>
    </form>
  )
}
