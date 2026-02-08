/**
 * Tests de qualité des prompts juridiques structurés
 *
 * Ce script teste la qualité des réponses générées par les nouveaux prompts
 * juridiques basés sur la méthode IRAC.
 *
 * Exécution:
 * ```bash
 * npx tsx tests/prompts-quality-test.ts
 * ```
 *
 * Critères d'évaluation:
 * - Structure IRAC présente et complète
 * - Citations sources correctes (pas d'invention)
 * - Ton professionnel d'avocat chevronné
 * - Terminologie juridique tunisienne appropriée
 * - Réponse dans la langue de la question
 */

import { answerQuestion } from '@/lib/ai/rag-chat-service'
import { db } from '@/lib/db/postgres'

// =============================================================================
// QUESTIONS DE TEST
// =============================================================================

interface TestQuestion {
  id: string
  category: string
  language: 'ar' | 'fr'
  contextType: 'chat' | 'consultation'
  question: string
  expectedElements: {
    structure: string[] // Sections IRAC attendues
    keywords: string[] // Termes juridiques attendus
    sources: boolean // Doit citer des sources
  }
}

const TEST_QUESTIONS: TestQuestion[] = [
  // ========== DROIT CIVIL (Français) ==========
  {
    id: 'civil-fr-1',
    category: 'Droit Civil',
    language: 'fr',
    contextType: 'consultation',
    question: "Quelles sont les conditions de validité d'un contrat selon le Code des Obligations et Contrats tunisien ?",
    expectedElements: {
      structure: ['EXPOSÉ DES FAITS', 'PROBLÉMATIQUE', 'RÈGLES DE DROIT', 'ANALYSE', 'CONCLUSION', 'SOURCES'],
      keywords: ['Code des Obligations et Contrats', 'COC', 'consentement', 'capacité', 'objet', 'cause'],
      sources: true,
    },
  },
  {
    id: 'civil-fr-2',
    category: 'Droit Civil',
    language: 'fr',
    contextType: 'chat',
    question: "Quelle est la différence entre nullité absolue et nullité relative d'un contrat ?",
    expectedElements: {
      structure: ['faits', 'règle', 'analyse', 'conclusion'],
      keywords: ['nullité absolue', 'nullité relative', 'ordre public', 'intérêt particulier'],
      sources: true,
    },
  },

  // ========== DROIT CIVIL (Arabe) ==========
  {
    id: 'civil-ar-1',
    category: 'Droit Civil',
    language: 'ar',
    contextType: 'consultation',
    question: 'ما هي شروط صحة العقد حسب مجلة الالتزامات والعقود التونسية؟',
    expectedElements: {
      structure: ['عرض الوقائع', 'الإشكالية', 'القواعد القانونية', 'التحليل', 'الخلاصة', 'المصادر'],
      keywords: ['مجلة الالتزامات والعقود', 'الرضا', 'الأهلية', 'المحل', 'السبب'],
      sources: true,
    },
  },

  // ========== DROIT COMMERCIAL (Français) ==========
  {
    id: 'commercial-fr-1',
    category: 'Droit Commercial',
    language: 'fr',
    contextType: 'consultation',
    question: "Quelles sont les formalités obligatoires pour créer une SARL en Tunisie ?",
    expectedElements: {
      structure: ['EXPOSÉ DES FAITS', 'PROBLÉMATIQUE', 'RÈGLES DE DROIT', 'ANALYSE', 'CONCLUSION', 'SOURCES'],
      keywords: ['SARL', 'société à responsabilité limitée', 'statuts', 'registre de commerce', 'JORT'],
      sources: true,
    },
  },
  {
    id: 'commercial-fr-2',
    category: 'Droit Commercial',
    language: 'fr',
    contextType: 'chat',
    question: "Qu'est-ce qu'une lettre de change et comment fonctionne-t-elle ?",
    expectedElements: {
      structure: ['règle', 'analyse', 'conclusion'],
      keywords: ['effet de commerce', 'tireur', 'tiré', 'bénéficiaire', 'endossement'],
      sources: true,
    },
  },

  // ========== DROIT COMMERCIAL (Arabe) ==========
  {
    id: 'commercial-ar-1',
    category: 'Droit Commercial',
    language: 'ar',
    contextType: 'consultation',
    question: 'ما هي الإجراءات الإلزامية لإنشاء شركة ذات مسؤولية محدودة في تونس؟',
    expectedElements: {
      structure: ['عرض الوقائع', 'الإشكالية', 'القواعد القانونية', 'التحليل', 'الخلاصة'],
      keywords: ['شركة ذات مسؤولية محدودة', 'النظام الأساسي', 'السجل التجاري'],
      sources: true,
    },
  },

  // ========== DROIT PÉNAL (Français) ==========
  {
    id: 'penal-fr-1',
    category: 'Droit Pénal',
    language: 'fr',
    contextType: 'consultation',
    question: "Quelles sont les peines encourues pour le vol simple en droit tunisien ?",
    expectedElements: {
      structure: ['EXPOSÉ DES FAITS', 'PROBLÉMATIQUE', 'RÈGLES DE DROIT', 'ANALYSE', 'CONCLUSION', 'SOURCES'],
      keywords: ['vol simple', 'Code Pénal', 'emprisonnement', 'amende'],
      sources: true,
    },
  },
  {
    id: 'penal-fr-2',
    category: 'Droit Pénal',
    language: 'fr',
    contextType: 'chat',
    question: "Quelle est la différence entre crime, délit et contravention ?",
    expectedElements: {
      structure: ['règle', 'analyse'],
      keywords: ['crime', 'délit', 'contravention', 'gravité', 'peine'],
      sources: true,
    },
  },

  // ========== DROIT PÉNAL (Arabe) ==========
  {
    id: 'penal-ar-1',
    category: 'Droit Pénal',
    language: 'ar',
    contextType: 'consultation',
    question: 'ما هي العقوبات المنصوص عليها للسرقة البسيطة في القانون التونسي؟',
    expectedElements: {
      structure: ['عرض الوقائع', 'الإشكالية', 'القواعد القانونية'],
      keywords: ['السرقة البسيطة', 'المجلة الجزائية', 'السجن', 'الخطية'],
      sources: true,
    },
  },

  // ========== DROIT DE LA FAMILLE (Français) ==========
  {
    id: 'famille-fr-1',
    category: 'Droit de la Famille',
    language: 'fr',
    contextType: 'consultation',
    question: "Quels sont les motifs de divorce admis par le Code du Statut Personnel tunisien ?",
    expectedElements: {
      structure: ['EXPOSÉ DES FAITS', 'PROBLÉMATIQUE', 'RÈGLES DE DROIT', 'ANALYSE', 'CONCLUSION', 'SOURCES'],
      keywords: ['divorce', 'Code du Statut Personnel', 'CSP', 'divorce pour préjudice', 'divorce par consentement mutuel'],
      sources: true,
    },
  },
  {
    id: 'famille-fr-2',
    category: 'Droit de la Famille',
    language: 'fr',
    contextType: 'chat',
    question: "Comment est calculée la pension alimentaire pour les enfants en cas de divorce ?",
    expectedElements: {
      structure: ['règle', 'analyse', 'conclusion'],
      keywords: ['pension alimentaire', 'garde', 'ressources', 'besoins de l\'enfant'],
      sources: true,
    },
  },
  {
    id: 'famille-fr-3',
    category: 'Droit de la Famille',
    language: 'fr',
    contextType: 'consultation',
    question: "Quelles sont les conditions légales pour obtenir la garde des enfants après un divorce ?",
    expectedElements: {
      structure: ['EXPOSÉ DES FAITS', 'PROBLÉMATIQUE', 'RÈGLES DE DROIT', 'ANALYSE', 'CONCLUSION', 'SOURCES'],
      keywords: ['garde', 'intérêt de l\'enfant', 'capacité', 'âge'],
      sources: true,
    },
  },

  // ========== DROIT DE LA FAMILLE (Arabe) ==========
  {
    id: 'famille-ar-1',
    category: 'Droit de la Famille',
    language: 'ar',
    contextType: 'consultation',
    question: 'ما هي أسباب الطلاق المقبولة في مجلة الأحوال الشخصية التونسية؟',
    expectedElements: {
      structure: ['عرض الوقائع', 'الإشكالية', 'القواعد القانونية', 'التحليل', 'الخلاصة'],
      keywords: ['الطلاق', 'مجلة الأحوال الشخصية', 'الطلاق للضرر', 'الطلاق بالتراضي'],
      sources: true,
    },
  },
  {
    id: 'famille-ar-2',
    category: 'Droit de la Famille',
    language: 'ar',
    contextType: 'chat',
    question: 'كيف يتم حساب النفقة للأطفال في حالة الطلاق؟',
    expectedElements: {
      structure: ['القاعدة', 'التحليل', 'الخلاصة'],
      keywords: ['النفقة', 'الحضانة', 'الموارد', 'احتياجات الطفل'],
      sources: true,
    },
  },

  // ========== DROIT DU TRAVAIL (Français) ==========
  {
    id: 'travail-fr-1',
    category: 'Droit du Travail',
    language: 'fr',
    contextType: 'consultation',
    question: "Quelle est la durée légale du préavis en cas de démission en Tunisie ?",
    expectedElements: {
      structure: ['EXPOSÉ DES FAITS', 'PROBLÉMATIQUE', 'RÈGLES DE DROIT', 'ANALYSE', 'CONCLUSION', 'SOURCES'],
      keywords: ['préavis', 'démission', 'Code du Travail', 'durée'],
      sources: true,
    },
  },
  {
    id: 'travail-fr-2',
    category: 'Droit du Travail',
    language: 'fr',
    contextType: 'chat',
    question: "Un employeur peut-il licencier un salarié sans motif ?",
    expectedElements: {
      structure: ['règle', 'analyse', 'conclusion'],
      keywords: ['licenciement', 'motif valable', 'abusif', 'indemnités'],
      sources: true,
    },
  },

  // ========== DROIT DU TRAVAIL (Arabe) ==========
  {
    id: 'travail-ar-1',
    category: 'Droit du Travail',
    language: 'ar',
    contextType: 'consultation',
    question: 'ما هي المدة القانونية للإشعار المسبق في حالة الاستقالة في تونس؟',
    expectedElements: {
      structure: ['عرض الوقائع', 'الإشكالية', 'القواعد القانونية'],
      keywords: ['الإشعار المسبق', 'الاستقالة', 'مجلة الشغل', 'المدة'],
      sources: true,
    },
  },

  // ========== PROCÉDURE (Français) ==========
  {
    id: 'procedure-fr-1',
    category: 'Procédure',
    language: 'fr',
    contextType: 'consultation',
    question: "Quels sont les délais d'appel d'un jugement civil en Tunisie ?",
    expectedElements: {
      structure: ['EXPOSÉ DES FAITS', 'PROBLÉMATIQUE', 'RÈGLES DE DROIT', 'ANALYSE', 'CONCLUSION', 'SOURCES'],
      keywords: ['appel', 'délai', 'CPC', 'Code de Procédure Civile', 'jours'],
      sources: true,
    },
  },
  {
    id: 'procedure-fr-2',
    category: 'Procédure',
    language: 'fr',
    contextType: 'chat',
    question: "Comment se déroule une procédure de référé ?",
    expectedElements: {
      structure: ['règle', 'analyse'],
      keywords: ['référé', 'urgence', 'mesure provisoire', 'juge des référés'],
      sources: true,
    },
  },
]

