/**
 * RAG Amendment Filter — Filtre d'Amendements pour le RAG
 *
 * Enrichit les résultats RAG avec la logique de versionnement législatif :
 * - Boost ×1.30 sur les chunks JORT (versions plus récentes)
 * - Pénalité ×0.75 sur les versions originales si un amendement est connu
 * - Génération d'AmendmentWarning[] pour l'affichage utilisateur
 * - Regroupement des sources couvrant le même article
 *
 * @module lib/ai/rag-amendment-filter
 */

import { createLogger } from '@/lib/logger'
import type { ChatSource } from './rag-search-service'

const log = createLogger('rag-amendment-filter')

// =============================================================================
// TYPES
// =============================================================================

export type AmendmentWarningLevel = 'info' | 'warning' | 'critical'

/**
 * Avertissement généré quand un article a plusieurs versions
 */
export interface AmendmentWarning {
  /** Référence lisible : "Article 65 du COC (م.إ.ع)" */
  articleRef: string
  /** ID du chunk original */
  originalChunkId: string
  /** Référence du JORT modificatif : "Loi n° 2023-45 du 15/07/2023" */
  amendingJortRef: string
  /** Date d'amendement (ISO) */
  amendmentDate: string
  /** Type de modification */
  amendmentType: 'modification' | 'abrogation' | 'addition' | 'replacement'
  /** Niveau d'alerte */
  warningLevel: AmendmentWarningLevel
  /** Code concerné */
  codeSlug: string
  /** Articles concernés */
  affectedArticles: number[]
}

/**
 * Résultat enrichi après application du filtre d'amendements
 */
export interface AmendmentEnrichedResult {
  /** Sources enrichies avec boost/pénalité */
  sources: ChatSource[]
  /** Warnings à afficher à l'utilisateur */
  amendmentWarnings: AmendmentWarning[]
  /** Nombre de sources avec amendement actif */
  sourcesWithAmendment: number
}

// =============================================================================
// CONSTANTES
// =============================================================================

/** Boost appliqué sur un chunk JORT = version modifiée plus récente */
const AMENDMENT_VERSION_BOOST = 1.30

/** Pénalité sur la version originale quand une version JORT existe */
const ORIGINAL_VERSION_PENALTY = 0.75

/** Score maximal de cap après boost */
const MAX_SIMILARITY_CAP = 2.0

// =============================================================================
// HELPERS
// =============================================================================

function getAmendmentMeta(source: ChatSource): {
  isAmendment: boolean
  hasAmendment: boolean
  amendedCode: string | null
  amendedByJortRef: string | null
  amendmentDate: string | null
  amendmentType: 'modification' | 'abrogation' | 'addition' | 'replacement' | null
  affectedArticles: number[]
  jortDate: string | null
  jortIssue: string | null
} {
  const meta = source.metadata as Record<string, unknown> | undefined

  return {
    isAmendment: meta?.is_amendment === true || meta?.is_amendment === 'true',
    hasAmendment: meta?.has_amendment === true || meta?.has_amendment === 'true',
    amendedCode: (meta?.amended_code as string | undefined) ?? null,
    amendedByJortRef: (meta?.amendment_ref as string | undefined) ?? null,
    amendmentDate: (meta?.amendment_date as string | undefined) ?? null,
    amendmentType: (meta?.amendment_type as 'modification' | 'abrogation' | 'addition' | 'replacement' | null) ?? null,
    affectedArticles: Array.isArray(meta?.amended_articles)
      ? (meta.amended_articles as number[])
      : [],
    jortDate: (meta?.jort_date as string | undefined) ?? null,
    jortIssue: (meta?.jort_issue as string | undefined) ?? null,
  }
}

function buildArticleRef(source: ChatSource, codeSlug: string | null): string {
  const meta = source.metadata as Record<string, unknown> | undefined
  const articleNum = meta?.article_number as string | number | undefined
  const docName = source.documentName ?? ''

  if (articleNum && codeSlug) {
    return `Article ${articleNum} du ${codeSlug}`
  }
  if (articleNum) {
    return `Article ${articleNum} — ${docName.slice(0, 40)}`
  }
  return docName.slice(0, 60) || `Source ${source.documentId?.slice(0, 8)}`
}

function computeWarningLevel(
  amendmentType: string | null,
  amendmentDate: string | null
): AmendmentWarningLevel {
  if (amendmentType === 'abrogation') return 'critical'

  if (amendmentDate) {
    const year = parseInt(amendmentDate.slice(0, 4), 10)
    const now = new Date().getFullYear()
    if (now - year <= 2) return 'warning'
  }

  return 'info'
}

// =============================================================================
// FONCTION PRINCIPALE
// =============================================================================

/**
 * Applique l'intelligence d'amendement aux sources RAG.
 *
 * Pour chaque source :
 * - Si is_amendment=true → boost ×1.30 (version JORT = plus récente)
 * - Si has_amendment=true → pénalité ×0.75 (version originale dépassée)
 * - Génère AmendmentWarning[] pour les articles avec versions multiples
 *
 * Algorithme :
 * 1. Identifier les chunks "originaux" (has_amendment=true)
 * 2. Identifier les chunks "amendements" (is_amendment=true)
 * 3. Pour chaque paire [original, amendement] → appliquer boost/pénalité
 * 4. Générer warning pour chaque article avec version multiple
 *
 * @param sources - Sources RAG brutes
 * @returns Sources enrichies + warnings
 */
