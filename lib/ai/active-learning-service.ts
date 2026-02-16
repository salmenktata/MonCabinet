/**
 * Service Active Learning - Détection Gaps KB
 *
 * Objectifs:
 * 1. Tracker queries avec scores RAG faibles (<0.70)
 * 2. Identifier domaines juridiques manquants
 * 3. Suggérer sources à indexer
 * 4. Améliorer KB de manière proactive
 *
 * Février 2026 - Task #6
 */

import { db } from '@/lib/db/postgres'
import type { DocumentType } from '@/lib/categories/doc-types'

// =============================================================================
// TYPES
// =============================================================================

export interface ActiveLearningQuery {
  id: string
  queryText: string
  queryLanguage: 'fr' | 'ar'
  ragScore: number
  ragSourcesCount: number
  ragThresholdMet: boolean
  userId?: string
  dossierId?: string
  docType?: DocumentType
  clusterId?: string
  createdAt: Date
}

export interface ActiveLearningGap {
  id: string
  topicName: string
  topicKeywords: string[]
  queryCount: number
  avgRagScore: number
  priority: 1 | 2 | 3 | 4
  suggestedCategories: string[]
  suggestedSources: string[]
  firstSeenAt: Date
  lastSeenAt: Date
  status: 'active' | 'resolved' | 'ignored'
  queriesLast7d: number
  queriesLast24h: number
}

export interface RecordQueryOptions {
  queryText: string
  queryLanguage: 'fr' | 'ar'
  ragScore: number
  ragSourcesCount: number
  userId?: string
  dossierId?: string
  docType?: DocumentType
  embedding?: number[]
}

export interface GapSuggestion {
  category: string
  confidence: number
  sources: string[]
}

// =============================================================================
// CONSTANTES
// =============================================================================

const RAG_THRESHOLD_FR = 0.70
const RAG_THRESHOLD_AR = 0.30
const GAP_DETECTION_THRESHOLD = 0.50
const MIN_QUERIES_FOR_GAP = 3

// =============================================================================
// RECORD QUERY
// =============================================================================

/**
 * Enregistre une query utilisateur avec son score RAG
 */
export async function recordQuery(options: RecordQueryOptions): Promise<string> {
  const {
    queryText,
    queryLanguage,
    ragScore,
    ragSourcesCount,
    userId,
    dossierId,
    docType,
    embedding,
  } = options

  try {
    const result = await db.query<{ record_active_learning_query: string }>(
      'SELECT record_active_learning_query($1, $2, $3, $4, $5, $6, $7, $8) as id',
      [
        queryText,
        queryLanguage,
        ragScore,
        ragSourcesCount,
        userId || null,
        dossierId || null,
        docType || null,
        embedding ? `[${embedding.join(',')}]` : null,
      ]
    )

    const queryId = result.rows[0]?.record_active_learning_query || ''

    if (ragScore < GAP_DETECTION_THRESHOLD) {
      console.log(
        `[Active Learning] Gap potentiel: "${queryText.substring(0, 50)}" (score: ${(ragScore * 100).toFixed(1)}%)`
      )
    }

    return queryId
  } catch (error) {
    console.error('[Active Learning] Erreur record query:', error)
    return ''
  }
}

// =============================================================================
// GET GAPS
// =============================================================================

/**
 * Récupère les gaps actifs avec statistiques
 */
export async function getActiveGaps(options: {
  limit?: number
  status?: 'active' | 'resolved' | 'ignored'
  minPriority?: 1 | 2 | 3 | 4
}): Promise<ActiveLearningGap[]> {
  const { limit = 50, status = 'active', minPriority = 4 } = options

  try {
    const result = await db.query<ActiveLearningGap>(
      `SELECT
        id,
        topic_name as "topicName",
        topic_keywords as "topicKeywords",
        query_count as "queryCount",
        avg_rag_score as "avgRagScore",
        priority,
        suggested_categories as "suggestedCategories",
        suggested_sources as "suggestedSources",
        first_seen_at as "firstSeenAt",
        last_seen_at as "lastSeenAt",
        status,
        queries_last_7d as "queriesLast7d",
        queries_last_24h as "queriesLast24h"
      FROM vw_active_learning_gaps_summary
      WHERE status = $1 AND priority <= $2
      ORDER BY priority ASC, query_count DESC
      LIMIT $3`,
      [status, minPriority, limit]
    )

    return result.rows
  } catch (error) {
    console.error('[Active Learning] Erreur get gaps:', error)
    return []
  }
}

export async function getActiveLearningStats(): Promise<{
  totalQueries: number
  queriesLast24h: number
  queriesLast7d: number
  totalGaps: number
  gapsActive: number
  gapsResolved: number
  avgRagScore: number
  gapsByPriority: Record<number, number>
}> {
  try {
    const result = await db.query(
      `SELECT
        (SELECT COUNT(*) FROM active_learning_queries) as total_queries,
        (SELECT COUNT(*) FROM active_learning_queries WHERE created_at >= NOW() - INTERVAL '24 hours') as queries_last_24h,
        (SELECT COUNT(*) FROM active_learning_queries WHERE created_at >= NOW() - INTERVAL '7 days') as queries_last_7d,
        (SELECT COUNT(*) FROM active_learning_gaps) as total_gaps,
        (SELECT COUNT(*) FROM active_learning_gaps WHERE status = 'active') as gaps_active,
        (SELECT COUNT(*) FROM active_learning_gaps WHERE status = 'resolved') as gaps_resolved,
        (SELECT ROUND(AVG(rag_score)::numeric, 3) FROM active_learning_queries) as avg_rag_score`
    )

    const row = result.rows[0]

    return {
      totalQueries: parseInt(row.total_queries) || 0,
      queriesLast24h: parseInt(row.queries_last_24h) || 0,
      queriesLast7d: parseInt(row.queries_last_7d) || 0,
      totalGaps: parseInt(row.total_gaps) || 0,
      gapsActive: parseInt(row.gaps_active) || 0,
      gapsResolved: parseInt(row.gaps_resolved) || 0,
      avgRagScore: parseFloat(row.avg_rag_score) || 0,
      gapsByPriority: {},
    }
  } catch (error) {
    console.error('[Active Learning] Erreur stats:', error)
    return {
      totalQueries: 0,
      queriesLast24h: 0,
      queriesLast7d: 0,
      totalGaps: 0,
      gapsActive: 0,
      gapsResolved: 0,
      avgRagScore: 0,
      gapsByPriority: {},
    }
  }
}

export async function resolveGap(
  gapId: string,
  resolvedBy: string,
  resolutionNotes?: string
): Promise<boolean> {
  try {
    await db.query(
      `UPDATE active_learning_gaps
       SET status = 'resolved', resolved_at = NOW(), resolved_by = $2, resolution_notes = $3
       WHERE id = $1`,
      [gapId, resolvedBy, resolutionNotes || null]
    )
    return true
  } catch (error) {
    console.error('[Active Learning] Erreur resolve gap:', error)
    return false
  }
}
