/**
 * Script de Test - Système Feedback RAG (Phase 5.1)
 *
 * Tests complets :
 * 1. POST /api/rag/feedback - Enregistrement feedback
 * 2. GET /api/admin/feedback/stats - Statistiques globales
 * 3. GET /api/admin/feedback/recent - Feedbacks récents
 * 4. Fonction SQL get_knowledge_gaps() - Identification gaps KB
 *
 * Usage: npm run test:feedback
 *
 * @module scripts/test-feedback-system
 */

import { db } from '@/lib/db/postgres'

// =============================================================================
// TYPES
// =============================================================================

interface FeedbackData {
  question: string
  rating: number
  feedbackType: string[]
  missingInfo?: string
  incorrectCitation?: string
  hallucinationDetails?: string
  suggestedSources?: string[]
  comment?: string
  domain?: string
  ragConfidence?: number
  sourcesCount?: number
  responseTimeMs?: number
}

interface TestResult {
  testName: string
  success: boolean
  duration: number
  details: any
  error?: string
}

// =============================================================================
// DONNÉES DE TEST
// =============================================================================

const SAMPLE_FEEDBACKS: FeedbackData[] = [
  {
    question:
      "Quelle est la procédure d'expulsion d'un locataire en Tunisie ?",
    rating: 5,
    feedbackType: [],
    comment: 'Réponse complète et bien sourcée',
    domain: 'droit_immobilier',
    ragConfidence: 0.92,
    sourcesCount: 8,
    responseTimeMs: 3500,
  },
  {
    question: "Quels sont les délais de prescription en matière pénale ?",
    rating: 3,
    feedbackType: ['incomplete'],
    missingInfo:
      'Manque distinction entre crimes, délits et contraventions',
    comment: 'Réponse trop générale',
    domain: 'droit_penal',
    ragConfidence: 0.65,
    sourcesCount: 4,
    responseTimeMs: 4200,
  },
  {
    question: "Comment calculer l'indemnité de licenciement abusif ?",
    rating: 2,
    feedbackType: ['incorrect_citation', 'missing_info'],
    incorrectCitation: 'Article 23 COT cité incorrectement',
    missingInfo: 'Manque jurisprudence récente sur le barème',
    suggestedSources: [
      'Arrêt Cassation n° 45678/2023',
      'Article 23 bis COT',
    ],
    comment: 'Nécessite mise à jour avec nouvelle loi 2023',
    domain: 'droit_travail',
    ragConfidence: 0.48,
    sourcesCount: 3,
    responseTimeMs: 5100,
  },
  {
    question: "Quelle est la procédure de divorce pour faute ?",
    rating: 1,
    feedbackType: ['hallucination'],
    hallucinationDetails:
      "L'arrêt n° 99999/2025 cité n'existe pas dans la jurisprudence tunisienne",
    comment: 'Citation inventée - problème critique',
    domain: 'droit_famille',
    ragConfidence: 0.72,
    sourcesCount: 6,
    responseTimeMs: 3800,
  },
  {
    question: "Quels sont les droits de succession en droit tunisien ?",
    rating: 4,
    feedbackType: [],
    comment: 'Bonne réponse mais manque exemples pratiques',
    domain: 'droit_famille',
    ragConfidence: 0.85,
    sourcesCount: 10,
    responseTimeMs: 4500,
  },
]

