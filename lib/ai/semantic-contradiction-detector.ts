/**
 * Service de Détection de Contradictions Sémantiques (Phase 3.2)
 *
 * Utilise NLI (Natural Language Inference) pour détecter les contradictions
 * sémantiques entre sources juridiques, au-delà des contradictions textuelles simples.
 *
 * Pipeline :
 * 1. Comparaison paires sources (limité 25 docs → 300 paires max)
 * 2. NLI inference (entailment/contradiction/neutral)
 * 3. Résolution hiérarchique (Cassation > Appel > Doctrine)
 * 4. Cache Redis contradictions détectées
 *
 * Objectif : Précision >80%, Latence <3s pour 25 docs
 *
 * @module lib/ai/semantic-contradiction-detector
 */

import { callLLMWithFallback } from './llm-fallback-service'
import { getRedisClient, isRedisAvailable, hashKey } from '../cache/redis'

// =============================================================================
// TYPES
// =============================================================================

export interface ContradictionDetectionInput {
  sources: SemanticSource[]
  question?: string
  maxPairs?: number
  useCache?: boolean
  usePremiumModel?: boolean
}

export interface SemanticSource {
  id: string
  content: string
  category: string
  metadata?: {
    tribunalCode?: string
    chambreCode?: string
    decisionDate?: Date
    hierarchyLevel?: number // 1=Cassation, 2=Appel, 3=TPI, 4=Doctrine, 5=Modèles
  }
}

export interface ContradictionPair {
  source1: SemanticSource
  source2: SemanticSource
  nliLabel: 'entailment' | 'contradiction' | 'neutral'
  confidence: number
  description: string
  severity: 'critique' | 'moderate' | 'mineure'
}

export interface HierarchyResolution {
  preferredSource: SemanticSource
  rejectedSource: SemanticSource
  reason: string
  method: 'hierarchy' | 'temporal' | 'context'
  confidence: number
}

export interface ContradictionDetectionOutput {
  contradictions: ContradictionPair[]
  resolutions: HierarchyResolution[]
  stats: {
    totalPairs: number
    contradictionsFound: number
    entailments: number
    neutrals: number
    durationMs: number
    cacheHits: number
  }
}

// =============================================================================
// Configuration
// =============================================================================

const NLI_CONFIG = {
  maxSources: 25, // Limite pour éviter explosion combinatoire
  maxPairs: 300, // (25 * 24) / 2 = 300
  contradictionThreshold: 0.6, // Confiance min pour contradiction
  cacheEnabled: true,
  cacheTTL: 86400, // 24h
  batchSize: 10, // Paires par batch LLM
}

const HIERARCHY_LEVELS = {
  TRIBUNAL_CASSATION: 1,
  COUR_APPEL: 2,
  TRIBUNAL_PREMIERE_INSTANCE: 3,
  DOCTRINE: 4,
  MODELES: 5,
}

// =============================================================================
// FONCTION PRINCIPALE : DÉTECTION CONTRADICTIONS
// =============================================================================

/**
 * Détecte les contradictions sémantiques entre sources juridiques
 *
 * @param input - Sources + Options
 * @returns Contradictions détectées + Résolutions hiérarchiques
 *
 * @example
 * ```ts
 * const result = await detectSemanticContradictions({
 *   sources: [...],
 *   question: 'Peut-on résilier un contrat?',
 *   maxPairs: 50,
 *   useCache: true
 * })
 *
 * console.log(`${result.contradictions.length} contradictions trouvées`)
 * ```
 */
