'use client'

import { useState, useEffect } from 'react'
import dynamic from 'next/dynamic'
import { useRouter, useSearchParams } from 'next/navigation'
import { useTranslations, useLocale } from 'next-intl'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { Icons } from '@/lib/icons'
import NarrativeInput from '@/components/dossiers/assistant/NarrativeInput'
import ExamplesCarousel from '@/components/dossiers/assistant/ExamplesCarousel'
import AnalysisLoader from '@/components/dossiers/assistant/AnalysisLoader'
import StructuredResult from '@/components/dossiers/assistant/StructuredResult'
import { StanceSelector } from '@/components/qadhya-ia/StanceSelector'
import {
  structurerDossierAction,
  creerDossierDepuisStructureAction,
} from '@/app/actions/dossiers'
import { useAssistantStore } from '@/lib/stores/assistant-store'
import { useStance } from '@/contexts/StanceContext'
import type {
  StructuredDossier,
  NewClientData,
} from '@/lib/ai/dossier-structuring-service'

const CreateDossierModal = dynamic(
  () => import('@/components/dossiers/assistant/CreateDossierModal'),
  { ssr: false }
)

interface Client {
  id: string
  nom: string
  prenom?: string
  type_client: string
}

interface StructurePageProps {
  clients: Client[]
}

const WORKFLOW_STEPS = [
  { labelFr: 'Structuration', labelAr: 'هيكلة', step: 1 },
  { labelFr: 'Consultation', labelAr: 'استشارة', step: 2 },
  { labelFr: 'Dossier', labelAr: 'ملف', step: 3 },
]