// =============================================================================
// CRITÈRES D'ÉVALUATION
// =============================================================================

interface EvaluationCriteria {
  structureIRAC: {
    score: number // 0-10
    details: string
    sectionsPresent: string[]
    sectionsMissing: string[]
  }
  citations: {
    score: number // 0-10
    details: string
    sourcesCount: number
    inventedSources: boolean
    properFormat: boolean
  }
  tonProfessionnel: {
    score: number // 0-10
    details: string
    avocatChevrone: boolean
    terminologieJuridique: boolean
  }
  languageAdaptation: {
    score: number // 0-10
    details: string
    correctLanguage: boolean
    bilingualTerms: boolean
  }
  precisionJuridique: {
    score: number // 0-10
    details: string
    keywordsPresent: string[]
    keywordsMissing: string[]
  }
}

interface TestResult {
  question: TestQuestion
  response: {
    answer: string
    tokensUsed: { input: number; output: number; total: number }
    model: string
    sources: any[]
  }
  evaluation: EvaluationCriteria
  globalScore: number // Moyenne 0-100
  passed: boolean // true si globalScore >= 80
  executionTimeMs: number
}

// =============================================================================
// FONCTIONS D'ÉVALUATION
// =============================================================================

/**
 * Évalue la structure IRAC de la réponse
 */