export async function detectSemanticContradictions(
  input: ContradictionDetectionInput
): Promise<ContradictionDetectionOutput> {
  const startTime = Date.now()
  const { sources, maxPairs = NLI_CONFIG.maxPairs, useCache = true, usePremiumModel } = input

  // Limiter nombre de sources
  const limitedSources = sources.slice(0, NLI_CONFIG.maxSources)

  console.log(
    `[ContradictionDetector] Start - ${limitedSources.length} sources (max ${NLI_CONFIG.maxSources})`
  )

  // Générer paires à comparer
  const pairs = generateSourcePairs(limitedSources)
  const limitedPairs = pairs.slice(0, maxPairs)

  console.log(
    `[ContradictionDetector] Pairs to compare: ${limitedPairs.length} (max ${maxPairs})`
  )

  // Détecter contradictions via NLI
  const contradictionResults = await detectContradictionsNLI(
    limitedPairs,
    input.question,
    useCache,
    usePremiumModel
  )

  // Filtrer contradictions significatives (confidence > threshold)
  const contradictions = contradictionResults.pairs.filter(
    p => p.nliLabel === 'contradiction' && p.confidence >= NLI_CONFIG.contradictionThreshold
  )

  console.log(
    `[ContradictionDetector] Contradictions found: ${contradictions.length}/${limitedPairs.length} pairs`
  )

  // Résoudre contradictions via hiérarchie
  const resolutions = resolveContradictionsHierarchy(contradictions)

  const durationMs = Date.now() - startTime

  return {
    contradictions,
    resolutions,
    stats: {
      totalPairs: limitedPairs.length,
      contradictionsFound: contradictions.length,
      entailments: contradictionResults.pairs.filter(p => p.nliLabel === 'entailment').length,
      neutrals: contradictionResults.pairs.filter(p => p.nliLabel === 'neutral').length,
      durationMs,
      cacheHits: contradictionResults.cacheHits,
    },
  }
}

// =============================================================================
// GÉNÉRATION PAIRES
// =============================================================================

/**
 * Génère toutes les paires possibles de sources à comparer
 * Complexité : O(n²/2) où n = nombre de sources
 */
function generateSourcePairs(
  sources: SemanticSource[]
): Array<{ source1: SemanticSource; source2: SemanticSource }> {
  const pairs: Array<{ source1: SemanticSource; source2: SemanticSource }> = []

  for (let i = 0; i < sources.length; i++) {
    for (let j = i + 1; j < sources.length; j++) {
      pairs.push({
        source1: sources[i],
        source2: sources[j],
      })
    }
  }

  return pairs
}

// =============================================================================
// NLI INFERENCE
// =============================================================================

/**
 * Détecte contradictions via NLI (Natural Language Inference)
 *
 * Utilise LLM pour classifier la relation entre paires :
 * - entailment : source1 implique source2 (cohérent)
 * - contradiction : source1 contredit source2 (incohérent)
 * - neutral : pas de relation claire
 */
async function detectContradictionsNLI(
  pairs: Array<{ source1: SemanticSource; source2: SemanticSource }>,
  question: string | undefined,
  useCache: boolean,
  usePremiumModel?: boolean
): Promise<{
  pairs: ContradictionPair[]
  cacheHits: number
}> {
  const results: ContradictionPair[] = []
  let cacheHits = 0

  // Traiter par batch pour optimiser
  for (let i = 0; i < pairs.length; i += NLI_CONFIG.batchSize) {
    const batch = pairs.slice(i, i + NLI_CONFIG.batchSize)

    // Vérifier cache pour chaque paire
    const batchResults = await Promise.all(
      batch.map(async pair => {
        // Vérifier cache
        if (useCache) {
          const cached = await getCachedNLI(pair.source1.id, pair.source2.id)
          if (cached) {
            cacheHits++
            return cached
          }
        }

        // Inférence NLI via LLM
        const nliResult = await inferNLI(pair, question, usePremiumModel)

        // Stocker en cache
        if (useCache) {
          await setCachedNLI(pair.source1.id, pair.source2.id, nliResult)
        }

        return nliResult
      })
    )

    results.push(...batchResults)

    console.log(
      `[ContradictionDetector] Batch ${Math.floor(i / NLI_CONFIG.batchSize) + 1}/${Math.ceil(pairs.length / NLI_CONFIG.batchSize)} complete`
    )
  }

  return { pairs: results, cacheHits }
}

/**
 * Inférence NLI via LLM
 */
