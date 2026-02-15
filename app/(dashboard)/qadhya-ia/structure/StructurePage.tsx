'use client'

import { useState, useEffect } from 'react'
import dynamic from 'next/dynamic'
import { useRouter, useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import NarrativeInput from '@/components/dossiers/assistant/NarrativeInput'
import ExamplesCarousel from '@/components/dossiers/assistant/ExamplesCarousel'
import AnalysisLoader from '@/components/dossiers/assistant/AnalysisLoader'
import StructuredResult from '@/components/dossiers/assistant/StructuredResult'
import StepIndicator from '@/components/qadhya-ia/structure/StepIndicator'
import ClarifyingQuestions from '@/components/qadhya-ia/structure/ClarifyingQuestions'
import {
  structurerDossierAction,
  creerDossierDepuisStructureAction,
} from '@/app/actions/dossiers'
import {
  generateClarifyingQuestions,
  enrichNarrativeWithAnswers,
} from '@/app/actions/clarifying-questions'
import { useAssistantStore } from '@/lib/stores/assistant-store'
import type { StructuredDossier } from '@/lib/ai/dossier-structuring-service'

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

export function StructurePage({ clients }: StructurePageProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const t = useTranslations('assistant')
  const tCommon = useTranslations('common')

  const {
    step,
    setStep,
    narratif,
    setNarratif,
    result,
    setResult,
    error,
    setError,
    clarifyingQuestions,
    setClarifyingQuestions,
    clarifyingAnswers,
    setClarifyingAnswer,
    setEnrichedNarratif,
    reset,
  } = useAssistantStore()

  const [showCreateModal, setShowCreateModal] = useState(false)
  const [creating, setCreating] = useState(false)
  const [analysisSteps, setAnalysisSteps] = useState<string[]>([])
  const [generatingQuestions, setGeneratingQuestions] = useState(false)

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

  // Step 1 → Step 2 : Générer questions clarificatrices
  const handleSubmitNarrative = async () => {
    if (!narratif || narratif.length < 20) {
      setError(t('errors.narratifTooShort'))
      return
    }
    setError('')
    setGeneratingQuestions(true)

    try {
      const response = await generateClarifyingQuestions(narratif)
      if (response.success && response.data && response.data.length > 0) {
        setClarifyingQuestions(response.data)
        setStep('clarifying')
      } else {
        // Pas de questions → aller directement à l'analyse
        startAnalysis(narratif)
      }
    } catch {
      // Fallback : analyser directement si questions échouent
      startAnalysis(narratif)
    } finally {
      setGeneratingQuestions(false)
    }
  }

  // Step 2 → Step 3 : Enrichir + analyser
  const handleClarifyingSubmit = async () => {
    const enriched = await enrichNarrativeWithAnswers(
      narratif,
      clarifyingAnswers,
      clarifyingQuestions
    )
    setEnrichedNarratif(enriched)
    startAnalysis(enriched)
  }

  // Step 2 skip → Step 3 : Analyser directement
  const handleClarifyingSkip = () => {
    startAnalysis(narratif)
  }

  // Lancer l'analyse (Step 3)
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
    }, 800)

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
    clientId: string,
    options: { creerActions: boolean; creerEcheances: boolean; actionsSelectionnees?: string[] }
  ) => {
    if (!result) return
    setCreating(true)
    setError('')

    try {
      const response = await creerDossierDepuisStructureAction(result, clientId, options)
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

  const handleStepClick = (clickedStep: 'input' | 'clarifying' | 'analyzing' | 'result') => {
    if (clickedStep === 'input') {
      setStep('input')
    } else if (clickedStep === 'clarifying' && clarifyingQuestions.length > 0) {
      setStep('clarifying')
    }
  }

  if (!hydrated) {
    return (
      <div className="mx-auto max-w-5xl space-y-6 pb-12">
        <div className="flex items-center gap-3">
          <span className="text-3xl">&#129302;</span>
          <h1 className="text-3xl font-bold text-foreground">{t('title')}</h1>
        </div>
        <div className="h-64 animate-pulse rounded-lg bg-muted" />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 pb-12">
      {/* Header + Step Indicator */}
      <div className="space-y-4">
        <div>
          <div className="flex items-center gap-3">
            <span className="text-3xl">&#129302;</span>
            <h1 className="text-3xl font-bold text-foreground">{t('title')}</h1>
          </div>
          <p className="mt-2 text-muted-foreground">{t('subtitle')}</p>
        </div>
        <StepIndicator currentStep={step} onStepClick={handleStepClick} />
      </div>

      {/* Erreur globale */}
      {error && (
        <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-4 text-red-800 dark:text-red-300">
          {error}
        </div>
      )}

      {/* Step 1: Saisie */}
      {step === 'input' && (
        <>
          <div className="rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20 p-4">
            <div className="flex items-start gap-3">
              <span className="text-xl">&#128161;</span>
              <div>
                <p className="font-medium text-blue-900 dark:text-blue-200">{t('tip.title')}</p>
                <p className="text-sm text-blue-700 dark:text-blue-300">{t('tip.description')}</p>
              </div>
            </div>
          </div>

          <NarrativeInput
            value={narratif}
            onChange={setNarratif}
            onSubmit={handleSubmitNarrative}
            disabled={generatingQuestions}
          />

          <ExamplesCarousel onSelect={(example) => setNarratif(example)} />
        </>
      )}

      {/* Step 2: Questions clarificatrices */}
      {step === 'clarifying' && clarifyingQuestions.length > 0 && (
        <ClarifyingQuestions
          questions={clarifyingQuestions}
          answers={clarifyingAnswers}
          onAnswerChange={setClarifyingAnswer}
          onSubmit={handleClarifyingSubmit}
          onSkip={handleClarifyingSkip}
          onBack={() => setStep('input')}
        />
      )}

      {/* Step 3: Analyse */}
      {step === 'analyzing' && <AnalysisLoader completedSteps={analysisSteps} />}

      {/* Step 4: Résultat */}
      {step === 'result' && result && (
        <StructuredResult
          result={result}
          onReanalyze={handleReanalyze}
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
