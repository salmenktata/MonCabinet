#!/usr/bin/env tsx
/**
 * Script de migration : Variables d'environnement → Table api_keys
 *
 * Lit les clés API depuis .env.local et les insère dans la table api_keys
 * avec chiffrement AES-256-GCM.
 *
 * Usage: npx tsx scripts/migrate-platform-configs-to-api-keys.ts
 */

import { config } from 'dotenv'
import { resolve } from 'path'
import { upsertApiKey, listApiKeys } from '@/lib/api-keys/api-keys-service'
import type { ApiKeyData } from '@/lib/api-keys/api-keys-service'

// Charger .env.local
config({ path: resolve(process.cwd(), '.env.local') })

// Configuration par provider (priorité basée sur fallback chain)
const PROVIDER_CONFIGS: Record<string, {
  envKey: string
  label: string
  tier: 'free' | 'paid' | 'enterprise'
  priority: number
  isPrimary: boolean
  isActive: boolean
  modelDefault?: string
  baseUrl?: string
}> = {
  deepseek: {
    envKey: 'DEEPSEEK_API_KEY',
    label: 'DeepSeek AI',
    tier: 'paid',
    priority: 1,
    isPrimary: true,
    isActive: true,
    modelDefault: 'deepseek-chat',
    baseUrl: 'https://api.deepseek.com/v1',
  },
  groq: {
    envKey: 'GROQ_API_KEY',
    label: 'Groq Lightning',
    tier: 'free',
    priority: 2,
    isPrimary: false,
    isActive: true,
    modelDefault: 'llama-3.3-70b-versatile',
    baseUrl: 'https://api.groq.com/openai/v1',
  },
  ollama: {
    envKey: 'OLLAMA_BASE_URL',
    label: 'Ollama Local',
    tier: 'free',
    priority: 3,
    isPrimary: false,
    isActive: true,
    modelDefault: 'qwen2.5:3b',
    baseUrl: process.env.OLLAMA_BASE_URL || 'http://host.docker.internal:11434',
  },
  anthropic: {
    envKey: 'ANTHROPIC_API_KEY',
    label: 'Anthropic Claude',
    tier: 'enterprise',
    priority: 4,
    isPrimary: false,
    isActive: false, // Désactivé par défaut (coûteux)
    modelDefault: 'claude-3-5-sonnet-20241022',
  },
  openai: {
    envKey: 'OPENAI_API_KEY',
    label: 'OpenAI GPT',
    tier: 'paid',
    priority: 5,
    isPrimary: false,
    isActive: false, // Désactivé par défaut (coûteux)
    modelDefault: 'gpt-4o-mini',
  },
  gemini: {
    envKey: 'GEMINI_API_KEY',
    label: 'Google Gemini',
    tier: 'free',
    priority: 6,
    isPrimary: false,
    isActive: true,
    modelDefault: 'gemini-2.0-flash-exp',
  },
}

async function main() {
  console.log('🚀 Migration des clés API vers la base de données...\n')

  // Afficher les clés existantes
  console.log('📋 Clés actuelles dans la DB:')
  const existingKeys = await listApiKeys()
  if (existingKeys.length === 0) {
    console.log('  Aucune clé configurée\n')
  } else {
    existingKeys.forEach(key => {
      console.log(`  - ${key.provider}: ${key.label} (${key.tier}, priorité ${PROVIDER_CONFIGS[key.provider]?.priority || '?'})`)
    })
    console.log('')
  }

  // Migrer chaque provider
  let successCount = 0
  let skipCount = 0
  let errorCount = 0

  for (const [provider, config] of Object.entries(PROVIDER_CONFIGS)) {
    try {
      const apiKey = process.env[config.envKey]

      // Cas spécial Ollama (pas de clé API)
      if (provider === 'ollama') {
        console.log(`⚙️  ${provider.toUpperCase()}: Configuration URL de base`)
        const data: ApiKeyData = {
          provider: 'ollama' as any,
          label: config.label,
          apiKey: 'ollama-local', // Dummy key pour validation
          tier: config.tier,
          baseUrl: config.baseUrl,
          modelDefault: config.modelDefault,
          isActive: config.isActive,
          isPrimary: config.isPrimary,
        }

        await upsertApiKey(data)
        console.log(`   ✅ Configuré: ${config.baseUrl}\n`)
        successCount++
        continue
      }

      if (!apiKey) {
        console.log(`⏭️  ${provider.toUpperCase()}: Clé non trouvée dans .env.local (${config.envKey})`)
        skipCount++
        continue
      }

      console.log(`🔄 ${provider.toUpperCase()}: Migration en cours...`)

      const data: ApiKeyData = {
        provider: provider as any,
        label: config.label,
        apiKey: apiKey,
        tier: config.tier,
        baseUrl: config.baseUrl,
        modelDefault: config.modelDefault,
        isActive: config.isActive,
        isPrimary: config.isPrimary,
      }

      await upsertApiKey(data)
      console.log(`   ✅ Migré: ${config.label} (priorité ${config.priority})\n`)
      successCount++

    } catch (error) {
      console.error(`   ❌ Erreur ${provider}:`, error instanceof Error ? error.message : error)
      errorCount++
    }
  }

  // Résumé
  console.log('\n' + '='.repeat(60))
  console.log('📊 RÉSUMÉ DE LA MIGRATION')
  console.log('='.repeat(60))
  console.log(`✅ Succès:  ${successCount}`)
  console.log(`⏭️  Ignorés:  ${skipCount}`)
  console.log(`❌ Erreurs:  ${errorCount}`)
  console.log('='.repeat(60))

  // Afficher l'ordre de fallback
  console.log('\n🔀 Ordre de Fallback (Priorité):')
  const sortedProviders = Object.entries(PROVIDER_CONFIGS)
    .sort(([, a], [, b]) => a.priority - b.priority)

  sortedProviders.forEach(([provider, config]) => {
    const status = config.isActive ? '✅' : '❌'
    const primary = config.isPrimary ? '🏆' : '  '
    console.log(`  ${config.priority}. ${primary} ${status} ${config.label} (${provider})`)
  })

  console.log('\n✨ Migration terminée!')
  console.log('💡 Astuce: Vérifiez les clés dans /super-admin/settings (tab Architecture IA)\n')

  process.exit(0)
}

main().catch(error => {
  console.error('💥 Erreur fatale:', error)
  process.exit(1)
})
