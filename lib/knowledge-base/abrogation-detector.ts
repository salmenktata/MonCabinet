/**
 * Service de détection des lois abrogées/modifiées
 *
 * Objectif : Réduire l'alerte "Détection Abrogations: 0.0%" en production
 *
 * Fonctionnalités :
 * 1. Détecter mentions abrogations dans textes juridiques
 * 2. Extraire métadonnées structurées (date, référence)
 * 3. Valider validité documents avant citation
 * 4. Enrichir KB avec statut juridique
 *
 * @module lib/knowledge-base/abrogation-detector
 */

import { callLLMWithFallback } from '@/lib/ai/llm-fallback-service'
import { query } from '@/lib/db/postgres'

// =============================================================================
// TYPES
// =============================================================================

/**
 * Statut juridique d'un document
 */
export type LegalStatus =
  | 'active'          // En vigueur
  | 'abrogated'       // Abrogé totalement
  | 'modified'        // Modifié partiellement
  | 'suspended'       // Suspendu temporairement
  | 'unknown'         // Statut inconnu

/**
 * Métadonnées d'abrogation/modification
 */
export interface AbrogationMetadata {
  status: LegalStatus
  abrogatedBy?: string        // Référence du texte abrogatoire
  abrogationDate?: string     // Date d'abrogation (ISO 8601)
  modifiedBy?: string[]       // Références des textes modificatifs
  modificationDates?: string[] // Dates de modifications
  partialAbrogation?: string  // Articles/sections abrogés
  notes?: string              // Notes complémentaires
  confidence: number          // Confiance de la détection (0-1)
}

/**
 * Résultat d'extraction abrogation
 */
export interface AbrogationExtractionResult {
  found: boolean
  metadata: AbrogationMetadata
  extractedText: string       // Texte source de l'extraction
  method: 'regex' | 'llm' | 'hybrid'
}

// =============================================================================
// PATTERNS DÉTECTION
// =============================================================================

/**
 * Patterns regex pour détecter mentions abrogations (FR/AR)
 */
const ABROGATION_PATTERNS = {
  // Français
  abrogated_fr: [
    /(?:est\s+)?abrog[ée]e?\s+par\s+(?:la\s+)?loi\s+n°\s*(\d+-\d+)\s+du\s+(\d{1,2}[/-]\d{1,2}[/-]\d{4})/gi,
    /(?:est\s+)?abrog[ée]e?\s+(?:à\s+compter\s+du|depuis\s+le)\s+(\d{1,2}[/-]\d{1,2}[/-]\d{4})/gi,
    /(?:présente?\s+loi|présent\s+décret)\s+abroge/gi,
    /les\s+dispositions\s+(?:de\s+)?l['']article\s+(\d+)\s+sont\s+abrog[ée]es/gi,
  ],

  // Arabe
  abrogated_ar: [
    /(?:تم\s+)?(?:إلغاء|ألغي)\s+(?:بمقتضى|بموجب)\s+(?:القانون|الأمر)\s+عدد\s*(\d+)/gu,
    /(?:تم\s+)?(?:إلغاء|ألغي)\s+(?:ابتداء\s+من|منذ)\s+تاريخ/gu,
    /(?:يلغى|تلغى)\s+(?:هذا\s+)?(?:القانون|الأمر|الفصل)/gu,
  ],

  // Modifications
  modified_fr: [
    /modifi[ée]e?\s+par\s+(?:la\s+)?loi\s+n°\s*(\d+-\d+)\s+du\s+(\d{1,2}[/-]\d{1,2}[/-]\d{4})/gi,
    /(?:est\s+)?(?:modifi[ée]|chang[ée]|amend[ée])e?\s+comme\s+suit/gi,
    /complét[ée]e?\s+par/gi,
  ],

  modified_ar: [
    /(?:تم\s+)?(?:تنقيح|نقح)\s+(?:بمقتضى|بموجب)\s+(?:القانون|الأمر)\s+عدد\s*(\d+)/gu,
    /(?:ينقح|تنقح)\s+(?:هذا\s+)?(?:القانون|الأمر|الفصل)/gu,
  ],

  // Suspension
  suspended_fr: [
    /suspendu[e]?\s+(?:temporairement\s+)?(?:jusqu['']au|du)/gi,
  ],

  suspended_ar: [
    /(?:معلق|موقوف)\s+(?:مؤقتا|إلى\s+حين)/gu,
  ],
}

