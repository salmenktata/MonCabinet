/**
 * Legal Document CRUD Service
 *
 * Gère le cycle de vie des documents juridiques consolidés.
 * Chaque document = 1 entité logique (ex: Code Pénal) pouvant
 * regrouper N pages web crawlées.
 */

import { db } from '@/lib/db/postgres'
import { createLogger } from '@/lib/logger'

const log = createLogger('LegalDocService')

// =============================================================================
// TYPES
// =============================================================================

export interface LegalDocumentCreate {
  citationKey: string
  documentType: 'code' | 'loi' | 'decret' | 'arrete' | 'circulaire' |
    'jurisprudence' | 'doctrine' | 'guide' | 'formulaire' | 'autre'
  officialTitleAr?: string
  officialTitleFr?: string
  primaryCategory: string
  secondaryCategories?: string[]
  tags?: string[]
  legalDomains?: string[]
  canonicalSourceId?: string
  sourceUrls?: string[]
  effectiveDate?: string
  publicationDate?: string
  jortReference?: string
}

export interface LegalDocument {
  id: string
  citationKey: string
  documentType: string
  officialTitleAr: string | null
  officialTitleFr: string | null
  primaryCategory: string
  secondaryCategories: string[]
  tags: string[]
  legalDomains: string[]
  canonicalSourceId: string | null
  sourceUrls: any[]
  consolidationStatus: 'pending' | 'partial' | 'complete'
  consolidatedText: string | null
  pageCount: number
  structure: any | null
  isActive: boolean
  isAbrogated: boolean
  abrogationDate: string | null
  abrogatedById: string | null
  effectiveDate: string | null
  publicationDate: string | null
  jortReference: string | null
  lastVerifiedAt: string | null
  lastContentChangeAt: string | null
  knowledgeBaseId: string | null
  isCanonical: boolean
  isApproved: boolean
  approvedAt: string | null
  approvedBy: string | null
  createdAt: string
  updatedAt: string
}

export interface PageLink {
  webPageId: string
  legalDocumentId: string
  pageOrder: number | null
  articleNumber: string | null
  contributionType: string
  isPrimaryPage: boolean
}

export interface LinkedPage {
  webPageId: string
  url: string
  title: string | null
  articleNumber: string | null
  pageOrder: number | null
  contributionType: string
  extractedText: string | null
  wordCount: number | null
  lastCrawledAt: string | null
}

// =============================================================================
// CRUD
// =============================================================================

/**
 * Trouver ou créer un document juridique (upsert idempotent)
 */
export async function findOrCreateDocument(
  data: LegalDocumentCreate
): Promise<LegalDocument> {
  // Chercher par citation_key
  const existing = await getDocumentByCitationKey(data.citationKey)
  if (existing) {
    log.info(`Document existant trouvé: ${data.citationKey} (${existing.id})`)
    return existing
  }

  // Créer le document
  const result = await db.query<any>(
    `INSERT INTO legal_documents (
      citation_key, document_type, official_title_ar, official_title_fr,
      primary_category, secondary_categories, tags, legal_domains,
      canonical_source_id, source_urls,
      effective_date, publication_date, jort_reference
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
    RETURNING *`,
    [
      data.citationKey,
      data.documentType,
      data.officialTitleAr || null,
      data.officialTitleFr || null,
      data.primaryCategory,
      data.secondaryCategories || [],
      data.tags || [],
      data.legalDomains || [],
      data.canonicalSourceId || null,
      JSON.stringify(data.sourceUrls || []),
      data.effectiveDate || null,
      data.publicationDate || null,
      data.jortReference || null,
    ]
  )

  log.info(`Document créé: ${data.citationKey} (${result.rows[0].id})`)
  return mapRowToDocument(result.rows[0])
}

/**
 * Récupérer un document par citation_key
 */
export async function getDocumentByCitationKey(
  citationKey: string
): Promise<LegalDocument | null> {
  const result = await db.query<any>(
    `SELECT * FROM legal_documents WHERE citation_key = $1`,
    [citationKey]
  )
  return result.rows.length > 0 ? mapRowToDocument(result.rows[0]) : null
}

/**
 * Récupérer un document par ID
 */
export async function getDocumentById(id: string): Promise<LegalDocument | null> {
  const result = await db.query<any>(
    `SELECT * FROM legal_documents WHERE id = $1`,
    [id]
  )
  return result.rows.length > 0 ? mapRowToDocument(result.rows[0]) : null
}

/**
 * Lier une page web à un document juridique
 */
