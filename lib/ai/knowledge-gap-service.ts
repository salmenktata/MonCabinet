/**
 * Service d'analyse des lacunes de connaissances (Knowledge Gaps)
 *
 * Analyse les abstentions RAG pour identifier les domaines juridiques
 * mal couverts par la Base de Connaissances et prioriser les acquisitions.
 *
 * Boucle fermée :
 * 1. rag_query_log → abstentions par domaine
 * 2. Priorisation (volume + similarité)
 * 3. Persistence dans knowledge_gaps
 * 4. Alerte email si gaps high-priority
 * 5. Vérification résolution automatique (nouveaux chunks indexés)
 *
 * Appelé par le cron gap-analysis (lundi 10h CET).
 *
 * @module lib/ai/knowledge-gap-service
 */

import { db } from '@/lib/db/postgres'
import { sendEmail } from '@/lib/email/brevo'
import { getRedisClient } from '@/lib/cache/redis'

// =============================================================================
// TYPES
// =============================================================================

export interface KnowledgeGap {
  id?: string
  domain: string
  abstentionCount: number
  avgSimilarity: number | null
  priority: 'high' | 'medium' | 'low'
  exampleQueries: string[]
  suggestedSources: string[]
  status: 'open' | 'in_progress' | 'resolved'
  createdAt?: string
}

export interface GapAnalysisResult {
  period: { from: string; to: string; daysBack: number }
  totalAbstentions: number
  gaps: KnowledgeGap[]
  newHighPriorityGaps: number    // Nouveaux gaps high-priority (email alert si > 0)
  resolvedGaps: number            // Gaps précédemment 'open' maintenant comblés
}

// =============================================================================
// ANALYSE
// =============================================================================

const ALERT_ANTI_SPAM_TTL = 6 * 60 * 60 // 6h

/**
 * Analyse les abstentions des N derniers jours et identifie les gaps.
 * Priorité :
 * - high   : abstentionCount >= 10 OU avgSimilarity < 0.20
 * - medium : abstentionCount 3-9 OU avgSimilarity 0.20-0.30
 * - low    : abstentionCount 1-2
 */
export async function analyzeKnowledgeGaps(daysBack = 7): Promise<GapAnalysisResult> {
  const from = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000).toISOString()
  const to = new Date().toISOString()

  // Agréger les abstentions par domaine
  const abstentionResult = await db.query(
    `SELECT
       COALESCE(domain, 'unknown') as domain,
       COUNT(*) as abstention_count,
       ROUND(AVG(avg_similarity)::numeric, 3) as avg_similarity,
       ARRAY_AGG(question ORDER BY created_at DESC) FILTER (WHERE question IS NOT NULL) as questions
     FROM rag_query_log
     WHERE abstention_reason IS NOT NULL
       AND created_at >= $1
     GROUP BY domain
     ORDER BY abstention_count DESC
     LIMIT 20`,
    [from]
  )

  // Total abstentions sur la période
  const totalResult = await db.query(
    `SELECT COUNT(*) as total FROM rag_query_log
     WHERE abstention_reason IS NOT NULL AND created_at >= $1`,
    [from]
  )
  const totalAbstentions = parseInt(totalResult.rows[0]?.total) || 0

  // Construire les gaps
  const gaps: KnowledgeGap[] = abstentionResult.rows.map(row => {
    const abstentionCount = parseInt(row.abstention_count) || 0
    const avgSim = row.avg_similarity ? parseFloat(row.avg_similarity) : null
    const priority = computePriority(abstentionCount, avgSim)

    // Dédupliquer et tronquer les exemples de queries
    const allQuestions: string[] = row.questions || []
    const uniqueQuestions = [...new Set(allQuestions.map(q => q.substring(0, 200)))]
    const exampleQueries = uniqueQuestions.slice(0, 5)

    return {
      domain: row.domain,
      abstentionCount,
      avgSimilarity: avgSim,
      priority,
      exampleQueries,
      suggestedSources: suggestSources(row.domain),
      status: 'open',
    }
  })

  return { period: { from, to, daysBack }, totalAbstentions, gaps, newHighPriorityGaps: 0, resolvedGaps: 0 }
}