// =============================================================================
// DÉTECTION REGEX (RAPIDE)
// =============================================================================

/**
 * Détecte abrogations via patterns regex
 * Rapide mais moins précis que LLM
 */
export function detectAbrogationRegex(text: string): AbrogationExtractionResult {
  const result: AbrogationExtractionResult = {
    found: false,
    metadata: {
      status: 'unknown',
      confidence: 0,
    },
    extractedText: '',
    method: 'regex',
  }

  // Chercher abrogations
  for (const pattern of [...ABROGATION_PATTERNS.abrogated_fr, ...ABROGATION_PATTERNS.abrogated_ar]) {
    const match = pattern.exec(text)
    if (match) {
      result.found = true
      result.metadata.status = 'abrogated'
      result.metadata.confidence = 0.7 // Confiance moyenne pour regex
      result.extractedText = match[0]

      // Extraire référence abrogatoire si capturée
      if (match[1]) {
        result.metadata.abrogatedBy = match[1]
      }

      // Extraire date si capturée
      if (match[2]) {
        result.metadata.abrogationDate = normalizeDate(match[2])
      }

      break
    }
  }

  // Si pas abrogé, chercher modifications
  if (!result.found) {
    for (const pattern of [...ABROGATION_PATTERNS.modified_fr, ...ABROGATION_PATTERNS.modified_ar]) {
      const match = pattern.exec(text)
      if (match) {
        result.found = true
        result.metadata.status = 'modified'
        result.metadata.confidence = 0.6
        result.extractedText = match[0]

        if (match[1]) {
          result.metadata.modifiedBy = [match[1]]
        }

        if (match[2]) {
          result.metadata.modificationDates = [normalizeDate(match[2])]
        }

        break
      }
    }
  }

  // Si pas abrogé ni modifié, chercher suspension
  if (!result.found) {
    for (const pattern of [...ABROGATION_PATTERNS.suspended_fr, ...ABROGATION_PATTERNS.suspended_ar]) {
      if (pattern.test(text)) {
        result.found = true
        result.metadata.status = 'suspended'
        result.metadata.confidence = 0.5
        result.extractedText = text.match(pattern)?.[0] || ''
        break
      }
    }
  }

  // Si rien détecté, considérer comme actif (avec faible confiance)
  if (!result.found) {
    result.metadata.status = 'active'
    result.metadata.confidence = 0.3 // Faible confiance car pas de preuve explicite
  }

  return result
}

// =============================================================================
// DÉTECTION LLM (PRÉCIS)
// =============================================================================

/**
 * Prompt pour extraction abrogations par LLM
 */
const ABROGATION_EXTRACTION_PROMPT = `Tu es un expert juridique tunisien spécialisé dans l'analyse de textes législatifs.

Ta mission : Extraire les informations d'abrogation/modification d'un texte juridique.

Analyse le texte fourni et retourne un JSON structuré avec :

\`\`\`json
{
  "status": "active" | "abrogated" | "modified" | "suspended" | "unknown",
  "abrogatedBy": "Référence du texte abrogatoire (ex: Loi n° 2023-45)",
  "abrogationDate": "Date ISO 8601 (YYYY-MM-DD)",
  "modifiedBy": ["Références des textes modificatifs"],
  "modificationDates": ["Dates ISO 8601"],
  "partialAbrogation": "Articles/sections abrogés (si partiel)",
  "notes": "Informations complémentaires",
  "confidence": 0.0-1.0
}
\`\`\`

**Règles** :
- Si AUCUNE mention abrogation/modification → status="active", confidence=0.9
- Si mention EXPLICITE abrogation totale → status="abrogated", confidence=0.95
- Si modification partielle → status="modified", confidence=0.9
- Si suspension temporaire → status="suspended"
- Si incertain → status="unknown", confidence=0.3
- Extraire TOUJOURS dates et références si présentes
- Supporter français ET arabe

**NE retourne QUE le JSON, sans explication.**`