export async function applyAmendmentIntelligence(
  sources: ChatSource[]
): Promise<AmendmentEnrichedResult> {
  if (sources.length === 0) {
    return { sources: [], amendmentWarnings: [], sourcesWithAmendment: 0 }
  }

  const amendmentWarnings: AmendmentWarning[] = []
  const enrichedSources = [...sources]
  let sourcesWithAmendment = 0

  // Classifier les sources
  const amendmentSources: Array<{ idx: number; meta: ReturnType<typeof getAmendmentMeta> }> = []
  const originalSources: Array<{ idx: number; meta: ReturnType<typeof getAmendmentMeta> }> = []

  for (let i = 0; i < enrichedSources.length; i++) {
    const meta = getAmendmentMeta(enrichedSources[i])
    if (meta.isAmendment) amendmentSources.push({ idx: i, meta })
    if (meta.hasAmendment) originalSources.push({ idx: i, meta })
  }

  // Appliquer boost sur les chunks JORT (versions amendées)
  for (const { idx, meta } of amendmentSources) {
    const source = enrichedSources[idx]
    const currentSim = source.similarity ?? 0
    const newSim = Math.min(currentSim * AMENDMENT_VERSION_BOOST, MAX_SIMILARITY_CAP)

    enrichedSources[idx] = {
      ...source,
      similarity: newSim,
      metadata: {
        ...(source.metadata as Record<string, unknown>),
        _amendment_boost_applied: AMENDMENT_VERSION_BOOST,
        _original_similarity: currentSim,
      },
    }

    sourcesWithAmendment++

    log.info(
      `[RAG Amendment] Boost ×${AMENDMENT_VERSION_BOOST} sur chunk JORT "${source.documentName?.slice(0, 40)}" ` +
      `(${currentSim.toFixed(3)} → ${newSim.toFixed(3)})`
    )
  }

  // Appliquer pénalité sur les versions originales + générer warnings
  for (const { idx, meta } of originalSources) {
    const source = enrichedSources[idx]
    const currentSim = source.similarity ?? 0
    const newSim = currentSim * ORIGINAL_VERSION_PENALTY

    enrichedSources[idx] = {
      ...source,
      similarity: newSim,
      metadata: {
        ...(source.metadata as Record<string, unknown>),
        _amendment_penalty_applied: ORIGINAL_VERSION_PENALTY,
        _original_similarity: currentSim,
      },
    }

    sourcesWithAmendment++

    log.info(
      `[RAG Amendment] Pénalité ×${ORIGINAL_VERSION_PENALTY} sur version originale "${source.documentName?.slice(0, 40)}" ` +
      `(${currentSim.toFixed(3)} → ${newSim.toFixed(3)})`
    )

    // Générer un warning
    const articleRef = buildArticleRef(source, meta.amendedCode)
    const warningLevel = computeWarningLevel(meta.amendmentType, meta.amendmentDate)

    // Éviter les warnings dupliqués pour le même article
    const warningKey = `${meta.amendedCode}:${meta.affectedArticles.join(',')}`
    const alreadyWarned = amendmentWarnings.some(
      (w) => `${w.codeSlug}:${w.affectedArticles.join(',')}` === warningKey
    )

    if (!alreadyWarned) {
      amendmentWarnings.push({
        articleRef,
        originalChunkId: source.documentId ?? '',
        amendingJortRef: meta.amendedByJortRef ?? 'JORT inconnu',
        amendmentDate: meta.amendmentDate ?? meta.jortDate ?? '',
        amendmentType: meta.amendmentType ?? 'modification',
        warningLevel,
        codeSlug: meta.amendedCode ?? 'INCONNU',
        affectedArticles: meta.affectedArticles,
      })
    }
  }

  // Retrier les sources par similarité après boost/pénalité
  const sortedSources = [...enrichedSources].sort(
    (a, b) => (b.similarity ?? 0) - (a.similarity ?? 0)
  )

  // Mettre les warnings critiques (abrogation) en premier
  amendmentWarnings.sort((a, b) => {
    const order: Record<AmendmentWarningLevel, number> = { critical: 0, warning: 1, info: 2 }
    return order[a.warningLevel] - order[b.warningLevel]
  })

  return {
    sources: sortedSources,
    amendmentWarnings,
    sourcesWithAmendment,
  }
}

/**
 * Formate les warnings d'amendement en texte lisible pour le prompt LLM
 * ou l'affichage dans le chat.
 */
export function formatAmendmentWarningsText(
  warnings: AmendmentWarning[],
  language: 'fr' | 'ar' = 'fr'
): string {
  if (warnings.length === 0) return ''

  if (language === 'ar') {
    const lines = warnings.map((w) => {
      const typeMap: Record<string, string> = {
        modification: 'تنقيح',
        abrogation: 'إلغاء',
        addition: 'إضافة',
        replacement: 'استبدال',
      }
      const type = typeMap[w.amendmentType] ?? 'تنقيح'
      const date = w.amendmentDate ? ` بتاريخ ${w.amendmentDate}` : ''
      return `⚠️ ${w.articleRef} : ${type}${date} — ${w.amendingJortRef}`
    })
    return `**تنبيهات تشريعية:**\n${lines.join('\n')}`
  }

  // Français (défaut)
  const lines = warnings.map((w) => {
    const typeMap: Record<string, string> = {
      modification: 'modifié',
      abrogation: 'abrogé',
      addition: 'complété',
      replacement: 'remplacé',
    }
    const verb = typeMap[w.amendmentType] ?? 'modifié'
    const dateStr = w.amendmentDate ? ` le ${w.amendmentDate}` : ''
    const icon = w.warningLevel === 'critical' ? '🚨' : w.warningLevel === 'warning' ? '⚠️' : 'ℹ️'
    return `${icon} **${w.articleRef}** a été ${verb}${dateStr} par ${w.amendingJortRef}`
  })

  return `**Mises à jour législatives :**\n${lines.join('\n')}`
}
