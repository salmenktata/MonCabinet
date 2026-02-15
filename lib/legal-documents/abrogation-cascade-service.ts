/**
 * Abrogation Cascade Service
 *
 * Quand un pattern d'abrogation est détecté dans un texte crawlé,
 * ce service orchestre la cascade:
 *   1. Parse la référence (article, loi)
 *   2. Trouve le legal_document correspondant
 *   3. Crée l'entrée legal_document_amendments
 *   4. Met à jour la structure du document
 *   5. Cascade vers la KB si nécessaire
 */

import { db } from '@/lib/db/postgres'
import { createLogger } from '@/lib/logger'
import {
  getDocumentByCitationKey,
  recordAmendment,
  markAsAbrogated,
} from './document-service'
import { extractCitationKeyFromLawReference } from './citation-key-extractor'

const log = createLogger('AbrogationCascade')

// =============================================================================
// PATTERNS D'ABROGATION
// =============================================================================

// Pattern arabe: "نقح الفصل 97 بموجب القانون عدد 14 لسنة 2025"
const AR_AMENDMENT_PATTERN =
  /(?:نقح|ألغي|عوض|أضيف|عدل)\s*(?:الفصل|الفصول)\s*([\d\s,و]+)\s*(?:بموجب|بمقتضى)\s*(?:القانون|الأمر|المرسوم)\s*(?:الأساسي\s*)?عدد\s*(\d+)\s*لسنة\s*(\d{4})/g

// Pattern français: "Modifié par Loi n°2025-14 du..."
const FR_AMENDMENT_PATTERN =
  /(?:modifié|abrogé|remplacé|complété|amendé)\s*par\s*(?:la?\s*)?(?:loi|décret|arrêté)\s*(?:organique\s*)?n°?\s*(\d{4})-(\d+)/gi

// Pattern abrogation totale arabe
const AR_TOTAL_ABROGATION =
  /(?:ألغيت|ألغي)\s*(?:هذا القانون|هذه المجلة|النص|القانون)\s*(?:بموجب|بمقتضى)/

// Pattern abrogation totale français
const FR_TOTAL_ABROGATION =
  /(?:abrogé|abroge)\s*(?:dans son intégralité|en totalité|intégralement)/i

// =============================================================================
// TYPES
// =============================================================================

export interface DetectedAmendment {
  affectedArticles: string[]
  amendingLawYear: string
  amendingLawNumber: string
  amendingLawReference: string
  scope: 'total_replacement' | 'partial_modification' | 'addition' | 'deletion'
  isTotalAbrogation: boolean
}

export interface AbrogationCascadeResult {
  amendments: DetectedAmendment[]
  documentsUpdated: number
  amendmentsCreated: number
  errors: string[]
}

// =============================================================================
// SERVICE
// =============================================================================

/**
 * Analyser un texte pour détecter des amendements/abrogations
 * et les cascader vers les documents juridiques
 */
export async function processAbrogations(
  text: string,
  sourceDocumentCitationKey?: string
): Promise<AbrogationCascadeResult> {
  const result: AbrogationCascadeResult = {
    amendments: [],
    documentsUpdated: 0,
    amendmentsCreated: 0,
    errors: [],
  }

  // Détecter les amendements
  const amendments = detectAmendments(text)
  result.amendments = amendments

  if (amendments.length === 0) {
    return result
  }

  log.info(`${amendments.length} amendement(s) détecté(s)`)

  for (const amendment of amendments) {
    try {
      await processSingleAmendment(amendment, sourceDocumentCitationKey, result)
    } catch (err: any) {
      result.errors.push(`Erreur traitement amendement ${amendment.amendingLawReference}: ${err.message}`)
      log.error(`Erreur cascade abrogation:`, err)
    }
  }

  return result
}

/**
 * Détecter les patterns d'amendement dans un texte
 */
