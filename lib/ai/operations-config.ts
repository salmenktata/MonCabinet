/**
 * Configuration IA par type d'opération métier - Mode No-Fallback
 *
 * Chaque opération utilise UN SEUL modèle fixe (pas de cascade).
 * Si le provider échoue → throw + alerte email (pas de dégradation silencieuse).
 *
 * Configuration définitive RAG Haute Qualité (Mars 2026 — zéro Groq)
 * Migration Mar 2, 2026 : Embeddings OpenAI → Ollama en prod (économie ~$5/mois)
 *   Reranking Jina → TF-IDF local (économie ~$1-2/mois)
 *   Coût résiduel : DeepSeek chat uniquement (~$3-5/mois)
 */

import type { LLMProvider } from './llm-fallback-service'

// =============================================================================
// TYPES
// =============================================================================

/**
 * Types d'opérations métier supportés
 */
export type OperationName =
  | 'indexation'
  | 'assistant-ia'
  | 'dossiers-assistant'
  | 'dossiers-structuration'
  | 'dossiers-consultation'
  | 'kb-quality-analysis'
  | 'query-classification'
  | 'query-expansion'
  | 'document-consolidation'
  | 'rag-eval-judge'
  | 'compare-deepseek'
  | 'compare-openai'
  | 'compare-ollama'
  | 'ariida-generation'

/**
 * Sévérité d'alerte en cas d'échec
 */
export type AlertSeverity = 'critical' | 'warning' | 'info'

/**
 * Provider de fallback avec modèle optionnel
 */
export interface FallbackProviderEntry {
  provider: LLMProvider
  /** Override du modèle pour ce provider (ex: 'llama-3.3-70b-versatile', 'gemini-2.0-flash-lite') */
  model?: string
}

/**
 * Configuration IA pour une opération spécifique
 */
export interface OperationAIConfig {
  // Modèle unique fixe pour cette opération
  model: {
    provider: LLMProvider
    name: string
  }

  /**
   * Chaîne de fallback ordonnée pour les erreurs récupérables (rate limit, context exceeded, timeout).
   * Si définie, remplace FALLBACK_ORDER global pour cette opération.
   * Cascade : primary → fallbackChain[0] → fallbackChain[1] → ...
   */
  fallbackChain?: FallbackProviderEntry[]

  // Configuration embeddings (si applicable)
  embeddings?: {
    provider: 'ollama' | 'openai' | 'gemini'
    model: string
    dimensions: number
  }

  // Timeouts spécifiques (en ms)
  timeouts?: {
    chat?: number
    embedding?: number
    total?: number
  }

  // Paramètres LLM
  llmConfig?: {
    temperature: number
    maxTokens: number
    systemPromptType?: 'chat' | 'consultation' | 'structuration'
  }

  // Alertes en cas d'échec
  alerts: {
    onFailure: 'email' | 'log'
    severity: AlertSeverity
  }

  // Description pour monitoring/debug
  description: string
}

// =============================================================================
// CONFIGURATION PAR OPÉRATION - MODE NO-FALLBACK
// =============================================================================

const isDev = process.env.NODE_ENV === 'development'

/**
 * Modèle Ollama utilisé pour les opérations locales (classification, expansion, indexation, qualité KB).
 * Priorité : OLLAMA_QUALITY_MODEL > OLLAMA_CHAT_MODEL > 'qwen3:8b'
 * Exemples : qwen3-nothink (VPS actuel), qwen3.5:35b-a3b (futur), qwen3:8b (défaut)
 */
const OLLAMA_QUALITY_MODEL =
  process.env.OLLAMA_QUALITY_MODEL ||
  process.env.OLLAMA_CHAT_MODEL ||
  'qwen3:8b'

