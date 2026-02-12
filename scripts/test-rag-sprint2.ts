#!/usr/bin/env tsx
/**
 * Tests de validation Sprint 2 - Metadata Filtering + Query Expansion
 *
 * Usage: npx tsx scripts/test-rag-sprint2.ts
 *
 * Tests:
 * 1. Classification query (catégories + domaines)
 * 2. Query expansion (termes juridiques)
 * 3. Filtrage intelligent par catégorie
 * 4. Comparaison scores avec/sans optimisations
 *
 * Février 2026 - Validation Sprint 2
 */

import { classifyQuery, isClassificationConfident, classifyQueryKeywords } from '@/lib/ai/query-classifier-service'
import { expandQuery, shouldExpandQuery, expandQueryKeywords } from '@/lib/ai/query-expansion-service'
import { searchKnowledgeBase } from '@/lib/ai/knowledge-base-service'

// =============================================================================
// COULEURS
// =============================================================================

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
}

function success(msg: string) {
  console.log(`${colors.green}✓${colors.reset} ${msg}`)
}

function error(msg: string) {
  console.log(`${colors.red}✗${colors.reset} ${msg}`)
}

function info(msg: string) {
  console.log(`${colors.cyan}ℹ${colors.reset} ${msg}`)
}

function section(title: string) {
  console.log(`\n${colors.blue}━━━ ${title} ━━━${colors.reset}`)
}

// =============================================================================
// TESTS
// =============================================================================

let passedTests = 0
let failedTests = 0

function assert(condition: boolean, message: string, details?: string) {
  if (condition) {
    success(message)
    passedTests++
  } else {
    error(message)
    if (details) console.log(`   ${details}`)
    failedTests++
  }
}

// -----------------------------------------------------------------------------
// Test 1: Classification Query
// -----------------------------------------------------------------------------

async function testClassification() {
  section('Test 1: Classification Query')

  const testCases = [
    {
      query: 'ما هي شروط الدفاع الشرعي؟',
      expectedCategories: ['codes', 'jurisprudence'],
      expectedDomains: ['penal'],
      description: 'Question théorique légitime défense',
    },
    {
      query: 'قرار تعقيبي عدد 12345',
      expectedCategories: ['jurisprudence'],
      expectedDomains: [],
      description: 'Référence arrêt cassation',
    },
    {
      query: 'عقد كراء محل تجاري',
      expectedCategories: ['modeles', 'legislation'],
      expectedDomains: ['commercial', 'immobilier'],
      description: 'Contrat bail commercial',
    },
  ]

  for (const testCase of testCases) {
    info(`\n   Testing: ${testCase.query}`)

    const classification = await classifyQuery(testCase.query)

    info(`   Résultat:`)
    info(`   - Catégories: ${classification.categories.join(', ')}`)
    info(`   - Domaines: ${classification.domains.join(', ')}`)
    info(`   - Confiance: ${(classification.confidence * 100).toFixed(1)}%`)
    info(`   - Raison: ${classification.reasoning}`)

    // Vérifier confiance
    assert(
      classification.confidence >= 0.5,
      `Confiance acceptable: ${(classification.confidence * 100).toFixed(1)}%`,
      classification.confidence < 0.5 ? 'Confiance trop faible (<50%)' : undefined
    )

    // Vérifier au moins une catégorie
    assert(
      classification.categories.length > 0,
      `Catégories détectées: ${classification.categories.length}`,
      classification.categories.length === 0 ? 'Aucune catégorie détectée' : undefined
    )

    // Vérifier classification confiante si confiance > 0.7
    if (classification.confidence >= 0.7) {
      assert(
        isClassificationConfident(classification),
        'Classification marquée comme confiante (>70%)',
      )
    }
  }
}

// -----------------------------------------------------------------------------
// Test 2: Query Expansion
// -----------------------------------------------------------------------------

