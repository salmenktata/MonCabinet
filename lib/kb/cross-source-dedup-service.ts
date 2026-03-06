/**
 * Service de déduplication cross-source pour la Knowledge Base
 *
 * Détecte les documents quasi-identiques indexés depuis plusieurs sources
 * (ex: même loi sur iort.gov.tn et 9anoun.tn) et désactive la copie
 * non-canonique du RAG via rag_enabled=false.
 *
 * Priorité canonique : iort_gov_tn > cassation_tn > 9anoun_tn > google_drive > autre
 */

import { db } from '@/lib/db/postgres'

// =============================================================================
// CONSTANTES
// =============================================================================

const SOURCE_PRIORITY_ORDER: Record<string, number> = {
  iort_gov_tn: 1,
  cassation_tn: 2,
  '9anoun_tn': 3,
  google_drive: 4,
  autre: 5,
}

// =============================================================================
// TYPES
// =============================================================================

export interface DedupPair {
  idA: string
  titleA: string
  originA: string
  qualityA: number | null
  idB: string
  titleB: string
  originB: string
  qualityB: number | null
  similarity: number
  canonicalId: string
  nonCanonicalId: string
  reason: string
}

export interface DedupStats {
  totalPairs: number
  resolvedPairs: number
  affectedDocs: number
  bySourcePair: Array<{ pairLabel: string; count: number }>
  recentPairs: Array<{
    idA: string
    titleA: string
    originA: string
    idB: string
    titleB: string
    originB: string
    similarity: number
    canonicalId: string
  }>
}

export interface ScanResult {
  scanned: number
  duplicatesFound: number
  resolved: number
  dryRun: boolean
  pairs: DedupPair[]
}

// =============================================================================
// HELPERS
// =============================================================================

function resolveCanonical(
  idA: string,
  originA: string,
  qualityA: number | null,
  idB: string,
  originB: string,
  qualityB: number | null
): { canonicalId: string; nonCanonicalId: string; reason: string } {
  const prioA = SOURCE_PRIORITY_ORDER[originA] ?? 99
  const prioB = SOURCE_PRIORITY_ORDER[originB] ?? 99

  if (prioA !== prioB) {
    return prioA < prioB
      ? { canonicalId: idA, nonCanonicalId: idB, reason: `${originA} prioritaire sur ${originB}` }
      : { canonicalId: idB, nonCanonicalId: idA, reason: `${originB} prioritaire sur ${originA}` }
  }

  // Même priorité de source : préférer le score qualité le plus élevé
  const qa = qualityA ?? 0
  const qb = qualityB ?? 0
  if (qa !== qb) {
    return qa > qb
      ? { canonicalId: idA, nonCanonicalId: idB, reason: `Meilleure qualité (${qa} vs ${qb})` }
      : { canonicalId: idB, nonCanonicalId: idA, reason: `Meilleure qualité (${qb} vs ${qa})` }
  }

  return { canonicalId: idA, nonCanonicalId: idB, reason: 'Même priorité de source' }
}

// =============================================================================
// SCAN CROSS-SOURCE DUPLICATES
// =============================================================================

/**
 * Scanne la KB pour détecter les documents quasi-identiques entre sources différentes.
 *
 * Stratégie : par batch, appelle find_similar_kb_documents() et filtre
 * les résultats dont le sourceOrigin diffère du document courant.
 * Les paires (A,B)=(B,A) sont dédupliquées via un Set.
 *
 * @param options.dryRun    Si true, détecte sans modifier (défaut: true)
 * @param options.minSimilarity  Seuil de similarité (défaut: 0.90)
 * @param options.maxDocs   Nombre max de docs à parcourir (défaut: 500)
 * @param options.maxPairs  Nombre max de paires à retourner (défaut: 500)
 */