function computePriority(
  abstentionCount: number,
  avgSimilarity: number | null
): 'high' | 'medium' | 'low' {
  if (abstentionCount >= 10 || (avgSimilarity !== null && avgSimilarity < 0.20)) {
    return 'high'
  }
  if (abstentionCount >= 3 || (avgSimilarity !== null && avgSimilarity < 0.30)) {
    return 'medium'
  }
  return 'low'
}

/**
 * Heuristique : suggère des sources probables selon le domaine.
 */
function suggestSources(domain: string): string[] {
  const suggestions: Record<string, string[]> = {
    droit_civil:    ['9anoun.tn/codes/coc', 'JORT textes civils'],
    droit_penal:    ['9anoun.tn/codes/cpp', 'JORT textes pénaux', 'cassation.tn/penal'],
    procedure:      ['9anoun.tn/codes/cpcc', 'JORT procédure civile'],
    travail:        ['9anoun.tn/codes/ct', 'JORT droit du travail'],
    famille:        ['9anoun.tn/codes/csp', '9anoun.tn/codes/cspa'],
    commercial:     ['9anoun.tn/codes/commerce', 'JORT commercial'],
    fiscal:         ['9anoun.tn/codes/cir', 'JORT fiscal'],
    administratif:  ['JORT décrets', 'iort.gov.tn'],
    unknown:        ['9anoun.tn', 'iort.gov.tn'],
  }
  return suggestions[domain] || suggestions.unknown
}

// =============================================================================
// PERSISTENCE
// =============================================================================

/**
 * Persiste les gaps analysés dans knowledge_gaps.
 * Ne crée que les NOUVEAUX gaps (pas de doublons par domain + période).
 * Retourne le nombre de gaps high-priority nouvellement créés.
 */
export async function persistGaps(
  gaps: KnowledgeGap[],
  daysBack: number
): Promise<{ newHighPriority: number }> {
  let newHighPriority = 0

  for (const gap of gaps) {
    // Vérifier si un gap récent existe déjà pour ce domaine (< 7 jours)
    const existing = await db.query(
      `SELECT id FROM knowledge_gaps
       WHERE domain = $1 AND status = 'open' AND created_at >= NOW() - INTERVAL '7 days'
       LIMIT 1`,
      [gap.domain]
    )

    if (existing.rows.length > 0) {
      // Mettre à jour le gap existant si les stats ont changé
      await db.query(
        `UPDATE knowledge_gaps
         SET abstention_count = $1, avg_similarity = $2, priority = $3,
             example_queries = $4, updated_at = NOW()
         WHERE id = $5`,
        [
          gap.abstentionCount,
          gap.avgSimilarity,
          gap.priority,
          gap.exampleQueries,
          existing.rows[0].id,
        ]
      )
    } else {
      // Créer un nouveau gap
      await db.query(
        `INSERT INTO knowledge_gaps (
          domain, abstention_count, avg_similarity, priority,
          example_queries, suggested_sources, status, analysis_period_days
        ) VALUES ($1, $2, $3, $4, $5, $6, 'open', $7)`,
        [
          gap.domain,
          gap.abstentionCount,
          gap.avgSimilarity,
          gap.priority,
          gap.exampleQueries,
          gap.suggestedSources,
          daysBack,
        ]
      )

      if (gap.priority === 'high') {
        newHighPriority++
      }
    }
  }

  return { newHighPriority }
}

// =============================================================================
// VÉRIFICATION RÉSOLUTION
// =============================================================================

/**
 * Vérifie si les gaps 'open' ont été comblés depuis leur création.
 * Un gap est considéré résolu si de nouveaux chunks ont été indexés
 * dans ce domaine depuis la création du gap.
 */
