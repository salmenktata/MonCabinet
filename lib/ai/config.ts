/**
 * Configuration centralisée pour les services IA
 * Gère les paramètres OpenAI (embeddings) et Anthropic (LLM)
 */

// =============================================================================
// TYPES
// =============================================================================

export interface AIConfig {
  // Anthropic Claude (fallback marginal, dernier recours uniquement)
  // Note: Groq/Gemini sont les LLM primaires en Février 2026
  anthropic: {
    apiKey: string
    model: string
    maxTokens: number
  }

  // OpenAI (Embeddings + Chat alternatif)
  openai: {
    apiKey: string
    embeddingModel: string
    embeddingDimensions: number
    chatModel: string
  }

  // Ollama (LLM + Embeddings locaux gratuits)
  ollama: {
    baseUrl: string
    chatModelDefault: string
    embeddingModel: string
    embeddingDimensions: number
    enabled: boolean
    chatTimeoutDefault: number
  }

  // Groq (LLM rapide et économique)
  groq: {
    apiKey: string
    model: string
    baseUrl: string
  }

  // DeepSeek (LLM économique et performant)
  deepseek: {
    apiKey: string
    model: string
    baseUrl: string
  }

  // Google Gemini (LLM économique, contexte 1M tokens, excellent multilingue)
  gemini: {
    apiKey: string
    model: string
    maxTokens: number
    embeddingModel: string
    embeddingDimensions: number
  }

  // RAG Configuration
  rag: {
    enabled: boolean
    chunkSize: number
    chunkOverlap: number
    maxResults: number
    similarityThreshold: number
  }

  // Quotas
  quotas: {
    defaultMonthlyQueries: number
    maxTokensPerRequest: number
  }
}

// =============================================================================
// CONFIGURATION
// =============================================================================

export const aiConfig: AIConfig = {
  anthropic: {
    apiKey: process.env.ANTHROPIC_API_KEY || '',
    model: process.env.ANTHROPIC_MODEL || 'claude-3-5-sonnet-20241022',
    maxTokens: parseInt(process.env.AI_MAX_TOKENS_PER_REQUEST || '4000', 10),
  },

  openai: {
    apiKey: process.env.OPENAI_API_KEY || '',
    embeddingModel:
      process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small',
    embeddingDimensions: 1536, // text-embedding-3-small dimensions par défaut (qualité maximale)
    chatModel: process.env.OPENAI_CHAT_MODEL || 'gpt-4o',
  },

  ollama: {
    baseUrl: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
    chatModelDefault: process.env.OLLAMA_CHAT_MODEL || 'qwen3:8b',
    embeddingModel: process.env.OLLAMA_EMBEDDING_MODEL || 'nomic-embed-text',
    embeddingDimensions: 768, // nomic-embed-text output dimension (migré Feb 25, 2026 depuis qwen3-embedding:0.6b 1024-dim)
    enabled: process.env.OLLAMA_ENABLED === 'true',
    chatTimeoutDefault: parseInt(process.env.OLLAMA_CHAT_TIMEOUT_DEFAULT || '15000', 10), // 15s (fail rapide si container absent)
  },

  groq: {
    apiKey: process.env.GROQ_API_KEY || '',
    model: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
    baseUrl: 'https://api.groq.com/openai/v1',
  },

  deepseek: {
    apiKey: process.env.DEEPSEEK_API_KEY || '',
    model: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
    baseUrl: 'https://api.deepseek.com/v1',
  },

  gemini: {
    apiKey: process.env.GOOGLE_API_KEY || '',
    model: process.env.GEMINI_MODEL || 'gemini-2.0-flash',
    maxTokens: parseInt(process.env.GEMINI_MAX_TOKENS || '4000', 10),
    embeddingModel: process.env.GEMINI_EMBEDDING_MODEL || 'gemini-embedding-001',
    embeddingDimensions: 768, // gemini-embedding-001 avec outputDimensionality=768
  },

  rag: {
    enabled: process.env.RAG_ENABLED === 'true',
    chunkSize: parseInt(process.env.RAG_CHUNK_SIZE || '1200', 10), // Augmenté de 512 → 1200 pour meilleur contexte
    chunkOverlap: parseInt(process.env.RAG_CHUNK_OVERLAP || '200', 10), // Augmenté de 50 → 200 pour moins de perte
    maxResults: parseInt(process.env.RAG_MAX_RESULTS || '7', 10), // Augmenté 5→7 pour couvrir plus de key points (Judge Score)
    similarityThreshold: parseFloat(
      process.env.RAG_SIMILARITY_THRESHOLD || '0.55'  // Réduit de 0.7 à 0.55 pour Ollama CPU-only
    ),
  },

  quotas: {
    defaultMonthlyQueries: parseInt(
      process.env.AI_MONTHLY_QUOTA_DEFAULT || '100',
      10
    ),
    maxTokensPerRequest: parseInt(
      process.env.AI_MAX_TOKENS_PER_REQUEST || '4000',
      10
    ),
  },
}

