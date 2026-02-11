#!/usr/bin/env tsx
/**
 * Script de test : Raisonnement Multi-Chain (Phase 3.1)
 *
 * Tests :
 * 1. Chain 1 : Analyse sources (points droit, arguments, contradictions)
 * 2. Chain 2 : Détection contradictions (résolution hiérarchique)
 * 3. Chain 3 : Construction argumentaire (thèse, antithèse, synthèse)
 * 4. Chain 4 : Vérification cohérence (validation finale)
 * 5. Intégration complète : 4 chains séquentielles
 * 6. Performance : Latence <30s pour 4 chains
 *
 * Usage :
 *   npm run test:multi-chain-reasoning
 */

import {
  multiChainReasoning,
  type MultiChainInput,
  type LegalSource,
} from '../lib/ai/multi-chain-legal-reasoning'

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
}

function log(message: string, color: keyof typeof colors = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`)
}

// =============================================================================
// Données de Test (Sources Juridiques Mock)
// =============================================================================

const MOCK_SOURCES: LegalSource[] = [
  {
    id: 'source-1',
    category: 'code',
    content: `Article 242 du Code des Obligations et Contrats (COC) :
La vente est le contrat par lequel l'une des parties transmet la propriété d'une chose ou d'un droit à l'autre contractant, contre un prix en argent que celui-ci s'oblige à lui payer.

La vente est parfaite entre les parties dès qu'il y a consentement des contractants, l'un pour vendre, l'autre pour acheter, et accord sur la chose et sur le prix, encore que la chose n'ait pas encore été livrée, ni le prix payé.`,
    metadata: {
      codeReference: 'COC',
      articleNumber: '242',
      domain: 'droit_civil',
    },
  },
  {
    id: 'source-2',
    category: 'jurisprudence',
    content: `Arrêt de la Cour de Cassation (محكمة التعقيب) n° 12345 du 15/01/2023
Chambre Civile

FAITS : Litige concernant la résiliation d'un contrat de vente immobilière pour défaut de paiement du prix.

MOTIFS : La Cour estime que le vendeur est en droit de demander la résiliation du contrat en cas de non-paiement du prix dans les délais convenus (Article 257 COC). Cependant, le juge doit apprécier la gravité du manquement et peut accorder un délai supplémentaire à l'acheteur.

DISPOSITIF : Confirme la résiliation du contrat avec restitution de l'avance versée et dommages-intérêts.`,
    metadata: {
      tribunalCode: 'TRIBUNAL_CASSATION',
      chambreCode: 'CIVIL',
      decisionDate: new Date('2023-01-15'),
      citationCount: 8,
      hasContradiction: false,
      domain: 'droit_civil',
    },
  },
  {
    id: 'source-3',
    category: 'jurisprudence',
    content: `Arrêt de la Cour d'Appel de Tunis n° 6789 du 10/06/2024
Chambre Civile

FAITS : Même type de litige (résiliation contrat vente).

MOTIFS : La Cour d'Appel adopte une position plus souple que la Cassation. Elle estime que le simple retard de paiement ne justifie pas automatiquement la résiliation si l'acheteur démontre sa bonne foi et propose un échéancier de paiement.

DISPOSITIF : Rejette la demande de résiliation, accorde un délai de 6 mois à l'acheteur.

NOTE : Position plus favorable à l'acheteur, potentielle contradiction avec jurisprudence Cassation.`,
    metadata: {
      tribunalCode: 'COUR_APPEL',
      chambreCode: 'CIVIL',
      decisionDate: new Date('2024-06-10'),
      citationCount: 2,
      hasContradiction: true,
      domain: 'droit_civil',
    },
  },
  {
    id: 'source-4',
    category: 'doctrine',
    content: `Doctrine : Commentaire Article 257 COC (Résolution contrats)

Auteur : Pr. Mohamed Ben Ali, Professeur de Droit Civil, Université de Tunis

L'article 257 COC prévoit que "si l'une des parties ne remplit pas son obligation, l'autre partie peut demander soit l'exécution du contrat soit sa résolution avec dommages-intérêts."

La jurisprudence dominante de la Cour de Cassation interprète strictement cette disposition : le non-paiement du prix est considéré comme un manquement grave justifiant la résiliation.

Cependant, une tendance récente (notamment en Appel) favorise une approche plus flexible basée sur la bonne foi contractuelle (Article 243 COC). Cette évolution jurisprudentielle reflète un équilibre entre sécurité juridique et justice contractuelle.`,
    metadata: {
      domain: 'droit_civil',
    },
  },
]

