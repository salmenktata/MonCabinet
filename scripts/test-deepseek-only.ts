#!/usr/bin/env tsx
import { config } from 'dotenv'
config({ path: '.env.local' })

import { callLLMWithFallback } from '../lib/ai/llm-fallback-service'

async function testDeepSeek() {
  console.log('🧪 Test clé DeepSeek après recharge solde\n')

  const apiKey = process.env.DEEPSEEK_API_KEY
  if (!apiKey) {
    console.error('❌ DEEPSEEK_API_KEY non trouvée')
    process.exit(1)
  }

  console.log(`🔑 Clé: ${apiKey.substring(0, 10)}...${apiKey.slice(-6)}`)

  try {
    console.log('\n📡 Appel DeepSeek via callLLMWithFallback...')
    
    const start = Date.now()
    const response = await callLLMWithFallback(
      [{ role: 'user', content: 'Réponds juste "OK" en un mot.' }],
      {
        temperature: 0,
        maxTokens: 10,
        context: 'quality-analysis' // Force DeepSeek comme premier choix
      },
      false
    )
    const duration = Date.now() - start

    console.log('\n✅ DeepSeek fonctionne!')
    console.log(`📝 Réponse: "${response.answer}"`)
    console.log(`⏱️  Durée: ${duration}ms`)
    console.log(`📊 Modèle: ${response.modelUsed}`)
    console.log(`🔢 Tokens: ${response.tokensUsed.total}`)
    console.log(`🎯 Provider: ${response.provider}`)
    
    if (response.fallbackUsed && response.originalProvider !== response.provider) {
      console.log(`\n⚠️  Fallback utilisé: ${response.originalProvider} → ${response.provider}`)
    }

    process.exit(0)
  } catch (error) {
    console.error(`\n❌ Erreur: ${getErrorMessage(error)}`)
    process.exit(1)
  }
}

testDeepSeek()
