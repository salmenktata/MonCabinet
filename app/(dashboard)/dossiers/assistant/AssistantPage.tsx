'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import NarrativeInput from '@/components/dossiers/assistant/NarrativeInput'
import ExamplesCarousel from '@/components/dossiers/assistant/ExamplesCarousel'
import AnalysisLoader from '@/components/dossiers/assistant/AnalysisLoader'
import StructuredResult from '@/components/dossiers/assistant/StructuredResult'
import CreateDossierModal from '@/components/dossiers/assistant/CreateDossierModal'
import {
  structurerDossierAction,
  creerDossierDepuisStructureAction,
} from '@/app/actions/dossiers'
import type { StructuredDossier } from '@/lib/ai/dossier-structuring-service'

interface Client {
  id: string
  nom: string
  prenom?: string
  type_client: string
}

interface AssistantPageProps {
  clients: Client[]
}

type Step = 'input' | 'analyzing' | 'result'

export default function AssistantPage({ clients }: AssistantPageProps) {
  const router = useRouter()
  const t = useTranslations('assistant')
  const tCommon = useTranslations('common')

  const [step, setStep] = useState<Step>('input')
  const [narratif, setNarratif] = useState('')
  const [result, setResult] = useState<StructuredDossier | null>(null)
  const [error, setError] = useState('')
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [creating, setCreating] = useState(false)

  // Pour le loader
  const [analysisSteps, setAnalysisSteps] = useState<string[]>([])

  const handleAnalyze = async () => {
    if (!narratif || narratif.length < 20) {
      setError(t('errors.narratifTooShort'))
      return
    }

    setError('')
    setStep('analyzing')
    setAnalysisSteps([])

    // Simuler la progression des étapes
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
      const response = await structurerDossierAction(narratif)

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
    } catch (err) {
      clearInterval(interval)
      setError(t('errors.analysisError'))
      setStep('input')
    }
  }

  const handleReanalyze = () => {
    setResult(null)
    setStep('input')
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
        setShowCreateModal(false)
        router.push(`/dossiers/${response.data.dossierId}`)
      }
    } catch (err) {
      setError(t('errors.createError'))
      setCreating(false)
    }
  }

  const handleExampleClick = (example: string) => {
    setNarratif(example)
  }

  const updateResult = (updated: StructuredDossier) => {
    setResult(updated)
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 pb-12">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3">
            <span className="text-3xl">&#129302;</span>
            <h1 className="text-3xl font-bold text-foreground">{t('title')}</h1>
          </div>
          <p className="mt-2 text-muted-foreground">{t('subtitle')}</p>
        </div>

        <Link
          href="/dossiers"
          className="rounded-md border border bg-card px-4 py-2 text-foreground font-medium hover:bg-muted"
        >
          {tCommon('back')}
        </Link>
      </div>

      {/* Erreur globale */}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-800">
          {error}
        </div>
      )}

      {/* Étape: Saisie */}
      {step === 'input' && (
        <>
          {/* Conseil */}
          <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
            <div className="flex items-start gap-3">
              <span className="text-xl">&#128161;</span>
              <div>
                <p className="font-medium text-blue-900">{t('tip.title')}</p>
                <p className="text-sm text-blue-700">{t('tip.description')}</p>
              </div>
            </div>
          </div>

          {/* Zone de saisie */}
          <NarrativeInput
            value={narratif}
            onChange={setNarratif}
            onSubmit={handleAnalyze}
            disabled={false}
          />

          {/* Exemples */}
          <ExamplesCarousel onSelect={handleExampleClick} />
        </>
      )}

      {/* Étape: Analyse en cours */}
      {step === 'analyzing' && <AnalysisLoader completedSteps={analysisSteps} />}

      {/* Étape: Résultat */}
      {step === 'result' && result && (
        <>
          <StructuredResult
            result={result}
            onReanalyze={handleReanalyze}
            onCreateDossier={() => setShowCreateModal(true)}
            onUpdateResult={updateResult}
          />
        </>
      )}

      {/* Modal de création */}
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
