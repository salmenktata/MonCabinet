/**
 * Amendment Linker — Liaison Amendements JORT ↔ KB
 *
 * Prend le résultat de jort-amendment-extractor.ts et crée les liens
 * dans la base de données :
 * - kb_legal_relations (type 'amends' / 'amended_by')
 * - kb_structured_metadata (colonnes is_jort_amendment, amended_articles, etc.)
 * - knowledge_base_chunks.metadata (flags is_amendment / has_amendment)
 * - knowledge_base.jort_amendments_extracted_at
 *
 * @module lib/knowledge-base/amendment-linker
 */

import { db } from '@/lib/db/postgres'
import { createLogger } from '@/lib/logger'
import type { JORTAmendmentExtraction, ArticleAmendment } from './jort-amendment-extractor'
import { getCodeBySlug } from './tunisian-codes-registry'

const log = createLogger('amendment-linker')

// =============================================================================
// TYPES
// =============================================================================

export interface LinkingResult {
  /** Nombre de relations kb_legal_relations créées */
  relationsCreated: number
  /** Nombre de chunks originaux marqués (has_amendment=true) */
  originalChunksMarked: number
  /** Nombre de chunks JORT marqués (is_amendment=true) */
  jortChunksMarked: number
  /** Erreurs non fatales */
  warnings: string[]
  /** true si au moins une liaison a réussi */
  success: boolean
}

// =============================================================================
// FONCTIONS UTILITAIRES
// =============================================================================

/**
 * Trouve l'ID du document KB correspondant à un code tunisien.
 * Cherche dans knowledge_base par titre + category='codes'.
 */
async function findKBDocForCode(codeSlug: string): Promise<string | null> {
  const code = getCodeBySlug(codeSlug)
  if (!code) return null

  // Chercher par titre arabe exact ou contenu du titre
  const result = await db.query(
    `SELECT id
     FROM knowledge_base
     WHERE is_indexed = true
       AND is_active = true
       AND (
         title ILIKE $1
         OR title ILIKE $2
         OR title ILIKE $3
         OR metadata->>'sourceOrigin' IN ('9anoun_tn', 'iort_gov_tn')
            AND title ILIKE $1
       )
     ORDER BY
       CASE WHEN title ILIKE $1 THEN 1
            WHEN title ILIKE $2 THEN 2
            ELSE 3 END
     LIMIT 1`,
    [
      `%${code.nameAr}%`,
      `%${code.nameFr}%`,
      `%${codeSlug}%`,
    ]
  )

  return result.rows[0]?.id ?? null
}

/**
 * Trouve le chunk KB correspondant à un article spécifique d'un code.
 * Utilise une recherche regex dans le contenu des chunks.
 */
async function findChunkForArticle(
  kbDocId: string,
  articleNumber: number
): Promise<string | null> {
  // Pattern arabe "الفصل 65" ou français "Article 65"
  const result = await db.query(
    `SELECT id
     FROM knowledge_base_chunks
     WHERE knowledge_base_id = $1
       AND (
         content ~ $2
         OR metadata->>'article_number' = $3
       )
     LIMIT 1`,
    [
      kbDocId,
      `(?:الفصل|فصل)\\s+${articleNumber}(?:[^0-9]|$)|(?:[Aa]rticle|[Aa]rt\\.?)\\s+${articleNumber}(?:[^0-9]|$)`,
      String(articleNumber),
    ]
  )

  return result.rows[0]?.id ?? null
}

/**
 * Crée ou met à jour une relation kb_legal_relations.
 * Gère le conflit unique(source, target, type) par upsert.
 */