async function inferNLI(
  pair: { source1: SemanticSource; source2: SemanticSource },
  question: string | undefined,
  usePremiumModel?: boolean
): Promise<ContradictionPair> {
  const prompt = buildNLIPrompt(pair, question)

  try {
    const response = await callLLMWithFallback(
      [
        { role: 'system', content: getNLISystemPrompt() },
        { role: 'user', content: prompt },
      ],
      {
        temperature: 0.1, // Précision maximale
        maxTokens: 500,
        usePremiumModel,
      }
    )

    const parsed = parseNLIResponse(response.answer)

    return {
      source1: pair.source1,
      source2: pair.source2,
      nliLabel: parsed.label,
      confidence: parsed.confidence,
      description: parsed.description,
      severity: parsed.severity,
    }
  } catch (error) {
    console.error('[ContradictionDetector] NLI inference error:', error)
    // Fallback : neutral avec confiance basse
    return {
      source1: pair.source1,
      source2: pair.source2,
      nliLabel: 'neutral',
      confidence: 0.3,
      description: 'Erreur analyse NLI',
      severity: 'mineure',
    }
  }
}

function getNLISystemPrompt(): string {
  return `Tu es un expert juridique spécialisé en analyse de contradictions juridiques.

Ta mission : Classifier la relation entre deux sources juridiques.

Classes possibles :
- **entailment** : Source 1 implique Source 2 (cohérent, compatible)
- **contradiction** : Source 1 contredit Source 2 (incohérent, incompatible)
- **neutral** : Pas de relation claire (indépendant)

Sois précis et objectif. Réponds au format JSON.`
}

function buildNLIPrompt(
  pair: { source1: SemanticSource; source2: SemanticSource },
  question: string | undefined
): string {
  return `${question ? `Question : ${question}\n\n` : ''}Analyse la relation entre ces deux sources juridiques :

**Source 1** (${pair.source1.id}, ${pair.source1.category}) :
${pair.source1.content.substring(0, 600)}...

**Source 2** (${pair.source2.id}, ${pair.source2.category}) :
${pair.source2.content.substring(0, 600)}...

Réponds au format JSON :

{
  "label": "entailment|contradiction|neutral",
  "confidence": 0.85,
  "description": "Brève explication de la relation",
  "severity": "critique|moderate|mineure"
}`
}

function parseNLIResponse(response: string): {
  label: 'entailment' | 'contradiction' | 'neutral'
  confidence: number
  description: string
  severity: 'critique' | 'moderate' | 'mineure'
} {
  try {
    const jsonMatch = response.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error('No JSON found')

    const parsed = JSON.parse(jsonMatch[0])

    return {
      label: parsed.label || 'neutral',
      confidence: parsed.confidence || 0.5,
      description: parsed.description || '',
      severity: parsed.severity || 'mineure',
    }
  } catch (error) {
    console.error('[ContradictionDetector] NLI parsing error:', error)
    return {
      label: 'neutral',
      confidence: 0.3,
      description: 'Erreur parsing',
      severity: 'mineure',
    }
  }
}

// =============================================================================
// RÉSOLUTION HIÉRARCHIQUE
// =============================================================================

/**
 * Résout contradictions via hiérarchie juridique
 *
 * Règles :
 * 1. Cassation > Appel > TPI > Doctrine > Modèles
 * 2. Si même niveau : Plus récent > Plus ancien
 * 3. Si même niveau + même date : Contexte spécifique
 */
