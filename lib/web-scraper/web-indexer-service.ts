/**
 * Service d'indexation des pages web dans le RAG
 * Convertit les pages web en documents de la base de connaissances
 */

import { db } from '@/lib/db/postgres'
import type { WebPage, WebSource } from './types'
import { isSemanticSearchEnabled, aiConfig, KB_ARABIC_ONLY, EMBEDDING_TURBO_CONFIG } from '@/lib/ai/config'
import { normalizeText, detectTextLanguage } from './content-extractor'
import type { LegalCategory } from '@/lib/categories/legal-categories'
import { getDocumentAbsoluteUrl, findOrCreateDocument, linkPageToDocument, updateConsolidationStatus } from '@/lib/legal-documents/document-service'
import { NINEANOUN_KB_SECTIONS, NINEANOUN_CODE_DOMAINS, NINEANOUN_OTHER_SECTIONS } from './9anoun-code-domains'
import { CASSATION_DOCUMENT_DOMAINS, CASSATION_BASE_URLS } from '@/lib/legal-documents/cassation-document-domains'
import { IORT_DOCUMENT_DOMAINS, IORT_BASE_URLS } from '@/lib/legal-documents/iort-document-domains'

// Concurrence pour l'indexation de pages (1 = séquentiel, safe pour Ollama)
const WEB_INDEXING_CONCURRENCY = parseInt(process.env.WEB_INDEXING_CONCURRENCY || '1', 10)

// =============================================================================
// TYPES POUR CLASSIFICATION
// =============================================================================

/**
 * Classification IA d'une page (depuis legal_classifications)
 */
interface PageClassification {
  primary_category: LegalCategory
  confidence_score: number
  signals_used: string[] | null
}

/**
 * Détecte la catégorie KB à partir du pattern URL (9anoun.tn)
 * Utilise NINEANOUN_KB_SECTIONS, NINEANOUN_CODE_DOMAINS et NINEANOUN_OTHER_SECTIONS
 */
function detectCategoryFromUrl(url: string): LegalCategory | null {
  if (!url) return null

  try {
    const parsed = new URL(url)
    const pathParts = parsed.pathname.split('/').filter(Boolean)

    // Pattern /kb/{section}/... → NINEANOUN_KB_SECTIONS
    if (pathParts[0] === 'kb' && pathParts.length >= 2) {
      const section = pathParts[1]

      // Check KB sections (jurisprudence, doctrine, jorts, constitutions, conventions, lois)
      if (NINEANOUN_KB_SECTIONS[section]) {
        return NINEANOUN_KB_SECTIONS[section].primaryCategory as LegalCategory
      }

      // Check codes (/kb/codes/{slug})
      if (section === 'codes' && pathParts.length >= 3) {
        const slug = pathParts[2]
        if (NINEANOUN_CODE_DOMAINS[slug]) {
          return 'codes' as LegalCategory
        }
      }
    }

    // Pattern /{section}/... → NINEANOUN_OTHER_SECTIONS (modeles, formulaires)
    if (pathParts.length >= 1 && NINEANOUN_OTHER_SECTIONS[pathParts[0]]) {
      return NINEANOUN_OTHER_SECTIONS[pathParts[0]].primaryCategory as LegalCategory
    }
  } catch {
    // URL invalide → pas de détection
  }

  return null
}

/**
 * Détermine la catégorie KB basée sur la classification IA, puis fallback URL pattern
 * 1. Classification IA (si disponible)
 * 2. Pattern URL (9anoun.tn sections)
 * 3. "autre" + flag review
 */
function determineCategoryForKB(
  classification: PageClassification | null,
  pageUrl?: string
): { category: LegalCategory; source: string } {
  // Cas 1 : Classification IA disponible → utiliser primary_category
  if (classification?.primary_category) {
    return { category: classification.primary_category, source: 'ai' }
  }

  // Cas 2 : Détection par pattern URL
  if (pageUrl) {
    const urlCategory = detectCategoryFromUrl(pageUrl)
    if (urlCategory) {
      return { category: urlCategory, source: 'url_pattern' }
    }
  }

  // Cas 3 : Pas de classification → "autre" + flag review
  return { category: 'autre', source: 'default' }
}

// Import dynamique pour éviter les dépendances circulaires
async function getChunkingService() {
  const { chunkText, getOverlapForCategory } = await import('@/lib/ai/chunking-service')
  return { chunkText, getOverlapForCategory }
}

async function getEmbeddingsService() {
  const { generateEmbedding, generateEmbeddingsBatch, formatEmbeddingForPostgres } = await import('@/lib/ai/embeddings-service')
  return { generateEmbedding, generateEmbeddingsBatch, formatEmbeddingForPostgres }
}

// =============================================================================
// TYPES
// =============================================================================

export interface IndexingResult {
  success: boolean
  knowledgeBaseId?: string
  chunksCreated: number
  error?: string
}

// =============================================================================
// AUTO-LINKING
// =============================================================================

/**
 * Tente de lier automatiquement une page web à un legal_document
 * pour les sources cassation.tn et iort.gov.tn.
 *
 * Conditions :
 * - cassation.tn : page doit avoir structured_data.theme (TA/TB/...)
 * - iort.gov.tn  : page doit avoir structured_data.textType (قانون/مرسوم/...)
 *
 * Ne bloque pas l'indexation en cas d'erreur (try/catch silencieux).
 */