async function upsertLegalRelation(
  sourceKbId: string,
  targetKbId: string,
  relationType: 'amends' | 'amended_by',
  context: string,
  confidence: number
): Promise<boolean> {
  try {
    await db.query(
      `INSERT INTO kb_legal_relations
         (id, source_kb_id, target_kb_id, relation_type, context, confidence, extracted_method, validated, created_at)
       VALUES
         (gen_random_uuid(), $1, $2, $3, $4, $5, 'regex', false, NOW())
       ON CONFLICT (source_kb_id, target_kb_id, relation_type)
       DO UPDATE SET
         context     = EXCLUDED.context,
         confidence  = EXCLUDED.confidence,
         created_at  = NOW()`,
      [sourceKbId, targetKbId, relationType, context.slice(0, 400), confidence]
    )
    return true
  } catch (err) {
    log.error(`[Linker] Erreur upsert relation ${relationType}:`, err)
    return false
  }
}

/**
 * Mettre à jour kb_structured_metadata du document JORT source.
 */
async function updateJortStructuredMetadata(
  jortKbId: string,
  amendment: ArticleAmendment,
  jortDate: string,
  jortIssue: string
): Promise<void> {
  try {
    await db.query(
      `INSERT INTO kb_structured_metadata
         (id, knowledge_base_id, is_jort_amendment, amended_code_slug, amended_articles,
          amendment_type, jort_pub_date, jort_issue_number, amendment_extracted_at,
          extraction_method, extraction_confidence)
       VALUES
         (gen_random_uuid(), $1, true, $2, $3::integer[], $4, $5::date, $6, NOW(), 'hybrid', $7)
       ON CONFLICT (knowledge_base_id)
       DO UPDATE SET
         is_jort_amendment      = true,
         amended_code_slug      = COALESCE(EXCLUDED.amended_code_slug, kb_structured_metadata.amended_code_slug),
         amended_articles       = array_cat(
           COALESCE(kb_structured_metadata.amended_articles, ARRAY[]::integer[]),
           EXCLUDED.amended_articles
         ),
         amendment_type         = EXCLUDED.amendment_type,
         jort_pub_date          = COALESCE(EXCLUDED.jort_pub_date, kb_structured_metadata.jort_pub_date),
         jort_issue_number      = COALESCE(EXCLUDED.jort_issue_number, kb_structured_metadata.jort_issue_number),
         amendment_extracted_at = NOW(),
         extraction_confidence  = GREATEST(EXCLUDED.extraction_confidence, COALESCE(kb_structured_metadata.extraction_confidence, 0))`,
      [
        jortKbId,
        amendment.targetCodeSlug,
        `{${amendment.affectedArticles.join(',')}}`,
        amendment.amendmentType,
        jortDate || null,
        jortIssue || null,
        amendment.confidence,
      ]
    )
  } catch (err) {
    log.warn(`[Linker] Erreur mise à jour kb_structured_metadata pour JORT ${jortKbId}:`, err)
  }
}

/**
 * Marquer les chunks du document JORT comme "is_amendment=true".
 */
async function markJortChunksAsAmendment(
  jortKbId: string,
  amendment: ArticleAmendment,
  jortDate: string,
  jortIssue: string
): Promise<number> {
  try {
    const result = await db.query(
      `UPDATE knowledge_base_chunks
       SET metadata = metadata || $1::jsonb
       WHERE knowledge_base_id = $2
         AND (
           content ~ $3
           OR TRUE  -- Marquer tous les chunks du doc JORT modificatif
         )`,
      [
        JSON.stringify({
          is_amendment: true,
          amended_code: amendment.targetCodeSlug,
          amended_articles: amendment.affectedArticles,
          amendment_type: amendment.amendmentType,
          jort_date: jortDate || null,
          jort_issue: jortIssue || null,
        }),
        jortKbId,
        amendment.affectedArticles
          .map((n) => `(?:الفصل|فصل)\\s+${n}(?:[^0-9]|$)`)
          .join('|'),
      ]
    )
    return result.rowCount ?? 0
  } catch (err) {
    log.warn(`[Linker] Erreur marquage chunks JORT ${jortKbId}:`, err)
    return 0
  }
}

/**
 * Marquer les chunks originaux du code cible comme "has_amendment=true".
 * Cible uniquement les chunks contenant les articles concernés.
 */
