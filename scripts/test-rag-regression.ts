#!/usr/bin/env tsx
/**
 * Test de Régression RAG - 100 Queries
 *
 * Ce script exécute 100 requêtes de test couvrant toutes les catégories
 * juridiques et compare les résultats avec une baseline capturée.
 *
 * Usage:
 *   npx tsx scripts/test-rag-regression.ts                  # Exécuter tests
 *   npx tsx scripts/test-rag-regression.ts --capture        # Capturer baseline
 *   npx tsx scripts/test-rag-regression.ts --compare        # Comparer avec baseline
 *   npx tsx scripts/test-rag-regression.ts --threshold=0.05 # Seuil de régression 5%
 */

import { searchKnowledgeBase } from '../lib/ai/knowledge-base-service'
import { db } from '../lib/db/postgres'
import * as fs from 'fs'
import * as path from 'path'

// =============================================================================
// CONFIGURATION
// =============================================================================

const BASELINE_PATH = path.join(__dirname, '../data/rag-regression-baseline.json')
const RESULTS_PATH = path.join(__dirname, '../data/rag-regression-results.json')
const REGRESSION_THRESHOLD = parseFloat(
  process.argv.find((a) => a.startsWith('--threshold='))?.split('=')[1] || '0.05'
)
const CAPTURE_MODE = process.argv.includes('--capture')
const COMPARE_MODE = process.argv.includes('--compare')

// =============================================================================
// 100 QUERIES DE TEST - Mix FR/AR, toutes catégories
// =============================================================================

interface TestQuery {
  id: number
  query: string
  language: 'ar' | 'fr' | 'mixed'
  category: string
  expectedMinResults: number
  description: string
}

