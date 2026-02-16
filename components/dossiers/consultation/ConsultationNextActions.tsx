/**
 * Composant d'affichage des actions recommandées après une consultation
 * Affiche des cards contextuelles avec actions intelligentes
 *
 * @module components/dossiers/consultation
 * @see Sprint 2 - Workflow Consultation → Actions
 * @see Phase 4.3 - TODOs Critiques - Modals Consultation
 */

'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import {
  FolderPlus,
  Calculator,
  FileCheck,
  Calendar,
  BookOpen,
  UserPlus,
  Copy,
  Scale,
  ChevronRight,
  Loader2,
  CheckCircle2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useToastNotifications } from '@/components/feedback'
import type { RecommendedAction, ConsultationContext } from '@/lib/utils/consultation-action-recommender'
import { recommendActionsFromConsultation } from '@/lib/utils/consultation-action-recommender'
import { DocumentChecklistModal, AddContactModal } from './modals'

interface ConsultationNextActionsProps {
  /**
   * Contexte de la consultation
   */
  context: ConsultationContext

  /**
   * Classe CSS personnalisée
   */
  className?: string
}

/**
 * Map des icônes Lucide
 */
const ICON_MAP: Record<string, any> = {
  FolderPlus,
  Calculator,
  FileCheck,
  Calendar,
  BookOpen,
  UserPlus,
  Copy,
  Scale,
}

/**
 * Couleurs par priorité
 */
const PRIORITY_COLORS = {
  urgent: 'border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950',
  haute: 'border-orange-200 bg-orange-50 dark:border-orange-800 dark:bg-orange-950',
  moyenne: 'border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950',
  basse: 'border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-gray-950',
}

/**
 * Labels priorité
 */
const PRIORITY_LABELS = {
  urgent: 'Urgent',
  haute: 'Priorité haute',
  moyenne: 'Priorité moyenne',
  basse: 'Optionnel',
}

/**
 * Télécharge la consultation au format texte
 * Phase 4.3 - Action download
 */