async function markOriginalChunksAsAmended(
  targetKbDocId: string,
  amendment: ArticleAmendment,
  jortKbId: string,
  jortReference: string,
  jortDate: string
): Promise<number> {
  if (amendment.affectedArticles.length === 0) return 0

  try {
    // Construire pattern regex pour tous les articles concernés
    const articlePattern = amendment.affectedArticles
      .map((n) => `(?:الفصل|فصل)\\s+${n}(?:[^0-9]|$)|(?:[Aa]rticle|[Aa]rt\\.?)\\s+${n}(?:[^0-9]|$)`)
      .join('|')

    const result = await db.query(
      `UPDATE knowledge_base_chunks
       SET metadata = metadata || $1::jsonb
       WHERE knowledge_base_id = $2
         AND content ~ $3`,
      [
        JSON.stringify({
          has_amendment: true,
          amended_by_jort_id: jortKbId,
          amendment_date: jortDate || null,
          amendment_ref: jortReference,
          amendment_type: amendment.amendmentType,
          amended_code: amendment.targetCodeSlug,
        }),
        targetKbDocId,
        articlePattern,
      ]
    )
    return result.rowCount ?? 0
  } catch (err) {
    log.warn(
      `[Linker] Erreur marquage chunks originaux de ${amendment.targetCodeSlug}:`,
      err
    )
    return 0
  }
}

/**
 * Marquer le timestamp d'extraction dans knowledge_base.
 */
async function markExtractionTimestamp(jortKbId: string): Promise<void> {
  try {
    await db.query(
      `UPDATE knowledge_base
       SET jort_amendments_extracted_at = NOW()
       WHERE id = $1`,
      [jortKbId]
    )
  } catch (err) {
    log.warn(`[Linker] Erreur mise à jour extraction timestamp ${jortKbId}:`, err)
  }
}

// =============================================================================
// FONCTION PRINCIPALE
// =============================================================================

/**
 * Lie une extraction d'amendements JORT à la base de connaissances.
 *
 * Pour chaque amendement détecté :
 * 1. Trouve le document KB du code cible
 * 2. Crée les relations kb_legal_relations (amends + amended_by)
 * 3. Met à jour kb_structured_metadata du JORT
 * 4. Marque les chunks JORT (is_amendment=true)
 * 5. Marque les chunks originaux du code (has_amendment=true)
 * 6. Met à jour jort_amendments_extracted_at
 *
 * @param extraction - Résultat de extractAmendmentsFromJORT()
 * @returns LinkingResult
 */
export async function linkAmendmentToKB(
  extraction: JORTAmendmentExtraction
): Promise<LinkingResult> {
  const result: LinkingResult = {
    relationsCreated: 0,
    originalChunksMarked: 0,
    jortChunksMarked: 0,
    warnings: [],
    success: false,
  }

  // Aucun amendement → juste marquer le timestamp et retourner
  if (!extraction.isAmendingDocument || extraction.amendments.length === 0) {
    await markExtractionTimestamp(extraction.jortKbId)
    return result
  }

  for (const amendment of extraction.amendments) {
    // 1. Trouver le document KB cible
    const targetKbDocId = await findKBDocForCode(amendment.targetCodeSlug)

    if (!targetKbDocId) {
      const warning = `Code ${amendment.targetCodeSlug} non trouvé dans la KB`
      log.warn(`[Linker] ${warning}`)
      result.warnings.push(warning)
      continue
    }

    log.info(
      `[Linker] Liaison JORT ${extraction.jortKbId} → ${amendment.targetCodeSlug} (articles: ${amendment.affectedArticles.join(', ')})`
    )

    // 2. Créer relation JORT → code (amends)
    const r1 = await upsertLegalRelation(
      extraction.jortKbId,
      targetKbDocId,
      'amends',
      amendment.context,
      amendment.confidence
    )
    if (r1) result.relationsCreated++

    // 3. Créer relation inverse code → JORT (amended_by)
    const r2 = await upsertLegalRelation(
      targetKbDocId,
      extraction.jortKbId,
      'amended_by',
      amendment.context,
      amendment.confidence
    )
    if (r2) result.relationsCreated++

    // 4. Mettre à jour kb_structured_metadata du JORT
    await updateJortStructuredMetadata(
      extraction.jortKbId,
      amendment,
      extraction.jortDate,
      extraction.jortIssue
    )

    // 5. Marquer les chunks JORT
    const jortMarked = await markJortChunksAsAmendment(
      extraction.jortKbId,
      amendment,
      extraction.jortDate,
      extraction.jortIssue
    )
    result.jortChunksMarked += jortMarked

    // 6. Marquer les chunks originaux du code cible
    const origMarked = await markOriginalChunksAsAmended(
      targetKbDocId,
      amendment,
      extraction.jortKbId,
      extraction.jortReference,
      extraction.jortDate
    )
    result.originalChunksMarked += origMarked

    result.success = true
  }

  // 7. Marquer le timestamp d'extraction dans knowledge_base
  await markExtractionTimestamp(extraction.jortKbId)

  log.info(
    `[Linker] Terminé pour ${extraction.jortKbId}: ` +
    `${result.relationsCreated} relations, ` +
    `${result.jortChunksMarked} chunks JORT, ` +
    `${result.originalChunksMarked} chunks originaux`
  )

  return result
}