async function autoLinkToLegalDocument(pageId: string): Promise<boolean> {
  try {
    // Récupérer la page avec sa source et structured_data
    const result = await db.query<any>(
      `SELECT wp.id, wp.structured_data, wp.url, wp.title,
              ws.id as source_id, ws.base_url as source_base_url
       FROM web_pages wp
       JOIN web_sources ws ON wp.web_source_id = ws.id
       WHERE wp.id = $1`,
      [pageId]
    )

    if (result.rows.length === 0) return false
    const row = result.rows[0]
    const structuredData = row.structured_data || {}
    const sourceBaseUrl: string = row.source_base_url || ''

    // === Cassation.tn ===
    const isCassation = CASSATION_BASE_URLS.some(base =>
      sourceBaseUrl.toLowerCase().includes(base.replace('https://', '').replace('http://', '').replace('www.', ''))
    )
    if (isCassation && structuredData.theme) {
      const themeCode = structuredData.theme as string
      const def = CASSATION_DOCUMENT_DOMAINS[themeCode]
      if (!def) return false

      const doc = await findOrCreateDocument({
        citationKey: def.citationKey,
        documentType: 'jurisprudence',
        officialTitleAr: def.titleAr,
        officialTitleFr: def.titleFr,
        primaryCategory: def.primaryCategory,
        secondaryCategories: ['jurisprudence', 'cassation'],
        tags: def.tags,
        legalDomains: [def.domain],
        canonicalSourceId: row.source_id,
        sourceUrls: ['http://www.cassation.tn'],
      })

      await linkPageToDocument(pageId, doc.id, null, null, 'full_document', false)
      await updateConsolidationStatus(doc.id, 'partial')
      console.log(`[WebIndexer] Auto-link cassation: page ${pageId} → ${def.citationKey} (thème ${themeCode})`)
      return true
    }

    // === IORT.gov.tn ===
    const isIort = IORT_BASE_URLS.some(base =>
      sourceBaseUrl.toLowerCase().includes(base.replace('https://', '').replace('http://', '').replace('www.', ''))
    )
    if (isIort && structuredData.textType) {
      const textType = structuredData.textType as string
      const def = IORT_DOCUMENT_DOMAINS[textType]
      if (!def) return false

      const doc = await findOrCreateDocument({
        citationKey: def.citationKey,
        documentType: def.documentType as any,
        officialTitleAr: def.titleAr,
        officialTitleFr: def.titleFr,
        primaryCategory: def.primaryCategory,
        secondaryCategories: ['legislation', 'jort', 'officiel'],
        tags: def.tags,
        legalDomains: [def.domain],
        canonicalSourceId: row.source_id,
        sourceUrls: ['http://www.iort.gov.tn'],
      })

      await linkPageToDocument(pageId, doc.id, null, null, 'full_document', false)
      await updateConsolidationStatus(doc.id, 'partial')
      console.log(`[WebIndexer] Auto-link IORT: page ${pageId} → ${def.citationKey} (type ${textType})`)
      return true
    }

    return false
  } catch (err) {
    // Ne pas bloquer l'indexation en cas d'erreur de linking
    console.warn(`[WebIndexer] Auto-link échoué pour page ${pageId}:`, err instanceof Error ? err.message : err)
    return false
  }
}

// =============================================================================
// INDEXATION
// =============================================================================

/**
 * Indexe une page web dans la base de connaissances
 *
 * Si la page appartient à un legal_document consolidé,
 * on délègue à l'indexation document-aware.
 */