export async function scanCrossSourceDuplicates(options: {
  dryRun?: boolean
  minSimilarity?: number
  maxDocs?: number
  maxPairs?: number
}): Promise<ScanResult> {
  const { dryRun = true, minSimilarity = 0.90, maxDocs = 500, maxPairs = 500 } = options

  // Récupérer les docs indexés avec sourceOrigin et embedding
  const allDocsResult = await db.query(`
    SELECT id, title, metadata->>'sourceOrigin' AS source_origin, quality_score
    FROM knowledge_base
    WHERE is_indexed = true
      AND is_active = true
      AND embedding IS NOT NULL
      AND metadata->>'sourceOrigin' IS NOT NULL
      AND (metadata->>'dedup_reason' IS NULL OR metadata->>'dedup_reason' != 'cross_source_auto')
    ORDER BY updated_at DESC
    LIMIT $1
  `, [maxDocs])

  const allDocs = allDocsResult.rows as Array<{
    id: string
    title: string
    source_origin: string
    quality_score: number | null
  }>

  const seenPairs = new Set<string>()
  const pairs: DedupPair[] = []

  for (const doc of allDocs) {
    if (pairs.length >= maxPairs) break

    // Trouver les docs similaires d'une source différente
    const similarResult = await db.query(`
      SELECT
        f.id,
        f.title,
        f.similarity,
        kb.metadata->>'sourceOrigin' AS source_origin,
        kb.quality_score
      FROM find_similar_kb_documents($1, $2, $3) f
      JOIN knowledge_base kb ON kb.id = f.id
      WHERE kb.metadata->>'sourceOrigin' IS NOT NULL
        AND kb.metadata->>'sourceOrigin' != $4
        AND kb.is_active = true
    `, [doc.id, minSimilarity, 10, doc.source_origin])

    for (const similar of similarResult.rows) {
      const pairKey = [doc.id, similar.id].sort().join(':')
      if (seenPairs.has(pairKey)) continue
      seenPairs.add(pairKey)

      const { canonicalId, nonCanonicalId, reason } = resolveCanonical(
        doc.id, doc.source_origin, doc.quality_score,
        similar.id, similar.source_origin, similar.quality_score
      )

      const canonDoc = canonicalId === doc.id ? doc : similar
      const nonCanonDoc = nonCanonicalId === doc.id ? doc : similar

      pairs.push({
        idA: canonDoc.id,
        titleA: canonDoc.title,
        originA: canonDoc.source_origin,
        qualityA: canonDoc.quality_score ?? null,
        idB: nonCanonDoc.id,
        titleB: nonCanonDoc.title,
        originB: nonCanonDoc.source_origin,
        qualityB: nonCanonDoc.quality_score ?? null,
        similarity: parseFloat(similar.similarity) || 0,
        canonicalId,
        nonCanonicalId,
        reason,
      })

      if (pairs.length >= maxPairs) break
    }
  }

  let resolved = 0

  if (!dryRun && pairs.length > 0) {
    for (const pair of pairs) {
      // Enregistrer la relation dans kb_document_relations
      await db.query(`
        INSERT INTO kb_document_relations
          (source_document_id, target_document_id, relation_type, similarity_score)
        VALUES ($1, $2, 'cross_source_duplicate', $3)
        ON CONFLICT (source_document_id, target_document_id, relation_type) DO UPDATE SET
          similarity_score = EXCLUDED.similarity_score,
          updated_at = NOW()
      `, [pair.canonicalId, pair.nonCanonicalId, pair.similarity])

      // Désactiver le non-canonique du RAG (non destructif : chunks préservés)
      const updateResult = await db.query(`
        UPDATE knowledge_base
        SET rag_enabled = false,
            metadata = metadata || $1::jsonb,
            updated_at = NOW()
        WHERE id = $2
          AND (metadata->>'dedup_reason' IS NULL OR metadata->>'dedup_reason' != 'cross_source_auto')
      `, [
        JSON.stringify({ canonical_kb_id: pair.canonicalId, dedup_reason: 'cross_source_auto' }),
        pair.nonCanonicalId,
      ])

      if ((updateResult.rowCount ?? 0) > 0) resolved++
    }
  }

  return {
    scanned: allDocs.length,
    duplicatesFound: pairs.length,
    resolved,
    dryRun,
    pairs,
  }
}

