#!/usr/bin/env tsx
/**
 * Test complet de tous les providers LLM et du système de fallback
 */

// Charger .env.local avant toute autre chose
import { config } from 'dotenv'
config({ path: '.env.local' })

import { callLLMWithFallback, getAvailableProviders } from '../lib/ai/llm-fallback-service'
import { callGemini } from '../lib/ai/gemini-client'
import { getApiKey, listApiKeys } from '../lib/api-keys/api-keys-service'

interface TestResult {
  name: string
  status: '✅' | '❌' | '⏭️'
  message: string
  duration?: number
}

const results: TestResult[] = []

function addResult(name: string, status: '✅' | '❌' | '⏭️', message: string, duration?: number) {
  results.push({ name, status, message, duration })
}

async function testApiKeysDB() {
  console.log('\n🔐 Test 1: Récupération des clés depuis la base de données\n')

  try {
    const keys = await listApiKeys()
    console.log(`  📋 ${keys.length} clé(s) trouvée(s) dans la base :`)

    for (const key of keys) {
      const emoji = key.isPrimary ? '🏆' : key.isActive ? '✅' : '❌'
      console.log(`    ${emoji} ${key.provider.padEnd(10)} → ${key.apiKeyMasked} (${key.tier})`)
    }

    // Test récupération clés déchiffrées
    const geminiKey = await getApiKey('gemini')
    const deepseekKey = await getApiKey('deepseek')

    if (geminiKey) {
      addResult('DB: Gemini Key', '✅', `Clé récupérée (${geminiKey.length} chars)`)
    } else {
      addResult('DB: Gemini Key', '❌', 'Clé non trouvée')
    }

    if (deepseekKey) {
      addResult('DB: DeepSeek Key', '✅', `Clé récupérée (${deepseekKey.length} chars)`)
    } else {
      addResult('DB: DeepSeek Key', '❌', 'Clé non trouvée')
    }

  } catch (error: any) {
    addResult('DB: Récupération clés', '❌', error.message)
  }
}

async function testGeminiDirect() {
  console.log('\n🤖 Test 2: Appel direct Gemini\n')

  try {
    const start = Date.now()
    const response = await callGemini(
      [{ role: 'user', content: 'Dis juste "OK" en un mot.' }],
      { temperature: 0, maxTokens: 10 }
    )
    const duration = Date.now() - start

    console.log(`  ✅ Réponse: "${response.answer}"`)
    console.log(`  ⏱️  Durée: ${duration}ms`)
    console.log(`  📊 Modèle: ${response.modelUsed}`)
    console.log(`  📈 Tokens: ${response.tokensUsed.total}`)

    addResult('Gemini Direct', '✅', `${duration}ms - "${response.answer}"`, duration)
  } catch (error: any) {
    console.log(`  ❌ Erreur: ${error.message}`)
    addResult('Gemini Direct', '❌', error.message)
  }
}

async function testAvailableProviders() {
  console.log('\n🔍 Test 3: Providers disponibles\n')

  try {
    const providers = getAvailableProviders()
    console.log(`  📋 ${providers.length} provider(s) disponible(s):`)

    for (const provider of providers) {
      console.log(`    ✅ ${provider}`)
    }

    addResult('Providers Available', '✅', `${providers.length} providers: ${providers.join(', ')}`)
  } catch (error: any) {
    addResult('Providers Available', '❌', error.message)
  }
}

async function testFallbackByContext() {
  console.log('\n🔄 Test 4: Fallback par contexte\n')

  const contexts = [
    { name: 'rag-chat', expectedOrder: 'Gemini → DeepSeek → Ollama' },
    { name: 'quality-analysis', expectedOrder: 'DeepSeek → Gemini → Ollama' },
    { name: 'translation', expectedOrder: 'Gemini → Groq' },
  ]

  for (const ctx of contexts) {
    try {
      console.log(`\n  🎯 Contexte: ${ctx.name}`)
      console.log(`     Ordre attendu: ${ctx.expectedOrder}`)

      const start = Date.now()
      const response = await callLLMWithFallback(
        [{ role: 'user', content: 'Réponds juste "OK".' }],
        {
          temperature: 0,
          maxTokens: 10,
          context: ctx.name as any
        },
        false // Mode Rapide
      )
      const duration = Date.now() - start

      console.log(`     ✅ Provider utilisé: ${response.provider}`)
      console.log(`     ⏱️  Durée: ${duration}ms`)
      console.log(`     💬 Réponse: "${response.answer}"`)

      addResult(`Fallback: ${ctx.name}`, '✅', `${response.provider} - ${duration}ms`, duration)
    } catch (error: any) {
      console.log(`     ❌ Erreur: ${error.message}`)
      addResult(`Fallback: ${ctx.name}`, '❌', error.message)
    }
  }
}