function evaluateStructureIRAC(answer: string, contextType: 'chat' | 'consultation', language: 'ar' | 'fr'): EvaluationCriteria['structureIRAC'] {
  const sectionsExpected = contextType === 'consultation'
    ? language === 'ar'
      ? ['عرض الوقائع', 'الإشكالية', 'القواعد القانونية', 'التحليل', 'الخلاصة', 'المصادر']
      : ['EXPOSÉ DES FAITS', 'PROBLÉMATIQUE', 'RÈGLES DE DROIT', 'ANALYSE', 'CONCLUSION', 'SOURCES']
    : language === 'ar'
      ? ['الوقائع', 'القاعدة', 'التحليل', 'الخلاصة']
      : ['faits', 'règle', 'analyse', 'conclusion']

  const sectionsPresent = sectionsExpected.filter((section) =>
    answer.toLowerCase().includes(section.toLowerCase())
  )

  const sectionsMissing = sectionsExpected.filter((section) =>
    !answer.toLowerCase().includes(section.toLowerCase())
  )

  const score = (sectionsPresent.length / sectionsExpected.length) * 10

  return {
    score: Math.round(score),
    details: `${sectionsPresent.length}/${sectionsExpected.length} sections IRAC présentes`,
    sectionsPresent,
    sectionsMissing,
  }
}

