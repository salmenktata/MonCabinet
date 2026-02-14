#!/usr/bin/env tsx
/**
 * Test Fonctionnel des Clés API Production
 *
 * Teste la validité réelle de chaque provider avec des appels API réels.
 * Phase 3 du système de vérification complète.
 *
 * Usage:
 *   npx tsx scripts/test-api-keys-functional.ts --output=/tmp/results.json
 */

import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'
import { GoogleGenerativeAI } from '@google/generative-ai'
import fs from 'fs'

// =============================================================================
// TYPES
// =============================================================================

interface TestResult {
  provider: string
  status: 'success' | 'error' | 'warning'
  latency_ms: number
  error?: string
  quota_remaining?: string
  details?: string
}

// =============================================================================
// TESTS PROVIDERS
// =============================================================================

async function testGroq(): Promise<TestResult> {
  const start = Date.now()
  try {
    if (!process.env.GROQ_API_KEY) {
      throw new Error('GROQ_API_KEY manquante')
    }

    const groq = new OpenAI({
      apiKey: process.env.GROQ_API_KEY,
      baseURL: 'https://api.groq.com/openai/v1',
    })

    const response = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [{ role: 'user', content: 'Test validation clé' }],
      max_tokens: 10,
      temperature: 0,
    })

    return {
      provider: 'Groq',
      status: 'success',
      latency_ms: Date.now() - start,
      details: `Model: ${response.model}`,
    }
  } catch (error) {
    return {
      provider: 'Groq',
      status: 'error',
      latency_ms: Date.now() - start,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

async function testDeepSeek(): Promise<TestResult> {
  const start = Date.now()
  try {
    if (!process.env.DEEPSEEK_API_KEY) {
      throw new Error('DEEPSEEK_API_KEY manquante')
    }

    const openai = new OpenAI({
      apiKey: process.env.DEEPSEEK_API_KEY,
      baseURL: 'https://api.deepseek.com/v1',
    })

    const response = await openai.chat.completions.create({
      model: 'deepseek-chat',
      messages: [{ role: 'user', content: 'Test validation clé' }],
      max_tokens: 10,
      temperature: 0,
    })

    return {
      provider: 'DeepSeek',
      status: 'success',
      latency_ms: Date.now() - start,
      details: `Model: ${response.model}`,
    }
  } catch (error) {
    return {
      provider: 'DeepSeek',
      status: 'error',
      latency_ms: Date.now() - start,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

async function testAnthropic(): Promise<TestResult> {
  const start = Date.now()
  try {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error('ANTHROPIC_API_KEY manquante')
    }

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    const response = await anthropic.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 10,
      messages: [{ role: 'user', content: 'Test validation clé' }],
    })

    return {
      provider: 'Anthropic',
      status: 'success',
      latency_ms: Date.now() - start,
      details: `Model: ${response.model}`,
    }
  } catch (error) {
    return {
      provider: 'Anthropic',
      status: 'error',
      latency_ms: Date.now() - start,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

async function testGemini(): Promise<TestResult> {
  const start = Date.now()
  try {
    if (!process.env.GOOGLE_API_KEY) {
      throw new Error('GOOGLE_API_KEY manquante')
    }

    const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY)
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' })
    const result = await model.generateContent('Test validation clé')
    const response = await result.response

    return {
      provider: 'Gemini',
      status: 'success',
      latency_ms: Date.now() - start,
      details: `Model: gemini-2.5-flash`,
    }
  } catch (error) {
    return {
      provider: 'Gemini',
      status: 'error',
      latency_ms: Date.now() - start,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

async function testOpenAI(): Promise<TestResult> {
  const start = Date.now()
  try {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY manquante')
    }

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    const response = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: 'Test validation clé',
    })

    return {
      provider: 'OpenAI',
      status: 'success',
      latency_ms: Date.now() - start,
      details: `Embeddings: ${response.data[0].embedding.length} dimensions`,
    }
  } catch (error) {
    return {
      provider: 'OpenAI',
      status: 'error',
      latency_ms: Date.now() - start,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

async function testOllama(): Promise<TestResult> {
  const start = Date.now()
  try {
    const baseUrl = process.env.OLLAMA_BASE_URL || 'http://localhost:11434'

    const response = await fetch(`${baseUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'qwen3:8b',
        prompt: 'Test validation',
        stream: false,
      }),
    })

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }

    return {
      provider: 'Ollama',
      status: 'success',
      latency_ms: Date.now() - start,
      details: 'Service local disponible',
    }
  } catch (error) {
    return {
      provider: 'Ollama',
      status: 'warning',
      latency_ms: Date.now() - start,
      error: 'Service local non disponible (acceptable en production)',
    }
  }
}

// =============================================================================
// ORCHESTRATION
// =============================================================================

async function main() {
  console.log('🔍 Test fonctionnel des clés API...\n')

  // Exécuter tous les tests en parallèle
  const results: TestResult[] = await Promise.all([
    testGroq(),
    testDeepSeek(),
    testAnthropic(),
    testGemini(),
    testOpenAI(),
    testOllama(),
  ])

  // Sauvegarder résultats si --output spécifié
  const outputArg = process.argv.find(arg => arg.startsWith('--output='))
  if (outputArg) {
    const outputFile = outputArg.split('=')[1]
    fs.writeFileSync(outputFile, JSON.stringify(results, null, 2))
    console.log(`📄 Résultats sauvegardés: ${outputFile}\n`)
  }

  // Afficher résumé
  console.log('📊 Résumé:\n')
  results.forEach(r => {
    const icon = r.status === 'success' ? '✅' : r.status === 'warning' ? '⚠️' : '❌'
    const latency = r.latency_ms.toString().padStart(5) + 'ms'
    const details = r.error || r.details || ''
    console.log(`${icon} ${r.provider.padEnd(12)} ${latency}  ${details}`)
  })

  const successCount = results.filter(r => r.status === 'success').length
  const warningCount = results.filter(r => r.status === 'warning').length
  const errorCount = results.filter(r => r.status === 'error').length

  console.log(`\n📈 Global: ${successCount} ✅  ${warningCount} ⚠️  ${errorCount} ❌\n`)

  // Exit code basé sur les résultats
  // Succès si au moins 3 providers fonctionnels (hors Ollama)
  const criticalProviders = results.filter(r => r.provider !== 'Ollama')
  const criticalSuccess = criticalProviders.filter(r => r.status === 'success').length

  if (criticalSuccess >= 3) {
    console.log('✅ Validation réussie: système opérationnel\n')
    process.exit(0)
  } else {
    console.log(`❌ Validation échouée: seulement ${criticalSuccess}/5 providers critiques fonctionnels\n`)
    process.exit(1)
  }
}

main().catch(err => {
  console.error('❌ Erreur fatale:', err)
  process.exit(1)
})
