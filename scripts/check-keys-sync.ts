#!/usr/bin/env tsx
/**
 * Script de vérification de synchronisation des clés API
 *
 * Compare les clés entre :
 * - Variables d'environnement (.env.local)
 * - Base de données (table api_keys)
 * - Base de données production (via tunnel SSH si configuré)
 *
 * Usage:
 *   npx tsx scripts/check-keys-sync.ts
 *   npx tsx scripts/check-keys-sync.ts --fix
 */

import { getApiKey, listApiKeys, upsertApiKey } from '../lib/api-keys/api-keys-service'
import 'dotenv/config'

// Couleurs pour la console
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
}

interface KeyStatus {
  key: string
  provider: string
  envValue: string | undefined
  dbValue: string | undefined
  inSync: boolean
  missing: 'env' | 'db' | 'both' | null
}

async function main() {
  const fixMode = process.argv.includes('--fix')

  console.log(`${colors.blue}===================================================================`)
  console.log('🔍 Vérification Synchronisation Clés API')
  console.log(`===================================================================${colors.reset}\n`)

  // Clés à vérifier
  const keysToCheck = [
    { env: 'GOOGLE_API_KEY', provider: 'google', label: 'Gemini API Key - Projet Qadhya' },
    { env: 'GROQ_API_KEY', provider: 'groq', label: 'Groq API Key - Llama 3.3 70B' },
    { env: 'DEEPSEEK_API_KEY', provider: 'deepseek', label: 'DeepSeek API Key' },
    { env: 'ANTHROPIC_API_KEY', provider: 'anthropic', label: 'Anthropic Claude API' },
    { env: 'OPENAI_API_KEY', provider: 'openai', label: 'OpenAI API - Embeddings Fallback' },
  ]

  const statuses: KeyStatus[] = []
  let differences = 0

  // Charger toutes les clés depuis la DB
  console.log(`${colors.cyan}📊 Chargement clés depuis base de données...${colors.reset}`)
  const dbKeys = await listApiKeys()
  console.log(`${colors.green}✓ ${dbKeys.length} clés trouvées en base${colors.reset}\n`)

  // Comparer chaque clé
  console.log(`${colors.cyan}🔎 Comparaison avec variables d'environnement...${colors.reset}\n`)

  for (const { env, provider, label } of keysToCheck) {
    const envValue = process.env[env]
    let dbValue: string | undefined

    try {
      dbValue = await getApiKey(provider)
    } catch (error) {
      dbValue = undefined
    }

    const inSync = envValue === dbValue && envValue !== undefined
    let missing: 'env' | 'db' | 'both' | null = null

    if (!envValue && !dbValue) {
      missing = 'both'
    } else if (!envValue) {
      missing = 'env'
    } else if (!dbValue) {
      missing = 'db'
    }

    statuses.push({
      key: env,
      provider,
      envValue,
      dbValue,
      inSync,
      missing,
    })

    // Afficher le statut
    const icon = inSync ? '✓' : missing ? '⚠️ ' : '❌'
    const color = inSync ? colors.green : missing ? colors.yellow : colors.red

    console.log(`  ${color}${icon}${colors.reset} ${env} (${provider})`)

    if (missing === 'both') {
      console.log(`     ${colors.yellow}⚠️  MANQUANT partout${colors.reset}`)
      differences++
    } else if (missing === 'env') {
      console.log(`     ${colors.yellow}⚠️  MANQUANT dans .env.local${colors.reset}`)
      console.log(`     DB: ${dbValue?.substring(0, 20)}...`)
      differences++
    } else if (missing === 'db') {
      console.log(`     ${colors.yellow}⚠️  MANQUANT en base de données${colors.reset}`)
      console.log(`     ENV: ${envValue?.substring(0, 20)}...`)
      differences++
    } else if (!inSync) {
      console.log(`     ${colors.red}❌ DIFFÉRENT${colors.reset}`)
      console.log(`     ENV: ${envValue?.substring(0, 20)}...`)
      console.log(`     DB:  ${dbValue?.substring(0, 20)}...`)
      differences++
    }
  }

  // Résumé
  console.log(`\n${colors.blue}===================================================================`)
  console.log('📊 Résumé')
  console.log(`===================================================================${colors.reset}\n`)

  const syncCount = statuses.filter((s) => s.inSync).length
  const totalCount = statuses.length

  if (differences === 0) {
    console.log(`${colors.green}✅ Toutes les clés sont synchronisées (${syncCount}/${totalCount})${colors.reset}\n`)
    process.exit(0)
  }

  console.log(`${colors.yellow}⚠️  ${differences} différence(s) détectée(s)${colors.reset}`)
  console.log(`   Synchronisées : ${colors.green}${syncCount}/${totalCount}${colors.reset}`)
  console.log(`   Désynchronisées : ${colors.red}${differences}/${totalCount}${colors.reset}\n`)

  // Mode fix
  if (fixMode) {
    console.log(`${colors.blue}🔧 Mode --fix activé : Synchronisation automatique...${colors.reset}\n`)

    let fixed = 0

    for (const status of statuses) {
      if (status.missing === 'db' && status.envValue) {
        // Ajouter à la DB depuis ENV
        console.log(`  ${colors.cyan}→${colors.reset} Ajout ${status.key} en base de données...`)

        try {
          await upsertApiKey({
            provider: status.provider as any,
            label: `${status.provider.charAt(0).toUpperCase() + status.provider.slice(1)} API Key`,
            apiKey: status.envValue,
            isActive: true,
          })

          console.log(`    ${colors.green}✓ ${status.key} ajouté${colors.reset}`)
          fixed++
        } catch (error: any) {
          console.log(`    ${colors.red}✗ Erreur: ${error.message}${colors.reset}`)
        }
      } else if (!status.inSync && status.envValue && status.dbValue) {
        // Mettre à jour la DB avec ENV (source de vérité)
        console.log(`  ${colors.cyan}→${colors.reset} Mise à jour ${status.key} en base de données...`)

        try {
          await upsertApiKey({
            provider: status.provider as any,
            label: `${status.provider.charAt(0).toUpperCase() + status.provider.slice(1)} API Key`,
            apiKey: status.envValue,
            isActive: true,
          })

          console.log(`    ${colors.green}✓ ${status.key} mis à jour${colors.reset}`)
          fixed++
        } catch (error: any) {
          console.log(`    ${colors.red}✗ Erreur: ${error.message}${colors.reset}`)
        }
      }
    }

    console.log(`\n${colors.green}✅ ${fixed} clé(s) synchronisée(s)${colors.reset}\n`)
  } else {
    console.log(`${colors.cyan}ℹ️  Pour synchroniser automatiquement, lancez :${colors.reset}`)
    console.log(`   npx tsx scripts/check-keys-sync.ts --fix\n`)
  }

  // Recommandations
  console.log(`${colors.blue}📝 Recommandations :${colors.reset}\n`)

  if (statuses.some((s) => s.missing === 'env')) {
    console.log(`  1. ${colors.yellow}⚠️  Certaines clés manquent dans .env.local${colors.reset}`)
    console.log(`     Ajouter les clés manquantes dans .env.local\n`)
  }

  if (statuses.some((s) => s.missing === 'db' || !s.inSync)) {
    console.log(`  2. ${colors.yellow}⚠️  Base de données désynchronisée${colors.reset}`)
    console.log(`     Lancer : npx tsx scripts/check-keys-sync.ts --fix\n`)
  }

  console.log(`  3. ${colors.cyan}ℹ️  Vérifier aussi VPS production${colors.reset}`)
  console.log(`     Lancer : ./scripts/sync-api-keys.sh --check-only\n`)

  process.exit(differences > 0 ? 1 : 0)
}

main().catch((error) => {
  console.error(`${colors.red}❌ Erreur fatale:${colors.reset}`, error)
  process.exit(1)
})
