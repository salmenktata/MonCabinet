/**
 * API Route: Consultation Juridique Formelle (IRAC)
 *
 * POST /api/dossiers/[id]/consultation
 * - Génère une consultation juridique formelle selon la méthode IRAC
 * - Utilise OpenAI embeddings 1536-dim pour qualité maximale
 * - Utilise Gemini LLM pour raisonnement approfondi
 *
 * Configuration : operationName = 'dossiers-consultation'
 * - Provider LLM : Gemini → DeepSeek → Groq
 * - Provider Embeddings : OpenAI 1536-dim (qualité max)
 * - Timeout : 60s (consultation détaillée)
 * - Temperature : 0.1 (très factuel et précis)
 * - Format : IRAC (Issue, Rule, Application, Conclusion)
 *
 * Format de réponse IRAC :
 * - Faits pertinents
 * - Problématique juridique
 * - Règles de droit applicables
 * - Analyse et application
 * - Conclusion juridique
 * - Sources juridiques citées
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

// =============================================================================
// TYPES
// =============================================================================

interface ConsultationRequestBody {
  question: string
  facts?: string // Faits du cas (optionnel, sinon extrait du dossier)
  usePremiumModel?: boolean
}

interface ConsultationApiResponse {
  answer: string
  sources: ChatSource[]
  tokensUsed: {
    input: number
    output: number
    total: number
  }
  model: string
  format: 'IRAC'
}

// =============================================================================
// POST: Générer une consultation juridique
// =============================================================================

export async function POST(
  request: NextRequest,
  props: { params: Promise<{ id: string }> }
): Promise<NextResponse<ConsultationApiResponse | { error: string }>> {
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
    const body: ConsultationRequestBody = await request.json()
    const {
      question,
      facts,
      usePremiumModel = false,
    } = body

    if (!question || question.trim().length < 10) {
      return NextResponse.json(
        { error: 'Question trop courte (min 10 caractères pour une consultation)' },
        { status: 400 }
      )
    }

    // Vérifier que le dossier appartient à l'utilisateur
    const dossierCheck = await db.query(
      `SELECT
        d.id,
        d.numero,
        d.titre,
        d.description,
        d.categorie,
        c.nom as client_nom,
        c.prenom as client_prenom
       FROM dossiers d
       LEFT JOIN clients c ON d.client_id = c.id
       WHERE d.id = $1 AND d.user_id = $2`,
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
      `[Consultation] Génération consultation IRAC - Dossier #${dossier.numero}`
    )

    // Construire la question enrichie avec contexte dossier et faits
    let enrichedQuestion = question

    // Si des faits sont fournis, les inclure
    if (facts && facts.trim().length > 0) {
      enrichedQuestion = `**Faits du cas :**\n${facts}\n\n**Question juridique :**\n${question}`
    }
    // Sinon, utiliser les informations du dossier
    else if (dossier.description) {
      enrichedQuestion = `**Contexte du dossier :**\nDossier n°${dossier.numero} - ${dossier.titre}\nClient : ${dossier.client_nom || ''} ${dossier.client_prenom || ''}\nCatégorie : ${dossier.categorie || 'Non spécifiée'}\n\n${dossier.description}\n\n**Question juridique :**\n${question}`
    }

    // Préfixe pour forcer le format IRAC
    const iracPrefix = `Veuillez fournir une consultation juridique formelle selon la méthode IRAC (Issue, Rule, Application, Conclusion) en répondant à la question suivante :\n\n`

    const finalQuestion = iracPrefix + enrichedQuestion

    // Appeler le service RAG avec configuration dossiers-consultation
    const response = await answerQuestion(finalQuestion, userId, {
      dossierId,
      conversationId: undefined, // Pas de conversation pour consultation formelle
      includeJurisprudence: true, // Toujours inclure jurisprudence pour consultation
      usePremiumModel,
      operationName: 'dossiers-consultation', // ← Configuration IRAC formelle
      contextType: 'consultation', // Format consultation IRAC
    })

    // Enregistrer la consultation générée (optionnel)
    await db.query(
      `INSERT INTO consultations (
        dossier_id,
        user_id,
        question,
        facts,
        answer,
        model_used,
        tokens_used,
        created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
      ON CONFLICT DO NOTHING`,
      [
        dossierId,
        userId,
        question,
        facts || null,
        response.answer,
        response.model,
        response.tokensUsed.total,
      ]
    ).catch((err) => {
      // Ignorer si table n'existe pas encore
      console.warn('[Consultation] Table consultations non trouvée:', err.message)
    })

    return NextResponse.json({
      answer: response.answer,
      sources: response.sources,
      tokensUsed: response.tokensUsed,
      model: response.model,
      format: 'IRAC',
    })
  } catch (error) {
    console.error('[Consultation] Erreur:', error)
    const message = error instanceof Error ? error.message : 'Erreur inconnue'

    return NextResponse.json({ error: message }, { status: 500 })
  }
}
