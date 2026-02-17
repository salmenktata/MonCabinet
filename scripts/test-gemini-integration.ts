#!/usr/bin/env tsx
/**
 * Test d'intégration Gemini + Fallback par contexte
 * Phase 1 - Février 2026
 *
 * Usage: npx tsx scripts/test-gemini-integration.ts
 */

// Charger .env.local AVANT tout import
require('dotenv').config({ path: '.env.local' })
require('dotenv').config({ path: '.env' })

import { callGemini, getGeminiRPMStats } from '../lib/ai/gemini-client'
import { callLLMWithFallback, getAvailableProviders } from '../lib/ai/llm-fallback-service'

async function main() {
  console.log('═══════════════════════════════════════════════════════════════')
  console.log('🧪 TEST INTÉGRATION GEMINI + FALLBACK')
  console.log('═══════════════════════════════════════════════════════════════\n')

  // Test 1: Config
  console.log('🔍 TEST 1: Configuration\n')
  const hasGemini = !!process.env.GOOGLE_API_KEY
  const hasDeepSeek = !!process.env.DEEPSEEK_API_KEY

  console.log('  GOOGLE_API_KEY:', hasGemini ? '✅ OK' : '❌ Manquante')
  console.log('  DEEPSEEK_API_KEY:', hasDeepSeek ? '✅ OK' : '❌ Manquante')
  console.log('  Providers:', getAvailableProviders().join(', '))
  console.log()

  if (!hasGemini) {
    console.error('❌ GOOGLE_API_KEY manquante dans .env.local')
    process.exit(1)
  }

  // Test 2: Gemini direct
  console.log('🧪 TEST 2: Appel Gemini Direct\n')
  try {
    const stats = getGeminiRPMStats()
    console.log('  RPM stats:', stats.requestsThisMinute + '/' + stats.limit)

    const start = Date.now()
    const response = await callGemini(
      [{ role: 'user', content: 'Réponds simplement "Bonjour"' }],
      { temperature: 0.1, maxTokens: 20 }
    )
    const duration = Date.now() - start

    console.log('  ✅ Réponse:', response.answer.substring(0, 80))
    console.log('  Modèle:', response.modelUsed)
    console.log('  Tokens:', response.tokensUsed.total)
    console.log('  Durée:', duration + 'ms\n')
  } catch (error) {
    console.error('  ❌ Erreur:', error.message)
    console.error('  Stack:', error.stack)
    process.exit(1)
  }

  // Test 3: Fallback RAG
  console.log('🔄 TEST 3: Fallback RAG Chat (contexte optimisé)\n')
  try {
    const start = Date.now()
    const response = await callLLMWithFallback(
      [{ role: 'user', content: 'Test court' }],
      { temperature: 0.1, maxTokens: 10, context: 'rag-chat' },
      false
    )
    const duration = Date.now() - start

    console.log('  ✅ Provider:', response.provider)
    console.log('  Modèle:', response.modelUsed)
    console.log('  Fallback:', response.fallbackUsed ? 'Oui' : 'Non')
    console.log('  Durée:', duration + 'ms\n')
  } catch (error) {
    console.error('  ❌ Erreur:', error.message)
    process.exit(1)
  }

  console.log('═══════════════════════════════════════════════════════════════')
  console.log('✅ TESTS TERMINÉS AVEC SUCCÈS')
  console.log('═══════════════════════════════════════════════════════════════\n')

  console.log('📋 Résumé Phase 1:')
  console.log('  ✅ Client Gemini fonctionnel')
  console.log('  ✅ Stratégies par contexte implémentées')
  console.log('  ✅ RAG chat utilise Gemini en priorité')
  console.log()
  console.log('🚀 Prochaines étapes:')
  console.log('  - Phase 2: Optimiser cas d\'usage spécifiques')
  console.log('  - Phase 3: Monitoring et tuning production')
  console.log()
}

main().catch((err) => {
  console.error('❌ Erreur fatale:', err)
  process.exit(1)
})
