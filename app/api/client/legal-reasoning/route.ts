/**
 * API Endpoint : /api/client/legal-reasoning
 *
 * Génère un arbre décisionnel IRAC (Issue-Rule-Application-Conclusion)
 * pour une question juridique posée par un client.
 *
 * Sprint 4 - Fonctionnalités Client
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { buildExplanationTree } from '@/lib/ai/explanation-tree-builder'
import { search } from '@/lib/ai/unified-rag-service'
import type { ExplanationTree } from '@/lib/ai/explanation-tree-builder'

// =============================================================================
// TYPES
// =============================================================================

interface LegalReasoningRequest {
  question: string
  domain?: string // Domaine juridique (civil, commercial, penal, etc.)
  maxDepth?: number // Profondeur max de l'arbre (défaut: 3)
  language?: 'fr' | 'ar' // Langue de la réponse
  includeAlternatives?: boolean // Inclure raisonnements alternatifs
}

interface LegalReasoningResponse {
  success: boolean
  tree?: ExplanationTree
  sources?: Array<{
    id: string
    title: string
    category: string
    relevance: number
  }>
  error?: string
  metadata?: {
    processingTimeMs: number
    nodesGenerated: number
    sourcesUsed: number
  }
}

// =============================================================================
// HANDLER POST
// =============================================================================

export async function POST(req: NextRequest): Promise<NextResponse<LegalReasoningResponse>> {
  const startTime = Date.now()

  try {
    // 1. Authentification
    const session = await getSession()
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: 'Non authentifié' },
        { status: 401 }
      )
    }

    // 2. Validation requête
    const body = (await req.json()) as LegalReasoningRequest
    const { question, domain, maxDepth = 3, language = 'fr', includeAlternatives = false } = body

    if (!question || question.trim().length === 0) {
      return NextResponse.json(
        { success: false, error: 'Question requise' },
        { status: 400 }
      )
    }

    if (question.length > 1000) {
      return NextResponse.json(
        { success: false, error: 'Question trop longue (max 1000 caractères)' },
        { status: 400 }
      )
    }

    // 3. Récupération sources RAG
    const ragSources = await search(question, {
      category: domain,
      language,
      limit: 10,
    })

    if (ragSources.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: 'Aucune source juridique trouvée pour cette question',
        },
        { status: 404 }
      )
    }

    // 4. Construction arbre décisionnel
    const tree = await buildExplanationTree({
      question,
      domain,
      sources: ragSources.map((source) => ({
        id: source.kbId,
        type: source.category as 'code' | 'jurisprudence' | 'doctrine' | 'legislation',
        title: source.title,
        content: source.chunkContent,
        relevance: source.similarity,
        metadata: {
          category: source.category,
          decisionDate: source.metadata.decisionDate,
          tribunalLabel: source.metadata.tribunalLabelFr,
          legalBasis: source.metadata.legalBasis,
        },
      })),
      maxDepth,
      language,
      includeAlternatives,
    })

    // 5. Statistiques
    const processingTimeMs = Date.now() - startTime

    return NextResponse.json({
      success: true,
      tree,
      sources: ragSources.map((source) => ({
        id: source.kbId,
        title: source.title,
        category: source.category,
        relevance: source.similarity,
      })),
      metadata: {
        processingTimeMs,
        nodesGenerated: tree.nodes.length,
        sourcesUsed: ragSources.length,
      },
    })
  } catch (error) {
    console.error('[API Legal Reasoning] Error:', error)

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Erreur serveur',
      },
      { status: 500 }
    )
  }
}

// =============================================================================
// HANDLER OPTIONS (CORS)
// =============================================================================

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  })
}
