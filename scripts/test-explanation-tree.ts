/**
 * Script de Test - Arbre Décisionnel Juridique (Phase 3.3)
 *
 * Teste la construction et visualisation d'arbres décisionnels
 * depuis des réponses multi-chain avec justifications sourcées.
 *
 * Usage:
 *   npm run test:explanation-tree
 *
 * @module scripts/test-explanation-tree
 */

import { buildExplanationTree } from '../lib/ai/explanation-tree-builder'
import {
  findNodeById,
  getAllNodes,
  getMaxDepth,
  getAllSources,
  findNodesByType,
  findControversialNodes,
  findLowConfidenceNodes,
  getConfidenceLevel,
} from '../lib/types/explanation-tree'
import type {
  ExplanationTree,
  ExplanationNode,
  TreeBuildOptions,
} from '../lib/types/explanation-tree'
import type { MultiChainResponse } from '../lib/ai/multi-chain-legal-reasoning'

// =============================================================================
// MOCK DATA - MULTI-CHAIN RESPONSE
// =============================================================================

/**
 * Mock réponse multi-chain complète pour test
 */
function createMockMultiChainResponse(): MultiChainResponse {
  return {
    question: 'Un locataire peut-il résilier son bail avant terme en cas de perte d\'emploi ?',
    language: 'fr',
    overallConfidence: 0.72,
    responseTime: 8500,
    chains: {
      chain1: {
        duration: 2100,
        confidence: 0.75,
      },
      chain2: {
        duration: 1800,
        confidence: 0.68,
      },
      chain3: {
        duration: 3200,
        confidence: 0.74,
      },
      chain4: {
        duration: 1400,
        confidence: 0.72,
      },
    },

    // Chain 1: Analyse sources
    chain1: {
      sourceAnalysis: [
        {
          sourceId: 'kb-001',
          category: 'code',
          content:
            'Le Code des Obligations et Contrats (Article 775) prévoit que le bail à durée déterminée engage les parties jusqu\'à son terme.',
          legalPoints: [
            'Principe de force obligatoire du contrat (Article 242 COC)',
            'Durée déterminée du bail engage les parties jusqu\'au terme',
            'Résiliation anticipée possible uniquement dans les cas prévus par la loi',
          ],
          confidence: 0.85,
          tribunal: undefined,
          date: undefined,
        },
        {
          sourceId: 'kb-002',
          category: 'jurisprudence',
          content:
            'Arrêt Cour de Cassation n°12345/2022 - La perte d\'emploi ne constitue pas un cas de force majeure justifiant la résiliation anticipée.',
          legalPoints: [
            'Définition stricte de la force majeure (imprévisible, irrésistible, extérieur)',
            'Perte d\'emploi = événement personnel, pas force majeure',
            'Locataire reste tenu de payer les loyers jusqu\'au terme',
          ],
          confidence: 0.88,
          tribunal: 'Cour de Cassation',
          date: '2022-06-15',
        },
        {
          sourceId: 'kb-003',
          category: 'jurisprudence',
          content:
            'Arrêt Cour d\'Appel de Tunis n°8765/2021 - Admission résiliation anticipée pour motif légitime (mobilité professionnelle)',
          legalPoints: [
            'Clause de résiliation anticipée si motif légitime et sérieux',
            'Mobilité professionnelle contrainte = motif légitime',
            'Préavis de 3 mois + indemnité d\'un mois de loyer',
          ],
          confidence: 0.72,
          tribunal: 'Cour d\'Appel',
          date: '2021-09-10',
        },
        {
          sourceId: 'kb-004',
          category: 'doctrine',
          content:
            'Doctrine Mohamed Salah - L\'évolution jurisprudentielle tend vers une appréciation nuancée des motifs légitimes.',
          legalPoints: [
            'Tendance jurisprudentielle favorable aux motifs légitimes',
            'Équilibre entre sécurité juridique et équité sociale',
            'Importance de la clause contractuelle',
          ],
          confidence: 0.68,
          tribunal: undefined,
          date: undefined,
        },
      ],
      overallConfidence: 0.75,
      detectedContradictions: [
        {
          source1Id: 'kb-002',
          source2Id: 'kb-003',
          description:
            'Contradiction entre Cassation (strict) et Appel (souple) sur motifs légitimes',
          severity: 'moderate',
        },
      ],
    },

    // Chain 2: Résolution contradictions
    chain2: {
      contradictions: [
        {
          id: 'c1',
          source1: {
            id: 'kb-002',
            excerpt:
              'La perte d\'emploi ne constitue pas un cas de force majeure',
            category: 'jurisprudence',
            tribunal: 'Cour de Cassation',
            date: '2022-06-15',
          },
          source2: {
            id: 'kb-003',
            excerpt: 'Admission résiliation anticipée pour motif légitime',
            category: 'jurisprudence',
            tribunal: 'Cour d\'Appel',
            date: '2021-09-10',
          },
          description:
            'Position stricte Cassation vs position souple Appel sur résiliation anticipée',
          severity: 'moderate',
        },
      ],
      resolutions: [
        {
          contradictionId: 'c1',
          preferredSource: {
            id: 'kb-002',
            reason: 'Hiérarchie juridictionnelle (Cassation > Appel)',
          },
          method: 'hierarchy',
          explanation:
            'La jurisprudence de la Cour de Cassation prévaut sur celle de la Cour d\'Appel',
        },
      ],
      synthesizedPosition:
        'Position dominante stricte (force majeure exclut perte emploi), mais exception possible si clause contractuelle prévoit motifs légitimes',
    },

    // Chain 3: Construction argumentaire
    chain3: {
      thesis: {
        title: 'Résiliation impossible (position stricte)',
        arguments: [
          {
            content:
              'Principe de force obligatoire du contrat (Article 242 COC) impose respect des engagements',
            legalBasis: 'Article 242 COC',
            sources: ['kb-001'],
            confidence: 0.85,
          },
          {
            content:
              'Jurisprudence constante de la Cour de Cassation rejette la perte d\'emploi comme force majeure',
            legalBasis: 'Arrêt Cassation 12345/2022',
            sources: ['kb-002'],
            confidence: 0.88,
          },
        ],
        strength: 0.86,
      },
      antithesis: {
        title: 'Résiliation possible sous conditions (position souple)',
        arguments: [
          {
            content:
              'Clause contractuelle peut prévoir résiliation pour motif légitime (mobilité professionnelle)',
            legalBasis: 'Arrêt Appel 8765/2021',
            sources: ['kb-003'],
            confidence: 0.72,
          },
          {
            content:
              'Évolution jurisprudentielle vers appréciation nuancée des situations individuelles',
            legalBasis: 'Doctrine Mohamed Salah',
            sources: ['kb-004'],
            confidence: 0.68,
          },
        ],
        strength: 0.70,
      },
      synthesis: {
        title: 'Position équilibrée (analyse au cas par cas)',
        arguments: [
          {
            content:
              'Principe général : maintien du bail jusqu\'au terme (Article 775 COC + Cassation)',
            legalBasis: 'Article 775 COC + Arrêt 12345/2022',
            sources: ['kb-001', 'kb-002'],
            confidence: 0.87,
          },
          {
            content:
              'Exception : si clause contractuelle prévoit motif légitime + préavis/indemnité',
            legalBasis: 'Clause contractuelle + Arrêt Appel 8765/2021',
            sources: ['kb-003'],
            confidence: 0.74,
          },
          {
            content:
              'Recommandation : négociation amiable avec bailleur (préavis 3 mois + indemnité)',
            legalBasis: 'Principe équité',
            sources: ['kb-004'],
            confidence: 0.65,
          },
        ],
        strength: 0.75,
      },
      recommendation: {
        mainRecommendation:
          'En l\'absence de clause contractuelle, la résiliation anticipée pour perte d\'emploi est juridiquement difficile. Solution recommandée : négociation amiable avec le bailleur (préavis 3 mois + indemnité d\'un mois).',
        alternativeOptions: [
          'Rechercher un locataire de remplacement acceptable pour le bailleur',
          'Invoquer une clause de résiliation anticipée si présente dans le contrat',
          'En cas de refus, saisir le tribunal pour appréciation des circonstances',
        ],
        risks: [
          'Risque condamnation au paiement des loyers restants jusqu\'au terme',
          'Risque dommages-intérêts si départ sans préavis',
          'Impact négatif sur historique locatif futur',
        ],
        confidence: 0.72,
      },
    },

    // Chain 4: Validation cohérence
    chain4: {
      isCoherent: true,
      internalContradictions: [],
      unsourcedClaims: [],
      validationScore: 0.88,
      qualityIssues: [
        {
          type: 'warning',
          description:
            'Confiance modérée sur argument antithèse (68%) - doctrine vs jurisprudence',
          severity: 'low',
        },
      ],
    },
  }
}

