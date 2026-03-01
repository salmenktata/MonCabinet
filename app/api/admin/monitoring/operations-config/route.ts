/**
 * API Monitoring - Configuration IA par Opération
 *
 * GET /api/admin/monitoring/operations-config
 *
 * Retourne la configuration IA actuelle depuis AI_OPERATIONS_CONFIG,
 * évaluée côté serveur avec NODE_ENV courant.
 *
 * Auth: Super-admin via middleware session
 *
 * Réponse:
 * {
 *   "operations": [
 *     { "name": "assistant-ia", "label": "Assistant IA", "provider": "groq", "model": "llama-3.3-70b-versatile", ... },
 *     ...
 *   ],
 *   "activeProviders": ["openai", "groq", "ollama", "deepseek"],
 *   "inactiveProviders": ["gemini", "anthropic"],
 *   "mode": "no-fallback",
 *   "env": "production"
 * }
 */

import { NextResponse } from 'next/server'
import { AI_OPERATIONS_CONFIG, type OperationName } from '@/lib/ai/operations-config'
import { withAdminApiAuth } from '@/lib/auth/with-admin-api-auth'

// Labels FR pour chaque opération
const OPERATION_LABELS: Record<OperationName, string> = {
  'indexation': 'Indexation KB',
  'assistant-ia': 'Assistant IA',
  'dossiers-assistant': 'Assistant Dossiers',
  'dossiers-structuration': 'Structuration Dossier',
  'dossiers-consultation': 'Consultation IRAC',
  'kb-quality-analysis': 'Analyse Qualité KB',
  'query-classification': 'Classification Requête',
  'query-expansion': 'Expansion Requête',
  'document-consolidation': 'Consolidation Documents',
  'rag-eval-judge': 'Eval RAG Judge',
  'compare-deepseek': 'Comparer DeepSeek',
  'compare-openai': 'Comparer OpenAI',
  'compare-ollama': 'Comparer Ollama',
  'ariida-generation': 'Génération Requête (عريضة)',
}

// Coût estimé par opération (en prod — tarifs DeepSeek vérifiés mars 2026)
const COST_ESTIMATES: Record<OperationName, string> = {
  'indexation': '~$2-5/mois (OpenAI embeddings)',
  'assistant-ia': '~$0.028/M tokens (DeepSeek cache hit)',
  'dossiers-assistant': '~$0.028/M tokens (DeepSeek cache hit)',
  'dossiers-structuration': '~$0.028/M tokens (DeepSeek cache hit)',
  'dossiers-consultation': '~$0.028/M tokens (DeepSeek cache hit)',
  'kb-quality-analysis': 'Gratuit (Ollama local)',
  'query-classification': 'Gratuit (Ollama local)',
  'query-expansion': 'Gratuit (Ollama local)',
  'document-consolidation': '~$0.028/M tokens (DeepSeek cache hit)',
  'rag-eval-judge': '~$0.028/M tokens (DeepSeek cache hit)',
  'compare-deepseek': '~$0.028/M tokens (DeepSeek cache hit)',
  'compare-openai': '~$0.03/requête (OpenAI GPT-4o)',
  'compare-ollama': 'Gratuit (Ollama local)',
  'ariida-generation': '~$0.028/M tokens (DeepSeek cache hit)',
}

// Tous les providers connus
const ALL_KNOWN_PROVIDERS = ['gemini', 'openai', 'groq', 'ollama', 'deepseek', 'anthropic'] as const

export const GET = withAdminApiAuth(async (_request, _ctx, _session) => {
  const env = process.env.NODE_ENV || 'development'

  // Construire la liste des opérations
  const operations = (Object.keys(AI_OPERATIONS_CONFIG) as OperationName[]).map((name) => {
    const config = AI_OPERATIONS_CONFIG[name]
    return {
      name,
      label: OPERATION_LABELS[name],
      provider: config.model.provider,
      model: config.model.name,
      timeout: config.timeouts?.total
        ? `${config.timeouts.total / 1000}s`
        : config.timeouts?.chat
          ? `${config.timeouts.chat / 1000}s`
          : null,
      embeddings: config.embeddings
        ? {
            provider: config.embeddings.provider,
            model: config.embeddings.model,
            dimensions: config.embeddings.dimensions,
          }
        : null,
      costEstimate: COST_ESTIMATES[name],
      alertSeverity: config.alerts.severity,
      description: config.description,
    }
  })

  // Déduire les providers actifs (utilisés en prod par au moins une opération)
  const usedProviders = new Set<string>()
  operations.forEach((op) => {
    usedProviders.add(op.provider)
    if (op.embeddings) usedProviders.add(op.embeddings.provider)
  })

  const activeProviders = ALL_KNOWN_PROVIDERS.filter((p) => usedProviders.has(p))
  const inactiveProviders = ALL_KNOWN_PROVIDERS.filter((p) => !usedProviders.has(p))

  return NextResponse.json({
    operations,
    activeProviders,
    inactiveProviders,
    mode: 'no-fallback',
    env,
    generatedAt: new Date().toISOString(),
  })
})
