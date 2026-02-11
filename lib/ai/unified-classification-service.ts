/**
 * Service de Classification Unifié - Sprint 3 Phase 2
 *
 * Fusionne legal-classifier-service.ts + classification-cache-service.ts + adaptive-thresholds.ts
 *
 * Objectifs :
 * - API simple : classify(), classifyBatch()
 * - Cache intelligent Redis (normalisation URL patterns)
 * - Seuils adaptatifs par domaine juridique
 * - Multi-signaux : Structure (30%) + Règles (40%) + LLM (30%)
 * - Skip LLM quand confiance >= seuil (économie ~60% appels)
 *
 * Réduction : 3 services fragmentés → 1 service unifié (~400 lignes)
 *
 * @module lib/ai/unified-classification-service
 */

import OpenAI from 'openai'
import { createHash } from 'crypto'
import { aiConfig } from '@/lib/ai/config'
import {
  callLLMWithFallback,
  type LLMMessage,
  type AIContext,
} from './llm-fallback-service'
import { logUsage } from '@/lib/ai/usage-tracker'
import { getRedisClient } from '@/lib/cache/redis'
import type {
  LegalContentCategory,
  LegalDomain,
  DocumentNature,
} from '@/lib/web-scraper/types'
import {
  LEGAL_CLASSIFICATION_SYSTEM_PROMPT,
  LEGAL_CLASSIFICATION_USER_PROMPT,
  formatPrompt,
  truncateContent,
} from '@/lib/ai/prompts/legal-analysis'

// =============================================================================
// TYPES
// =============================================================================

/**
 * Filtres de classification
 */
export interface ClassificationFilters {
  /** Source name (ex: "9anoun.tn") */
  sourceName?: string

  /** URL de la page */
  url?: string

  /** Contenu HTML brut */
  htmlContent?: string

  /** Contenu texte extrait */
  textContent?: string

  /** Structure du site (breadcrumbs, navigation) */
  siteStructure?: {
    breadcrumbs?: string[]
    urlPath?: string
    navigationLabels?: string[]
  }
}

/**
 * Options de classification
 */
export interface ClassificationOptions {
  /** Forcer l'utilisation du LLM (bypass cache + seuils) */
  forceLLM?: boolean

  /** Activer le cache Redis */
  useCache?: boolean

  /** TTL du cache en secondes */
  cacheTTL?: number

  /** Provider LLM préféré (ollama, deepseek, groq) */
  preferredProvider?: 'ollama' | 'deepseek' | 'groq'

  /** Langue du contenu (ar, fr) */
  language?: 'ar' | 'fr'

  /** Contexte additionnel */
  context?: string
}

/**
 * Signal de classification
 */
export interface ClassificationSignal {
  source: 'structure' | 'rules' | 'keywords' | 'llm' | 'cache'
  category: string | null
  domain: string | null
  documentType: string | null
  confidence: number
  weight: number
  evidence: string
}

/**
 * Résultat de classification
 */
export interface ClassificationResult {
  /** Catégorie principale */
  primaryCategory: LegalContentCategory

  /** Domaine juridique */
  domain: LegalDomain | null

  /** Type de document */
  documentType: DocumentNature | null

  /** Score de confiance (0-1) */
  confidenceScore: number

  /** Nécessite validation humaine */
  requiresValidation: boolean

  /** Raison de la validation */
  validationReason: string | null

  /** Classifications alternatives */
  alternatives: Array<{
    category: string
    domain: string | null
    confidence: number
  }>

  /** Mots-clés juridiques détectés */
  legalKeywords: string[]

  /** Source de la classification */
  classificationSource: 'llm' | 'rules' | 'structure' | 'hybrid' | 'cache'

  /** Signaux utilisés */
  signalsUsed: ClassificationSignal[]

  /** Provider LLM utilisé (si applicable) */
  llmProvider?: string

  /** Modèle LLM utilisé (si applicable) */
  llmModel?: string

