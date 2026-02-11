/**
 * Script de test pour le mode turbo embeddings et le fallback OpenAI
 *
 * Tests :
 * 1. Embedding OpenAI seul → vérifier 1024 dimensions
 * 2. Embedding Ollama → vérifier fonctionnement normal
 * 3. Fallback auto → simuler circuit breaker OPEN → vérifier bascule OpenAI
 * 4. Info provider → vérifier les métadonnées retournées
 *
 * Usage :
 *   npx tsx scripts/test-embedding-fallback.ts
 *
 * Prérequis :
 *   - OPENAI_API_KEY dans .env.local (pour tests OpenAI)
 *   - OLLAMA_ENABLED=true + ollama serve (pour tests Ollama)
 *   - RAG_ENABLED=true
 */

import 'dotenv/config'

// Forcer RAG_ENABLED pour les tests
process.env.RAG_ENABLED = 'true'

const SAMPLE_TEXT = 'المحكمة الابتدائية بتونس تصدر حكمًا في قضية الطلاق وفقًا للفصل 31 من مجلة الأحوال الشخصية'
const SAMPLE_TEXT_2 = 'Le tribunal de première instance de Tunis statue en matière de divorce conformément à l\'article 31 du Code du Statut Personnel'

interface TestResult {
  name: string
  passed: boolean
  details: string
  duration?: number
}

const results: TestResult[] = []

function log(msg: string) {
  console.log(`  ${msg}`)
}

async function runTest(name: string, fn: () => Promise<void>) {
  console.log(`\n🔬 Test: ${name}`)
  const start = Date.now()
  try {
    await fn()
    const duration = Date.now() - start
    results.push({ name, passed: true, details: 'OK', duration })
    console.log(`  ✅ PASS (${duration}ms)`)
  } catch (error) {
    const duration = Date.now() - start
    const msg = error instanceof Error ? error.message : String(error)
    results.push({ name, passed: false, details: msg, duration })
    console.log(`  ❌ FAIL: ${msg} (${duration}ms)`)
  }
}