export async function indexWebPage(pageId: string): Promise<IndexingResult> {
  if (!isSemanticSearchEnabled()) {
    return { success: false, chunksCreated: 0, error: 'Service RAG désactivé' }
  }

  // Vérifier si la page appartient à un document juridique (consolidé ou non)
  const docLink = await db.query(
    `SELECT wpd.legal_document_id, ld.consolidation_status, ld.citation_key
     FROM web_pages_documents wpd
     JOIN legal_documents ld ON wpd.legal_document_id = ld.id
     WHERE wpd.web_page_id = $1`,
    [pageId]
  )

  // Gate enforcement : pages codes (9anoun.tn/kb/codes/*) sans liaison legal_document
  // → skip immédiat pour éviter l'indexation directe hors pipeline legal_documents.
  // Pour cassation.tn et iort.gov.tn : auto-linking si structured_data disponible.
  if (docLink.rows.length === 0) {
    // Tenter l'auto-linking (cassation.tn / iort.gov.tn)
    const linked = await autoLinkToLegalDocument(pageId)
    if (linked) {
      // Re-fetch le docLink après auto-linking
      const newDocLink = await db.query(
        `SELECT wpd.legal_document_id, ld.consolidation_status, ld.citation_key
         FROM web_pages_documents wpd
         JOIN legal_documents ld ON wpd.legal_document_id = ld.id
         WHERE wpd.web_page_id = $1`,
        [pageId]
      )
      if (newDocLink.rows.length > 0) {
        // Déléguer au flux document-level (CAS 2 : partial → skip individuel)
        const doc = newDocLink.rows[0]
        console.log(`[WebIndexer] SKIP page ${pageId} → auto-liée au document ${doc.citation_key} (${doc.consolidation_status})`)
        return {
          success: true,
          chunksCreated: 0,
          error: `Page auto-liée à ${doc.citation_key} (${doc.consolidation_status}) - indexation via consolidation`,
        }
      }
    }

    // Gate pour pages codes 9anoun.tn sans liaison
    const pageUrlResult = await db.query<{ url: string }>(
      `SELECT url FROM web_pages WHERE id = $1`,
      [pageId]
    )
    const pageUrl = pageUrlResult.rows[0]?.url || ''
    if (pageUrl && detectCategoryFromUrl(pageUrl) === 'codes') {
      console.warn(
        `[WebIndexer] BLOCKED page codes ${pageId} (${pageUrl}) — ` +
        `non liée à un legal_document. Doit passer par le pipeline legal_documents.`
      )
      return {
        success: false,
        chunksCreated: 0,
        error: 'Page codes bloquée — pipeline legal_documents requis',
      }
    }
  }

  if (docLink.rows.length > 0) {
    const doc = docLink.rows[0]

    if (doc.consolidation_status === 'complete') {
      // CAS 1: Document consolidé → re-consolider si contenu modifié
      const pageCheck = await db.query(
        `SELECT wp.content_hash, wp.extracted_text IS NOT NULL as has_text
         FROM web_pages wp WHERE wp.id = $1`,
        [pageId]
      )
      const currentPage = pageCheck.rows[0]

      if (currentPage?.has_text) {
        try {
          await db.query(
            `UPDATE legal_documents
             SET consolidation_status = 'partial', updated_at = NOW()
             WHERE id = $1 AND consolidation_status = 'complete'`,
            [doc.legal_document_id]
          )

          const { consolidateDocument } = await import('@/lib/legal-documents/content-consolidation-service')
          console.log(`[WebIndexer] Page ${pageId} modifiée → re-consolidation ${doc.citation_key}`)

          const consolidationResult = await consolidateDocument(doc.legal_document_id)
          if (consolidationResult.success) {
            await indexLegalDocument(doc.legal_document_id)
            console.log(`[WebIndexer] Re-consolidation ${doc.citation_key} terminée: ${consolidationResult.totalArticles} articles`)
          }
        } catch (reconsolidateError) {
          console.error(`[WebIndexer] Erreur re-consolidation ${doc.citation_key}:`, reconsolidateError)
        }
      }

      return {
        success: true,
        chunksCreated: 0,
        error: `Page partie du document consolidé ${doc.citation_key} - indexation document-level`,
      }
    } else {
      // CAS 2: Document pas encore consolidé → SKIP indexation individuelle
      console.log(
        `[WebIndexer] SKIP page ${pageId} → liée au document ${doc.citation_key} ` +
        `(status: ${doc.consolidation_status}). Sera indexée via consolidation.`
      )

      return {
        success: true,
        chunksCreated: 0,
        error: `Page liée au document ${doc.citation_key} (${doc.consolidation_status}) - indexation bloquée`,
      }
    }
  }

  // Récupérer la page + classification IA
  const pageResult = await db.query(
    `SELECT
       wp.*,
       ws.category as source_category,
       ws.name as source_name,
       ws.rag_enabled as source_rag_enabled,
       COALESCE(ws.min_word_count, 30) as source_min_word_count,
       lc.primary_category,
       lc.confidence_score,
       lc.signals_used
     FROM web_pages wp
     JOIN web_sources ws ON wp.web_source_id = ws.id
     LEFT JOIN legal_classifications lc ON wp.id = lc.web_page_id
     WHERE wp.id = $1`,
    [pageId]
  )

  if (pageResult.rows.length === 0) {
    return { success: false, chunksCreated: 0, error: 'Page non trouvée' }
  }

  // Guard: skip si la source parente est désactivée pour le RAG
  if (pageResult.rows[0].source_rag_enabled === false) {
    console.log(`[WebIndexer] Page ${pageId} ignorée — source désactivée (rag_enabled=false)`)
    return { success: false, chunksCreated: 0, error: 'Source désactivée pour le RAG (rag_enabled=false)' }
  }

  const row = pageResult.rows[0]

  const wordCount = row.extracted_text?.trim().split(/\s+/).filter(Boolean).length ?? 0
  const minWordCount: number = row.source_min_word_count ?? 30
  if (!row.extracted_text || wordCount < minWordCount) {
    return { success: false, chunksCreated: 0, error: `Contenu insuffisant pour indexation (${wordCount} mots < ${minWordCount})` }
  }

  // Extraire la classification IA (si disponible)
  const classification: PageClassification | null = row.primary_category
    ? {
        primary_category: row.primary_category,
        confidence_score: row.confidence_score || 0,
        signals_used: row.signals_used,
      }
    : null

  // Déterminer la catégorie KB (IA → URL pattern → "autre")
  const { category: kbCategory, source: classificationSource } = determineCategoryForKB(classification, row.url)

  // Normaliser le texte
  const normalizedText = normalizeText(row.extracted_text)
  const detectedLang = row.language_detected || detectTextLanguage(normalizedText) || 'fr'

  // Fix titre corrompu (noms fichiers Google Drive avec caractères arabes → underscores ou noms 8.3)
  let pageTitle = row.title || row.url
  const isCorruptedTitle = pageTitle && (
    /_{3,}/.test(pageTitle) ||                         // underscores (arabe corrompu)
    /^[A-F0-9~]+\.\w{3,4}$/i.test(pageTitle) ||       // noms 8.3 (A71E~D.DOC)
    (/\.\w{3,4}$/.test(pageTitle) && !/[\u0600-\u06FF]/.test(pageTitle) && pageTitle.length < 30) // fichier court sans arabe
  )
  if (isCorruptedTitle) {
    const lines = normalizedText.split('\n').map((l: string) => l.trim()).filter((l: string) => l.length > 5)
    if (lines.length > 0) {
      pageTitle = lines[0].substring(0, 200)
    }
  }

  // Persister language_detected si manquant (évite re-détection à chaque cron)
  if (!row.language_detected && detectedLang) {
    db.query(
      'UPDATE web_pages SET language_detected = $1 WHERE id = $2',
      [detectedLang, pageId]
    ).catch(() => {})
  }

  // Stratégie arabe uniquement : ignorer le contenu non-arabe
  // Exception: Google Drive accepte français et mixte
  // NOTE : On utilise source_category pour ce check technique (propriété de la source)
  const isGoogleDrive = row.source_category === 'google_drive'
  if (KB_ARABIC_ONLY && !isGoogleDrive && detectedLang !== 'ar') {
    console.log(`[WebIndexer] Contenu non-arabe ignoré: page ${pageId} (${detectedLang})`)
    return { success: false, chunksCreated: 0, error: `Contenu non-arabe ignoré (${detectedLang})` }
  }

  // Seules les langues 'ar' et 'fr' sont supportées dans knowledge_base
  const language: 'ar' | 'fr' = KB_ARABIC_ONLY ? 'ar' : ((detectedLang === 'ar' || detectedLang === 'fr') ? detectedLang : 'fr')

  // Import des services
  const { chunkText, getOverlapForCategory } = await getChunkingService()
  const { generateEmbedding, generateEmbeddingsBatch, formatEmbeddingForPostgres } = await getEmbeddingsService()

  // Déterminer l'overlap selon la catégorie KB (basée sur le contenu)
  const overlap = getOverlapForCategory(kbCategory)

  // Découper en chunks selon la catégorie KB
  const chunks = chunkText(normalizedText, {
    chunkSize: aiConfig.rag.chunkSize,
    overlap,
    preserveParagraphs: true,
    preserveSentences: true,
    category: kbCategory, // Catégorie basée sur le contenu (classification IA)
  })

  if (chunks.length === 0) {
    return { success: false, chunksCreated: 0, error: 'Aucun chunk généré' }
  }

  // Vérifier si un document KB existe déjà pour cette page
  let knowledgeBaseId = row.knowledge_base_id
  const wasUpdate = !!knowledgeBaseId

  const client = await db.getClient()

  try {
    await client.query('BEGIN')

    // Verrouiller la page pour éviter l'indexation concurrente (SKIP LOCKED = pas de blocage)
    const lockResult = await client.query(
      `SELECT id FROM web_pages WHERE id = $1 AND is_indexed = false FOR UPDATE SKIP LOCKED`,
      [pageId]
    )
    if (lockResult.rows.length === 0) {
      await client.query('ROLLBACK')
      return { success: true, chunksCreated: 0, error: 'Page déjà indexée ou en cours d\'indexation' }
    }

    // Créer ou mettre à jour le document KB
    if (!knowledgeBaseId) {
      // Créer un nouveau document KB avec classification IA pure
      // Pipeline supervisé: nouveau doc → pipeline_stage = 'crawled', pas d'indexation auto
      const kbResult = await client.query(
        `INSERT INTO knowledge_base (
          category, subcategory, language, title, description,
          metadata, tags, full_text, source_file, is_indexed,
          pipeline_stage, pipeline_stage_updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, false, 'crawled', NOW())
        RETURNING id`,
        [
          kbCategory, // ← Classification IA pure (pas de fallback source)
          null, // subcategory
          language,
          pageTitle,
          row.meta_description,
          JSON.stringify({
            source: 'web_scraper',
            sourceId: row.web_source_id,
            sourceName: row.source_name,
            pageId: pageId,
            url: row.url,
            author: row.meta_author,
            publishedAt: row.meta_date,
            crawledAt: row.last_crawled_at,
            // Tracking classification pour audit
            classification_source: classificationSource,
            classification_confidence: classification?.confidence_score || null,
            classification_signals: classification?.signals_used || null,
            needs_review: classificationSource === 'default', // Flag si ni IA ni URL pattern
          }),
          row.meta_keywords || [],
          normalizedText,
          row.url,
        ]
      )
      knowledgeBaseId = kbResult.rows[0].id
    } else {
      // Créer une version avant la mise à jour (historique)
      try {
        await client.query(
          `INSERT INTO knowledge_base_versions
           (knowledge_base_id, version, title, description, full_text, source_file,
            metadata, category, subcategory, tags, language, changed_by, change_reason, change_type)
           SELECT id, version, title, description, full_text, source_file,
            metadata, category, subcategory, tags, language, NULL,
            'Mise à jour automatique - contenu source modifié', 'content_update'
           FROM knowledge_base WHERE id = $1`,
          [knowledgeBaseId]
        )
      } catch (versionError) {
        // Ne pas bloquer l'indexation si le versioning échoue
        console.warn(`[WebIndexer] Erreur versioning KB ${knowledgeBaseId}:`, versionError)
      }

      // Mettre à jour le document existant + incrémenter version
      await client.query(
        `UPDATE knowledge_base SET
          title = $2,
          description = $3,
          language = $4,
          full_text = $5,
          metadata = metadata || $6::jsonb,
          is_indexed = false,
          version = version + 1,
          updated_at = NOW()
        WHERE id = $1`,
        [
          knowledgeBaseId,
          pageTitle,
          row.meta_description,
          language,
          normalizedText,
          JSON.stringify({
            lastCrawledAt: row.last_crawled_at,
            updatedAt: new Date().toISOString(),
            // Tracking classification (mise à jour si classification changée)
            classification_source: classificationSource,
            classification_confidence: classification?.confidence_score || null,
            classification_signals: classification?.signals_used || null,
            needs_review: classificationSource === 'default',
          }),
        ]
      )

      // Supprimer les anciens chunks
      await client.query(
        'DELETE FROM knowledge_base_chunks WHERE knowledge_base_id = $1',
        [knowledgeBaseId]
      )
    }

    // Générer les embeddings (OpenAI uniquement — Gemini supprimé pour réduire les coûts)
    const chunkContents = chunks.map(c => c.content)
    const embeddingsResult = await generateEmbeddingsBatch(chunkContents, { operationName: 'indexation' })

    const primaryEmbeddings = embeddingsResult

    // Générer l'embedding du document (titre + description)
    const docSummary = `${row.title || ''}. ${row.meta_description || ''}`.trim()
    const docEmbeddingResult = await generateEmbedding(
      docSummary || normalizedText.substring(0, 500),
      { operationName: 'indexation' }
    )

    // Déterminer la colonne d'embedding selon le provider utilisé
    const isOpenAI = primaryEmbeddings.provider === 'openai'
    const embeddingColumn = isOpenAI ? 'embedding_openai' : 'embedding'

    // Insérer les chunks avec embedding primaire uniquement
    for (let i = 0; i < chunks.length; i++) {
      const meta = JSON.stringify({
        wordCount: chunks[i].metadata.wordCount,
        charCount: chunks[i].metadata.charCount,
        sourceUrl: row.url,
      })

      await client.query(
        `INSERT INTO knowledge_base_chunks
         (knowledge_base_id, chunk_index, content, ${embeddingColumn}, metadata)
         VALUES ($1, $2, $3, $4::vector, $5)`,
        [
          knowledgeBaseId,
          chunks[i].index,
          chunks[i].content,
          formatEmbeddingForPostgres(primaryEmbeddings.embeddings[i]),
          meta,
        ]
      )
    }

    // Mettre à jour le document KB avec son embedding
    if (isOpenAI) {
      await client.query(
        `UPDATE knowledge_base SET is_indexed = true, updated_at = NOW() WHERE id = $1`,
        [knowledgeBaseId]
      )
    } else {
      await client.query(
        `UPDATE knowledge_base SET
          embedding = $2::vector,
          is_indexed = true,
          updated_at = NOW()
        WHERE id = $1`,
        [knowledgeBaseId, formatEmbeddingForPostgres(docEmbeddingResult.embedding)]
      )
    }

    // Mettre à jour la page web (titre corrigé + langue détectée)
    await client.query(
      `UPDATE web_pages SET
        knowledge_base_id = $2,
        is_indexed = true,
        chunks_count = $3,
        title = $4,
        language_detected = COALESCE(language_detected, $5),
        last_indexed_at = NOW(),
        status = 'indexed',
        updated_at = NOW()
      WHERE id = $1`,
      [pageId, knowledgeBaseId, chunks.length, pageTitle, detectedLang]
    )

    await client.query('COMMIT')

    console.log(`[WebIndexer] Page ${pageId} indexée: ${chunks.length} chunks${wasUpdate ? ' (mise à jour)' : ''}`)

    // Auto-advance pipeline si éligible (après COMMIT)
    if (knowledgeBaseId) {
      try {
        const { autoAdvanceIfEligible } = await import('@/lib/pipeline/document-pipeline-service')
        const autoResult = await autoAdvanceIfEligible(knowledgeBaseId, 'system-crawler')
        if (autoResult && autoResult.advanced.length > 0) {
          console.log(`[WebIndexer] Auto-advance doc ${knowledgeBaseId}: ${autoResult.advanced.join(' → ')} (arrêt: ${autoResult.stoppedAt})`)
        }
      } catch (autoError) {
        // Ne pas bloquer l'indexation si l'auto-advance échoue
        console.warn(`[WebIndexer] Auto-advance échoué pour ${knowledgeBaseId}:`, autoError)
      }
    }

    // Notification admin si c'était une mise à jour
    if (wasUpdate) {
      try {
        await db.query(
          `INSERT INTO admin_notifications
           (notification_type, priority, title, message, target_type, target_id, metadata)
           VALUES ('kb_update', 'normal', $1, $2, 'knowledge_base', $3, $4)`,
          [
            `Document KB mis à jour : ${pageTitle}`,
            `Contenu modifié détecté sur ${row.url}. Re-indexation automatique (${chunks.length} chunks).`,
            knowledgeBaseId,
            JSON.stringify({ pageId, sourceUrl: row.url, chunksCreated: chunks.length }),
          ]
        )
      } catch (notifError) {
        console.warn(`[WebIndexer] Erreur notification:`, notifError)
      }
    }

    return {
      success: true,
      knowledgeBaseId,
      chunksCreated: chunks.length,
    }

  } catch (error) {
    await client.query('ROLLBACK')
    console.error(`[WebIndexer] Erreur indexation page ${pageId}:`, error)

    return {
      success: false,
      chunksCreated: 0,
      error: error instanceof Error ? error.message : 'Erreur indexation',
    }
  } finally {
    client.release()
  }
}

