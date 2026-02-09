/**
 * Service Détection Abrogations Juridiques
 *
 * Détecte les références à des lois/articles abrogés dans les réponses juridiques.
 *
 * Objectifs :
 * - Identifier lois/articles obsolètes
 * - Alerter utilisateur avec texte remplaçant
 * - Support bilingue FR/AR
 *
 * Performance : <150ms overhead par réponse
 */

import { db } from '@/lib/db/postgres'
import type { ChatSource } from './rag-chat-service'

// =============================================================================
// TYPES & INTERFACES
// =============================================================================

export type AbrogationScope = 'total' | 'partial' | 'implicit'
export type AbrogationSeverity = 'high' | 'medium' | 'low'

export interface AbrogationInfo {
  abrogatedReference: string
  abrogatedReferenceAr?: string
  abrogatingReference: string
  abrogatingReferenceAr?: string
  abrogationDate: Date
  scope: AbrogationScope
  affectedArticles?: string[]
  sourceUrl?: string
  jortUrl?: string
  notes?: string
  similarityScore?: number
}

export interface AbrogationWarning {
  type: 'abrogation_detected'
  reference: string
  position: number
  abrogationInfo: AbrogationInfo
  severity: AbrogationSeverity
  message: string
  messageAr: string
}

export interface LegalReference {
  reference: string
  normalizedReference: string
  type: 'loi' | 'decret' | 'code' | 'arrete' | 'circulaire' | 'article'
  position: number
  language: 'fr' | 'ar' | 'mixed'
}

export interface SelfDisclosedAbrogation {
  reference: string
  abrogatedBy: string
  pattern: string
  position: number
}

// =============================================================================
// PATTERNS REGEX - Références Juridiques FR/AR
// =============================================================================

const LEGAL_REFERENCE_PATTERNS = {
  // Lois françaises
  loiFR: /(?:Loi|L\.)\s*n?°?\s*(\d{4})-(\d+)/gi,

  // Décrets français
  decretFR: /(?:Décret|D\.)\s*n?°?\s*(\d{4})-(\d+)/gi,

  // Arrêtés français
  arreteFR: /Arrêté\s*n?°?\s*(\d{4})-(\d+)/gi,

  // Circulaires français
  circulaireFR: /Circulaire\s*n?°?\s*(\d+)/gi,

  // Codes français
  codeFR: /Code\s+(?:pénal|civil|travail|commerce|des obligations et des contrats|statut personnel)/gi,

  // Articles français
  articleFR: /Article\s+(\d+)(?:\s+(?:bis|ter|quater))?/gi,

  // Lois arabes
  loiAR: /القانون\s+(?:عدد|رقم)\s+(\d+)(?:\s+لسنة\s+(\d{4}))?/gi,

  // Décrets arabes
  decretAR: /(?:الأمر|المرسوم)\s+عدد\s+(\d+)(?:\s+لسنة\s+(\d{4}))?/gi,

  // Articles arabes
  articleAR: /الفصل\s+(\d+)(?:\s+(?:مكرر|ثالثا|رابعا))?/gi,

  // Circulaires arabes
  circulaireAR: /المنشور\s+عدد\s+(\d+)/gi,
}

