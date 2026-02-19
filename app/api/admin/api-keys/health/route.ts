import { getErrorMessage } from '@/lib/utils/error-utils'
/**
 * API Health Check des Clés API
 *
 * Vérifie la validité de toutes les clés API configurées
 * en effectuant des appels de test aux providers
 *
 * GET /api/admin/api-keys/health
 */

import { NextRequest, NextResponse } from 'next/server'
import { withAdminApiAuth } from '@/lib/auth/with-admin-api-auth'
import OpenAI from 'openai'
import Anthropic from '@anthropic-ai/sdk'
import { callGemini } from '@/lib/ai/gemini-client'

export const dynamic = 'force-dynamic'
export const maxDuration = 60 // 60 secondes max

interface ProviderHealth {
  provider: string
  status: 'healthy' | 'error' | 'missing'
  responseTime?: number
  error?: string
  model?: string
  lastChecked: string
}

/**
 * Test Gemini API
 */
async function testGemini(): Promise<ProviderHealth> {
  const start = Date.now()

  try {
    const apiKey = process.env.GOOGLE_API_KEY

    if (!apiKey) {
      return {
        provider: 'gemini',
        status: 'missing',
        error: 'GOOGLE_API_KEY not configured',
        lastChecked: new Date().toISOString(),
      }
    }

    // Test simple avec prompt minimal
    const response = await callGemini(
      [{ role: 'user', content: 'Réponds juste "OK"' }],
      { temperature: 0, maxTokens: 10 }
    )

    const responseTime = Date.now() - start

    return {
      provider: 'gemini',
      status: 'healthy',
      responseTime,
      model: process.env.GEMINI_MODEL || 'gemini-2.0-flash-exp',
      lastChecked: new Date().toISOString(),
    }
  } catch (error) {
    return {
      provider: 'gemini',
      status: 'error',
      responseTime: Date.now() - start,
      error: getErrorMessage(error) || 'Unknown error',
      lastChecked: new Date().toISOString(),
    }
  }
}

/**
 * Test Groq API
 */
async function testGroq(): Promise<ProviderHealth> {
  const start = Date.now()

  try {
    const apiKey = process.env.GROQ_API_KEY

    if (!apiKey) {
      return {
        provider: 'groq',
        status: 'missing',
        error: 'GROQ_API_KEY not configured',
        lastChecked: new Date().toISOString(),
      }
    }

    const client = new OpenAI({
      apiKey,
      baseURL: 'https://api.groq.com/openai/v1',
    })

    const response = await client.chat.completions.create({
      model: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
      messages: [{ role: 'user', content: 'Réponds juste "OK"' }],
      max_tokens: 10,
      temperature: 0,
    })

    const responseTime = Date.now() - start

    return {
      provider: 'groq',
      status: 'healthy',
      responseTime,
      model: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
      lastChecked: new Date().toISOString(),
    }
  } catch (error) {
    return {
      provider: 'groq',
      status: 'error',
      responseTime: Date.now() - start,
      error: getErrorMessage(error) || 'Unknown error',
      lastChecked: new Date().toISOString(),
    }
  }
}

/**
 * Test DeepSeek API
 */
async function testDeepSeek(): Promise<ProviderHealth> {
  const start = Date.now()

  try {
    const apiKey = process.env.DEEPSEEK_API_KEY

    if (!apiKey) {
      return {
        provider: 'deepseek',
        status: 'missing',
        error: 'DEEPSEEK_API_KEY not configured',
        lastChecked: new Date().toISOString(),
      }
    }

    const client = new OpenAI({
      apiKey,
      baseURL: 'https://api.deepseek.com',
    })

    const response = await client.chat.completions.create({
      model: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
      messages: [{ role: 'user', content: 'Réponds juste "OK"' }],
      max_tokens: 10,
      temperature: 0,
    })

    const responseTime = Date.now() - start

    return {
      provider: 'deepseek',
      status: 'healthy',
      responseTime,
      model: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
      lastChecked: new Date().toISOString(),
    }
  } catch (error) {
    return {
      provider: 'deepseek',
      status: 'error',
      responseTime: Date.now() - start,
      error: getErrorMessage(error) || 'Unknown error',
      lastChecked: new Date().toISOString(),
    }
  }
}

/**
 * Test Anthropic API
 */
