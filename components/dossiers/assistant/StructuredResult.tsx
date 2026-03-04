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
import { Icons } from '@/lib/icons'
import type { IconName } from '@/lib/icons'
import { toast } from 'sonner'

interface StructuredResultProps {
  result: StructuredDossier
  onReanalyze: () => void
  onReset?: () => void
  onCreateDossier: () => void
  onUpdateResult: (updated: StructuredDossier) => void
}

export default function StructuredResult({
  result,
  onReanalyze,
  onReset,
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

  const buildMarkdown = () => {
    const lines: string[] = []
    lines.push(`# ${result.titrePropose || 'Analyse juridique — Qadhya'}`)
    lines.push('')
    if (result.resumeCourt) {
      lines.push(`> ${result.resumeCourt}`)
      lines.push('')
    }
    if (result.typeProcedure) {
      lines.push(`**Type de procédure :** ${result.typeProcedure}${result.sousType ? ` — ${result.sousType}` : ''}`)
      lines.push('')
    }
    if (result.analyseJuridique?.recommandationStrategique) {
      lines.push('## Recommandation stratégique')
      lines.push(result.analyseJuridique.recommandationStrategique)
      lines.push('')
    }
    if (result.analyseJuridique?.syllogisme?.conclusion) {
      lines.push('## Conclusion juridique')
      lines.push(result.analyseJuridique.syllogisme.conclusion)
      lines.push('')
    }
    if (result.references?.length > 0) {
      lines.push('## Références')
      result.references.forEach((ref) => {
        lines.push(`- ${ref.titre}`)
      })
      lines.push('')
    }
    lines.push('---')
    lines.push('*Généré par Qadhya — Assistant juridique IA*')
    return lines.join('\n')
  }

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(buildMarkdown())
      toast.success('Analyse copiée dans le presse-papiers')
    } catch {
      toast.error('Impossible de copier')
    }
  }

  const handleExport = () => {
    const content = buildMarkdown()
    const blob = new Blob([content], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `qadhya-structure-${Date.now()}.md`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
    toast.success('Fichier exporté')
  }

  const handleQuickAdvice = () => {
    // Basculer vers Consultation avec contexte
    const params = new URLSearchParams({
      from: 'assistant',
      question: result.resumeCourt || result.titrePropose || 'Conseil juridique sur ce dossier',
      context: result.narratifOriginal?.substring(0, 500) || '',
    })
    router.push(`/qadhya-ia/consult?${params.toString()}`)
  }

  return (
    <div className="space-y-6">
      {/* Header avec confiance */}
      <div className="rounded-xl border bg-card p-5 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-start gap-4">
          <div className="flex items-start gap-3 flex-1 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center shrink-0">
              <Icons.clipboardCheck className="h-5 w-5 text-amber-600 dark:text-amber-400" />
            </div>
            <div className="min-w-0">
              <h2 className="text-lg font-bold text-foreground leading-tight">
                {result.titrePropose || t('result.title')}
              </h2>
              {result.resumeCourt && (
                <p className="mt-0.5 text-sm text-muted-foreground line-clamp-2">{result.resumeCourt}</p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <span className="text-xs text-muted-foreground">{t('result.confidence')}</span>
            <div className="flex items-center gap-1.5">
              <div className="h-1.5 w-20 rounded-full bg-muted overflow-hidden">
                <div
                  className={`h-full rounded-full ${confidenceColor} transition-all`}
                  style={{ width: `${result.confidence}%` }}
                />
              </div>
              <span className="text-sm font-semibold tabular-nums">{result.confidence}%</span>
            </div>
          </div>
        </div>

        {/* Type de procédure inline */}
        <div className="mt-3 pt-3 border-t">
          <ProcedureTypeBadge
            type={result.typeProcedure}
            sousType={result.sousType}
          />
        </div>
      </div>

      {/* Onglets */}
      <div className="border-b">
        <nav className="flex gap-1">
          {[
            { key: 'analysis', Icon: Icons.search, label: t('tabs.analysis') },
            { key: 'structure', Icon: Icons.fileText, label: t('tabs.structure') },
            { key: 'documents', Icon: Icons.file, label: t('tabs.documents') },
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key as typeof activeTab)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.key
                  ? 'border-amber-600 text-amber-700 dark:text-amber-400'
                  : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
              }`}
            >
              <tab.Icon className="h-4 w-4" />
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Contenu des onglets */}
      {activeTab === 'analysis' && (
        <div className="flex gap-6">
          {/* Table des matières sticky */}
          <div className="hidden lg:block">
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
          </div>

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
      <div className="rounded-xl border bg-card p-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          {/* Secondaires */}
          <div className="flex items-center gap-1.5">
            <button
              onClick={handleCopy}
              className="flex items-center gap-1.5 rounded-lg border bg-muted/50 px-3 py-2.5 sm:py-1.5 text-sm text-foreground hover:bg-muted transition-colors"
            >
              <Icons.copy className="h-3.5 w-3.5" />
              Copier
            </button>
            <button
              onClick={handleExport}
              className="flex items-center gap-1.5 rounded-lg border bg-muted/50 px-3 py-2.5 sm:py-1.5 text-sm text-foreground hover:bg-muted transition-colors"
            >
              <Icons.download className="h-3.5 w-3.5" />
              Exporter
            </button>
            {onReset && (
              <button
                onClick={onReset}
                className="flex items-center gap-1.5 rounded-lg border bg-muted/50 px-3 py-2.5 sm:py-1.5 text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              >
                <Icons.refreshCw className="h-3.5 w-3.5" />
                Recommencer
              </button>
            )}
          </div>

          {/* Principales */}
          <div className="flex items-center gap-2">
            <button
              onClick={onReanalyze}
              className="flex items-center gap-1.5 rounded-lg border bg-card px-4 py-2.5 sm:py-2 text-sm text-foreground font-medium hover:bg-muted transition-colors"
            >
              <Icons.refresh className="h-4 w-4" />
              {t('actions.reanalyze')}
            </button>

            <button
              onClick={handleQuickAdvice}
              className="flex items-center gap-1.5 rounded-lg border bg-card px-4 py-2.5 sm:py-2 text-sm text-foreground font-medium hover:bg-muted transition-colors"
            >
              <Icons.zap className="h-4 w-4" />
              {t('actions.quickAdvice')}
            </button>

            <button
              onClick={onCreateDossier}
              className="flex items-center gap-1.5 rounded-lg bg-amber-600 px-5 py-2.5 sm:py-2 text-sm text-white font-semibold hover:bg-amber-700 transition-colors"
            >
              <Icons.check className="h-4 w-4" />
              {t('actions.createDossier')}
            </button>
          </div>
        </div>
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
        {documents.map((doc, index) => {
          const DocIcon = Icons[doc.iconName]
          return (
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
              <DocIcon className="h-5 w-5" />
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
          )
        })}
      </div>
    </div>
  )
}

function getRecommendedDocuments(result: StructuredDossier, t: (key: string) => string) {
  const docs: Array<{
    iconName: IconName
    title: string
    description: string
    priority: 'high' | 'medium' | 'low'
  }> = []

  // Convention d'honoraires (toujours premier)
  docs.push({
    iconName: 'edit',
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
      iconName: 'mail',
      title: t('documents.types.miseEnDemeure'),
      description: t('documents.descriptions.miseEnDemeure'),
      priority: 'high',
    })
  }

  if (result.typeProcedure === 'refere') {
    docs.push({
      iconName: 'zap',
      title: t('documents.types.requeteRefere'),
      description: t('documents.descriptions.requeteRefere'),
      priority: 'high',
    })
  } else {
    docs.push({
      iconName: 'scale',
      title: t('documents.types.assignation'),
      description: t('documents.descriptions.assignation'),
      priority: 'medium',
    })
  }

  if (result.typeProcedure === 'divorce') {
    docs.push({
      iconName: 'gavel',
      title: t('documents.types.requeteDivorce'),
      description: t('documents.descriptions.requeteDivorce'),
      priority: 'high',
    })
  }

  // Note d'analyse (toujours utile)
  docs.push({
    iconName: 'fileText',
    title: t('documents.types.noteAnalyse'),
    description: t('documents.descriptions.noteAnalyse'),
    priority: 'medium',
  })

  // Bordereau de pièces
  docs.push({
    iconName: 'clipboardCheck',
    title: t('documents.types.bordereauPieces'),
    description: t('documents.descriptions.bordereauPieces'),
    priority: 'low',
  })

  return docs
}