/**
 * Configuration centralisée - 1 modèle fixe par opération, 0 fallback
 *
 * Migration Mar 1, 2026 : Gemini → Groq (économie €84/mois GCP)
 * Migration Mar 6, 2026 : Groq → DeepSeek + Ollama (Groq TAAS facturait $39.85 en 6 jours)
 * Stratégie coût minimal : DeepSeek pour LLM chat (cache hit $0.028/M in, $0.42/M out), Ollama pour tâches locales
 *
 * | Opération              | Provider  | Modèle                    | Coût              | Contexte |
 * |------------------------|-----------|---------------------------|-------------------|----------|
 * | Assistant IA (chat)    | DeepSeek  | deepseek-chat             | $0.028/M (cache)  | 128K     |
 * | Structuration dossier  | DeepSeek  | deepseek-chat             | $0.028/M (cache)  | 128K     |
 * | Dossiers Assistant     | DeepSeek  | deepseek-chat             | $0.028/M (cache)  | 128K     |
 * | Consultations IRAC     | DeepSeek  | deepseek-chat             | $0.028/M (cache)  | 128K     |
 * | KB Quality Analysis    | Ollama    | OLLAMA_QUALITY_MODEL      | $0 (local)        | 128K     |
 * | Query Classification   | Ollama    | OLLAMA_QUALITY_MODEL      | $0 (local)        | 128K     |
 * | Query Expansion        | Ollama    | OLLAMA_QUALITY_MODEL      | $0 (local)        | 128K     |
 * | Consolidation docs     | DeepSeek  | deepseek-chat             | $0.028/M (cache)  | 128K     |
 * | RAG Eval Judge         | DeepSeek  | deepseek-chat             | $0.028/M (cache)  | 128K     |
 * | Embeddings (tout)      | Ollama    | nomic-embed-text          | $0 (local)        | 8K       |
 * | Re-ranking             | TF-IDF    | local (stopwords arabes)  | $0 (local)        | —        |
 * (DeepSeek cache hit sur system prompt stable — input = $0.028/M, output = $0.42/M, cache miss = $0.28/M)
 */
