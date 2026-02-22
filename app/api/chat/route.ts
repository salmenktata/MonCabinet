/**
 * API Route: Chat avec l'assistant IA Qadhya
 *
 * POST /api/chat
 * - Envoie une question à l'assistant
 * - Retourne la réponse avec les sources
 *
 * GET /api/chat?dossierId=xxx
 * - Récupère les conversations d'un utilisateur (optionnel: filtre par dossier)
 */

import { NextRequest, NextResponse } from 'next/server'

// Force dynamic rendering - pas de prérendu statique
export const dynamic = 'force-dynamic'

import { getSession } from '@/lib/auth/session'
import { db } from '@/lib/db/postgres'
import {
  answerQuestion,
  answerQuestionStream,
  createConversation,
  saveMessage,
  getUserConversations,
  generateConversationTitle,
  ChatSource,
} from '@/lib/ai/rag-chat-service'
import { isChatEnabled, getChatProvider } from '@/lib/ai/config'
import { triggerSummaryGenerationIfNeeded } from '@/lib/ai/conversation-summary-service'
import { createAIStream } from '@/lib/ai/streaming-service'
import { scheduleHallucinationCheck } from '@/lib/ai/hallucination-monitor-service'
import { trackConversationCost } from '@/lib/ai/conversation-cost-service'
import { detectAbrogations, type AbrogationAlert } from '@/lib/legal/abrogation-detector-service'
import { structurerDossier } from '@/lib/ai/dossier-structuring-service'

// =============================================================================
// TYPES
// =============================================================================

import type { DocumentType } from '@/lib/categories/doc-types'
import type { LegalStance } from '@/lib/ai/legal-reasoning-prompts'

interface ChatRequestBody {
  question: string
  dossierId?: string
  conversationId?: string
  includeJurisprudence?: boolean
  stream?: boolean // Activer le streaming
  usePremiumModel?: boolean // Mode Premium: cloud providers au lieu d'Ollama
  actionType?: 'chat' | 'structure' | 'consult' // Nouveau: type d'action pour interface unifiée
  docType?: DocumentType // Nouveau: filtrer recherche KB par type de document
  stance?: LegalStance // Mode Avocat Stratège : défense / attaque / neutre
}

interface ChatApiResponse {
  answer: string
  sources: ChatSource[]
  conversationId: string
  tokensUsed: {
    input: number
    output: number
    total: number
  }
  abrogationAlerts?: AbrogationAlert[] // Phase 3.4 - Alertes abrogations détectées dans la question
  qualityIndicator?: 'high' | 'medium' | 'low'
  averageSimilarity?: number
}

// =============================================================================
// HELPER : TIMEOUT
// =============================================================================

/**
 * Wrapper Promise avec timeout.
 * Utilisé pour limiter la durée globale des appels LLM (44s < timeout Nginx 60s).
 */
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`Timeout ${label} après ${ms}ms`)), ms)
    ),
  ])
}

// =============================================================================
// HANDLERS PAR ACTION TYPE
// =============================================================================

/**
 * Handler pour action 'structure' - Structuration de dossier
 */
async function handleStructureAction(
  narratif: string,
  userId: string,
  conversationId: string
) {
  // Appeler le service de structuration
  const structured = await structurerDossier(narratif, userId)

  // Retourner au format JSON pour sauvegarder dans le message
  return {
    answer: JSON.stringify(structured, null, 2),
    sources: [],
    tokensUsed: { input: 0, output: 0, total: 0 },
    model: 'structuration',
    metadata: { actionType: 'structure' },
  }
}

/**
 * Handler pour action 'consult' - Consultation juridique
 */
async function handleConsultAction(
  question: string,
  userId: string,
  conversationId: string,
  dossierId?: string,
  docType?: DocumentType,
  stance?: LegalStance
) {
  // Utiliser answerQuestion avec configuration optimisée pour consultation
  const response = await answerQuestion(question, userId, {
    dossierId,
    conversationId,
    includeJurisprudence: true,
    usePremiumModel: false,
    operationName: 'dossiers-consultation', // Configuration IRAC formelle
    docType,
    stance,
  })

  return {
    answer: response.answer,
    sources: response.sources,
    tokensUsed: response.tokensUsed,
    model: response.model,
    metadata: { actionType: 'consult', stance },
    qualityIndicator: response.qualityIndicator,
    averageSimilarity: response.averageSimilarity,
    abstentionReason: response.abstentionReason,
  }
}