async function testExpansion() {
  section('Test 2: Query Expansion')

  const testCases = [
    {
      query: 'قع شجار',
      minExpandedLength: 40,
      description: 'Query courte (altercation)',
    },
    {
      query: 'طلاق',
      minExpandedLength: 30,
      description: 'Query très courte (divorce)',
    },
    {
      query: 'ما هي شروط الدفاع الشرعي في القانون التونسي؟', // Déjà longue
      shouldExpand: false,
      description: 'Query déjà longue (ne doit pas être expandée)',
    },
  ]

  for (const testCase of testCases) {
    info(`\n   Testing: ${testCase.query}`)

    const shouldExpand = shouldExpandQuery(testCase.query)
    info(`   Should expand: ${shouldExpand}`)

    if (testCase.shouldExpand === false) {
      assert(
        !shouldExpand,
        'Query longue correctement identifiée (pas d\'expansion)',
      )
      continue
    }

    const expanded = await expandQuery(testCase.query)
    info(`   Expanded: ${expanded}`)

    // Vérifier expansion
    assert(
      expanded.length > testCase.query.length,
      `Query expandée: ${testCase.query.length} → ${expanded.length} chars`,
      expanded.length <= testCase.query.length
        ? 'Expansion n\'a pas ajouté de termes'
        : undefined
    )

    if (testCase.minExpandedLength) {
      assert(
        expanded.length >= testCase.minExpandedLength,
        `Longueur minimale atteinte: ${expanded.length} >= ${testCase.minExpandedLength}`,
        expanded.length < testCase.minExpandedLength
          ? `Trop court: ${expanded.length} < ${testCase.minExpandedLength}`
          : undefined
      )
    }

    // Vérifier que query originale est préservée
    assert(
      expanded.includes(testCase.query) || expanded.startsWith(testCase.query.substring(0, 10)),
      'Query originale préservée dans expansion',
    )
  }
}

// -----------------------------------------------------------------------------
// Test 3: Metadata Filtering
// -----------------------------------------------------------------------------

async function testMetadataFiltering() {
  section('Test 3: Metadata Filtering')

  const query = 'ما هي شروط الدفاع الشرعي؟'

  info(`   Query: ${query}`)

  // 1. Classification
  const classification = await classifyQuery(query)
  info(`   Classification: ${classification.categories.join(', ')} (${(classification.confidence * 100).toFixed(1)}%)`)

  if (!isClassificationConfident(classification)) {
    info('   ⚠️  Classification non confiante, recherche globale sera utilisée')
    return
  }

  // 2. Recherche filtrée par catégorie
  info(`   Recherche filtrée par catégories...`)

  const filteredResults: any[] = []

  for (const category of classification.categories) {
    const results = await searchKnowledgeBase(query, {
      category: category as any,
      limit: 5,
      operationName: 'assistant-ia',
    })
    filteredResults.push(...results)
  }

  // 3. Recherche globale (pour comparaison)
  const globalResults = await searchKnowledgeBase(query, {
    limit: 10,
    operationName: 'assistant-ia',
  })

  info(`   Résultats filtrés: ${filteredResults.length}`)
  info(`   Résultats globaux: ${globalResults.length}`)

  // Vérifier que filtrage trouve des résultats
  assert(
    filteredResults.length > 0,
    `Filtrage trouve des résultats: ${filteredResults.length}`,
    filteredResults.length === 0 ? 'Aucun résultat avec filtrage (vérifier KB indexée)' : undefined
  )

  // Vérifier que catégories correspondent
  if (filteredResults.length > 0) {
    const topResult = filteredResults[0]
    info(`   Top résultat: "${topResult.title.substring(0, 50)}..." (${topResult.category})`)

    const categoryMatch = classification.categories.includes(topResult.category as any)
    assert(
      categoryMatch,
      `Catégorie correspond: ${topResult.category}`,
      !categoryMatch ? `Attendu: ${classification.categories.join('/')}, Obtenu: ${topResult.category}` : undefined
    )
  }
}

// -----------------------------------------------------------------------------
// Test 4: Comparaison avec/sans optimisations
// -----------------------------------------------------------------------------