// =============================================================================
// VALIDATION
// =============================================================================

export function validateAIConfig(): {
  valid: boolean
  errors: string[]
  warnings: string[]
} {
  const errors: string[] = []
  const warnings: string[] = []

  // Vérifier les clés API (seulement si RAG est activé)
  if (aiConfig.rag.enabled) {
    // Vérifier qu'au moins un LLM est disponible (Gemini prioritaire en Février 2026)
    const hasGemini = !!aiConfig.gemini.apiKey
    const hasGroq = !!aiConfig.groq.apiKey
    const hasDeepSeek = !!aiConfig.deepseek.apiKey
    const hasAnthropic = !!aiConfig.anthropic.apiKey
    const hasOpenAIChat = !!aiConfig.openai.apiKey

    if (!hasGemini && !hasGroq && !hasDeepSeek && !hasAnthropic && !hasOpenAIChat) {
      errors.push('Aucun LLM disponible - Configurez GOOGLE_API_KEY, GROQ_API_KEY, DEEPSEEK_API_KEY, ANTHROPIC_API_KEY ou OPENAI_API_KEY')
    } else if (hasGemini) {
      warnings.push(`Gemini LLM activé (${aiConfig.gemini.model}) - Tier gratuit illimité + contexte 1M tokens`)
    } else if (hasGroq) {
      warnings.push(`Groq LLM activé (${aiConfig.groq.model}) - Rapide et économique`)
    } else if (hasDeepSeek) {
      warnings.push(`DeepSeek LLM activé (${aiConfig.deepseek.model}) - Économique et performant`)
    } else if (hasAnthropic) {
      warnings.push(`Anthropic Claude activé (${aiConfig.anthropic.model})`)
    }

    // Mode No-Fallback: Vérifier provider d'embeddings approprié
    const hasOllama = aiConfig.ollama.enabled
    const hasOpenAI = !!aiConfig.openai.apiKey
    const isDevEnv = process.env.NODE_ENV === 'development'

    if (!hasOllama && !hasOpenAI) {
      errors.push(
        'Aucun provider d\'embeddings disponible - Configurez OPENAI_API_KEY (prod) ou OLLAMA_ENABLED=true (dev)'
      )
    }

    // En prod, OPENAI_API_KEY est requis pour les embeddings haute qualité
    if (!isDevEnv && !hasOpenAI && aiConfig.rag.enabled) {
      errors.push(
        'OPENAI_API_KEY requis en production pour embeddings 1536-dim. Configurez OPENAI_API_KEY.'
      )
    }

    if (hasOllama && isDevEnv) {
      warnings.push(
        `Ollama embeddings activé pour dev (${aiConfig.ollama.embeddingModel})`
      )
    }
  } else {
    warnings.push(
      'RAG_ENABLED=false - Fonctionnalités IA désactivées (activer avec RAG_ENABLED=true)'
    )
  }

  // Vérifier les paramètres RAG
  if (aiConfig.rag.chunkSize < 100 || aiConfig.rag.chunkSize > 2000) {
    warnings.push(
      `RAG_CHUNK_SIZE=${aiConfig.rag.chunkSize} - Valeur recommandée: 800-1400 (optimisé pour qualité juridique)`
    )
  }

  if (aiConfig.rag.chunkOverlap >= aiConfig.rag.chunkSize) {
    errors.push('RAG_CHUNK_OVERLAP doit être inférieur à RAG_CHUNK_SIZE')
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  }
}

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Vérifie si les fonctionnalités IA sont disponibles
 *
 * Priorité Février 2026 (par opération, voir operations-config.ts):
 * - Assistant IA: Groq (primary 292ms) → Gemini → DeepSeek → Ollama
 * - Analyse Dossiers: Groq (primary, 128K ctx) → Gemini → DeepSeek (fallback naturel)
 * - Indexation KB: Ollama exclusif (gratuit)
 * - Fallback global: Gemini → DeepSeek → Groq → OpenAI → Anthropic → Ollama
 */