// =============================================================================
// TESTS
// =============================================================================

/**
 * Test 1 : Construction basique de l'arbre
 */
async function test1_BasicTreeConstruction() {
  console.log('\n=== TEST 1 : Construction Basique Arbre Décisionnel ===\n')

  const mockResponse = createMockMultiChainResponse()

  const options: TreeBuildOptions = {
    maxDepth: 10,
    minConfidence: 0,
    includeAlternatives: true,
    includeContradictions: true,
    language: 'fr',
  }

  console.log('🔨 Construction de l\'arbre...')
  const startTime = Date.now()

  const tree = buildExplanationTree(mockResponse, options)

  const buildTime = Date.now() - startTime

  console.log(`✅ Arbre construit en ${buildTime}ms\n`)

  // Validation structure
  console.log('📊 Métadonnées arbre :')
  console.log(`  - Question : ${tree.metadata.question}`)
  console.log(`  - Langue : ${tree.metadata.language}`)
  console.log(`  - Total nœuds : ${tree.metadata.totalNodes}`)
  console.log(`  - Profondeur max : ${tree.metadata.maxDepth}`)
  console.log(`  - Sources utilisées : ${tree.metadata.sourcesUsed}`)
  console.log(`  - Confiance moyenne : ${tree.metadata.averageConfidence}%`)
  console.log(`  - Nœuds controversés : ${tree.metadata.controversialNodes}`)

  // Validation nœud racine
  console.log('\n🌳 Nœud racine :')
  console.log(`  - ID : ${tree.root.id}`)
  console.log(`  - Type : ${tree.root.type}`)
  console.log(`  - Contenu : ${tree.root.content.substring(0, 80)}...`)
  console.log(`  - Confiance : ${tree.root.confidence}%`)
  console.log(`  - Enfants : ${tree.root.children.length}`)
  console.log(`  - Controversé : ${tree.root.metadata.isControversial}`)

  // Validation résumé
  console.log('\n📝 Résumé :')
  console.log(`  - Conclusion : ${tree.summary.mainConclusion.substring(0, 100)}...`)
  console.log(`  - Arguments clés : ${tree.summary.keyArguments.length}`)
  console.log(`  - Risques : ${tree.summary.risks.length}`)
  console.log(`  - Recommandations : ${tree.summary.recommendations.length}`)
  console.log(`  - Niveau confiance : ${tree.summary.confidenceLevel}`)

  // Assertions
  if (tree.metadata.totalNodes < 5) {
    throw new Error('❌ Arbre trop petit (< 5 nœuds)')
  }
  if (tree.metadata.maxDepth < 2) {
    throw new Error('❌ Profondeur insuffisante (< 2 niveaux)')
  }
  if (tree.root.type !== 'question') {
    throw new Error('❌ Nœud racine doit être de type "question"')
  }
  if (tree.root.children.length === 0) {
    throw new Error('❌ Nœud racine sans enfants')
  }

  console.log('\n✅ Test 1 réussi - Arbre construit correctement\n')
}

