/**
 * API Route: RAG Evaluation Benchmark
 *
 * Exécute un benchmark de 20+ questions juridiques contre le pipeline RAG complet
 * et retourne un rapport détaillé avec métriques hit@3/5/10, latences, scores.
 *
 * POST /api/admin/rag-eval
 * Headers: X-Cron-Secret
 * Body (optionnel): { queries?: EvalQuery[], options?: { limit?: number, withRerank?: boolean } }
 */

import { NextRequest, NextResponse } from 'next/server'
import { searchKnowledgeBaseHybrid, type KnowledgeBaseSearchResult } from '@/lib/ai/knowledge-base-service'
import { enrichQueryWithLegalSynonyms, expandQuery, condenseQuery } from '@/lib/ai/query-expansion-service'
import { answerQuestion } from '@/lib/ai/rag-chat-service'

// =============================================================================
// TYPES
// =============================================================================

interface EvalQuery {
  query: string
  expectedTitle: string
  domain: string
}

interface EvalResultDetail {
  query: string
  domain: string
  expectedTitle: string
  found: boolean
  foundAt: number | null
  topScore: number
  expectedScore: number | null
  resultCount: number
  latencyMs: number
  expandedQuery: string
  enrichedQuery: string
  top5: {
    title: string
    score: number
    category: string
    chunkIndex: number
    contentPreview: string
  }[]
}

interface EvalDomainStats {
  'hit@3': number
  'hit@5': number
  'hit@10': number
  total: number
  avgScore: number
  avgLatencyMs: number
}

interface EvalSummary {
  totalQueries: number
  'hit@3': number
  'hit@5': number
  'hit@10': number
  'hit@3_pct': string
  'hit@5_pct': string
  'hit@10_pct': string
  avgLatencyMs: number
  avgTopScore: number
  avgResultCount: number
  zeroResults: number
  byDomain: Record<string, EvalDomainStats>
}

// =============================================================================
// BENCHMARK QUESTIONS
// =============================================================================

const EVAL_BENCHMARK: EvalQuery[] = [
  // PÉNAL (المجلة الجزائية)
  { query: 'ما هي شروط الدفاع الشرعي في القانون التونسي؟', expectedTitle: 'المجلة الجزائية', domain: 'penal' },
  { query: 'عقوبة القتل العمد في تونس', expectedTitle: 'المجلة الجزائية', domain: 'penal' },
  { query: 'أركان جريمة السرقة', expectedTitle: 'المجلة الجزائية', domain: 'penal' },
  { query: 'عقوبة الرشوة والفساد', expectedTitle: 'المجلة الجزائية', domain: 'penal' },

  // CIVIL (مجلة الالتزامات والعقود)
  { query: 'شروط صحة العقد في القانون التونسي', expectedTitle: 'مجلة الالتزامات والعقود', domain: 'civil' },
  { query: 'التعويض عن الضرر المعنوي', expectedTitle: 'مجلة الالتزامات والعقود', domain: 'civil' },
  { query: 'أحكام التقادم المدني', expectedTitle: 'مجلة الالتزامات والعقود', domain: 'civil' },

  // FAMILLE (مجلة الأحوال الشخصية)
  { query: 'إجراءات الطلاق بالتراضي في تونس', expectedTitle: 'مجلة الأحوال الشخصية', domain: 'famille' },
  { query: 'حق الحضانة بعد الطلاق', expectedTitle: 'مجلة الأحوال الشخصية', domain: 'famille' },
  { query: 'النفقة الزوجية والنفقة للأبناء', expectedTitle: 'مجلة الأحوال الشخصية', domain: 'famille' },
  { query: 'شروط الزواج في القانون التونسي', expectedTitle: 'مجلة الأحوال الشخصية', domain: 'famille' },

  // TRAVAIL (مجلة الشغل)
  { query: 'حقوق العامل في حالة الطرد التعسفي', expectedTitle: 'مجلة الشغل', domain: 'travail' },
  { query: 'شروط الإضراب المشروع', expectedTitle: 'مجلة الشغل', domain: 'travail' },

  // COMMERCIAL (المجلة التجارية)
  { query: 'عقوبة إصدار شيك بدون رصيد', expectedTitle: 'المجلة التجارية', domain: 'commercial' },
  { query: 'إجراءات التفليس في القانون التجاري', expectedTitle: 'المجلة التجارية', domain: 'commercial' },

  // PROCÉDURE (مجلة المرافعات المدنية والتجارية)
  { query: 'آجال الاستئناف في المادة المدنية', expectedTitle: 'مجلة المرافعات المدنية والتجارية', domain: 'procedure' },
  { query: 'شروط الطعن بالتعقيب', expectedTitle: 'مجلة المرافعات المدنية والتجارية', domain: 'procedure' },

  // FRANÇAIS (test bilingue)
  { query: 'Quelles sont les conditions du divorce en Tunisie?', expectedTitle: 'مجلة الأحوال الشخصية', domain: 'famille-fr' },
  { query: 'La responsabilité civile délictuelle en droit tunisien', expectedTitle: 'مجلة الالتزامات والعقود', domain: 'civil-fr' },
  { query: 'Les conditions de la légitime défense', expectedTitle: 'المجلة الجزائية', domain: 'penal-fr' },
]