// Patterns auto-déclaration abrogation dans le texte
const ABROGATION_PATTERNS_FR = [
  /(?:abrogé|abrogée)\s+(?:par|en vertu de|selon)\s+([^,\.]+)/gi,
  /(?:remplacé|remplacée)\s+par\s+([^,\.]+)/gi,
  /n[''']est plus en vigueur/gi,
  /(?:caduc|caduque)\s+depuis/gi,
]

const ABROGATION_PATTERNS_AR = [
  /(?:ألغي|ألغيت)\s+(?:بموجب|حسب|وفقا لـ)\s+([^\s،\.]+)/gi,
  /(?:عوّض|عوّضت)\s+بـ\s+([^\s،\.]+)/gi,
  /لم يعد ساري المفعول/gi,
  /ملغى منذ/gi,
]

// =============================================================================
// FONCTION 1 : EXTRACTION RÉFÉRENCES JURIDIQUES
// =============================================================================

/**
 * Extrait toutes les références juridiques d'un texte
 * @param text Texte contenant des références légales
 * @returns Liste de références triées par position
 */
export function extractLegalReferences(text: string): LegalReference[] {
  const references: LegalReference[] = []

  // 1. Lois françaises
  let match: RegExpExecArray | null
  const loiFRRegex = new RegExp(LEGAL_REFERENCE_PATTERNS.loiFR)
  while ((match = loiFRRegex.exec(text)) !== null) {
    references.push({
      reference: match[0],
      normalizedReference: normalizeReference(match[0]),
      type: 'loi',
      position: match.index,
      language: 'fr',
    })
  }

  // 2. Décrets français
  const decretFRRegex = new RegExp(LEGAL_REFERENCE_PATTERNS.decretFR)
  while ((match = decretFRRegex.exec(text)) !== null) {
    references.push({
      reference: match[0],
      normalizedReference: normalizeReference(match[0]),
      type: 'decret',
      position: match.index,
      language: 'fr',
    })
  }

  // 3. Circulaires françaises
  const circulaireFRRegex = new RegExp(LEGAL_REFERENCE_PATTERNS.circulaireFR)
  while ((match = circulaireFRRegex.exec(text)) !== null) {
    references.push({
      reference: match[0],
      normalizedReference: normalizeReference(match[0]),
      type: 'circulaire',
      position: match.index,
      language: 'fr',
    })
  }

  // 4. Codes français
  const codeFRRegex = new RegExp(LEGAL_REFERENCE_PATTERNS.codeFR)
  while ((match = codeFRRegex.exec(text)) !== null) {
    references.push({
      reference: match[0],
      normalizedReference: normalizeReference(match[0]),
      type: 'code',
      position: match.index,
      language: 'fr',
    })
  }

  // 5. Articles français (seulement si mentionnés avec un code/loi)
  const articleFRRegex = new RegExp(LEGAL_REFERENCE_PATTERNS.articleFR)
  while ((match = articleFRRegex.exec(text)) !== null) {
    // Vérifier contexte (Code/Loi dans les 50 chars avant)
    const contextBefore = text.slice(Math.max(0, match.index - 50), match.index)
    if (/(?:Code|Loi|CSP)/i.test(contextBefore)) {
      references.push({
        reference: match[0],
        normalizedReference: normalizeReference(match[0]),
        type: 'article',
        position: match.index,
        language: 'fr',
      })
    }
  }

  // 6. Lois arabes
  const loiARRegex = new RegExp(LEGAL_REFERENCE_PATTERNS.loiAR)
  while ((match = loiARRegex.exec(text)) !== null) {
    references.push({
      reference: match[0],
      normalizedReference: normalizeReference(match[0]),
      type: 'loi',
      position: match.index,
      language: 'ar',
    })
  }

  // 7. Décrets arabes
  const decretARRegex = new RegExp(LEGAL_REFERENCE_PATTERNS.decretAR)
  while ((match = decretARRegex.exec(text)) !== null) {
    references.push({
      reference: match[0],
      normalizedReference: normalizeReference(match[0]),
      type: 'decret',
      position: match.index,
      language: 'ar',
    })
  }

  // 8. Circulaires arabes
  const circulaireARRegex = new RegExp(LEGAL_REFERENCE_PATTERNS.circulaireAR)
  while ((match = circulaireARRegex.exec(text)) !== null) {
    references.push({
      reference: match[0],
      normalizedReference: normalizeReference(match[0]),
      type: 'circulaire',
      position: match.index,
      language: 'ar',
    })
  }

  // 9. Articles arabes (avec contexte)
  const articleARRegex = new RegExp(LEGAL_REFERENCE_PATTERNS.articleAR)
  while ((match = articleARRegex.exec(text)) !== null) {
    const contextBefore = text.slice(Math.max(0, match.index - 50), match.index)
    if (/(?:المجلة|القانون)/i.test(contextBefore)) {
      references.push({
        reference: match[0],
        normalizedReference: normalizeReference(match[0]),
        type: 'article',
        position: match.index,
        language: 'ar',
      })
    }
  }

  // Trier par position
  return references.sort((a, b) => a.position - b.position)
}

// =============================================================================
// FONCTION 2 : VÉRIFICATION STATUT ABROGATION
// =============================================================================

/**
 * Vérifie si une référence juridique a été abrogée
 * @param reference Référence à vérifier
 * @param threshold Seuil similarité (0-1)
 * @returns Info abrogation ou null
 */
export async function checkAbrogationStatus(
  reference: string,
  threshold: number = 0.6
): Promise<AbrogationInfo | null> {
  try {
    const result = await db.query(
      `SELECT * FROM find_abrogations($1, $2, 1)`,
      [reference, threshold]
    )

    if (result.rows.length === 0) {
      return null
    }

    const row = result.rows[0]
    return {
      abrogatedReference: row.abrogated_reference,
      abrogatedReferenceAr: row.abrogated_reference_ar,
      abrogatingReference: row.abrogating_reference,
      abrogatingReferenceAr: row.abrogating_reference_ar,
      abrogationDate: new Date(row.abrogation_date),
      scope: row.scope as AbrogationScope,
      affectedArticles: row.affected_articles,
      sourceUrl: row.source_url,
      jortUrl: row.jort_url,
      notes: row.notes,
      similarityScore: parseFloat(row.similarity_score),
    }
  } catch (error) {
    console.error('[Abrogation] Erreur vérification DB:', error)
    return null
  }
}

// =============================================================================
// FONCTION 3 : DÉTECTION PATTERNS AUTO-DÉCLARATION
// =============================================================================

/**
 * Détecte les mentions d'abrogation dans le texte lui-même
 * @param text Texte à analyser
 * @returns Liste d'abrogations auto-déclarées
 */
export function detectAbrogationPatternsInText(text: string): SelfDisclosedAbrogation[] {
  const selfDisclosed: SelfDisclosedAbrogation[] = []

  // Patterns français
  for (const pattern of ABROGATION_PATTERNS_FR) {
    let match: RegExpExecArray | null
    const regex = new RegExp(pattern)
    while ((match = regex.exec(text)) !== null) {
      selfDisclosed.push({
        reference: 'Auto-déclarée dans le texte',
        abrogatedBy: match[1] || 'Non spécifié',
        pattern: match[0],
        position: match.index,
      })
    }
  }

  // Patterns arabes
  for (const pattern of ABROGATION_PATTERNS_AR) {
    let match: RegExpExecArray | null
    const regex = new RegExp(pattern)
    while ((match = regex.exec(text)) !== null) {
      selfDisclosed.push({
        reference: 'مذكور في النص',
        abrogatedBy: match[1] || 'غير محدد',
        pattern: match[0],
        position: match.index,
      })
    }
  }

  return selfDisclosed
}

// =============================================================================
// FONCTION 4 : DÉTECTION RÉFÉRENCES ABROGÉES
// =============================================================================

/**
 * Détecte toutes les références abrogées dans une réponse
 * @param answer Réponse générée
 * @param sources Sources utilisées (optionnel)
 * @returns Liste de warnings
 */
export async function detectAbrogatedReferences(
  answer: string,
  sources?: ChatSource[]
): Promise<AbrogationWarning[]> {
  const warnings: AbrogationWarning[] = []

  // Extraire références juridiques
  const references = extractLegalReferences(answer)

  // Vérifier chaque référence contre la DB
  for (const ref of references) {
    const abrogationInfo = await checkAbrogationStatus(ref.reference, 0.6)

    if (abrogationInfo) {
      const severity = determineSeverity(abrogationInfo.scope)
      const { message, messageAr } = generateWarningMessage(ref, abrogationInfo)

      warnings.push({
        type: 'abrogation_detected',
        reference: ref.reference,
        position: ref.position,
        abrogationInfo,
        severity,
        message,
        messageAr,
      })
    }
  }

  return warnings
}

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Normalise une référence pour matching
 */
export function normalizeReference(reference: string): string {
  return reference
    .toLowerCase()
    .replace(/[^\w\s\u0600-\u06FF]/g, '') // Garder alphanumériques + arabe
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Détermine la sévérité selon le scope
 */
function determineSeverity(scope: AbrogationScope): AbrogationSeverity {
  switch (scope) {
    case 'total':
      return 'high'
    case 'partial':
      return 'medium'
    case 'implicit':
      return 'low'
    default:
      return 'medium'
  }
}

/**
 * Génère les messages d'avertissement bilingues
 */
function generateWarningMessage(
  ref: LegalReference,
  info: AbrogationInfo
): { message: string; messageAr: string } {
  const date = info.abrogationDate.toLocaleDateString('fr-FR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

  const scopeFR = {
    total: 'totalement abrogé',
    partial: 'partiellement abrogé',
    implicit: 'potentiellement obsolète',
  }[info.scope]

  const scopeAR = {
    total: 'ملغى كليا',
    partial: 'ملغى جزئيا',
    implicit: 'محتمل أن يكون ملغى',
  }[info.scope]

  const message = `⚠️ "${ref.reference}" a été ${scopeFR} le ${date} par ${info.abrogatingReference}.`
  const messageAr = `⚠️ "${ref.reference}" ${scopeAR} بتاريخ ${date} بموجب ${info.abrogatingReferenceAr || info.abrogatingReference}.`

  return { message, messageAr }
}

/**
 * Formate les warnings d'abrogation pour affichage
 */
export function formatAbrogationWarnings(warnings: AbrogationWarning[]): string {
  if (warnings.length === 0) {
    return ''
  }

  const lines: string[] = [
    `🚨 ${warnings.length} référence(s) juridique(s) abrogée(s) détectée(s) :`,
    '',
  ]

  warnings.forEach((warning, idx) => {
    const severity = {
      high: '🔴 CRITIQUE',
      medium: '🟡 ATTENTION',
      low: '🟢 INFO',
    }[warning.severity]

    lines.push(`${idx + 1}. ${severity} ${warning.message}`)

    if (warning.abrogationInfo.notes) {
      lines.push(`   💡 ${warning.abrogationInfo.notes}`)
    }

    if (warning.abrogationInfo.sourceUrl) {
      lines.push(`   🔗 ${warning.abrogationInfo.sourceUrl}`)
    }

    lines.push('')
  })

  return lines.join('\n')
}
