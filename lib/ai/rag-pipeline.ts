/**
 * Service RAG Pipeline - Types publics et pipeline de génération LLM
 *
 * Ce module gère:
 * 1. Les types publics exportés (ChatSource, ChatResponse, ChatOptions, ConversationMessage, StreamChunk)
 * 2. Les clients LLM (Ollama, Anthropic, Groq, DeepSeek)
 * 3. La fonction principale answerQuestion()
 * 4. La fonction de streaming answerQuestionStream()
 */

import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'
import { db } from '@/lib/db/postgres'
import {
  aiConfig,
  SYSTEM_PROMPTS,
  isChatEnabled,
  getChatProvider,
} from './config'
import {
  getSystemPromptForContext,
  PROMPT_CONFIG,
  type PromptContextType,
  type SupportedLanguage,
  type LegalStance,
} from './legal-reasoning-prompts'
import { detectLanguage } from './language-utils'
import {
  validateCitationFirst,
  enforceCitationFirst,
  CITATION_FIRST_SYSTEM_PROMPT,
} from './citation-first-enforcer'
import {
  getConversationContext,
  triggerSummaryGenerationIfNeeded,
  SUMMARY_CONFIG,
} from './conversation-summary-service'
import { RAGLogger } from '@/lib/logging/rag-logger'
import { createLogger } from '@/lib/logger'
import {
  callLLMWithFallback,
  callLLMStream,
  LLMMessage,
  LLMResponse,
  type StreamTokenUsage,
} from './llm-fallback-service'
import { type OperationName, getOperationProvider, getOperationModel } from './operations-config'
import {
  validateArticleCitations,
  formatValidationWarnings,
  verifyClaimSourceAlignment,
  verifyBranchAlignment,
} from './citation-validator-service'
import {
  detectAbrogatedReferences,
  formatAbrogationWarnings,
  type AbrogationWarning,
} from './abrogation-detector-service'
import { recordRAGMetric } from '@/lib/metrics/rag-metrics'
import { buildContextFromSources, sanitizeCitations, computeSourceQualityMetrics } from './rag-context-builder'
import {
  searchRelevantContext,
  searchRelevantContextBilingual,
  ENABLE_QUERY_EXPANSION,
  BILINGUAL_SEARCH_TIMEOUT_MS,
  type SearchResult,
  type ChatSource,
  type ChatOptions,
  type ConversationMessage,
} from './rag-search-service'

const log = createLogger('RAG')

// =============================================================================
// CLIENTS LLM (Ollama prioritaire, puis Groq, puis Anthropic)
// =============================================================================

let anthropicClient: Anthropic | null = null
let groqClient: OpenAI | null = null
let ollamaClient: OpenAI | null = null
let deepseekClient: OpenAI | null = null

function getOllamaClient(): OpenAI {
  if (!ollamaClient) {
    ollamaClient = new OpenAI({
      apiKey: 'ollama', // Ollama n'a pas besoin de clé
      baseURL: `${aiConfig.ollama.baseUrl}/v1`,
      timeout: 120000,
    })
  }
  return ollamaClient
}

function getAnthropicClient(): Anthropic {
  if (!anthropicClient) {
    if (!aiConfig.anthropic.apiKey) {
      throw new Error('ANTHROPIC_API_KEY non configuré')
    }
    anthropicClient = new Anthropic({ apiKey: aiConfig.anthropic.apiKey })
  }
  return anthropicClient
}

function getGroqClient(): OpenAI {
  if (!groqClient) {
    if (!aiConfig.groq.apiKey) {
      throw new Error('GROQ_API_KEY non configuré')
    }
    groqClient = new OpenAI({
      apiKey: aiConfig.groq.apiKey,
      baseURL: aiConfig.groq.baseUrl,
    })
  }
  return groqClient
}

function getDeepSeekClient(): OpenAI {
  if (!deepseekClient) {
    if (!aiConfig.deepseek.apiKey) {
      throw new Error('DEEPSEEK_API_KEY non configuré')
    }
    deepseekClient = new OpenAI({
      apiKey: aiConfig.deepseek.apiKey,
      baseURL: aiConfig.deepseek.baseUrl,
    })
  }
  return deepseekClient
}

// =============================================================================
// TYPES PROPRES AU PIPELINE
// =============================================================================

export interface ChatResponse {
  answer: string
  sources: ChatSource[]
  tokensUsed: {
    input: number
    output: number
    total: number
  }
  model: string
  conversationId?: string
  citationWarnings?: string[] // Phase 2.2 - Citations non vérifiées
  abrogationWarnings?: import('./abrogation-detector-service').AbrogationWarning[] // Phase 2.3 - Lois abrogées
  qualityIndicator?: 'high' | 'medium' | 'low'
  averageSimilarity?: number
  abstentionReason?: string // Sprint 1 B1 - Raison de l'abstention si sources insuffisantes
  /** Sprint 3 RAG Audit-Proof : true si la réponse a été régénérée après détection cross-domaine */
  wasRegenerated?: boolean
  /** Sprint 3 : statut de validation des sources après génération */
  validationStatus?: 'passed' | 'regenerated' | 'insufficient_sources'
}

// Templates bilingues pour le message utilisateur (utilisé dans answerQuestion et answerQuestionStream)
const USER_MESSAGE_TEMPLATES = {
  ar: {
    prefix: 'وثائق مرجعية:',
    questionLabel: 'السؤال:',
    analysisHint: 'تعليمات: استخرج الشروط القانونية من كل فصل، حدّد الآجال والإجراءات العملية، واربط بين النصوص المختلفة.',
    followUpHint: 'متابعة: لقد أجبت بالفعل على الأسئلة السابقة في هذه المحادثة. لا تكرر ما سبق ذكره. أجب فقط على الجانب الجديد أو المحدد في هذا السؤال بشكل مباشر ومختصر.',
  },
  fr: {
    prefix: 'Documents du dossier:',
    questionLabel: 'Question:',
    analysisHint: 'Instructions: extraire les conditions légales de chaque article, identifier les délais et procédures, relier les textes entre eux.',
    followUpHint: 'SUIVI : Tu as déjà répondu aux questions précédentes dans cette conversation. NE PAS RÉPÉTER ce qui a déjà été expliqué. Répondre UNIQUEMENT à ce qui est nouveau ou spécifiquement demandé dans cette question, de façon directe et ciblée.',
  },
}

