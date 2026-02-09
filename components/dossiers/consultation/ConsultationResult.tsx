'use client'

import { useState } from 'react'
import dynamic from 'next/dynamic'
import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { Icons } from '@/lib/icons'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'

const MarkdownMessage = dynamic(
  () => import('@/components/assistant-ia/MarkdownMessage').then(mod => mod.MarkdownMessage),
  {
    loading: () => (
      <div className="space-y-2">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="h-4 w-2/3" />
      </div>
    ),
  }
)
import type { ConsultationResponse } from '@/app/actions/consultation'

interface ConsultationResultProps {
  result: ConsultationResponse
  onNewConsultation: () => void
}

export function ConsultationResult({ result, onNewConsultation }: ConsultationResultProps) {
  const t = useTranslations('consultation')
  const router = useRouter()
  const [showAllSources, setShowAllSources] = useState(false)

  const handleCreateDossier = () => {
    // Rediriger vers la création de dossier avec les données pré-remplies
    const params = new URLSearchParams({
      from: 'consultation',
      seed: result.question, // Pré-remplir le narratif avec la question
      context: result.conseil?.substring(0, 500) || '', // Ajouter le conseil comme contexte
      sources: result.sources.map(s => s.id).join(','), // IDs sources pour référence
    })
    router.push(`/dossiers/assistant?${params.toString()}`)
  }

  const handleDeepAnalysis = () => {
    // Basculer vers Structuration IA avec contexte complet
    const params = new URLSearchParams({
      from: 'consultation',
      seed: `${result.question}\n\nRéponse préliminaire:\n${result.conseil.substring(0, 800)}`,
    })
    router.push(`/dossiers/assistant?${params.toString()}`)
  }

  const handleCopyAnswer = async () => {
    await navigator.clipboard.writeText(result.conseil)
  }

  const visibleSources = showAllSources
    ? result.sources
    : result.sources.slice(0, 3)

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header avec la question */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center shrink-0">
                <Icons.user className="h-5 w-5 text-primary-foreground" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">{t('yourQuestion')}</p>
                <p className="font-medium">{result.question}</p>
              </div>
            </div>
            <Badge variant="outline" className="shrink-0">
              {new Date().toLocaleDateString('fr-FR')}
            </Badge>
          </div>
        </CardHeader>
      </Card>

      {/* Conseil juridique */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Icons.scale className="h-5 w-5 text-primary" />
            {t('legalAdvice')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="prose prose-sm dark:prose-invert max-w-none">
            <MarkdownMessage
              content={result.conseil}
              sources={result.sources.map((s) => ({
                documentId: s.id,
                documentName: s.titre,
                chunkContent: s.extrait,
                similarity: s.pertinence,
              }))}
            />
          </div>

          <div className="flex items-center gap-2 mt-6 pt-4 border-t">
            <Button variant="ghost" size="sm" onClick={handleCopyAnswer}>
              <Icons.copy className="h-4 w-4 mr-2" />
              {t('copyAnswer')}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Références */}
      {result.sources.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Icons.bookOpen className="h-5 w-5 text-primary" />
                {t('references')}
              </div>
              <Badge variant="secondary">{result.sources.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {visibleSources.map((source, index) => (
              <div
                key={source.id}
                className="p-4 rounded-lg border bg-muted/30 hover:bg-muted/50 transition-colors"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                      <Badge variant="outline" className="text-xs">
                        {source.type}
                      </Badge>
                      <span className="font-medium truncate">{source.titre}</span>
                    </div>
                    <p className="text-sm text-muted-foreground line-clamp-2">
                      {source.extrait}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <div className="text-right">
                      <p className="text-sm font-semibold text-primary">
                        {Math.round(source.pertinence * 100)}%
                      </p>
                      <p className="text-xs text-muted-foreground">{t('relevance')}</p>
                    </div>
                  </div>
                </div>
              </div>
            ))}

            {result.sources.length > 3 && (
              <Button
                variant="ghost"
                className="w-full"
                onClick={() => setShowAllSources(!showAllSources)}
              >
                {showAllSources ? (
                  <>
                    <Icons.chevronUp className="h-4 w-4 mr-2" />
                    {t('showLess')}
                  </>
                ) : (
                  <>
                    <Icons.chevronDown className="h-4 w-4 mr-2" />
                    {t('showMore', { count: result.sources.length - 3 })}
                  </>
                )}
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {/* Actions recommandées */}
      {result.actions && result.actions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Icons.listTodo className="h-5 w-5 text-primary" />
              {t('recommendedActions')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-3">
              {result.actions.map((action, index) => (
                <li key={index} className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                    <span className="text-xs font-semibold text-primary">
                      {index + 1}
                    </span>
                  </div>
                  <p className="text-sm">{action}</p>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Actions */}
      <Separator />

      <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
        <Button variant="outline" onClick={onNewConsultation}>
          <Icons.arrowLeft className="h-4 w-4 mr-2" />
          {t('newConsultation')}
        </Button>

        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" onClick={handleCreateDossier}>
            <Icons.add className="h-4 w-4 mr-2" />
            {t('createDossierFromThis')}
          </Button>

          <Button variant="outline" onClick={handleDeepAnalysis}>
            <Icons.brain className="h-4 w-4 mr-2" />
            {t('deepAnalysis')}
          </Button>

          <Button onClick={() => router.push('/assistant-ia')}>
            <Icons.messageSquare className="h-4 w-4 mr-2" />
            {t('continueInChat')}
          </Button>
        </div>
      </div>
    </div>
  )
}