async function testCompareOptimizations() {
  section('Test 4: Comparaison avec/sans optimisations')

  const shortQuery = 'قع شجار'

  info(`   Query courte: ${shortQuery}`)

  // 1. Sans expansion (query originale)
  info('\n   A. Recherche SANS expansion:')
  const resultsWithout = await searchKnowledgeBase(shortQuery, {
    limit: 5,
    operationName: 'assistant-ia',
  })

  info(`   - Résultats: ${resultsWithout.length}`)
  if (resultsWithout.length > 0) {
    info(`   - Score top: ${(resultsWithout[0].similarity * 100).toFixed(1)}%`)
  }

  // 2. Avec expansion
  info('\n   B. Recherche AVEC expansion:')
  const expanded = await expandQuery(shortQuery)
  info(`   - Query expandée: ${expanded.substring(0, 80)}...`)

  const resultsWith = await searchKnowledgeBase(expanded, {
    limit: 5,
    operationName: 'assistant-ia',
  })

  info(`   - Résultats: ${resultsWith.length}`)
  if (resultsWith.length > 0) {
    info(`   - Score top: ${(resultsWith[0].similarity * 100).toFixed(1)}%`)
  }

  // Comparaison
  if (resultsWithout.length > 0 && resultsWith.length > 0) {
    const improvementCount = resultsWith.length - resultsWithout.length
    const improvementScore = resultsWith[0].similarity - resultsWithout[0].similarity

    info(`\n   📊 Impact expansion:`)
    info(`   - Nombre résultats: ${improvementCount >= 0 ? '+' : ''}${improvementCount}`)
    info(`   - Score top: ${improvementScore >= 0 ? '+' : ''}${(improvementScore * 100).toFixed(1)}%`)

    if (improvementScore > 0) {
      success(`Amélioration qualité: +${(improvementScore * 100).toFixed(1)}%`)
    } else if (improvementScore < -0.05) {
      error(`Dégradation qualité: ${(improvementScore * 100).toFixed(1)}%`)
      failedTests++
    } else {
      info('Score stable (variation <5%)')
    }
  }
}

// -----------------------------------------------------------------------------
// Test 5: Fallback Keywords
// -----------------------------------------------------------------------------

async function testFallbackKeywords() {
  section('Test 5: Fallback Keywords (si LLM échoue)')

  const query = 'قع شجار'

  // Test classification keywords
  const classification = classifyQueryKeywords(query)
  info(`   Classification keywords: ${classification.categories.join(', ')}`)
  info(`   Confiance: ${(classification.confidence * 100).toFixed(1)}%`)

  assert(
    classification.categories.length > 0 || classification.domains.length > 0,
    'Fallback keywords détecte catégories/domaines',
  )

  // Test expansion keywords
  const expanded = expandQueryKeywords(query)
  info(`   Expansion keywords: ${expanded.substring(0, 80)}`)

  assert(
    expanded.length > query.length,
    `Fallback keywords expanse: ${query.length} → ${expanded.length} chars`,
  )
}

// =============================================================================
// MAIN
// =============================================================================

async function main() {
  console.log(`
${colors.cyan}╔═════════════════════════════════════════════════════════════════╗
║  Tests Sprint 2 - Metadata Filtering + Query Expansion        ║
╚═════════════════════════════════════════════════════════════════╝${colors.reset}
  `)

  await testClassification()
  await testExpansion()
  await testMetadataFiltering()
  await testCompareOptimizations()
  await testFallbackKeywords()

  // Résumé
  console.log(`\n${colors.blue}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}`)
  console.log(`${colors.cyan}RÉSUMÉ${colors.reset}`)
  console.log(`${colors.blue}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}`)

  const total = passedTests + failedTests
  const percentage = total > 0 ? ((passedTests / total) * 100).toFixed(1) : '0'

  console.log(`\n${colors.green}✓ Tests réussis: ${passedTests}${colors.reset}`)
  console.log(`${colors.red}✗ Tests échoués: ${failedTests}${colors.reset}`)
  console.log(`${colors.cyan}  Taux de réussite: ${percentage}%${colors.reset}\n`)

  if (failedTests === 0) {
    console.log(`${colors.green}🎉 Sprint 2 validé avec succès !${colors.reset}\n`)
  } else {
    console.log(`${colors.yellow}⚠️  Certains tests ont échoué. Vérifiez la configuration.${colors.reset}\n`)
  }

  process.exit(failedTests > 0 ? 1 : 0)
}

main().catch((err) => {
  console.error(`\n${colors.red}❌ Erreur fatale:${colors.reset}`, err)
  process.exit(1)
})