/**
 * Indexe toutes les pages non indexées d'une source
 */
export async function indexSourcePages(
  sourceId: string,
  options: { limit?: number; reindex?: boolean } = {}
): Promise<{
  processed: number
  succeeded: number
  failed: number
  results: Array<{ pageId: string; success: boolean; error?: string }>
}> {
  const { limit = 50, reindex = false } = options

  // Guard: skip si la source est désactivée pour le RAG
  const sourceRagCheck = await db.query(
    'SELECT rag_enabled FROM web_sources WHERE id = $1',
    [sourceId]
  )
  if (!sourceRagCheck.rows[0] || sourceRagCheck.rows[0].rag_enabled === false) {
    console.log(`[Index] Source ${sourceId} désactivée (rag_enabled=false) — indexation ignorée`)
    return { processed: 0, succeeded: 0, failed: 0, results: [] }
  }

  // Récupérer les pages à indexer
  // Seules les pages avec texte extrait suffisant sont indexables
  let sql = `
    SELECT id FROM web_pages
    WHERE web_source_id = $1
    AND status IN ('crawled', 'unchanged')
    AND extracted_text IS NOT NULL AND LENGTH(extracted_text) >= 50
  `

  if (KB_ARABIC_ONLY) {
    sql += ` AND (language_detected = 'ar' OR language_detected IS NULL)`
  }

  if (!reindex) {
    sql += ' AND is_indexed = false'
  }

  sql += ` ORDER BY last_crawled_at DESC LIMIT $2`

  const pagesResult = await db.query(sql, [sourceId, limit])
  const results: Array<{ pageId: string; success: boolean; error?: string }> = []

  const concurrency = EMBEDDING_TURBO_CONFIG.enabled
    ? EMBEDDING_TURBO_CONFIG.concurrency
    : WEB_INDEXING_CONCURRENCY

  // Traitement par lots avec concurrence configurable
  const pageIds = pagesResult.rows.map(r => r.id)
  for (let i = 0; i < pageIds.length; i += concurrency) {
    const batch = pageIds.slice(i, i + concurrency)

    if (concurrency <= 1) {
      // Mode séquentiel (safe pour Ollama)
      for (const pageId of batch) {
        const result = await indexWebPage(pageId)
        results.push({ pageId, success: result.success, error: result.error })
      }
    } else {
      // Mode parallèle (turbo / OpenAI)
      const batchResults = await Promise.allSettled(
        batch.map(pageId => indexWebPage(pageId))
      )
      for (let j = 0; j < batch.length; j++) {
        const settled = batchResults[j]
        if (settled.status === 'fulfilled') {
          results.push({ pageId: batch[j], success: settled.value.success, error: settled.value.error })
        } else {
          results.push({ pageId: batch[j], success: false, error: settled.reason?.message || 'Erreur inconnue' })
        }
      }
    }
  }

  return {
    processed: results.length,
    succeeded: results.filter(r => r.success).length,
    failed: results.filter(r => !r.success).length,
    results,
  }
}