/**
 * Détecte abrogations via LLM (précis mais lent)
 */
export async function detectAbrogationLLM(
  text: string,
  documentTitle?: string
): Promise<AbrogationExtractionResult> {
  try {
    // Limiter le texte analysé (premiers 2000 caractères souvent suffisants)
    const truncatedText = text.slice(0, 2000)

    const prompt = `${ABROGATION_EXTRACTION_PROMPT}

**Texte juridique à analyser** :
${documentTitle ? `Titre: ${documentTitle}\n\n` : ''}${truncatedText}`

    const response = await callLLMWithFallback(
      [{ role: 'user', content: prompt }],
      {
        operationName: 'kb-quality-analysis',
        temperature: 0.1, // Très factuel
        maxTokens: 1000,
      },
      false // Mode Rapide (non premium)
    )

    // Parser la réponse JSON
    const jsonMatch = response.answer.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      throw new Error('LLM response is not valid JSON')
    }

    const metadata = JSON.parse(jsonMatch[0]) as AbrogationMetadata

    return {
      found: metadata.status !== 'active' && metadata.status !== 'unknown',
      metadata,
      extractedText: truncatedText,
      method: 'llm',
    }
  } catch (error) {
    console.error('[Abrogation LLM] Erreur:', error)

    // Fallback sur regex en cas d'erreur LLM
    return {
      ...detectAbrogationRegex(text),
      method: 'regex', // Indique qu'on a fallback
    }
  }
}

// =============================================================================
// DÉTECTION HYBRIDE (OPTIMAL)
// =============================================================================

/**
 * Détection hybride : Regex rapide + LLM si incertain
 *
 * Stratégie :
 * 1. Essayer regex d'abord (rapide, 0 coût)
 * 2. Si confiance <0.7 → Valider avec LLM
 * 3. Combiner résultats pour meilleure précision
 */
export async function detectAbrogation(
  text: string,
  documentTitle?: string,
  options: {
    useLLM?: boolean          // Forcer LLM (défaut: auto)
    minConfidence?: number    // Seuil confiance (défaut: 0.7)
  } = {}
): Promise<AbrogationExtractionResult> {
  const { useLLM = 'auto', minConfidence = 0.7 } = options

  // 1. Détection regex rapide
  const regexResult = detectAbrogationRegex(text)

  // 2. Si confiance suffisante ou LLM désactivé → retourner regex
  if (useLLM === false || (useLLM === 'auto' && regexResult.metadata.confidence >= minConfidence)) {
    return regexResult
  }

  // 3. Validation LLM si confiance faible
  const llmResult = await detectAbrogationLLM(text, documentTitle)

  // 4. Combiner résultats (LLM prioritaire mais garder infos regex)
  return {
    found: llmResult.found,
    metadata: {
      ...regexResult.metadata,
      ...llmResult.metadata,
      confidence: Math.max(regexResult.metadata.confidence, llmResult.metadata.confidence),
    },
    extractedText: llmResult.extractedText || regexResult.extractedText,
    method: 'hybrid',
  }
}

// =============================================================================
// ENRICHISSEMENT KB
// =============================================================================

/**
 * Enrichit un document KB avec métadonnées abrogation
 */
export async function enrichDocumentWithAbrogation(
  documentId: string,
  text: string,
  title?: string
): Promise<AbrogationExtractionResult> {
  const result = await detectAbrogation(text, title)

  // Sauvegarder en DB si trouvé
  if (result.found && result.metadata.status !== 'active') {
    await query(
      `UPDATE knowledge_base
       SET metadata = COALESCE(metadata, '{}'::jsonb) || $1::jsonb,
           updated_at = NOW()
       WHERE id = $2`,
      [
        JSON.stringify({
          abrogation: result.metadata,
          abrogation_detected_at: new Date().toISOString(),
        }),
        documentId,
      ]
    )

    console.log(`[Abrogation] Document ${documentId} enrichi: ${result.metadata.status}`)
  }

  return result
}

