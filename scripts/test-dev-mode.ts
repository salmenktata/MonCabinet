#!/usr/bin/env tsx
/**
 * Test du mode développement (Ollama uniquement, 0€)
 */

import { config } from 'dotenv'
config({ path: '.env.local' })

import { callLLMWithFallback, getAvailableProviders } from '../lib/ai/llm-fallback-service'

async function testDevMode() {
  console.log('🧪 Test Mode Développement (NODE_ENV=' + process.env.NODE_ENV + ')\n')

  // Test 1: Providers disponibles
  console.log('📋 Test 1: Providers disponibles')
  const providers = getAvailableProviders()
  console.log(`   Résultat: ${providers.join(', ')}`)
  console.log(`   Attendu: ollama uniquement\n`)

  if (providers.length !== 1 || providers[0] !== 'ollama') {
    console.error('❌ ÉCHEC: Devrait retourner uniquement Ollama en dev')
    process.exit(1)
  }

  // Test 2: Appel LLM
  console.log('📡 Test 2: Appel LLM en mode dev')
  try {
    const start = Date.now()
    const response = await callLLMWithFallback(
      [{ role: 'user', content: 'Réponds juste "OK" en un mot.' }],
      { temperature: 0, maxTokens: 10, context: 'rag-chat' },
      false
    )
    const duration = Date.now() - start

    console.log(`   ✅ Provider: ${response.provider}`)
    console.log(`   ✅ Réponse: "${response.answer}"`)
    console.log(`   ✅ Durée: ${duration}ms`)
    console.log(`   ✅ Modèle: ${response.modelUsed}`)

    if (response.provider !== 'ollama') {
      console.error(`\n❌ ÉCHEC: Utilisé ${response.provider} au lieu d'Ollama`)
      process.exit(1)
    }

    console.log('\n🎉 Mode développement validé : 0€ consommé !')
    process.exit(0)
  } catch (error: any) {
    console.error(`\n❌ Erreur: ${error.message}`)
    console.error('\n💡 Vérifiez que Ollama est démarré : ollama serve')
    process.exit(1)
  }
}

testDevMode()