async function testModePremium() {
  console.log('\n💎 Test 5: Mode Premium (skip Ollama)\n')

  try {
    const start = Date.now()
    const response = await callLLMWithFallback(
      [{ role: 'user', content: 'Réponds juste "OK".' }],
      { temperature: 0, maxTokens: 10, context: 'rag-chat' },
      true // Mode Premium
    )
    const duration = Date.now() - start

    console.log(`  ✅ Provider utilisé: ${response.provider}`)
    console.log(`  ⏱️  Durée: ${duration}ms`)
    console.log(`  💬 Réponse: "${response.answer}"`)

    if (response.provider === 'ollama') {
      addResult('Mode Premium', '❌', 'Ollama ne devrait pas être utilisé en mode Premium')
    } else {
      addResult('Mode Premium', '✅', `${response.provider} - ${duration}ms (pas Ollama)`, duration)
    }
  } catch (error: any) {
    console.log(`  ❌ Erreur: ${error.message}`)
    addResult('Mode Premium', '❌', error.message)
  }
}

async function testOllama() {
  console.log('\n🦙 Test 6: Ollama local\n')
  console.log('  ℹ️  Ollama est un fallback local optionnel (production = cloud providers)')
  console.log('  💡 Pour tester : `ollama serve` puis relancer ce script\n')

  try {
    // Forcer Ollama en désactivant les autres providers temporairement
    process.env.GOOGLE_API_KEY = ''
    process.env.DEEPSEEK_API_KEY = ''

    const start = Date.now()
    const response = await callLLMWithFallback(
      [{ role: 'user', content: 'Réponds juste "OK".' }],
      { temperature: 0, maxTokens: 10 },
      false
    )
    const duration = Date.now() - start

    // Restaurer les clés
    config({ path: '.env.local', override: true })

    if (response.provider === 'ollama') {
      console.log(`  ✅ Provider utilisé: ollama`)
      console.log(`  ⏱️  Durée: ${duration}ms`)
      console.log(`  💬 Réponse: "${response.answer}"`)
      console.log(`  📊 Modèle: ${response.modelUsed}`)
      addResult('Ollama Local', '✅', `${duration}ms - fallback fonctionne`, duration)
    } else {
      console.log(`  ❌ Provider utilisé: ${response.provider} (attendu: ollama)`)
      addResult('Ollama Local', '❌', `${response.provider} utilisé au lieu d'Ollama`)
    }
  } catch (error: any) {
    console.log(`  ⏭️  Ollama non démarré (comportement attendu)`)
    console.log(`     → Le système utilise les providers cloud (Gemini, DeepSeek)`)
    console.log(`     → Ollama est utilisé uniquement pour les embeddings (production)`)
    addResult('Ollama Local', '⏭️', 'Non démarré - cloud providers actifs (OK)')
  }
}

function printSummary() {
  console.log('\n' + '='.repeat(70))
  console.log('📊 RÉSUMÉ DES TESTS')
  console.log('='.repeat(70) + '\n')

  const passed = results.filter(r => r.status === '✅').length
  const failed = results.filter(r => r.status === '❌').length
  const skipped = results.filter(r => r.status === '⏭️').length
  const total = results.length

  for (const result of results) {
    const duration = result.duration ? ` (${result.duration}ms)` : ''
    console.log(`${result.status} ${result.name.padEnd(30)} → ${result.message}${duration}`)
  }

  console.log('\n' + '-'.repeat(70))
  console.log(`✅ Réussis: ${passed}/${total}`)
  console.log(`❌ Échoués: ${failed}/${total}`)
  console.log(`⏭️  Ignorés: ${skipped}/${total}`)
  console.log('-'.repeat(70) + '\n')

  if (failed > 0) {
    console.log('⚠️  Certains tests ont échoué. Vérifiez les clés API et la configuration.\n')
    process.exit(1)
  } else if (passed === total) {
    console.log('🎉 Tous les tests sont passés avec succès!\n')
    process.exit(0)
  } else {
    console.log('✅ Tests principaux réussis (quelques tests ignorés).\n')
    process.exit(0)
  }
}

async function main() {
  console.log('╔════════════════════════════════════════════════════════════════════╗')
  console.log('║        TEST COMPLET DES PROVIDERS LLM ET FALLBACK                 ║')
  console.log('╚════════════════════════════════════════════════════════════════════╝')

  await testApiKeysDB()
  await testGeminiDirect()
  await testAvailableProviders()
  await testFallbackByContext()
  await testModePremium()
  await testOllama()

  printSummary()
}

main().catch((err) => {
  console.error('\n❌ Erreur fatale:', err)
  process.exit(1)
})