/**
 * Test 2 : Métadonnées et statistiques
 */
async function test2_TreeMetadataAndStats() {
  console.log('\n=== TEST 2 : Métadonnées et Statistiques ===\n')

  const mockResponse = createMockMultiChainResponse()
  const tree = buildExplanationTree(mockResponse, {
    includeAlternatives: true,
    includeContradictions: true,
  })

  console.log('🔍 Analyse des métadonnées...\n')

  // Profondeur maximale
  const maxDepth = getMaxDepth(tree)
  console.log(`📏 Profondeur maximale : ${maxDepth}`)
  if (maxDepth !== tree.metadata.maxDepth) {
    throw new Error('❌ Incohérence profondeur métadonnées vs calcul')
  }

  // Comptage nœuds
  const allNodes = getAllNodes(tree)
  console.log(`🔢 Total nœuds (parcours) : ${allNodes.length}`)
  if (allNodes.length !== tree.metadata.totalNodes) {
    throw new Error('❌ Incohérence comptage nœuds')
  }

  // Comptage sources
  const allSources = getAllSources(tree)
  console.log(`📚 Sources uniques : ${allSources.length}`)
  if (allSources.length !== tree.metadata.sourcesUsed) {
    throw new Error('❌ Incohérence comptage sources')
  }

  // Distribution par type
  const questionNodes = findNodesByType(tree, 'question')
  const ruleNodes = findNodesByType(tree, 'rule')
  const applicationNodes = findNodesByType(tree, 'application')
  const synthesisNodes = findNodesByType(tree, 'synthesis')
  const conclusionNodes = findNodesByType(tree, 'conclusion')

  console.log('\n📊 Distribution par type :')
  console.log(`  - Questions : ${questionNodes.length}`)
  console.log(`  - Règles : ${ruleNodes.length}`)
  console.log(`  - Applications : ${applicationNodes.length}`)
  console.log(`  - Synthèses : ${synthesisNodes.length}`)
  console.log(`  - Conclusions : ${conclusionNodes.length}`)

  // Nœuds controversés
  const controversialNodes = findControversialNodes(tree)
  console.log(`\n⚠️  Nœuds controversés : ${controversialNodes.length}`)
  controversialNodes.forEach(node => {
    console.log(`  - ${node.type} : ${node.content.substring(0, 60)}...`)
  })

  // Nœuds faible confiance
  const lowConfidenceNodes = findLowConfidenceNodes(tree)
  console.log(`\n🔴 Nœuds confiance basse (<60%) : ${lowConfidenceNodes.length}`)
  lowConfidenceNodes.forEach(node => {
    console.log(
      `  - ${node.type} (${node.confidence}%) : ${node.content.substring(0, 50)}...`
    )
  })

  // Confiance moyenne
  const avgConfidence =
    allNodes.reduce((sum, n) => sum + n.confidence, 0) / allNodes.length
  console.log(`\n📈 Confiance moyenne calculée : ${Math.round(avgConfidence)}%`)
  if (Math.abs(avgConfidence - tree.metadata.averageConfidence) > 5) {
    throw new Error('❌ Incohérence confiance moyenne')
  }

  console.log('\n✅ Test 2 réussi - Métadonnées cohérentes\n')
}