export async function checkAndResolveGaps(): Promise<number> {
  // Limiter à 50 gaps par run pour éviter N×2 requêtes séquentielles non bornées
  const openGaps = await db.query(
    `SELECT id, domain, created_at FROM knowledge_gaps WHERE status = 'open' LIMIT 50`
  )

  if (openGaps.rows.length === 0) return 0

  // Une seule requête batch pour compter les nouveaux chunks par gap
  const gapCountsResult = await db.query(
    `SELECT
       kg.id,
       COUNT(kbc.id) as new_chunk_count
     FROM knowledge_gaps kg
     LEFT JOIN knowledge_base_chunks kbc
       ON kbc.metadata->>'domain' = kg.domain
       AND kbc.created_at > kg.created_at
       AND EXISTS (
         SELECT 1 FROM knowledge_base kb
         WHERE kb.id = kbc.knowledge_base_id
           AND kb.is_indexed = true
           AND kb.rag_enabled = true
       )
     WHERE kg.id = ANY($1::uuid[])
     GROUP BY kg.id`,
    [openGaps.rows.map(g => g.id)]
  )

  const countMap = new Map<string, number>(
    gapCountsResult.rows.map(r => [r.id, parseInt(r.new_chunk_count) || 0])
  )

  // Résoudre en batch les gaps avec >= 5 nouveaux chunks
  const toResolve = openGaps.rows.filter(g => (countMap.get(g.id) || 0) >= 5)
  if (toResolve.length === 0) return 0

  const ids = toResolve.map(g => g.id)
  const notes = toResolve.map(g =>
    `${countMap.get(g.id)} nouveaux chunks indexés dans ce domaine depuis la détection du gap.`
  )

  await db.query(
    `UPDATE knowledge_gaps
     SET status = 'resolved', resolved_at = NOW(),
         resolution_notes = data.note, updated_at = NOW()
     FROM (
       SELECT unnest($1::uuid[]) as id, unnest($2::text[]) as note
     ) as data
     WHERE knowledge_gaps.id = data.id`,
    [ids, notes]
  )

  return toResolve.length
}

// =============================================================================
// ALERTE EMAIL
// =============================================================================

export async function sendGapAlertEmail(
  gaps: KnowledgeGap[],
  newHighPriority: number
): Promise<void> {
  if (newHighPriority === 0) return

  try {
    // Anti-spam Redis 6h
    const redis = await getRedisClient()
    const SPAM_KEY = 'alert:knowledge-gaps:last_sent'
    if (redis) {
      const lastSent = await redis.get(SPAM_KEY)
      if (lastSent) return
      await redis.set(SPAM_KEY, new Date().toISOString(), { EX: ALERT_ANTI_SPAM_TTL })
    }

    const ALERT_EMAIL = process.env.ALERT_EMAIL || 'admin@qadhya.tn'
    const highGaps = gaps.filter(g => g.priority === 'high')

    const gapsHtml = highGaps.map(g => `
      <tr>
        <td style="padding:8px;border:1px solid #e5e7eb">${g.domain}</td>
        <td style="padding:8px;border:1px solid #e5e7eb;text-align:center">${g.abstentionCount}</td>
        <td style="padding:8px;border:1px solid #e5e7eb;text-align:center">
          ${g.avgSimilarity ? (g.avgSimilarity * 100).toFixed(0) + '%' : 'N/A'}
        </td>
        <td style="padding:8px;border:1px solid #e5e7eb;font-size:12px">
          ${g.exampleQueries.slice(0, 2).join('<br>')}
        </td>
      </tr>`).join('')

    await sendEmail({
      to: ALERT_EMAIL,
      subject: `[Qadhya] ${newHighPriority} nouveau${newHighPriority > 1 ? 'x' : ''} gap${newHighPriority > 1 ? 's' : ''} KB haute priorité`,
      htmlContent: `
        <div style="font-family:Arial,sans-serif;max-width:700px;margin:0 auto">
          <div style="background:#d97706;color:white;padding:20px;border-radius:8px 8px 0 0">
            <h2 style="margin:0">⚠️ Lacunes KB détectées — Qadhya RAG</h2>
          </div>
          <div style="background:#f9fafb;padding:20px;border-radius:0 0 8px 8px">
            <p><strong>${newHighPriority} nouveau${newHighPriority > 1 ? 'x' : ''} gap${newHighPriority > 1 ? 's' : ''} haute priorité</strong> identifié${newHighPriority > 1 ? 's' : ''}.</p>
            <table style="width:100%;border-collapse:collapse;margin-top:16px">
              <thead>
                <tr style="background:#fef3c7">
                  <th style="padding:8px;border:1px solid #e5e7eb;text-align:left">Domaine</th>
                  <th style="padding:8px;border:1px solid #e5e7eb">Abstentions</th>
                  <th style="padding:8px;border:1px solid #e5e7eb">Similarité moy.</th>
                  <th style="padding:8px;border:1px solid #e5e7eb;text-align:left">Exemples</th>
                </tr>
              </thead>
              <tbody>${gapsHtml}</tbody>
            </table>
            <p style="margin-top:16px">
              Consulter <code>/super-admin/monitoring</code> onglet "Knowledge Gaps" pour déclencher l'acquisition.
            </p>
            <p style="font-size:12px;color:#6b7280">Qadhya Gap Analysis — ${new Date().toISOString()}</p>
          </div>
        </div>`,
      tags: ['knowledge-gaps-alert'],
    })

    console.log(`[KnowledgeGaps] 📧 Alerte envoyée : ${newHighPriority} gaps haute priorité`)
  } catch (err) {
    console.error('[KnowledgeGaps] Erreur envoi email:', err instanceof Error ? err.message : err)
  }
}