/**
 * Évalue les citations de sources
 */
function evaluateCitations(answer: string, sources: any[]): EvaluationCriteria['citations'] {
  // Détecter les citations [Source-N], [KB-N], [Juris-N]
  const citationPattern = /\[(Source|KB|Juris)-\d+\]/g
  const citations = answer.match(citationPattern) || []
  const sourcesCount = citations.length

  // Vérifier qu'il n'y a pas d'invention (numéros > nombre de sources)
  const maxSourceIndex = sources.length
  const inventedSources = citations.some((citation) => {
    const match = citation.match(/\d+/)
    if (!match) return false
    const index = parseInt(match[0], 10)
    return index > maxSourceIndex
  })

  // Vérifier format correct
  const properFormat = citations.every((citation) => /\[(Source|KB|Juris)-\d+\]/.test(citation))

  let score = 0
  if (sourcesCount > 0) score += 3 // Au moins une citation
  if (!inventedSources) score += 4 // Pas d'invention
  if (properFormat) score += 3 // Format correct

  return {
    score,
    details: `${sourcesCount} citations, ${inventedSources ? 'INVENTIONS DÉTECTÉES' : 'pas d\'invention'}, format ${properFormat ? 'correct' : 'incorrect'}`,
    sourcesCount,
    inventedSources,
    properFormat,
  }
}

/**
 * Évalue le ton professionnel
 */
function evaluateTonProfessionnel(answer: string, language: 'ar' | 'fr'): EvaluationCriteria['tonProfessionnel'] {
  const professionalKeywords = language === 'ar'
    ? ['حسب', 'وفقا', 'بناء على', 'ينص', 'يشترط', 'القانون', 'الفصل', 'المجلة']
    : ['selon', 'conformément', 'en application', 'il convient', 'il semble', 'en principe', 'article', 'code']

  const avocatChevrone = professionalKeywords.some((keyword) =>
    answer.toLowerCase().includes(keyword.toLowerCase())
  )

  const terminologieJuridique = language === 'ar'
    ? /مجلة|فصل|محكمة|قانون|حكم|قرار/.test(answer)
    : /code|article|loi|jurisprudence|cour|tribunal|arrêt/.test(answer.toLowerCase())

  let score = 0
  if (avocatChevrone) score += 5
  if (terminologieJuridique) score += 5

  return {
    score,
    details: `Ton ${avocatChevrone ? 'professionnel' : 'non professionnel'}, terminologie juridique ${terminologieJuridique ? 'présente' : 'absente'}`,
    avocatChevrone,
    terminologieJuridique,
  }
}

/**
 * Évalue l'adaptation de la langue
 */