export function StructurePage({ clients }: StructurePageProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const t = useTranslations('assistant')
  const locale = useLocale()
  const isAr = locale === 'ar'

  const {
    step,
    setStep,
    narratif,
    setNarratif,
    result,
    setResult,
    error,
    setError,
    reset,
  } = useAssistantStore()

  const { stance, setStance } = useStance()

  const [showCreateModal, setShowCreateModal] = useState(false)
  const [creating, setCreating] = useState(false)
  const [analysisSteps, setAnalysisSteps] = useState<string[]>([])

  // Hydratation SSR
  const [hydrated, setHydrated] = useState(false)
  useEffect(() => {
    setHydrated(true)
  }, [])

  // Pré-remplir depuis query params
  useEffect(() => {
    if (!hydrated) return
    const seed = searchParams.get('seed')
    const context = searchParams.get('context')
    const from = searchParams.get('from')

    if (seed) {
      let fullNarrative = seed
      if (context) {
        fullNarrative += `\n\nContexte additionnel:\n${context}`
      }
      setNarratif(fullNarrative)
      if (from === 'consultation') {
        toast.info(t('actions.fromConsultation'))
      }
    }
  }, [hydrated, searchParams, setNarratif, t])

  const handleSubmitNarrative = () => {
    if (!narratif || narratif.length < 20) {
      setError(t('errors.narratifTooShort'))
      return
    }
    setError('')
    startAnalysis(narratif)
  }

  const startAnalysis = async (textToAnalyze: string) => {
    setStep('analyzing')
    setAnalysisSteps([])

    const steps = [
      t('analysis.identifyingType'),
      t('analysis.extractingParties'),
      t('analysis.extractingFacts'),
      t('analysis.legalCalculations'),
      t('analysis.generatingTimeline'),
      t('analysis.searchingReferences'),
    ]

    let stepIndex = 0
    const interval = setInterval(() => {
      if (stepIndex < steps.length) {
        setAnalysisSteps((prev) => [...prev, steps[stepIndex]])
        stepIndex++
      }
    }, 2000)

    try {
      const response = await structurerDossierAction(textToAnalyze)
      clearInterval(interval)

      if (response.error) {
        setError(response.error)
        setStep('input')
        return
      }

      if (response.data) {
        setResult(response.data)
        setStep('result')
      }
    } catch {
      clearInterval(interval)
      setError(t('errors.analysisError'))
      setStep('input')
    }
  }

  const handleReanalyze = () => {
    reset()
  }

  const handleCreateDossier = async (
    clientId: string | null,
    newClientData: NewClientData | null,
    options: { creerActions: boolean; creerEcheances: boolean; actionsSelectionnees?: string[] }
  ) => {
    if (!result) return
    setCreating(true)
    setError('')

    try {
      const response = await creerDossierDepuisStructureAction(result, clientId, newClientData, options)
      if (response.error) {
        setError(response.error)
        setCreating(false)
        return
      }
      if (response.data) {
        reset()
        setShowCreateModal(false)
        router.push(`/dossiers/${response.data.dossierId}`)
      }
    } catch {
      setError(t('errors.createError'))
      setCreating(false)
    }
  }

  if (!hydrated) {
    return (
      <div className="space-y-6 pb-12">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center shrink-0">
            <Icons.edit className="h-5 w-5 text-amber-600 dark:text-amber-400" />
          </div>
          <div>
            <div className="h-7 w-48 rounded-md bg-muted animate-pulse" />
            <div className="mt-1 h-4 w-72 rounded-md bg-muted animate-pulse" />
          </div>
        </div>
        <div className="h-64 animate-pulse rounded-xl bg-muted" />
      </div>
    )
  }

  return (
    <div className="space-y-6 pb-12">
      {/* En-tête */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center shrink-0">
            <Icons.edit className="h-5 w-5 text-amber-600 dark:text-amber-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">{t('title')}</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">{t('subtitle')}</p>
          </div>
        </div>

        {/* Workflow indicator */}
        <div className="hidden sm:flex items-center gap-1.5 shrink-0 pt-0.5">
          {WORKFLOW_STEPS.map((s, i) => (
            <div key={s.step} className="flex items-center gap-1.5">
              <span
                className={cn(
                  'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium border transition-colors',
                  s.step === 1
                    ? 'bg-amber-100 border-amber-300 text-amber-800 dark:bg-amber-900/40 dark:border-amber-600 dark:text-amber-300'
                    : 'bg-muted/60 border-border text-muted-foreground'
                )}
              >
                {isAr ? s.labelAr : s.labelFr}
              </span>
              {i < WORKFLOW_STEPS.length - 1 && (
                <Icons.chevronRight className="h-3 w-3 text-muted-foreground/50" />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Erreur globale */}
      {error && (
        <div className="rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-4 text-sm text-red-800 dark:text-red-300 flex items-start gap-2">
          <Icons.alertCircle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Saisie */}
      {step === 'input' && (
        <>
          {/* Barre posture + conseil */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
            <div className="flex items-center gap-2">
              <StanceSelector stance={stance} onChange={setStance} />
            </div>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Icons.info className="h-3.5 w-3.5 shrink-0" />
              <span>{t('tip.description')}</span>
            </div>
          </div>

          <NarrativeInput
            value={narratif}
            onChange={setNarratif}
            onSubmit={handleSubmitNarrative}
            disabled={false}
          />

          <ExamplesCarousel onSelect={(example) => setNarratif(example)} />
        </>
      )}

      {/* Analyse en cours */}
      {step === 'analyzing' && <AnalysisLoader completedSteps={analysisSteps} />}

      {/* Résultat */}
      {step === 'result' && result && (
        <StructuredResult
          result={result}
          onReanalyze={handleReanalyze}
          onReset={() => reset()}
          onCreateDossier={() => setShowCreateModal(true)}
          onUpdateResult={(updated) => setResult(updated)}
        />
      )}

      {/* Modal création dossier */}
      {showCreateModal && result && (
        <CreateDossierModal
          clients={clients}
          result={result}
          onClose={() => setShowCreateModal(false)}
          onConfirm={handleCreateDossier}
          loading={creating}
        />
      )}
    </div>
  )
}