/**
 * Test 3 : Formats d'export (JSON, Markdown)
 */
async function test3_ExportFormats() {
  console.log('\n=== TEST 3 : Formats d\'Export ===\n')

  const mockResponse = createMockMultiChainResponse()
  const tree = buildExplanationTree(mockResponse, { language: 'fr' })

  console.log('📦 Validation formats export...\n')

  // Export JSON
  console.log('🔹 Export JSON :')
  const jsonExport = tree.exportFormats.json
  console.log(`  - Taille : ${jsonExport.length} caractères`)

  try {
    const parsed = JSON.parse(jsonExport)
    console.log('  - Format valide : ✅')
    console.log(`  - Nœud racine : ${parsed.root.id}`)
  } catch (error) {
    throw new Error(`❌ JSON invalide : ${error}`)
  }

  // Export Markdown
  console.log('\n🔹 Export Markdown :')
  const mdExport = tree.exportFormats.markdown
  console.log(`  - Taille : ${mdExport.length} caractères`)
  console.log(`  - Titre présent : ${mdExport.includes('Arbre Décisionnel') ? '✅' : '❌'}`)
  console.log(`  - Question présente : ${mdExport.includes(tree.metadata.question) ? '✅' : '❌'}`)
  console.log(`  - Conclusion présente : ${mdExport.includes('Recommandation Principale') ? '✅' : '❌'}`)

  // Aperçu Markdown
  console.log('\n📄 Aperçu Markdown (50 premières lignes) :')
  console.log('─'.repeat(80))
  const mdLines = mdExport.split('\n').slice(0, 50)
  mdLines.forEach(line => console.log(line))
  if (mdExport.split('\n').length > 50) {
    console.log('...')
  }
  console.log('─'.repeat(80))

  // Assertions
  if (!jsonExport || jsonExport.length < 100) {
    throw new Error('❌ Export JSON vide ou trop court')
  }
  if (!mdExport || mdExport.length < 100) {
    throw new Error('❌ Export Markdown vide ou trop court')
  }
  if (!mdExport.includes(tree.metadata.question)) {
    throw new Error('❌ Markdown ne contient pas la question')
  }

  console.log('\n✅ Test 3 réussi - Exports corrects\n')
}

/**
 * Test 4 : Fonctions utilitaires de navigation
 */