// =============================================================================
// HELPERS
// =============================================================================

// Domain boost mapping (mirrors rag-chat-service.ts detectDomainBoost)
const DOMAIN_BOOST_MAP: { keywords: string[]; titlePatterns: string[]; factor: number }[] = [
  { keywords: ['جزائي', 'جزائية', 'جنائي', 'عقوبة', 'عقوبات', 'جريمة', 'القتل', 'السرقة', 'الدفاع الشرعي', 'الرشوة', 'pénal', 'criminel', 'légitime défense'], titlePatterns: ['المجلة الجزائية', 'الإجراءات الجزائية'], factor: 1.25 },
  { keywords: ['مدني', 'التزامات', 'عقود', 'تعويض', 'مسؤولية مدنية', 'تقادم', 'civil', 'responsabilité', 'délictuel'], titlePatterns: ['مجلة الالتزامات والعقود'], factor: 1.25 },
  { keywords: ['أحوال شخصية', 'طلاق', 'زواج', 'نفقة', 'حضانة', 'ميراث', 'divorce', 'mariage', 'garde', 'famille'], titlePatterns: ['مجلة الأحوال الشخصية'], factor: 1.25 },
  { keywords: ['شغل', 'عمل', 'طرد تعسفي', 'إضراب', 'أجر', 'عامل', 'مؤجر', 'travail', 'licenciement', 'grève'], titlePatterns: ['مجلة الشغل'], factor: 1.25 },
  { keywords: ['تجاري', 'تجارية', 'شيك', 'إفلاس', 'تفليس', 'كمبيالة', 'commercial', 'chèque', 'faillite'], titlePatterns: ['المجلة التجارية', 'مجلة الشركات التجارية'], factor: 1.25 },
  { keywords: ['مرافعات', 'استئناف', 'تعقيب', 'دعوى', 'إجراءات مدنية', 'procédure'], titlePatterns: ['مجلة المرافعات المدنية والتجارية'], factor: 1.20 },
]

function applyDomainBoost(results: KnowledgeBaseSearchResult[], query: string): KnowledgeBaseSearchResult[] {
  if (results.length === 0) return results

  const queryLower = query.toLowerCase()
  const boostPatterns: { pattern: string; factor: number }[] = []

  for (const domain of DOMAIN_BOOST_MAP) {
    const hasKeyword = domain.keywords.some(kw => query.includes(kw) || queryLower.includes(kw))
    if (hasKeyword) {
      for (const p of domain.titlePatterns) {
        boostPatterns.push({ pattern: p, factor: domain.factor })
      }
    }
  }

  if (boostPatterns.length === 0) return results

  // Apply code source boost (1.3x) + domain boost and re-sort
  const CODE_BOOST = 1.3
  const boosted = results.map(r => {
    let boost = r.category === 'codes' ? CODE_BOOST : 1.0
    for (const { pattern, factor } of boostPatterns) {
      if (r.title.includes(pattern)) {
        boost *= factor
        break
      }
    }
    return { ...r, similarity: r.similarity * boost }
  })

  boosted.sort((a, b) => b.similarity - a.similarity)
  return boosted
}