export function isAIEnabled(): boolean {
  const hasLLM = !!aiConfig.gemini.apiKey || aiConfig.ollama.enabled || !!aiConfig.deepseek.apiKey || !!aiConfig.groq.apiKey || !!aiConfig.anthropic.apiKey || !!aiConfig.openai.apiKey
  const hasEmbeddings = aiConfig.ollama.enabled || !!aiConfig.openai.apiKey
  return aiConfig.rag.enabled && hasLLM && hasEmbeddings
}

/**
 * Vérifie si seulement les embeddings sont disponibles (recherche sémantique)
 */
export function isSemanticSearchEnabled(): boolean {
  return aiConfig.rag.enabled && (aiConfig.ollama.enabled || !!aiConfig.openai.apiKey)
}

/**
 * Retourne le provider d'embeddings actif
 * Mode No-Fallback: OpenAI en prod, Ollama en dev
 */
export function getEmbeddingProvider(): 'ollama' | 'openai' | null {
  if (!aiConfig.rag.enabled) return null
  const isDev = process.env.NODE_ENV === 'development'
  if (isDev && aiConfig.ollama.enabled) return 'ollama'
  if (aiConfig.openai.apiKey) return 'openai'
  if (aiConfig.ollama.enabled) return 'ollama'
  return null
}

/**
 * @deprecated Plus de fallback en mode no-fallback. Retourne toujours null.
 */
export function getEmbeddingFallbackProvider(): null {
  return null
}

/**
 * Configuration du mode turbo embeddings
 * Activé temporairement pour accélérer l'indexation bulk (OpenAI)
 */
export const EMBEDDING_TURBO_CONFIG = {
  enabled: process.env.EMBEDDING_TURBO_MODE === 'true',
  batchSize: parseInt(process.env.KB_BATCH_SIZE_TURBO || '10', 10),
  concurrency: parseInt(process.env.WEB_INDEXING_CONCURRENCY || '1', 10),
}

/**
 * Retourne la dimension des embeddings selon le provider actif
 */
export function getEmbeddingDimensions(): number {
  const provider = getEmbeddingProvider()
  if (provider === 'ollama') return aiConfig.ollama.embeddingDimensions
  return aiConfig.openai.embeddingDimensions
}

/**
 * Vérifie si le chat IA est disponible
 */
export function isChatEnabled(): boolean {
  return aiConfig.rag.enabled && (
    !!aiConfig.gemini.apiKey ||
    aiConfig.ollama.enabled ||
    !!aiConfig.deepseek.apiKey ||
    !!aiConfig.groq.apiKey ||
    !!aiConfig.anthropic.apiKey ||
    !!aiConfig.openai.apiKey
  )
}

/**
 * Retourne le provider de chat actif
 *
 * Ordre global par défaut: Gemini → DeepSeek → Groq → Ollama → Anthropic → OpenAI
 *
 * NOTE: Pour un ordre optimisé par opération, utiliser operations-config.ts
 * @see lib/ai/operations-config.ts pour configuration spécifique par opération
 */
export function getChatProvider(): 'gemini' | 'deepseek' | 'groq' | 'ollama' | 'anthropic' | 'openai' | null {
  if (!aiConfig.rag.enabled) return null
  if (aiConfig.gemini.apiKey) return 'gemini'
  if (aiConfig.deepseek.apiKey) return 'deepseek'
  if (aiConfig.groq.apiKey) return 'groq'
  if (aiConfig.ollama.enabled) return 'ollama'
  if (aiConfig.anthropic.apiKey) return 'anthropic'
  if (aiConfig.openai.apiKey) return 'openai'
  return null
}