// =============================================================================
// HELPERS CONVERSATION
// =============================================================================

/**
 * Récupère l'historique de conversation pour le contexte (version simple)
 */
async function getConversationHistory(
  conversationId: string,
  limit: number = 10
): Promise<ConversationMessage[]> {
  const result = await db.query(
    `SELECT role, content
     FROM chat_messages
     WHERE conversation_id = $1
       AND role IN ('user', 'assistant')
     ORDER BY created_at DESC
     LIMIT $2`,
    [conversationId, limit]
  )

  // Inverser pour avoir l'ordre chronologique
  return result.rows
    .reverse()
    .map((row) => ({
      role: row.role as 'user' | 'assistant',
      content: row.content,
    }))
}

/**
 * Récupère l'historique de conversation avec résumé si disponible
 * Retourne le résumé + les messages récents pour un contexte optimal
 */
async function getConversationHistoryWithSummary(
  conversationId: string,
  recentLimit: number = SUMMARY_CONFIG.recentMessagesLimit
): Promise<{
  summary: string | null
  messages: ConversationMessage[]
  totalCount: number
}> {
  const context = await getConversationContext(conversationId, recentLimit)

  return {
    summary: context.summary,
    messages: context.messages.map((m) => ({
      role: m.role,
      content: m.content,
    })),
    totalCount: context.totalCount,
  }
}

// =============================================================================
// STREAMING NATIF GEMINI
// =============================================================================

/**
 * Événements émis par answerQuestionStream()
 */
export type StreamChunk =
  | { type: 'metadata'; sources: ChatSource[]; model: string; qualityIndicator: 'high' | 'medium' | 'low'; averageSimilarity: number }
  | { type: 'chunk'; text: string }
  | { type: 'done'; tokensUsed: { input: number; output: number; total: number } }
  | { type: 'error'; message: string }
  | { type: 'progress'; step: 'searching' | 'sources_found' | 'generating'; count?: number; avgSimilarity?: number; quality?: string }

// =============================================================================
// FONCTION PRINCIPALE: RÉPONDRE À UNE QUESTION
// =============================================================================

/**
 * Répond à une question en utilisant le pipeline RAG complet
 */