/**
 * Récupère les amendements connus pour un document KB donné.
 * Utile pour afficher "Ce document a été modifié par X JORT".
 */
export async function getAmendmentsForKBDoc(
  kbDocId: string
): Promise<
  Array<{
    jortKbId: string
    jortTitle: string
    jortDate: string | null
    amendmentType: string | null
    amendedArticles: number[] | null
    confidence: number
    jortIssue: string | null
  }>
> {
  const result = await db.query(
    `SELECT
       r.source_kb_id           AS jort_kb_id,
       kb.title                 AS jort_title,
       sm.jort_pub_date         AS jort_date,
       sm.amendment_type        AS amendment_type,
       sm.amended_articles      AS amended_articles,
       r.confidence             AS confidence,
       sm.jort_issue_number     AS jort_issue
     FROM kb_legal_relations r
     JOIN knowledge_base kb ON kb.id = r.source_kb_id
     LEFT JOIN kb_structured_metadata sm ON sm.knowledge_base_id = r.source_kb_id
     WHERE r.target_kb_id = $1
       AND r.relation_type = 'amends'
     ORDER BY sm.jort_pub_date DESC NULLS LAST`,
    [kbDocId]
  )

  return result.rows.map((row) => ({
    jortKbId: row.jort_kb_id,
    jortTitle: row.jort_title,
    jortDate: row.jort_date ? String(row.jort_date).slice(0, 10) : null,
    amendmentType: row.amendment_type,
    amendedArticles: row.amended_articles,
    confidence: parseFloat(row.confidence),
    jortIssue: row.jort_issue,
  }))
}

/**
 * Récupère les codes/articles que modifie un document JORT donné.
 */
export async function getCodeModifiedByJORT(
  jortKbId: string
): Promise<
  Array<{
    targetKbId: string
    targetTitle: string
    amendedArticles: number[] | null
    amendmentType: string | null
    confidence: number
  }>
> {
  const result = await db.query(
    `SELECT
       r.target_kb_id        AS target_kb_id,
       kb.title              AS target_title,
       sm.amended_articles   AS amended_articles,
       sm.amendment_type     AS amendment_type,
       r.confidence          AS confidence
     FROM kb_legal_relations r
     JOIN knowledge_base kb ON kb.id = r.target_kb_id
     LEFT JOIN kb_structured_metadata sm ON sm.knowledge_base_id = r.source_kb_id
     WHERE r.source_kb_id = $1
       AND r.relation_type = 'amends'
     ORDER BY r.confidence DESC`,
    [jortKbId]
  )

  return result.rows.map((row) => ({
    targetKbId: row.target_kb_id,
    targetTitle: row.target_title,
    amendedArticles: row.amended_articles,
    amendmentType: row.amendment_type,
    confidence: parseFloat(row.confidence),
  }))
}
