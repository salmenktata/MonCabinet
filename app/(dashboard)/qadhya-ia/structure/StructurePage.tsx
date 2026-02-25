'use client'

import { useState, useEffect } from 'react'
import dynamic from 'next/dynamic'
import { useRouter, useSearchParams } from 'next/navigation'
import { X } from 'lucide-react'
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
import { MODE_CONFIGS } from '../mode-config'
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
  const config = MODE_CONFIGS['structure']

  const [showCreateModal, setShowCreateModal] = useState(false)
  const [creating, setCreating] = useState(false)
  const [showNotice, setShowNotice] = useState(() => {
    if (typeof window === 'undefined') return false
    return localStorage.getItem('qadhya_notice_structure') !== 'dismissed'
  })
  const dismissNotice = () => {
    localStorage.setItem('qadhya_notice_structure', 'dismissed')
    setShowNotice(false)
  }
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

  // Soumettre → analyser directement (plus de questions clarificatrices)
  const handleSubmitNarrative = () => {
    if (!narratif || narratif.length < 20) {
      setError(t('errors.narratifTooShort'))
      return
    }
    setError('')
    startAnalysis(narratif)
  }

  // Lancer l'analyse
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

  if (!hydrated) {
    return (
      <div className="space-y-6 pb-12">
        <div className="flex items-center gap-3">
          <div className={cn('w-10 h-10 rounded-full flex items-center justify-center', config.iconBgClass)}>
            <Icons.edit className={cn('h-5 w-5', config.iconTextClass)} />
          </div>
          <h1 className="text-2xl font-bold text-foreground">{t('title')}</h1>
        </div>
        <div className="h-64 animate-pulse rounded-lg bg-muted" />
      </div>
    )
  }

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className={cn('w-10 h-10 rounded-full flex items-center justify-center shrink-0', config.iconBgClass)}>
          <Icons.edit className={cn('h-5 w-5', config.iconTextClass)} />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-foreground">{t('title')}</h1>
          <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
        </div>
      </div>

      {/* Notice contextuelle — flux recommandé */}
      {showNotice && step === 'input' && (
        <div className={`relative rounded-lg border-l-4 border-indigo-500 bg-indigo-50/70 dark:bg-indigo-950/30 px-4 py-3 pr-10 ${isAr ? 'text-right' : ''}`}>
          <button
            onClick={dismissNotice}
            className="absolute top-3 right-3 text-muted-foreground hover:text-foreground"
            aria-label="Fermer"
          >
            <X className="h-4 w-4" />
          </button>
          <p className="text-sm font-semibold text-indigo-900 dark:text-indigo-200 mb-1">
            {isAr ? 'الخطوة 1/3 — هيكلة الملف' : 'Étape 1/3 — Structuration du dossier'}
          </p>
          <p className="text-xs text-indigo-700 dark:text-indigo-300 mb-2">
            {isAr
              ? 'صِف قضيتك بلغة طبيعية (عربية أو فرنسية). تستخرج الذكاء الاصطناعي الوقائع، تُحدد الأطراف، تبني الجدول الزمني وتُكيّف المسائل قانونياً. يمكن تحويل النتيجة إلى ملف دوسييه أو إرسالها إلى الاستشارة.'
              : 'Décrivez votre affaire en langage naturel. L\'IA extrait les faits, identifie les parties, construit la chronologie et qualifie juridiquement les enjeux. Le résultat peut être transformé en dossier ou transmis en Consultation.'}
          </p>
          <div className={`flex flex-wrap gap-2 ${isAr ? 'justify-end' : ''}`}>
            <span className="inline-flex items-center gap-1 rounded-full bg-purple-100 dark:bg-purple-900/50 px-2 py-0.5 text-xs text-purple-800 dark:text-purple-200">
              🤖 DeepSeek deepseek-chat
            </span>
            <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-xs text-slate-700 dark:text-slate-300">
              {isAr ? '📄 مخرج: JSON منظّم' : '📄 Output: JSON structuré'}
            </span>
            <span className="inline-flex items-center gap-1 rounded-full bg-indigo-100 dark:bg-indigo-900/50 px-2 py-0.5 text-xs text-indigo-800 dark:text-indigo-200">
              {isAr ? '← الخطوة التالية: الاستشارة' : '→ Étape suivante: Consultation'}
            </span>
          </div>
        </div>
      )}

      {/* Erreur globale */}
      {error && (
        <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-4 text-red-800 dark:text-red-300">
          {error}
        </div>
      )}

      {/* Saisie */}
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

          {/* Sélecteur de posture */}
          <div className="flex items-center gap-2">
            <StanceSelector stance={stance} onChange={setStance} />
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