// =============================================================================
// STATS DASHBOARD
// =============================================================================

export async function getKnowledgeGapStats(): Promise<{
  total: number
  byStatus: { open: number; in_progress: number; resolved: number }
  byPriority: { high: number; medium: number; low: number }
  recentGaps: KnowledgeGap[]
}> {
  try {
    const [statsResult, recentResult] = await Promise.all([
      db.query(
        `SELECT
           COUNT(*) as total,
           COUNT(*) FILTER (WHERE status = 'open') as open_count,
           COUNT(*) FILTER (WHERE status = 'in_progress') as in_progress_count,
           COUNT(*) FILTER (WHERE status = 'resolved') as resolved_count,
           COUNT(*) FILTER (WHERE priority = 'high' AND status = 'open') as high_count,
           COUNT(*) FILTER (WHERE priority = 'medium' AND status = 'open') as medium_count,
           COUNT(*) FILTER (WHERE priority = 'low' AND status = 'open') as low_count
         FROM knowledge_gaps`
      ),
      db.query(
        `SELECT id, domain, abstention_count, avg_similarity, priority,
                example_queries, suggested_sources, status, created_at
         FROM knowledge_gaps
         WHERE status = 'open'
         ORDER BY
           CASE priority WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
           abstention_count DESC
         LIMIT 10`
      ),
    ])

    const s = statsResult.rows[0]
    return {
      total: parseInt(s.total) || 0,
      byStatus: {
        open: parseInt(s.open_count) || 0,
        in_progress: parseInt(s.in_progress_count) || 0,
        resolved: parseInt(s.resolved_count) || 0,
      },
      byPriority: {
        high: parseInt(s.high_count) || 0,
        medium: parseInt(s.medium_count) || 0,
        low: parseInt(s.low_count) || 0,
      },
      recentGaps: recentResult.rows.map(r => ({
        id: r.id,
        domain: r.domain,
        abstentionCount: parseInt(r.abstention_count) || 0,
        avgSimilarity: r.avg_similarity ? parseFloat(r.avg_similarity) : null,
        priority: r.priority,
        exampleQueries: r.example_queries || [],
        suggestedSources: r.suggested_sources || [],
        status: r.status,
        createdAt: r.created_at,
      })),
    }
  } catch {
    return {
      total: 0,
      byStatus: { open: 0, in_progress: 0, resolved: 0 },
      byPriority: { high: 0, medium: 0, low: 0 },
      recentGaps: [],
    }
  }
}