function titleMatchesExpected(resultTitle: string, expectedTitle: string): boolean {
  const normalizedResult = resultTitle.trim()
  const normalizedExpected = expectedTitle.trim()

  // Exact match
  if (normalizedResult === normalizedExpected) return true

  // Contains match (le titre KB peut être plus long)
  if (normalizedResult.includes(normalizedExpected)) return true
  if (normalizedExpected.includes(normalizedResult)) return true

  // Partial match: au moins 80% des mots en commun
  const resultWords = normalizedResult.split(/\s+/)
  const expectedWords = normalizedExpected.split(/\s+/)
  const commonWords = resultWords.filter(w => expectedWords.includes(w))
  const matchRatio = commonWords.length / Math.max(expectedWords.length, 1)

  return matchRatio >= 0.8
}

async function evaluateQuery(
  evalQuery: EvalQuery,
  searchLimit: number
): Promise<EvalResultDetail> {
  const start = Date.now()

  // Pipeline expansion
  let expandedQuery = evalQuery.query
  if (evalQuery.query.length < 50) {
    try {
      expandedQuery = await expandQuery(evalQuery.query)
    } catch {
      // Fallback: use original query
    }
  } else if (evalQuery.query.length > 200) {
    try {
      expandedQuery = await condenseQuery(evalQuery.query)
    } catch {
      // Fallback: use original query
    }
  }

  // Enrichir avec synonymes juridiques
  const enrichedQuery = enrichQueryWithLegalSynonyms(expandedQuery)

  // Recherche hybride
  let results: KnowledgeBaseSearchResult[] = []
  try {
    results = await searchKnowledgeBaseHybrid(enrichedQuery, {
      limit: searchLimit,
      operationName: 'assistant-ia',
    })
  } catch (error) {
    console.error(`[RAG Eval] Search error for "${evalQuery.query}":`, error)
  }

  // Appliquer domain boost (comme le fait le pipeline réel dans rag-chat-service)
  results = applyDomainBoost(results, evalQuery.query)

  const latencyMs = Date.now() - start

  // Trouver le document attendu dans les résultats
  let foundAt: number | null = null
  let expectedScore: number | null = null

  for (let i = 0; i < results.length; i++) {
    if (titleMatchesExpected(results[i].title, evalQuery.expectedTitle)) {
      foundAt = i + 1 // 1-indexed
      expectedScore = results[i].similarity
      break
    }
  }

  return {
    query: evalQuery.query,
    domain: evalQuery.domain,
    expectedTitle: evalQuery.expectedTitle,
    found: foundAt !== null,
    foundAt,
    topScore: results.length > 0 ? results[0].similarity : 0,
    expectedScore,
    resultCount: results.length,
    latencyMs,
    expandedQuery,
    enrichedQuery,
    top5: results.slice(0, 5).map(r => ({
      title: r.title,
      score: r.similarity,
      category: r.category,
      chunkIndex: r.chunkIndex,
      contentPreview: r.chunkContent.substring(0, 150) + (r.chunkContent.length > 150 ? '...' : ''),
    })),
  }
}

function buildSummary(details: EvalResultDetail[]): EvalSummary {
  const totalQueries = details.length
  let hit3 = 0, hit5 = 0, hit10 = 0
  let totalLatency = 0, totalTopScore = 0, totalResults = 0, zeroResults = 0

  const byDomain: Record<string, EvalDomainStats> = {}

  for (const d of details) {
    if (d.foundAt !== null && d.foundAt <= 3) hit3++
    if (d.foundAt !== null && d.foundAt <= 5) hit5++
    if (d.foundAt !== null && d.foundAt <= 10) hit10++

    totalLatency += d.latencyMs
    totalTopScore += d.topScore
    totalResults += d.resultCount
    if (d.resultCount === 0) zeroResults++

    // Stats par domaine
    if (!byDomain[d.domain]) {
      byDomain[d.domain] = { 'hit@3': 0, 'hit@5': 0, 'hit@10': 0, total: 0, avgScore: 0, avgLatencyMs: 0 }
    }
    const ds = byDomain[d.domain]
    ds.total++
    ds.avgScore += d.topScore
    ds.avgLatencyMs += d.latencyMs
    if (d.foundAt !== null && d.foundAt <= 3) ds['hit@3']++
    if (d.foundAt !== null && d.foundAt <= 5) ds['hit@5']++
    if (d.foundAt !== null && d.foundAt <= 10) ds['hit@10']++
  }

  // Moyennes par domaine
  for (const ds of Object.values(byDomain)) {
    ds.avgScore = Math.round((ds.avgScore / ds.total) * 1000) / 1000
    ds.avgLatencyMs = Math.round(ds.avgLatencyMs / ds.total)
  }

  return {
    totalQueries,
    'hit@3': hit3,
    'hit@5': hit5,
    'hit@10': hit10,
    'hit@3_pct': `${Math.round((hit3 / totalQueries) * 100)}%`,
    'hit@5_pct': `${Math.round((hit5 / totalQueries) * 100)}%`,
    'hit@10_pct': `${Math.round((hit10 / totalQueries) * 100)}%`,
    avgLatencyMs: Math.round(totalLatency / totalQueries),
    avgTopScore: Math.round((totalTopScore / totalQueries) * 1000) / 1000,
    avgResultCount: Math.round((totalResults / totalQueries) * 10) / 10,
    zeroResults,
    byDomain,
  }
}

