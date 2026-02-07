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
  createConversation,
  saveMessage,
  getUserConversations,
  generateConversationTitle,
  ChatSource,
} from '@/lib/ai/rag-chat-service'
import { isChatEnabled } from '@/lib/ai/config'
import { triggerSummaryGenerationIfNeeded } from '@/lib/ai/conversation-summary-service'

// =============================================================================
// TYPES
// =============================================================================

interface ChatRequestBody {
  question: string
  dossierId?: string
  conversationId?: string
  includeJurisprudence?: boolean
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
}

// =============================================================================
// POST: Envoyer une question au chat
// =============================================================================

export async function POST(
  request: NextRequest
): Promise<NextResponse<ChatApiResponse | { error: string }>> {
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
        { error: 'Chat IA désactivé (ANTHROPIC_API_KEY manquant)' },
        { status: 503 }
      )
    }

    // Parse le body
    const body: ChatRequestBody = await request.json()
    const { question, dossierId, conversationId, includeJurisprudence = true } = body

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

    // Obtenir la réponse du RAG
    const response = await answerQuestion(question, userId, {
      dossierId,
      conversationId: activeConversationId,
      includeJurisprudence,
    })

    // Sauvegarder la réponse assistant
    await saveMessage(
      activeConversationId,
      'assistant',
      response.answer,
      response.sources,
      response.tokensUsed.total,
      response.model
    )

    // Générer un titre si c'est le premier échange
    const messageCount = await db.query(
      `SELECT COUNT(*) as count FROM chat_messages WHERE conversation_id = $1`,
      [activeConversationId]
    )
    const msgCount = parseInt(messageCount.rows[0].count)

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
        `SELECT id, role, content, sources, tokens_used, created_at
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
          createdAt: m.created_at,
        })),
      })
    }

    // Sinon, lister les conversations
    const conversations = await getUserConversations(
      userId,
      dossierId || undefined,
      30
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