export const AI_OPERATIONS_CONFIG: Record<OperationName, OperationAIConfig> = {
  // ---------------------------------------------------------------------------
  // 1. INDEXATION (background processing)
  // ---------------------------------------------------------------------------
  'indexation': {
    model: { provider: 'ollama', name: OLLAMA_QUALITY_MODEL }, // Ollama pour classification (gratuit)

    embeddings: { provider: 'ollama', model: 'nomic-embed-text', dimensions: 768 }, // Ollama partout (gratuit)

    timeouts: {
      embedding: 10000,
      chat: 30000,
      total: 60000,
    },

    llmConfig: {
      temperature: 0.2,
      maxTokens: 2000,
    },

    alerts: { onFailure: 'log', severity: 'warning' },
    description: 'Indexation KB - Ollama classification + Ollama embeddings (nomic-embed-text)',
  },

  // ---------------------------------------------------------------------------
  // 2. ASSISTANT IA (chat temps réel utilisateur)
  // ---------------------------------------------------------------------------
  'assistant-ia': {
    model: { provider: 'groq', name: 'llama-3.3-70b-versatile' }, // Groq free tier : 1K RPD/12K TPM (gratuit)

    fallbackChain: [
      { provider: 'deepseek', model: 'deepseek-chat' },         // $0.028/M (cache hit) — si Groq 1K RPD dépassé
      { provider: 'groq', model: 'llama-3.1-8b-instant' },     // Free 14.4K RPD — fallback volume
      { provider: 'gemini', model: 'gemini-2.0-flash-lite' },  // Paid Tier1, ~€0.05/mois en fallback
      { provider: 'openai', model: 'gpt-4.1-mini' },           // Budget $10/mois, filet sécurité
      { provider: 'ollama' },                                    // Local, toujours disponible
    ],

    embeddings: { provider: 'ollama', model: 'nomic-embed-text', dimensions: 768 }, // Ollama partout (gratuit)

    timeouts: {
      embedding: 8000,
      chat: 45000,  // DeepSeek ~1-8s → marge 45s
      total: 55000,
    },

    llmConfig: {
      temperature: 0.1,
      maxTokens: 2048,
      systemPromptType: 'chat',
    },

    alerts: { onFailure: 'email', severity: 'critical' },
    description: 'Chat utilisateur temps réel - Groq llama-3.3-70b-versatile (free 1K RPD) → DeepSeek fallback si quota dépassé',
  },

  // ---------------------------------------------------------------------------
  // 3. ASSISTANT DOSSIERS (analyse approfondie)
  // ---------------------------------------------------------------------------
  'dossiers-assistant': {
    model: isDev
      ? { provider: 'ollama', name: OLLAMA_QUALITY_MODEL }
      : { provider: 'deepseek', name: 'deepseek-chat' }, // DeepSeek : $0.028/$0.42/M (cache hit), 128K ctx

    fallbackChain: isDev ? [] : [
      { provider: 'groq', model: 'llama-3.3-70b-versatile' },
      { provider: 'gemini', model: 'gemini-2.0-flash-lite' },
      { provider: 'openai', model: 'gpt-4.1-mini' },
      { provider: 'ollama' },
    ],

    embeddings: { provider: 'ollama', model: 'nomic-embed-text', dimensions: 768 }, // Ollama partout (gratuit)

    timeouts: {
      embedding: 5000,
      chat: 90000,  // DeepSeek ~3-10s sur longs contextes → marge 90s
      total: 105000,
    },

    llmConfig: {
      temperature: 0.2,
      maxTokens: 8000,
      systemPromptType: 'chat',
    },

    alerts: { onFailure: 'email', severity: 'critical' },
    description: 'Analyse approfondie dossier - DeepSeek deepseek-chat (cache hit $0.028/M in, 128K ctx)',
  },

  // ---------------------------------------------------------------------------
  // 3b. STRUCTURATION DOSSIER (narratif → JSON structuré, temps réel)
  // ---------------------------------------------------------------------------
  'dossiers-structuration': {
    model: { provider: 'deepseek', name: 'deepseek-chat' }, // DeepSeek : $0.028/M (cache hit), excellent support JSON, 128K ctx

    fallbackChain: [
      { provider: 'groq', model: 'llama-3.3-70b-versatile' },
      { provider: 'gemini', model: 'gemini-2.0-flash-lite' },
      { provider: 'openai', model: 'gpt-4.1-mini' },
      { provider: 'ollama' },
    ],

    timeouts: {
      chat: 45000,  // DeepSeek ~1-8s, marge pour JSON complexe
      total: 60000,
    },

    llmConfig: {
      temperature: 0.3,
      maxTokens: 6000,
      systemPromptType: 'chat',
    },

    alerts: { onFailure: 'email', severity: 'critical' },
    description: 'Structuration narratif → JSON - DeepSeek deepseek-chat (cache hit $0.028/M in, JSON structuré, 128K ctx)',
  },

  // ---------------------------------------------------------------------------
  // 4. ANALYSE QUALITÉ KB (tous documents, courts et longs)
  // ---------------------------------------------------------------------------
  'kb-quality-analysis': {
    model: { provider: 'ollama', name: OLLAMA_QUALITY_MODEL }, // Ollama en dev ET prod (batch, pas temps réel)

    timeouts: {
      chat: 60000, // Ollama plus lent que Groq, marge élargie
      total: 120000,
    },

    llmConfig: {
      temperature: 0.1,
      maxTokens: 8000,
    },

    alerts: { onFailure: 'log', severity: 'warning' }, // Log seulement (batch non-critique)
    description: `Analyse qualité documents KB - Ollama ${OLLAMA_QUALITY_MODEL} (gratuit, batch)`,
  },

  // ---------------------------------------------------------------------------
  // 5. CONSULTATION (génération formelle IRAC)
  // ---------------------------------------------------------------------------
  'dossiers-consultation': {
    model: isDev
      ? { provider: 'ollama', name: OLLAMA_QUALITY_MODEL }
      : { provider: 'deepseek', name: 'deepseek-chat' }, // DeepSeek : $0.028/$0.42/M (cache hit), 128K ctx

    fallbackChain: isDev ? [] : [
      { provider: 'groq', model: 'llama-3.3-70b-versatile' },
      { provider: 'gemini', model: 'gemini-2.0-flash-lite' },
      { provider: 'openai', model: 'gpt-4.1-mini' },
      { provider: 'ollama' },
    ],

    embeddings: { provider: 'ollama', model: 'nomic-embed-text', dimensions: 768 }, // Ollama partout (gratuit)

    timeouts: {
      embedding: 5000,
      chat: 90000,  // DeepSeek sur longues consultations
      total: 105000,
    },

    llmConfig: {
      temperature: 0.1,
      maxTokens: 2000,
      systemPromptType: 'consultation',
    },

    alerts: { onFailure: 'email', severity: 'critical' },
    description: 'Consultation juridique formelle IRAC - DeepSeek deepseek-chat (cache hit $0.028/M in, 128K ctx)',
  },

  // ---------------------------------------------------------------------------
  // 6. QUERY CLASSIFICATION (pré-filtrage KB)
  // ---------------------------------------------------------------------------
  'query-classification': {
    model: { provider: 'ollama', name: OLLAMA_QUALITY_MODEL }, // Ollama : gratuit, déjà sur prod, tâche légère

    timeouts: {
      chat: 20000,  // Ollama VPS ~2-5s → marge 20s
      total: 25000,
    },

    llmConfig: {
      temperature: 0.1,
      maxTokens: 500,
    },

    alerts: { onFailure: 'log', severity: 'info' },
    description: `Classification query KB - Ollama ${OLLAMA_QUALITY_MODEL} (gratuit, local)`,
  },

  // ---------------------------------------------------------------------------
  // 7. QUERY EXPANSION (reformulation requêtes courtes)
  // ---------------------------------------------------------------------------
  'query-expansion': {
    model: { provider: 'ollama', name: OLLAMA_QUALITY_MODEL }, // Ollama : gratuit, reformulation simple

    timeouts: {
      chat: 20000,  // Ollama VPS ~2-5s → marge 20s
      total: 25000,
    },

    llmConfig: {
      temperature: 0.3,
      maxTokens: 200,
    },

    alerts: { onFailure: 'log', severity: 'info' },
    description: `Expansion queries courtes <50 chars - Ollama ${OLLAMA_QUALITY_MODEL} (gratuit, local)`,
  },

  // ---------------------------------------------------------------------------
  // 8. CONSOLIDATION DOCUMENTS (multi-pages → 1 document)
  // ---------------------------------------------------------------------------
  'document-consolidation': {
    model: isDev
      ? { provider: 'ollama', name: OLLAMA_QUALITY_MODEL }
      : { provider: 'deepseek', name: 'deepseek-chat' }, // DeepSeek : $0.028/$0.42/M (cache hit), 128K ctx

    fallbackChain: isDev ? [] : [
      { provider: 'groq', model: 'llama-3.3-70b-versatile' },
      { provider: 'gemini', model: 'gemini-2.0-flash-lite' },
      { provider: 'openai', model: 'gpt-4.1-mini' },
      { provider: 'ollama' },
    ],

    timeouts: {
      chat: 90000,
      total: 120000,
    },

    llmConfig: {
      temperature: 0.1,
      maxTokens: 8000, // Réduit 16000→8000 (très longs dossiers >50p tronqués — risque accepté)
    },

    alerts: { onFailure: 'log', severity: 'warning' },
    description: 'Consolidation documents multi-pages - DeepSeek deepseek-chat (cache hit $0.028/M in, 128K ctx)',
  },

  // ---------------------------------------------------------------------------
  // 9. RAG EVAL JUDGE (évaluation fidélité réponses)
  // ---------------------------------------------------------------------------
  'rag-eval-judge': {
    model: isDev
      ? { provider: 'ollama', name: OLLAMA_QUALITY_MODEL }
      : { provider: 'deepseek', name: 'deepseek-chat' }, // DeepSeek : évite compétition quota Groq (100K tok/j 70b) ET Ollama (saturé par indexation KB)

    timeouts: {
      chat: 30000,  // DeepSeek rapide ~1-3s → marge 30s
      total: 40000,
    },

    llmConfig: {
      temperature: 0.1,
      maxTokens: 400,
    },

    alerts: { onFailure: 'log', severity: 'info' },
    description: 'LLM judge fidélité réponse RAG - DeepSeek deepseek-chat (prod, ~$0.001/eval, quota indépendant de Groq et Ollama)',
  },

  // ---------------------------------------------------------------------------
  // 10. COMPARAISON PROVIDERS (test admin : même question, 3 providers)
  // ---------------------------------------------------------------------------
  'compare-deepseek': {
    model: { provider: 'deepseek', name: 'deepseek-chat' },
    embeddings: { provider: 'ollama', model: 'nomic-embed-text', dimensions: 768 }, // Ollama partout (gratuit)
    timeouts: { chat: 45000, total: 55000 },
    llmConfig: { temperature: 0.1, maxTokens: 2048 },
    alerts: { onFailure: 'log', severity: 'warning' },
    description: 'Test comparaison providers - DeepSeek deepseek-chat (provider prod)',
  },

  'compare-openai': {
    model: { provider: 'openai', name: 'gpt-4o' },
    embeddings: { provider: 'ollama', model: 'nomic-embed-text', dimensions: 768 }, // Ollama partout (gratuit)
    timeouts: { chat: 45000, total: 55000 },
    llmConfig: { temperature: 0.1, maxTokens: 2048 },
    alerts: { onFailure: 'log', severity: 'warning' },
    description: 'Test comparaison providers - OpenAI GPT-4o',
  },

  'compare-ollama': {
    model: { provider: 'ollama', name: OLLAMA_QUALITY_MODEL },
    embeddings: { provider: 'ollama', model: 'nomic-embed-text', dimensions: 768 },
    timeouts: { chat: 120000, total: 135000 },
    llmConfig: { temperature: 0.1, maxTokens: 2048 },
    alerts: { onFailure: 'log', severity: 'warning' },
    description: `Test comparaison providers - Ollama ${OLLAMA_QUALITY_MODEL} (local)`,
  },

  // ---------------------------------------------------------------------------
  // 11. GÉNÉRATION ARIIDA (عريضة الدعوى — requête introductive d'instance)
  // ---------------------------------------------------------------------------
  'ariida-generation': {
    model: isDev
      ? { provider: 'ollama', name: OLLAMA_QUALITY_MODEL }
      : { provider: 'deepseek', name: 'deepseek-chat' },

    timeouts: {
      chat: 45000,
      total: 60000,
    },

    llmConfig: {
      temperature: 0.2,
      maxTokens: 3000,
    },

    alerts: { onFailure: 'log', severity: 'warning' },
    description: 'Génération عريضة دعوى tunisienne structurée - DeepSeek deepseek-chat',
  },
}

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Récupère la configuration pour une opération donnée
 */