export async function linkPageToDocument(
  webPageId: string,
  legalDocumentId: string,
  articleNumber: string | null,
  pageOrder: number | null,
  contributionType: string = 'article',
  isPrimaryPage: boolean = false
): Promise<void> {
  await db.query(
    `INSERT INTO web_pages_documents (
      web_page_id, legal_document_id, article_number,
      page_order, contribution_type, is_primary_page
    ) VALUES ($1, $2, $3, $4, $5, $6)
    ON CONFLICT (web_page_id, legal_document_id) DO UPDATE SET
      article_number = EXCLUDED.article_number,
      page_order = EXCLUDED.page_order,
      contribution_type = EXCLUDED.contribution_type,
      is_primary_page = EXCLUDED.is_primary_page`,
    [webPageId, legalDocumentId, articleNumber, pageOrder, contributionType, isPrimaryPage]
  )
}

/**
 * Récupérer un document avec toutes ses pages liées, ordonnées
 */
export async function getDocumentWithPages(
  documentId: string
): Promise<{ document: LegalDocument; pages: LinkedPage[] } | null> {
  const doc = await getDocumentById(documentId)
  if (!doc) return null

  const pagesResult = await db.query<any>(
    `SELECT
      wp.id as web_page_id,
      wp.url,
      wp.title,
      wpd.article_number,
      wpd.page_order,
      wpd.contribution_type,
      wp.extracted_text,
      wp.word_count,
      wp.last_crawled_at
    FROM web_pages_documents wpd
    JOIN web_pages wp ON wpd.web_page_id = wp.id
    WHERE wpd.legal_document_id = $1
    ORDER BY wpd.page_order ASC NULLS LAST, wpd.article_number ASC`,
    [documentId]
  )

  return {
    document: doc,
    pages: pagesResult.rows.map(mapRowToLinkedPage),
  }
}

/**
 * Mettre à jour le texte consolidé et la structure
 */
export async function updateConsolidation(
  documentId: string,
  consolidatedText: string,
  structure: any,
  pageCount: number
): Promise<void> {
  await db.query(
    `UPDATE legal_documents SET
      consolidated_text = $2,
      structure = $3,
      page_count = $4,
      consolidation_status = 'complete',
      last_content_change_at = NOW(),
      updated_at = NOW()
    WHERE id = $1`,
    [documentId, consolidatedText, JSON.stringify(structure), pageCount]
  )
  log.info(`Consolidation mise à jour pour document ${documentId}: ${pageCount} pages`)
}

/**
 * Mettre à jour le statut de consolidation (ex: 'partial' après liaison de pages)
 */
export async function updateConsolidationStatus(
  documentId: string,
  status: 'pending' | 'partial' | 'complete'
): Promise<void> {
  await db.query(
    `UPDATE legal_documents SET consolidation_status = $2, updated_at = NOW() WHERE id = $1`,
    [documentId, status]
  )
}

/**
 * Marquer un document comme abrogé
 */
export async function markAsAbrogated(
  documentId: string,
  abrogationDate: string,
  abrogatedById?: string
): Promise<void> {
  await db.query(
    `UPDATE legal_documents SET
      is_abrogated = true,
      is_active = false,
      abrogation_date = $2,
      abrogated_by_id = $3,
      updated_at = NOW()
    WHERE id = $1`,
    [documentId, abrogationDate, abrogatedById || null]
  )
}

/**
 * Enregistrer un amendement
 */
export async function recordAmendment(data: {
  originalDocumentId: string
  amendingDocumentId?: string
  amendingLawReference: string
  amendmentDate?: string
  amendmentScope: 'total_replacement' | 'partial_modification' | 'addition' | 'deletion'
  affectedArticles: string[]
  description?: string
}): Promise<string> {
  const result = await db.query<any>(
    `INSERT INTO legal_document_amendments (
      original_document_id, amending_document_id, amending_law_reference,
      amendment_date, amendment_scope, affected_articles, description
    ) VALUES ($1, $2, $3, $4, $5, $6, $7)
    RETURNING id`,
    [
      data.originalDocumentId,
      data.amendingDocumentId || null,
      data.amendingLawReference,
      data.amendmentDate || null,
      data.amendmentScope,
      data.affectedArticles,
      data.description || null,
    ]
  )
  log.info(`Amendement enregistré: ${data.amendingLawReference} → ${data.affectedArticles.join(', ')}`)
  return result.rows[0].id
}

/**
 * Récupérer les amendements d'un document
 */
export async function getDocumentAmendments(documentId: string) {
  const result = await db.query<any>(
    `SELECT * FROM legal_document_amendments
     WHERE original_document_id = $1
     ORDER BY amendment_date DESC NULLS LAST, created_at DESC`,
    [documentId]
  )
  return result.rows
}

/**
 * Mettre à jour la date de dernière vérification
 */
export async function markVerified(documentId: string): Promise<void> {
  await db.query(
    `UPDATE legal_documents SET
      last_verified_at = NOW(),
      updated_at = NOW()
    WHERE id = $1`,
    [documentId]
  )
}

/**
 * Ajouter une URL source alternative
 */
export async function addSourceUrl(documentId: string, url: string): Promise<void> {
  await db.query(
    `UPDATE legal_documents SET
      source_urls = source_urls || $2::jsonb,
      updated_at = NOW()
    WHERE id = $1
    AND NOT source_urls @> $2::jsonb`,
    [documentId, JSON.stringify([url])]
  )
}

