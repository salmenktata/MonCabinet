/**
 * Types partagés pour le système d'évaluation RAG
 *
 * Utilisés par le runner, le cron, le dashboard et les scripts.
 *
 * @module lib/ai/rag-eval-types
 */

// =============================================================================
// GOLD DATASET
// =============================================================================

export interface GoldEvalCase {
  id: string
  domain: string
  difficulty: string
  question: string
  intentType: string
  expectedAnswer: {
    keyPoints: string[]
    mandatoryCitations: string[]
  }
  expectedArticles?: string[]
  goldChunkIds?: string[]
  goldDocumentIds?: string[]
  evaluationCriteria?: {
    completeness: number
    accuracy: number
    citations: number
    reasoning: number
  }
  expertValidation?: {
    validatorId: string
    credentials: string
    validatedAt: string
    consensus: number
  }
  minRecallAt5?: number
}

// =============================================================================
// RUN CONFIG
// =============================================================================

export type RunMode = 'retrieval' | 'e2e' | 'e2e+judge'

export interface RunConfig {
  mode: 'quick' | 'full'
  label?: string
  quickN?: number
  runMode: RunMode
}

// =============================================================================
// EVAL RESULTS
// =============================================================================

export interface EvalResultRow {
  id: string
  run_id: string
  question_id: string
  question: string
  language: string
  domain: string
  difficulty: string
  gold_chunk_ids: string[]
  retrieved_chunk_ids: string[]
  recall_at_1: number
  recall_at_3: number
  recall_at_5: number
  recall_at_10: number
  precision_at_5: number
  mrr: number
  faithfulness_score: number
  citation_accuracy: number
  expected_answer: string
  actual_answer: string
  sources_returned: string
  latency_ms: number
  // V2 columns
  run_label: string | null
  run_mode: string | null
  retrieval_latency_ms: number | null
  answer_latency_ms: number | null
  judge_score: number | null
  judge_reasoning: string | null
  judge_covered_points: number | null
  judge_total_points: number | null
  abstention_reason: string | null
  quality_indicator: string | null
  avg_similarity: number | null
  created_at: string
}

export interface RunSummary {
  run_id: string
  started_at: string
  total_questions: number
  avg_recall_5: number
  avg_mrr: number
  avg_faithfulness: number
  avg_citation_accuracy: number
  avg_latency_ms: number
  failed_count: number
  run_label: string | null
  run_mode: string | null
  avg_judge_score: number | null
}

export interface RunDetailedResult {
  summary: {
    total: number
    avg_recall_1: number
    avg_recall_3: number
    avg_recall_5: number
    avg_recall_10: number
    avg_precision_5: number
    avg_mrr: number
    avg_faithfulness: number
    avg_citation_accuracy: number
    avg_latency_ms: number
    avg_judge_score: number | null
    high_recall_count: number
    failed_count: number
  }
  results: EvalResultRow[]
}

export interface DomainBreakdown {
  domain: string
  count: number
  avg_recall_5: number
  avg_mrr: number
  avg_faithfulness: number
  avg_judge_score: number | null
}

export interface DifficultyBreakdown {
  difficulty: string
  count: number
  avg_recall_5: number
  avg_mrr: number
  avg_faithfulness: number
  avg_judge_score: number | null
}

// =============================================================================
// A/B COMPARISON
// =============================================================================

export interface CompareResult {
  runA: { run_id: string; label: string | null; mode: string | null; metrics: RunAggregates }
  runB: { run_id: string; label: string | null; mode: string | null; metrics: RunAggregates }
  deltas: RunAggregates
  regressionDetected: boolean
  perQuestion: QuestionDiff[]
  perDomain: DomainDiff[]
}

export interface RunAggregates {
  avg_recall_5: number
  avg_mrr: number
  avg_faithfulness: number
  avg_citation_accuracy: number
  avg_latency_ms: number
  avg_judge_score: number | null
  total_questions: number
}

export interface QuestionDiff {
  question_id: string
  question: string
  domain: string
  recall_5_a: number
  recall_5_b: number
  mrr_a: number
  mrr_b: number
  delta_recall_5: number
  delta_mrr: number
}

export interface DomainDiff {
  domain: string
  recall_5_a: number
  recall_5_b: number
  mrr_a: number
  mrr_b: number
  delta_recall_5: number
  delta_mrr: number
}