export function getOperationConfig(operation: OperationName): OperationAIConfig {
  return AI_OPERATIONS_CONFIG[operation]
}

/**
 * Vérifie si une opération est configurée
 */
export function isOperationConfigured(operation: string): operation is OperationName {
  return operation in AI_OPERATIONS_CONFIG
}

/**
 * Liste toutes les opérations configurées
 */
export function getConfiguredOperations(): OperationName[] {
  return Object.keys(AI_OPERATIONS_CONFIG) as OperationName[]
}

/**
 * Retourne le provider fixe pour une opération (pas de fallback)
 */
export function getOperationProvider(operation: OperationName): LLMProvider {
  return AI_OPERATIONS_CONFIG[operation].model.provider
}

/**
 * Retourne le nom du modèle pour une opération
 */
export function getOperationModel(operation: OperationName): string {
  return AI_OPERATIONS_CONFIG[operation].model.name
}

/**
 * Retourne la description d'une opération (pour monitoring)
 */
export function getOperationDescription(operation: OperationName): string {
  return AI_OPERATIONS_CONFIG[operation].description
}

// =============================================================================
// RÉTROCOMPATIBILITÉ (deprecated, à supprimer dans version future)
// =============================================================================

/**
 * @deprecated Utiliser getOperationProvider() - pas de fallback en mode no-fallback
 */
export function getPrimaryProvider(operation: OperationName): LLMProvider {
  return getOperationProvider(operation)
}

/**
 * @deprecated Plus de fallback en mode no-fallback - retourne []
 */
export function getFallbackProviders(_operation: OperationName): LLMProvider[] {
  return []
}