export async function answerQuestion(
  question: string,
  userId: string,
  options: ChatOptions = {}
): Promise<ChatResponse> {
  const startTotal = Date.now()

  // Initialiser logger structuré (ou utiliser celui fourni)
  const logger = options.logger || new RAGLogger(undefined, { userId, operation: options.operationName })
  logger.addContext('question', question.substring(0, 100)) // Truncate pour éviter logs massifs
  logger.info('search', 'Pipeline RAG démarré', {
    enableExpansion: ENABLE_QUERY_EXPANSION,
    operationName: options.operationName,
  })

  if (!isChatEnabled()) {
    logger.error('search', 'Chat IA désactivé')
    throw new Error('Chat IA désactivé (activer OLLAMA_ENABLED ou configurer GROQ_API_KEY)')
  }

  const provider = getChatProvider()
  logger.addContext('provider', provider)

  // Métriques RAG
  let searchTimeMs = 0
  let cacheHit = false

  // 1. Rechercher le contexte pertinent (bilingue si activé) avec fallback dégradé
  let sources: ChatSource[] = []
  let isDegradedMode = false

  let lastSearchResult: SearchResult | null = null
  const startSearch = Date.now()
  try {
    lastSearchResult = ENABLE_QUERY_EXPANSION
      ? await searchRelevantContextBilingual(question, userId, options)
      : await searchRelevantContext(question, userId, options)
    sources = lastSearchResult.sources
    cacheHit = lastSearchResult.cacheHit
    searchTimeMs = Date.now() - startSearch
  } catch (error) {
    // Mode dégradé: retourner une erreur claire au lieu de continuer sans contexte
    // Évite les hallucinations juridiques en mode sans source
    logger.error('search', 'Erreur recherche contexte - Sources indisponibles', error)
    isDegradedMode = true
    sources = []
    searchTimeMs = Date.now() - startSearch
  }

  // 2. Si la recherche a réussi mais n'a trouvé aucune source pertinente,
  // retourner un message clair au lieu d'appeler le LLM (évite les hallucinations)
  if (!isDegradedMode && sources.length === 0) {
    const noSourcesLang = detectLanguage(question)
    log.warn(`[RAG Diagnostic] 🔍 Aucune source trouvée pour requête:`, {
      queryLength: question.length,
      queryWords: question.trim().split(/\s+/).length,
      language: noSourcesLang,
      condensationOccurred: lastSearchResult?.embeddingQuestion !== undefined && lastSearchResult.embeddingQuestion !== question,
      condensedQuery: lastSearchResult?.embeddingQuestion?.substring(0, 100),
      failureReason: lastSearchResult?.reason || 'unknown',
      queryPreview: question.substring(0, 100) + (question.length > 100 ? '...' : ''),
      searchTimeMs,
      enableExpansion: ENABLE_QUERY_EXPANSION,
    })
    const noSourcesMessage = noSourcesLang === 'fr'
      ? 'Ma base de connaissances ne contient pas de références directement applicables à cette question. Je vous oriente vers les textes officiels publiés au JORT ou vers un confrère spécialisé dans ce domaine.'
      : 'لا تتوفر لديّ في قاعدة المعرفة نصوص أو مراجع مرتبطة مباشرةً بهذه المسألة. أنصحك بمراجعة التشريعات الرسمية الصادرة في الرائد الرسمي، أو التواصل مع محامٍ متخصص في هذا المجال.'

    return {
      answer: noSourcesMessage,
      sources: [],
      tokensUsed: { input: 0, output: 0, total: 0 },
      model: 'none',
      conversationId: options.conversationId,
    }
  }

  // 3. Construire le contexte (bloquer si mode dégradé pour éviter les hallucinations)
  if (isDegradedMode) {
    // Enregistrer la métrique d'erreur
    const totalTimeMs = Date.now() - startTotal
    recordRAGMetric({
      searchTimeMs,
      llmTimeMs: 0,
      totalTimeMs,
      inputTokens: 0,
      outputTokens: 0,
      resultsCount: 0,
      cacheHit: false,
      degradedMode: true,
      provider: provider || 'unknown',
      error: 'Sources indisponibles - mode dégradé bloqué',
    })

    // Retourner un message explicite au lieu de throw (évite 500 error)
    const degradedLang = detectLanguage(question)
    const degradedMessage = degradedLang === 'fr'
      ? 'Les sources juridiques sont temporairement indisponibles. Veuillez réessayer dans quelques instants.'
      : 'المصادر القانونية غير متوفرة مؤقتًا. يرجى المحاولة مرة أخرى بعد قليل.'

    return {
      answer: degradedMessage,
      sources: [],
      tokensUsed: { input: 0, output: 0, total: 0 },
      model: 'degraded',
      conversationId: options.conversationId,
    }
  }

  // Détecter la langue de la question pour adapter les labels du contexte
  const questionLang = detectLanguage(question)
  const context = await buildContextFromSources(sources, questionLang)

  // Calculer métriques qualité et injecter avertissement si nécessaire
  const qualityMetrics = computeSourceQualityMetrics(sources)

  // B1: Abstention progressive — quality gate à 3 niveaux (zone grise 0.30-0.40)
  // < 0.30 → abstention directe (sources non pertinentes)
  // 0.30-0.40 → zone grise : accepté si ≥2 sources, sinon abstention
  // ≥ 0.40 → accepté (comportement standard)
  const avg = qualityMetrics.averageSimilarity
  const isHardAbstention = avg < 0.30
  const isGreyZone = avg >= 0.30 && avg < 0.40 && qualityMetrics.qualityLevel === 'low'
  const isGreyZoneAbstention = isGreyZone && sources.length < 2

  if (isHardAbstention || isGreyZoneAbstention) {
    const abstentionReason = isHardAbstention
      ? `Similarité ${Math.round(avg * 100)}% < 30% (sources non pertinentes)`
      : `Zone grise: similarité ${Math.round(avg * 100)}% (30-40%) avec seulement ${sources.length} source(s)`
    log.info(`[RAG] Abstention: ${abstentionReason}`)
    const abstentionMsg = questionLang === 'fr'
      ? 'Les documents disponibles ne traitent pas cette problématique avec suffisamment de précision pour formuler un avis juridique fiable. Je vous recommande de consulter directement les textes législatifs applicables ou un confrère spécialisé dans ce domaine.'
      : 'المصادر المتوفرة لا تعالج هذه المسألة بشكل كافٍ لإبداء رأي قانوني موثوق. أنصحك بالرجوع مباشرةً إلى النصوص التشريعية ذات الصلة، أو استشارة محامٍ متخصص للتعمق في هذه المسألة.'
    return {
      answer: abstentionMsg,
      sources: [],
      tokensUsed: { input: 0, output: 0, total: 0 },
      model: 'abstained',
      conversationId: options.conversationId,
      qualityIndicator: 'low',
      averageSimilarity: avg,
      abstentionReason,
    }
  }

  // Zone grise acceptée (0.30-0.40 avec ≥2 sources) → log avertissement
  if (isGreyZone) {
    log.info(`[RAG] Zone grise acceptée: similarité ${Math.round(avg * 100)}%, ${sources.length} sources — réponse avec avertissement`)
  }

  let contextWithWarning = context
  if (qualityMetrics.warningMessage) {
    contextWithWarning = `${qualityMetrics.warningMessage}\n\n---\n\n${context}`
    logger.warn('search', 'Low quality sources', {
      averageSimilarity: qualityMetrics.averageSimilarity,
      qualityLevel: qualityMetrics.qualityLevel,
    })
  }

  // Phase 3b: Avertissement conditionnel si domaine principal non couvert par les sources
  // Détection rapide basée sur les catégories des sources (pas d'appel LLM supplémentaire)
  const sourceCategories = new Set(
    sources.map(s => (s.metadata as Record<string, unknown>)?.category).filter(Boolean) as string[]
  )
  // Si toutes les sources proviennent d'un seul domaine et que la qualité est moyenne/basse,
  // injecter un avertissement pour déclencher le raisonnement conditionnel
  if (sources.length > 0 && qualityMetrics.qualityLevel !== 'high' && sourceCategories.size <= 1) {
    contextWithWarning = `⚠️ تنبيه: المصادر المتوفرة محدودة النطاق. استخدم الرأي المشروط وقدّم افتراضات بديلة إن لزم الأمر.\n\n${contextWithWarning}`
  }

  // 3b. Multi-Chain Reasoning (optionnel — activé via ENABLE_MULTI_CHAIN_CONSULTATION=true)
  // Déclenché uniquement pour les consultations formelles avec suffisamment de sources
  if (
    process.env.ENABLE_MULTI_CHAIN_CONSULTATION === 'true' &&
    options.operationName === 'dossiers-consultation' &&
    sources.length >= 3
  ) {
    try {
      const { multiChainReasoning } = await import('./multi-chain-legal-reasoning')
      const multiChainSources = sources.map((s) => ({
        id: s.documentId,
        content: s.chunkContent,
        category: (s.metadata?.category as string) || 'autre',
        metadata: s.metadata as Parameters<typeof multiChainReasoning>[0]['sources'][0]['metadata'],
      }))
      const mcResult = await multiChainReasoning({
        question,
        sources: multiChainSources,
        language: questionLang === 'fr' ? 'fr' : 'ar',
        usePremiumModel: options.usePremiumModel ?? false,
      })
      // Préfixer le contexte RAG avec l'analyse multi-chain
      contextWithWarning = `## Analyse Multi-Chain (Raisonnement juridique structuré)\n\n${mcResult.finalResponse}\n\n---\n\n${contextWithWarning}`
      logger.info('search', '[MultiChain] Raisonnement multi-chain intégré', {
        confidence: mcResult.overallConfidence,
        durationMs: mcResult.totalDurationMs,
        chains: mcResult.metadata.chainsExecuted,
      })
    } catch (mcError) {
      // Non-bloquant : si le multi-chain échoue, on continue sans lui
      log.error('[MultiChain] Erreur (non-bloquant):', mcError instanceof Error ? mcError.message : mcError)
    }
  }

  // 3. Récupérer l'historique avec résumé si conversation existante
  let conversationHistory: ConversationMessage[] = []
  let conversationSummary: string | null = null
  let totalMessageCount = 0

  if (options.conversationId) {
    const historyContext = await getConversationHistoryWithSummary(
      options.conversationId,
      SUMMARY_CONFIG.recentMessagesLimit
    )
    conversationHistory = historyContext.messages
    conversationSummary = historyContext.summary
    totalMessageCount = historyContext.totalCount
  }

  // Sélectionner le prompt système approprié selon le contexte
  // Par défaut: 'chat' si conversation, 'consultation' sinon
  const contextType: PromptContextType = options.contextType || (options.conversationId ? 'chat' : 'consultation')
  const supportedLang: SupportedLanguage = questionLang === 'fr' ? 'fr' : 'ar'
  const stance = options.stance ?? 'defense'
  const baseSystemPrompt = getSystemPromptForContext(contextType, supportedLang, stance)

  // 4. Construire les messages (format OpenAI-compatible pour Ollama/Groq)
  const messagesOpenAI: Array<{ role: 'user' | 'assistant' | 'system'; content: string }> = []

  // Injecter le résumé de la conversation si disponible (pour Ollama/Groq)
  if (conversationSummary) {
    messagesOpenAI.push({
      role: 'system',
      content: `[Résumé de la conversation précédente]\n${conversationSummary}`,
    })
  }

  // Ajouter l'historique de conversation récent
  for (const msg of conversationHistory) {
    messagesOpenAI.push({ role: msg.role, content: msg.content })
  }

  // Ajouter la nouvelle question avec le contexte (template bilingue)
  const msgTemplate = USER_MESSAGE_TEMPLATES[supportedLang]
  // Détecter si c'est un follow-up (au moins 1 échange Q+R précédent)
  const isFollowUp = contextType === 'chat' && conversationHistory.length >= 2
  const questionNumber = isFollowUp ? Math.floor(conversationHistory.length / 2) + 1 : null
  // Pour les follow-ups : instruction anti-répétition. Pour Q1 : instruction d'analyse.
  let analysisLine = ''
  if (contextType === 'chat') {
    if (isFollowUp) {
      analysisLine = `\n${msgTemplate.followUpHint}\n`
    } else {
      analysisLine = `\n${msgTemplate.analysisHint}\n`
    }
  }
  const questionPrefix = questionNumber ? `[Question ${questionNumber}]\n` : ''
  messagesOpenAI.push({
    role: 'user',
    content: `${msgTemplate.prefix}\n\n${contextWithWarning}\n${analysisLine}\n---\n\n${questionPrefix}${msgTemplate.questionLabel} ${question}`,
  })

  // Messages format Anthropic (sans 'system' dans les messages)
  const messagesAnthropic: Array<{ role: 'user' | 'assistant'; content: string }> = []
  for (const msg of conversationHistory) {
    messagesAnthropic.push({ role: msg.role, content: msg.content })
  }
  messagesAnthropic.push({
    role: 'user',
    content: `${msgTemplate.prefix}\n\n${contextWithWarning}\n${analysisLine}\n---\n\n${msgTemplate.questionLabel} ${question}`,
  })

  // Log si résumé utilisé
  if (conversationSummary) {
    log.info(`[RAG] Conversation ${options.conversationId}: résumé injecté (${totalMessageCount} messages total)`)
  }

  // Construire le système prompt avec résumé pour Anthropic
  const systemPromptWithSummary = conversationSummary
    ? `${baseSystemPrompt}\n\n[Résumé de la conversation précédente]\n${conversationSummary}`
    : baseSystemPrompt

  log.info(`[RAG] Utilisation du prompt structuré: contextType=${contextType}, langue=${supportedLang}`)

  let answer: string
  let tokensUsed: { input: number; output: number; total: number }
  let modelUsed: string
  let llmError: string | undefined
  let fallbackUsed = false

  // 5. Appeler le LLM avec fallback automatique sur erreur 429
  // Ollama est traité séparément (local, pas de fallback cloud)
  // Pour les autres: Groq → DeepSeek → Anthropic → OpenAI
  try {
    if (provider === 'ollama') {
      // Ollama (local, gratuit, illimité) - pas de fallback
      const client = getOllamaClient()

      // Adapter température selon le contexte (consultation = plus précis)
      const promptConfig = PROMPT_CONFIG[contextType]
      const temperature = options.temperature ?? promptConfig.temperature

      const response = await client.chat.completions.create({
        model: aiConfig.ollama.chatModelDefault,
        max_tokens: promptConfig.maxTokens,
        messages: [
          { role: 'system', content: baseSystemPrompt },
          ...messagesOpenAI,
        ],
        temperature,
      })

      answer = response.choices[0]?.message?.content || ''
      tokensUsed = {
        input: response.usage?.prompt_tokens || 0,
        output: response.usage?.completion_tokens || 0,
        total: response.usage?.total_tokens || 0,
      }
      modelUsed = `ollama/${aiConfig.ollama.chatModelDefault}`
    } else {
      // Utiliser le service de fallback pour les providers cloud
      // Convertir les messages au format LLMMessage
      const llmMessages: LLMMessage[] = messagesOpenAI.map((m) => ({
        role: m.role as 'user' | 'assistant' | 'system',
        content: m.content,
      }))

      // Adapter température et maxTokens selon le contexte
      const promptConfig = PROMPT_CONFIG[contextType]
      const temperature = options.temperature ?? promptConfig.temperature

      const llmResponse = await callLLMWithFallback(
        llmMessages,
        {
          temperature,
          maxTokens: promptConfig.maxTokens,
          systemPrompt: systemPromptWithSummary,
          context: 'rag-chat', // Stratégie optimisée : Gemini → DeepSeek → Ollama
          operationName: options.operationName, // Configuration par opération
        },
        options.usePremiumModel ?? false // Mode premium si demandé
      )

      answer = llmResponse.answer
      tokensUsed = llmResponse.tokensUsed
      modelUsed = llmResponse.modelUsed
      fallbackUsed = llmResponse.fallbackUsed

      // ✨ PHASE 5: Citation-First Enforcement
      // Valider que la réponse commence par une citation (seulement pour consultation, pas chat)
      if (contextType !== 'chat' && sources.length > 0) {
        const citationValidation = validateCitationFirst(answer)

        if (!citationValidation.valid) {
          log.warn(
            `[RAG] Citation-first violation detected: ${citationValidation.issue} ` +
            `(words before citation: ${citationValidation.metrics.wordsBeforeFirstCitation})`
          )

          // Conversion des sources au format attendu par l'enforcer
          const enforcerSources = sources.map((src, idx) => ({
            label: `[Source-${idx + 1}]`,
            content: src.chunkContent,
            title: src.documentName,
            category: src.metadata?.category as string | undefined,
          }))

          // Auto-correction
          const correctedAnswer = enforceCitationFirst(answer, enforcerSources)

          // Vérifier si correction réussie
          const correctedValidation = validateCitationFirst(correctedAnswer)

          if (correctedValidation.valid) {
            log.info(
              `[RAG] Citation-first enforced successfully ` +
              `(${citationValidation.issue} → valid)`
            )
            answer = correctedAnswer
          } else {
            log.warn(
              `[RAG] Citation-first enforcement partial ` +
              `(issue: ${correctedValidation.issue})`
            )
            // Utiliser réponse corrigée même si pas parfaite (mieux que rien)
            answer = correctedAnswer
          }
        } else {
          log.info(
            `[RAG] Citation-first validation passed ` +
            `(${citationValidation.metrics.totalCitations} citations, ` +
            `${citationValidation.metrics.wordsBeforeFirstCitation} words before first)`
          )
        }
      }

      // Log si fallback utilisé
      if (fallbackUsed && llmResponse.originalProvider) {
        log.info(
          `[RAG] Fallback LLM activé: ${llmResponse.originalProvider} → ${llmResponse.provider}`
        )
      }
    }
  } catch (error) {
    // Enregistrer l'erreur LLM dans les métriques
    const totalTimeMs = Date.now() - startTotal
    const llmTimeMs = totalTimeMs - searchTimeMs
    llmError = `LLM error: ${error instanceof Error ? error.message : String(error)}`

    recordRAGMetric({
      searchTimeMs,
      llmTimeMs,
      totalTimeMs,
      inputTokens: 0,
      outputTokens: 0,
      resultsCount: sources.length,
      cacheHit,
      degradedMode: isDegradedMode,
      provider: provider || 'unknown',
      error: llmError,
    })

    logger.error('llm', 'Erreur LLM - Tous providers épuisés', error)
    throw error // Re-throw pour que l'appelant puisse gérer
  }

  // Déclencher génération de résumé en async si seuil atteint
  if (options.conversationId && totalMessageCount >= SUMMARY_CONFIG.triggerMessageCount) {
    triggerSummaryGenerationIfNeeded(options.conversationId).catch((err) =>
      logger.error('llm', 'Erreur trigger résumé conversation', err)
    )
  }

  // Logging métriques RAG structuré
  const totalTimeMs = Date.now() - startTotal
  const llmTimeMs = totalTimeMs - searchTimeMs

  // Enregistrer dans le service de métriques
  recordRAGMetric({
    searchTimeMs,
    llmTimeMs,
    totalTimeMs,
    inputTokens: tokensUsed.input,
    outputTokens: tokensUsed.output,
    resultsCount: sources.length,
    cacheHit: cacheHit,
    degradedMode: isDegradedMode,
    provider: modelUsed,
  })

  log.info('RAG_METRICS', JSON.stringify({
    searchTimeMs,
    llmTimeMs,
    totalTimeMs,
    contextTokens: tokensUsed.input,
    outputTokens: tokensUsed.output,
    resultsCount: sources.length,
    degradedMode: isDegradedMode,
    provider: modelUsed,
    fallbackUsed,
    conversationId: options.conversationId || null,
    dossierId: options.dossierId || null,
  }))

  // Sanitizer: supprimer les citations inventées par le LLM
  answer = sanitizeCitations(answer, sources.length)

  // Phase 2.2+2.3 : Validation citations + détection abrogations (parallèle)
  let citationWarnings: string[] = []
  let abrogationWarnings: AbrogationWarning[] = []

  const [citationResult, abrogationResult] = await Promise.all([
    (process.env.ENABLE_CITATION_VALIDATION !== 'false')
      ? Promise.resolve(validateArticleCitations(answer, sources)).catch((error) => {
          logger.error('filter', 'Erreur validation citations', error)
          return null
        })
      : Promise.resolve(null),
    (process.env.ENABLE_ABROGATION_DETECTION !== 'false')
      ? detectAbrogatedReferences(answer, sources).catch((error) => {
          logger.error('abrogation', 'Erreur détection abrogations', error)
          return [] as AbrogationWarning[]
        })
      : Promise.resolve([] as AbrogationWarning[]),
  ])

  if (citationResult?.warnings?.length) {
    logger.warn('filter', 'Citations non vérifiées détectées', {
      count: citationResult.warnings.length,
      warnings: formatValidationWarnings(citationResult),
    })
    citationWarnings = citationResult.warnings.map(w => w.citation)
  }

  // Fix Feb 24, 2026 : disclaimer si citation_accuracy < 0.5 (citations invalides > 50%)
  // Jusque-là la validation était informative seulement — maintenant visible côté utilisateur
  if (citationResult && citationResult.totalCitations > 0) {
    const invalidCount = citationResult.invalidCitations.length
    const citationAccuracy = (citationResult.totalCitations - invalidCount) / citationResult.totalCitations
    if (citationAccuracy < 0.5) {
      const langForDisclaimer = detectLanguage(answer)
      const disclaimer = langForDisclaimer === 'ar'
        ? '\n\n⚠️ تنبيه: تعذّر التحقق من صحة بعض المراجع القانونية المذكورة في هذه الإجابة. يُرجى مراجعة النصوص الأصلية للتأكد من دقتها.'
        : '\n\n⚠️ Avertissement : certaines références juridiques citées dans cette réponse n\'ont pas pu être vérifiées. Veuillez consulter les textes originaux pour confirmation.'
      answer += disclaimer
      logger.warn('filter', `Citation accuracy faible (${(citationAccuracy * 100).toFixed(0)}%) — disclaimer ajouté`, {
        totalCitations: citationResult.totalCitations,
        invalidCitations: invalidCount,
      })
    }
  }

  // Sprint 4: logger les sources sans citation_locator (non auditables)
  if (citationResult?.locatorsMissing && citationResult.locatorsMissing.length > 0) {
    logger.warn('filter', 'Sources sans citation_locator (non auditables)', {
      count: citationResult.locatorsMissing.length,
      sources: citationResult.locatorsMissing,
    })
  }

  abrogationWarnings = abrogationResult || []
  if (abrogationWarnings.length > 0) {
    logger.warn('abrogation', 'Lois abrogées détectées dans la réponse', {
      count: abrogationWarnings.length,
      warnings: formatAbrogationWarnings(abrogationWarnings),
    })
  }

  // Phase 4: Claim verification — vérifier alignement claims↔sources
  if (process.env.ENABLE_CLAIM_VERIFICATION !== 'false') {
    try {
      const claimResult = verifyClaimSourceAlignment(answer, sources)
      if (claimResult.unsupportedClaims.length > 0) {
        const ratio = claimResult.totalClaims > 0
          ? claimResult.supportedClaims / claimResult.totalClaims
          : 1
        if (ratio < 0.7) {
          answer += '\n\n⚠️ تنبيه: بعض الاستنتاجات قد لا تكون مدعومة بشكل كافٍ بالمصادر المتوفرة. يُرجى التحقق.'
        }
        log.info(`[Claim Verify] ${claimResult.supportedClaims}/${claimResult.totalClaims} claims supportées`)
      }
    } catch (error) {
      log.error('[Claim Verify] Erreur:', error instanceof Error ? error.message : error)
    }
  }

  // Sprint 3 RAG Audit-Proof : détection cross-domaine + régénération automatique (1 tentative)
  let wasRegenerated = false
  let validationStatus: 'passed' | 'regenerated' | 'insufficient_sources' = 'passed'

  if (process.env.ENABLE_BRANCH_REGENERATION !== 'false') {
    try {
      // Le router est déjà appelé dans searchRelevantContext — cache Redis hit ici (~0ms)
      const { routeQuery } = await import('./legal-router-service')
      const routerForValidation = await routeQuery(question, { maxTracks: 1 })
      const allowedBranches = routerForValidation.allowedBranches

      if (allowedBranches && allowedBranches.length > 0) {
        const branchCheck = verifyBranchAlignment(sources, allowedBranches)

        if (branchCheck.violatingCount > 0) {
          log.warn(
            `[RAG Sprint3] ${branchCheck.violatingCount}/${branchCheck.totalSources} sources hors-domaine détectées:`,
            branchCheck.violatingSources.map(v => `${v.documentName} (branch=${v.branch})`).join(', ')
          )

          // Filtrer pour ne garder que sources dans le domaine autorisé
          const alignedSources = sources.filter(s => {
            const branch = s.metadata?.branch as string | undefined
            if (!branch || branch === 'autre') return true // pas de branch = on garde
            return allowedBranches.includes(branch)
          })

          if (alignedSources.length >= 2) {
            // Régénérer avec sources filtrées (appel LLM synchrone, 1 tentative max)
            const filteredContext = await buildContextFromSources(alignedSources, questionLang)
            const regenMessages: LLMMessage[] = [
              {
                role: 'user',
                content: `${msgTemplate.prefix}\n\n[تنبيه: تم استبعاد المصادر خارج النطاق القانوني للسؤال]\n\n${filteredContext}\n${analysisLine}\n---\n\n${msgTemplate.questionLabel} ${question}`,
              },
            ]
            const regenResponse = await callLLMWithFallback(regenMessages, {
              systemPrompt: systemPromptWithSummary,
              operationName: options.operationName,
            })
            answer = sanitizeCitations(regenResponse.answer, alignedSources.length)
            sources = alignedSources
            wasRegenerated = true
            validationStatus = 'regenerated'
            log.info('[RAG Sprint3] ✅ Réponse régénérée avec sources filtrées par domaine')
          } else {
            validationStatus = 'insufficient_sources'
            log.warn('[RAG Sprint3] Sources filtrées insuffisantes (<2) — pas de régénération')
          }
        }
      }
    } catch (error) {
      // Non-bloquant : si la régénération échoue, on garde la réponse originale
      log.error('[RAG Sprint3] Erreur validation branche:', error instanceof Error ? error.message : error)
    }
  }

  // Log métriques finales du pipeline complet
  logger.metrics({
    totalTimeMs: Date.now() - startTotal,
    searchTimeMs,
    sourcesCount: sources.length,
    tokensInput: tokensUsed.input,
    tokensOutput: tokensUsed.output,
    tokensTotal: tokensUsed.total,
    model: modelUsed,
    cacheHit,
    degradedMode: isDegradedMode,
    citationWarnings: citationWarnings.length,
    abrogationWarnings: abrogationWarnings.length,
    requestId: logger.getRequestId(),
  })

  return {
    answer,
    sources,
    tokensUsed,
    model: modelUsed,
    conversationId: options.conversationId,
    citationWarnings: citationWarnings.length > 0 ? citationWarnings : undefined,
    abrogationWarnings: abrogationWarnings.length > 0 ? abrogationWarnings : undefined,
    qualityIndicator: qualityMetrics.qualityLevel,
    averageSimilarity: qualityMetrics.averageSimilarity,
    wasRegenerated: wasRegenerated || undefined,
    validationStatus: validationStatus !== 'passed' ? validationStatus : undefined,
  }
}

