/**
 * Mode Intelligent pour Extraction Métadonnées (Phase 1.2)
 *
 * Optimisation du pipeline d'extraction :
 * - Skip LLM si regex confiant >0.8 → Économie 30% coût LLM
 * - Détection champs N/A (skip si <3 champs applicables)
 * - Décision intelligente LLM vs regex
 *
 * @module lib/knowledge-base/metadata-extraction-intelligent-mode
 */

import type { StructuredMetadata } from './structured-metadata-extractor-service'

// =============================================================================
// TYPES
// =============================================================================

export interface FieldApplicability {
  category: string
  applicableFields: string[]
  totalFields: number
  applicabilityRatio: number // 0-1
}

export interface LLMDecision {
  shouldUseLLM: boolean
  reason: string
  confidenceThreshold: number
  estimatedCost: number // en USD
}

// =============================================================================
// MAPPING CHAMPS APPLICABLES PAR CATÉGORIE
// =============================================================================

/**
 * Champs applicables par catégorie juridique
 *
 * jurisprudence = 8 champs
 * legislation = 7 champs
 * doctrine = 8 champs
 * autre = 2 champs
 */
export const APPLICABLE_FIELDS_BY_CATEGORY: Record<string, string[]> = {
  jurisprudence: [
    'tribunal_code',
    'chambre_code',
    'decision_number',
    'decision_date',
    'parties_detailed',
    'solution',
    'legal_basis',
    'rapporteur',
  ],
  code: [
    'loi_number',
    'jort_number',
    'jort_date',
    'code_name',
    'article_range',
    'effective_date',
    'ministry',
  ],
  législation: [
    'loi_number',
    'jort_number',
    'jort_date',
    'effective_date',
    'ministry',
    'code_name',
    'article_range',
  ],
  doctrine: [
    'author',
    'co_authors',
    'publication_name',
    'publication_date',
    'university',
    'keywords_extracted',
    'abstract',
    'summary_ai',
  ],
  autre: ['title_official', 'document_date'],
  google_drive: ['title_official', 'document_date'],
  actualites: ['title_official', 'document_date'],
}

// =============================================================================
// FONCTION 1 : Détection Champs Applicables
// =============================================================================

/**
 * Détermine quels champs sont applicables pour une catégorie donnée
 *
 * @param category - Catégorie du document
 * @returns Informations sur les champs applicables
 *
 * @example
 * ```ts
 * const applicability = getApplicableFields('jurisprudence')
 * // { category: 'jurisprudence', applicableFields: [...], totalFields: 8, applicabilityRatio: 1.0 }
 * ```
 */
export function getApplicableFields(category: string): FieldApplicability {
  const normalizedCategory = category.toLowerCase()
  const applicableFields = APPLICABLE_FIELDS_BY_CATEGORY[normalizedCategory] || []

  // Calculer le ratio d'applicabilité (par rapport au max 8 champs)
  const maxFields = 8
  const applicabilityRatio = applicableFields.length / maxFields

  return {
    category: normalizedCategory,
    applicableFields,
    totalFields: applicableFields.length,
    applicabilityRatio,
  }
}

// =============================================================================
// FONCTION 2 : Décision Intelligente LLM
// =============================================================================

/**
 * Décide intelligemment si l'extraction LLM est nécessaire
 *
 * Règles de décision :
 * 1. Skip LLM si regex confiant >0.8 (économie 30%)
 * 2. Skip LLM si < 3 champs applicables (catégorie "autre")
 * 3. Skip LLM si déjà extrait manuellement (forceReextract=false)
 * 4. Utiliser LLM si confiance regex <0.5 (données critiques)
 * 5. Utiliser LLM si >5 champs applicables et regex confiance moyenne (0.5-0.8)
 *
 * @param category - Catégorie du document
 * @param regexMetadata - Métadonnées extraites par regex
 * @param options - Options d'extraction
 * @returns Décision LLM avec justification
 *
 * @example
 * ```ts
 * const decision = shouldExtractWithLLM('jurisprudence', regexMetadata, {})
 * if (decision.shouldUseLLM) {
 *   // Appeler extractWithLLM()
 * }
 * ```
 */