  /** Tokens utilisés (si LLM) */
  tokensUsed?: number
}

/**
 * Classification en cache
 */
interface CachedClassification {
  primaryCategory: LegalContentCategory
  domain: LegalDomain
  documentType: DocumentNature
  confidenceScore: number
  cachedAt: string
  sourceName: string
}

// =============================================================================
// CONFIGURATION
// =============================================================================

/** Seuil de confiance minimum pour validation automatique */
const CLASSIFICATION_CONFIDENCE_THRESHOLD = parseFloat(
  process.env.CLASSIFICATION_CONFIDENCE_MIN || '0.7'
)

/** Cache activé par défaut */
const ENABLE_CLASSIFICATION_CACHE = process.env.ENABLE_CLASSIFICATION_CACHE !== 'false'

/** TTL cache : 7 jours */
const CLASSIFICATION_CACHE_TTL = parseInt(process.env.CLASSIFICATION_CACHE_TTL || '604800', 10)

/** Seuil pour utiliser cache hit */
const CACHE_CONFIDENCE_MIN = parseFloat(
  process.env.CLASSIFICATION_CACHE_CONFIDENCE_MIN || '0.75'
)

/** Poids des signaux */
const SIGNAL_WEIGHTS = {
  structure: 0.3,
  rules: 0.4,
  keywords: 0.15,
  llm: 0.3,
}

/** Seuil pour activer LLM */
const LLM_ACTIVATION_THRESHOLD = parseFloat(
  process.env.LLM_ACTIVATION_THRESHOLD || '0.6'
)

/** Seuils adaptatifs par domaine */
const ADAPTIVE_THRESHOLDS: Record<string, number> = {
  jurisprudence: 0.65, // Plus permissif (volume élevé)
  legislation: 0.75, // Strict (qualité critique)
  codes: 0.75, // Strict
  doctrine: 0.60, // Très permissif (peu de données)
  modeles: 0.70, // Standard
  actualites: 0.65, // Permissif
  formulaires: 0.70, // Standard
  default: 0.70, // Standard
}

// =============================================================================
// CACHE REDIS
// =============================================================================

/**
 * Génère une clé de cache en normalisant les patterns URL
 *
 * Exemples :
 *   /jurisprudence/123/details → /jurisprudence/{id}/details
 *   /lois/2024/45/texte → /lois/{year}/{id}/texte
 */
