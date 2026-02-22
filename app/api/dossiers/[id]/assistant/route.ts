/**
 * API Route: Assistant Analyse Dossier
 *
 * POST /api/dossiers/[id]/assistant
 * - Analyse approfondie d'un dossier juridique
 * - Utilise OpenAI embeddings 1536-dim pour qualité maximale
 * - Utilise Gemini LLM pour contexte étendu (1M tokens)
 *
 * Configuration : operationName = 'dossiers-assistant'
 * - Provider LLM : Gemini → Groq → DeepSeek
 * - Provider Embeddings : OpenAI 1536-dim (qualité max)
 * - Timeout : 30s
 * - Temperature : 0.2 (précis et factuel)
 */

import { NextRequest, NextResponse } from 'next/server'

// Force dynamic rendering
export const dynamic = 'force-dynamic'

import { getSession } from '@/lib/auth/session'
import { db } from '@/lib/db/postgres'
import {
  answerQuestion,
  ChatSource,
} from '@/lib/ai/rag-chat-service'
import type { LegalStance } from '@/lib/ai/legal-reasoning-prompts'

// =============================================================================
// TYPES
// =============================================================================

interface AssistantRequestBody {
  question: string
  conversationId?: string
  includeJurisprudence?: boolean
  usePremiumModel?: boolean
  stance?: LegalStance
}

interface AssistantApiResponse {
  answer: string
  sources: ChatSource[]
  conversationId?: string
  tokensUsed: {
    input: number
    output: number
    total: number
  }
  model: string
}

// =============================================================================
// POST: Analyser un dossier
// =============================================================================

export async function POST(
  request: NextRequest,
  props: { params: Promise<{ id: string }> }
): Promise<NextResponse<AssistantApiResponse | { error: string }>> {
  try {
    // Vérifier authentification
    const session = await getSession()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
    }

    const userId = session.user.id
    const params = await props.params
    const dossierId = params.id

    // Parse le body
    const body: AssistantRequestBody = await request.json()
    const {
      question,
      conversationId,
      includeJurisprudence = true, // Activé par défaut pour analyse dossier
      usePremiumModel = false,
      stance = 'defense',
    } = body

    if (!question || question.trim().length < 3) {
      return NextResponse.json(
        { error: 'Question trop courte (min 3 caractères)' },
        { status: 400 }
      )
    }

    // Vérifier que le dossier appartient à l'utilisateur
    const dossierCheck = await db.query(
      `SELECT id, numero, titre FROM dossiers WHERE id = $1 AND user_id = $2`,
      [dossierId, userId]
    )

    if (dossierCheck.rows.length === 0) {
      return NextResponse.json(
        { error: 'Dossier non trouvé ou accès non autorisé' },
        { status: 403 }
      )
    }

    const dossier = dossierCheck.rows[0]

    console.log(
      `[Assistant Dossier] Analyse dossier #${dossier.numero} - "${question.substring(0, 50)}..."`
    )

    // Appeler le service RAG avec configuration dossiers-assistant
    const response = await answerQuestion(question, userId, {
      dossierId,
      conversationId,
      includeJurisprudence,
      usePremiumModel,
      operationName: 'dossiers-assistant', // ← Configuration analyse approfondie
      contextType: 'chat', // Format conversationnel
      stance,
    })

    return NextResponse.json({
      answer: response.answer,
      sources: response.sources,
      conversationId: response.conversationId,
      tokensUsed: response.tokensUsed,
      model: response.model,
    })
  } catch (error) {
    console.error('[Assistant Dossier] Erreur:', error)
    const message = error instanceof Error ? error.message : 'Erreur inconnue'

    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// =============================================================================
// GET: Récupérer l'historique des analyses d'un dossier (optionnel)
// =============================================================================

export async function GET(
  request: NextRequest,
  props: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const session = await getSession()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
    }

    const userId = session.user.id
    const params = await props.params
    const dossierId = params.id

    // Vérifier accès dossier
    const dossierCheck = await db.query(
      `SELECT id FROM dossiers WHERE id = $1 AND user_id = $2`,
      [dossierId, userId]
    )

    if (dossierCheck.rows.length === 0) {
      return NextResponse.json(
        { error: 'Dossier non trouvé' },
        { status: 404 }
      )
    }

    // Récupérer les conversations liées au dossier
    const conversations = await db.query(
      `SELECT
        c.id,
        c.title,
        c.created_at,
        c.updated_at,
        COUNT(m.id) as message_count
       FROM chat_conversations c
       LEFT JOIN chat_messages m ON c.id = m.conversation_id
       WHERE c.dossier_id = $1 AND c.user_id = $2
       GROUP BY c.id, c.title, c.created_at, c.updated_at
       ORDER BY c.updated_at DESC
       LIMIT 20`,
      [dossierId, userId]
    )

    return NextResponse.json({
      conversations: conversations.rows.map((c) => ({
        id: c.id,
        title: c.title,
        messageCount: parseInt(c.message_count, 10),
        createdAt: c.created_at,
        updatedAt: c.updated_at,
      })),
    })
  } catch (error) {
    console.error('[Assistant Dossier] Erreur GET:', error)
    return NextResponse.json(
      { error: 'Erreur récupération historique' },
      { status: 500 }
    )
  }
}