const TEST_QUERIES: TestQuery[] = [
  // === JURISPRUDENCE (20 queries) ===
  { id: 1, query: 'ما هي شروط الدفاع الشرعي', language: 'ar', category: 'jurisprudence', expectedMinResults: 1, description: 'Conditions légitime défense' },
  { id: 2, query: 'قرار محكمة التعقيب في الطلاق', language: 'ar', category: 'jurisprudence', expectedMinResults: 1, description: 'Cassation divorce' },
  { id: 3, query: 'مسؤولية الطبيب المدنية', language: 'ar', category: 'jurisprudence', expectedMinResults: 1, description: 'Responsabilité médecin' },
  { id: 4, query: 'التعويض عن الضرر المعنوي', language: 'ar', category: 'jurisprudence', expectedMinResults: 1, description: 'Dommages moraux' },
  { id: 5, query: 'حق الشفعة في العقارات', language: 'ar', category: 'jurisprudence', expectedMinResults: 1, description: 'Droit préemption immobilier' },
  { id: 6, query: 'jurisprudence tunisienne licenciement abusif', language: 'fr', category: 'jurisprudence', expectedMinResults: 1, description: 'Licenciement abusif' },
  { id: 7, query: 'cassation réparation accident travail', language: 'fr', category: 'jurisprudence', expectedMinResults: 1, description: 'Accident travail' },
  { id: 8, query: 'اجتهاد قضائي في النفقة', language: 'ar', category: 'jurisprudence', expectedMinResults: 1, description: 'Pension alimentaire' },
  { id: 9, query: 'حكم في جريمة السرقة', language: 'ar', category: 'jurisprudence', expectedMinResults: 1, description: 'Vol jugement' },
  { id: 10, query: 'الاستئناف في المادة الجزائية', language: 'ar', category: 'jurisprudence', expectedMinResults: 1, description: 'Appel pénal' },
  { id: 11, query: 'قرار تعقيب في الغش التجاري', language: 'ar', category: 'jurisprudence', expectedMinResults: 1, description: 'Fraude commerciale' },
  { id: 12, query: 'إبطال عقد البيع', language: 'ar', category: 'jurisprudence', expectedMinResults: 1, description: 'Annulation vente' },
  { id: 13, query: 'التقادم في الدعوى المدنية', language: 'ar', category: 'jurisprudence', expectedMinResults: 1, description: 'Prescription civile' },
  { id: 14, query: 'droit de visite enfant divorce tunisie', language: 'fr', category: 'jurisprudence', expectedMinResults: 1, description: 'Droit visite enfant' },
  { id: 15, query: 'المسؤولية العقدية في القانون التونسي', language: 'ar', category: 'jurisprudence', expectedMinResults: 1, description: 'Responsabilité contractuelle' },
  { id: 16, query: 'حادث مرور تعويض', language: 'ar', category: 'jurisprudence', expectedMinResults: 1, description: 'Accident circulation' },
  { id: 17, query: 'إيقاف تحفظي شروط', language: 'ar', category: 'jurisprudence', expectedMinResults: 1, description: 'Détention provisoire' },
  { id: 18, query: 'الطرد التعسفي من العمل', language: 'ar', category: 'jurisprudence', expectedMinResults: 1, description: 'Licenciement abusif AR' },
  { id: 19, query: 'قسمة التركة', language: 'ar', category: 'jurisprudence', expectedMinResults: 1, description: 'Partage succession' },
  { id: 20, query: 'نزاع عقاري قضائي', language: 'ar', category: 'jurisprudence', expectedMinResults: 1, description: 'Litige immobilier' },

  // === CODES & LEGISLATION (20 queries) ===
  { id: 21, query: 'الفصل 319 من المجلة الجزائية', language: 'ar', category: 'codes', expectedMinResults: 1, description: 'Art 319 Code pénal' },
  { id: 22, query: 'مجلة الالتزامات والعقود', language: 'ar', category: 'codes', expectedMinResults: 1, description: 'Code obligations contrats' },
  { id: 23, query: 'مجلة الشغل الفصل 14', language: 'ar', category: 'codes', expectedMinResults: 1, description: 'Code travail art 14' },
  { id: 24, query: 'مجلة الأحوال الشخصية', language: 'ar', category: 'codes', expectedMinResults: 1, description: 'Code statut personnel' },
  { id: 25, query: 'code pénal tunisien vol qualifié', language: 'fr', category: 'codes', expectedMinResults: 1, description: 'Vol qualifié pénal' },
  { id: 26, query: 'قانون الشركات التجارية', language: 'ar', category: 'legislation', expectedMinResults: 1, description: 'Loi sociétés commerciales' },
  { id: 27, query: 'مجلة المرافعات المدنية والتجارية', language: 'ar', category: 'codes', expectedMinResults: 1, description: 'Code procédure civile' },
  { id: 28, query: 'قانون حماية المعطيات الشخصية', language: 'ar', category: 'legislation', expectedMinResults: 1, description: 'Protection données personnelles' },
  { id: 29, query: 'code de commerce tunisien', language: 'fr', category: 'codes', expectedMinResults: 1, description: 'Code commerce' },
  { id: 30, query: 'المجلة الجنائية الفصل 218', language: 'ar', category: 'codes', expectedMinResults: 1, description: 'Code pénal art 218' },
  { id: 31, query: 'مجلة الحقوق العينية', language: 'ar', category: 'codes', expectedMinResults: 1, description: 'Code droits réels' },
  { id: 32, query: 'قانون الجنسية التونسية', language: 'ar', category: 'legislation', expectedMinResults: 1, description: 'Loi nationalité' },
  { id: 33, query: 'المجلة التجارية', language: 'ar', category: 'codes', expectedMinResults: 1, description: 'Code commercial' },
  { id: 34, query: 'loi sur les chèques tunisie', language: 'fr', category: 'legislation', expectedMinResults: 1, description: 'Loi chèques' },
  { id: 35, query: 'مجلة حماية الطفل', language: 'ar', category: 'codes', expectedMinResults: 1, description: 'Code protection enfant' },
  { id: 36, query: 'قانون الإيجارات التجارية', language: 'ar', category: 'legislation', expectedMinResults: 1, description: 'Baux commerciaux' },
  { id: 37, query: 'القانون الأساسي للمحاماة', language: 'ar', category: 'legislation', expectedMinResults: 1, description: 'Loi avocature' },
  { id: 38, query: 'droit foncier tunisien immatriculation', language: 'fr', category: 'codes', expectedMinResults: 1, description: 'Immatriculation foncière' },
  { id: 39, query: 'قانون الميراث في تونس', language: 'ar', category: 'legislation', expectedMinResults: 1, description: 'Droit succession' },
  { id: 40, query: 'المجلة الجبائية الضريبة على الدخل', language: 'ar', category: 'codes', expectedMinResults: 1, description: 'Code fiscal impôt revenu' },

  // === DOCTRINE (15 queries) ===
  { id: 41, query: 'دراسة في المسؤولية التقصيرية', language: 'ar', category: 'doctrine', expectedMinResults: 0, description: 'Étude responsabilité délictuelle' },
  { id: 42, query: 'النظام القانوني للملكية المشتركة', language: 'ar', category: 'doctrine', expectedMinResults: 0, description: 'Copropriété juridique' },
  { id: 43, query: 'doctrine tunisienne droit commercial', language: 'fr', category: 'doctrine', expectedMinResults: 0, description: 'Doctrine droit commercial' },
  { id: 44, query: 'تعليق على قرار محكمة التعقيب', language: 'ar', category: 'doctrine', expectedMinResults: 0, description: 'Commentaire arrêt cassation' },
  { id: 45, query: 'إشكاليات القانون الدولي الخاص', language: 'ar', category: 'doctrine', expectedMinResults: 0, description: 'Problèmes DIP' },
  { id: 46, query: 'حماية المستهلك في تونس', language: 'ar', category: 'doctrine', expectedMinResults: 0, description: 'Protection consommateur' },
  { id: 47, query: 'analyse juridique contrat de travail', language: 'fr', category: 'doctrine', expectedMinResults: 0, description: 'Analyse contrat travail' },
  { id: 48, query: 'الوساطة في النزاعات التجارية', language: 'ar', category: 'doctrine', expectedMinResults: 0, description: 'Médiation litiges commerciaux' },
  { id: 49, query: 'droit numérique en tunisie', language: 'fr', category: 'doctrine', expectedMinResults: 0, description: 'Droit numérique' },
  { id: 50, query: 'ضمانات المتهم في الإجراءات الجزائية', language: 'ar', category: 'doctrine', expectedMinResults: 0, description: 'Garanties accusé' },
  { id: 51, query: 'التحكيم التجاري الدولي', language: 'ar', category: 'doctrine', expectedMinResults: 0, description: 'Arbitrage commercial international' },
  { id: 52, query: 'réforme code des sociétés tunisie', language: 'fr', category: 'doctrine', expectedMinResults: 0, description: 'Réforme code sociétés' },
  { id: 53, query: 'القانون البيئي في تونس', language: 'ar', category: 'doctrine', expectedMinResults: 0, description: 'Droit environnement' },
  { id: 54, query: 'العقد الإلكتروني', language: 'ar', category: 'doctrine', expectedMinResults: 0, description: 'Contrat électronique' },
  { id: 55, query: 'الملكية الفكرية وبراءات الاختراع', language: 'ar', category: 'doctrine', expectedMinResults: 0, description: 'Propriété intellectuelle brevets' },

  // === PROCEDURES (15 queries) ===
  { id: 56, query: 'إجراءات رفع دعوى أمام المحكمة الابتدائية', language: 'ar', category: 'procedures', expectedMinResults: 0, description: 'Procédure 1ère instance' },
  { id: 57, query: 'كيفية الطعن بالتعقيب', language: 'ar', category: 'procedures', expectedMinResults: 0, description: 'Pourvoi en cassation' },
  { id: 58, query: 'procédure de divorce en tunisie', language: 'fr', category: 'procedures', expectedMinResults: 0, description: 'Procédure divorce' },
  { id: 59, query: 'إجراءات التنفيذ الجبري', language: 'ar', category: 'procedures', expectedMinResults: 0, description: 'Exécution forcée' },
  { id: 60, query: 'آجال الاستئناف في القانون التونسي', language: 'ar', category: 'procedures', expectedMinResults: 0, description: 'Délais appel' },
  { id: 61, query: 'délais pourvoi cassation tunisie', language: 'fr', category: 'procedures', expectedMinResults: 0, description: 'Délais cassation FR' },
  { id: 62, query: 'إجراءات الحجز العقاري', language: 'ar', category: 'procedures', expectedMinResults: 0, description: 'Saisie immobilière' },
  { id: 63, query: 'كيفية تسجيل شركة في تونس', language: 'ar', category: 'procedures', expectedMinResults: 0, description: 'Enregistrement société' },
  { id: 64, query: 'procédure injonction de payer', language: 'fr', category: 'procedures', expectedMinResults: 0, description: 'Injonction payer' },
  { id: 65, query: 'الصلح في المادة الجزائية', language: 'ar', category: 'procedures', expectedMinResults: 0, description: 'Conciliation pénale' },
  { id: 66, query: 'طلب الإفراج المؤقت', language: 'ar', category: 'procedures', expectedMinResults: 0, description: 'Demande liberté provisoire' },
  { id: 67, query: 'إجراءات الإفلاس', language: 'ar', category: 'procedures', expectedMinResults: 0, description: 'Procédure faillite' },
  { id: 68, query: 'recours gracieux administration tunisie', language: 'fr', category: 'procedures', expectedMinResults: 0, description: 'Recours gracieux' },
  { id: 69, query: 'تسجيل عقد بيع عقار', language: 'ar', category: 'procedures', expectedMinResults: 0, description: 'Enregistrement vente immobilier' },
  { id: 70, query: 'إجراءات تغيير اللقب العائلي', language: 'ar', category: 'procedures', expectedMinResults: 0, description: 'Changement nom famille' },

  // === DROIT PENAL (10 queries) ===
  { id: 71, query: 'عقوبة جريمة القتل العمد', language: 'ar', category: 'penal', expectedMinResults: 0, description: 'Meurtre prémédité' },
  { id: 72, query: 'جريمة خيانة الأمانة', language: 'ar', category: 'penal', expectedMinResults: 0, description: 'Abus confiance' },
  { id: 73, query: 'التزوير في الوثائق الرسمية', language: 'ar', category: 'penal', expectedMinResults: 0, description: 'Faux documents officiels' },
  { id: 74, query: 'جريمة التحرش الجنسي', language: 'ar', category: 'penal', expectedMinResults: 0, description: 'Harcèlement sexuel' },
  { id: 75, query: 'infractions douanières tunisie', language: 'fr', category: 'penal', expectedMinResults: 0, description: 'Infractions douanières' },
  { id: 76, query: 'غسيل الأموال في القانون التونسي', language: 'ar', category: 'penal', expectedMinResults: 0, description: 'Blanchiment argent' },
  { id: 77, query: 'جريمة إصدار شيك بدون رصيد', language: 'ar', category: 'penal', expectedMinResults: 0, description: 'Chèque sans provision' },
  { id: 78, query: 'عقوبة الرشوة', language: 'ar', category: 'penal', expectedMinResults: 0, description: 'Corruption sanction' },
  { id: 79, query: 'droit pénal des affaires tunisie', language: 'fr', category: 'penal', expectedMinResults: 0, description: 'Droit pénal affaires' },
  { id: 80, query: 'الإتجار بالمخدرات عقوبة', language: 'ar', category: 'penal', expectedMinResults: 0, description: 'Trafic drogue sanction' },

  // === DROIT CIVIL & COMMERCIAL (10 queries) ===
  { id: 81, query: 'شروط عقد الكراء السكني', language: 'ar', category: 'civil', expectedMinResults: 0, description: 'Bail habitation conditions' },
  { id: 82, query: 'الكفالة في القانون التونسي', language: 'ar', category: 'civil', expectedMinResults: 0, description: 'Cautionnement' },
  { id: 83, query: 'contrat de vente immobilière tunisie', language: 'fr', category: 'civil', expectedMinResults: 0, description: 'Vente immobilière' },
  { id: 84, query: 'تأسيس شركة ذات مسؤولية محدودة', language: 'ar', category: 'commercial', expectedMinResults: 0, description: 'Constitution SARL' },
  { id: 85, query: 'إجراءات الإندماج بين الشركات', language: 'ar', category: 'commercial', expectedMinResults: 0, description: 'Fusion sociétés' },
  { id: 86, query: 'droit du bail commercial en tunisie', language: 'fr', category: 'commercial', expectedMinResults: 0, description: 'Bail commercial' },
  { id: 87, query: 'عقد الشراكة التجارية', language: 'ar', category: 'commercial', expectedMinResults: 0, description: 'Contrat partenariat' },
  { id: 88, query: 'المنافسة غير المشروعة', language: 'ar', category: 'commercial', expectedMinResults: 0, description: 'Concurrence déloyale' },
  { id: 89, query: 'الرهن العقاري في القانون التونسي', language: 'ar', category: 'civil', expectedMinResults: 0, description: 'Hypothèque' },
  { id: 90, query: 'obligations contractuelles droit tunisien', language: 'fr', category: 'civil', expectedMinResults: 0, description: 'Obligations contractuelles' },

  // === DROIT DU TRAVAIL & ADMINISTRATIF (10 queries) ===
  { id: 91, query: 'حقوق العامل في القانون التونسي', language: 'ar', category: 'travail', expectedMinResults: 0, description: 'Droits travailleur' },
  { id: 92, query: 'عقد الشغل محدد المدة', language: 'ar', category: 'travail', expectedMinResults: 0, description: 'CDD' },
  { id: 93, query: 'convention collective tunisie', language: 'fr', category: 'travail', expectedMinResults: 0, description: 'Convention collective' },
  { id: 94, query: 'التعويض عن حوادث الشغل', language: 'ar', category: 'travail', expectedMinResults: 0, description: 'Indemnisation AT' },
  { id: 95, query: 'الطعن في القرارات الإدارية', language: 'ar', category: 'administratif', expectedMinResults: 0, description: 'Recours décisions admin' },
  { id: 96, query: 'contentieux administratif tribunal tunisie', language: 'fr', category: 'administratif', expectedMinResults: 0, description: 'Contentieux administratif' },
  { id: 97, query: 'الصفقات العمومية في القانون التونسي', language: 'ar', category: 'administratif', expectedMinResults: 0, description: 'Marchés publics' },
  { id: 98, query: 'droit de grève en tunisie', language: 'fr', category: 'travail', expectedMinResults: 0, description: 'Droit grève' },
  { id: 99, query: 'المسؤولية الإدارية للدولة', language: 'ar', category: 'administratif', expectedMinResults: 0, description: 'Responsabilité État' },
  { id: 100, query: 'نظام التقاعد في تونس', language: 'ar', category: 'travail', expectedMinResults: 0, description: 'Régime retraite' },
]

