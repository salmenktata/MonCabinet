#!/usr/bin/env tsx
/**
 * Script de test de la configuration IA par opération
 *
 * Vérifie que chaque opération :
 * - A une configuration valide
 * - Utilise les bons providers
 * - Respecte les contraintes (timeouts, dimensions, etc.)
 *
 * Usage: npx tsx scripts/test-operations-config.ts
 */

import {
  AI_OPERATIONS_CONFIG,
  getOperationConfig,
  isOperationConfigured,
  getConfiguredOperations,
  getPrimaryProvider,
  getFallbackProviders,
  type OperationName,
} from '@/lib/ai/operations-config'

// =============================================================================
// TESTS
// =============================================================================

function testBasicConfig() {
  console.log('\n🧪 Test 1: Configuration basique\n')

  const operations = getConfiguredOperations()
  console.log(`✅ ${operations.length} opérations configurées: ${operations.join(', ')}`)

  // Vérifier que les 4 opérations de base sont présentes
  const expectedOps: OperationName[] = [
    'indexation',
    'assistant-ia',
    'dossiers-assistant',
    'dossiers-consultation',
  ]

  for (const op of expectedOps) {
    if (!isOperationConfigured(op)) {
      throw new Error(`❌ Opération manquante: ${op}`)
    }
    console.log(`  ✓ ${op}`)
  }
}

function testProvidersConfig() {
  console.log('\n🧪 Test 2: Configuration providers\n')

  const operations = getConfiguredOperations()

  for (const op of operations) {
    const config = getOperationConfig(op)
    const primary = getPrimaryProvider(op)
    const fallbacks = getFallbackProviders(op)

    console.log(`\n📋 ${op}:`)
    console.log(`  Description: ${config.description}`)
    if (primary) {
      console.log(`  Provider: ${primary}`)
      console.log(`  Fallbacks: [${fallbacks.join(', ')}]`)
    }

    // Vérifier embeddings
    if (config.embeddings) {
      console.log(`  Embeddings: ${config.embeddings.provider} (${config.embeddings.dimensions || 1024}-dim)`)
    }

    // Vérifier timeouts
    if (config.timeouts) {
      console.log(`  Timeouts:`)
      if (config.timeouts.embedding) console.log(`    - Embedding: ${config.timeouts.embedding}ms`)
      if (config.timeouts.chat) console.log(`    - Chat: ${config.timeouts.chat}ms`)
      if (config.timeouts.total) console.log(`    - Total: ${config.timeouts.total}ms`)
    }

    // Vérifier LLM config
    if (config.llmConfig) {
      console.log(`  LLM Config:`)
      console.log(`    - Temperature: ${config.llmConfig.temperature}`)
      console.log(`    - MaxTokens: ${config.llmConfig.maxTokens}`)
      if (config.llmConfig.systemPromptType) {
        console.log(`    - PromptType: ${config.llmConfig.systemPromptType}`)
      }
    }
  }
}

