-- Migration: Rag Eval V2 — Nouvelles colonnes pour A/B, run modes, judge
-- Date: 2026-02-20

-- Nouvelles colonnes sur rag_eval_results
ALTER TABLE rag_eval_results ADD COLUMN IF NOT EXISTS run_label TEXT;
ALTER TABLE rag_eval_results ADD COLUMN IF NOT EXISTS run_mode TEXT DEFAULT 'retrieval';
ALTER TABLE rag_eval_results ADD COLUMN IF NOT EXISTS retrieval_latency_ms INTEGER;
ALTER TABLE rag_eval_results ADD COLUMN IF NOT EXISTS answer_latency_ms INTEGER;
ALTER TABLE rag_eval_results ADD COLUMN IF NOT EXISTS judge_score FLOAT;
ALTER TABLE rag_eval_results ADD COLUMN IF NOT EXISTS judge_reasoning TEXT;
ALTER TABLE rag_eval_results ADD COLUMN IF NOT EXISTS judge_covered_points INTEGER;
ALTER TABLE rag_eval_results ADD COLUMN IF NOT EXISTS judge_total_points INTEGER;
ALTER TABLE rag_eval_results ADD COLUMN IF NOT EXISTS abstention_reason TEXT;
ALTER TABLE rag_eval_results ADD COLUMN IF NOT EXISTS quality_indicator TEXT;
ALTER TABLE rag_eval_results ADD COLUMN IF NOT EXISTS avg_similarity FLOAT;

-- Index pour les requêtes de comparaison et filtrage
CREATE INDEX IF NOT EXISTS idx_rag_eval_run_label ON rag_eval_results(run_label);
CREATE INDEX IF NOT EXISTS idx_rag_eval_run_mode ON rag_eval_results(run_mode);
CREATE INDEX IF NOT EXISTS idx_rag_eval_created_desc ON rag_eval_results(created_at DESC);