async function testAnthropic(): Promise<ProviderHealth> {
  const start = Date.now()

  try {
    const apiKey = process.env.ANTHROPIC_API_KEY

    if (!apiKey) {
      return {
        provider: 'anthropic',
        status: 'missing',
        error: 'ANTHROPIC_API_KEY not configured (optional)',
        lastChecked: new Date().toISOString(),
      }
    }

    const client = new Anthropic({ apiKey })

    const response = await client.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 10,
      messages: [{ role: 'user', content: 'Réponds juste "OK"' }],
    })

    const responseTime = Date.now() - start

    return {
      provider: 'anthropic',
      status: 'healthy',
      responseTime,
      model: 'claude-3-5-sonnet-20241022',
      lastChecked: new Date().toISOString(),
    }
  } catch (error) {
    return {
      provider: 'anthropic',
      status: 'error',
      responseTime: Date.now() - start,
      error: getErrorMessage(error) || 'Unknown error',
      lastChecked: new Date().toISOString(),
    }
  }
}

/**
 * Test Ollama Local
 */
async function testOllama(): Promise<ProviderHealth> {
  const start = Date.now()

  try {
    const enabled = process.env.OLLAMA_ENABLED === 'true'
    const baseURL = process.env.OLLAMA_BASE_URL || 'http://localhost:11434'

    if (!enabled) {
      return {
        provider: 'ollama',
        status: 'missing',
        error: 'Ollama disabled (OLLAMA_ENABLED=false)',
        lastChecked: new Date().toISOString(),
      }
    }

    // Test simple avec fetch
    const response = await fetch(`${baseURL}/api/tags`, {
      method: 'GET',
      signal: AbortSignal.timeout(5000),
    })

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }

    const data = await response.json()
    const responseTime = Date.now() - start

    return {
      provider: 'ollama',
      status: 'healthy',
      responseTime,
      model: `${data.models?.length || 0} models available`,
      lastChecked: new Date().toISOString(),
    }
  } catch (error) {
    return {
      provider: 'ollama',
      status: 'error',
      responseTime: Date.now() - start,
      error: getErrorMessage(error) || 'Unknown error',
      lastChecked: new Date().toISOString(),
    }
  }
}

/**
 * Test OpenAI Embeddings
 */
async function testOpenAIEmbeddings(): Promise<ProviderHealth> {
  const start = Date.now()

  try {
    const apiKey = process.env.OPENAI_API_KEY

    if (!apiKey) {
      return {
        provider: 'openai-embeddings',
        status: 'missing',
        error: 'OPENAI_API_KEY not configured',
        lastChecked: new Date().toISOString(),
      }
    }

    const client = new OpenAI({ apiKey })

    // Test avec un texte simple
    const response = await client.embeddings.create({
      model: 'text-embedding-3-small',
      input: 'Test embedding',
      encoding_format: 'float',
    })

    const responseTime = Date.now() - start

    return {
      provider: 'openai-embeddings',
      status: 'healthy',
      responseTime,
      model: 'text-embedding-3-small (1536-dim)',
      lastChecked: new Date().toISOString(),
    }
  } catch (error) {
    return {
      provider: 'openai-embeddings',
      status: 'error',
      responseTime: Date.now() - start,
      error: getErrorMessage(error) || 'Unknown error',
      lastChecked: new Date().toISOString(),
    }
  }
}

/**
 * Endpoint principal
 */
export const GET = withAdminApiAuth(async (request, _ctx, _session) => {
  try {
    console.log('🔍 Health check des clés API démarré...')

    // Exécuter tous les tests en parallèle
    const [gemini, groq, deepseek, anthropic, ollama, openaiEmbeddings] = await Promise.all([
      testGemini(),
      testGroq(),
      testDeepSeek(),
      testAnthropic(),
      testOllama(),
      testOpenAIEmbeddings(),
    ])

    const results = [gemini, groq, deepseek, anthropic, ollama, openaiEmbeddings]

    // Statistiques globales
    const healthy = results.filter((r) => r.status === 'healthy').length
    const errors = results.filter((r) => r.status === 'error').length
    const missing = results.filter((r) => r.status === 'missing').length

    const overallStatus =
      healthy > 0 ? (errors === 0 ? 'healthy' : 'degraded') : 'critical'

    console.log(`✅ Health check terminé: ${healthy} healthy, ${errors} errors, ${missing} missing`)

    return NextResponse.json(
      {
        status: overallStatus,
        timestamp: new Date().toISOString(),
        summary: {
          healthy,
          errors,
          missing,
          total: results.length,
        },
        providers: results,
      },
      {
        status: 200,
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
        },
      }
    )
  } catch (error) {
    console.error('❌ Erreur health check API:', error)

    return NextResponse.json(
      {
        status: 'error',
        error: getErrorMessage(error) || 'Unknown error',
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    )
  }
})