function testCoherenceRules() {
  console.log('\n🧪 Test 3: Règles de cohérence\n')

  const operations = getConfiguredOperations()
  let errors = 0

  for (const op of operations) {
    const config = getOperationConfig(op)

    // Règle 1: Indexation doit utiliser Ollama pour LLM (batch gratuit)
    if (op === 'indexation') {
      const primary = getPrimaryProvider(op)
      if (primary !== 'ollama') {
        console.log(`  ❌ ${op}: LLM doit être Ollama (gratuit pour batch)`)
        errors++
      } else {
        console.log(`  ✓ ${op}: Utilise Ollama LLM (gratuit)`)
      }
    }

    // Règle 2: Assistant IA doit utiliser Groq 70b (migration Ollama→Groq Feb 25, 2026)
    if (op === 'assistant-ia') {
      const primary = getPrimaryProvider(op)
      if (primary !== 'groq') {
        console.log(`  ❌ ${op}: Doit utiliser Groq (migration Feb 25 — Ollama remplacé pour scale)`)
        errors++
      } else {
        console.log(`  ✓ ${op}: Utilise Groq llama-3.3-70b (292ms, 500K req/jour gratuit)`)
      }

      // Timeout adapté à Groq (15s suffit, 20s total)
      if (config.timeouts?.chat && config.timeouts.chat > 30000) {
        console.log(`  ⚠ ${op}: Timeout chat élevé pour Groq (${config.timeouts.chat}ms — Groq répond en ~300ms)`)
      } else {
        console.log(`  ✓ ${op}: Timeout Groq adapté (${config.timeouts?.chat || 'N/A'}ms)`)
      }
    }

    // Règle 3: Dossiers doivent utiliser DeepSeek (qualité premium) + OpenAI embeddings
    if (op === 'dossiers-assistant' || op === 'dossiers-consultation') {
      const primary = getPrimaryProvider(op)
      if (primary !== 'deepseek') {
        console.log(`  ⚠ ${op}: Recommandation: utiliser DeepSeek (~$0.10/Mtkn, 64K ctx)`)
      } else {
        console.log(`  ✓ ${op}: Utilise DeepSeek (premium, 64K ctx)`)
      }

      if (config.embeddings?.provider !== 'openai') {
        console.log(`  ⚠ ${op}: Recommandation: utiliser OpenAI embeddings pour qualité (1536-dim)`)
      } else {
        console.log(`  ✓ ${op}: Utilise OpenAI embeddings (qualité max)`)
      }
    }

    // Règle 4: Consultation doit être très factuelle (temp ≤ 0.2)
    if (op === 'dossiers-consultation') {
      if (config.llmConfig?.temperature && config.llmConfig.temperature > 0.2) {
        console.log(`  ❌ ${op}: Temperature trop élevée (${config.llmConfig.temperature} > 0.2)`)
        errors++
      } else {
        console.log(`  ✓ ${op}: Temperature factuelle (${config.llmConfig?.temperature})`)
      }
    }

    // Règle 5: Vérifier dimensions embeddings cohérentes
    if (config.embeddings) {
      const expectedDim = config.embeddings.provider === 'openai' ? 1536 : 1024
      const actualDim = config.embeddings.dimensions || expectedDim

      if (actualDim !== expectedDim) {
        console.log(`  ❌ ${op}: Dimensions incohérentes (${actualDim} au lieu de ${expectedDim} pour ${config.embeddings.provider})`)
        errors++
      }
    }
  }

  if (errors > 0) {
    console.log(`\n❌ ${errors} erreur(s) de cohérence détectée(s)`)
  } else {
    console.log(`\n✅ Toutes les règles de cohérence respectées`)
  }

  return errors === 0
}

function testCostEstimation() {
  console.log('\n🧪 Test 4: Estimation coûts\n')

  const operations = getConfiguredOperations()

  console.log('💰 Estimation mensuelle par opération:\n')

  for (const op of operations) {
    const config = getOperationConfig(op)
    let embeddingCost = 'Gratuit'
    let llmCost = 'Gratuit'

    // Estimer coût embeddings
    if (config.embeddings?.provider === 'openai') {
      embeddingCost = '~0.5-1€/mois (faible volume)'
    }

    // Estimer coût LLM
    const primary = getPrimaryProvider(op)
    if (primary === 'ollama') {
      llmCost = 'Gratuit (self-hosted)'
    } else if (primary === 'groq') {
      llmCost = 'Gratuit (tier gratuit)'
    } else if (primary === 'gemini') {
      llmCost = '~5-10€/mois'
    } else if (primary === 'deepseek') {
      llmCost = '~0.5-1€/mois'
    } else if (primary === 'anthropic') {
      llmCost = '~5-10€/mois'
    }

    console.log(`  ${op}:`)
    console.log(`    Embeddings: ${embeddingCost}`)
    console.log(`    LLM: ${llmCost}`)
  }

  console.log('\n💡 Total estimé: ~$5/mois jusqu\'à ~35K DAU (Groq free tier 500K req/jour)')
  console.log('   Groq 70b (chat) + Groq 8b (classif/expansion) = 2 quotas indépendants gratuits')
  console.log('   DeepSeek dossiers: ~$4/mois (cache hit $0.028/M) | OpenAI embeds: ~$1/mois')
}

// =============================================================================
// MAIN
// =============================================================================

async function main() {
  console.log('🚀 Test de la configuration IA par opération\n')
  console.log('=' .repeat(60))

  try {
    testBasicConfig()
    testProvidersConfig()
    const coherent = testCoherenceRules()
    testCostEstimation()

    console.log('\n' + '='.repeat(60))
    if (coherent) {
      console.log('✅ Tous les tests passés avec succès !\n')
      process.exit(0)
    } else {
      console.log('⚠ Des avertissements ont été détectés (voir ci-dessus)\n')
      process.exit(1)
    }
  } catch (error) {
    console.error('\n❌ Erreur lors des tests:', error)
    process.exit(1)
  }
}

main()