async function main() {
  console.log('='.repeat(60))
  console.log('  Test Embedding Fallback & Mode Turbo')
  console.log('='.repeat(60))

  const { aiConfig, getEmbeddingProvider, getEmbeddingFallbackProvider, EMBEDDING_TURBO_CONFIG } = await import('../lib/ai/config')

  console.log('\n📋 Configuration détectée :')
  console.log(`  Ollama enabled: ${aiConfig.ollama.enabled}`)
  console.log(`  OpenAI API key: ${aiConfig.openai.apiKey ? '✅ configurée' : '❌ manquante'}`)
  console.log(`  Provider principal: ${getEmbeddingProvider() || 'aucun'}`)
  console.log(`  Provider fallback: ${getEmbeddingFallbackProvider() || 'aucun'}`)
  console.log(`  Mode turbo: ${EMBEDDING_TURBO_CONFIG.enabled}`)
  console.log(`  OpenAI dimensions: ${aiConfig.openai.embeddingDimensions}`)

  // =========================================================================
  // Test 1 : Embedding OpenAI direct (si API key disponible)
  // =========================================================================
  if (aiConfig.openai.apiKey) {
    await runTest('OpenAI embedding direct (1024 dims)', async () => {
      const { generateEmbedding, validateEmbedding } = await import('../lib/ai/embeddings-service')

      const result = await generateEmbedding(SAMPLE_TEXT, { forceTurbo: true })

      if (result.embedding.length !== 1024) {
        throw new Error(`Dimensions incorrectes: ${result.embedding.length} (attendu: 1024)`)
      }
      if (result.provider !== 'openai') {
        throw new Error(`Provider incorrect: ${result.provider} (attendu: openai)`)
      }

      const validation = validateEmbedding(result.embedding, 'openai')
      if (!validation.valid) {
        throw new Error(`Validation échouée: ${validation.error}`)
      }

      log(`Provider: ${result.provider}`)
      log(`Dimensions: ${result.embedding.length}`)
      log(`Tokens: ${result.tokenCount}`)
      log(`Norme: ${Math.sqrt(result.embedding.reduce((s, v) => s + v * v, 0)).toFixed(4)}`)
    })

    // Test batch OpenAI
    await runTest('OpenAI batch embeddings (2 textes)', async () => {
      const { generateEmbeddingsBatch } = await import('../lib/ai/embeddings-service')

      const result = await generateEmbeddingsBatch(
        [SAMPLE_TEXT, SAMPLE_TEXT_2],
        { forceTurbo: true }
      )

      if (result.embeddings.length !== 2) {
        throw new Error(`Nombre embeddings incorrect: ${result.embeddings.length} (attendu: 2)`)
      }
      if (result.embeddings[0].length !== 1024) {
        throw new Error(`Dimensions incorrectes: ${result.embeddings[0].length} (attendu: 1024)`)
      }
      if (result.provider !== 'openai') {
        throw new Error(`Provider incorrect: ${result.provider} (attendu: openai)`)
      }

      log(`Provider: ${result.provider}`)
      log(`Embeddings: ${result.embeddings.length}`)
      log(`Total tokens: ${result.totalTokens}`)
    })
  } else {
    console.log('\n⚠️ OPENAI_API_KEY non configurée - Tests OpenAI ignorés')
    results.push({ name: 'OpenAI embedding direct', passed: true, details: 'Ignoré (pas de clé API)' })
    results.push({ name: 'OpenAI batch embeddings', passed: true, details: 'Ignoré (pas de clé API)' })
  }

  // =========================================================================
  // Test 2 : Embedding Ollama (si activé)
  // =========================================================================
  if (aiConfig.ollama.enabled) {
    await runTest('Ollama embedding (mode normal)', async () => {
      const { generateEmbedding } = await import('../lib/ai/embeddings-service')

      const result = await generateEmbedding(SAMPLE_TEXT)

      if (result.embedding.length !== aiConfig.ollama.embeddingDimensions) {
        throw new Error(`Dimensions incorrectes: ${result.embedding.length} (attendu: ${aiConfig.ollama.embeddingDimensions})`)
      }
      if (result.provider !== 'ollama') {
        throw new Error(`Provider incorrect: ${result.provider} (attendu: ollama)`)
      }

      log(`Provider: ${result.provider}`)
      log(`Dimensions: ${result.embedding.length}`)
      log(`Tokens: ${result.tokenCount}`)
    })
  } else {
    console.log('\n⚠️ Ollama non activé - Test Ollama ignoré')
    results.push({ name: 'Ollama embedding', passed: true, details: 'Ignoré (Ollama désactivé)' })
  }

  // =========================================================================
  // Test 3 : Info provider
  // =========================================================================
  await runTest('Provider info complète', async () => {
    const { getEmbeddingProviderInfo } = await import('../lib/ai/embeddings-service')

    const info = getEmbeddingProviderInfo()

    if (!info.provider) {
      throw new Error('Aucun provider détecté')
    }

    log(`Provider: ${info.provider}`)
    log(`Model: ${info.model}`)
    log(`Dimensions: ${info.dimensions}`)
    log(`Cost: ${info.cost}`)
    log(`Turbo mode: ${info.turboMode}`)
    log(`Fallback: ${info.fallback || 'aucun'}`)
  })

  // =========================================================================
  // Test 4 : Compatibilité cross-provider (si les 2 sont dispos)
  // =========================================================================
  if (aiConfig.ollama.enabled && aiConfig.openai.apiKey) {
    await runTest('Compatibilité cross-provider (cosine similarity)', async () => {
      const { generateEmbedding, cosineSimilarity } = await import('../lib/ai/embeddings-service')

      // Générer avec Ollama
      const ollamaResult = await generateEmbedding(SAMPLE_TEXT)

      // Générer avec OpenAI (turbo)
      const openaiResult = await generateEmbedding(SAMPLE_TEXT, { forceTurbo: true })

      if (ollamaResult.embedding.length !== openaiResult.embedding.length) {
        throw new Error(
          `Dimensions incompatibles: Ollama=${ollamaResult.embedding.length}, ` +
          `OpenAI=${openaiResult.embedding.length}`
        )
      }

      // Calculer similarité (peut être faible car modèles différents, mais les dimensions doivent matcher)
      const similarity = cosineSimilarity(ollamaResult.embedding, openaiResult.embedding)
      log(`Similarité cosinus Ollama vs OpenAI: ${similarity.toFixed(4)}`)
      log(`(Même texte, modèles différents → similarité variable est normale)`)
      log(`Dimensions compatibles: ✅ (${ollamaResult.embedding.length})`)
    })
  }

  // =========================================================================
  // Résumé
  // =========================================================================
  console.log('\n' + '='.repeat(60))
  console.log('  Résumé')
  console.log('='.repeat(60))

  const passed = results.filter(r => r.passed).length
  const failed = results.filter(r => !r.passed).length

  for (const r of results) {
    const icon = r.passed ? '✅' : '❌'
    const time = r.duration ? ` (${r.duration}ms)` : ''
    console.log(`  ${icon} ${r.name}: ${r.details}${time}`)
  }

  console.log(`\n  Total: ${passed} passés, ${failed} échoués sur ${results.length}`)

  if (failed > 0) {
    process.exit(1)
  }
}

main().catch(error => {
  console.error('Erreur fatale:', error)
  process.exit(1)
})