/**
 * Indexe les pages web en attente (toutes sources ou une source spécifique)
 * Utilisé par le cron d'indexation progressive
 */
export async function indexWebPages(
  limit: number = 10,
  sourceId?: string
): Promise<{
  processed: number
  succeeded: number
  failed: number
  results: Array<{ pageId: string; success: boolean; error?: string }>
}> {
  // Récupérer les pages à indexer
  // Seules les pages avec texte extrait suffisant sont indexables
  // Les pages fichiers-seuls (Google Drive sans texte) sont exclues pour éviter une boucle infinie
  const params: (number | string)[] = [limit]
  const sourceFilter = sourceId ? `AND wp.web_source_id = $2` : ''
  if (sourceId) params.push(sourceId)

  const sql = `
    SELECT wp.id FROM web_pages wp
    JOIN web_sources ws ON wp.web_source_id = ws.id
    WHERE ws.rag_enabled = true
    AND wp.status IN ('crawled', 'unchanged', 'indexed')
    AND wp.is_indexed = false
    AND wp.extracted_text IS NOT NULL AND LENGTH(wp.extracted_text) >= 50
    ${KB_ARABIC_ONLY ? `AND (wp.language_detected = 'ar' OR wp.language_detected IS NULL)` : ''}
    ${sourceFilter}
    ORDER BY wp.last_crawled_at DESC
    LIMIT $1
  `

  const pagesResult = await db.query(sql, params)
  const results: Array<{ pageId: string; success: boolean; error?: string }> = []

  const concurrency = EMBEDDING_TURBO_CONFIG.enabled
    ? EMBEDDING_TURBO_CONFIG.concurrency
    : WEB_INDEXING_CONCURRENCY

  // Traitement par lots avec concurrence configurable
  const pageIds = pagesResult.rows.map(r => r.id)
  for (let i = 0; i < pageIds.length; i += concurrency) {
    const batch = pageIds.slice(i, i + concurrency)

    if (concurrency <= 1) {
      // Mode séquentiel (safe pour Ollama)
      for (const pageId of batch) {
        const result = await indexWebPage(pageId)
        results.push({ pageId, success: result.success, error: result.error })
      }
    } else {
      // Mode parallèle (turbo / OpenAI)
      const batchResults = await Promise.allSettled(
        batch.map(pageId => indexWebPage(pageId))
      )
      for (let j = 0; j < batch.length; j++) {
        const settled = batchResults[j]
        if (settled.status === 'fulfilled') {
          results.push({ pageId: batch[j], success: settled.value.success, error: settled.value.error })
        } else {
          results.push({ pageId: batch[j], success: false, error: settled.reason?.message || 'Erreur inconnue' })
        }
      }
    }
  }

  return {
    processed: results.length,
    succeeded: results.filter((r) => r.success).length,
    failed: results.filter((r) => !r.success).length,
    results,
  }
}

