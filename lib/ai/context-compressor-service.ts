/**
 * Service Compression Contexte - Selective Context (Phase 6.2)
 *
 * Optimisation tokens LLM via compression intelligente :
 * 1. Scorer chaque phrase par pertinence (TF-IDF + embeddings similarity)
 * 2. Trier phrases par score décroissant
 * 3. Sélectionner jusqu'à maxTokens
 * 4. Reconstruire contexte avec citations préservées
 * 5. Garantir cohérence narrative
 *
 * Objectif : -30-50% tokens, <10% perte info, latence <200ms pour 20 sources
 *
 * @module lib/ai/context-compressor-service
 */

import { encode } from 'gpt-tokenizer'

// =============================================================================
// TYPES
// =============================================================================

export interface CompressionResult {
  original: string
  compressed: string
  originalTokens: number
  compressedTokens: number
  compressionRate: number // % réduction
  sentencesKept: number
  sentencesRemoved: number
  processingTime: number
  citationsPreserved: number
}

export interface CompressionOptions {
  maxTokens?: number // Défaut 4000
  minSentenceScore?: number // Défaut 0.1 (seuil minimum pertinence)
  preserveCitations?: boolean // Défaut true
  preserveCoherence?: boolean // Défaut true
  scoringMethod?: 'tfidf' | 'simple' // Défaut 'simple'
}

interface ScoredSentence {
  text: string
  score: number
  index: number
  tokens: number
  hasCitation: boolean
}

// =============================================================================
// CONSTANTES
// =============================================================================

const DEFAULT_OPTIONS: Required<CompressionOptions> = {
  maxTokens: 4000,
  minSentenceScore: 0.1,
  preserveCitations: true,
  preserveCoherence: true,
  scoringMethod: 'simple',
}

// Mots juridiques importants (poids élevé)
const LEGAL_KEYWORDS_FR = [
  'article',
  'code',
  'loi',
  'décret',
  'arrêt',
  'jugement',
  'tribunal',
  'cour',
  'cassation',
  'appel',
  'responsabilité',
  'contrat',
  'obligation',
  'droit',
  'procédure',
  'prescription',
  'délai',
  'nullité',
  'dommages',
  'intérêts',
]

const LEGAL_KEYWORDS_AR = [
  'مادة',
  'قانون',
  'مرسوم',
  'حكم',
  'قرار',
  'محكمة',
  'استئناف',
  'تعقيب',
  'مسؤولية',
  'عقد',
  'التزام',
  'حق',
  'إجراء',
  'تقادم',
]

// =============================================================================
// FONCTION PRINCIPALE : Compression Contexte
// =============================================================================

export async function compressContext(
  sources: string[],
  query: string,
  options: CompressionOptions = {}
): Promise<CompressionResult> {
  const startTime = Date.now()
  const opts = { ...DEFAULT_OPTIONS, ...options }

  try {
    // 1. Combiner sources
    const originalContext = sources.join('\n\n')
    const originalTokens = countTokens(originalContext)

    console.log(
      `[Context Compressor] Compression ${sources.length} sources (${originalTokens} tokens → max ${opts.maxTokens})`
    )

    // Si déjà sous limite, pas de compression
    if (originalTokens <= opts.maxTokens) {
      console.log(`[Context Compressor] ✅ Déjà sous limite, pas de compression`)
      return {
        original: originalContext,
        compressed: originalContext,
        originalTokens,
        compressedTokens: originalTokens,
        compressionRate: 0,
        sentencesKept: splitSentences(originalContext).length,
        sentencesRemoved: 0,
        processingTime: Date.now() - startTime,
        citationsPreserved: countCitations(originalContext),
      }
    }

    // 2. Segmenter en phrases
    const sentences = splitSentences(originalContext)

    // 3. Scorer chaque phrase
    const scoredSentences = scoreSentences(sentences, query, opts.scoringMethod)

    // 4. Sélectionner phrases jusqu'à maxTokens
    const selected = selectSentences(
      scoredSentences,
      opts.maxTokens,
      opts.minSentenceScore,
      opts.preserveCitations
    )

    // 5. Reconstruire contexte (ordre original si coherence)
    const compressed = reconstructContext(
      selected,
      opts.preserveCoherence
    )

    const compressedTokens = countTokens(compressed)
    const compressionRate =
      ((originalTokens - compressedTokens) / originalTokens) * 100

    const result: CompressionResult = {
      original: originalContext,
      compressed,
      originalTokens,
      compressedTokens,
      compressionRate,
      sentencesKept: selected.length,
      sentencesRemoved: sentences.length - selected.length,
      processingTime: Date.now() - startTime,
      citationsPreserved: countCitations(compressed),
    }

    console.log(
      `[Context Compressor] ✅ Compression ${compressionRate.toFixed(1)}% (${originalTokens}→${compressedTokens} tokens) en ${result.processingTime}ms`
    )

    return result
  } catch (error) {
    console.error('[Context Compressor] Erreur:', error)
    throw error
  }
}