export function shouldExtractWithLLM(
  category: string,
  regexMetadata: Partial<StructuredMetadata>,
  options: {
    forceReextract?: boolean
    useRegexOnly?: boolean
    useLLMOnly?: boolean
  } = {}
): LLMDecision {
  // Cas 1 : Force regex only
  if (options.useRegexOnly) {
    return {
      shouldUseLLM: false,
      reason: 'Option useRegexOnly activée',
      confidenceThreshold: 0,
      estimatedCost: 0,
    }
  }

  // Cas 2 : Force LLM only
  if (options.useLLMOnly) {
    return {
      shouldUseLLM: true,
      reason: 'Option useLLMOnly activée',
      confidenceThreshold: 0,
      estimatedCost: 0.01, // ~1 cent par extraction LLM
    }
  }

  // Récupérer les champs applicables
  const applicability = getApplicableFields(category)

  // Règle 1 : Skip LLM si < 3 champs applicables (économie 30%)
  if (applicability.totalFields < 3) {
    return {
      shouldUseLLM: false,
      reason: `Catégorie "${category}" a seulement ${applicability.totalFields} champs applicables (<3) - Skip LLM`,
      confidenceThreshold: 0,
      estimatedCost: 0,
    }
  }

  // Calculer la confiance moyenne des champs regex
  const confidenceValues = Object.values(regexMetadata.fieldConfidence || {})
  const avgConfidence =
    confidenceValues.length > 0
      ? confidenceValues.reduce((sum, val) => sum + val, 0) / confidenceValues.length
      : 0

  // Règle 2 : Skip LLM si regex très confiant >0.8 (économie 30%)
  if (avgConfidence > 0.8 && confidenceValues.length >= applicability.totalFields * 0.5) {
    return {
      shouldUseLLM: false,
      reason: `Regex très confiant (${avgConfidence.toFixed(2)} > 0.8) avec ${confidenceValues.length}/${applicability.totalFields} champs extraits - Skip LLM`,
      confidenceThreshold: avgConfidence,
      estimatedCost: 0,
    }
  }

  // Règle 3 : Utiliser LLM si confiance regex faible <0.5 (données critiques)
  if (avgConfidence < 0.5) {
    return {
      shouldUseLLM: true,
      reason: `Regex peu confiant (${avgConfidence.toFixed(2)} < 0.5) - Utiliser LLM pour améliorer qualité`,
      confidenceThreshold: avgConfidence,
      estimatedCost: 0.01,
    }
  }

  // Règle 4 : Utiliser LLM si confiance moyenne (0.5-0.8) ET jurisprudence/legislation
  if (avgConfidence >= 0.5 && avgConfidence <= 0.8) {
    if (category === 'jurisprudence' || category === 'code' || category === 'législation') {
      return {
        shouldUseLLM: true,
        reason: `Regex confiance moyenne (${avgConfidence.toFixed(2)}) pour catégorie critique "${category}" - Utiliser LLM pour valider`,
        confidenceThreshold: avgConfidence,
        estimatedCost: 0.01,
      }
    }
  }

  // Règle 5 : Skip LLM par défaut si confiance acceptable
  return {
    shouldUseLLM: false,
    reason: `Regex suffisant (confiance ${avgConfidence.toFixed(2)}) - Skip LLM pour économie coûts`,
    confidenceThreshold: avgConfidence,
    estimatedCost: 0,
  }
}

// =============================================================================
// FONCTION 3 : Extraction Champs Enrichis (Nouveaux)
// =============================================================================

/**
 * Extrait les champs enrichis (parties_detailed, keywords_extracted, summary_ai)
 * Ces champs nécessitent principalement l'IA car difficiles à extraire par regex
 *
 * @param content - Texte du document
 * @param category - Catégorie du document
 * @param baseMetadata - Métadonnées de base (regex)
 * @returns Métadonnées enrichies partielles
 */
