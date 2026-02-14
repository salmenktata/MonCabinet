#!/usr/bin/env tsx
/**
 * Test de performance LLM - Dossiers Assistant
 * Mesure le temps de réponse avec le fix operationName
 */

import { structurerDossier } from '@/lib/ai/dossier-structuring-service'

const SIMPLE_PROMPT = `
قضية طلاق بسبب الضرر. الزوج يسيء معاملة الزوجة بشكل مستمر، هناك شهود على ذلك.
الزوجة تطلب الطلاق مع النفقة والمتعة.
`

const COMPLEX_PROMPT = `
شجار ليلي أمام نادٍ، انتهى بإصابة خطيرة. المتهم يؤكد أنه كان يدافع عن نفسه بعد تعرضه لاعتداء جماعي.
الحادثة وقعت الساعة 2 صباحًا. المتهم استخدم زجاجة مكسورة للدفاع عن نفسه.
أصيب الضحية بجروح خطيرة وتوفي بعد 3 أيام. شهود عيان متضاربون.
تقرير الطب الشرعي يؤكد وجود جروح دفاعية على يدي المتهم.
`

async function testPerformance() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('⚡ Test Performance LLM - Dossiers Assistant')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')

  // Test 1 : Prompt simple
  console.log('📝 TEST 1: Prompt simple (divorce)')
  console.log('─'.repeat(50))
  const start1 = Date.now()

  try {
    const result1 = await structurerDossier(SIMPLE_PROMPT, 'test-user', {
      enrichirKnowledgeBase: false, // Désactiver RAG pour test pur LLM
    })

    const duration1 = Date.now() - start1
    const durationSec1 = (duration1 / 1000).toFixed(1)

    console.log(`✅ Succès en ${durationSec1}s`)
    console.log(`   Provider: ${result1.tokensUsed?.provider || 'N/A'}`)
    console.log(`   Tokens: ${result1.tokensUsed?.total || 'N/A'}`)
    console.log(`   Type détecté: ${result1.typeProcedure}`)
    console.log(`   ⏱️  Objectif: < 60s → ${duration1 < 60000 ? '✅ PASS' : '❌ FAIL'}`)
  } catch (error) {
    const duration1 = Date.now() - start1
    console.log(`❌ Échec après ${(duration1 / 1000).toFixed(1)}s`)
    console.log(`   Erreur: ${error instanceof Error ? error.message : String(error)}`)
  }

  console.log()

  // Test 2 : Prompt complexe
  console.log('📝 TEST 2: Prompt complexe (légitime défense)')
  console.log('─'.repeat(50))
  const start2 = Date.now()

  try {
    const result2 = await structurerDossier(COMPLEX_PROMPT, 'test-user', {
      enrichirKnowledgeBase: false,
    })

    const duration2 = Date.now() - start2
    const durationSec2 = (duration2 / 1000).toFixed(1)

    console.log(`✅ Succès en ${durationSec2}s`)
    console.log(`   Provider: ${result2.tokensUsed?.provider || 'N/A'}`)
    console.log(`   Tokens: ${result2.tokensUsed?.total || 'N/A'}`)
    console.log(`   Type détecté: ${result2.typeProcedure}`)
    console.log(`   Faits extraits: ${result2.faitsExtraits?.length || 0}`)
    console.log(`   ⏱️  Objectif: < 60s → ${duration2 < 60000 ? '✅ PASS' : '❌ FAIL'}`)
  } catch (error) {
    const duration2 = Date.now() - start2
    console.log(`❌ Échec après ${(duration2 / 1000).toFixed(1)}s`)
    console.log(`   Erreur: ${error instanceof Error ? error.message : String(error)}`)
  }

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('📊 RÉSULTATS')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')
  console.log('✅ Fix operationName validé si:')
  console.log('   - Provider = gemini (pas ollama)')
  console.log('   - Temps < 60s pour les deux tests')
  console.log('   - Pas de timeout Ollama 120s\n')
}

testPerformance().catch(console.error)