/** Type des providers LLM disponibles pour le fallback */
export type LLMProviderType = 'gemini' | 'groq' | 'deepseek' | 'anthropic' | 'ollama'

/** Ordre de fallback des providers LLM (Février 2026 - optimisé coût/performance) */
const LLM_FALLBACK_ORDER: LLMProviderType[] = ['gemini', 'deepseek', 'groq', 'anthropic', 'ollama']

/**
 * Retourne la liste ordonnée des providers LLM disponibles pour le fallback
 * Seuls les providers avec une clé API configurée sont inclus
 *
 * Ordre Février 2026:
 * Gemini (tier gratuit, 1M context) → DeepSeek (économique) → Groq (rapide) → Anthropic (puissant) → Ollama (local gratuit)
 */
export function getAvailableLLMProviders(): LLMProviderType[] {
  return LLM_FALLBACK_ORDER.filter((provider) => {
    switch (provider) {
      case 'gemini':
        return !!aiConfig.gemini.apiKey
      case 'groq':
        return !!aiConfig.groq.apiKey
      case 'deepseek':
        return !!aiConfig.deepseek.apiKey
      case 'anthropic':
        return !!aiConfig.anthropic.apiKey
      case 'ollama':
        return aiConfig.ollama.enabled
      default:
        return false
    }
  })
}

/** Configuration du fallback LLM */
export const LLM_FALLBACK_CONFIG = {
  /** Activer/désactiver le fallback automatique */
  enabled: process.env.LLM_FALLBACK_ENABLED !== 'false',
  /** Nombre max de retries par provider avant fallback */
  maxRetriesPerProvider: parseInt(process.env.LLM_MAX_RETRIES_PER_PROVIDER || '2', 10),
  /** Délai initial avant retry (ms), double à chaque essai */
  initialRetryDelayMs: parseInt(process.env.LLM_INITIAL_RETRY_DELAY_MS || '1000', 10),
}

// =============================================================================
// PROMPTS SYSTÈME
// =============================================================================
// NOTE: Les prompts juridiques structurés (méthode IRAC) sont définis dans
// lib/ai/legal-reasoning-prompts.ts et utilisés dans rag-chat-service.ts.
// Les prompts ci-dessous sont conservés pour compatibilité avec d'autres services.