// =============================================================================
// TYPES
// =============================================================================

interface QueryResult {
  id: number
  query: string
  category: string
  language: string
  resultsCount: number
  topScore: number
  avgScore: number
  minScore: number
  latencyMs: number
  error?: string
}

interface RegressionReport {
  timestamp: string
  totalQueries: number
  successful: number
  failed: number
  avgLatencyMs: number
  avgTopScore: number
  avgResultsCount: number
  queriesWithResults: number
  queriesWithoutResults: number
  byCategory: Record<string, { count: number; avgScore: number; avgResults: number }>
  byLanguage: Record<string, { count: number; avgScore: number }>
  results: QueryResult[]
}

// =============================================================================
// MAIN
// =============================================================================

async function runTests(): Promise<RegressionReport> {
  console.log('╔═══════════════════════════════════════════════════════════╗')
  console.log('║       TEST DE RÉGRESSION RAG - 100 Queries               ║')
  console.log('╚═══════════════════════════════════════════════════════════╝')
  console.log()

  const results: QueryResult[] = []
  const startTime = Date.now()

  for (const testQuery of TEST_QUERIES) {
    const queryStart = Date.now()

    try {
      const searchResults = await searchKnowledgeBase(testQuery.query, {
        limit: 10,
        threshold: 0.50,
        operationName: 'assistant-ia',
      })

      const latency = Date.now() - queryStart
      const scores = searchResults.map((r) => r.similarity)

      const result: QueryResult = {
        id: testQuery.id,
        query: testQuery.query,
        category: testQuery.category,
        language: testQuery.language,
        resultsCount: searchResults.length,
        topScore: scores.length > 0 ? Math.max(...scores) : 0,
        avgScore: scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0,
        minScore: scores.length > 0 ? Math.min(...scores) : 0,
        latencyMs: latency,
      }

      results.push(result)

      const status = searchResults.length > 0 ? '✅' : '⚠️'
      const scoreStr =
        scores.length > 0 ? `top=${(result.topScore * 100).toFixed(0)}%` : 'no results'
      console.log(
        `  ${status} [${String(testQuery.id).padStart(3)}] ${scoreStr.padEnd(12)} ${latency}ms  ${testQuery.description}`
      )
    } catch (error: any) {
      const latency = Date.now() - queryStart
      results.push({
        id: testQuery.id,
        query: testQuery.query,
        category: testQuery.category,
        language: testQuery.language,
        resultsCount: 0,
        topScore: 0,
        avgScore: 0,
        minScore: 0,
        latencyMs: latency,
        error: error.message,
      })
      console.log(`  ❌ [${String(testQuery.id).padStart(3)}] ERROR ${latency}ms  ${error.message}`)
    }
  }

  const totalDuration = Date.now() - startTime
  const successful = results.filter((r) => !r.error)
  const withResults = results.filter((r) => r.resultsCount > 0)

  // Stats par catégorie
  const byCategory: Record<string, { count: number; avgScore: number; avgResults: number }> = {}
  for (const r of results) {
    if (!byCategory[r.category]) {
      byCategory[r.category] = { count: 0, avgScore: 0, avgResults: 0 }
    }
    byCategory[r.category].count++
    byCategory[r.category].avgScore += r.topScore
    byCategory[r.category].avgResults += r.resultsCount
  }
  for (const cat of Object.keys(byCategory)) {
    byCategory[cat].avgScore /= byCategory[cat].count
    byCategory[cat].avgResults /= byCategory[cat].count
  }

  // Stats par langue
  const byLanguage: Record<string, { count: number; avgScore: number }> = {}
  for (const r of results) {
    if (!byLanguage[r.language]) {
      byLanguage[r.language] = { count: 0, avgScore: 0 }
    }
    byLanguage[r.language].count++
    byLanguage[r.language].avgScore += r.topScore
  }
  for (const lang of Object.keys(byLanguage)) {
    byLanguage[lang].avgScore /= byLanguage[lang].count
  }

  const report: RegressionReport = {
    timestamp: new Date().toISOString(),
    totalQueries: results.length,
    successful: successful.length,
    failed: results.length - successful.length,
    avgLatencyMs: Math.round(results.reduce((sum, r) => sum + r.latencyMs, 0) / results.length),
    avgTopScore: results.reduce((sum, r) => sum + r.topScore, 0) / results.length,
    avgResultsCount: results.reduce((sum, r) => sum + r.resultsCount, 0) / results.length,
    queriesWithResults: withResults.length,
    queriesWithoutResults: results.length - withResults.length,
    byCategory,
    byLanguage,
    results,
  }

  // Afficher résumé
  console.log()
  console.log('═══════════════════════════════════════════════════════════')
  console.log('  📊 RÉSUMÉ')
  console.log('═══════════════════════════════════════════════════════════')
  console.log(`  Total queries:      ${report.totalQueries}`)
  console.log(`  Réussies:           ${report.successful}`)
  console.log(`  Échouées:           ${report.failed}`)
  console.log(`  Avec résultats:     ${report.queriesWithResults}`)
  console.log(`  Sans résultats:     ${report.queriesWithoutResults}`)
  console.log(`  Score moyen top:    ${(report.avgTopScore * 100).toFixed(1)}%`)
  console.log(`  Résultats moyens:   ${report.avgResultsCount.toFixed(1)}`)
  console.log(`  Latence moyenne:    ${report.avgLatencyMs}ms`)
  console.log(`  Durée totale:       ${(totalDuration / 1000).toFixed(1)}s`)
  console.log()
  console.log('  📂 Par catégorie:')
  for (const [cat, stats] of Object.entries(byCategory)) {
    console.log(
      `    ${cat.padEnd(18)} ${stats.count} queries, score=${(stats.avgScore * 100).toFixed(0)}%, results=${stats.avgResults.toFixed(1)}`
    )
  }
  console.log()
  console.log('  🌐 Par langue:')
  for (const [lang, stats] of Object.entries(byLanguage)) {
    console.log(
      `    ${lang.padEnd(8)} ${stats.count} queries, score=${(stats.avgScore * 100).toFixed(0)}%`
    )
  }
  console.log('═══════════════════════════════════════════════════════════')

  return report
}