function generateCacheKey(url: string, sourceName: string, category: string): string {
  let normalized = url

  // Normaliser URL patterns
  normalized = normalized.replace(/\/\d+\//g, '/{id}/')
  normalized = normalized.replace(/\/\d+$/g, '/{id}')
  normalized = normalized.replace(/\/(19|20)\d{2}\//g, '/{year}/')
  normalized = normalized.replace(/([?&]id=)\d+/g, '$1{id}')
  normalized = normalized.replace(/\/$/, '')

  const hash = createHash('md5')
    .update(`${sourceName}:${category}:${normalized}`)
    .digest('hex')

  return `classification:${hash}`
}

/**
 * Récupère une classification depuis le cache Redis
 */
async function getCachedClassification(key: string): Promise<CachedClassification | null> {
  if (!ENABLE_CLASSIFICATION_CACHE) return null

  try {
    const redis = await getRedisClient()
    if (!redis) return null

    const cached = await redis.get(key)
    if (!cached) return null

    const parsed = JSON.parse(cached) as CachedClassification

    if (!parsed.primaryCategory || !parsed.domain || !parsed.confidenceScore) {
      console.warn('[UnifiedClassification] Cache entry malformed, ignoring:', key)
      return null
    }

    // Vérifier confiance minimum
    if (parsed.confidenceScore < CACHE_CONFIDENCE_MIN) {
      console.log(
        `[UnifiedClassification] Cache hit mais confiance trop basse (${parsed.confidenceScore} < ${CACHE_CONFIDENCE_MIN})`
      )
      return null
    }

    return parsed
  } catch (error) {
    console.error('[UnifiedClassification] Erreur lecture cache:', error)
    return null
  }
}

/**
 * Enregistre une classification dans le cache Redis
 */
async function setCachedClassification(
  key: string,
  classification: CachedClassification,
  ttl: number = CLASSIFICATION_CACHE_TTL
): Promise<void> {
  if (!ENABLE_CLASSIFICATION_CACHE) return

  try {
    const redis = await getRedisClient()
    if (!redis) return

    await redis.set(key, JSON.stringify(classification), { EX: ttl })
  } catch (error) {
    console.error('[UnifiedClassification] Erreur écriture cache:', error)
    // Ne pas throw pour éviter de bloquer le pipeline
  }
}

// =============================================================================
// SEUILS ADAPTATIFS
// =============================================================================

/**
 * Retourne le seuil de confiance adaptatif pour un domaine
 */
function getAdaptiveThreshold(domain: string): number {
  return ADAPTIVE_THRESHOLDS[domain] || ADAPTIVE_THRESHOLDS.default
}

/**
 * Détermine si une classification nécessite validation humaine
 */
function requiresValidation(
  confidenceScore: number,
  domain: string | null,
  signalsUsed: ClassificationSignal[]
): { requiresValidation: boolean; reason: string | null } {
  const threshold = domain ? getAdaptiveThreshold(domain) : ADAPTIVE_THRESHOLDS.default

  if (confidenceScore < threshold) {
    return {
      requiresValidation: true,
      reason: `Confiance ${(confidenceScore * 100).toFixed(0)}% < seuil ${(threshold * 100).toFixed(0)}% pour domaine "${domain || 'unknown'}"`,
    }
  }

  // Vérifier si signaux contradictoires
  const categories = signalsUsed.map((s) => s.category).filter((c) => c !== null)
  const uniqueCategories = new Set(categories)

  if (uniqueCategories.size >= 3) {
    return {
      requiresValidation: true,
      reason: `Signaux contradictoires : ${uniqueCategories.size} catégories différentes détectées`,
    }
  }

  return { requiresValidation: false, reason: null }
}

// =============================================================================
// DÉTECTION MULTI-SIGNAUX
// =============================================================================

/**
 * Détecte la catégorie depuis la structure du site
 * (breadcrumbs, URL, navigation)
 */
function detectFromStructure(filters: ClassificationFilters): ClassificationSignal {
  const { siteStructure, url } = filters

  let category: string | null = null
  let domain: string | null = null
  let confidence = 0
  let evidence = ''

  // Analyse breadcrumbs
  if (siteStructure?.breadcrumbs && siteStructure.breadcrumbs.length > 0) {
    const breadcrumb = siteStructure.breadcrumbs.join(' > ').toLowerCase()

    if (breadcrumb.includes('jurisprudence') || breadcrumb.includes('arrêt') || breadcrumb.includes('قضاء')) {
      category = 'jurisprudence'
      confidence = 0.8
      evidence = `Breadcrumb: ${breadcrumb}`
    } else if (breadcrumb.includes('code') || breadcrumb.includes('مجلة')) {
      category = 'codes'
      confidence = 0.8
      evidence = `Breadcrumb: ${breadcrumb}`
    } else if (breadcrumb.includes('loi') || breadcrumb.includes('législation') || breadcrumb.includes('قانون')) {
      category = 'legislation'
      confidence = 0.8
      evidence = `Breadcrumb: ${breadcrumb}`
    }
  }

  // Analyse URL path
  if (url && !category) {
    const urlLower = url.toLowerCase()

    if (urlLower.includes('/jurisprudence/') || urlLower.includes('/arret/')) {
      category = 'jurisprudence'
      confidence = 0.7
      evidence = `URL path: ${url}`
    } else if (urlLower.includes('/code/') || urlLower.includes('/codes/')) {
      category = 'codes'
      confidence = 0.7
      evidence = `URL path: ${url}`
    } else if (urlLower.includes('/loi/') || urlLower.includes('/legislation/')) {
      category = 'legislation'
      confidence = 0.7
      evidence = `URL path: ${url}`
    }
  }

  return {
    source: 'structure',
    category,
    domain,
    documentType: null,
    confidence,
    weight: SIGNAL_WEIGHTS.structure,
    evidence,
  }
}

/**
 * Détecte la catégorie via mots-clés juridiques
 */
function detectFromKeywords(textContent: string): ClassificationSignal {
  const lowerText = textContent.toLowerCase()

  let category: string | null = null
  let domain: string | null = null
  let confidence = 0
  let evidence = ''

  // Patterns jurisprudence
  const jurisPatterns = ['arrêt', 'décision', 'tribunal', 'cour', 'cassation', 'appel', 'محكمة', 'قرار']
  const jurisMatches = jurisPatterns.filter((p) => lowerText.includes(p))

  if (jurisMatches.length >= 3) {
    category = 'jurisprudence'
    confidence = 0.7
    evidence = `Mots-clés jurisprudence: ${jurisMatches.join(', ')}`
  }

  // Patterns législation
  const legisPatterns = ['loi', 'décret', 'ordonnance', 'arrêté', 'circulaire', 'قانون', 'مرسوم']
  const legisMatches = legisPatterns.filter((p) => lowerText.includes(p))

  if (legisMatches.length >= 2 && !category) {
    category = 'legislation'
    confidence = 0.7
    evidence = `Mots-clés législation: ${legisMatches.join(', ')}`
  }

  // Patterns codes
  if ((lowerText.includes('code') || lowerText.includes('مجلة')) && !category) {
    category = 'codes'
    confidence = 0.6
    evidence = 'Mots-clés codes'
  }

  return {
    source: 'keywords',
    category,
    domain,
    documentType: null,
    confidence,
    weight: SIGNAL_WEIGHTS.keywords,
    evidence,
  }
}

/**
 * Classification via LLM avec fallback
 */
async function classifyWithLLM(
  textContent: string,
  options: ClassificationOptions
): Promise<{ signal: ClassificationSignal; llmProvider: string; llmModel: string; tokensUsed: number }> {
  const truncated = truncateContent(textContent, 2000)

  const prompt = formatPrompt(LEGAL_CLASSIFICATION_USER_PROMPT, {
    content: truncated,
    context: options.context || '',
  })

  const messages: LLMMessage[] = [
    { role: 'system', content: LEGAL_CLASSIFICATION_SYSTEM_PROMPT },
    { role: 'user', content: prompt },
  ]

  try {
    const response = await callLLMWithFallback(messages, {
      temperature: 0.1,
      maxTokens: 500,
      context: 'web-scraping' as AIContext,
    }, false) // Mode rapide (Ollama → cloud)

    // Parser réponse JSON
    const cleanedAnswer = response.answer
      .replace(/```json\n?/g, '')
      .replace(/```\n?/g, '')
      .trim()

    const parsed = JSON.parse(cleanedAnswer) as {
      category: string
      domain?: string
      documentType?: string
      confidence: number
    }

    // Log usage
    await logUsage({
      userId: 'system',
      operationType: 'classification',
      provider: response.provider,
      model: response.modelUsed,
      inputTokens: response.tokensUsed.input,
      outputTokens: response.tokensUsed.output,
    })

    return {
      signal: {
        source: 'llm',
        category: parsed.category,
        domain: parsed.domain || null,
        documentType: parsed.documentType || null,
        confidence: parsed.confidence,
        weight: SIGNAL_WEIGHTS.llm,
        evidence: `LLM classification (${response.provider}/${response.modelUsed})`,
      },
      llmProvider: response.provider,
      llmModel: response.modelUsed,
      tokensUsed: response.tokensUsed.total,
    }
  } catch (error) {
    console.error('[UnifiedClassification] Erreur LLM:', error)

    // Fallback signal avec confiance 0
    return {
      signal: {
        source: 'llm',
        category: null,
        domain: null,
        documentType: null,
        confidence: 0,
        weight: SIGNAL_WEIGHTS.llm,
        evidence: 'LLM failed',
      },
      llmProvider: 'none',
      llmModel: 'none',
      tokensUsed: 0,
    }
  }
}

/**
 * Fusionne les signaux multi-sources avec pondération
 */
function fuseSignals(signals: ClassificationSignal[]): {
  category: string | null
  domain: string | null
  documentType: string | null
  confidenceScore: number
} {
  // Voter par catégorie avec pondération
  const categoryVotes: Record<string, number> = {}

  signals.forEach((signal) => {
    if (signal.category) {
      const weightedConfidence = signal.confidence * signal.weight
      categoryVotes[signal.category] = (categoryVotes[signal.category] || 0) + weightedConfidence
    }
  })

  // Sélectionner catégorie avec plus haut score
  let category: string | null = null
  let maxScore = 0

  Object.entries(categoryVotes).forEach(([cat, score]) => {
    if (score > maxScore) {
      maxScore = score
      category = cat
    }
  })

  // Calculer confiance finale (moyenne pondérée)
  const totalWeight = signals.reduce((sum, s) => sum + s.weight * (s.confidence > 0 ? 1 : 0), 0)
  const weightedSum = signals.reduce((sum, s) => sum + s.confidence * s.weight, 0)
  const confidenceScore = totalWeight > 0 ? weightedSum / totalWeight : 0

  // Domaine et type : prendre celui du signal le plus confiant
  const sortedByConfidence = [...signals].sort((a, b) => b.confidence - a.confidence)
  const domain = sortedByConfidence.find((s) => s.domain)?.domain || null
  const documentType = sortedByConfidence.find((s) => s.documentType)?.documentType || null

  return { category, domain, documentType, confidenceScore }
}

// =============================================================================
// API PUBLIQUE
// =============================================================================

/**
 * Classifie du contenu juridique avec multi-signaux + cache
 *
 * @param filters Filtres de classification (contenu, URL, structure)
 * @param options Options (cache, LLM forcé, provider préféré)
 * @returns Résultat de classification avec signaux
 *
 * @example
 * ```typescript
 * const result = await classify({
 *   sourceName: "9anoun.tn",
 *   url: "/jurisprudence/123/details",
 *   textContent: "Arrêt de la Cour de Cassation...",
 *   siteStructure: {
 *     breadcrumbs: ["Accueil", "Jurisprudence", "Cassation"]
 *   }
 * }, {
 *   useCache: true,
 *   preferredProvider: "ollama"
 * })
 * ```
 */
export async function classify(
  filters: ClassificationFilters,
  options: ClassificationOptions = {}
): Promise<ClassificationResult> {
  const { sourceName = 'unknown', url = '', textContent = '' } = filters
  const { useCache = ENABLE_CLASSIFICATION_CACHE, forceLLM = false } = options

  // 1. Vérifier cache Redis
  if (useCache && url && sourceName) {
    const cacheKey = generateCacheKey(url, sourceName, 'auto')
    const cached = await getCachedClassification(cacheKey)

    if (cached) {
      console.log('[UnifiedClassification] ✓ Cache hit:', url.substring(0, 50))

      return {
        primaryCategory: cached.primaryCategory,
        domain: cached.domain,
        documentType: cached.documentType,
        confidenceScore: cached.confidenceScore,
        requiresValidation: false,
        validationReason: null,
        alternatives: [],
        legalKeywords: [],
        classificationSource: 'cache',
        signalsUsed: [
          {
            source: 'cache',
            category: cached.primaryCategory,
            domain: cached.domain,
            documentType: cached.documentType,
            confidence: cached.confidenceScore,
            weight: 1.0,
            evidence: `Cached at ${cached.cachedAt}`,
          },
        ],
      }
    }
  }

  // 2. Collecter signaux
  const signals: ClassificationSignal[] = []

  // Signal structure
  const structureSignal = detectFromStructure(filters)
  if (structureSignal.confidence > 0) {
    signals.push(structureSignal)
  }

  // Signal keywords
  if (textContent) {
    const keywordsSignal = detectFromKeywords(textContent)
    if (keywordsSignal.confidence > 0) {
      signals.push(keywordsSignal)
    }
  }

  // 3. Fusionner signaux existants
  const { category, domain, documentType, confidenceScore } = fuseSignals(signals)

  // 4. Décider si LLM nécessaire
  const shouldActivateLLM =
    forceLLM || confidenceScore < LLM_ACTIVATION_THRESHOLD || !category

  let llmProvider: string | undefined
  let llmModel: string | undefined
  let tokensUsed: number | undefined

  if (shouldActivateLLM && textContent) {
    console.log(
      `[UnifiedClassification] Activation LLM (confiance ${(confidenceScore * 100).toFixed(0)}% < seuil ${(LLM_ACTIVATION_THRESHOLD * 100).toFixed(0)}%)`
    )

    const llmResult = await classifyWithLLM(textContent, options)
    signals.push(llmResult.signal)

    llmProvider = llmResult.llmProvider
    llmModel = llmResult.llmModel
    tokensUsed = llmResult.tokensUsed

    // Re-fusionner avec signal LLM
    const fusedWithLLM = fuseSignals(signals)
    Object.assign({ category, domain, documentType, confidenceScore }, fusedWithLLM)
  }

  // 5. Vérifier si validation nécessaire
  const { requiresValidation: needsValidation, reason } = requiresValidation(
    confidenceScore,
    domain,
    signals
  )

  // 6. Enregistrer dans le cache (si confiance suffisante)
  if (
    useCache &&
    url &&
    sourceName &&
    category &&
    domain &&
    confidenceScore >= CACHE_CONFIDENCE_MIN
  ) {
    const cacheKey = generateCacheKey(url, sourceName, category)
    await setCachedClassification(cacheKey, {
      primaryCategory: category as LegalContentCategory,
      domain: domain as LegalDomain,
      documentType: (documentType as DocumentNature) || 'autre',
      confidenceScore,
      cachedAt: new Date().toISOString(),
      sourceName,
    })
  }

  // 7. Construire résultat final
  const classificationSource: ClassificationResult['classificationSource'] =
    signals.length > 1 ? 'hybrid' : (signals[0]?.source as 'llm' | 'rules' | 'structure') || 'llm'

  return {
    primaryCategory: (category as LegalContentCategory) || 'autre',
    domain: (domain as LegalDomain) || null,
    documentType: (documentType as DocumentNature) || null,
    confidenceScore,
    requiresValidation: needsValidation,
    validationReason: reason,
    alternatives: [], // TODO: extraire alternatives des signaux
    legalKeywords: [], // TODO: extraire keywords
    classificationSource,
    signalsUsed: signals,
    llmProvider,
    llmModel,
    tokensUsed,
  }
}

/**
 * Classifie plusieurs contenus en batch
 *
 * Optimisé pour traiter plusieurs pages d'un même crawler
 *
 * @param items Contenus à classifier
 * @param options Options communes
 * @returns Résultats de classification
 */
export async function classifyBatch(
  items: ClassificationFilters[],
  options: ClassificationOptions = {}
): Promise<ClassificationResult[]> {
  // Classification parallèle avec limite de concurrence
  const BATCH_SIZE = 5

  const results: ClassificationResult[] = []

  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    const batch = items.slice(i, i + BATCH_SIZE)

    const batchResults = await Promise.all(
      batch.map((item) => classify(item, options))
    )

    results.push(...batchResults)
  }

  return results
}
