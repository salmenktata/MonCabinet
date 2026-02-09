#!/usr/bin/env tsx
/**
 * Importe les clés API depuis .env.local vers la base de données
 */

// Charger .env.local avant toute autre chose
import { config } from 'dotenv'
config({ path: '.env.local' })

import { upsertApiKey, listApiKeys } from '../lib/api-keys/api-keys-service'

async function main() {
  console.log('🔐 Import des clés API vers la base de données\n')

  const imports = []

  // Gemini
  if (process.env.GOOGLE_API_KEY) {
    try {
      await upsertApiKey({
        provider: 'gemini',
        label: 'Gemini API Key - Projet Qadhya',
        apiKey: process.env.GOOGLE_API_KEY,
        projectId: '106207207546',
        baseUrl: 'https://generativelanguage.googleapis.com',
        modelDefault: process.env.GEMINI_MODEL || 'gemini-2.0-flash-exp',
        tier: 'free',
        monthlyQuota: 1000000, // 1M tokens/jour tier gratuit
        isActive: true,
        isPrimary: true,
      })
      imports.push('✅ gemini: Gemini API Key - Projet Qadhya')
    } catch (error: any) {
      imports.push(`❌ gemini: ${error.message}`)
    }
  }

  // DeepSeek
  if (process.env.DEEPSEEK_API_KEY) {
    try {
      await upsertApiKey({
        provider: 'deepseek',
        label: 'DeepSeek API Key',
        apiKey: process.env.DEEPSEEK_API_KEY,
        baseUrl: 'https://api.deepseek.com',
        modelDefault: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
        tier: 'paid',
        isActive: true,
        isPrimary: false,
      })
      imports.push('✅ deepseek: DeepSeek API Key')
    } catch (error: any) {
      imports.push(`❌ deepseek: ${error.message}`)
    }
  }

  // Groq (si présent)
  if (process.env.GROQ_API_KEY) {
    try {
      await upsertApiKey({
        provider: 'groq',
        label: 'Groq API Key - Llama 3.3 70B',
        apiKey: process.env.GROQ_API_KEY,
        baseUrl: 'https://api.groq.com/openai/v1',
        modelDefault: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
        tier: 'free',
        rpmLimit: 14, // 14 requêtes par minute
        isActive: true,
        isPrimary: false,
      })
      imports.push('✅ groq: Groq API Key - Llama 3.3 70B')
    } catch (error: any) {
      imports.push(`❌ groq: ${error.message}`)
    }
  }

  // Afficher résultats
  console.log(imports.join('\n'))
  console.log('\n📋 Clés stockées:\n')

  // Lister toutes les clés
  const keys = await listApiKeys()

  console.log('┌─────────┬──────────┬────────────────────┬──────┬────────┬─────────┐')
  console.log('│ Provider│  Label   │      API Key       │ Tier │ Active │ Primary │')
  console.log('├─────────┼──────────┼────────────────────┼──────┼────────┼─────────┤')

  for (const key of keys) {
    const provider = key.provider.padEnd(8)
    const label = (key.label.length > 10 ? key.label.substring(0, 7) + '...' : key.label).padEnd(10)
    const apiKey = key.apiKeyMasked.padEnd(20)
    const tier = (key.tier || 'free').padEnd(6)
    const active = key.isActive ? '✅'.padEnd(8) : '❌'.padEnd(8)
    const primary = key.isPrimary ? '🏆'.padEnd(9) : ''.padEnd(9)

    console.log(`│ ${provider}│ ${label}│ ${apiKey}│ ${tier}│ ${active}│ ${primary}│`)
  }

  console.log('└─────────┴──────────┴────────────────────┴──────┴────────┴─────────┘')

  console.log('\n✅ Import terminé!')
  process.exit(0)
}

main().catch((err) => {
  console.error('❌ Erreur:', err)
  process.exit(1)
})