/**
 * Valide qu'un document est actif avant citation
 * Retourne false si document abrogé
 */
export async function validateDocumentActive(documentId: string): Promise<{
  isActive: boolean
  reason?: string
  metadata?: AbrogationMetadata
}> {
  const result = await query(
    `SELECT metadata FROM knowledge_base WHERE id = $1`,
    [documentId]
  )

  if (result.rows.length === 0) {
    return { isActive: false, reason: 'Document non trouvé' }
  }

  const metadata = result.rows[0].metadata
  const abrogationMeta = metadata?.abrogation as AbrogationMetadata | undefined

  if (!abrogationMeta) {
    return { isActive: true } // Pas de métadonnées = considéré actif
  }

  if (abrogationMeta.status === 'abrogated') {
    return {
      isActive: false,
      reason: `Document abrogé ${abrogationMeta.abrogatedBy ? `par ${abrogationMeta.abrogatedBy}` : ''} ${abrogationMeta.abrogationDate ? `le ${abrogationMeta.abrogationDate}` : ''}`,
      metadata: abrogationMeta,
    }
  }

  if (abrogationMeta.status === 'suspended') {
    return {
      isActive: false,
      reason: 'Document suspendu temporairement',
      metadata: abrogationMeta,
    }
  }

  // Modifié = toujours citable, mais attention
  return { isActive: true, metadata: abrogationMeta }
}

// =============================================================================
// BATCH PROCESSING
// =============================================================================

/**
 * Traite tous les documents KB pour détecter abrogations
 * Utilisé pour enrichissement initial ou mise à jour
 */
export async function batchDetectAbrogations(
  options: {
    limit?: number
    offset?: number
    category?: string
  } = {}
): Promise<{
  processed: number
  abrogated: number
  modified: number
  suspended: number
  errors: number
}> {
  const { limit = 100, offset = 0, category } = options

  const stats = {
    processed: 0,
    abrogated: 0,
    modified: 0,
    suspended: 0,
    errors: 0,
  }

  // Récupérer documents à traiter
  const result = await query(
    `SELECT id, title, full_text
     FROM knowledge_base
     WHERE is_indexed = true
       ${category ? 'AND category = $3' : ''}
     ORDER BY created_at DESC
     LIMIT $1 OFFSET $2`,
    category ? [limit, offset, category] : [limit, offset]
  )

  for (const doc of result.rows) {
    try {
      const detection = await enrichDocumentWithAbrogation(
        doc.id,
        doc.full_text || '',
        doc.title
      )

      stats.processed++

      if (detection.metadata.status === 'abrogated') stats.abrogated++
      else if (detection.metadata.status === 'modified') stats.modified++
      else if (detection.metadata.status === 'suspended') stats.suspended++
    } catch (error) {
      console.error(`[Batch Abrogation] Erreur doc ${doc.id}:`, error)
      stats.errors++
    }
  }

  console.log('[Batch Abrogation] Stats:', stats)
  return stats
}

// =============================================================================
// UTILITAIRES
// =============================================================================

/**
 * Normalise une date au format ISO 8601
 */
function normalizeDate(dateStr: string): string {
  // Convertir dd/mm/yyyy ou dd-mm-yyyy → yyyy-mm-dd
  const match = dateStr.match(/(\d{1,2})[/-](\d{1,2})[/-](\d{4})/)
  if (match) {
    const [, day, month, year] = match
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
  }
  return dateStr
}

/**
 * Formate un statut juridique pour affichage
 */
export function formatLegalStatus(status: LegalStatus, lang: 'fr' | 'ar' = 'fr'): string {
  const labels = {
    fr: {
      active: 'En vigueur',
      abrogated: 'Abrogé',
      modified: 'Modifié',
      suspended: 'Suspendu',
      unknown: 'Statut inconnu',
    },
    ar: {
      active: 'ساري المفعول',
      abrogated: 'ملغى',
      modified: 'منقح',
      suspended: 'معلق',
      unknown: 'الحالة غير معروفة',
    },
  }

  return labels[lang][status]
}
