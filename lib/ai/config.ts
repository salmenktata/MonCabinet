/**
 * Configuration centralisée pour les services IA
 * Gère les paramètres OpenAI (embeddings) et Anthropic (LLM)
 */

// =============================================================================
// TYPES
// =============================================================================

export interface AIConfig {
  // Anthropic Claude (LLM principal)
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

  // Ollama (Embeddings locaux gratuits)
  ollama: {
    baseUrl: string
    embeddingModel: string
    embeddingDimensions: number
    enabled: boolean
  }

  // Groq (LLM rapide et économique)
  groq: {
    apiKey: string
    model: string
    baseUrl: string
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
    embeddingDimensions: 1536, // Fixe pour text-embedding-3-small
    chatModel: process.env.OPENAI_CHAT_MODEL || 'gpt-4o',
  },

  ollama: {
    baseUrl: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
    embeddingModel: process.env.OLLAMA_EMBEDDING_MODEL || 'qwen3-embedding:0.6b',
    embeddingDimensions: 1024, // Qwen3 embedding default dimension
    enabled: process.env.OLLAMA_ENABLED === 'true',
  },

  groq: {
    apiKey: process.env.GROQ_API_KEY || '',
    model: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
    baseUrl: 'https://api.groq.com/openai/v1',
  },

  rag: {
    enabled: process.env.RAG_ENABLED === 'true',
    chunkSize: parseInt(process.env.RAG_CHUNK_SIZE || '512', 10),
    chunkOverlap: parseInt(process.env.RAG_CHUNK_OVERLAP || '50', 10),
    maxResults: parseInt(process.env.RAG_MAX_RESULTS || '5', 10),
    similarityThreshold: parseFloat(
      process.env.RAG_SIMILARITY_THRESHOLD || '0.7'
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
    if (!aiConfig.anthropic.apiKey) {
      errors.push('ANTHROPIC_API_KEY manquant - Chat IA désactivé')
    }

    // Vérifier qu'au moins un provider d'embeddings est disponible
    const hasOllama = aiConfig.ollama.enabled
    const hasOpenAI = !!aiConfig.openai.apiKey

    if (!hasOllama && !hasOpenAI) {
      errors.push(
        'Aucun provider d\'embeddings disponible - Configurez OLLAMA_ENABLED=true ou OPENAI_API_KEY'
      )
    }

    if (hasOllama) {
      warnings.push(
        `Ollama embeddings activé (${aiConfig.ollama.embeddingModel}) - Gratuit et illimité`
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
      `RAG_CHUNK_SIZE=${aiConfig.rag.chunkSize} - Valeur recommandée: 256-1024`
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
 */
export function isAIEnabled(): boolean {
  return (
    aiConfig.rag.enabled &&
    !!aiConfig.anthropic.apiKey &&
    !!aiConfig.openai.apiKey
  )
}

/**
 * Vérifie si seulement les embeddings sont disponibles (recherche sémantique)
 */
export function isSemanticSearchEnabled(): boolean {
  return aiConfig.rag.enabled && (aiConfig.ollama.enabled || !!aiConfig.openai.apiKey)
}

/**
 * Retourne le provider d'embeddings actif
 * Priorité: Ollama (gratuit local) > OpenAI (payant cloud)
 */
export function getEmbeddingProvider(): 'ollama' | 'openai' | null {
  if (!aiConfig.rag.enabled) return null
  if (aiConfig.ollama.enabled) return 'ollama'
  if (aiConfig.openai.apiKey) return 'openai'
  return null
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
 * Vérifie si le chat IA est disponible (Groq, Anthropic OU OpenAI)
 */
export function isChatEnabled(): boolean {
  return aiConfig.rag.enabled && (!!aiConfig.groq.apiKey || !!aiConfig.anthropic.apiKey || !!aiConfig.openai.apiKey)
}

/**
 * Retourne le provider de chat actif
 * Priorité: Groq > Anthropic > OpenAI
 */
export function getChatProvider(): 'groq' | 'anthropic' | 'openai' | null {
  if (!aiConfig.rag.enabled) return null
  if (aiConfig.groq.apiKey) return 'groq'
  if (aiConfig.anthropic.apiKey) return 'anthropic'
  if (aiConfig.openai.apiKey) return 'openai'
  return null
}

// =============================================================================
// PROMPTS SYSTÈME
// =============================================================================

export const SYSTEM_PROMPTS = {
  /**
   * Prompt système pour l'assistant juridique Qadhya
   */
  qadhya: `Tu es Qadhya, assistant juridique spécialisé en droit tunisien.

RÈGLES IMPORTANTES:
1. Tu réponds UNIQUEMENT sur base des documents fournis dans le contexte
2. Tu cites TOUJOURS tes sources (nom du document, section si disponible)
3. Si l'information n'est pas dans les documents fournis, dis-le clairement
4. Tu restes factuel, précis et professionnel
5. Tu réponds en français

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
- Termine par les sources consultées`,

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
// COÛTS ESTIMÉS (pour le tracking)
// =============================================================================

export const AI_COSTS = {
  // OpenAI text-embedding-3-small: $0.02 / 1M tokens
  embeddingCostPer1MTokens: 0.02,

  // Claude 3.5 Sonnet: $3 / 1M input tokens, $15 / 1M output tokens
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