async function captureBaseline(report: RegressionReport): Promise<void> {
  const dir = path.dirname(BASELINE_PATH)
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
  fs.writeFileSync(BASELINE_PATH, JSON.stringify(report, null, 2))
  console.log(`\n✅ Baseline capturée dans ${BASELINE_PATH}`)
}

function compareWithBaseline(current: RegressionReport): boolean {
  if (!fs.existsSync(BASELINE_PATH)) {
    console.log('\n⚠️  Pas de baseline trouvée. Capturez-en une avec --capture')
    return true
  }

  const baseline: RegressionReport = JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf-8'))

  console.log()
  console.log('═══════════════════════════════════════════════════════════')
  console.log('  🔄 COMPARAISON AVEC BASELINE')
  console.log('═══════════════════════════════════════════════════════════')
  console.log(`  Baseline date:    ${baseline.timestamp}`)
  console.log(`  Seuil régression: ${(REGRESSION_THRESHOLD * 100).toFixed(0)}%`)
  console.log()

  let hasRegression = false

  // Comparer score moyen
  const scoreDiff = current.avgTopScore - baseline.avgTopScore
  const scoreStatus = scoreDiff >= -REGRESSION_THRESHOLD ? '✅' : '❌'
  console.log(
    `  ${scoreStatus} Score moyen:    ${(baseline.avgTopScore * 100).toFixed(1)}% → ${(current.avgTopScore * 100).toFixed(1)}% (${scoreDiff >= 0 ? '+' : ''}${(scoreDiff * 100).toFixed(1)}%)`
  )
  if (scoreDiff < -REGRESSION_THRESHOLD) hasRegression = true

  // Comparer résultats moyens
  const resultsDiff = current.avgResultsCount - baseline.avgResultsCount
  const resultsStatus = resultsDiff >= -1 ? '✅' : '❌'
  console.log(
    `  ${resultsStatus} Résultats moy: ${baseline.avgResultsCount.toFixed(1)} → ${current.avgResultsCount.toFixed(1)} (${resultsDiff >= 0 ? '+' : ''}${resultsDiff.toFixed(1)})`
  )

  // Comparer latence
  const latencyDiff = current.avgLatencyMs - baseline.avgLatencyMs
  const latencyPct = latencyDiff / baseline.avgLatencyMs
  const latencyStatus = latencyPct <= 0.5 ? '✅' : '⚠️'
  console.log(
    `  ${latencyStatus} Latence moy:   ${baseline.avgLatencyMs}ms → ${current.avgLatencyMs}ms (${latencyDiff >= 0 ? '+' : ''}${latencyDiff}ms)`
  )

  // Comparer par catégorie
  console.log()
  console.log('  📂 Par catégorie:')
  for (const [cat, currentStats] of Object.entries(current.byCategory)) {
    const baselineStats = baseline.byCategory[cat]
    if (!baselineStats) {
      console.log(`    ${cat.padEnd(18)} NEW (pas dans baseline)`)
      continue
    }
    const diff = currentStats.avgScore - baselineStats.avgScore
    const status = diff >= -REGRESSION_THRESHOLD ? '✅' : '❌'
    console.log(
      `    ${status} ${cat.padEnd(16)} ${(baselineStats.avgScore * 100).toFixed(0)}% → ${(currentStats.avgScore * 100).toFixed(0)}% (${diff >= 0 ? '+' : ''}${(diff * 100).toFixed(0)}%)`
    )
    if (diff < -REGRESSION_THRESHOLD) hasRegression = true
  }

  console.log()
  if (hasRegression) {
    console.log(`  ❌ RÉGRESSION DÉTECTÉE (seuil: ${(REGRESSION_THRESHOLD * 100).toFixed(0)}%)`)
  } else {
    console.log(`  ✅ AUCUNE RÉGRESSION (seuil: ${(REGRESSION_THRESHOLD * 100).toFixed(0)}%)`)
  }
  console.log('═══════════════════════════════════════════════════════════')

  return !hasRegression
}

async function main() {
  try {
    const report = await runTests()

    // Sauvegarder résultats
    const dir = path.dirname(RESULTS_PATH)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }
    fs.writeFileSync(RESULTS_PATH, JSON.stringify(report, null, 2))
    console.log(`\n📄 Résultats sauvegardés dans ${RESULTS_PATH}`)

    if (CAPTURE_MODE) {
      await captureBaseline(report)
    }

    if (COMPARE_MODE || (!CAPTURE_MODE && fs.existsSync(BASELINE_PATH))) {
      const passed = compareWithBaseline(report)
      process.exit(passed ? 0 : 1)
    }

    process.exit(0)
  } catch (error) {
    console.error('❌ Erreur fatale:', error)
    process.exit(1)
  }
}

main()