/**
 * Répond à une question en streaming natif Gemini.
 *
 * Phase 1 : Pipeline RAG complet (non-streaming) → sources + contexte
 * Phase 2 : callLLMStream() → yield chunks texte en temps réel (Groq ou Gemini)
 * Phase 3 : Post-processing (sanitize citations, métriques)
 *
 * Format des événements :
 * - 'metadata' → sources trouvées, à envoyer en premier au client
 * - 'chunk'    → fragment de texte généré par Gemini
 * - 'done'     → fin du stream avec tokensUsed estimés
 * - 'error'    → erreur fatale (rate limit, timeout…)
 */
export async function* answerQuestionStream(
  question: string,
  userId: string,
  options: ChatOptions = {}
): AsyncGenerator<StreamChunk> {
  if (!isChatEnabled()) {
    yield { type: 'error', message: 'Chat IA désactivé (activer OLLAMA_ENABLED ou configurer GROQ_API_KEY)' }
    return
  }

  // 1. Phase RAG (non-streaming)
  yield { type: 'progress', step: 'searching' }
  let sources: ChatSource[] = []
  let streamSearchResult: SearchResult | null = null
  try {
    streamSearchResult = ENABLE_QUERY_EXPANSION
      ? await searchRelevantContextBilingual(question, userId, options)
      : await searchRelevantContext(question, userId, options)
    sources = streamSearchResult.sources
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : 'Erreur recherche contexte'
    log.error('[RAG Stream] Erreur recherche:', errMsg)
    yield { type: 'error', message: errMsg }
    return
  }

  const questionLang = detectLanguage(question)

  // Aucune source → réponse rapide sans appel LLM
  if (sources.length === 0) {
    log.warn(`[RAG Diagnostic Stream] 🔍 Aucune source trouvée pour requête:`, {
      queryLength: question.length,
      queryWords: question.trim().split(/\s+/).length,
      language: questionLang,
      condensationOccurred: streamSearchResult?.embeddingQuestion !== undefined && streamSearchResult.embeddingQuestion !== question,
      condensedQuery: streamSearchResult?.embeddingQuestion?.substring(0, 100),
      failureReason: streamSearchResult?.reason || 'unknown',
      queryPreview: question.substring(0, 100) + (question.length > 100 ? '...' : ''),
    })
    const noSourcesMsg = questionLang === 'fr'
      ? 'Ma base de connaissances ne contient pas de références directement applicables à cette question. Je vous oriente vers les textes officiels publiés au JORT ou vers un confrère spécialisé dans ce domaine.'
      : 'لا تتوفر لديّ في قاعدة المعرفة نصوص أو مراجع مرتبطة مباشرةً بهذه المسألة. أنصحك بمراجعة التشريعات الرسمية الصادرة في الرائد الرسمي، أو التواصل مع محامٍ متخصص في هذا المجال.'
    yield { type: 'metadata', sources: [], model: 'groq/llama-3.3-70b-versatile', qualityIndicator: 'low', averageSimilarity: 0 }
    yield { type: 'chunk', text: noSourcesMsg }
    yield { type: 'done', tokensUsed: { input: 0, output: 0, total: 0 } }
    return
  }

  // 2. Construire le contexte RAG
  const qualityMetrics = computeSourceQualityMetrics(sources)
  yield {
    type: 'progress',
    step: 'sources_found',
    count: sources.length,
    avgSimilarity: Math.round((qualityMetrics.averageSimilarity ?? 0) * 100),
    quality: qualityMetrics.qualityLevel,
  }
  const context = await buildContextFromSources(sources, questionLang)

  // B1: Abstention progressive en streaming — quality gate à 3 niveaux (zone grise 0.30-0.40)
  const streamAvg = qualityMetrics.averageSimilarity
  const streamIsHardAbstention = streamAvg < 0.30
  const streamIsGreyZone = streamAvg >= 0.30 && streamAvg < 0.40 && qualityMetrics.qualityLevel === 'low'
  const streamIsGreyZoneAbstention = streamIsGreyZone && sources.length < 2

  if (streamIsHardAbstention || streamIsGreyZoneAbstention) {
    const abstentionReason = streamIsHardAbstention
      ? `Similarité ${Math.round(streamAvg * 100)}% < 30%`
      : `Zone grise: similarité ${Math.round(streamAvg * 100)}% avec ${sources.length} source(s)`
    log.info(`[RAG Stream] Abstention: ${abstentionReason}`)
    const abstentionMsg = questionLang === 'fr'
      ? 'Les documents disponibles ne traitent pas cette problématique avec suffisamment de précision pour formuler un avis juridique fiable. Je vous recommande de consulter directement les textes législatifs applicables ou un confrère spécialisé dans ce domaine.'
      : 'المصادر المتوفرة لا تعالج هذه المسألة بشكل كافٍ لإبداء رأي قانوني موثوق. أنصحك بالرجوع مباشرةً إلى النصوص التشريعية ذات الصلة، أو استشارة محامٍ متخصص للتعمق في هذه المسألة.'
    yield { type: 'metadata', sources: [], model: 'abstained', qualityIndicator: 'low', averageSimilarity: streamAvg }
    yield { type: 'chunk', text: abstentionMsg }
    yield { type: 'done', tokensUsed: { input: 0, output: 0, total: 0 } }
    return
  }

  if (streamIsGreyZone) {
    log.info(`[RAG Stream] Zone grise acceptée: similarité ${Math.round(streamAvg * 100)}%, ${sources.length} sources`)
  }

  const contextWithWarning = qualityMetrics.warningMessage
    ? `${qualityMetrics.warningMessage}\n\n---\n\n${context}`
    : context

  // 3. Historique conversation
  let conversationHistory: ConversationMessage[] = []
  let conversationSummary: string | null = null
  if (options.conversationId) {
    const historyContext = await getConversationHistoryWithSummary(
      options.conversationId,
      SUMMARY_CONFIG.recentMessagesLimit
    )
    conversationHistory = historyContext.messages
    conversationSummary = historyContext.summary
  }

  // 4. Construire messages
  const contextType: PromptContextType = options.contextType || (options.conversationId ? 'chat' : 'consultation')
  const supportedLang: SupportedLanguage = questionLang === 'fr' ? 'fr' : 'ar'
  const stance = options.stance ?? 'defense'
  const baseSystemPrompt = getSystemPromptForContext(contextType, supportedLang, stance)
  const systemPrompt = conversationSummary
    ? `${baseSystemPrompt}\n\n[Résumé de la conversation précédente]\n${conversationSummary}`
    : baseSystemPrompt

  const messagesForLLM: Array<{ role: string; content: string }> = []
  for (const msg of conversationHistory) {
    messagesForLLM.push({ role: msg.role, content: msg.content })
  }
  const msgTemplate = USER_MESSAGE_TEMPLATES[supportedLang]
  // Détecter si c'est un follow-up (au moins 1 échange Q+R précédent)
  const isFollowUp = contextType === 'chat' && conversationHistory.length >= 2
  const questionNumber = isFollowUp ? Math.floor(conversationHistory.length / 2) + 1 : null
  // Pour les follow-ups : instruction anti-répétition. Pour Q1 : instruction d'analyse.
  let analysisLine = ''
  if (contextType === 'chat') {
    if (isFollowUp) {
      analysisLine = `\n${msgTemplate.followUpHint}\n`
    } else {
      analysisLine = `\n${msgTemplate.analysisHint}\n`
    }
  }
  const questionPrefix = questionNumber ? `[Question ${questionNumber}]\n` : ''
  messagesForLLM.push({
    role: 'user',
    content: `${msgTemplate.prefix}\n\n${contextWithWarning}\n${analysisLine}\n---\n\n${questionPrefix}${msgTemplate.questionLabel} ${question}`,
  })

  // 5. Yield metadata (sources disponibles avant le stream LLM)
  const opName = options.operationName ?? 'assistant-ia'
  const streamProvider = getOperationProvider(opName)
  const streamModel = getOperationModel(opName)
  const modelName = `${streamProvider}/${streamModel}`
  yield {
    type: 'metadata',
    sources,
    model: modelName,
    qualityIndicator: qualityMetrics.qualityLevel,
    averageSimilarity: qualityMetrics.averageSimilarity,
  }

  // 6. Stream LLM → yield chunks (Groq ou Gemini selon operations-config)
  yield { type: 'progress', step: 'generating' }
  const promptConfig = PROMPT_CONFIG[contextType]
  let fullText = ''
  const streamUsage: StreamTokenUsage = { input: 0, output: 0, total: 0 }
  try {
    const streamGen = callLLMStream(messagesForLLM, {
      temperature: options.temperature ?? promptConfig.temperature,
      maxTokens: promptConfig.maxTokens,
      operationName: options.operationName ?? 'assistant-ia',
      systemInstruction: systemPrompt,
    }, streamUsage)

    for await (const chunk of streamGen) {
      fullText += chunk
      yield { type: 'chunk', text: chunk }
    }
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : 'Erreur streaming LLM'
    log.error('[RAG Stream] Erreur streaming:', errMsg)
    yield { type: 'error', message: errMsg }
    return
  }

  // 7. Post-processing : sanitize citations
  fullText = sanitizeCitations(fullText, sources.length)

  // Tokens : utiliser les stats réelles Groq si disponibles, sinon estimation
  const tokensUsed = streamUsage.total > 0
    ? streamUsage
    : { input: 0, output: Math.ceil(fullText.length / 4), total: Math.ceil(fullText.length / 4) }

  yield { type: 'done', tokensUsed }
}