/**
 * Ajoute les pages d'une source à la queue d'indexation
 */
export async function queueSourcePagesForIndexing(
  sourceId: string,
  options: { limit?: number; priority?: number } = {}
): Promise<number> {
  const { limit = 100, priority = 5 } = options

  // Récupérer les pages à indexer
  // Seules les pages avec texte extrait suffisant sont indexables
  const pagesResult = await db.query(
    `SELECT id FROM web_pages
     WHERE web_source_id = $1
     AND status IN ('crawled', 'unchanged')
     AND is_indexed = false
     AND extracted_text IS NOT NULL AND LENGTH(extracted_text) >= 50
     ORDER BY last_crawled_at DESC
     LIMIT $2`,
    [sourceId, limit]
  )

  if (pagesResult.rows.length === 0) {
    return 0
  }

  // Import du service de queue
  const { addToQueue } = await import('@/lib/ai/indexing-queue-service')

  let queued = 0
  for (const row of pagesResult.rows) {
    try {
      await addToQueue('web_page_index', row.id, priority, {
        sourceId,
        type: 'web_page',
      })
      queued++
    } catch (error) {
      console.error(`[WebIndexer] Erreur ajout queue page ${row.id}:`, error)
    }
  }

  return queued
}

/**
 * Récupère les statistiques d'indexation d'une source
 */