/**
 * Lier le document à une entrée KB
 */
export async function linkToKnowledgeBase(
  documentId: string,
  knowledgeBaseId: string,
  isCanonical: boolean = true
): Promise<void> {
  await db.query(
    `UPDATE legal_documents SET
      knowledge_base_id = $2,
      is_canonical = $3,
      updated_at = NOW()
    WHERE id = $1`,
    [documentId, knowledgeBaseId, isCanonical]
  )
}

/**
 * Lister les documents par catégorie
 */
export async function listDocuments(options?: {
  category?: string
  documentType?: string
  isActive?: boolean
  limit?: number
}): Promise<LegalDocument[]> {
  const conditions: string[] = []
  const params: any[] = []
  let paramIdx = 1

  if (options?.category) {
    conditions.push(`(primary_category = $${paramIdx} OR $${paramIdx} = ANY(secondary_categories))`)
    params.push(options.category)
    paramIdx++
  }
  if (options?.documentType) {
    conditions.push(`document_type = $${paramIdx}`)
    params.push(options.documentType)
    paramIdx++
  }
  if (options?.isActive !== undefined) {
    conditions.push(`is_active = $${paramIdx}`)
    params.push(options.isActive)
    paramIdx++
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
  const limit = options?.limit ? `LIMIT ${options.limit}` : ''

  const result = await db.query<any>(
    `SELECT * FROM legal_documents ${where} ORDER BY citation_key ASC ${limit}`,
    params
  )
  return result.rows.map(mapRowToDocument)
}

// =============================================================================
// APPROBATION MANUELLE
// =============================================================================

/**
 * Approuver un document pour publication et indexation RAG
 */
export async function approveDocument(
  documentId: string,
  approvedByUserId: string
): Promise<void> {
  await db.query(
    `UPDATE legal_documents SET
      is_approved = true,
      approved_at = NOW(),
      approved_by = $2,
      updated_at = NOW()
    WHERE id = $1`,
    [documentId, approvedByUserId]
  )
  log.info(`Document ${documentId} approuvé par ${approvedByUserId}`)
}

/**
 * Révoquer l'approbation d'un document
 */
export async function revokeApproval(documentId: string): Promise<void> {
  await db.query(
    `UPDATE legal_documents SET
      is_approved = false,
      approved_at = NULL,
      approved_by = NULL,
      updated_at = NOW()
    WHERE id = $1`,
    [documentId]
  )
  log.info(`Approbation révoquée pour document ${documentId}`)
}

// =============================================================================
// URL HELPERS (pages publiques)
// =============================================================================

/**
 * URL relative vers la page publique d'un document consolidé
 */
export function getDocumentPublicUrl(citationKey: string, articleNumber?: string): string {
  const base = `/legal/documents/${citationKey}`
  return articleNumber ? `${base}#article-${articleNumber}` : base
}

/**
 * URL absolue vers la page publique d'un document consolidé
 */
export function getDocumentAbsoluteUrl(citationKey: string, articleNumber?: string): string {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://qadhya.tn'
  return `${baseUrl}${getDocumentPublicUrl(citationKey, articleNumber)}`
}

// =============================================================================
// MAPPERS
// =============================================================================

function mapRowToDocument(row: any): LegalDocument {
  return {
    id: row.id,
    citationKey: row.citation_key,
    documentType: row.document_type,
    officialTitleAr: row.official_title_ar,
    officialTitleFr: row.official_title_fr,
    primaryCategory: row.primary_category,
    secondaryCategories: row.secondary_categories || [],
    tags: row.tags || [],
    legalDomains: row.legal_domains || [],
    canonicalSourceId: row.canonical_source_id,
    sourceUrls: row.source_urls || [],
    consolidationStatus: row.consolidation_status,
    consolidatedText: row.consolidated_text,
    pageCount: row.page_count,
    structure: row.structure,
    isActive: row.is_active,
    isAbrogated: row.is_abrogated,
    abrogationDate: row.abrogation_date,
    abrogatedById: row.abrogated_by_id,
    effectiveDate: row.effective_date,
    publicationDate: row.publication_date,
    jortReference: row.jort_reference,
    lastVerifiedAt: row.last_verified_at,
    lastContentChangeAt: row.last_content_change_at,
    knowledgeBaseId: row.knowledge_base_id,
    isCanonical: row.is_canonical,
    isApproved: row.is_approved ?? false,
    approvedAt: row.approved_at,
    approvedBy: row.approved_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function mapRowToLinkedPage(row: any): LinkedPage {
  return {
    webPageId: row.web_page_id,
    url: row.url,
    title: row.title,
    articleNumber: row.article_number,
    pageOrder: row.page_order,
    contributionType: row.contribution_type,
    extractedText: row.extracted_text,
    wordCount: row.word_count,
    lastCrawledAt: row.last_crawled_at,
  }
}