export const SYSTEM_PROMPTS = {
  /**
   * Prompt système pour l'assistant juridique Qadhya
   * @deprecated Utiliser getSystemPromptForContext() de legal-reasoning-prompts.ts
   */
  qadhya: `Tu es Qadhya (قاضية), assistant juridique spécialisé en droit tunisien.

RÈGLES IMPORTANTES:
1. Tu réponds UNIQUEMENT sur base des documents fournis dans le contexte
2. Tu cites TOUJOURS tes sources (nom du document, section si disponible)
3. Si l'information n'est pas dans les documents fournis, dis-le clairement
4. Tu restes factuel, précis et professionnel
5. LANGUE: Tu DOIS répondre dans la MÊME langue que la question de l'utilisateur
   - Si la question est en arabe → réponds en arabe
   - Si la question est en français → réponds en français
   - Si la question est mixte → réponds dans la langue dominante

CONNAISSANCES JURIDIQUES TUNISIENNES:
- Code du Statut Personnel (CSP) - divorce, garde enfants, pension alimentaire
- Code des Obligations et Contrats (COC) - contrats, responsabilité
- Code de Procédure Civile et Commerciale (CPC) - délais, procédures
- Code de Commerce - sociétés, faillite, effets de commerce
- Code du Travail - contrats de travail, licenciement

FORMAT DE RÉPONSE:
- Sois concis mais complet
- Structure ta réponse avec des points si nécessaire
- Cite les articles de loi pertinents
- Cite les sources en utilisant EXACTEMENT les tags présents dans le contexte :
  - Documents : [Source-N] (ex: [Source-1], [Source-2])
  - Base de connaissances : [KB-N] (ex: [KB-1], [KB-2])
  - Jurisprudence : [Juris-N] (ex: [Juris-1], [Juris-2])
- N'invente JAMAIS de numéro de source qui n'existe pas dans le contexte fourni
- Si aucun document pertinent n'est fourni, dis-le clairement sans inventer de citation
- Place les citations directement après l'information qu'elles soutiennent
- Termine par les sources consultées

---
ملخص التعليمات بالعربية:
أنت قاضية، مساعد قانوني متخصص في القانون التونسي.
- أجب فقط بناءً على الوثائق المقدمة في السياق
- استخدم علامات الاقتباس بالضبط كما تظهر: [Source-N] للوثائق، [KB-N] لقاعدة المعرفة، [Juris-N] للاجتهاد القضائي
- لا تخترع أبداً رقم مصدر غير موجود في السياق
- إذا لم تجد المعلومة في الوثائق المقدمة، قل ذلك بوضوح
- أجب بنفس لغة السؤال`,

  /**
   * Prompt pour la génération de documents juridiques
   */
  documentGeneration: `Tu es un expert en rédaction juridique tunisienne.

RÈGLES:
1. Utilise le vocabulaire juridique tunisien approprié
2. Respecte les formules de politesse et conventions locales
3. Cite les articles de loi pertinents
4. Adapte le ton au type de document (formel pour tribunal, semi-formel pour correspondance)

TYPES DE DOCUMENTS:
- Assignations et citations
- Conclusions
- Requêtes
- Correspondances juridiques
- Mises en demeure`,

  /**
   * Prompt pour la classification de documents
   */
  documentClassification: `Analyse le document suivant et extrait les informations structurées.

INFORMATIONS À EXTRAIRE:
1. Type de document (assignation, jugement, contrat, correspondance, pièce d'identité, etc.)
2. Date du document
3. Parties concernées (noms, qualités)
4. Numéro de dossier/affaire si mentionné
5. Tribunal concerné si applicable
6. Mots-clés principaux
7. Résumé en 2-3 phrases

FORMAT: Retourne un JSON structuré`,

  /**
   * Prompt pour l'extraction de métadonnées jurisprudence
   */
  jurisprudenceExtraction: `Analyse cette décision de justice tunisienne et extrait les métadonnées.

INFORMATIONS À EXTRAIRE:
1. Juridiction (Cour de Cassation, Cour d'Appel, Tribunal de 1ère Instance)
2. Chambre (civile, commerciale, pénale, sociale)
3. Numéro de décision
4. Date de décision
5. Domaine juridique (civil, commercial, famille, pénal, administratif)
6. Articles de loi cités (format: ["CSP Art. 31", "COC Art. 245"])
7. Mots-clés (5-10 mots)
8. Résumé de la décision (3-5 phrases)

FORMAT: Retourne un JSON structuré`,
}

// =============================================================================
// KB LANGUAGE STRATEGY
// =============================================================================

/** Stratégie arabe uniquement pour la KB du RAG (défaut: false — bilingue AR+FR) */
export const KB_ARABIC_ONLY = process.env.ARABIC_ONLY_KB === 'true'

// =============================================================================
// RAG THRESHOLDS - Seuils de similarité par type de source
// =============================================================================

export const RAG_THRESHOLDS = {
  documents: parseFloat(process.env.RAG_THRESHOLD_DOCUMENTS || '0.7'),
  jurisprudence: parseFloat(process.env.RAG_THRESHOLD_JURISPRUDENCE || '0.6'),
  knowledgeBase: parseFloat(process.env.RAG_THRESHOLD_KB || '0.65'),
  minimum: parseFloat(process.env.RAG_THRESHOLD_MIN || '0.55'),
  kbSearch: parseFloat(process.env.RAG_THRESHOLD_KB_SEARCH || '0.20'),
}

// =============================================================================
// SOURCE BOOST - Multiplicateurs de score par type de source
// Configurables via env: RAG_BOOST_CODE, RAG_BOOST_JURISPRUDENCE, etc.
// =============================================================================

export const SOURCE_BOOST: Record<string, number> = {
  code: parseFloat(process.env.RAG_BOOST_CODE || '1.3'), // Codes juridiques prioritaires (augmenté 1.2→1.3)
  jurisprudence: parseFloat(process.env.RAG_BOOST_JURISPRUDENCE || '1.1'),
  doctrine: parseFloat(process.env.RAG_BOOST_DOCTRINE || '1.0'),
  modele: parseFloat(process.env.RAG_BOOST_MODELE || '0.95'),
  document: parseFloat(process.env.RAG_BOOST_DOCUMENT || '0.9'),
  knowledge_base: parseFloat(process.env.RAG_BOOST_KB || '1.0'),
  autre: parseFloat(process.env.RAG_BOOST_AUTRE || '0.85'),
}