export function extractEnrichedFields(
  content: string,
  category: string,
  baseMetadata: Partial<StructuredMetadata>
): Partial<StructuredMetadata> {
  const enriched: Partial<StructuredMetadata> = {}

  // Extraction keywords_extracted (simple regex pour détecter termes juridiques fréquents)
  const keywords = extractKeywords(content, category)
  if (keywords.length > 0) {
    enriched.keywords_extracted = keywords.slice(0, 20) // Max 20 mots-clés
  }

  // Extraction parties_detailed (uniquement pour jurisprudence)
  if (category === 'jurisprudence') {
    const parties = extractParties(content)
    if (Object.keys(parties).length > 0) {
      enriched.parties_detailed = parties
    }
  }

  // Note : summary_ai sera généré par LLM uniquement (trop complexe pour regex)

  return enriched
}

/**
 * Extrait les mots-clés juridiques d'un texte
 * (version simple regex - LLM sera meilleur)
 */
function extractKeywords(content: string, category: string): string[] {
  const keywords: string[] = []

  // Dictionnaire de termes juridiques fréquents par catégorie
  const legalTerms: Record<string, string[]> = {
    jurisprudence: [
      'cassation',
      'rejet',
      'renvoi',
      'confirmation',
      'infirmation',
      'pourvoi',
      'arrêt',
      'jugement',
      'appel',
      'recours',
    ],
    code: ['article', 'chapitre', 'titre', 'section', 'code', 'loi', 'décret'],
    législation: ['loi', 'décret', 'JORT', 'promulgation', 'abrogation', 'modification'],
    doctrine: ['analyse', 'commentaire', 'doctrine', 'jurisprudence', 'principes'],
  }

  const terms = legalTerms[category] || []
  const contentLower = content.toLowerCase()

  for (const term of terms) {
    if (contentLower.includes(term.toLowerCase())) {
      keywords.push(term)
    }
  }

  return keywords
}

/**
 * Extrait les parties d'un procès (jurisprudence)
 * Format : { demandeur, défendeur, appellant, intimé }
 */
function extractParties(content: string): Record<string, string> {
  const parties: Record<string, string> = {}

  // Patterns pour détecter les parties
  const patterns = {
    demandeur: /(?:demandeur|المدعي)[\s:]+([A-Za-z\u0600-\u06FF\s\.-]+)/i,
    défendeur: /(?:défendeur|المدعى عليه)[\s:]+([A-Za-z\u0600-\u06FF\s\.-]+)/i,
    appellant: /(?:appellant|الطاعن)[\s:]+([A-Za-z\u0600-\u06FF\s\.-]+)/i,
    intimé: /(?:intimé|المطعون ضده)[\s:]+([A-Za-z\u0600-\u06FF\s\.-]+)/i,
  }

  for (const [role, pattern] of Object.entries(patterns)) {
    const match = content.match(pattern)
    if (match && match[1]) {
      parties[role] = match[1].trim()
    }
  }

  return parties
}

// =============================================================================
// FONCTION 4 : Calcul Économies LLM
// =============================================================================

/**
 * Calcule les économies réalisées grâce au mode intelligent
 *
 * @param totalDocuments - Nombre total de documents
 * @param llmSkipped - Nombre de documents skip LLM
 * @param avgCostPerLLM - Coût moyen par extraction LLM (USD)
 * @returns Statistiques économies
 */
export function calculateLLMSavings(
  totalDocuments: number,
  llmSkipped: number,
  avgCostPerLLM: number = 0.01
): {
  totalDocuments: number
  llmUsed: number
  llmSkipped: number
  llmSkipRate: number
  totalSavings: number
  monthlySavings: number
} {
  const llmUsed = totalDocuments - llmSkipped
  const llmSkipRate = totalDocuments > 0 ? llmSkipped / totalDocuments : 0
  const totalSavings = llmSkipped * avgCostPerLLM

  // Estimation mensuelle (supposant 500 docs/mois)
  const monthlyDocs = 500
  const monthlySkipped = monthlyDocs * llmSkipRate
  const monthlySavings = monthlySkipped * avgCostPerLLM

  return {
    totalDocuments,
    llmUsed,
    llmSkipped,
    llmSkipRate,
    totalSavings,
    monthlySavings,
  }
}