export async function getSourceIndexingStats(sourceId: string): Promise<{
  totalPages: number
  indexedPages: number
  pendingPages: number
  failedPages: number
  totalChunks: number
}> {
  // FIX: Inclure aussi les pages 'unchanged' dans les pending_pages
  const result = await db.query(
    `SELECT
      COUNT(*) as total_pages,
      COUNT(*) FILTER (WHERE is_indexed = true) as indexed_pages,
      COUNT(*) FILTER (WHERE status IN ('crawled', 'unchanged', 'indexed') AND is_indexed = false) as pending_pages,
      COUNT(*) FILTER (WHERE status = 'failed') as failed_pages,
      COALESCE(SUM(chunks_count), 0) as total_chunks
     FROM web_pages
     WHERE web_source_id = $1`,
    [sourceId]
  )

  const row = result.rows[0]
  return {
    totalPages: parseInt(row.total_pages) || 0,
    indexedPages: parseInt(row.indexed_pages) || 0,
    pendingPages: parseInt(row.pending_pages) || 0,
    failedPages: parseInt(row.failed_pages) || 0,
    totalChunks: parseInt(row.total_chunks) || 0,
  }
}

/**
 * Indexe un document juridique consolidé (legal_document) dans la KB.
 * Utilise le chunking par article au lieu du chunking classique.
 */