/**
 * Handler pour action 'chat' - Conversation normale
 */
async function handleChatAction(
  question: string,
  userId: string,
  conversationId: string,
  dossierId?: string,
  includeJurisprudence = true,
  usePremiumModel = false,
  docType?: DocumentType,
  stance?: LegalStance
) {
  const response = await answerQuestion(question, userId, {
    dossierId,
    conversationId,
    includeJurisprudence,
    usePremiumModel,
    operationName: 'assistant-ia',
    docType,
    stance,
  })

  return {
    answer: response.answer,
    sources: response.sources,
    tokensUsed: response.tokensUsed,
    model: response.model,
    metadata: { actionType: 'chat', stance },
    qualityIndicator: response.qualityIndicator,
    averageSimilarity: response.averageSimilarity,
    abstentionReason: response.abstentionReason,
  }
}

// =============================================================================
// POST: Envoyer une question au chat
// =============================================================================

export async function POST(
  request: NextRequest
): Promise<Response | NextResponse<ChatApiResponse | { error: string }>> {
  try {
    // Vérifier authentification
    const session = await getSession()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
    }

    const userId = session.user.id

    // Vérifier que le chat est activé
    if (!isChatEnabled()) {
      return NextResponse.json(
        {
          error: 'Chat IA désactivé. Configurez au moins un provider: GROQ_API_KEY, GOOGLE_API_KEY, DEEPSEEK_API_KEY, ou OLLAMA_ENABLED=true'
        },
        { status: 503 }
      )
    }

    // Parse le body
    const body: ChatRequestBody = await request.json()
    const {
      question,
      dossierId,
      conversationId,
      includeJurisprudence = true,
      stream = false,
      usePremiumModel = false,
      actionType = 'chat', // Par défaut: conversation normale
      docType, // Nouveau: filtrage par type de document
      stance, // Mode Avocat Stratège
    } = body

    if (!question || question.trim().length < 3) {
      return NextResponse.json(
        { error: 'Question trop courte (min 3 caractères)' },
        { status: 400 }
      )
    }

    // Vérifier le quota IA de l'utilisateur
    const quotaCheck = await checkAndIncrementQuota(userId)
    if (!quotaCheck.allowed) {
      return NextResponse.json(
        {
          error: `Quota mensuel atteint (${quotaCheck.used}/${quotaCheck.limit} requêtes). Réinitialisation le ${quotaCheck.resetDate}`,
        },
        { status: 429 }
      )
    }

    // Si dossierId fourni, vérifier que l'utilisateur y a accès
    if (dossierId) {
      const dossierCheck = await db.query(
        `SELECT id FROM dossiers WHERE id = $1 AND user_id = $2`,
        [dossierId, userId]
      )
      if (dossierCheck.rows.length === 0) {
        return NextResponse.json(
          { error: 'Dossier non trouvé ou accès non autorisé' },
          { status: 403 }
        )
      }
    }

    // Créer ou récupérer la conversation
    let activeConversationId = conversationId

    if (!activeConversationId) {
      // Créer une nouvelle conversation
      activeConversationId = await createConversation(userId, dossierId)
    } else {
      // Vérifier que la conversation appartient à l'utilisateur
      const convCheck = await db.query(
        `SELECT id FROM chat_conversations WHERE id = $1 AND user_id = $2`,
        [activeConversationId, userId]
      )
      if (convCheck.rows.length === 0) {
        // Créer une nouvelle conversation si l'ancienne n'existe pas
        activeConversationId = await createConversation(userId, dossierId)
      }
    }

    // Sauvegarder la question utilisateur
    await saveMessage(activeConversationId, 'user', question)

    // Phase 3.4 : Détecter les références à des lois abrogées dans la question
    let abrogationAlerts: AbrogationAlert[] = []
    try {
      abrogationAlerts = await detectAbrogations(question, {
        threshold: 0.5, // Similarité fuzzy search
        minConfidence: 0.6, // Confiance détection référence
      })

      if (abrogationAlerts.length > 0) {
        console.log(`[Chat API] ${abrogationAlerts.length} alerte(s) d'abrogation détectée(s) dans la question`)
      }
    } catch (error) {
      console.error('[Chat API] Erreur détection abrogations:', error)
      // Ne pas bloquer le chat si la détection échoue
    }

    // Si streaming activé, retourner un ReadableStream
    // Note: streaming temporairement désactivé pour structure/consult
    if (stream && actionType === 'chat') {
      return handleStreamingResponse(
        question,
        userId,
        activeConversationId,
        dossierId,
        includeJurisprudence,
        usePremiumModel,
        docType,
        stance
      )
    }

    // Router selon le type d'action
    let response: {
      answer: string
      sources: ChatSource[]
      tokensUsed: { input: number; output: number; total: number }
      model: string
      metadata?: Record<string, any>
      qualityIndicator?: 'high' | 'medium' | 'low'
      averageSimilarity?: number
      abstentionReason?: string
    }

    // Timeout global 44s (< timeout Nginx 60s) pour éviter les blocages Gemini
    const ACTION_TIMEOUT_MS = 44000

    try {
      switch (actionType) {
        case 'structure':
          response = await withTimeout(
            handleStructureAction(question, userId, activeConversationId),
            ACTION_TIMEOUT_MS,
            'structure'
          )
          break
        case 'consult':
          response = await withTimeout(
            handleConsultAction(question, userId, activeConversationId, dossierId, docType, stance),
            ACTION_TIMEOUT_MS,
            'consult'
          )
          break
        default:
          response = await withTimeout(
            handleChatAction(question, userId, activeConversationId, dossierId, includeJurisprudence, usePremiumModel, docType, stance),
            ACTION_TIMEOUT_MS,
            'chat'
          )
          break
      }
    } catch (timeoutError) {
      if (timeoutError instanceof Error && timeoutError.message.startsWith('Timeout')) {
        console.error('[Chat API] Timeout:', timeoutError.message)
        return NextResponse.json(
          { error: 'La réponse a pris trop de temps (timeout 44s). Veuillez réessayer.' },
          { status: 504 }
        )
      }
      throw timeoutError
    }

    // Sauvegarder la réponse assistant avec metadata
    await saveMessage(
      activeConversationId,
      'assistant',
      response.answer,
      response.sources,
      response.tokensUsed.total,
      response.model,
      response.metadata // Phase 8: Sauvegarder actionType dans metadata
    )

    // B2: Suivi hallucination asynchrone (10% échantillonnage, fire-and-forget)
    scheduleHallucinationCheck(
      activeConversationId,
      undefined,
      question,
      response.answer,
      response.sources,
      response.model
    )

    // E1: Tracking coût conversation (fire-and-forget)
    if (response.tokensUsed.total > 0 && response.model !== 'abstained') {
      trackConversationCost({
        conversationId: activeConversationId,
        userId,
        provider: (response.model?.includes('gemini') ? 'gemini' : 'groq') as any,
        model: response.model || 'unknown',
        inputTokens: response.tokensUsed.input,
        outputTokens: response.tokensUsed.output,
        operationType: 'chat',
      }).catch(err => console.error('[Chat API] Erreur cost tracking:', err))
    }

    // Générer un titre si c'est le premier échange
    const messageCount = await db.query(
      `SELECT COUNT(*) as count FROM chat_messages WHERE conversation_id = $1`,
      [activeConversationId]
    )
    const msgCount = parseInt(messageCount.rows[0]?.count || '0', 10) || 0

    if (msgCount <= 2) {
      const title = await generateConversationTitle(activeConversationId)
      await db.query(
        `UPDATE chat_conversations SET title = $1 WHERE id = $2`,
        [title, activeConversationId]
      )
    }

    // Déclencher génération de résumé en async si seuil atteint (10+ messages)
    if (msgCount >= 10) {
      triggerSummaryGenerationIfNeeded(activeConversationId).catch((err) =>
        console.error('[Chat API] Erreur trigger résumé:', err)
      )
    }

    return NextResponse.json({
      answer: response.answer,
      sources: response.sources,
      conversationId: activeConversationId,
      tokensUsed: response.tokensUsed,
      abrogationAlerts: abrogationAlerts.length > 0 ? abrogationAlerts : undefined,
      qualityIndicator: response.qualityIndicator,
      averageSimilarity: response.averageSimilarity,
      abstentionReason: response.abstentionReason,
    })
  } catch (error) {
    console.error('Erreur chat:', error)
    const message = error instanceof Error ? error.message : 'Erreur inconnue'

    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// =============================================================================
// GET: Récupérer les conversations
// =============================================================================

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await getSession()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
    }

    const userId = session.user.id
    const searchParams = request.nextUrl.searchParams
    const dossierId = searchParams.get('dossierId')
    const conversationId = searchParams.get('conversationId')
    const actionType = searchParams.get('actionType') as 'chat' | 'structure' | 'consult' | null

    // Si conversationId fourni, retourner les messages de cette conversation
    if (conversationId) {
      // Vérifier accès
      const convCheck = await db.query(
        `SELECT c.id, c.title, c.dossier_id, d.numero as dossier_numero, c.created_at
         FROM chat_conversations c
         LEFT JOIN dossiers d ON c.dossier_id = d.id
         WHERE c.id = $1 AND c.user_id = $2`,
        [conversationId, userId]
      )

      if (convCheck.rows.length === 0) {
        return NextResponse.json(
          { error: 'Conversation non trouvée' },
          { status: 404 }
        )
      }

      // Récupérer les messages
      const messagesResult = await db.query(
        `SELECT id, role, content, sources, tokens_used, metadata, created_at
         FROM chat_messages
         WHERE conversation_id = $1
         ORDER BY created_at ASC`,
        [conversationId]
      )

      return NextResponse.json({
        conversation: convCheck.rows[0],
        messages: messagesResult.rows.map((m) => ({
          id: m.id,
          role: m.role,
          content: m.content,
          sources: m.sources,
          tokensUsed: m.tokens_used,
          metadata: m.metadata,
          createdAt: m.created_at,
        })),
      })
    }

    // Sinon, lister les conversations
    const conversations = await getUserConversations(
      userId,
      dossierId || undefined,
      30,
      actionType || undefined
    )

    return NextResponse.json({ conversations })
  } catch (error) {
    console.error('Erreur récupération conversations:', error)
    return NextResponse.json(
      { error: 'Erreur récupération conversations' },
      { status: 500 }
    )
  }
}

