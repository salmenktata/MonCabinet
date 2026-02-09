'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import type { StructuredDossier } from '@/lib/ai/dossier-structuring-service'
import ProcedureTypeBadge from './ProcedureTypeBadge'
import PartiesSection from './PartiesSection'
import FactsSection from './FactsSection'
import CalculationsSection from './CalculationsSection'
import TimelineSection from './TimelineSection'
import ActionsSection from './ActionsSection'
import ReferencesSection from './ReferencesSection'
import LegalAnalysisSection from './LegalAnalysisSection'
import ConfidenceBreakdown from './ConfidenceBreakdown'
import RAGInsights from './RAGInsights'
import ExecutiveSummary from './ExecutiveSummary'
import { AnalysisTableOfContents } from './AnalysisTableOfContents'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { ChevronDown } from 'lucide-react'

interface StructuredResultProps {
  result: StructuredDossier
  onReanalyze: () => void
  onCreateDossier: () => void
  onUpdateResult: (updated: StructuredDossier) => void
}

export default function StructuredResult({
  result,
  onReanalyze,
  onCreateDossier,
  onUpdateResult,
}: StructuredResultProps) {
  const t = useTranslations('assistant')
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<'analysis' | 'structure' | 'documents'>('analysis')

  const confidenceColor =
    result.confidence >= 80
      ? 'bg-green-500'
      : result.confidence >= 60
        ? 'bg-amber-500'
        : 'bg-red-500'

  const handleActionsChange = (
    newActions: StructuredDossier['actionsSuggerees']
  ) => {
    onUpdateResult({ ...result, actionsSuggerees: newActions })
  }

  const handleQuickAdvice = () => {
    // Basculer vers Consultation avec contexte
    const params = new URLSearchParams({
      from: 'assistant',
      question: result.resumeCourt || result.titrePropose || 'Conseil juridique sur ce dossier',
      context: result.narratifOriginal?.substring(0, 500) || '',
    })
    router.push(`/dossiers/consultation?${params.toString()}`)
  }

  return (
    <div className="space-y-6">
      {/* Header avec confiance */}
      <div className="flex items-center justify-between rounded-lg border bg-card p-4 shadow-sm">
        <div className="flex items-center gap-4">
          <span className="text-2xl">&#128203;</span>
          <div>
            <h2 className="text-xl font-bold text-foreground">
              {result.titrePropose || t('result.title')}
            </h2>
            <p className="text-sm text-muted-foreground">{result.resumeCourt}</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">
            {t('result.confidence')}:
          </span>
          <div className="flex items-center gap-2">
            <div className="h-2 w-24 rounded-full bg-muted">
              <div
                className={`h-2 rounded-full ${confidenceColor} transition-all`}
                style={{ width: `${result.confidence}%` }}
              />
            </div>
            <span className="text-sm font-semibold">{result.confidence}%</span>
          </div>
        </div>
      </div>

      {/* Type de procédure */}
      <ProcedureTypeBadge
        type={result.typeProcedure}
        sousType={result.sousType}
      />

      {/* Onglets */}
      <div className="border-b">
        <nav className="flex gap-4">
          <button
            onClick={() => setActiveTab('analysis')}
            className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'analysis'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <span className="mr-2">&#128269;</span>
            {t('tabs.analysis')}
          </button>
          <button
            onClick={() => setActiveTab('structure')}
            className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'structure'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <span className="mr-2">&#128209;</span>
            {t('tabs.structure')}
          </button>
          <button
            onClick={() => setActiveTab('documents')}
            className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'documents'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <span className="mr-2">&#128196;</span>
            {t('tabs.documents')}
          </button>
        </nav>
      </div>

      {/* Contenu des onglets */}
      {activeTab === 'analysis' && (
        <div className="flex gap-6">
          {/* Table des matières sticky */}
          <AnalysisTableOfContents
            sections={[
              { id: 'executive-summary', title: t('toc.executiveSummary'), readingTime: 1 },
              { id: 'group-synthese', title: t('groups.synthese'), readingTime: 2, children: [
                ...(result.analyseJuridique?.syllogisme ? [{ id: 'syllogisme', title: t('toc.syllogisme'), readingTime: 1 }] : []),
                { id: 'recommendation', title: t('toc.recommendation'), readingTime: 1 },
              ] },
              { id: 'group-analyse', title: t('groups.analyse'), readingTime: 4, children: [
                ...(result.analyseJuridique?.diagnostic ? [{ id: 'diagnostic', title: t('toc.diagnostic'), readingTime: 1 }] : []),
                ...(result.analyseJuridique?.analyseFaits ? [{ id: 'analyse-faits', title: t('toc.analyseFaits'), readingTime: 1 }] : []),
                { id: 'qualification', title: t('toc.qualification'), readingTime: 1 },
                { id: 'admissibility', title: t('toc.admissibility'), readingTime: 1 },
                { id: 'jurisdiction', title: t('toc.jurisdiction'), readingTime: 1 },
              ] },
              { id: 'group-strategie', title: t('groups.strategie'), readingTime: 3, children: [
                { id: 'evidence', title: t('toc.evidence'), readingTime: 1 },
                ...(result.analyseJuridique?.strategieGlobale ? [{ id: 'strategy', title: t('toc.strategy'), readingTime: 1 }] : []),
                ...(result.analyseJuridique?.argumentation ? [{ id: 'argumentation', title: t('toc.argumentation'), readingTime: 1 }] : []),
              ] },
              { id: 'group-risques', title: t('groups.risques'), readingTime: 2, children: [
                { id: 'risks', title: t('toc.risks'), readingTime: 1 },
                ...(result.references.length > 0 ? [{ id: 'references', title: t('toc.references'), readingTime: 1 }] : []),
              ] },
            ]}
            locale="fr"
            className="w-64 shrink-0"
          />

          {/* Contenu principal */}
          <div className="flex-1 space-y-6 min-w-0">
            {/* Executive Summary - Verdict express */}
            <div id="executive-summary">
              <ExecutiveSummary result={result} />
            </div>

            {/* Analyse juridique et stratégie */}
            <div id="legal-analysis">
              <LegalAnalysisSection result={result} />
            </div>

            {/* Références juridiques */}
            {result.references.length > 0 && (
              <div id="references">
                <ReferencesSection references={result.references} />
              </div>
            )}

            {/* Métriques techniques (Expert) - collapsible en bas */}
            <div id="technical-metrics">
              <Collapsible>
                <CollapsibleTrigger className="flex items-center gap-2 w-full px-4 py-3 rounded-lg border bg-muted/50 hover:bg-muted transition-colors text-sm font-medium text-muted-foreground">
                  <ChevronDown className="h-4 w-4 transition-transform duration-200 [[data-state=open]>&]:rotate-180" />
                  {t('technicalMetrics.title')}
                </CollapsibleTrigger>
                <CollapsibleContent className="mt-3 space-y-4">
                  <ConfidenceBreakdown result={result} />
                  {result.ragMetrics && (
                    <RAGInsights ragMetrics={result.ragMetrics} />
                  )}
                </CollapsibleContent>
              </Collapsible>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'structure' && (
        <div className="space-y-6">
          {/* Parties */}
          <PartiesSection
            client={result.client}
            partieAdverse={result.partieAdverse}
          />

          {/* Faits extraits */}
          <FactsSection
            faits={result.faitsExtraits}
            enfants={result.enfants}
            donneesSpecifiques={result.donneesSpecifiques}
          />

          {/* Calculs juridiques */}
          {result.calculs.length > 0 && (
            <CalculationsSection calculs={result.calculs} />
          )}

          {/* Timeline */}
          <TimelineSection timeline={result.timeline} />

          {/* Actions suggérées */}
          <ActionsSection
            actions={result.actionsSuggerees}
            onChange={handleActionsChange}
          />
        </div>
      )}

      {activeTab === 'documents' && (
        <div className="space-y-6">
          {/* Section documents à générer */}
          <DocumentsSection result={result} />
        </div>
      )}

      {/* Actions principales */}
      <div className="flex items-center justify-center gap-4 rounded-lg border bg-card p-4">
        <button
          onClick={onReanalyze}
          className="flex items-center gap-2 rounded-lg border bg-card px-4 py-2 text-foreground font-medium hover:bg-muted transition-colors"
        >
          <svg
            className="h-4 w-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
            />
          </svg>
          {t('actions.reanalyze')}
        </button>

        <button
          onClick={handleQuickAdvice}
          className="flex items-center gap-2 rounded-lg border bg-card px-4 py-2 text-foreground font-medium hover:bg-muted transition-colors"
        >
          <svg
            className="h-4 w-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M13 10V3L4 14h7v7l9-11h-7z"
            />
          </svg>
          {t('actions.quickAdvice')}
        </button>

        <button
          onClick={onCreateDossier}
          className="flex items-center gap-2 rounded-lg bg-blue-600 px-6 py-2 text-white font-semibold hover:bg-blue-700 transition-colors"
        >
          <svg
            className="h-4 w-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M5 13l4 4L19 7"
            />
          </svg>
          {t('actions.createDossier')}
        </button>
      </div>
    </div>
  )
}

// Composant pour les documents à générer
function DocumentsSection({ result }: { result: StructuredDossier }) {
  const t = useTranslations('assistant')

  const documents = getRecommendedDocuments(result, t)

  return (
    <div className="rounded-lg border bg-card p-6 shadow-sm">
      <div className="flex items-center gap-2 mb-4">
        <span className="text-xl">&#128196;</span>
        <h3 className="text-lg font-semibold text-foreground">
          {t('documents.title')}
        </h3>
      </div>

      <p className="text-sm text-muted-foreground mb-6">
        {t('documents.description')}
      </p>

      <div className="space-y-4">
        {documents.map((doc, index) => (
          <div
            key={index}
            className="flex items-start gap-4 rounded-lg border p-4 hover:bg-muted/50 transition-colors"
          >
            <div
              className={`flex-shrink-0 rounded-lg p-2 ${
                doc.priority === 'high'
                  ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
                  : doc.priority === 'medium'
                    ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400'
                    : 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400'
              }`}
            >
              <span className="text-lg" dangerouslySetInnerHTML={{ __html: doc.icon }} />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <h4 className="font-medium text-foreground">{doc.title}</h4>
                {doc.priority === 'high' && (
                  <span className="rounded-full bg-red-100 dark:bg-red-900/30 px-2 py-0.5 text-xs font-medium text-red-700 dark:text-red-400">
                    {t('documents.priority.high')}
                  </span>
                )}
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                {doc.description}
              </p>
              <div className="mt-3">
                <button className="text-sm font-medium text-blue-600 hover:text-blue-700">
                  {t('documents.generate')} &rarr;
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function getRecommendedDocuments(result: StructuredDossier, t: (key: string) => string) {
  const docs: Array<{
    icon: string
    title: string
    description: string
    priority: 'high' | 'medium' | 'low'
  }> = []

  // Convention d'honoraires (toujours premier)
  docs.push({
    icon: '&#128221;',
    title: t('documents.types.convention'),
    description: t('documents.descriptions.convention'),
    priority: 'high',
  })

  // Selon le type de procédure
  if (
    result.typeProcedure === 'commercial' ||
    result.typeProcedure === 'civil_premiere_instance'
  ) {
    docs.push({
      icon: '&#128231;',
      title: t('documents.types.miseEnDemeure'),
      description: t('documents.descriptions.miseEnDemeure'),
      priority: 'high',
    })
  }

  if (result.typeProcedure === 'refere') {
    docs.push({
      icon: '&#9889;',
      title: t('documents.types.requeteRefere'),
      description: t('documents.descriptions.requeteRefere'),
      priority: 'high',
    })
  } else {
    docs.push({
      icon: '&#9878;',
      title: t('documents.types.assignation'),
      description: t('documents.descriptions.assignation'),
      priority: 'medium',
    })
  }

  if (result.typeProcedure === 'divorce') {
    docs.push({
      icon: '&#128141;',
      title: t('documents.types.requeteDivorce'),
      description: t('documents.descriptions.requeteDivorce'),
      priority: 'high',
    })
  }

  // Note d'analyse (toujours utile)
  docs.push({
    icon: '&#128209;',
    title: t('documents.types.noteAnalyse'),
    description: t('documents.descriptions.noteAnalyse'),
    priority: 'medium',
  })

  // Bordereau de pièces
  docs.push({
    icon: '&#128203;',
    title: t('documents.types.bordereauPieces'),
    description: t('documents.descriptions.bordereauPieces'),
    priority: 'low',
  })

  return docs
}
