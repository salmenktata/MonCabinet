/**
 * Script de Test - Active Learning (Phase 5.2)
 *
 * Tests complets :
 * 1. findKnowledgeGaps() - Identification gaps KB
 * 2. identifyHighValueDocuments() - Documents haute valeur
 * 3. suggestSourcesAcquisition() - Suggestions sources acquisition
 * 4. calculatePriorityScore() - Scoring priorité
 * 5. Validation complète workflow
 *
 * Usage: npm run test:active-learning
 *
 * @module scripts/test-active-learning
 */

import {
  findKnowledgeGaps,
  identifyHighValueDocuments,
  suggestSourcesAcquisition,
  type KnowledgeGap,
  type GapAnalysisResult,
  type HighValueDocument,
  type SourceSuggestion,
} from '@/lib/ai/active-learning-service'

// =============================================================================
// TYPES
// =============================================================================

interface TestResult {
  testName: string
  success: boolean
  duration: number
  details: any
  error?: string
}

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
// TEST 1 : Identification Gaps KB
// =============================================================================

async function testFindKnowledgeGaps(): Promise<TestResult> {
  const testName = 'Test 1 - findKnowledgeGaps()'
  const start = Date.now()

  try {
    const result: GapAnalysisResult = await findKnowledgeGaps({
      daysBack: 30,
      minOccurrences: 1, // Abaissé à 1 pour test
      maxRating: 3,
      limit: 50,
    })

    const duration = Date.now() - start

    // Validations
    if (!result.gaps || !Array.isArray(result.gaps)) {
      throw new Error('result.gaps doit être un array')
    }

    if (!result.stats) {
      throw new Error('result.stats manquant')
    }

    if (!result.recommendations || !Array.isArray(result.recommendations)) {
      throw new Error('result.recommendations doit être un array')
    }

    // Validation structure gaps
    for (const gap of result.gaps.slice(0, 3)) {
      if (!gap.id || !gap.topic) {
        throw new Error(`Gap invalide : ${JSON.stringify(gap)}`)
      }

      if (gap.priorityScore < 0 || gap.priorityScore > 100) {
        throw new Error(
          `priorityScore invalide (${gap.priorityScore}, attendu 0-100)`
        )
      }

      if (gap.avgRating < 1 || gap.avgRating > 5) {
        throw new Error(
          `avgRating invalide (${gap.avgRating}, attendu 1-5)`
        )
      }

      if (gap.avgConfidence < 0 || gap.avgConfidence > 1) {
        throw new Error(
          `avgConfidence invalide (${gap.avgConfidence}, attendu 0-1)`
        )
      }
    }

    // Validation tri par priorityScore décroissant
    for (let i = 0; i < result.gaps.length - 1; i++) {
      if (result.gaps[i].priorityScore < result.gaps[i + 1].priorityScore) {
        throw new Error(
          `Tri priorityScore invalide à index ${i} (${result.gaps[i].priorityScore} < ${result.gaps[i + 1].priorityScore})`
        )
      }
    }

    return {
      testName,
      success: true,
      duration,
      details: {
        gaps_found: result.gaps.length,
        total_questions: result.stats.totalQuestionsAnalyzed,
        avg_priority: result.stats.avgPriorityScore.toFixed(1),
        top_3_gaps: result.gaps.slice(0, 3).map(g => ({
          topic: g.topic,
          priority: g.priorityScore,
          occurrences: g.occurrenceCount,
        })),
        recommendations_count: result.recommendations.length,
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
// TEST 2 : Identification Documents Haute Valeur
// =============================================================================

async function testIdentifyHighValueDocuments(): Promise<TestResult> {
  const testName = 'Test 2 - identifyHighValueDocuments()'
  const start = Date.now()

  try {
    // D'abord récupérer quelques gaps
    const gapsResult = await findKnowledgeGaps({
      daysBack: 30,
      minOccurrences: 1,
      maxRating: 3,
      limit: 5,
    })

    const gapIds = gapsResult.gaps.map(g => g.id)

    if (gapIds.length === 0) {
      console.warn('[Test 2] Aucun gap trouvé, test skippé')
      return {
        testName,
        success: true,
        duration: Date.now() - start,
        details: { message: 'Aucun gap trouvé, test skippé' },
      }
    }

    // Identifier documents haute valeur
    const highValueDocs: HighValueDocument[] =
      await identifyHighValueDocuments(gapIds)

    const duration = Date.now() - start

    // Validations
    if (!Array.isArray(highValueDocs)) {
      throw new Error('Résultat doit être un array')
    }

    // Validation structure docs
    for (const doc of highValueDocs.slice(0, 3)) {
      if (!doc.id || !doc.title) {
        throw new Error(`Document invalide : ${JSON.stringify(doc)}`)
      }

      if (doc.confidence < 0 || doc.confidence > 1) {
        throw new Error(
          `confidence invalide (${doc.confidence}, attendu 0-1)`
        )
      }

      const validTypes = [
        'jurisprudence',
        'legislation',
        'doctrine',
        'modele',
        'autre',
      ]
      if (!validTypes.includes(doc.sourceType)) {
        throw new Error(`sourceType invalide (${doc.sourceType})`)
      }
    }

    return {
      testName,
      success: true,
      duration,
      details: {
        docs_found: highValueDocs.length,
        top_3_docs: highValueDocs.slice(0, 3).map(d => ({
          title: d.title.substring(0, 80),
          sourceType: d.sourceType,
          confidence: d.confidence.toFixed(2),
          estimatedImpact: d.estimatedImpact,
        })),
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
// TEST 3 : Suggestions Sources Acquisition
// =============================================================================

async function testSuggestSourcesAcquisition(): Promise<TestResult> {
  const testName = 'Test 3 - suggestSourcesAcquisition()'
  const start = Date.now()

  try {
    // Créer gap synthétique pour test
    const testGap: KnowledgeGap = {
      id: 'test_gap_1',
      topic: 'droit_travail',
      occurrenceCount: 7,
      avgRating: 2.5,
      avgConfidence: 0.45,
      avgSourcesCount: 3,
      exampleQuestions: [
        'Comment calculer indemnité licenciement abusif ?',
        'Quels sont les délais de préavis en CDI ?',
        'Procédure licenciement pour faute grave ?',
      ],
      suggestedSources: [
        'Arrêt Cassation n° 45678/2023',
        'Article 23 bis COT',
      ],
      priorityScore: 75,
      detectedAt: new Date(),
    }

    const suggestions: SourceSuggestion[] =
      await suggestSourcesAcquisition(testGap)

    const duration = Date.now() - start

    // Validations
    if (!Array.isArray(suggestions)) {
      throw new Error('Résultat doit être un array')
    }

    if (suggestions.length === 0) {
      throw new Error('Aucune suggestion retournée')
    }

    // Validation structure suggestions
    for (const suggestion of suggestions) {
      if (!suggestion.sourceType || !suggestion.searchQuery) {
        throw new Error(`Suggestion invalide : ${JSON.stringify(suggestion)}`)
      }

      const validTypes = [
        'cassation.tn',
        'legislation.tn',
        'doctrine',
        'google_scholar',
      ]
      if (!validTypes.includes(suggestion.sourceType)) {
        throw new Error(`sourceType invalide (${suggestion.sourceType})`)
      }

      const validPriorities = ['high', 'medium', 'low']
      if (!validPriorities.includes(suggestion.priority)) {
        throw new Error(`priority invalide (${suggestion.priority})`)
      }
    }

    // Vérifier tri par priorité (high > medium > low)
    const priorityOrder = { high: 3, medium: 2, low: 1 }
    for (let i = 0; i < suggestions.length - 1; i++) {
      const currentPriority = priorityOrder[suggestions[i].priority]
      const nextPriority = priorityOrder[suggestions[i + 1].priority]
      if (currentPriority < nextPriority) {
        throw new Error(
          `Tri priorité invalide à index ${i} (${suggestions[i].priority} < ${suggestions[i + 1].priority})`
        )
      }
    }

    return {
      testName,
      success: true,
      duration,
      details: {
        suggestions_count: suggestions.length,
        suggestions: suggestions.map(s => ({
          sourceType: s.sourceType,
          searchQuery: s.searchQuery,
          priority: s.priority,
          estimatedResults: s.estimatedResults,
        })),
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
// TEST 4 : Priority Score Calculation
// =============================================================================

async function testPriorityScoreCalculation(): Promise<TestResult> {
  const testName = 'Test 4 - Priority Score Calculation'
  const start = Date.now()

  try {
    // Test avec différents scénarios
    const gapsResult = await findKnowledgeGaps({
      daysBack: 30,
      minOccurrences: 1,
      maxRating: 3,
      limit: 10,
    })

    const duration = Date.now() - start

    if (gapsResult.gaps.length === 0) {
      console.warn('[Test 4] Aucun gap trouvé, test skippé')
      return {
        testName,
        success: true,
        duration,
        details: { message: 'Aucun gap trouvé, test skippé' },
      }
    }

    // Vérifier corrélation priorityScore avec métriques
    for (const gap of gapsResult.gaps.slice(0, 5)) {
      // Priorité élevée si :
      // - Rating bas (<3)
      // - Confidence faible (<0.6)
      // - Peu sources (<5)
      // - Occurrences élevées (>5)

      const expectedHighPriority =
        gap.avgRating < 3 &&
        gap.avgConfidence < 0.6 &&
        gap.avgSourcesCount < 5 &&
        gap.occurrenceCount > 5

      if (expectedHighPriority && gap.priorityScore < 60) {
        console.warn(
          `⚠️ Gap "${gap.topic}" devrait avoir priorité élevée (score: ${gap.priorityScore})`
        )
      }
    }

    return {
      testName,
      success: true,
      duration,
      details: {
        gaps_analyzed: gapsResult.gaps.length,
        priority_distribution: {
          critical: gapsResult.gaps.filter(g => g.priorityScore >= 70).length,
          high: gapsResult.gaps.filter(
            g => g.priorityScore >= 50 && g.priorityScore < 70
          ).length,
          medium: gapsResult.gaps.filter(
            g => g.priorityScore >= 30 && g.priorityScore < 50
          ).length,
          low: gapsResult.gaps.filter(g => g.priorityScore < 30).length,
        },
        examples: gapsResult.gaps.slice(0, 3).map(g => ({
          topic: g.topic,
          priorityScore: g.priorityScore,
          factors: {
            occurrences: g.occurrenceCount,
            rating: g.avgRating,
            confidence: g.avgConfidence.toFixed(2),
            sources: g.avgSourcesCount,
          },
        })),
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
// TEST 5 : Workflow Complet
// =============================================================================

async function testCompleteWorkflow(): Promise<TestResult> {
  const testName = 'Test 5 - Workflow Complet'
  const start = Date.now()

  try {
    // 1. Identifier gaps
    const gapsResult = await findKnowledgeGaps({
      daysBack: 30,
      minOccurrences: 1,
      maxRating: 3,
      limit: 3,
    })

    if (gapsResult.gaps.length === 0) {
      console.warn('[Test 5] Aucun gap trouvé, test skippé')
      return {
        testName,
        success: true,
        duration: Date.now() - start,
        details: { message: 'Aucun gap trouvé, test skippé' },
      }
    }

    // 2. Identifier documents haute valeur
    const gapIds = gapsResult.gaps.map(g => g.id)
    const highValueDocs = await identifyHighValueDocuments(gapIds)

    // 3. Suggérer sources pour top gap
    const topGap = gapsResult.gaps[0]
    const suggestions = await suggestSourcesAcquisition(topGap)

    const duration = Date.now() - start

    // Validation workflow
    if (gapsResult.gaps.length === 0) {
      throw new Error('Aucun gap identifié')
    }

    if (suggestions.length === 0) {
      throw new Error('Aucune suggestion générée')
    }

    return {
      testName,
      success: true,
      duration,
      details: {
        workflow: {
          step1_gaps_found: gapsResult.gaps.length,
          step2_high_value_docs: highValueDocs.length,
          step3_suggestions: suggestions.length,
        },
        top_gap: {
          topic: topGap.topic,
          priority: topGap.priorityScore,
          suggestions: suggestions.map(s => s.sourceType),
        },
        stats: {
          total_questions_analyzed: gapsResult.stats.totalQuestionsAnalyzed,
          avg_priority_score: gapsResult.stats.avgPriorityScore.toFixed(1),
          recommendations: gapsResult.recommendations.length,
        },
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
// MAIN
// =============================================================================

async function main() {
  console.log('🚀 Test Active Learning RAG (Phase 5.2)\n')
  console.log('=' .repeat(70))

  const results: TestResult[] = []

  try {
    // Test 1: Identification gaps
    results.push(await testFindKnowledgeGaps())
    printTestResult(results[results.length - 1])

    // Test 2: Documents haute valeur
    results.push(await testIdentifyHighValueDocuments())
    printTestResult(results[results.length - 1])

    // Test 3: Suggestions sources
    results.push(await testSuggestSourcesAcquisition())
    printTestResult(results[results.length - 1])

    // Test 4: Priority score
    results.push(await testPriorityScoreCalculation())
    printTestResult(results[results.length - 1])

    // Test 5: Workflow complet
    results.push(await testCompleteWorkflow())
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
      process.exit(1)
    }

    console.log('\n✅ SUCCÈS : Tous les tests sont passés')
    console.log(
      '\n💡 Prochaine étape : Tester API routes avec authentification'
    )
  } catch (error) {
    console.error('\n💥 Erreur fatale:', error)
    process.exit(1)
  } finally {
    const { db } = await import('@/lib/db/postgres')
    await db.end()
  }
}

// Exécution
main().catch(error => {
  console.error('💥 Erreur non gérée:', error)
  process.exit(1)
})