// =============================================================================
// PATCH: Mettre à jour conversation (titre)
// =============================================================================

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await getSession()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
    }

    const userId = session.user.id
    const searchParams = request.nextUrl.searchParams
    const conversationId = searchParams.get('conversationId')

    if (!conversationId) {
      return NextResponse.json(
        { error: 'conversationId requis' },
        { status: 400 }
      )
    }

    const body = await request.json()

    if (!body.title || typeof body.title !== 'string') {
      return NextResponse.json(
        { error: 'Titre invalide' },
        { status: 400 }
      )
    }

    const result = await db.query(
      `UPDATE chat_conversations
       SET title = $1, updated_at = NOW()
       WHERE id = $2 AND user_id = $3
       RETURNING *`,
      [body.title, conversationId, userId]
    )

    if (result.rowCount === 0) {
      return NextResponse.json(
        { error: 'Conversation non trouvée' },
        { status: 404 }
      )
    }

    return NextResponse.json(result.rows[0])
  } catch (error) {
    console.error('Erreur mise à jour conversation:', error)
    return NextResponse.json(
      { error: 'Erreur mise à jour conversation' },
      { status: 500 }
    )
  }
}

// =============================================================================
// DELETE: Supprimer une conversation
// =============================================================================

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await getSession()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
    }

    const userId = session.user.id
    const searchParams = request.nextUrl.searchParams
    const conversationId = searchParams.get('conversationId')

    if (!conversationId) {
      return NextResponse.json(
        { error: 'conversationId requis' },
        { status: 400 }
      )
    }

    const result = await db.query(
      `DELETE FROM chat_conversations
       WHERE id = $1 AND user_id = $2
       RETURNING id`,
      [conversationId, userId]
    )

    if (result.rowCount === 0) {
      return NextResponse.json(
        { error: 'Conversation non trouvée' },
        { status: 404 }
      )
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Erreur suppression conversation:', error)
    return NextResponse.json(
      { error: 'Erreur suppression conversation' },
      { status: 500 }
    )
  }
}

