#!/usr/bin/env ts-node

/**
 * Script de migration des clés API depuis platform_config vers api_keys
 *
 * Ce script :
 * 1. Lit toutes les clés depuis platform_config WHERE category='llm'
 * 2. Pour chaque clé : vérifie si existe déjà dans api_keys
 * 3. Si non : insère avec chiffrement AES-256
 * 4. Si oui : mise à jour si différente
 * 5. Ne supprime PAS platform_config (rollback temporaire si besoin)
 *
 * Usage:
 *   npm run migrate:api-keys
 *   # ou
 *   ts-node scripts/migrate-platform-config-to-api-keys.ts
 */

import { config } from 'dotenv'
import { resolve } from 'path'
import { Pool } from 'pg'
import { upsertApiKey, getApiKeyData } from '@/lib/api-keys/api-keys-service'

// Charger les variables d'environnement depuis .env.local
config({ path: resolve(process.cwd(), '.env.local') })

// Créer une instance de pool PostgreSQL pour le script
const db = new Pool({
  connectionString: process.env.DATABASE_URL,
})

interface PlatformConfigRow {
  key: string
  value: string
  category: string
  updated_at: Date
}

// Mapping des clés platform_config vers providers
const KEY_TO_PROVIDER_MAP: Record<string, string> = {
  DEEPSEEK_API_KEY: 'deepseek',
  GROQ_API_KEY: 'groq',
  OPENAI_API_KEY: 'openai',
}

async function main() {
  console.log('🚀 Démarrage de la migration platform_config → api_keys\n')

  try {
    // 1. Récupérer toutes les clés LLM depuis platform_config
    const result = await db.query<PlatformConfigRow>(
      `SELECT key, value, category, updated_at
       FROM platform_config
       WHERE category = 'llm'
         AND key IN ('DEEPSEEK_API_KEY', 'GROQ_API_KEY', 'OPENAI_API_KEY')
       ORDER BY key`
    )

    const configRows = result.rows

    if (configRows.length === 0) {
      console.log('⚠️  Aucune clé API trouvée dans platform_config (category=llm)')
      console.log('   Vérifiez que des clés existent dans la table platform_config\n')
      return
    }

    console.log(`📋 ${configRows.length} clé(s) trouvée(s) dans platform_config:\n`)

    let migratedCount = 0
    let skippedCount = 0
    let updatedCount = 0

    // 2. Migrer chaque clé
    for (const row of configRows) {
      const provider = KEY_TO_PROVIDER_MAP[row.key]
      const apiKeyValue = row.value

      if (!provider) {
        console.log(`⚠️  Clé ${row.key} ignorée (provider inconnu)\n`)
        skippedCount++
        continue
      }

      console.log(`🔑 Migration: ${row.key} → provider="${provider}"`)
      console.log(`   Valeur: ${apiKeyValue.substring(0, 10)}...${apiKeyValue.substring(apiKeyValue.length - 4)}`)

      // Vérifier si existe déjà dans api_keys
      const existingKey = await getApiKeyData(provider)

      if (existingKey) {
        // Comparer les valeurs (décryptée vs platform_config)
        if (existingKey.decryptedKey === apiKeyValue) {
          console.log(`   ✅ Clé déjà présente dans api_keys (identique)\n`)
          skippedCount++
          continue
        } else {
          console.log(`   🔄 Clé différente détectée, mise à jour...`)
        }
      }

      // Upsert dans api_keys
      try {
        await upsertApiKey({
          provider: provider as 'gemini' | 'deepseek' | 'groq' | 'anthropic' | 'openai' | 'ollama',
          label: `${provider.charAt(0).toUpperCase() + provider.slice(1)} (migré depuis platform_config)`,
          apiKey: apiKeyValue,
          isActive: true,
          isPrimary: provider === 'deepseek', // DeepSeek par défaut en primaire
        })

        if (existingKey) {
          console.log(`   ✅ Clé mise à jour dans api_keys\n`)
          updatedCount++
        } else {
          console.log(`   ✅ Clé insérée dans api_keys\n`)
          migratedCount++
        }
      } catch (error) {
        console.error(`   ❌ Erreur lors de l'upsert:`, error)
        console.error(`      Clé: ${row.key}\n`)
      }
    }

    // 3. Résumé
    console.log('═══════════════════════════════════════════════════════════')
    console.log('📊 RÉSUMÉ DE LA MIGRATION\n')
    console.log(`   ✅ Clés migrées (nouvelles) : ${migratedCount}`)
    console.log(`   🔄 Clés mises à jour         : ${updatedCount}`)
    console.log(`   ⏭️  Clés ignorées (déjà OK)  : ${skippedCount}`)
    console.log(`   📝 Total traité              : ${configRows.length}\n`)
    console.log('═══════════════════════════════════════════════════════════\n')

    // 4. Avertissement sur platform_config
    console.log('⚠️  IMPORTANT :')
    console.log('   - La table platform_config n\'a PAS été supprimée (rollback possible)')
    console.log('   - Vérifiez que les clés sont bien dans api_keys (Adminer/psql)')
    console.log('   - Testez les connexions : /api/admin/api-keys/[provider]/test')
    console.log('   - Après validation, vous pourrez supprimer les clés de platform_config\n')

    // 5. Vérification finale
    console.log('🔍 Vérification finale dans api_keys:\n')
    const apiKeysResult = await db.query(
      `SELECT provider, label, is_active, is_primary, created_at
       FROM api_keys
       WHERE provider IN ('deepseek', 'groq', 'openai')
       ORDER BY provider`
    )

    if (apiKeysResult.rows.length > 0) {
      console.log('   Provider   | Label                          | Actif | Primaire | Créé le')
      console.log('   -----------|--------------------------------|-------|----------|------------------')
      for (const row of apiKeysResult.rows) {
        const provider = row.provider.padEnd(10)
        const label = (row.label || '').substring(0, 30).padEnd(30)
        const active = row.is_active ? '  ✅  ' : '  ❌  '
        const primary = row.is_primary ? '   🏆   ' : '        '
        const createdAt = new Date(row.created_at).toLocaleString('fr-FR')
        console.log(`   ${provider} | ${label} | ${active} | ${primary} | ${createdAt}`)
      }
      console.log('')
    } else {
      console.log('   ⚠️  Aucune clé trouvée dans api_keys après migration\n')
    }

    console.log('✅ Migration terminée avec succès!\n')
  } catch (error) {
    console.error('\n❌ ERREUR LORS DE LA MIGRATION:', error)
    console.error('   Détails:', error instanceof Error ? error.message : error)
    process.exit(1)
  } finally {
    await db.end()
  }
}

// Exécution
main()