function downloadConsultation(context: ConsultationContext) {
  const text = [
    '═══════════════════════════════════════════════════',
    '  CONSULTATION JURIDIQUE',
    '═══════════════════════════════════════════════════',
    '',
    'QUESTION:',
    context.question,
    '',
    '───────────────────────────────────────────────────',
    '',
    'RÉPONSE:',
    context.answer,
    '',
    '───────────────────────────────────────────────────',
    '',
    'SOURCES JURIDIQUES:',
    '',
    ...context.sources.map((source, index) =>
      `${index + 1}. [${source.type.toUpperCase()}] ${source.title}${source.category ? ` (${source.category})` : ''}`
    ),
    '',
    '═══════════════════════════════════════════════════',
    `Généré le ${new Date().toLocaleDateString('fr-FR')} à ${new Date().toLocaleTimeString('fr-FR')}`,
  ].join('\n')

  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `consultation-${Date.now()}.txt`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

/**
 * Composant d'actions contextuelles post-consultation
 */
export function ConsultationNextActions({ context, className }: ConsultationNextActionsProps) {
  const t = useTranslations('consultation')
  const router = useRouter()
  const toast = useToastNotifications()

  const [executingAction, setExecutingAction] = useState<string | null>(null)
  const [completedActions, setCompletedActions] = useState<Set<string>>(new Set())

  // États des modals
  const [documentChecklistOpen, setDocumentChecklistOpen] = useState(false)
  const [documentChecklistData, setDocumentChecklistData] = useState<string[]>([])
  const [addContactOpen, setAddContactOpen] = useState(false)
  const [addContactSuggestions, setAddContactSuggestions] = useState<string[]>([])

  // Recommander les actions
  const recommendedActions = recommendActionsFromConsultation(context)

  /**
   * Exécute une action
   */
  const handleAction = async (action: RecommendedAction) => {
    setExecutingAction(action.id)

    try {
      switch (action.action.type) {
        case 'navigate':
          const { path, params } = action.action.payload
          const queryString = new URLSearchParams(params).toString()
          router.push(`${path}?${queryString}`)
          break

        case 'copy':
          await navigator.clipboard.writeText(action.action.payload.text)
          toast.success('Copié', 'Le texte a été copié dans le presse-papier')
          setCompletedActions((prev) => new Set(prev).add(action.id))
          break

        case 'open-modal':
          // Phase 4.3: Implémenter les modals spécifiques
          const { modal, data } = action.action.payload

          if (modal === 'document-checklist') {
            setDocumentChecklistData(data as string[])
            setDocumentChecklistOpen(true)
          } else if (modal === 'add-contact') {
            setAddContactSuggestions(data as string[])
            setAddContactOpen(true)
          } else {
            toast.info('Bientôt disponible', 'Ce modal sera disponible prochainement')
          }
          break

        case 'download':
          // Phase 4.3: Télécharger la consultation en format texte
          downloadConsultation(context)
          toast.success('Téléchargé', 'La consultation a été téléchargée')
          setCompletedActions((prev) => new Set(prev).add(action.id))
          break
      }
    } catch (error) {
      console.error('Action failed:', error)
      toast.error('Erreur', 'Impossible d\'exécuter cette action')
    } finally {
      setExecutingAction(null)
    }
  }

  if (recommendedActions.length === 0) {
    return null
  }

  return (
    <Card className={cn('border-dashed', className)}>
      <CardHeader>
        <CardTitle className="text-lg">Prochaines étapes</CardTitle>
        <CardDescription>
          {recommendedActions.length} action{recommendedActions.length > 1 ? 's' : ''} recommandée{recommendedActions.length > 1 ? 's' : ''} pour ce cas
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {recommendedActions.map((action, index) => {
          const Icon = ICON_MAP[action.icon] || FolderPlus
          const isExecuting = executingAction === action.id
          const isCompleted = completedActions.has(action.id)

          return (
            <div key={action.id}>
              {index > 0 && <Separator className="my-3" />}

              <div
                className={cn(
                  'flex items-start gap-4 rounded-lg border p-4 transition-colors',
                  PRIORITY_COLORS[action.priorite],
                  isCompleted && 'opacity-60'
                )}
              >
                {/* Icône */}
                <div className="flex-shrink-0">
                  <div className={cn(
                    'flex h-10 w-10 items-center justify-center rounded-full',
                    action.priorite === 'urgent' && 'bg-red-600 text-white',
                    action.priorite === 'haute' && 'bg-orange-600 text-white',
                    action.priorite === 'moyenne' && 'bg-blue-600 text-white',
                    action.priorite === 'basse' && 'bg-gray-600 text-white'
                  )}>
                    {isCompleted ? (
                      <CheckCircle2 className="h-5 w-5" />
                    ) : (
                      <Icon className="h-5 w-5" />
                    )}
                  </div>
                </div>

                {/* Contenu */}
                <div className="flex-1 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h4 className="font-semibold text-foreground">{action.titre}</h4>
                      <p className="text-sm text-muted-foreground">{action.description}</p>
                    </div>
                    <Badge variant="outline" className="shrink-0">
                      {PRIORITY_LABELS[action.priorite]}
                    </Badge>
                  </div>

                  {action.dureeEstimee && (
                    <p className="text-xs text-muted-foreground">
                      ⏱️ Durée estimée : {action.dureeEstimee}
                    </p>
                  )}

                  <Button
                    onClick={() => handleAction(action)}
                    disabled={isExecuting || isCompleted}
                    size="sm"
                    className={cn(
                      'w-full sm:w-auto',
                      action.priorite === 'urgent' && 'bg-red-600 hover:bg-red-700',
                      action.priorite === 'haute' && 'bg-orange-600 hover:bg-orange-700'
                    )}
                  >
                    {isExecuting ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        En cours...
                      </>
                    ) : isCompleted ? (
                      <>
                        <CheckCircle2 className="mr-2 h-4 w-4" />
                        Terminé
                      </>
                    ) : (
                      <>
                        {action.action.type === 'navigate' ? 'Ouvrir' : 'Exécuter'}
                        <ChevronRight className="ml-2 h-4 w-4" />
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </div>
          )
        })}
      </CardContent>

      {/* Modals - Phase 4.3 */}
      <DocumentChecklistModal
        open={documentChecklistOpen}
        onClose={() => setDocumentChecklistOpen(false)}
        documents={documentChecklistData}
        question={context.question}
      />

      <AddContactModal
        open={addContactOpen}
        onClose={() => setAddContactOpen(false)}
        suggestions={addContactSuggestions}
        onContactAdded={() => {
          setCompletedActions((prev) => new Set(prev).add('add-contact'))
        }}
      />
    </Card>
  )
}
