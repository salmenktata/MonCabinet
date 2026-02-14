#!/usr/bin/env tsx
/**
 * Test Cascade Fallback LLM
 *
 * Valide que la cascade fallback fonctionne correctement :
 * Groq → DeepSeek → Anthropic → Ollama
 *
 * Phase 4 du système de vérification complète.
 *
 * Usage:
 *   npx tsx scripts/test-llm-fallback-cascade.ts
 */

import { callLLMWithFallback, type LLMMessage } from '@/lib/ai/llm-fallback-service'

// =============================================================================
// TESTS CASCADE
// =============================================================================

async function testPrimaryProvider() {
  console.log('Test 1: Provider primaire (Gemini)...')

  const messages: LLMMessage[] = [
    { role: 'user', content: 'Réponds simplement "OK"' }
  ]

  const result = await callLLMWithFallback(messages, {
    maxTokens: 10,
    temperature: 0,
    context: 'default',
  })

  console.log(`✅ Provider utilisé: ${result.provider}`)
  console.log(`   Modèle: ${result.modelUsed}`)
  console.log(`   Tokens: ${result.tokensUsed.total}`)
  console.log(`   Fallback utilisé: ${result.fallbackUsed ? 'Oui' : 'Non'}\n`)

  return result
}

async function testFallbackMechanism() {
  console.log('Test 2: Mécanisme fallback (Gemini désactivé temporairement)...')

  // Sauvegarder clé originale
  const originalKey = process.env.GOOGLE_API_KEY

  try {
    // Invalider temporairement Gemini pour forcer fallback
    process.env.GOOGLE_API_KEY = 'invalid-key-test-fallback'

    const messages: LLMMessage[] = [
      { role: 'user', content: 'Réponds simplement "OK"' }
    ]

    const result = await callLLMWithFallback(messages, {
      maxTokens: 10,
      temperature: 0,
      context: 'default',
    })

    console.log(`✅ Provider fallback: ${result.provider}`)
    console.log(`   Modèle: ${result.modelUsed}`)
    console.log(`   Fallback depuis: ${result.originalProvider || 'N/A'}`)
    console.log(`   Fallback utilisé: ${result.fallbackUsed ? 'Oui' : 'Non'}\n`)

    // Valider que ce n'est PAS Gemini
    if (result.provider.toLowerCase() === 'gemini') {
      throw new Error('Cascade fallback non déclenchée: Gemini toujours utilisé')
    }

    return result
  } finally {
    // Restaurer clé originale
    process.env.GOOGLE_API_KEY = originalKey
  }
}

async function testMultipleFallbacks() {
  console.log('Test 3: Cascade complète (Gemini + DeepSeek désactivés)...')

  // Sauvegarder clés originales
  const originalGemini = process.env.GOOGLE_API_KEY
  const originalDeepSeek = process.env.DEEPSEEK_API_KEY

  try {
    // Invalider Gemini et DeepSeek pour forcer cascade complète
    process.env.GOOGLE_API_KEY = 'invalid-key-test'
    process.env.DEEPSEEK_API_KEY = 'invalid-key-test'

    const messages: LLMMessage[] = [
      { role: 'user', content: 'Réponds simplement "OK"' }
    ]

    const result = await callLLMWithFallback(messages, {
      maxTokens: 10,
      temperature: 0,
      context: 'default',
    })

    console.log(`✅ Provider final: ${result.provider}`)
    console.log(`   Modèle: ${result.modelUsed}`)
    console.log(`   Fallback cascade validée\n`)

    // Valider que ce n'est ni Gemini ni DeepSeek
    const providerLower = result.provider.toLowerCase()
    if (providerLower === 'gemini' || providerLower === 'deepseek') {
      throw new Error('Cascade incomplète: provider invalidé toujours utilisé')
    }

    return result
  } finally {
    // Restaurer clés originales
    process.env.GOOGLE_API_KEY = originalGemini
    process.env.DEEPSEEK_API_KEY = originalDeepSeek
  }
}

// =============================================================================
// ORCHESTRATION
// =============================================================================

async function main() {
  console.log('┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓')
  console.log('┃ Test Cascade Fallback LLM                ┃')
  console.log('┣━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┫\n')

  try {
    // Test 1: Provider primaire
    const result1 = await testPrimaryProvider()

    // Test 2: Fallback simple
    const result2 = await testFallbackMechanism()

    // Test 3: Cascade complète
    const result3 = await testMultipleFallbacks()

    // Résumé
    console.log('┣━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┫')
    console.log('┃ Résumé Validation                        ┃')
    console.log('┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛\n')

    console.log(`✅ Provider primaire:     ${result1.provider}`)
    console.log(`✅ Fallback niveau 1:     ${result2.provider}`)
    console.log(`✅ Cascade complète:      ${result3.provider}`)
    console.log('\n✅ Cascade fallback validée: OPÉRATIONNEL\n')

    process.exit(0)
  } catch (error) {
    console.error('\n❌ Erreur cascade fallback:', error instanceof Error ? error.message : error)
    console.error('\n⚠️  Cascade fallback: NON OPÉRATIONNEL\n')
    process.exit(1)
  }
}

main()
