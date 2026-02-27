/**
 * API Route - Comparer les réponses de 3 providers LLM sur la même question
 *
 * POST /api/admin/compare-llm
 *   Body: { question: string }
 *
 * Appelle answerQuestion en parallèle avec Gemini, OpenAI et Ollama,
 * et retourne les 3 réponses avec latence et métadonnées.
 *
 * @module app/api/admin/compare-llm/route
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { answerQuestion } from '@/lib/ai/rag-chat-service'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

// =============================================================================
// Types
// =============================================================================

interface ProviderResult {
  answer: string
  modelUsed: string
  latencyMs: number
  sourcesCount: number
  sources: Array<{ title: string; score: number }>
  error?: string
}

// =============================================================================
// POST — Comparer 3 providers sur la même question
// =============================================================================

export async function POST(request: NextRequest) {
  // Auth : session admin uniquement
  const session = await getSession()
  if (!session?.user?.id || (session.user.role !== 'admin' && session.user.role !== 'super_admin')) {
    return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })
  }

  let body: { question?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Body JSON invalide' }, { status: 400 })
  }

  const { question } = body
  if (!question || typeof question !== 'string' || question.trim().length === 0) {
    return NextResponse.json({ error: 'question requis' }, { status: 400 })
  }

  const userId = `compare-admin-${session.user.id}`

  // Appels en parallèle aux 3 providers
  const [geminiResult, openaiResult, ollamaResult] = await Promise.allSettled([
    callProvider('compare-gemini', question, userId),
    callProvider('compare-openai', question, userId),
    callProvider('compare-ollama', question, userId),
  ])

  return NextResponse.json({
    success: true,
    question,
    results: {
      gemini: settledToResult(geminiResult),
      openai: settledToResult(openaiResult),
      ollama: settledToResult(ollamaResult),
    },
  })
}

// =============================================================================
// Helpers
// =============================================================================

async function callProvider(
  operationName: 'compare-gemini' | 'compare-openai' | 'compare-ollama',
  question: string,
  userId: string
): Promise<ProviderResult> {
  const start = Date.now()
  try {
    const response = await answerQuestion(question, userId, {
      operationName,
      includeKnowledgeBase: true,
      maxContextChunks: 5,
    })
    const latencyMs = Date.now() - start
    return {
      answer: response.answer || '',
      modelUsed: response.model || operationName,
      latencyMs,
      sourcesCount: response.sources?.length ?? 0,
      sources: (response.sources ?? []).slice(0, 5).map((s) => ({
        title: s.documentName || '',
        score: typeof s.boostedSimilarity === 'number'
          ? Math.round(s.boostedSimilarity * 1000) / 1000
          : Math.round((s.similarity ?? 0) * 1000) / 1000,
      })),
    }
  } catch (err) {
    return {
      answer: '',
      modelUsed: operationName,
      latencyMs: Date.now() - start,
      sourcesCount: 0,
      sources: [],
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

function settledToResult(result: PromiseSettledResult<ProviderResult>): ProviderResult {
  if (result.status === 'fulfilled') return result.value
  return {
    answer: '',
    modelUsed: '',
    latencyMs: 0,
    sourcesCount: 0,
    sources: [],
    error: result.reason instanceof Error ? result.reason.message : String(result.reason),
  }
}