// =============================================================================
// UTILITAIRES
// =============================================================================

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(2)}s`
}

function printTestResult(result: TestResult): void {
  const status = result.success ? '✅ PASS' : '❌ FAIL'
  console.log(
    `\n${status} ${result.testName} (${formatDuration(result.duration)})`
  )
  if (result.success) {
    console.log('  Détails:', JSON.stringify(result.details, null, 2))
  } else {
    console.error('  Erreur:', result.error)
  }
}

// =============================================================================
// TEST 1 : Insertion Feedbacks en Base
// =============================================================================

async function testInsertFeedbacks(): Promise<TestResult> {
  const testName = 'Test 1 - Insertion Feedbacks DB'
  const start = Date.now()

  try {
    const insertedIds: string[] = []

    for (const feedback of SAMPLE_FEEDBACKS) {
      const insertQuery = `
        INSERT INTO rag_feedback (
          question,
          rating,
          feedback_type,
          missing_info,
          incorrect_citation,
          hallucination_details,
          suggested_sources,
          comment,
          domain,
          rag_confidence,
          sources_count,
          response_time_ms,
          user_role
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'lawyer')
        RETURNING id
      `

      const result = await db.query(insertQuery, [
        feedback.question,
        feedback.rating,
        feedback.feedbackType,
        feedback.missingInfo || null,
        feedback.incorrectCitation || null,
        feedback.hallucinationDetails || null,
        feedback.suggestedSources || null,
        feedback.comment || null,
        feedback.domain || null,
        feedback.ragConfidence || null,
        feedback.sourcesCount || null,
        feedback.responseTimeMs || null,
      ])

      insertedIds.push(result.rows[0].id)
    }

    const duration = Date.now() - start

    return {
      testName,
      success: true,
      duration,
      details: {
        inserted: insertedIds.length,
        ids: insertedIds,
      },
    }
  } catch (error) {
    return {
      testName,
      success: false,
      duration: Date.now() - start,
      details: {},
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

// =============================================================================
// TEST 2 : Fonction get_feedback_stats()
// =============================================================================

async function testGetFeedbackStats(): Promise<TestResult> {
  const testName = 'Test 2 - Fonction get_feedback_stats()'
  const start = Date.now()

  try {
    const result = await db.query(`SELECT * FROM get_feedback_stats($1)`, [7])

    if (!result.rows || result.rows.length === 0) {
      throw new Error('Aucune statistique retournée')
    }

    const stats = result.rows[0]
    const duration = Date.now() - start

    // Validation
    const totalFeedbacks = parseInt(stats.total_feedbacks, 10)
    const avgRating = parseFloat(stats.avg_rating)
    const satisfactionRate = parseFloat(stats.satisfaction_rate)
    const hallucinationRate = parseFloat(stats.hallucination_rate)

    if (totalFeedbacks < 5) {
      throw new Error(
        `Pas assez de feedbacks trouvés (${totalFeedbacks}, attendu ≥5)`
      )
    }

    if (avgRating < 1 || avgRating > 5) {
      throw new Error(`avg_rating invalide (${avgRating}, attendu 1-5)`)
    }

    if (satisfactionRate < 0 || satisfactionRate > 100) {
      throw new Error(
        `satisfaction_rate invalide (${satisfactionRate}%, attendu 0-100)`
      )
    }

    if (hallucinationRate < 0 || hallucinationRate > 100) {
      throw new Error(
        `hallucination_rate invalide (${hallucinationRate}%, attendu 0-100)`
      )
    }

    return {
      testName,
      success: true,
      duration,
      details: {
        total_feedbacks: totalFeedbacks,
        avg_rating: avgRating,
        satisfaction_rate: `${satisfactionRate}%`,
        hallucination_rate: `${hallucinationRate}%`,
        avg_response_time: `${stats.avg_response_time}ms`,
        most_common_issue: stats.most_common_issue,
      },
    }
  } catch (error) {
    return {
      testName,
      success: false,
      duration: Date.now() - start,
      details: {},
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

// =============================================================================
// TEST 3 : Vue vw_feedback_stats_by_domain
// =============================================================================

async function testFeedbackStatsByDomain(): Promise<TestResult> {
  const testName = 'Test 3 - Vue vw_feedback_stats_by_domain'
  const start = Date.now()

  try {
    const result = await db.query(`SELECT * FROM vw_feedback_stats_by_domain`)

    if (!result.rows || result.rows.length === 0) {
      throw new Error('Aucune statistique par domaine retournée')
    }

    const duration = Date.now() - start

    const stats = result.rows.map(row => ({
      domain: row.domain,
      total_feedbacks: parseInt(row.total_feedbacks, 10),
      avg_rating: parseFloat(row.avg_rating),
      positive_count: parseInt(row.positive_count, 10),
      negative_count: parseInt(row.negative_count, 10),
      hallucination_count: parseInt(row.hallucination_count, 10),
      missing_info_count: parseInt(row.missing_info_count, 10),
      incorrect_citation_count: parseInt(row.incorrect_citation_count, 10),
    }))

    // Validation
    const domainsExpected = [
      'droit_immobilier',
      'droit_penal',
      'droit_travail',
      'droit_famille',
    ]
    const domainsFound = stats.map(s => s.domain)

    for (const domain of domainsExpected) {
      if (!domainsFound.includes(domain)) {
        throw new Error(`Domaine manquant: ${domain}`)
      }
    }

    return {
      testName,
      success: true,
      duration,
      details: {
        domains_count: stats.length,
        stats,
      },
    }
  } catch (error) {
    return {
      testName,
      success: false,
      duration: Date.now() - start,
      details: {},
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

// =============================================================================
// TEST 4 : Vue vw_feedback_unresolved_priority
// =============================================================================

async function testFeedbackUnresolvedPriority(): Promise<TestResult> {
  const testName = 'Test 4 - Vue vw_feedback_unresolved_priority'
  const start = Date.now()

  try {
    const result = await db.query(
      `SELECT * FROM vw_feedback_unresolved_priority LIMIT 10`
    )

    const duration = Date.now() - start

    const feedbacks = result.rows.map(row => ({
      id: row.id,
      question: row.question.substring(0, 60) + '...',
      rating: row.rating,
      feedbackType: row.feedback_type,
      domain: row.domain,
      rag_confidence: row.rag_confidence,
      sources_count: row.sources_count,
      priority_score: row.priority_score,
      created_at: row.created_at,
    }))

    // Validation : priorité décroissante
    for (let i = 0; i < feedbacks.length - 1; i++) {
      if (feedbacks[i].priority_score < feedbacks[i + 1].priority_score) {
        throw new Error(
          `Ordre priorité invalide à index ${i} (${feedbacks[i].priority_score} < ${feedbacks[i + 1].priority_score})`
        )
      }
    }

    // Validation : hallucination doit avoir priorité élevée
    const hallucinationFeedback = feedbacks.find(f =>
      f.feedbackType?.includes('hallucination')
    )
    if (hallucinationFeedback && hallucinationFeedback.priority_score < 5) {
      throw new Error(
        `Hallucination doit avoir priority_score ≥5 (trouvé ${hallucinationFeedback.priority_score})`
      )
    }

    return {
      testName,
      success: true,
      duration,
      details: {
        unresolved_count: feedbacks.length,
        top_3_priorities: feedbacks
          .slice(0, 3)
          .map(f => ({ question: f.question, priority: f.priority_score })),
      },
    }
  } catch (error) {
    return {
      testName,
      success: false,
      duration: Date.now() - start,
      details: {},
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

// =============================================================================
// TEST 5 : Fonction get_knowledge_gaps()
// =============================================================================

async function testGetKnowledgeGaps(): Promise<TestResult> {
  const testName = 'Test 5 - Fonction get_knowledge_gaps()'
  const start = Date.now()

  try {
    // min_occurrences=1 pour test (pas 3 par défaut)
    const result = await db.query(
      `SELECT * FROM get_knowledge_gaps($1, $2, $3)`,
      [1, 3, 30]
    )

    const duration = Date.now() - start

    const gaps = result.rows.map(row => ({
      topic: row.topic,
      occurrence_count: parseInt(row.occurrence_count, 10),
      avg_rating: parseFloat(row.avg_rating),
      suggested_sources: row.suggested_sources || [],
      example_questions: (row.example_questions || []).map((q: string) =>
        q.substring(0, 60)
      ),
    }))

    // Validation
    for (const gap of gaps) {
      if (gap.avg_rating > 3) {
        throw new Error(
          `Gap avec avg_rating trop élevé (${gap.avg_rating}, attendu ≤3)`
        )
      }
    }

    // Vérifier que droit_travail apparaît (rating 2)
    const droitTravailGap = gaps.find(g => g.topic === 'droit_travail')
    if (!droitTravailGap) {
      throw new Error('Gap droit_travail attendu (feedback rating=2)')
    }

    return {
      testName,
      success: true,
      duration,
      details: {
        gaps_count: gaps.length,
        gaps,
      },
    }
  } catch (error) {
    return {
      testName,
      success: false,
      duration: Date.now() - start,
      details: {},
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

// =============================================================================
// TEST 6 : Vérification Contraintes CHECK
// =============================================================================

async function testConstraints(): Promise<TestResult> {
  const testName = 'Test 6 - Contraintes CHECK'
  const start = Date.now()

  try {
    // Test 1: rating hors bornes
    try {
      await db.query(
        `INSERT INTO rag_feedback (question, rating) VALUES ($1, $2)`,
        ['Test', 6]
      )
      throw new Error('Constraint CHECK rating ≤5 non appliquée')
    } catch (err: any) {
      if (!err.message.includes('rag_feedback_rating_check')) {
        throw err
      }
    }

    // Test 2: feedback_type invalide
    try {
      await db.query(
        `INSERT INTO rag_feedback (question, rating, feedback_type) VALUES ($1, $2, $3)`,
        ['Test', 3, ['invalid_type']]
      )
      throw new Error('Constraint CHECK feedback_type non appliquée')
    } catch (err: any) {
      if (!err.message.includes('feedback_type_valid')) {
        throw err
      }
    }

    const duration = Date.now() - start

    return {
      testName,
      success: true,
      duration,
      details: {
        constraints_validated: [
          'rating BETWEEN 1 AND 5',
          'feedback_type IN valid_values',
        ],
      },
    }
  } catch (error) {
    return {
      testName,
      success: false,
      duration: Date.now() - start,
      details: {},
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

// =============================================================================
// NETTOYAGE
// =============================================================================

async function cleanup(): Promise<void> {
  console.log('\n🧹 Nettoyage feedbacks de test...')
  await db.query(`DELETE FROM rag_feedback WHERE user_role = 'lawyer'`)
  console.log('✅ Feedbacks de test supprimés')
}

// =============================================================================
// MAIN
// =============================================================================

async function main() {
  console.log('🚀 Test Système Feedback RAG (Phase 5.1)\n')
  console.log('=' .repeat(70))

  const results: TestResult[] = []

  try {
    // Test 1: Insertion
    results.push(await testInsertFeedbacks())
    printTestResult(results[results.length - 1])

    // Test 2: Stats globales
    results.push(await testGetFeedbackStats())
    printTestResult(results[results.length - 1])

    // Test 3: Stats par domaine
    results.push(await testFeedbackStatsByDomain())
    printTestResult(results[results.length - 1])

    // Test 4: Priorité non résolus
    results.push(await testFeedbackUnresolvedPriority())
    printTestResult(results[results.length - 1])

    // Test 5: Knowledge gaps
    results.push(await testGetKnowledgeGaps())
    printTestResult(results[results.length - 1])

    // Test 6: Contraintes
    results.push(await testConstraints())
    printTestResult(results[results.length - 1])

    // Résumé
    console.log('\n' + '='.repeat(70))
    console.log('📊 RÉSUMÉ\n')

    const passed = results.filter(r => r.success).length
    const failed = results.filter(r => !r.success).length
    const totalDuration = results.reduce((sum, r) => sum + r.duration, 0)

    console.log(`✅ Tests réussis : ${passed}/${results.length}`)
    console.log(`❌ Tests échoués : ${failed}/${results.length}`)
    console.log(`⏱️  Durée totale  : ${formatDuration(totalDuration)}`)

    if (failed > 0) {
      console.log('\n❌ ÉCHEC : Certains tests ont échoué')
      console.log(
        '\nTests échoués:',
        results
          .filter(r => !r.success)
          .map(r => `\n  - ${r.testName}: ${r.error}`)
          .join('')
      )
      await cleanup()
      process.exit(1)
    }

    console.log('\n✅ SUCCÈS : Tous les tests sont passés')

    // Nettoyage
    await cleanup()
  } catch (error) {
    console.error('\n💥 Erreur fatale:', error)
    await cleanup()
    process.exit(1)
  } finally {
    await db.end()
  }
}

// Exécution
main().catch(error => {
  console.error('💥 Erreur non gérée:', error)
  process.exit(1)
})