// =============================================================================
// HELPER: Gérer le streaming de la réponse
// =============================================================================

async function handleStreamingResponse(
  question: string,
  userId: string,
  conversationId: string,
  dossierId?: string,
  includeJurisprudence: boolean = true,
  usePremiumModel: boolean = false,
  docType?: DocumentType,
  stance?: LegalStance
): Promise<Response> {
  const encoder = new TextEncoder()

  // Streaming natif Gemini via answerQuestionStream()
  const generator = answerQuestionStream(question, userId, {
    dossierId,
    conversationId,
    includeJurisprudence,
    usePremiumModel,
    operationName: 'assistant-ia',
    docType,
    stance,
  })

  let savedSources: ChatSource[] = []
  let savedModel = 'gemini'
  let fullAnswer = ''

  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const event of generator) {
          if (event.type === 'metadata') {
            savedSources = event.sources
            savedModel = event.model
            // Envoyer les métadonnées en premier (sources disponibles dès la fin du RAG)
            const metadata = {
              type: 'metadata',
              conversationId,
              sources: event.sources,
              model: event.model,
              stance,
            }
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(metadata)}\n\n`))
          } else if (event.type === 'chunk') {
            fullAnswer += event.text
            const chunk = { type: 'content', content: event.text }
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`))
          } else if (event.type === 'done') {
            const done = { type: 'done', tokensUsed: event.tokensUsed }
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(done)}\n\n`))
            controller.close()

            // Post-stream : sauvegarder la réponse complète
            await saveMessage(
              conversationId,
              'assistant',
              fullAnswer,
              savedSources,
              event.tokensUsed.total,
              savedModel,
              { actionType: 'chat', stance } // Sauvegarder actionType + stance pour le filtre historique
            )

            // B2: Suivi hallucination asynchrone (10% échantillonnage, fire-and-forget)
            scheduleHallucinationCheck(
              conversationId,
              undefined,
              question,
              fullAnswer,
              savedSources,
              savedModel
            )

            // E1: Tracking coût conversation (fire-and-forget)
            if (event.tokensUsed.total > 0 && savedModel !== 'abstained') {
              trackConversationCost({
                conversationId,
                userId,
                provider: (savedModel?.includes('gemini') ? 'gemini' : 'groq') as any,
                model: savedModel || 'unknown',
                inputTokens: event.tokensUsed.input,
                outputTokens: event.tokensUsed.output,
                operationType: 'chat',
              }).catch(err => console.error('[Stream] Erreur cost tracking:', err))
            }

            // Générer titre si premier échange
            const messageCount = await db.query(
              `SELECT COUNT(*) as count FROM chat_messages WHERE conversation_id = $1`,
              [conversationId]
            )
            const msgCount = parseInt(messageCount.rows[0]?.count || '0', 10) || 0

            if (msgCount <= 2) {
              const title = await generateConversationTitle(conversationId)
              await db.query(
                `UPDATE chat_conversations SET title = $1 WHERE id = $2`,
                [title, conversationId]
              )
            }

            if (msgCount >= 10) {
              triggerSummaryGenerationIfNeeded(conversationId).catch((err) =>
                console.error('[Stream] Erreur trigger résumé:', err)
              )
            }
          } else if (event.type === 'error') {
            const errorMessage = { type: 'error', error: event.message }
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(errorMessage)}\n\n`))
            controller.close()
          }
        }
      } catch (error) {
        const errorMessage = {
          type: 'error',
          error: error instanceof Error ? error.message : 'Erreur inconnue',
        }
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(errorMessage)}\n\n`))
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
}

// =============================================================================
// HELPER: Vérifier et incrémenter le quota
// =============================================================================

async function checkAndIncrementQuota(userId: string): Promise<{
  allowed: boolean
  used: number
  limit: number
  resetDate: string
}> {
  const now = new Date()
  const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1)

  // Une seule requête UPSERT avec RETURNING
  const result = await db.query(
    `INSERT INTO feature_flags (user_id, monthly_ai_queries_used, quota_reset_date)
     VALUES ($1, 1, $2)
     ON CONFLICT (user_id) DO UPDATE SET
       monthly_ai_queries_used = CASE
         WHEN feature_flags.quota_reset_date < $2 THEN 1
         ELSE feature_flags.monthly_ai_queries_used + 1
       END,
       quota_reset_date = CASE
         WHEN feature_flags.quota_reset_date < $2 THEN $2
         ELSE feature_flags.quota_reset_date
       END
     RETURNING monthly_ai_queries_limit, monthly_ai_queries_used, quota_reset_date`,
    [userId, currentMonthStart.toISOString()]
  )

  const flags = result.rows[0]
  const limit = flags.monthly_ai_queries_limit
  const used = flags.monthly_ai_queries_used
  const resetDate = new Date(flags.quota_reset_date)

  // Vérifier si quota dépassé (on a déjà incrémenté, donc on compare avec >)
  if (used > limit) {
    return {
      allowed: false,
      used: used - 1, // Retourner la valeur avant incrémentation
      limit,
      resetDate: getNextMonthDate(resetDate),
    }
  }

  return {
    allowed: true,
    used,
    limit,
    resetDate: getNextMonthDate(resetDate),
  }
}

function getNextMonthDate(date: Date): string {
  const next = new Date(date)
  next.setMonth(next.getMonth() + 1)
  return next.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })
}