async function test4_UtilityFunctions() {
  console.log('\n=== TEST 4 : Fonctions Utilitaires ===\n')

  const mockResponse = createMockMultiChainResponse()
  const tree = buildExplanationTree(mockResponse)

  console.log('🔧 Test fonctions navigation...\n')

  // findNodeById
  console.log('🔹 Test findNodeById :')
  const rootNode = findNodeById(tree, 'root')
  if (!rootNode) {
    throw new Error('❌ Impossible de trouver nœud racine par ID')
  }
  console.log(`  - Nœud "root" trouvé : ✅`)
  console.log(`  - Type : ${rootNode.type}`)

  const rule1 = findNodeById(tree, 'rule-1')
  if (!rule1) {
    console.log(`  - Nœud "rule-1" non trouvé (peut-être normal si 0 règles)`)
  } else {
    console.log(`  - Nœud "rule-1" trouvé : ✅`)
    console.log(`  - Type : ${rule1.type}`)
  }

  const nonExistent = findNodeById(tree, 'non-existent-id-xyz')
  if (nonExistent !== null) {
    throw new Error('❌ findNodeById doit retourner null pour ID inexistant')
  }
  console.log(`  - ID inexistant retourne null : ✅`)

  // getAllNodes
  console.log('\n🔹 Test getAllNodes :')
  const allNodes = getAllNodes(tree)
  console.log(`  - Total nœuds : ${allNodes.length}`)
  console.log(`  - Premier nœud ID : ${allNodes[0].id}`)
  if (allNodes[0].id !== 'root') {
    throw new Error('❌ Premier nœud doit être racine')
  }
  console.log(`  - Parcours commence par racine : ✅`)

  // getMaxDepth
  console.log('\n🔹 Test getMaxDepth :')
  const depth = getMaxDepth(tree)
  console.log(`  - Profondeur : ${depth}`)
  if (depth < 1) {
    throw new Error('❌ Profondeur doit être >= 1')
  }
  console.log(`  - Profondeur cohérente : ✅`)

  // getAllSources
  console.log('\n🔹 Test getAllSources :')
  const sources = getAllSources(tree)
  console.log(`  - Sources uniques : ${sources.length}`)
  sources.slice(0, 5).forEach(source => {
    console.log(`  - ${source.label} (${source.category}) - Pertinence ${source.relevance}`)
  })

  // Déduplication sources
  const sourceIds = sources.map(s => s.id)
  const uniqueSourceIds = new Set(sourceIds)
  if (sourceIds.length !== uniqueSourceIds.size) {
    throw new Error('❌ getAllSources doit retourner sources uniques (pas doublons)')
  }
  console.log(`  - Pas de doublons : ✅`)

  // getConfidenceLevel
  console.log('\n🔹 Test getConfidenceLevel :')
  const levelHigh = getConfidenceLevel(85)
  const levelMedium = getConfidenceLevel(65)
  const levelLow = getConfidenceLevel(45)
  console.log(`  - 85% → ${levelHigh} (attendu: high) ${levelHigh === 'high' ? '✅' : '❌'}`)
  console.log(
    `  - 65% → ${levelMedium} (attendu: medium) ${levelMedium === 'medium' ? '✅' : '❌'}`
  )
  console.log(`  - 45% → ${levelLow} (attendu: low) ${levelLow === 'low' ? '✅' : '❌'}`)

  if (levelHigh !== 'high' || levelMedium !== 'medium' || levelLow !== 'low') {
    throw new Error('❌ getConfidenceLevel retourne niveaux incorrects')
  }

  console.log('\n✅ Test 4 réussi - Fonctions utilitaires correctes\n')
}

// =============================================================================
// RUNNER
// =============================================================================

async function runAllTests() {
  console.log('\n' + '='.repeat(80))
  console.log('🧪 TESTS - ARBRE DÉCISIONNEL JURIDIQUE (Phase 3.3)')
  console.log('='.repeat(80))

  const tests = [
    { name: 'Construction Basique', fn: test1_BasicTreeConstruction },
    { name: 'Métadonnées et Stats', fn: test2_TreeMetadataAndStats },
    { name: 'Formats Export', fn: test3_ExportFormats },
    { name: 'Fonctions Utilitaires', fn: test4_UtilityFunctions },
  ]

  let passed = 0
  let failed = 0

  for (const test of tests) {
    try {
      await test.fn()
      passed++
    } catch (error) {
      console.error(`\n❌ Échec test "${test.name}" :`, error)
      failed++
    }
  }

  console.log('\n' + '='.repeat(80))
  console.log(`📊 RÉSULTATS : ${passed}/${tests.length} tests réussis`)
  if (failed > 0) {
    console.log(`⚠️  ${failed} test(s) échoué(s)`)
  } else {
    console.log('✅ Tous les tests sont passés avec succès')
  }
  console.log('='.repeat(80) + '\n')

  process.exit(failed > 0 ? 1 : 0)
}

// Lancer tests
runAllTests().catch(error => {
  console.error('\n💥 Erreur fatale :', error)
  process.exit(1)
})