export function detectAmendments(text: string): DetectedAmendment[] {
  const amendments: DetectedAmendment[] = []

  // Vérifier abrogation totale
  const isTotalAbrogation =
    AR_TOTAL_ABROGATION.test(text) || FR_TOTAL_ABROGATION.test(text)

  // Pattern arabe
  let match: RegExpExecArray | null
  const arPattern = new RegExp(AR_AMENDMENT_PATTERN.source, AR_AMENDMENT_PATTERN.flags)
  while ((match = arPattern.exec(text)) !== null) {
    const articlesStr = match[1]
    const lawNumber = match[2]
    const lawYear = match[3]

    const articles = parseArticleList(articlesStr)

    amendments.push({
      affectedArticles: articles,
      amendingLawYear: lawYear,
      amendingLawNumber: lawNumber,
      amendingLawReference: `القانون عدد ${lawNumber} لسنة ${lawYear}`,
      scope: isTotalAbrogation ? 'total_replacement' : 'partial_modification',
      isTotalAbrogation,
    })
  }

  // Pattern français
  const frPattern = new RegExp(FR_AMENDMENT_PATTERN.source, FR_AMENDMENT_PATTERN.flags)
  while ((match = frPattern.exec(text)) !== null) {
    const lawYear = match[1]
    const lawNumber = match[2]

    // Extraire les articles du contexte
    const contextStart = Math.max(0, match.index - 100)
    const context = text.substring(contextStart, match.index)
    const articleMatch = context.match(/articles?\s*([\d\s,et]+)/i)
    const articles = articleMatch ? parseArticleList(articleMatch[1]) : []

    amendments.push({
      affectedArticles: articles,
      amendingLawYear: lawYear,
      amendingLawNumber: lawNumber,
      amendingLawReference: `Loi n°${lawYear}-${lawNumber}`,
      scope: isTotalAbrogation ? 'total_replacement' : 'partial_modification',
      isTotalAbrogation,
    })
  }

  // Dédupliquer par référence de loi
  const seen = new Set<string>()
  return amendments.filter(a => {
    const key = `${a.amendingLawYear}-${a.amendingLawNumber}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

// =============================================================================
// INTERNAL
// =============================================================================

async function processSingleAmendment(
  amendment: DetectedAmendment,
  sourceDocCitationKey: string | undefined,
  result: AbrogationCascadeResult
): Promise<void> {
  // Trouver le document cible (celui qui est amendé)
  // Pour le POC, on cherche par citation_key source
  if (!sourceDocCitationKey) return

  const targetDoc = await getDocumentByCitationKey(sourceDocCitationKey)
  if (!targetDoc) {
    result.errors.push(`Document cible ${sourceDocCitationKey} non trouvé`)
    return
  }

  // Trouver le document amendant (la nouvelle loi)
  const amendingCitationKey = `loi-${amendment.amendingLawYear}-${amendment.amendingLawNumber}`
  const amendingDoc = await getDocumentByCitationKey(amendingCitationKey)

  // Enregistrer l'amendement
  await recordAmendment({
    originalDocumentId: targetDoc.id,
    amendingDocumentId: amendingDoc?.id,
    amendingLawReference: amendment.amendingLawReference,
    amendmentScope: amendment.scope,
    affectedArticles: amendment.affectedArticles,
    description: amendment.isTotalAbrogation
      ? `Abrogation totale par ${amendment.amendingLawReference}`
      : `Modification des articles ${amendment.affectedArticles.join(', ')} par ${amendment.amendingLawReference}`,
  })
  result.amendmentsCreated++

  // Si abrogation totale, marquer le document
  if (amendment.isTotalAbrogation) {
    await markAsAbrogated(targetDoc.id, `${amendment.amendingLawYear}-01-01`, amendingDoc?.id)
    result.documentsUpdated++
    log.info(`Document ${sourceDocCitationKey} marqué comme abrogé`)
  }

  // Mettre à jour la structure du document (marquer articles modifiés)
  if (amendment.affectedArticles.length > 0 && targetDoc.structure) {
    await updateStructureWithAmendments(
      targetDoc.id,
      targetDoc.structure,
      amendment.affectedArticles,
      amendment.amendingLawReference
    )
    result.documentsUpdated++
  }
}

async function updateStructureWithAmendments(
  documentId: string,
  structure: any,
  affectedArticles: string[],
  lawReference: string
): Promise<void> {
  if (!structure || !structure.books) return

  let modified = false

  for (const book of structure.books) {
    for (const chapter of book.chapters || []) {
      for (const article of chapter.articles || []) {
        if (affectedArticles.includes(article.number)) {
          article.isModified = true
          article.amendedBy = lawReference
          modified = true
        }
      }
    }
  }

  if (modified) {
    await db.query(
      `UPDATE legal_documents SET structure = $2, updated_at = NOW() WHERE id = $1`,
      [documentId, JSON.stringify(structure)]
    )
  }
}

function parseArticleList(text: string): string[] {
  // "97, 207 و226 مكرر" → ["97", "207", "226 مكرر"]
  return text
    .replace(/و/g, ',')
    .replace(/et/gi, ',')
    .split(',')
    .map(s => s.trim())
    .filter(s => s.length > 0 && /\d/.test(s))
}