function evaluateLanguageAdaptation(answer: string, expectedLanguage: 'ar' | 'fr'): EvaluationCriteria['languageAdaptation'] {
  const arabicChars = answer.match(/[\u0600-\u06FF]/g) || []
  const frenchChars = answer.match(/[a-zA-ZÀ-ÿ]/g) || []

  const isArabic = arabicChars.length > frenchChars.length
  const isFrench = frenchChars.length > arabicChars.length

  const correctLanguage = (expectedLanguage === 'ar' && isArabic) || (expectedLanguage === 'fr' && isFrench)

  // Vérifier termes bilingues (ex: "Code des Obligations (مجلة الالتزامات)")
  const bilingualTerms = /[\u0600-\u06FF].*\(.*[a-zA-Z].*\)|[a-zA-Z].*\(.*[\u0600-\u06FF].*\)/.test(answer)

  let score = 0
  if (correctLanguage) score += 7
  if (bilingualTerms) score += 3

  return {
    score,
    details: `Langue ${correctLanguage ? 'correcte' : 'incorrecte'}, termes bilingues ${bilingualTerms ? 'présents' : 'absents'}`,
    correctLanguage,
    bilingualTerms,
  }
}

/**
 * Évalue la précision juridique
 */
function evaluatePrecisionJuridique(answer: string, expectedKeywords: string[]): EvaluationCriteria['precisionJuridique'] {
  const keywordsPresent = expectedKeywords.filter((keyword) =>
    answer.toLowerCase().includes(keyword.toLowerCase())
  )

  const keywordsMissing = expectedKeywords.filter((keyword) =>
    !answer.toLowerCase().includes(keyword.toLowerCase())
  )

  const score = (keywordsPresent.length / expectedKeywords.length) * 10

  return {
    score: Math.round(score),
    details: `${keywordsPresent.length}/${expectedKeywords.length} mots-clés juridiques présents`,
    keywordsPresent,
    keywordsMissing,
  }
}

/**
 * Évalue une réponse complète
 */
function evaluateResponse(question: TestQuestion, response: any): EvaluationCriteria {
  const { answer } = response
  const { language, contextType, expectedElements } = question

  return {
    structureIRAC: evaluateStructureIRAC(answer, contextType, language),
    citations: evaluateCitations(answer, response.sources),
    tonProfessionnel: evaluateTonProfessionnel(answer, language),
    languageAdaptation: evaluateLanguageAdaptation(answer, language),
    precisionJuridique: evaluatePrecisionJuridique(answer, expectedElements.keywords),
  }
}

// =============================================================================
// EXÉCUTION DES TESTS
// =============================================================================

/**
 * Exécute un test de question
 */
async function runTest(question: TestQuestion, userId: string): Promise<TestResult> {
  const startTime = Date.now()

  try {
    // Appeler le service RAG avec le contexte approprié
    const response = await answerQuestion(question.question, userId, {
      contextType: question.contextType,
      includeJurisprudence: true,
      includeKnowledgeBase: true,
    })

    const executionTimeMs = Date.now() - startTime

    // Évaluer la réponse
    const evaluation = evaluateResponse(question, response)

    // Calculer le score global (moyenne pondérée)
    const globalScore = Math.round(
      (evaluation.structureIRAC.score * 0.25 +
        evaluation.citations.score * 0.25 +
        evaluation.tonProfessionnel.score * 0.2 +
        evaluation.languageAdaptation.score * 0.15 +
        evaluation.precisionJuridique.score * 0.15) *
        10
    )

    const passed = globalScore >= 80

    return {
      question,
      response,
      evaluation,
      globalScore,
      passed,
      executionTimeMs,
    }
  } catch (error) {
    console.error(`Erreur lors du test ${question.id}:`, error)
    throw error
  }
}

/**
 * Exécute tous les tests
 */