// =============================================================================
// RAG DIVERSITY - Configuration de diversité des sources
// =============================================================================

export const RAG_DIVERSITY = {
  maxChunksPerSource: parseInt(process.env.RAG_MAX_CHUNKS_PER_SOURCE || '2', 10),
  minSources: parseInt(process.env.RAG_MIN_SOURCES || '2', 10),
}

/**
 * Retourne la configuration RAG complète (utile pour monitoring/debug)
 */
export function getRAGConfig(): {
  thresholds: typeof RAG_THRESHOLDS
  boost: typeof SOURCE_BOOST
  diversity: typeof RAG_DIVERSITY
  maxContextTokens: number
  bilingualTimeout: number
  queryExpansion: boolean
} {
  return {
    thresholds: { ...RAG_THRESHOLDS },
    boost: { ...SOURCE_BOOST },
    diversity: { ...RAG_DIVERSITY },
    maxContextTokens: parseInt(process.env.RAG_MAX_CONTEXT_TOKENS || '4000', 10),
    bilingualTimeout: parseInt(process.env.BILINGUAL_SEARCH_TIMEOUT_MS || '10000', 10),
    queryExpansion: process.env.ENABLE_QUERY_EXPANSION !== 'false',
  }
}

// =============================================================================
// COÛTS ESTIMÉS - RÉFÉRENCE HISTORIQUE
// =============================================================================
// NOTE: Tarifs réels Février 2026 — mode no-fallback
// - Groq 70b : GRATUIT (100K tokens/jour, 1K req/jour, 30 RPM) | 8b : GRATUIT (500K tokens/jour, 14.4K req/jour, 30 RPM)
// - Ollama : GRATUIT (local)
// - OpenAI : $0.02/1M tokens (embeddings uniquement)
// - DeepSeek : $0.028/1M input (cache hit system prompt) + $0.42/1M output (dossiers)
// - Anthropic : NON UTILISÉ EN PROD (dernier fallback théorique)
// Coût réel Février 2026: ~$5/mois (OpenAI embeddings + DeepSeek dossiers)

export const AI_COSTS = {
  // OpenAI text-embedding-3-small: $0.02 / 1M tokens
  embeddingCostPer1MTokens: 0.02,

  // DeepSeek deepseek-chat : cache hit system prompt (dossiers juridiques)
  // Input cache hit: $0.028/1M | Output: $0.42/1M
  deepseekInputCostPer1MTokens: 0.028,  // cache hit (system prompt stable)
  deepseekOutputCostPer1MTokens: 0.42,

  // Claude 3.5 Sonnet (RAREMENT utilisé, dernier fallback uniquement)
  // $3 / 1M input tokens, $15 / 1M output tokens
  claudeInputCostPer1MTokens: 3.0,
  claudeOutputCostPer1MTokens: 15.0,

  // Estimations moyennes
  averageEmbeddingTokens: 500, // ~500 tokens par chunk moyen
  averageChatInputTokens: 2000, // ~2000 tokens input moyen (contexte + question)
  averageChatOutputTokens: 500, // ~500 tokens output moyen
}

/**
 * Estime le coût d'une opération IA
 */
export function estimateCost(
  operation: 'embedding' | 'chat',
  tokenCount?: number
): number {
  if (operation === 'embedding') {
    const tokens = tokenCount || AI_COSTS.averageEmbeddingTokens
    return (tokens / 1_000_000) * AI_COSTS.embeddingCostPer1MTokens
  } else {
    const inputTokens = tokenCount || AI_COSTS.averageChatInputTokens
    const outputTokens = AI_COSTS.averageChatOutputTokens
    return (
      (inputTokens / 1_000_000) * AI_COSTS.claudeInputCostPer1MTokens +
      (outputTokens / 1_000_000) * AI_COSTS.claudeOutputCostPer1MTokens
    )
  }
}