// =============================================================================
// ROUTE HANDLER
// =============================================================================

export async function POST(request: NextRequest) {
  try {
    // Auth check
    const cronSecret = request.headers.get('X-Cron-Secret')
    if (cronSecret !== process.env.CRON_SECRET) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Parse body (optionnel)
    let customQueries: EvalQuery[] | undefined
    let searchLimit = 15
    let chatMode = false
    let chatQuestion = ''
    try {
      const body = await request.json()
      if (body.queries && Array.isArray(body.queries)) {
        customQueries = body.queries
      }
      if (body.options?.limit) {
        searchLimit = Math.min(body.options.limit, 50)
      }
      // Mode chat: exécuter le pipeline RAG complet avec réponse LLM
      if (body.chat) {
        chatMode = true
        chatQuestion = body.chat
      }
    } catch {
      // Pas de body = utiliser benchmark par défaut
    }

    // Mode chat: pipeline RAG complet (recherche + LLM)
    if (chatMode && chatQuestion) {
      console.log(`[RAG Eval] Chat mode: "${chatQuestion.substring(0, 60)}..."`)
      const startTime = Date.now()
      const response = await answerQuestion(chatQuestion, 'admin-eval', {
        operationName: 'assistant-ia',
      })
      const totalTimeMs = Date.now() - startTime
      return NextResponse.json({
        mode: 'chat',
        answer: response.answer,
        model: response.model,
        tokensUsed: response.tokensUsed,
        sources: response.sources.map(s => ({
          title: s.documentName,
          score: s.similarity,
          category: s.metadata?.category,
          contentPreview: s.chunkContent?.substring(0, 200),
        })),
        sourceCount: response.sources.length,
        citationWarnings: response.citationWarnings,
        totalTimeMs,
        timestamp: new Date().toISOString(),
      })
    }

    const queries = customQueries || EVAL_BENCHMARK
    console.log(`[RAG Eval] Starting evaluation with ${queries.length} queries (limit=${searchLimit})`)

    const startTime = Date.now()

    // Exécuter toutes les queries séquentiellement (pour ne pas surcharger)
    const details: EvalResultDetail[] = []
    for (const q of queries) {
      const result = await evaluateQuery(q, searchLimit)
      details.push(result)
      console.log(
        `[RAG Eval] ${result.found ? '✅' : '❌'} "${q.query.substring(0, 40)}..." → ` +
        `${result.found ? `found@${result.foundAt}` : 'NOT FOUND'} ` +
        `(${result.resultCount} results, top=${result.topScore.toFixed(3)}, ${result.latencyMs}ms)`
      )
    }

    const totalTimeMs = Date.now() - startTime
    const summary = buildSummary(details)

    console.log(`[RAG Eval] ✅ Done in ${totalTimeMs}ms - hit@5=${summary['hit@5']}/${summary.totalQueries} (${summary['hit@5_pct']})`)

    return NextResponse.json({
      summary,
      totalTimeMs,
      details,
      timestamp: new Date().toISOString(),
      config: {
        searchLimit,
        queryCount: queries.length,
        isCustomBenchmark: !!customQueries,
      },
    })
  } catch (error: unknown) {
    console.error('[RAG Eval] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

// GET pour vérification rapide
export async function GET(request: NextRequest) {
  const cronSecret = request.headers.get('X-Cron-Secret')
  if (cronSecret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  return NextResponse.json({
    status: 'ready',
    benchmarkSize: EVAL_BENCHMARK.length,
    domains: Array.from(new Set(EVAL_BENCHMARK.map(q => q.domain))),
    usage: 'POST /api/admin/rag-eval with X-Cron-Secret header',
  })
}
