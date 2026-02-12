/**
 * Endpoint de test pour diagnostiquer KB search
 * Temporaire - à supprimer après debug
 */

import { NextResponse } from 'next/server'
import { isSemanticSearchEnabled } from '@/lib/ai/config'
import { searchKnowledgeBase } from '@/lib/ai/knowledge-base-service'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    // 1. Vérifier variables environnement
    const envVars = {
      OLLAMA_ENABLED: process.env.OLLAMA_ENABLED,
      RAG_ENABLED: process.env.RAG_ENABLED,
      OLLAMA_BASE_URL: process.env.OLLAMA_BASE_URL,
      OPENAI_API_KEY: process.env.OPENAI_API_KEY ? 'SET' : 'NOT_SET',
    }

    // 2. Vérifier isSemanticSearchEnabled()
    const semanticSearchEnabled = isSemanticSearchEnabled()

    // 3. Tester searchKnowledgeBase() si activé
    let kbResults = null
    let kbError = null

    if (semanticSearchEnabled) {
      try {
        kbResults = await searchKnowledgeBase('شروط الدفاع الشرعي', {
          limit: 3,
          threshold: 0.5,
        })
      } catch (error) {
        kbError = error instanceof Error ? error.message : String(error)
      }
    }

    return NextResponse.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      env: envVars,
      isSemanticSearchEnabled: semanticSearchEnabled,
      kbSearch: {
        executed: semanticSearchEnabled,
        resultsCount: kbResults?.length || 0,
        error: kbError,
        sample: kbResults?.slice(0, 2).map(r => ({
          title: r.title,
          category: r.category,
          similarity: r.similarity,
        })),
      },
    })
  } catch (error) {
    return NextResponse.json({
      status: 'error',
      error: error instanceof Error ? error.message : String(error),
    }, { status: 500 })
  }
}