function resolveContradictionsHierarchy(
  contradictions: ContradictionPair[]
): HierarchyResolution[] {
  return contradictions.map(c => {
    const level1 = getHierarchyLevel(c.source1)
    const level2 = getHierarchyLevel(c.source2)

    // Résolution par hiérarchie
    if (level1 < level2) {
      return {
        preferredSource: c.source1,
        rejectedSource: c.source2,
        reason: `Hiérarchie : ${getTribunalName(c.source1)} > ${getTribunalName(c.source2)}`,
        method: 'hierarchy',
        confidence: 0.9,
      }
    } else if (level2 < level1) {
      return {
        preferredSource: c.source2,
        rejectedSource: c.source1,
        reason: `Hiérarchie : ${getTribunalName(c.source2)} > ${getTribunalName(c.source1)}`,
        method: 'hierarchy',
        confidence: 0.9,
      }
    }

    // Même niveau : résolution temporelle
    const date1 = c.source1.metadata?.decisionDate?.getTime() || 0
    const date2 = c.source2.metadata?.decisionDate?.getTime() || 0

    if (date1 > date2) {
      return {
        preferredSource: c.source1,
        rejectedSource: c.source2,
        reason: 'Source plus récente (même niveau hiérarchique)',
        method: 'temporal',
        confidence: 0.75,
      }
    } else if (date2 > date1) {
      return {
        preferredSource: c.source2,
        rejectedSource: c.source1,
        reason: 'Source plus récente (même niveau hiérarchique)',
        method: 'temporal',
        confidence: 0.75,
      }
    }

    // Même niveau + même date : contexte
    return {
      preferredSource: c.source1,
      rejectedSource: c.source2,
      reason: 'Contexte spécifique requis (même hiérarchie + même date)',
      method: 'context',
      confidence: 0.5,
    }
  })
}

function getHierarchyLevel(source: SemanticSource): number {
  if (source.metadata?.hierarchyLevel) {
    return source.metadata.hierarchyLevel
  }

  const tribunal = source.metadata?.tribunalCode || ''

  if (tribunal.includes('CASSATION')) return HIERARCHY_LEVELS.TRIBUNAL_CASSATION
  if (tribunal.includes('APPEL')) return HIERARCHY_LEVELS.COUR_APPEL
  if (tribunal.includes('PREMIERE')) return HIERARCHY_LEVELS.TRIBUNAL_PREMIERE_INSTANCE

  if (source.category === 'doctrine') return HIERARCHY_LEVELS.DOCTRINE
  if (source.category === 'modeles') return HIERARCHY_LEVELS.MODELES

  return HIERARCHY_LEVELS.DOCTRINE // Défaut
}

function getTribunalName(source: SemanticSource): string {
  const tribunal = source.metadata?.tribunalCode || source.category
  if (tribunal.includes('CASSATION')) return 'Cour de Cassation'
  if (tribunal.includes('APPEL')) return "Cour d'Appel"
  if (tribunal.includes('PREMIERE')) return 'Tribunal de Première Instance'
  if (tribunal === 'doctrine') return 'Doctrine'
  return 'Source'
}

// =============================================================================
// CACHE REDIS
// =============================================================================

/**
 * Récupère résultat NLI depuis cache Redis
 */
async function getCachedNLI(
  source1Id: string,
  source2Id: string
): Promise<ContradictionPair | null> {
  if (!isRedisAvailable() || !NLI_CONFIG.cacheEnabled) return null

  try {
    const client = await getRedisClient()
    if (!client) return null

    const key = await getNLICacheKey(source1Id, source2Id)
    const cached = await client.get(key)

    if (!cached) return null

    return JSON.parse(cached) as ContradictionPair
  } catch (error) {
    console.warn('[ContradictionDetector] Cache read error:', error)
    return null
  }
}

/**
 * Stocke résultat NLI en cache Redis
 */
async function setCachedNLI(
  source1Id: string,
  source2Id: string,
  result: ContradictionPair
): Promise<void> {
  if (!isRedisAvailable() || !NLI_CONFIG.cacheEnabled) return

  try {
    const client = await getRedisClient()
    if (!client) return

    const key = await getNLICacheKey(source1Id, source2Id)
    await client.setEx(key, NLI_CONFIG.cacheTTL, JSON.stringify(result))
  } catch (error) {
    console.warn('[ContradictionDetector] Cache write error:', error)
  }
}

/**
 * Génère clé cache (ordre indépendant : id1 + id2 = id2 + id1)
 */
async function getNLICacheKey(source1Id: string, source2Id: string): Promise<string> {
  const sorted = [source1Id, source2Id].sort()
  const hash = await hashKey(sorted.join(':'))
  return `nli:${hash}`
}

// =============================================================================
// EXPORTS
// =============================================================================

export { detectSemanticContradictions as default }