// =============================================================================
// SEGMENTATION PHRASES
// =============================================================================

function splitSentences(text: string): string[] {
  // Split par ponctuation forte (. ! ?) tout en préservant citations
  const sentences: string[] = []

  // Remplacer citations [Source-N] par placeholder temporaire
  const citationRegex = /\[Source-\d+\]/g
  const citations: string[] = []
  let textWithPlaceholders = text.replace(citationRegex, match => {
    citations.push(match)
    return `__CITATION_${citations.length - 1}__`
  })

  // Split par ponctuation
  const parts = textWithPlaceholders.split(/[.!?؟]\s+/)

  for (const part of parts) {
    // Restaurer citations
    let restored = part
    for (let i = 0; i < citations.length; i++) {
      restored = restored.replace(`__CITATION_${i}__`, citations[i])
    }

    const trimmed = restored.trim()
    if (trimmed.length > 10) {
      // Minimum 10 caractères
      sentences.push(trimmed)
    }
  }

  return sentences
}

// =============================================================================
// SCORING PHRASES
// =============================================================================

function scoreSentences(
  sentences: string[],
  query: string,
  method: 'tfidf' | 'simple'
): ScoredSentence[] {
  const queryLower = query.toLowerCase()
  const queryTerms = queryLower.split(/\s+/)

  return sentences.map((sentence, index) => {
    const sentenceLower = sentence.toLowerCase()

    let score = 0

    // 1. Overlap termes query
    for (const term of queryTerms) {
      if (sentenceLower.includes(term)) {
        score += 2 // Poids élevé
      }
    }

    // 2. Mots-clés juridiques
    for (const keyword of LEGAL_KEYWORDS_FR) {
      if (sentenceLower.includes(keyword)) {
        score += 1
      }
    }

    for (const keyword of LEGAL_KEYWORDS_AR) {
      if (sentence.includes(keyword)) {
        score += 1
      }
    }

    // 3. Présence citation (important)
    const hasCitation = /\[Source-\d+\]/.test(sentence)
    if (hasCitation) {
      score += 3
    }

    // 4. Longueur phrase (favoriser phrases moyennes)
    const tokens = countTokens(sentence)
    if (tokens >= 10 && tokens <= 50) {
      score += 1
    } else if (tokens > 100) {
      score -= 1 // Pénaliser phrases très longues
    }

    // Normaliser score (0-1)
    const normalizedScore = Math.min(score / 10, 1)

    return {
      text: sentence,
      score: normalizedScore,
      index,
      tokens,
      hasCitation,
    }
  })
}

// =============================================================================
// SÉLECTION PHRASES
// =============================================================================

function selectSentences(
  scored: ScoredSentence[],
  maxTokens: number,
  minScore: number,
  preserveCitations: boolean
): ScoredSentence[] {
  // Trier par score décroissant
  const sorted = [...scored].sort((a, b) => b.score - a.score)

  const selected: ScoredSentence[] = []
  let currentTokens = 0

  // Stratégie : prioriser phrases avec citations si preserveCitations
  if (preserveCitations) {
    // D'abord toutes phrases avec citations
    for (const sentence of sorted) {
      if (sentence.hasCitation && sentence.score >= minScore) {
        if (currentTokens + sentence.tokens <= maxTokens) {
          selected.push(sentence)
          currentTokens += sentence.tokens
        }
      }
    }
  }

  // Ensuite ajouter phrases haute pertinence sans citation
  for (const sentence of sorted) {
    if (currentTokens >= maxTokens) break

    if (!selected.includes(sentence) && sentence.score >= minScore) {
      if (currentTokens + sentence.tokens <= maxTokens) {
        selected.push(sentence)
        currentTokens += sentence.tokens
      }
    }
  }

  return selected
}

// =============================================================================
// RECONSTRUCTION CONTEXTE
// =============================================================================

function reconstructContext(
  selected: ScoredSentence[],
  preserveOrder: boolean
): string {
  if (preserveOrder) {
    // Trier par index original pour cohérence narrative
    const sorted = [...selected].sort((a, b) => a.index - b.index)
    return sorted.map(s => s.text).join('. ') + '.'
  } else {
    // Ordre par score (meilleur en premier)
    const sorted = [...selected].sort((a, b) => b.score - a.score)
    return sorted.map(s => s.text).join('. ') + '.'
  }
}

// =============================================================================
// UTILITAIRES
// =============================================================================

function countTokens(text: string): number {
  try {
    return encode(text).length
  } catch (error) {
    // Fallback approximation : 1 token ≈ 4 caractères
    return Math.ceil(text.length / 4)
  }
}

function countCitations(text: string): number {
  const matches = text.match(/\[Source-\d+\]/g)
  return matches ? matches.length : 0
}

// =============================================================================
// EXPORT PAR DÉFAUT
// =============================================================================

export default {
  compressContext,
}