async function runAllTests(): Promise<void> {
  console.log('='.repeat(80))
  console.log('Tests de Qualité - Prompts Juridiques Structurés (Méthode IRAC)')
  console.log('='.repeat(80))
  console.log()

  // Créer un utilisateur de test (ou utiliser un existant)
  const testUserId = 'test-user-prompts-quality'

  const results: TestResult[] = []
  let passedCount = 0
  let failedCount = 0

  // Exécuter les tests séquentiellement
  for (const question of TEST_QUESTIONS) {
    console.log(`\n[${ question.id}] ${question.category} (${question.language.toUpperCase()}, ${question.contextType})`)
    console.log(`Question: ${question.question.substring(0, 80)}...`)

    try {
      const result = await runTest(question, testUserId)
      results.push(result)

      if (result.passed) {
        passedCount++
        console.log(`✅ PASSÉ - Score: ${result.globalScore}/100 (${result.executionTimeMs}ms)`)
      } else {
        failedCount++
        console.log(`❌ ÉCHOUÉ - Score: ${result.globalScore}/100 (${result.executionTimeMs}ms)`)
      }

      // Afficher détails évaluation
      console.log(`   Structure IRAC: ${result.evaluation.structureIRAC.score}/10 - ${result.evaluation.structureIRAC.details}`)
      console.log(`   Citations: ${result.evaluation.citations.score}/10 - ${result.evaluation.citations.details}`)
      console.log(`   Ton professionnel: ${result.evaluation.tonProfessionnel.score}/10 - ${result.evaluation.tonProfessionnel.details}`)
      console.log(`   Langue: ${result.evaluation.languageAdaptation.score}/10 - ${result.evaluation.languageAdaptation.details}`)
      console.log(`   Précision juridique: ${result.evaluation.precisionJuridique.score}/10 - ${result.evaluation.precisionJuridique.details}`)
    } catch (error) {
      console.log(`⚠️  ERREUR - ${error instanceof Error ? error.message : error}`)
      failedCount++
    }
  }

  // Résumé global
  console.log()
  console.log('='.repeat(80))
  console.log('RÉSUMÉ GLOBAL')
  console.log('='.repeat(80))
  console.log(`Total tests: ${TEST_QUESTIONS.length}`)
  console.log(`✅ Réussis: ${passedCount} (${Math.round((passedCount / TEST_QUESTIONS.length) * 100)}%)`)
  console.log(`❌ Échoués: ${failedCount} (${Math.round((failedCount / TEST_QUESTIONS.length) * 100)}%)`)

  // Statistiques par catégorie
  const categories = [...new Set(TEST_QUESTIONS.map((q) => q.category))]
  console.log()
  console.log('Statistiques par catégorie:')
  for (const category of categories) {
    const categoryResults = results.filter((r) => r.question.category === category)
    const categoryPassed = categoryResults.filter((r) => r.passed).length
    console.log(`  ${category}: ${categoryPassed}/${categoryResults.length} réussis`)
  }

  // Statistiques par langue
  console.log()
  console.log('Statistiques par langue:')
  const frResults = results.filter((r) => r.question.language === 'fr')
  const arResults = results.filter((r) => r.question.language === 'ar')
  console.log(`  Français: ${frResults.filter((r) => r.passed).length}/${frResults.length} réussis`)
  console.log(`  Arabe: ${arResults.filter((r) => r.passed).length}/${arResults.length} réussis`)

  // Statistiques par contexte
  console.log()
  console.log('Statistiques par contexte:')
  const chatResults = results.filter((r) => r.question.contextType === 'chat')
  const consultationResults = results.filter((r) => r.question.contextType === 'consultation')
  console.log(`  Chat: ${chatResults.filter((r) => r.passed).length}/${chatResults.length} réussis`)
  console.log(`  Consultation: ${consultationResults.filter((r) => r.passed).length}/${consultationResults.length} réussis`)

  // Score moyen global
  const avgScore = Math.round(results.reduce((sum, r) => sum + r.globalScore, 0) / results.length)
  console.log()
  console.log(`Score moyen global: ${avgScore}/100`)

  // Temps moyen d'exécution
  const avgTime = Math.round(results.reduce((sum, r) => sum + r.executionTimeMs, 0) / results.length)
  console.log(`Temps moyen d'exécution: ${avgTime}ms`)

  console.log()
  console.log('='.repeat(80))

  // Sauvegarder les résultats dans un fichier JSON
  const fs = require('fs')
  const resultsPath = 'tests/results/prompts-quality-test-results.json'
  fs.mkdirSync('tests/results', { recursive: true })
  fs.writeFileSync(resultsPath, JSON.stringify(results, null, 2))
  console.log(`\nRésultats détaillés sauvegardés dans: ${resultsPath}`)

  // Fermer la connexion DB
  await db.closePool()

  // Exit code selon résultats
  process.exit(failedCount > 0 ? 1 : 0)
}

// =============================================================================
// POINT D'ENTRÉE
// =============================================================================

if (require.main === module) {
  runAllTests().catch((error) => {
    console.error('Erreur fatale lors de l\'exécution des tests:', error)
    process.exit(1)
  })
}

export { runAllTests, evaluateResponse, TEST_QUESTIONS }