// =============================================================================
// STATS
// =============================================================================

/**
 * Retourne les statistiques de déduplication cross-source stockées en DB.
 */
export async function getCrossSourceDupStats(): Promise<DedupStats> {
  const [relResult, affectedResult, byPairResult, recentResult] = await Promise.all([
    db.query(`
      SELECT
        COUNT(*)::int AS total_pairs,
        COUNT(*) FILTER (WHERE status IN ('confirmed', 'resolved'))::int AS resolved_pairs
      FROM kb_document_relations
      WHERE relation_type = 'cross_source_duplicate'
    `),

    db.query(`
      SELECT COUNT(*)::int AS affected_docs
      FROM knowledge_base
      WHERE metadata->>'dedup_reason' = 'cross_source_auto'
        AND rag_enabled = false
        AND is_active = true
    `),

    db.query(`
      SELECT
        CONCAT(
          LEAST(kb_a.metadata->>'sourceOrigin', kb_b.metadata->>'sourceOrigin'),
          ' ↔ ',
          GREATEST(kb_a.metadata->>'sourceOrigin', kb_b.metadata->>'sourceOrigin')
        ) AS pair_label,
        COUNT(*)::int AS count
      FROM kb_document_relations r
      JOIN knowledge_base kb_a ON kb_a.id = r.source_document_id
      JOIN knowledge_base kb_b ON kb_b.id = r.target_document_id
      WHERE r.relation_type = 'cross_source_duplicate'
      GROUP BY pair_label
      ORDER BY count DESC
      LIMIT 10
    `),

    db.query(`
      SELECT
        r.source_document_id AS id_a,
        kb_a.title AS title_a,
        kb_a.metadata->>'sourceOrigin' AS origin_a,
        r.target_document_id AS id_b,
        kb_b.title AS title_b,
        kb_b.metadata->>'sourceOrigin' AS origin_b,
        r.similarity_score,
        r.source_document_id AS canonical_id
      FROM kb_document_relations r
      JOIN knowledge_base kb_a ON kb_a.id = r.source_document_id
      JOIN knowledge_base kb_b ON kb_b.id = r.target_document_id
      WHERE r.relation_type = 'cross_source_duplicate'
      ORDER BY r.created_at DESC
      LIMIT 20
    `),
  ])

  return {
    totalPairs: relResult.rows[0]?.total_pairs ?? 0,
    resolvedPairs: relResult.rows[0]?.resolved_pairs ?? 0,
    affectedDocs: affectedResult.rows[0]?.affected_docs ?? 0,
    bySourcePair: byPairResult.rows.map((r: Record<string, unknown>) => ({
      pairLabel: r.pair_label as string,
      count: r.count as number,
    })),
    recentPairs: recentResult.rows.map((r: Record<string, unknown>) => ({
      idA: r.id_a as string,
      titleA: r.title_a as string,
      originA: r.origin_a as string,
      idB: r.id_b as string,
      titleB: r.title_b as string,
      originB: r.origin_b as string,
      similarity: parseFloat(r.similarity_score as string) || 0,
      canonicalId: r.canonical_id as string,
    })),
  }
}

// =============================================================================
// REVERT
// =============================================================================

/**
 * Annule la déduplication d'un document : restaure rag_enabled=true
 * et supprime les marqueurs de déduplication.
 */
export async function revertDedup(docId: string): Promise<void> {
  await db.query(`
    UPDATE knowledge_base
    SET rag_enabled = true,
        metadata = metadata - 'canonical_kb_id' - 'dedup_reason',
        updated_at = NOW()
    WHERE id = $1
  `, [docId])

  await db.query(`
    DELETE FROM kb_document_relations
    WHERE relation_type = 'cross_source_duplicate'
      AND (source_document_id = $1 OR target_document_id = $1)
  `, [docId])
}