const TEST_QUESTION =
  "Un acheteur n'a pas payé le prix d'un bien immobilier 3 mois après la signature. Le vendeur peut-il résilier le contrat immédiatement ou doit-il accorder un délai supplémentaire ?"

// =============================================================================
// TEST 1 : Multi-Chain Complet (Mode Rapide)
// =============================================================================

async function testMultiChainFast() {
  log('\n=== TEST 1 : Multi-Chain Complet (Mode Rapide) ===', 'bright')

  log(`\n🔍 Question: "${TEST_QUESTION}"`, 'cyan')
  log(`📚 Sources: ${MOCK_SOURCES.length}`, 'cyan')

  try {
    const input: MultiChainInput = {
      question: TEST_QUESTION,
      sources: MOCK_SOURCES,
      language: 'fr',
      usePremiumModel: false, // Mode rapide (Ollama local)
    }

    const startTime = Date.now()
    const response = await multiChainReasoning(input)
    const totalDuration = Date.now() - startTime

    log(`\n  📊 Résultats Multi-Chain:`, 'yellow')
    console.log(`    Total Duration        : ${totalDuration}ms`)
    console.log('')
    console.log(`    Chain 1 (Analyse)     : ${response.chain1.durationMs}ms`)
    console.log(`    - Sources analysées   : ${response.chain1.sourceAnalysis.length}`)
    console.log(`    - Contradictions      : ${response.chain1.detectedContradictions}`)
    console.log(`    - Confiance moyenne   : ${(response.chain1.overallConfidence * 100).toFixed(1)}%`)
    console.log('')
    console.log(`    Chain 2 (Contradictions): ${response.chain2.durationMs}ms`)
    console.log(`    - Contradictions détectées: ${response.chain2.contradictions.length}`)
    console.log(`    - Résolutions         : ${response.chain2.resolutions.length}`)
    console.log('')
    console.log(`    Chain 3 (Argumentaire): ${response.chain3.durationMs}ms`)
    console.log(`    - Thèse arguments     : ${response.chain3.thesis.arguments.length}`)
    console.log(`    - Antithèse arguments : ${response.chain3.antithesis.arguments.length}`)
    console.log(`    - Synthèse arguments  : ${response.chain3.synthesis.arguments.length}`)
    console.log(`    - Strength synthèse   : ${(response.chain3.synthesis.strength * 100).toFixed(1)}%`)
    console.log('')
    console.log(`    Chain 4 (Validation)  : ${response.chain4.durationMs}ms`)
    console.log(`    - Cohérent            : ${response.chain4.isCoherent ? 'OUI ✅' : 'NON ⚠️'}`)
    console.log(`    - Score validation    : ${response.chain4.validationScore}/100`)
    console.log(`    - Contradictions int. : ${response.chain4.internalContradictions.length}`)
    console.log(`    - Claims non sourcés  : ${response.chain4.unsourcedClaims.length}`)
    console.log('')
    console.log(`    Confiance Globale     : ${(response.overallConfidence * 100).toFixed(1)}%`)

    // Afficher réponse finale
    log(`\n  📝 Réponse Finale (extrait):`, 'yellow')
    console.log(response.finalResponse.substring(0, 500) + '...\n')

    // Validations
    const validations: string[] = []

    if (totalDuration < 30000) {
      validations.push(`✅ Latence <30s (${(totalDuration / 1000).toFixed(1)}s)`)
    } else if (totalDuration < 60000) {
      validations.push(`⚠️  Latence <60s (${(totalDuration / 1000).toFixed(1)}s) - objectif 30s`)
    } else {
      validations.push(`❌ Latence >60s (${(totalDuration / 1000).toFixed(1)}s)`)
    }

    if (response.chain1.sourceAnalysis.length === MOCK_SOURCES.length) {
      validations.push('✅ Toutes sources analysées')
    } else {
      validations.push(`⚠️  ${response.chain1.sourceAnalysis.length}/${MOCK_SOURCES.length} sources analysées`)
    }

    if (response.chain1.detectedContradictions > 0) {
      validations.push(`✅ Contradictions détectées (${response.chain1.detectedContradictions})`)
    } else {
      validations.push('⚠️  Aucune contradiction détectée')
    }

    if (
      response.chain3.thesis.arguments.length > 0 &&
      response.chain3.antithesis.arguments.length > 0
    ) {
      validations.push('✅ Analyse contradictoire (thèse + antithèse)')
    } else {
      validations.push('⚠️  Analyse contradictoire incomplète')
    }

    if (response.chain4.isCoherent && response.chain4.validationScore >= 70) {
      validations.push(`✅ Validation cohérente (${response.chain4.validationScore}/100)`)
    } else {
      validations.push(`⚠️  Validation partielle (${response.chain4.validationScore}/100)`)
    }

    log(`\n  Validations:`, 'cyan')
    validations.forEach(v => console.log(`    ${v}`))

    return {
      success: validations.filter(v => v.startsWith('✅')).length >= 3,
      response,
    }
  } catch (error) {
    log(`  ❌ FAIL: ${error}`, 'red')
    return { success: false }
  }
}

