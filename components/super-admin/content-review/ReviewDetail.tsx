'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Icons } from '@/lib/icons'
import { useToast } from '@/lib/hooks/use-toast'
import { ReviewTypeBadge, PriorityBadge } from './ReviewFilters'
import { ClassificationEditor } from './ClassificationEditor'
import { ContradictionViewer } from './ContradictionViewer'
import {
  completeReviewAction,
  skipReviewAction,
} from '@/app/actions/super-admin/content-review'
import type {
  HumanReviewItem,
  ContentQualityAssessment,
  LegalClassification,
  ContentContradiction,
  ReviewDecision,
} from '@/lib/web-scraper/types'

interface ReviewDetailProps {
  review: HumanReviewItem
  targetDetails: {
    page?: { id: string; url: string; title: string | null; content: string | null }
    quality?: ContentQualityAssessment | null
    classification?: LegalClassification | null
    contradictions?: ContentContradiction[]
  }
  userId: string
}

export function ReviewDetail({
  review,
  targetDetails,
  userId,
}: ReviewDetailProps) {
  const router = useRouter()
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)
  const [notes, setNotes] = useState('')
  const [showClassificationEditor, setShowClassificationEditor] = useState(false)
  const [modifications, setModifications] = useState<Record<string, unknown>>({})

  const handleDecision = async (decision: ReviewDecision) => {
    setLoading(true)
    try {
      const result = await completeReviewAction(review.id, userId, {
        decision,
        notes: notes || undefined,
        modifications: Object.keys(modifications).length > 0 ? modifications : undefined,
      })

      if (result.success) {
        toast({
          title: 'Revue terminée',
          description: `Décision: ${decision}`,
        })
        router.push('/super-admin/content-review')
      } else {
        toast({
          title: 'Erreur',
          description: result.error || 'Impossible de soumettre la décision',
          variant: 'destructive',
        })
      }
    } catch (error) {
      toast({
        title: 'Erreur',
        description: 'Une erreur est survenue',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  const handleSkip = async () => {
    setLoading(true)
    try {
      const result = await skipReviewAction(review.id, userId, notes || undefined)
      if (result.success) {
        toast({
          title: 'Item passé',
          description: 'Vous pouvez passer au suivant',
        })
        router.push('/super-admin/content-review')
      } else {
        toast({
          title: 'Erreur',
          description: result.error,
          variant: 'destructive',
        })
      }
    } finally {
      setLoading(false)
    }
  }

  const isCompleted = review.status === 'completed' || review.status === 'skipped'

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">{review.title}</h1>
          <div className="flex items-center gap-2 mt-2">
            <ReviewTypeBadge type={review.reviewType} />
            <PriorityBadge priority={review.priority} />
            {targetDetails.page?.url && (
              <a
                href={targetDetails.page.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-slate-400 hover:text-emerald-400 flex items-center gap-1"
              >
                <Icons.externalLink className="h-3 w-3" />
                Voir la source
              </a>
            )}
          </div>
        </div>
        <div className="text-right text-sm text-slate-400">
          <div>
            Créée le{' '}
            {new Intl.DateTimeFormat('fr-FR', {
              dateStyle: 'medium',
              timeStyle: 'short',
            }).format(new Date(review.createdAt))}
          </div>
        </div>
      </div>

      {/* Description */}
      {review.description && (
        <Card className="bg-slate-900/50 border-slate-700">
          <CardContent className="pt-4">
            <p className="text-slate-300 whitespace-pre-wrap">{review.description}</p>
          </CardContent>
        </Card>
      )}

      {/* Scores */}
      {targetDetails.quality && (
        <Card className="bg-slate-900/50 border-slate-700">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Icons.chartBar className="h-5 w-5 text-emerald-400" />
              Scores de qualité
            </CardTitle>
          </CardHeader>
          <CardContent>
            <QualityScores assessment={targetDetails.quality} />
          </CardContent>
        </Card>
      )}

      {/* Classification */}
      {targetDetails.classification && (
        <Card className="bg-slate-900/50 border-slate-700">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-lg flex items-center gap-2">
              <Icons.tag className="h-5 w-5 text-purple-400" />
              Classification
            </CardTitle>
            {!isCompleted && review.reviewType === 'classification_uncertain' && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowClassificationEditor(true)}
              >
                <Icons.edit className="h-4 w-4 mr-1" />
                Modifier
              </Button>
            )}
          </CardHeader>
          <CardContent>
            <ClassificationDisplay classification={targetDetails.classification} />
          </CardContent>
        </Card>
      )}

      {/* Contradictions */}
      {targetDetails.contradictions && targetDetails.contradictions.length > 0 && (
        <Card className="bg-slate-900/50 border-slate-700">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Icons.alertTriangle className="h-5 w-5 text-orange-400" />
              Contradictions détectées ({targetDetails.contradictions.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ContradictionViewer contradictions={targetDetails.contradictions} />
          </CardContent>
        </Card>
      )}

      {/* Contenu */}
      {targetDetails.page?.content && (
        <Card className="bg-slate-900/50 border-slate-700">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Icons.fileText className="h-5 w-5 text-blue-400" />
              Contenu extrait
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="max-h-96 overflow-y-auto text-sm text-slate-300 whitespace-pre-wrap bg-slate-800/50 p-4 rounded-lg">
              {targetDetails.page.content.substring(0, 3000)}
              {targetDetails.page.content.length > 3000 && (
                <span className="text-slate-400">
                  ... [{targetDetails.page.content.length - 3000} caractères tronqués]
                </span>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Actions suggérées */}
      {review.suggestedActions && review.suggestedActions.length > 0 && (
        <Card className="bg-slate-900/50 border-slate-700">
          <CardHeader>
            <CardTitle className="text-lg">Actions suggérées</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {review.suggestedActions.map((action, index) => (
                <div
                  key={index}
                  className={`p-3 rounded-lg border ${
                    action.recommended
                      ? 'bg-emerald-500/10 border-emerald-500/30'
                      : 'bg-slate-800/50 border-slate-700'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-white">{action.action}</span>
                    {action.recommended && (
                      <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30">
                        Recommandé
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm text-slate-400 mt-1">{action.description}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Formulaire de décision */}
      {!isCompleted && (
        <Card className="bg-slate-900/50 border-slate-700">
          <CardHeader>
            <CardTitle className="text-lg">Votre décision</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Textarea
              placeholder="Notes (optionnel)..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="bg-slate-800 border-slate-600"
              rows={3}
            />
            <div className="flex flex-wrap gap-3">
              <Button
                onClick={() => handleDecision('approve')}
                disabled={loading}
                className="bg-emerald-600 hover:bg-emerald-700"
              >
                {loading ? (
                  <Icons.loader className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Icons.check className="h-4 w-4 mr-2" />
                )}
                Approuver
              </Button>
              <Button
                onClick={() => handleDecision('reject')}
                disabled={loading}
                variant="destructive"
              >
                <Icons.x className="h-4 w-4 mr-2" />
                Rejeter
              </Button>
              {review.reviewType === 'classification_uncertain' && (
                <Button
                  onClick={() => handleDecision('modify')}
                  disabled={loading}
                  variant="outline"
                >
                  <Icons.edit className="h-4 w-4 mr-2" />
                  Modifier et valider
                </Button>
              )}
              <Button
                onClick={() => handleDecision('escalate')}
                disabled={loading}
                variant="outline"
                className="text-orange-400 border-orange-400/30 hover:bg-orange-400/10"
              >
                <Icons.arrowUp className="h-4 w-4 mr-2" />
                Escalader
              </Button>
              <Button
                onClick={handleSkip}
                disabled={loading}
                variant="ghost"
              >
                <Icons.skip className="h-4 w-4 mr-2" />
                Passer
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Résultat si terminé */}
      {isCompleted && review.decision && (
        <Card className="bg-slate-900/50 border-slate-700">
          <CardHeader>
            <CardTitle className="text-lg">Décision prise</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-3">
              <Badge
                className={
                  review.decision === 'approve'
                    ? 'bg-emerald-500/20 text-emerald-400'
                    : review.decision === 'reject'
                    ? 'bg-red-500/20 text-red-400'
                    : 'bg-blue-500/20 text-blue-400'
                }
              >
                {review.decision === 'approve' ? 'Approuvé' :
                 review.decision === 'reject' ? 'Rejeté' :
                 review.decision === 'modify' ? 'Modifié' :
                 review.decision === 'escalate' ? 'Escaladé' : 'Différé'}
              </Badge>
              {review.completedAt && (
                <span className="text-sm text-slate-400">
                  le{' '}
                  {new Intl.DateTimeFormat('fr-FR', {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  }).format(new Date(review.completedAt))}
                </span>
              )}
            </div>
            {review.decisionNotes && (
              <p className="mt-2 text-slate-300">{review.decisionNotes}</p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Modal de modification de classification */}
      {showClassificationEditor && targetDetails.classification && (
        <ClassificationEditor
          classification={targetDetails.classification}
          onSave={(newClassification) => {
            setModifications({ classification: newClassification })
            setShowClassificationEditor(false)
          }}
          onCancel={() => setShowClassificationEditor(false)}
        />
      )}
    </div>
  )
}

function QualityScores({ assessment }: { assessment: ContentQualityAssessment }) {
  const scores = [
    { label: 'Global', value: assessment.overallScore, key: 'overall' },
    { label: 'Clarté', value: assessment.clarityScore, key: 'clarity' },
    { label: 'Structure', value: assessment.structureScore, key: 'structure' },
    { label: 'Complétude', value: assessment.completenessScore, key: 'completeness' },
    { label: 'Fiabilité', value: assessment.reliabilityScore, key: 'reliability' },
    { label: 'Actualité', value: assessment.freshnessScore, key: 'freshness' },
    { label: 'Pertinence', value: assessment.relevanceScore, key: 'relevance' },
  ]

  const getColor = (value: number | null) => {
    if (value === null) return 'bg-slate-600'
    if (value >= 70) return 'bg-emerald-500'
    if (value >= 50) return 'bg-yellow-500'
    return 'bg-red-500'
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {scores.map((score) => (
        <div key={score.key} className="text-center">
          <div className="text-sm text-slate-400 mb-1">{score.label}</div>
          <div className="relative h-2 bg-slate-700 rounded-full overflow-hidden">
            <div
              className={`absolute left-0 top-0 h-full ${getColor(score.value)} transition-all`}
              style={{ width: `${score.value || 0}%` }}
            />
          </div>
          <div className="text-lg font-bold text-white mt-1">
            {score.value !== null ? score.value : '-'}
          </div>
        </div>
      ))}
    </div>
  )
}

function ClassificationDisplay({ classification }: { classification: LegalClassification }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
      <div>
        <span className="text-slate-400">Catégorie:</span>
        <span className="ml-2 text-white">{classification.primaryCategory}</span>
      </div>
      {classification.domain && (
        <div>
          <span className="text-slate-400">Domaine:</span>
          <span className="ml-2 text-white">{classification.domain}</span>
        </div>
      )}
      {classification.subdomain && (
        <div>
          <span className="text-slate-400">Sous-domaine:</span>
          <span className="ml-2 text-white">{classification.subdomain}</span>
        </div>
      )}
      {classification.documentNature && (
        <div>
          <span className="text-slate-400">Nature:</span>
          <span className="ml-2 text-white">{classification.documentNature}</span>
        </div>
      )}
      <div>
        <span className="text-slate-400">Confiance:</span>
        <span
          className={`ml-2 ${
            classification.confidenceScore >= 0.7
              ? 'text-emerald-400'
              : classification.confidenceScore >= 0.5
              ? 'text-yellow-400'
              : 'text-red-400'
          }`}
        >
          {(classification.confidenceScore * 100).toFixed(0)}%
        </span>
      </div>
      {classification.legalKeywords && classification.legalKeywords.length > 0 && (
        <div className="col-span-2 md:col-span-3">
          <span className="text-slate-400">Mots-clés:</span>
          <div className="flex flex-wrap gap-1 mt-1">
            {classification.legalKeywords.slice(0, 10).map((keyword, i) => (
              <Badge key={i} variant="outline" className="text-xs bg-slate-800">
                {keyword}
              </Badge>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
