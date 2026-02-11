# Guide Développeur - Qadhya RAG Juridique

**Version** : 1.0
**Date** : 11 Février 2026
**Public** : Développeurs internes, contributeurs externes
**Durée lecture** : ~45 minutes

---

## Table des Matières

1. [Architecture Globale](#1-architecture-globale)
2. [Stack Technique](#2-stack-technique)
3. [Pipeline RAG Détaillé](#3-pipeline-rag-détaillé)
4. [Services Principaux](#4-services-principaux)
5. [Schéma Base de Données](#5-schéma-base-de-données)
6. [API Routes](#6-api-routes)
7. [Contribution](#7-contribution)
8. [Tests](#8-tests)
9. [Déploiement](#9-déploiement)
10. [Patterns & Best Practices](#10-patterns--best-practices)

---

## 1. Architecture Globale

### 1.1 Vue d'Ensemble

```
┌────────────────────────────────────────────────────────────────┐
│                     FRONTEND (Next.js 15)                      │
│  - Pages App Router (/app)                                     │
│  - React Server Components (RSC)                               │
│  - Client Components (Zustand stores)                          │
│  - Tailwind CSS + shadcn/ui                                    │
└────────────────────────────────────────────────────────────────┘
                              │
              ┌───────────────┼───────────────┐
              ▼               ▼               ▼
      ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
      │   API Routes │ │  Server      │ │  Middleware  │
      │   /api/*     │ │  Actions     │ │  (Auth)      │
      └──────────────┘ └──────────────┘ └──────────────┘
                              │
              ┌───────────────┼───────────────┐
              ▼               ▼               ▼
      ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
      │  Services    │ │  PostgreSQL  │ │  Redis       │
      │  (lib/)      │ │  (pgvector)  │ │  (cache)     │
      └──────────────┘ └──────────────┘ └──────────────┘
              │               │               │
              └───────────────┼───────────────┘
                              ▼
                    ┌────────────────────┐
                    │   MinIO (Storage)  │
                    │   LLM Providers    │
                    │   (Ollama, Groq)   │
                    └────────────────────┘
```

### 1.2 Flux Requête RAG

```
User Question
    │
    ▼
┌─────────────────────────────────────────────────────────────┐
│ 1. DÉTECTION LANGUE (lib/ai/language-utils.ts)             │
│    - Regex patterns FR/AR                                   │
│    - Détection automatique                                  │
└─────────────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────────────┐
│ 2. QUERY EXPANSION (lib/ai/smart-query-expansion.ts)       │
│    - Synonymes juridiques (dictionnaire local)              │
│    - Traduction bilingue FR ↔ AR                           │
│    - Embeddings proches (cache Redis)                      │
│    - LLM expansion (optionnel)                             │
└─────────────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────────────┐
│ 3. EMBEDDINGS (lib/ai/embeddings-service.ts)               │
│    - Ollama qwen3-embedding:0.6b                           │
│    - Vector 1024-dim                                        │
│    - Normalisation L2                                       │
│    - Cache Redis (TTL 24h)                                  │
└─────────────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────────────┐
│ 4. RECHERCHE HYBRIDE (lib/ai/hybrid-retrieval-service.ts)  │
│    - Dense retrieval (pgvector cosine similarity)           │
│    - BM25 sparse retrieval (GIN index)                     │
│    - Fusion RRF (Reciprocal Rank Fusion)                   │
│    - Re-ranking TF-IDF local                               │
└─────────────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────────────┐
│ 5. FILTRAGE INTELLIGENT (context-aware-filtering)          │
│    - Priorisation hiérarchique (Cassation > Appel > TPI)   │
│    - Fraîcheur (docs récents +20%)                         │
│    - Diversité sources (max 40% même tribunal)             │
│    - Détection contradictions (NLI)                        │
└─────────────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────────────┐
│ 6. COMPRESSION CONTEXTE (context-compressor-service.ts)    │
│    - Scoring phrases TF-IDF + keywords                     │
│    - Sélection jusqu'à maxTokens (4000)                    │
│    - Préservation citations (100%)                         │
│    - Reconstruction cohérente                              │
└─────────────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────────────┐
│ 7. MULTI-CHAIN REASONING (multi-chain-legal-reasoning.ts)  │
│    Chain 1: Analyse sources                                │
│    Chain 2: Détection contradictions sémantiques (NLI)     │
│    Chain 3: Construction argumentaire (thèse/antithèse)    │
│    Chain 4: Vérification cohérence                         │
└─────────────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────────────┐
│ 8. GÉNÉRATION LLM (llm-fallback-service.ts)                │
│    - Fallback chain : Ollama → Groq → DeepSeek → Anthropic │
│    - Circuit breaker (seuil=5, reset=60s)                  │
│    - Retry exponentiel (1s, 2s)                            │
│    - Prompt IRAC structuré (legal-reasoning-prompts.ts)    │
└─────────────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────────────┐
│ 9. POST-TRAITEMENT (rag-chat-service.ts)                   │
│    - Validation citations (citation-validator-service.ts)  │
│    - Détection abrogations (abrogation-detector-service.ts)│
│    - Formatage réponse (IRAC structure)                    │
│    - Construction arbre explication (explanation-tree)     │
└─────────────────────────────────────────────────────────────┘
    │
    ▼
Réponse Structurée + Sources + Warnings
```

---

## 2. Stack Technique

### 2.1 Frontend

| Package | Version | Usage |
|---------|---------|-------|
| **Next.js** | 15.5.12 | Framework principal (App Router) |
| **React** | 18.3.1 | Bibliothèque UI |
| **TypeScript** | 5.7.2 | Type safety |
| **Tailwind CSS** | 3.4.17 | Styling utility-first |
| **shadcn/ui** | - | Composants UI (Radix UI) |
| **Zustand** | 5.0.2 | State management |
| **React Hook Form** | 7.71.1 | Gestion formulaires |
| **next-intl** | 4.8.2 | Internationalisation FR/AR |
| **Recharts** | 3.7.0 | Graphiques dashboards |

### 2.2 Backend

| Package | Version | Usage |
|---------|---------|-------|
| **PostgreSQL** | 16+ | Base de données principale |
| **pgvector** | 0.2.1 | Extension vector search |
| **Redis** | 5.10.0 | Cache + sessions |
| **MinIO** | 8.0.2 | Object storage (documents PDF) |
| **Playwright** | 1.58.2 | Crawling JavaScript (Livewire) |
| **Cheerio** | 1.2.0 | Parsing HTML |

### 2.3 IA & LLM

| Package | Version | Usage |
|---------|---------|-------|
| **OpenAI SDK** | 6.18.0 | Client universel (Ollama, Groq, DeepSeek) |
| **@anthropic-ai/sdk** | 0.73.0 | Client Claude (fallback premium) |
| **gpt-tokenizer** | 3.4.0 | Comptage tokens |
| **pdf-parse** | 2.4.5 | Extraction texte PDF |
| **tesseract.js** | 5.1.1 | OCR PDFs scannés |
| **mammoth** | 1.11.0 | Conversion DOCX → HTML |

### 2.4 Infrastructure

| Service | Version | Hébergement |
|---------|---------|-------------|
| **VPS** | Ubuntu 22.04 | OVH Tunisia (84.247.165.187) |
| **Docker** | 24.0+ | Orchestration containers |
| **Nginx** | 1.24+ | Reverse proxy + SSL |
| **Cloudflare** | - | CDN + mTLS + DDoS protection |
| **GitHub Actions** | - | CI/CD (build + deploy) |

---

## 3. Pipeline RAG Détaillé

### 3.1 Service Principal : `rag-chat-service.ts`

**Fichier** : `lib/ai/rag-chat-service.ts` (1544 lignes)

#### Fonction Principale

```typescript
export async function answerQuestion(
  question: string,
  conversationId?: string,
  usePremiumModel: boolean = false,
  metadata?: {
    userId?: string
    sessionId?: string
    conversationTitle?: string
  }
): Promise<{
  answer: string
  sources: ChatSource[]
  processingTime: number
  warnings: string[]
  ragMetrics: RAGMetrics
}>
```

#### Workflow Détaillé

```typescript
async function answerQuestion(question: string, conversationId, usePremiumModel) {
  const startTime = Date.now()

  // 1. Détection langue
  const detectedLanguage = detectLanguage(question)

  // 2. Récupération contexte conversation (si conversationId fourni)
  const conversationContext = conversationId
    ? await getConversationContext(conversationId, 3) // Derniers 3 échanges
    : null

  // 3. Query expansion (4 stratégies)
  const expandedQueries = ENABLE_QUERY_EXPANSION
    ? await expandQuery(question, {
        includeSynonyms: true,
        includeTranslation: true,
        includeEmbeddings: true,
        useLLM: false, // LLM expansion coûteuse, skip sauf si <3 expansions
        maxExpansions: 5
      })
    : { expanded: [question] }

  // 4. Recherche sémantique avec cache
  let allSources: ChatSource[] = []
  for (const expandedQuery of expandedQueries.expanded.slice(0, 3)) {
    const cached = await getCachedSearchResults(expandedQuery, 'rag', detectedLanguage)

    if (cached) {
      allSources.push(...cached.results)
      continue
    }

    // Embedding query
    const queryEmbedding = await generateEmbedding(expandedQuery, usePremiumModel)
    const formattedEmbedding = formatEmbeddingForPostgres(queryEmbedding)

    // Recherche hybride (dense + BM25)
    const hybridResults = await hybridRetrieval({
      queryEmbedding: formattedEmbedding,
      queryText: expandedQuery,
      limit: 50, // Top 50 dense + Top 20 BM25 → Fusion RRF
      filters: {
        language: detectedLanguage,
        // Filtres juridiques additionnels si détectés dans question
      }
    })

    // Re-ranking TF-IDF local
    const rerankedResults = isRerankerEnabled()
      ? await rerankDocuments(hybridResults, expandedQuery)
      : hybridResults

    allSources.push(...rerankedResults)

    // Cache results
    await setCachedSearchResults(expandedQuery, 'rag', detectedLanguage, rerankedResults)
  }

  // 5. Déduplication + Filtrage intelligent
  const uniqueSources = deduplicateByDocId(allSources)
  const filteredSources = await contextAwareFiltering(uniqueSources, question, {
    maxSources: RAG_MAX_SOURCES, // 15-20
    diversityMaxSameTribunal: 0.40,
    prioritizeFreshness: true,
    hierarchyBoost: true, // Cassation ×1.15
    detectContradictions: true
  })

  // 6. Enrichissement métadonnées (batch 1 query SQL)
  const enrichedSources = await batchEnrichSourcesWithMetadata(filteredSources)

  // 7. Compression contexte
  const contextText = enrichedSources.map(s => s.content).join('\n\n')
  const compressedContext = countTokens(contextText) > 4000
    ? await compressContext(enrichedSources.map(s => s.content), question, {
        maxTokens: 4000,
        preserveCitations: true,
        preserveCoherence: true
      })
    : { compressed: contextText }

  // 8. Multi-chain reasoning (si mode Premium OU question controversée)
  let multiChainResult = null
  if (usePremiumModel || isControversialQuestion(question)) {
    multiChainResult = await multiChainReasoning({
      question,
      sources: enrichedSources,
      context: compressedContext.compressed,
      language: detectedLanguage
    }, { usePremiumModel })
  }

  // 9. Construction prompt IRAC
  const contextType: PromptContextType = conversationId ? 'chat' : 'consultation'
  const systemPrompt = getSystemPromptForContext(contextType, detectedLanguage)

  const messages: LLMMessage[] = [
    { role: 'system', content: systemPrompt },
    ...(conversationContext?.messages || []),
    {
      role: 'user',
      content: buildUserPrompt(
        question,
        compressedContext.compressed,
        multiChainResult,
        detectedLanguage
      )
    }
  ]

  // 10. Génération LLM avec fallback
  const llmResponse = await callLLMWithFallback(
    messages,
    usePremiumModel,
    {
      temperature: PROMPT_CONFIG[contextType].temperature,
      maxTokens: PROMPT_CONFIG[contextType].maxTokens,
      operation: 'chat'
    }
  )

  // 11. Post-traitement : Validation citations
  const citationValidation = await validateArticleCitations(llmResponse.answer, enrichedSources)
  const abrogationWarnings = await detectAbrogatedReferences(llmResponse.answer)

  const warnings = [
    ...formatValidationWarnings(citationValidation.warnings),
    ...formatAbrogationWarnings(abrogationWarnings)
  ]

  // 12. Construction arbre explication (si multi-chain activé)
  const explanationTree = multiChainResult
    ? buildExplanationTree(multiChainResult, { maxDepth: 3 })
    : null

  // 13. Sauvegarde conversation
  if (conversationId) {
    await saveConversationTurn(conversationId, question, llmResponse.answer, enrichedSources)
    await triggerSummaryGenerationIfNeeded(conversationId)
  }

  // 14. Métriques RAG
  const processingTime = Date.now() - startTime
  const ragMetrics: RAGMetrics = {
    totalSources: enrichedSources.length,
    queryExpansions: expandedQueries.expanded.length,
    compressionRate: compressedContext.compressionRate || 0,
    multiChainUsed: !!multiChainResult,
    provider: llmResponse.provider,
    latencyMs: processingTime,
    cost: llmResponse.cost || 0,
    tokensUsed: llmResponse.tokensUsed || 0
  }

  await recordRAGMetric(ragMetrics)

  return {
    answer: llmResponse.answer,
    sources: enrichedSources,
    processingTime,
    warnings,
    ragMetrics,
    explanationTree
  }
}
```

### 3.2 Multi-Chain Reasoning

**Fichier** : `lib/ai/multi-chain-legal-reasoning.ts` (1230 lignes)

```typescript
export async function multiChainReasoning(
  input: MultiChainInput,
  options: MultiChainOptions = {}
): Promise<MultiChainResponse> {

  // Chain 1: Analyse des sources
  const chain1Output = await executeChain1(input, options)
  // → Extrait points de droit, arguments, confiance par source

  // Chain 2: Détection contradictions sémantiques (NLI)
  const chain2Output = await executeChain2(input, chain1Output, options)
  // → Identifie contradictions entailment/contradiction (score >0.6)
  // → Résolution hiérarchique (Cassation > Appel > TPI > Doctrine)

  // Chain 3: Construction argumentaire dialectique
  const chain3Output = await executeChain3(input, chain1Output, chain2Output, options)
  // → Thèse (arguments POUR)
  // → Antithèse (arguments CONTRE)
  // → Synthèse (position nuancée)
  // → Recommandation pratique

  // Chain 4: Vérification cohérence
  const chain4Output = await executeChain4(
    input,
    chain1Output,
    chain2Output,
    chain3Output,
    options
  )
  // → Vérifie absence contradiction interne
  // → Vérifie 100% affirmations sourcées
  // → Score qualité global (0-100)

  return buildMultiChainResponse(chain1Output, chain2Output, chain3Output, chain4Output)
}
```

**Prompts Chain 3** (exemple) :

```typescript
const CHAIN3_PROMPT = `
Tu es un avocat tunisien expert en analyse juridique contradictoire.

**Contexte** :
Question : ${input.question}
Sources : ${chain1Output.analyzedSources.map(s => `[${s.id}] ${s.summary}`).join('\n')}
Contradictions détectées : ${chain2Output.contradictions.length > 0 ? 'OUI' : 'NON'}

**Ta mission** : Construire une argumentation dialectique (thèse/antithèse/synthèse).

**Format attendu** :
{
  "thesis": {
    "title": "Thèse : [Position A]",
    "arguments": [
      {
        "argument": "Argument 1 pour position A",
        "sources": ["Source-1", "KB-5"],
        "strength": 0.9,
        "legal_basis": "Article X du Code Y"
      },
      // ... 2-4 arguments
    ],
    "overall_strength": 0.85
  },
  "antithesis": {
    "title": "Antithèse : [Position B]",
    "arguments": [
      {
        "argument": "Contre-argument 1 (réfute Thèse)",
        "sources": ["Juris-3"],
        "strength": 0.7,
        "legal_basis": "Jurisprudence constante CA Tunis"
      },
      // ... 2-4 contre-arguments
    ],
    "overall_strength": 0.65
  },
  "synthesis": {
    "nuanced_position": "Position finale tenant compte des deux perspectives",
    "conditions": ["Condition 1 pour appliquer Thèse", "Condition 2 pour appliquer Antithèse"],
    "jurisprudence_trend": "Tendance majoritaire vers position A depuis 2020",
    "confidence": 0.80
  },
  "recommendation": {
    "action": "Recommandation pratique pour l'avocat",
    "risks": ["Risque 1 si position A", "Risque 2 si position B"],
    "documentation": "Documents à préparer pour étayer position"
  }
}

**Règles strictes** :
1. Chaque argument DOIT être sourcé (citation exacte)
2. Strength = confiance de l'argument (0-1)
3. Synthesis ne peut pas contredire les sources citées
4. Recommendation doit être actionable (pas générique)
`
```

### 3.3 Semantic Contradiction Detection (NLI)

**Fichier** : `lib/ai/semantic-contradiction-detector.ts` (650 lignes)

```typescript
export async function detectSemanticContradictions(
  input: ContradictionDetectionInput
): Promise<ContradictionDetectionOutput> {

  const { sources, question, useCache, usePremiumModel } = input

  // 1. Limiter à 25 sources max (300 paires) pour éviter explosion combinatoire
  const limitedSources = sources.slice(0, 25)

  // 2. Générer paires de sources (combinaisons 2 à 2)
  const pairs = generateSourcePairs(limitedSources)

  // 3. Filtrage pré-NLI : Skip paires même document OU confiance basse
  const relevantPairs = pairs.filter(
    ([s1, s2]) => s1.documentId !== s2.documentId && s1.score > 0.5 && s2.score > 0.5
  )

  // 4. NLI batch inference (embeddings cross-encoder)
  const contradictions: Contradiction[] = []

  for (const [source1, source2] of relevantPairs) {
    // Check cache Redis
    const cacheKey = `nli:${hashSourcePair(source1.id, source2.id)}`
    const cached = useCache ? await redis.get(cacheKey) : null

    let nliResult: NLIResult
    if (cached) {
      nliResult = JSON.parse(cached)
    } else {
      // Appel LLM pour inférence NLI
      nliResult = await performNLI(source1.content, source2.content, usePremiumModel)
      if (useCache) {
        await redis.setex(cacheKey, 7 * 24 * 3600, JSON.stringify(nliResult)) // TTL 7 jours
      }
    }

    // 5. Classification : entailment / contradiction / neutral
    if (nliResult.label === 'contradiction' && nliResult.score > 0.6) {
      contradictions.push({
        source1,
        source2,
        contradictionScore: nliResult.score,
        type: 'semantic', // vs 'textual' (patterns regex)
        explanation: nliResult.explanation
      })
    }
  }

  // 6. Résolution hiérarchique des contradictions
  const resolutions = resolveContradictionsHierarchy(contradictions)

  return {
    contradictions,
    resolutions,
    stats: {
      totalPairsAnalyzed: relevantPairs.length,
      contradictionsFound: contradictions.length,
      cacheHitRate: calculateCacheHitRate()
    }
  }
}

function resolveContradictionsHierarchy(
  contradictions: Contradiction[]
): ContradictionResolution[] {

  const HIERARCHY = {
    TRIBUNAL_CASSATION: 4,
    COUR_APPEL: 3,
    TRIBUNAL_PREMIERE_INSTANCE: 2,
    DOCTRINE: 1,
    OTHER: 0
  }

  return contradictions.map(c => {
    const level1 = HIERARCHY[c.source1.metadata?.tribunal] || 0
    const level2 = HIERARCHY[c.source2.metadata?.tribunal] || 0

    let applicableSource: ChatSource
    let overriddenSource: ChatSource
    let reason: string

    if (level1 > level2) {
      applicableSource = c.source1
      overriddenSource = c.source2
      reason = `Hiérarchie juridique : ${c.source1.metadata?.tribunal} prévaut sur ${c.source2.metadata?.tribunal}`
    } else if (level2 > level1) {
      applicableSource = c.source2
      overriddenSource = c.source1
      reason = `Hiérarchie juridique : ${c.source2.metadata?.tribunal} prévaut sur ${c.source1.metadata?.tribunal}`
    } else {
      // Même niveau → source la plus récente
      const date1 = new Date(c.source1.metadata?.date || 0)
      const date2 = new Date(c.source2.metadata?.date || 0)

      if (date1 > date2) {
        applicableSource = c.source1
        overriddenSource = c.source2
        reason = `Source plus récente (${c.source1.metadata?.date} vs ${c.source2.metadata?.date})`
      } else {
        applicableSource = c.source2
        overriddenSource = c.source1
        reason = `Source plus récente (${c.source2.metadata?.date} vs ${c.source1.metadata?.date})`
      }
    }

    return {
      contradiction: c,
      applicableSource,
      overriddenSource,
      reason,
      confidence: c.contradictionScore
    }
  })
}
```

---

## 4. Services Principaux

### 4.1 Embeddings Service

**Fichier** : `lib/ai/embeddings-service.ts`

```typescript
/**
 * Génère un embedding pour un texte donné
 *
 * @param text Texte à embedder (max 8000 tokens)
 * @param useFallback Si true, fallback OpenAI si Ollama fail
 * @param options Configuration (concurrency, cache, etc.)
 * @returns Vector 1024-dim normalisé L2
 */
export async function generateEmbedding(
  text: string,
  useFallback: boolean = false,
  options: EmbeddingOptions = {}
): Promise<number[]> {

  // 1. Validation input
  const tokens = countTokens(text)
  if (tokens > 8000) {
    throw new Error(`Text too long: ${tokens} tokens (max 8000)`)
  }

  // 2. Check cache Redis
  const cacheKey = `embedding:${hashText(text)}:${OLLAMA_EMBEDDING_MODEL}`
  const cached = options.useCache !== false ? await redis.get(cacheKey) : null

  if (cached) {
    return JSON.parse(cached)
  }

  // 3. Génération embedding avec circuit breaker
  let embedding: number[]

  try {
    const ollamaClient = getOllamaClient()
    const response = await circuitBreaker.execute(async () => {
      return await ollamaClient.embeddings.create({
        model: OLLAMA_EMBEDDING_MODEL, // qwen3-embedding:0.6b
        input: text,
      })
    })

    embedding = response.data[0].embedding

    // 4. Validation dimensionnalité
    if (embedding.length !== 1024) {
      throw new Error(`Invalid embedding dimension: ${embedding.length} (expected 1024)`)
    }

    // 5. Normalisation L2
    embedding = normalizeL2(embedding)

    // 6. Cache result
    if (options.useCache !== false) {
      await redis.setex(cacheKey, 24 * 3600, JSON.stringify(embedding)) // TTL 24h
    }

    return embedding

  } catch (error) {
    if (useFallback) {
      console.warn('Ollama embedding failed, falling back to OpenAI', error)
      return await generateEmbeddingOpenAI(text) // Fallback OpenAI
    }
    throw error
  }
}

/**
 * Génère embeddings en parallèle (batch processing)
 *
 * @param texts Tableaux de textes
 * @param concurrency Nombre de requêtes parallèles (défaut 2)
 * @returns Tableaux d'embeddings
 */
export async function batchGenerateEmbeddings(
  texts: string[],
  concurrency: number = OLLAMA_EMBEDDING_CONCURRENCY
): Promise<number[][]> {

  const chunks = chunkArray(texts, concurrency)
  const embeddings: number[][] = []

  for (const chunk of chunks) {
    const chunkEmbeddings = await Promise.all(
      chunk.map(text => generateEmbedding(text, false, { useCache: true }))
    )
    embeddings.push(...chunkEmbeddings)
  }

  return embeddings
}
```

### 4.2 LLM Fallback Service

**Fichier** : `lib/ai/llm-fallback-service.ts`

```typescript
/**
 * Appel LLM avec fallback automatique
 *
 * Chaîne de fallback :
 * Mode Rapide : Ollama → Groq → DeepSeek → Anthropic
 * Mode Premium : Groq → DeepSeek → Anthropic (skip Ollama)
 */
export async function callLLMWithFallback(
  messages: LLMMessage[],
  usePremiumModel: boolean = false,
  options: LLMOptions = {}
): Promise<LLMResponse> {

  const providers = usePremiumModel
    ? ['groq', 'deepseek', 'anthropic']
    : ['ollama', 'groq', 'deepseek', 'anthropic']

  let lastError: Error | null = null

  for (const provider of providers) {
    try {
      const response = await callProvider(provider, messages, options)

      // Log usage
      await logAIUsage({
        provider,
        operation: options.operation || 'chat',
        tokensUsed: response.tokensUsed,
        cost: response.cost,
        latencyMs: response.latencyMs,
        success: true
      })

      return response

    } catch (error) {
      lastError = error
      console.warn(`Provider ${provider} failed, trying next...`, error)

      // Log failure
      await logAIUsage({
        provider,
        operation: options.operation || 'chat',
        tokensUsed: 0,
        cost: 0,
        latencyMs: 0,
        success: false,
        error: error.message
      })

      // Retry avec backoff exponentiel
      if (isRetryable(error) && options.retries > 0) {
        await sleep(Math.pow(2, options.retries) * 1000) // 1s, 2s, 4s...
        options.retries--
        continue
      }
    }
  }

  throw new Error(`All LLM providers failed. Last error: ${lastError?.message}`)
}

async function callProvider(
  provider: string,
  messages: LLMMessage[],
  options: LLMOptions
): Promise<LLMResponse> {

  const startTime = Date.now()

  switch (provider) {
    case 'ollama': {
      const client = getOllamaClient()
      const response = await client.chat.completions.create({
        model: OLLAMA_CHAT_MODEL, // qwen2.5:3b
        messages,
        temperature: options.temperature || 0.3,
        max_tokens: options.maxTokens || 2000,
      })

      return {
        answer: response.choices[0].message.content,
        provider: 'ollama',
        model: OLLAMA_CHAT_MODEL,
        tokensUsed: response.usage?.total_tokens || 0,
        cost: 0, // Ollama local = gratuit
        latencyMs: Date.now() - startTime
      }
    }

    case 'groq': {
      const client = getGroqClient()
      const response = await client.chat.completions.create({
        model: 'llama-3.3-70b-versatile', // Groq rapide
        messages,
        temperature: options.temperature || 0.3,
        max_tokens: options.maxTokens || 2000,
      })

      const tokensUsed = response.usage?.total_tokens || 0
      const cost = calculateCost('groq', tokensUsed)

      return {
        answer: response.choices[0].message.content,
        provider: 'groq',
        model: 'llama-3.3-70b-versatile',
        tokensUsed,
        cost,
        latencyMs: Date.now() - startTime
      }
    }

    case 'deepseek': {
      const client = getDeepSeekClient()
      const response = await client.chat.completions.create({
        model: 'deepseek-chat',
        messages,
        temperature: options.temperature || 0.3,
        max_tokens: options.maxTokens || 2000,
      })

      const tokensUsed = response.usage?.total_tokens || 0
      const cost = calculateCost('deepseek', tokensUsed)

      return {
        answer: response.choices[0].message.content,
        provider: 'deepseek',
        model: 'deepseek-chat',
        tokensUsed,
        cost,
        latencyMs: Date.now() - startTime
      }
    }

    case 'anthropic': {
      const client = getAnthropicClient()
      const response = await client.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: options.maxTokens || 2000,
        temperature: options.temperature || 0.3,
        messages: messages.filter(m => m.role !== 'system'),
        system: messages.find(m => m.role === 'system')?.content || ''
      })

      const tokensUsed = response.usage.input_tokens + response.usage.output_tokens
      const cost = calculateCost('anthropic', tokensUsed)

      return {
        answer: response.content[0].text,
        provider: 'anthropic',
        model: 'claude-sonnet-4-20250514',
        tokensUsed,
        cost,
        latencyMs: Date.now() - startTime
      }
    }

    default:
      throw new Error(`Unknown provider: ${provider}`)
  }
}
```

### 4.3 Citation Validator Service

**Fichier** : `lib/ai/citation-validator-service.ts`

```typescript
/**
 * Valide les citations juridiques dans une réponse LLM
 *
 * 3 niveaux de validation :
 * 1. Exact match : Citation existe dans sources fournies
 * 2. Fuzzy match : Citation similaire (Levenshtein distance <3)
 * 3. Partial match : Numéro article valide dans code juridique
 */
export async function validateArticleCitations(
  answer: string,
  sources: ChatSource[]
): Promise<CitationValidationResult> {

  // 1. Extraction citations (regex)
  const citationsInAnswer = extractCitations(answer)
  // Formats détectés :
  // - Article 242 COC
  // - Article 242 du Code des Obligations et des Contrats
  // - Arrêt n° 12345/2020
  // - [KB-1], [Juris-2], [Source-3]

  const validationResults: CitationValidation[] = []

  for (const citation of citationsInAnswer) {
    let validationLevel: 'exact' | 'fuzzy' | 'partial' | 'invalid' = 'invalid'
    let matchedSource: ChatSource | null = null
    let confidence = 0

    // Niveau 1: Exact match dans sources
    matchedSource = sources.find(s =>
      s.content.includes(citation.text) ||
      s.title.includes(citation.text)
    )

    if (matchedSource) {
      validationLevel = 'exact'
      confidence = 1.0
    } else {
      // Niveau 2: Fuzzy match (Levenshtein)
      const fuzzyMatches = sources.filter(s => {
        const distance = levenshteinDistance(citation.text, s.title)
        return distance <= 3 // Max 3 caractères différence
      })

      if (fuzzyMatches.length > 0) {
        matchedSource = fuzzyMatches[0]
        validationLevel = 'fuzzy'
        confidence = 0.8
      } else {
        // Niveau 3: Partial match (article de code)
        const articleMatch = citation.text.match(/Article\s+(\d+)\s+(COC|CSP|CP|CPC)/i)

        if (articleMatch) {
          const [_, articleNumber, codeAbbrev] = articleMatch
          const articleExists = await checkArticleExistsInCode(codeAbbrev, articleNumber)

          if (articleExists) {
            validationLevel = 'partial'
            confidence = 0.6
          }
        }
      }
    }

    validationResults.push({
      citation,
      validationLevel,
      matchedSource,
      confidence
    })
  }

  // 2. Générer warnings pour citations invalides
  const warnings = validationResults
    .filter(v => v.validationLevel === 'invalid')
    .map(v => `⚠️ Citation non vérifiable : "${v.citation.text}"`)

  // 3. Calculer score global
  const validCitations = validationResults.filter(v => v.validationLevel !== 'invalid')
  const citationAccuracy = citationsInAnswer.length > 0
    ? validCitations.length / citationsInAnswer.length
    : 1.0

  return {
    totalCitations: citationsInAnswer.length,
    validCitations: validCitations.length,
    citationAccuracy,
    validationResults,
    warnings
  }
}
```

---

## 5. Schéma Base de Données

### 5.1 Tables Principales

#### `knowledge_base`

```sql
CREATE TABLE IF NOT EXISTS knowledge_base (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  category TEXT NOT NULL,
  language TEXT DEFAULT 'fr',
  source_url TEXT,
  file_path TEXT,
  file_type TEXT, -- 'pdf', 'docx', 'html', 'txt'
  word_count INTEGER,
  is_indexed BOOLEAN DEFAULT false,
  health_score FLOAT DEFAULT 0.0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES users(id),

  -- Contraintes
  CHECK (category IN (
    'codes', 'jurisprudence', 'legislation', 'doctrine',
    'modeles', 'guides', 'fiscalite', 'immobilier',
    'commercial', 'travail', 'famille', 'penal',
    'google_drive', 'actualites', 'autre'
  )),
  CHECK (language IN ('fr', 'ar')),
  CHECK (health_score BETWEEN 0 AND 100)
);

CREATE INDEX idx_kb_category_language ON knowledge_base(category, language);
CREATE INDEX idx_kb_is_indexed ON knowledge_base(is_indexed);
CREATE INDEX idx_kb_health_score ON knowledge_base(health_score);
```

#### `kb_chunks`

```sql
CREATE TABLE IF NOT EXISTS kb_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES knowledge_base(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  char_count INTEGER NOT NULL,
  word_count INTEGER NOT NULL,
  chunk_index INTEGER NOT NULL,
  embedding vector(1024), -- pgvector extension
  created_at TIMESTAMPTZ DEFAULT NOW(),

  CHECK (char_count > 0),
  CHECK (word_count > 0),
  CHECK (chunk_index >= 0)
);

-- Index HNSW pour recherche sémantique (cosine similarity)
CREATE INDEX idx_kb_chunks_embedding ON kb_chunks
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- Index GIN pour BM25 (recherche lexicale)
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX idx_kb_chunks_content_gin ON kb_chunks
  USING GIN (content gin_trgm_ops);

CREATE INDEX idx_kb_chunks_doc_id ON kb_chunks(document_id);
```

#### `kb_structured_metadata`

```sql
CREATE TABLE IF NOT EXISTS kb_structured_metadata (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES knowledge_base(id) ON DELETE CASCADE,

  -- Métadonnées juridiques
  tribunal TEXT, -- TRIBUNAL_CASSATION, COUR_APPEL, TRIBUNAL_PREMIERE_INSTANCE
  chambre TEXT, -- civile, penale, commerciale, sociale, administrative
  date_decision DATE,
  numero_decision TEXT,
  parties TEXT[], -- ["Partie A", "Partie B"]
  domain TEXT, -- civil, penal, commercial, famille, travail, etc.
  summary_ai TEXT,
  keywords_extracted TEXT[],

  -- Scoring
  precedent_value FLOAT DEFAULT 0.0, -- PageRank score (0-1)
  confidence FLOAT DEFAULT 0.0, -- Confiance extraction (0-1)

  -- Audit
  extraction_method TEXT, -- 'regex', 'llm', 'manual'
  validated BOOLEAN DEFAULT false,
  validated_by UUID REFERENCES users(id),
  validated_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Contraintes
  UNIQUE(document_id),
  CHECK (precedent_value BETWEEN 0 AND 1),
  CHECK (confidence BETWEEN 0 AND 1),
  CHECK (tribunal IN (
    'TRIBUNAL_CASSATION',
    'COUR_APPEL',
    'TRIBUNAL_PREMIERE_INSTANCE',
    'TRIBUNAL_ADMINISTRATIF',
    'AUTRE'
  ))
);

CREATE INDEX idx_kb_metadata_tribunal ON kb_structured_metadata(tribunal);
CREATE INDEX idx_kb_metadata_domain ON kb_structured_metadata(domain);
CREATE INDEX idx_kb_metadata_date ON kb_structured_metadata(date_decision);
CREATE INDEX idx_kb_metadata_precedent ON kb_structured_metadata(precedent_value DESC);
```

#### `kb_legal_relations`

```sql
CREATE TABLE IF NOT EXISTS kb_legal_relations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_document_id UUID NOT NULL REFERENCES knowledge_base(id) ON DELETE CASCADE,
  target_document_id UUID NOT NULL REFERENCES knowledge_base(id) ON DELETE CASCADE,
  relation_type TEXT NOT NULL,
  relation_strength FLOAT DEFAULT 0.5,
  context_excerpt TEXT,
  confidence FLOAT DEFAULT 0.0,
  extraction_method TEXT, -- 'regex', 'llm'
  validated BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),

  CHECK (relation_type IN (
    'cites', 'cited_by', 'supersedes', 'superseded_by',
    'implements', 'interpreted_by', 'commented_by',
    'related_case', 'same_topic', 'contradicts',
    'confirms', 'overrules', 'distinguishes', 'applies', 'interprets'
  )),
  CHECK (relation_strength BETWEEN 0 AND 1),
  CHECK (confidence BETWEEN 0 AND 1),
  CHECK (source_document_id != target_document_id)
);

CREATE INDEX idx_kb_relations_source ON kb_legal_relations(source_document_id);
CREATE INDEX idx_kb_relations_target ON kb_legal_relations(target_document_id);
CREATE INDEX idx_kb_relations_type ON kb_legal_relations(relation_type);
```

#### `rag_feedback`

```sql
CREATE TABLE IF NOT EXISTS rag_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  sources_used UUID[], -- IDs kb_chunks

  -- Feedback quantitatif
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),

  -- Feedback qualitatif
  feedback_type TEXT[],
  -- 'missing_info', 'incorrect_citation', 'too_general',
  -- 'outdated_law', 'wrong_analysis', 'hallucination', 'other'

  missing_info TEXT,
  incorrect_citation TEXT,
  suggested_sources TEXT[],
  hallucination_details TEXT,
  free_text TEXT,

  -- Métadonnées
  user_id UUID REFERENCES users(id),
  user_role TEXT, -- 'LAWYER', 'ADMIN'
  domain TEXT,
  question_language TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),

  CHECK (rating >= 1 AND rating <= 5)
);

CREATE INDEX idx_rag_feedback_rating ON rag_feedback(rating);
CREATE INDEX idx_rag_feedback_user ON rag_feedback(user_id);
CREATE INDEX idx_rag_feedback_created_at ON rag_feedback(created_at);
```

#### `ai_usage_logs`

```sql
CREATE TABLE IF NOT EXISTS ai_usage_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL,
  operation TEXT NOT NULL,
  model TEXT,
  tokens_used INTEGER DEFAULT 0,
  cost FLOAT DEFAULT 0.0,
  latency_ms INTEGER DEFAULT 0,
  success BOOLEAN DEFAULT true,
  error TEXT,
  user_id UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),

  CHECK (provider IN ('ollama', 'groq', 'deepseek', 'anthropic', 'openai', 'gemini')),
  CHECK (operation IN ('chat', 'embedding', 'classification', 'extraction', 'generation'))
);

CREATE INDEX idx_ai_usage_provider_operation_date ON ai_usage_logs(provider, operation, created_at);
CREATE INDEX idx_ai_usage_created_at ON ai_usage_logs(created_at);
```

### 5.2 Fonctions SQL Utiles

#### Recherche Sémantique

```sql
CREATE OR REPLACE FUNCTION search_chunks_semantic(
  query_embedding vector(1024),
  max_results INTEGER DEFAULT 20,
  similarity_threshold FLOAT DEFAULT 0.3
)
RETURNS TABLE (
  chunk_id UUID,
  document_id UUID,
  content TEXT,
  similarity FLOAT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    c.id AS chunk_id,
    c.document_id,
    c.content,
    1 - (c.embedding <=> query_embedding) AS similarity
  FROM kb_chunks c
  WHERE c.embedding IS NOT NULL
    AND (1 - (c.embedding <=> query_embedding)) >= similarity_threshold
  ORDER BY c.embedding <=> query_embedding
  LIMIT max_results;
END;
$$ LANGUAGE plpgsql;
```

#### Récupération Knowledge Gaps

```sql
CREATE OR REPLACE FUNCTION get_knowledge_gaps(
  min_occurrences INTEGER DEFAULT 3,
  max_rating INTEGER DEFAULT 3,
  days_back INTEGER DEFAULT 30
)
RETURNS TABLE (
  topic TEXT,
  occurrence_count BIGINT,
  avg_rating FLOAT,
  sample_questions TEXT[],
  suggested_sources TEXT[]
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    f.domain AS topic,
    COUNT(*) AS occurrence_count,
    AVG(f.rating) AS avg_rating,
    ARRAY_AGG(DISTINCT f.question ORDER BY f.created_at DESC) FILTER (WHERE f.question IS NOT NULL) AS sample_questions,
    ARRAY_AGG(DISTINCT unnest(f.suggested_sources)) FILTER (WHERE f.suggested_sources IS NOT NULL) AS suggested_sources
  FROM rag_feedback f
  WHERE
    f.rating <= max_rating
    AND 'missing_info' = ANY(f.feedback_type)
    AND f.created_at >= NOW() - (days_back || ' days')::INTERVAL
  GROUP BY f.domain
  HAVING COUNT(*) >= min_occurrences
  ORDER BY occurrence_count DESC, avg_rating ASC;
END;
$$ LANGUAGE plpgsql;
```

---

## 6. API Routes

### 6.1 Routes Publiques

| Route | Méthode | Description |
|-------|---------|-------------|
| `/api/health` | GET | Health check système |
| `/api/chat` | POST | Requête RAG (authentifié) |
| `/api/feedback` | POST | Soumission feedback (authentifié) |

### 6.2 Routes Admin

| Route | Méthode | Description |
|-------|---------|-------------|
| `/api/admin/index-kb` | POST | Indexation batch KB (CRON_SECRET) |
| `/api/admin/kb/rechunk` | POST | Re-chunking documents |
| `/api/admin/kb/quality` | GET | Dashboard qualité KB |
| `/api/admin/provider-usage` | GET | Matrice coûts providers |
| `/api/admin/legal-quality-metrics` | GET | KPIs juridiques |
| `/api/super-admin/users` | GET/POST/PUT/DELETE | CRUD utilisateurs |

### 6.3 Exemple : `/api/chat`

**Fichier** : `app/api/chat/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { answerQuestion } from '@/lib/ai/rag-chat-service'

export async function POST(req: NextRequest) {
  try {
    // 1. Authentification
    const session = await getServerSession()
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // 2. Validation input
    const body = await req.json()
    const { question, conversationId, usePremiumModel } = body

    if (!question || typeof question !== 'string') {
      return NextResponse.json({ error: 'Question is required' }, { status: 400 })
    }

    // 3. Vérification quotas (mode Premium)
    if (usePremiumModel) {
      const dailyUsage = await getUserDailyUsage(session.user.id)
      const userPlan = await getUserPlan(session.user.id)

      if (dailyUsage >= userPlan.premiumQueriesPerDay) {
        return NextResponse.json(
          { error: 'Daily premium quota exceeded' },
          { status: 429 }
        )
      }
    }

    // 4. Exécution pipeline RAG
    const result = await answerQuestion(
      question,
      conversationId,
      usePremiumModel,
      {
        userId: session.user.id,
        sessionId: req.headers.get('x-session-id') || undefined
      }
    )

    // 5. Incrémentation compteur usage
    await incrementUserUsage(session.user.id, usePremiumModel)

    // 6. Réponse
    return NextResponse.json({
      answer: result.answer,
      sources: result.sources.map(s => ({
        id: s.id,
        title: s.title,
        excerpt: s.content.substring(0, 200) + '...',
        category: s.category,
        url: s.url
      })),
      processingTime: result.processingTime,
      warnings: result.warnings,
      metrics: {
        totalSources: result.ragMetrics.totalSources,
        provider: result.ragMetrics.provider,
        cost: result.ragMetrics.cost
      }
    })

  } catch (error) {
    console.error('Error in /api/chat:', error)

    return NextResponse.json(
      {
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}
```

---

## 7. Contribution

### 7.1 Setup Environnement Dev

```bash
# 1. Clone repository
git clone https://github.com/salmenktata/moncabinet.git
cd moncabinet

# 2. Install dependencies
npm install

# 3. Copy environment variables
cp .env.example .env.local

# 4. Configure .env.local
# - DATABASE_URL=postgresql://user:pass@localhost:5433/qadhya
# - REDIS_URL=redis://localhost:6379
# - MINIO_ENDPOINT=localhost:9000
# - OLLAMA_BASE_URL=http://localhost:11434

# 5. Start Docker services
docker-compose up -d postgres redis minio

# 6. Run migrations
npx prisma migrate deploy

# 7. Seed database
npm run seed

# 8. Start dev server
npm run dev
```

Accéder : http://localhost:7002

### 7.2 Workflow Git

```bash
# 1. Créer branche feature
git checkout -b feature/nom-feature

# 2. Développer + commits atomiques
git add lib/ai/nouveau-service.ts
git commit -m "feat(ai): Add nouveau service for XYZ"

# 3. Tests
npm run test
npm run type-check

# 4. Push + Pull Request
git push origin feature/nom-feature
# Créer PR sur GitHub avec description détaillée

# 5. Review + Merge
# Attendre approval + CI/CD pass → Merge main
```

### 7.3 Conventions Code

#### Nommage

- **Fichiers** : `kebab-case.ts` (ex: `rag-chat-service.ts`)
- **Composants React** : `PascalCase.tsx` (ex: `ChatInterface.tsx`)
- **Fonctions** : `camelCase` (ex: `answerQuestion`)
- **Types/Interfaces** : `PascalCase` (ex: `MultiChainResponse`)
- **Constantes** : `UPPER_SNAKE_CASE` (ex: `RAG_MAX_SOURCES`)

#### Structure Fonction

```typescript
/**
 * Description brève de la fonction
 *
 * @param param1 Description param1
 * @param param2 Description param2
 * @returns Description valeur retour
 *
 * @example
 * const result = await maFonction('input', 42)
 */
export async function maFonction(
  param1: string,
  param2: number
): Promise<ReturnType> {
  // 1. Validation input
  if (!param1) throw new Error('param1 is required')

  // 2. Logique métier
  const intermediaire = await autreService(param1)

  // 3. Return
  return {
    data: intermediaire,
    success: true
  }
}
```

#### Gestion Erreurs

```typescript
try {
  const result = await operationRisquee()
  return result
} catch (error) {
  // Log error avec contexte
  console.error('Error in operationRisquee:', {
    error,
    context: { param1, param2 }
  })

  // Rethrow avec message explicite
  throw new Error(`Failed to operationRisquee: ${error.message}`)
}
```

---

## 8. Tests

### 8.1 Tests Unitaires (Vitest)

**Fichier** : `__tests__/lib/ai/rag-chat-service.test.ts`

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { answerQuestion } from '@/lib/ai/rag-chat-service'

describe('RAG Chat Service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should return structured answer with sources', async () => {
    const result = await answerQuestion(
      'Quelle est la prescription civile en Tunisie ?',
      undefined,
      false
    )

    expect(result).toHaveProperty('answer')
    expect(result).toHaveProperty('sources')
    expect(result.sources.length).toBeGreaterThan(0)
    expect(result.warnings).toBeInstanceOf(Array)
  })

  it('should detect French language', async () => {
    const result = await answerQuestion('Test question', undefined, false)
    // Mock detectLanguage to verify it's called
    expect(detectLanguage).toHaveBeenCalledWith('Test question')
  })

  it('should use Premium model when requested', async () => {
    const result = await answerQuestion('Test', undefined, true)

    // Vérifier que Ollama est skippé
    expect(result.ragMetrics.provider).not.toBe('ollama')
  })
})
```

**Run tests** :
```bash
npm run test
npm run test:watch
npm run test:coverage
```

### 8.2 Tests E2E (Playwright)

**Fichier** : `e2e/workflows/rag-complete-flow.spec.ts`

```typescript
import { test, expect } from '@playwright/test'

test.describe('RAG Complete Flow', () => {
  test('should answer legal question with sources', async ({ page }) => {
    // 1. Login
    await page.goto('http://localhost:7002/login')
    await page.fill('[name="email"]', 'test@avocat.tn')
    await page.fill('[name="password"]', 'password123')
    await page.click('button[type="submit"]')

    // 2. Navigate to chat
    await page.goto('http://localhost:7002/chat')

    // 3. Ask question
    const question = 'Quelle est la prescription civile en Tunisie ?'
    await page.fill('textarea[name="question"]', question)
    await page.click('button[type="submit"]')

    // 4. Wait for answer
    await page.waitForSelector('[data-testid="chat-answer"]', { timeout: 30000 })

    // 5. Verify answer structure
    const answer = await page.textContent('[data-testid="chat-answer"]')
    expect(answer).toContain('prescription')
    expect(answer).toContain('15 ans') // Prescription de droit commun

    // 6. Verify sources
    const sources = await page.$$('[data-testid="chat-source"]')
    expect(sources.length).toBeGreaterThan(0)

    // 7. Verify citations
    expect(answer).toMatch(/\[KB-\d+\]|\[Juris-\d+\]/)
  })
})
```

**Run E2E** :
```bash
npm run test:e2e
npm run test:e2e:ui # Interface graphique
```

### 8.3 Benchmark Tests

**Fichier** : `scripts/run-benchmark.ts`

```bash
# Exécuter benchmark complet (100 cas)
npm run benchmark

# Exemple output:
# 🚀 Benchmark RAG Juridique - Gold Standard
# ======================================================================
# Dataset: 100 cas validés par experts
# Objectif: Score >90%, 0 hallucinations critiques
#
# ✅ Réussis: 92 (92.0%)
# ❌ Échoués: 8
# 📈 Score Global: 91.5/100
#
# Scores par difficulté:
#   Easy: 98.5%
#   Medium: 94.2%
#   Hard: 87.3%
#   Expert: 82.1%
#
# ✅ SUCCÈS : Niveau Avocat Professionnel atteint !
```

---

## 9. Déploiement

### 9.1 CI/CD GitHub Actions

**Fichier** : `.github/workflows/deploy-vps.yml`

```yaml
name: Deploy to VPS

on:
  push:
    branches: [main]
  workflow_dispatch:

jobs:
  build-and-deploy:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3

      - name: Login to GitHub Container Registry
        uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: Build and push Docker image
        uses: docker/build-push-action@v5
        with:
          context: .
          push: true
          tags: ghcr.io/salmenktata/moncabinet:latest
          cache-from: type=gha
          cache-to: type=gha,mode=max

      - name: Deploy to VPS
        uses: appleboy/ssh-action@v1.0.0
        with:
          host: ${{ secrets.VPS_HOST }}
          username: root
          key: ${{ secrets.VPS_SSH_KEY }}
          script: |
            cd /opt/qadhya
            docker-compose pull
            docker-compose up -d
            docker system prune -af
```

### 9.2 Déploiement Manuel

```bash
# 1. SSH vers VPS
ssh root@84.247.165.187

# 2. Pull latest code
cd /opt/qadhya
git pull origin main

# 3. Rebuild Docker image
docker build -t qadhya:latest .

# 4. Restart containers
docker-compose -f docker-compose.prod.yml down
docker-compose -f docker-compose.prod.yml up -d

# 5. Verify health
curl https://qadhya.tn/api/health

# 6. Monitor logs
docker logs -f qadhya-nextjs --tail 100
```

### 9.3 Rollback Procédure

```bash
# 1. Identifier version précédente stable
docker images | grep moncabinet

# 2. Tag version actuelle (backup)
docker tag qadhya:latest qadhya:rollback

# 3. Pull version précédente
docker pull ghcr.io/salmenktata/moncabinet:sha-abc123

# 4. Tag as latest
docker tag ghcr.io/salmenktata/moncabinet:sha-abc123 qadhya:latest

# 5. Restart
docker-compose -f docker-compose.prod.yml up -d

# 6. Verify
curl https://qadhya.tn/api/health
```

---

## 10. Patterns & Best Practices

### 10.1 Error Handling Pattern

```typescript
// ❌ Mauvais : Ignorer erreurs
async function fetchData() {
  try {
    return await api.fetch()
  } catch (error) {
    return null // Perte d'information
  }
}

// ✅ Bon : Log + Rethrow avec contexte
async function fetchData(userId: string) {
  try {
    return await api.fetch(userId)
  } catch (error) {
    console.error('Failed to fetch data', {
      userId,
      error: error.message,
      stack: error.stack
    })
    throw new Error(`Failed to fetch data for user ${userId}: ${error.message}`)
  }
}
```

### 10.2 Caching Pattern

```typescript
async function getCachedData<T>(
  cacheKey: string,
  fetchFn: () => Promise<T>,
  ttl: number = 3600
): Promise<T> {

  // 1. Check cache
  const cached = await redis.get(cacheKey)
  if (cached) {
    return JSON.parse(cached) as T
  }

  // 2. Fetch fresh data
  const data = await fetchFn()

  // 3. Save to cache
  await redis.setex(cacheKey, ttl, JSON.stringify(data))

  return data
}

// Usage
const userProfile = await getCachedData(
  `user:${userId}:profile`,
  () => db.query('SELECT * FROM users WHERE id = $1', [userId]),
  1800 // 30 minutes
)
```

### 10.3 Parallel Processing Pattern

```typescript
// ❌ Mauvais : Séquentiel
async function processDocuments(docs: Document[]) {
  const results = []
  for (const doc of docs) {
    const processed = await processDocument(doc)
    results.push(processed)
  }
  return results
}

// ✅ Bon : Parallèle avec limite concurrency
async function processDocuments(docs: Document[], concurrency = 5) {
  const chunks = chunkArray(docs, concurrency)
  const results = []

  for (const chunk of chunks) {
    const chunkResults = await Promise.all(
      chunk.map(doc => processDocument(doc))
    )
    results.push(...chunkResults)
  }

  return results
}
```

### 10.4 Type Safety Pattern

```typescript
// ❌ Mauvais : any
function formatData(data: any) {
  return data.name + ' - ' + data.age
}

// ✅ Bon : Types explicites
interface User {
  name: string
  age: number
}

function formatData(data: User): string {
  return `${data.name} - ${data.age}`
}

// ✅ Meilleur : Validation runtime (Zod)
import { z } from 'zod'

const UserSchema = z.object({
  name: z.string(),
  age: z.number().min(0)
})

function formatData(data: unknown): string {
  const validated = UserSchema.parse(data) // Throws si invalide
  return `${validated.name} - ${validated.age}`
}
```

---

## 📞 Support Développeurs

**Questions techniques** :
- **Email** : dev@qadhya.tn
- **Slack** : #qadhya-dev
- **GitHub Issues** : https://github.com/salmenktata/moncabinet/issues

**Code review** :
- Pull Requests reviewées sous 24h
- Feedback constructif + suggestions amélioration

**Pair programming** :
- Sessions hebdomadaires (vendredi 14h-16h)
- Réservation : dev@qadhya.tn

---

**Version** : 1.0
**Dernière mise à jour** : 11 Février 2026
**Auteur** : Équipe Technique Qadhya
**Licence** : Propriétaire (code source interne)

**Happy Coding! 🚀💻⚖️**
