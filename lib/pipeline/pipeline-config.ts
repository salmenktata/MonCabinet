/**
 * Configuration du pipeline KB supervisé
 * Seuils et paramètres pour l'auto-avancement
 */

import type { PipelineStage } from './document-pipeline-service'

export interface AutoAdvanceConfig {
  enabled: boolean
  /** Étapes pour lesquelles l'auto-advance est actif */
  stages: PipelineStage[]
  /** Seuils pour chaque quality gate */
  thresholds: {
    minContentLength: number
    minChunks: number
    minQualityScore: number
    requireCategory: boolean
  }
}

export const PIPELINE_CONFIG: AutoAdvanceConfig = {
  enabled: true,
  stages: [
    'content_reviewed',  // crawled → content_reviewed (contenu OK)
    'classified',        // content_reviewed → classified (catégorie détectée)
    'indexed',           // classified → indexed (auto si catégorie présente)
    'quality_analyzed',  // indexed → quality_analyzed (auto après indexation)
    'rag_active',        // quality_analyzed → rag_active (si score > seuil)
  ],
  thresholds: {
    minContentLength: 100,
    minChunks: 1,
    minQualityScore: 75,
    requireCategory: true,
  },
}

/**
 * Vérifie si un document peut auto-avancer vers l'étape suivante
 */
export function canAutoAdvance(
  doc: {
    full_text: string | null
    category: string | null
    is_indexed: boolean
    quality_score: number | null
    pipeline_stage: PipelineStage
  },
  targetStage: PipelineStage,
  chunksCount: number
): boolean {
  const config = PIPELINE_CONFIG

  if (!config.enabled) return false
  if (!config.stages.includes(targetStage)) return false

  const { thresholds } = config

  switch (targetStage) {
    case 'content_reviewed':
      return (doc.full_text?.length ?? 0) >= thresholds.minContentLength

    case 'classified':
      return true // Admin a validé le contenu, on avance

    case 'indexed':
      if (thresholds.requireCategory && (!doc.category || doc.category === '')) return false
      return true

    case 'quality_analyzed':
      return chunksCount >= thresholds.minChunks

    case 'rag_active':
      if (!doc.is_indexed) return false
      if (chunksCount < thresholds.minChunks) return false
      // Si quality_score null → pas encore analysé, on laisse passer (checkQualityGate gère le seuil min 50)
      if (doc.quality_score === null) return true
      return doc.quality_score >= thresholds.minQualityScore

    default:
      return false
  }
}