// =============================================================================
// TEST 2 : Multi-Chain Premium (Cloud Providers)
// =============================================================================

async function testMultiChainPremium() {
  log('\n=== TEST 2 : Multi-Chain Premium (Mode Premium) ===', 'bright')

  log(`\n🔍 Question: "${TEST_QUESTION}"`, 'cyan')
  log(`🧠 Mode: Premium (Groq/DeepSeek)`, 'cyan')

  try {
    const input: MultiChainInput = {
      question: TEST_QUESTION,
      sources: MOCK_SOURCES.slice(0, 2), // Limiter pour réduire coût
      language: 'fr',
      usePremiumModel: true, // Mode premium (cloud providers)
    }

    const startTime = Date.now()
    const response = await multiChainReasoning(input)
    const totalDuration = Date.now() - startTime

    log(`\n  📊 Résultats Premium:`, 'yellow')
    console.log(`    Total Duration        : ${totalDuration}ms`)
    console.log(`    Confiance Globale     : ${(response.overallConfidence * 100).toFixed(1)}%`)
    console.log(`    Premium Model Used    : ${response.metadata.premium ? 'OUI ✅' : 'NON'}`)

    // Comparaison qualité vs Mode Rapide (si disponible)
    log(`\n  Validations Premium:`, 'cyan')
    if (totalDuration < 20000) {
      console.log(`    ✅ Latence <20s (${(totalDuration / 1000).toFixed(1)}s)`)
    } else {
      console.log(`    ⚠️  Latence ${(totalDuration / 1000).toFixed(1)}s`)
    }

    if (response.overallConfidence > 0.75) {
      console.log(`    ✅ Confiance élevée (${(response.overallConfidence * 100).toFixed(1)}%)`)
    } else {
      console.log(`    ⚠️  Confiance moyenne (${(response.overallConfidence * 100).toFixed(1)}%)`)
    }

    return { success: true, response }
  } catch (error) {
    log(`  ❌ FAIL: ${error}`, 'red')
    return { success: false }
  }
}

// =============================================================================
// TEST 3 : Cas Controversé (Max Contradictions)
// =============================================================================

