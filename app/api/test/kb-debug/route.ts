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

    // 3. Tester searchKnowledgeBase() avec PLUSIEURS thresholds
    let kbResults_0_5 = null
    let kbResults_0_55 = null
    let kbResults_0_65 = null
    let kbError = null

    const testPrompt = 'شروط الدفاع الشرعي' // "Conditions de légitime défense"

    if (semanticSearchEnabled) {
      try {
        // Test 1: Threshold 0.5 (endpoint debug)
        kbResults_0_5 = await searchKnowledgeBase(testPrompt, {
          limit: 5,
          threshold: 0.5,
        })

        // Test 2: Threshold 0.55 (proposition)
        kbResults_0_55 = await searchKnowledgeBase(testPrompt, {
          limit: 5,
          threshold: 0.55,
        })

        // Test 3: Threshold 0.65 (PRODUCTION)
        kbResults_0_65 = await searchKnowledgeBase(testPrompt, {
          limit: 5,
          threshold: 0.65,
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
      kbSearchThresholdTests: {
        executed: semanticSearchEnabled,
        error: kbError,
        threshold_0_5: {
          count: kbResults_0_5?.length || 0,
          sample: kbResults_0_5?.slice(0, 3).map(r => ({
            title: r.title.substring(0, 50),
            category: r.category,
            similarity: r.similarity,
          })),
        },
        threshold_0_55: {
          count: kbResults_0_55?.length || 0,
          sample: kbResults_0_55?.slice(0, 3).map(r => ({
            title: r.title.substring(0, 50),
            category: r.category,
            similarity: r.similarity,
          })),
        },
        threshold_0_65_PRODUCTION: {
          count: kbResults_0_65?.length || 0,
          sample: kbResults_0_65?.slice(0, 3).map(r => ({
            title: r.title.substring(0, 50),
            category: r.category,
            similarity: r.similarity,
          })),
        },
      },
    })
  } catch (error) {
    return NextResponse.json({
      status: 'error',
      error: error instanceof Error ? error.message : String(error),
    }, { status: 500 })
  }
}