export async function indexLegalDocument(documentId: string): Promise<IndexingResult> {
  if (!isSemanticSearchEnabled()) {
    return { success: false, chunksCreated: 0, error: 'Service RAG désactivé' }
  }

  // Charger le document consolidé ET approuvé
  const docResult = await db.query(
    `SELECT * FROM legal_documents WHERE id = $1 AND consolidation_status = 'complete'`,
    [documentId]
  )

  if (docResult.rows.length === 0) {
    return { success: false, chunksCreated: 0, error: 'Document non trouvé ou pas encore consolidé' }
  }

  // Vérifier approbation manuelle
  if (!docResult.rows[0].is_approved) {
    return { success: false, chunksCreated: 0, error: 'Document non approuvé - approbation manuelle requise avant indexation' }
  }

  const doc = docResult.rows[0]

  if (!doc.consolidated_text || doc.consolidated_text.length < 100) {
    return { success: false, chunksCreated: 0, error: 'Texte consolidé insuffisant' }
  }

  const { chunkByArticle } = await import('@/lib/ai/chunking-service')
  const { generateEmbedding, generateEmbeddingsBatch, formatEmbeddingForPostgres } = await getEmbeddingsService()

  // Chunking par article si structure disponible
  let chunks
  if (doc.structure && doc.structure.books) {
    chunks = chunkByArticle(doc.structure, {
      maxChunkWords: 2000,
      codeName: doc.official_title_ar || doc.citation_key,
    })
  } else {
    // Fallback: chunking classique
    const { chunkText } = await getChunkingService()
    chunks = chunkText(doc.consolidated_text, {
      chunkSize: aiConfig.rag.chunkSize,
      overlap: 100,
      preserveParagraphs: true,
      category: 'code',
    })
  }

  if (chunks.length === 0) {
    return { success: false, chunksCreated: 0, error: 'Aucun chunk généré' }
  }

  const client = await db.getClient()

  try {
    await client.query('BEGIN')

    let knowledgeBaseId = doc.knowledge_base_id

    if (!knowledgeBaseId) {
      // Créer l'entrée KB consolidée
      const kbResult = await client.query(
        `INSERT INTO knowledge_base (
          category, language, title, description, metadata, tags, full_text, source_file, is_indexed
        ) VALUES ($1, 'ar', $2, $3, $4, $5, $6, $7, false)
        RETURNING id`,
        [
          doc.primary_category,
          doc.official_title_ar || doc.citation_key,
          doc.official_title_fr,
          JSON.stringify({
            source: 'legal_document',
            legalDocumentId: doc.id,
            citationKey: doc.citation_key,
            documentType: doc.document_type,
            isCanonical: true,
            consolidatedAt: doc.structure?.consolidatedAt,
            pageCount: doc.page_count,
            sourceUrl: getDocumentAbsoluteUrl(doc.citation_key),
          }),
          doc.tags || [],
          doc.consolidated_text,
          getDocumentAbsoluteUrl(doc.citation_key),
        ]
      )
      knowledgeBaseId = kbResult.rows[0].id
    } else {
      // Mettre à jour
      await client.query(
        `UPDATE knowledge_base SET
          title = $2, full_text = $3, is_indexed = false,
          version = version + 1, updated_at = NOW()
        WHERE id = $1`,
        [knowledgeBaseId, doc.official_title_ar || doc.citation_key, doc.consolidated_text]
      )
      await client.query(
        'DELETE FROM knowledge_base_chunks WHERE knowledge_base_id = $1',
        [knowledgeBaseId]
      )
    }

    // Générer embeddings (OpenAI uniquement — Gemini supprimé pour réduire les coûts)
    const chunkContents = chunks.map(c => c.content)
    const primaryEmbeddings = await generateEmbeddingsBatch(chunkContents, { operationName: 'indexation' })

    // Embedding document-level
    const docSummary = `${doc.official_title_ar || ''} ${doc.official_title_fr || ''} ${doc.citation_key}`.trim()
    const docEmbedding = await generateEmbedding(docSummary, { operationName: 'indexation' })

    // Déterminer la colonne d'embedding selon le provider utilisé
    const isOpenAI = primaryEmbeddings.provider === 'openai'
    const embeddingColumn = isOpenAI ? 'embedding_openai' : 'embedding'

    console.log(`[WebIndexer] Provider embeddings: ${primaryEmbeddings.provider} → colonne ${embeddingColumn}`)

    // Insérer les chunks avec embedding primaire uniquement
    for (let i = 0; i < chunks.length; i++) {
      const chunkMeta = chunks[i].metadata as any
      const meta = JSON.stringify({
        wordCount: chunks[i].metadata.wordCount,
        articleNumber: chunkMeta.articleNumber || null,
        bookNumber: chunkMeta.bookNumber || null,
        chapterNumber: chunkMeta.chapterNumber || null,
        codeName: chunkMeta.codeName || null,
        citationKey: doc.citation_key,
        sourceType: 'legal_document',
        sourceUrl: getDocumentAbsoluteUrl(doc.citation_key, chunkMeta.articleNumber || undefined),
      })

      await client.query(
        `INSERT INTO knowledge_base_chunks
         (knowledge_base_id, chunk_index, content, ${embeddingColumn}, metadata)
         VALUES ($1, $2, $3, $4::vector, $5)`,
        [
          knowledgeBaseId,
          i,
          chunks[i].content,
          formatEmbeddingForPostgres(primaryEmbeddings.embeddings[i]),
          meta,
        ]
      )
    }

    // Marquer comme indexé + embedding document-level
    if (isOpenAI) {
      await client.query(
        `UPDATE knowledge_base SET is_indexed = true, updated_at = NOW() WHERE id = $1`,
        [knowledgeBaseId]
      )
    } else {
      await client.query(
        `UPDATE knowledge_base SET embedding = $2::vector, is_indexed = true, updated_at = NOW()
         WHERE id = $1`,
        [knowledgeBaseId, formatEmbeddingForPostgres(docEmbedding.embedding)]
      )
    }

    // Lier le document juridique à la KB
    await client.query(
      `UPDATE legal_documents SET
        knowledge_base_id = $2, is_canonical = true, updated_at = NOW()
      WHERE id = $1`,
      [documentId, knowledgeBaseId]
    )

    await client.query('COMMIT')

    console.log(`[WebIndexer] Document juridique ${doc.citation_key} indexé: ${chunks.length} chunks`)

    return {
      success: true,
      knowledgeBaseId,
      chunksCreated: chunks.length,
    }
  } catch (error) {
    await client.query('ROLLBACK')
    console.error(`[WebIndexer] Erreur indexation document ${doc.citation_key}:`, error)
    return {
      success: false,
      chunksCreated: 0,
      error: error instanceof Error ? error.message : 'Erreur indexation document',
    }
  } finally {
    client.release()
  }
}

/**
 * Supprime l'indexation d'une page
 */
export async function unindexWebPage(pageId: string): Promise<boolean> {
  try {
    // Récupérer le knowledge_base_id
    const pageResult = await db.query(
      'SELECT knowledge_base_id FROM web_pages WHERE id = $1',
      [pageId]
    )

    if (pageResult.rows.length === 0) return false

    const kbId = pageResult.rows[0].knowledge_base_id

    const client = await db.getClient()

    try {
      await client.query('BEGIN')

      // Supprimer les chunks si KB existe
      if (kbId) {
        await client.query(
          'DELETE FROM knowledge_base_chunks WHERE knowledge_base_id = $1',
          [kbId]
        )

        // Supprimer le document KB
        await client.query(
          'DELETE FROM knowledge_base WHERE id = $1',
          [kbId]
        )
      }

      // Mettre à jour la page
      await client.query(
        `UPDATE web_pages SET
          knowledge_base_id = NULL,
          is_indexed = false,
          chunks_count = 0,
          last_indexed_at = NULL,
          updated_at = NOW()
        WHERE id = $1`,
        [pageId]
      )

      await client.query('COMMIT')
      return true

    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }

  } catch (error) {
    console.error(`[WebIndexer] Erreur désindexation page ${pageId}:`, error)
    return false
  }
}