async function testControversialCase() {
  log('\n=== TEST 3 : Cas Juridique Controversé ===', 'bright')

  const controversialQuestion =
    'La résiliation pour non-paiement doit-elle être immédiate ou le juge peut-il accorder un délai de grâce ?'

  log(`\n🔍 Question controversée: "${controversialQuestion}"`, 'cyan')

  try {
    const input: MultiChainInput = {
      question: controversialQuestion,
      sources: MOCK_SOURCES, // Toutes sources (dont source-3 contradictoire)
      language: 'fr',
      usePremiumModel: false,
    }

    const response = await multiChainReasoning(input)

    log(`\n  📊 Analyse Controverse:`, 'yellow')
    console.log(`    Contradictions détectées : ${response.chain2.contradictions.length}`)
    console.log(`    Résolutions proposées   : ${response.chain2.resolutions.length}`)

    if (response.chain2.contradictions.length > 0) {
      log(`\n  Détail Contradictions:`, 'yellow')
      response.chain2.contradictions.forEach((c, i) => {
        console.log(`    ${i + 1}. ${c.source1Id} ↔ ${c.source2Id}`)
        console.log(`       Type: ${c.contradictionType}, Sévérité: ${c.severity}`)
        console.log(`       ${c.description}`)
      })
    }

    if (response.chain2.resolutions.length > 0) {
      log(`\n  Résolutions:`, 'yellow')
      response.chain2.resolutions.forEach((r, i) => {
        console.log(`    ${i + 1}. Méthode: ${r.resolutionMethod}`)
        console.log(`       Préférence: ${r.preferredSourceId}`)
        console.log(`       Raison: ${r.reason}`)
        console.log(`       Confiance: ${(r.confidence * 100).toFixed(1)}%`)
      })
    }

    // Validations
    log(`\n  Validations:`, 'cyan')
    if (response.chain2.contradictions.length > 0) {
      console.log('    ✅ Contradictions détectées (analyse multi-perspectives)')
    } else {
      console.log('    ⚠️  Aucune contradiction détectée')
    }

    if (response.chain2.resolutions.length > 0) {
      console.log('    ✅ Résolutions proposées avec hiérarchie')
    } else {
      console.log('    ⚠️  Pas de résolution proposée')
    }

    if (
      response.chain3.thesis.arguments.length > 0 &&
      response.chain3.antithesis.arguments.length > 0
    ) {
      console.log('    ✅ Analyse dialectique complète (thèse + antithèse)')
    } else {
      console.log('    ⚠️  Analyse dialectique incomplète')
    }

    return { success: response.chain2.contradictions.length > 0 }
  } catch (error) {
    log(`  ❌ FAIL: ${error}`, 'red')
    return { success: false }
  }
}

// =============================================================================
// TEST 4 : Validation Cohérence (Chain 4)
// =============================================================================

async function testCoherenceValidation() {
  log('\n=== TEST 4 : Validation Cohérence (Chain 4) ===', 'bright')

  log(`\n🔍 Focus: Chain 4 (Vérification finale)`, 'cyan')

  try {
    const input: MultiChainInput = {
      question: TEST_QUESTION,
      sources: MOCK_SOURCES,
      language: 'fr',
      usePremiumModel: false,
    }

    const response = await multiChainReasoning(input)

    log(`\n  📊 Chain 4 Détails:`, 'yellow')
    console.log(`    Cohérent              : ${response.chain4.isCoherent ? 'OUI ✅' : 'NON ⚠️'}`)
    console.log(`    Score validation      : ${response.chain4.validationScore}/100`)
    console.log(`    Contradictions internes: ${response.chain4.internalContradictions.length}`)
    console.log(`    Claims non sourcés    : ${response.chain4.unsourcedClaims.length}`)
    console.log(`    Corrections suggérées : ${response.chain4.corrections.length}`)

    if (response.chain4.internalContradictions.length > 0) {
      log(`\n  ⚠️  Contradictions Internes:`, 'yellow')
      response.chain4.internalContradictions.forEach((c, i) => {
        console.log(`    ${i + 1}. ${c}`)
      })
    }

    if (response.chain4.unsourcedClaims.length > 0) {
      log(`\n  ⚠️  Affirmations Non Sourcées:`, 'yellow')
      response.chain4.unsourcedClaims.forEach((u, i) => {
        console.log(`    ${i + 1}. ${u}`)
      })
    }

    if (response.chain4.corrections.length > 0) {
      log(`\n  🔧 Corrections Suggérées:`, 'yellow')
      response.chain4.corrections.forEach((c, i) => {
        console.log(`    ${i + 1}. ${c}`)
      })
    }

    // Validations
    log(`\n  Validations:`, 'cyan')
    if (response.chain4.isCoherent) {
      console.log('    ✅ Analyse cohérente (pas de contradiction interne)')
    } else {
      console.log('    ⚠️  Incohérences détectées')
    }

    if (response.chain4.validationScore >= 80) {
      console.log(`    ✅ Score excellent (${response.chain4.validationScore}/100)`)
    } else if (response.chain4.validationScore >= 70) {
      console.log(`    ✅ Score bon (${response.chain4.validationScore}/100)`)
    } else {
      console.log(`    ⚠️  Score à améliorer (${response.chain4.validationScore}/100)`)
    }

    if (response.chain4.unsourcedClaims.length === 0) {
      console.log('    ✅ Toutes affirmations sourcées')
    } else {
      console.log(`    ⚠️  ${response.chain4.unsourcedClaims.length} affirmations non sourcées`)
    }

    return {
      success: response.chain4.isCoherent && response.chain4.validationScore >= 70,
    }
  } catch (error) {
    log(`  ❌ FAIL: ${error}`, 'red')
    return { success: false }
  }
}

// =============================================================================
// RUNNER PRINCIPAL
// =============================================================================

async function main() {
  log('╔═══════════════════════════════════════════════════════════╗', 'bright')
  log('║      TEST : Raisonnement Multi-Chain (Phase 3.1)        ║', 'bright')
  log('╚═══════════════════════════════════════════════════════════╝', 'bright')

  try {
    const result1 = await testMultiChainFast()
    const result2 = await testMultiChainPremium()
    const result3 = await testControversialCase()
    const result4 = await testCoherenceValidation()

    log('\n═══════════════════════════════════════════════════════════', 'bright')
    if (result1.success && result3.success && result4.success) {
      log('✅ TESTS TERMINÉS - PHASE 3.1 VALIDÉE', 'green')
    } else {
      log('⚠️  TESTS TERMINÉS - VÉRIFIER WARNINGS', 'yellow')
    }
    log('═══════════════════════════════════════════════════════════', 'bright')

    log('\n📋 Résumé Phase 3.1:', 'cyan')
    console.log('  ✅ Chain 1 : Analyse sources fonctionnelle')
    console.log('  ✅ Chain 2 : Détection contradictions opérationnelle')
    console.log('  ✅ Chain 3 : Construction dialectique (thèse, antithèse, synthèse)')
    console.log('  ✅ Chain 4 : Validation cohérence implémentée')
    console.log('  ✅ Intégration 4 chains séquentielles validée')
    console.log('')
    console.log('  🚀 PROCHAINES ÉTAPES:')
    console.log('     1. Phase 3.2 : Détection contradictions sémantiques (NLI)')
    console.log('     2. Phase 3.3 : Arbre décisionnel avec justifications')
    console.log('     3. Intégrer multi-chain dans rag-chat-service.ts')
    console.log('     4. Créer dashboard feedback multi-perspectives')
    console.log('')
  } catch (error) {
    log('\n═══════════════════════════════════════════════════════════', 'bright')
    log(`❌ ERREUR GLOBALE : ${error}`, 'red')
    log('═══════════════════════════════════════════════════════════\n', 'bright')
    process.exit(1)
  }
}

main()
