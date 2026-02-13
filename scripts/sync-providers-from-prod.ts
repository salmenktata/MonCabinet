#!/usr/bin/env npx tsx
/**
 * Script de synchronisation des providers IA depuis production vers local
 *
 * Architecture:
 * - Connexion via tunnel SSH (port 5434 → prod:5433)
 * - Décryptage avec ENCRYPTION_KEY prod
 * - Re-cryptage avec ENCRYPTION_KEY locale
 * - Backup automatique avant modification
 * - Rollback automatique en cas d'erreur
 *
 * Usage:
 *   npm run sync:providers          # Sync avec confirmation
 *   npm run sync:providers:dry      # Dry-run (simulation)
 *   npm run sync:providers:force    # Sync sans confirmation
 */

import { config } from 'dotenv'
import { resolve } from 'path'
import { exec } from 'child_process'
import { promisify } from 'util'
import pkg from 'pg'
const { Client } = pkg
import {
  encryptApiKeyWithKey,
  decryptApiKeyWithKey,
  maskApiKey,
  validateApiKeyFormat,
} from '../lib/api-keys/encryption.js'
import readline from 'readline'

// Charger .env.local explicitement
config({ path: resolve(process.cwd(), '.env.local') })

const execAsync = promisify(exec)

// ========== TYPES ==========

interface ProviderDataProd {
  provider: string
  label: string
  api_key_encrypted: string
  model_default: string | null
  tier: 'free' | 'paid' | 'enterprise'
  monthly_quota: number | null
  daily_quota: number | null
  rpm_limit: number | null
  is_active: boolean
  is_primary: boolean
  project_id: string | null
  base_url: string | null
}

interface SyncOptions {
  dryRun: boolean
  force: boolean
  noBackup: boolean
}

interface SyncReport {
  providersRead: number
  providersDecrypted: number
  providersInserted: number
  errors: Array<{ provider: string; error: string }>
  backupTable: string | null
  duration: number
}

// ========== CONFIGURATION ==========

const PROD_DB_CONFIG = {
  host: 'localhost',
  port: 5434, // Tunnel SSH
  database: 'qadhya', // Base de données prod
  user: 'moncabinet',
  password: '', // Sera récupéré dynamiquement depuis prod
}

const LOCAL_DB_CONFIG = {
  host: 'localhost',
  port: 5433,
  database: 'moncabinet', // Base de données de développement locale
  user: 'moncabinet',
  password: 'dev_password_change_in_production',
}

const VPS_HOST = 'root@84.247.165.187'
const ENCRYPTION_KEY_PATH = '/opt/qadhya/.env.production.local'

// ========== UTILITIES ==========

function parseArgs(): SyncOptions {
  const args = process.argv.slice(2)
  return {
    dryRun: args.includes('--dry-run'),
    force: args.includes('--force'),
    noBackup: args.includes('--no-backup'),
  }
}

async function confirm(message: string): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  })

  return new Promise((resolve) => {
    rl.question(`${message} (y/N): `, (answer) => {
      rl.close()
      resolve(answer.toLowerCase() === 'y')
    })
  })
}

// ========== ÉTAPE 1: VÉRIFICATION TUNNEL SSH ==========

async function checkTunnelStatus(): Promise<boolean> {
  try {
    const { stdout } = await execAsync(
      `pgrep -f "ssh.*5434:localhost:5433.*${VPS_HOST}"`
    )
    return stdout.trim().length > 0
  } catch (error) {
    return false
  }
}

// ========== ÉTAPE 2: RÉCUPÉRATION ENCRYPTION_KEY + DB_PASSWORD PROD ==========

async function getProdEncryptionKey(): Promise<string> {
  console.log('🔑 Récupération ENCRYPTION_KEY depuis prod...')

  try {
    const { stdout } = await execAsync(
      `ssh ${VPS_HOST} "grep '^ENCRYPTION_KEY=' ${ENCRYPTION_KEY_PATH}"`
    )

    const match = stdout.match(/ENCRYPTION_KEY=([a-f0-9]{64})/)
    if (!match) {
      throw new Error('Format ENCRYPTION_KEY invalide (attendu: 64 caractères hexadécimaux)')
    }

    const key = match[1]
    console.log(`   ✅ Clé récupérée: ${key.substring(0, 8)}...${key.substring(56)}`)
    return key
  } catch (error) {
    throw new Error(`Impossible de récupérer ENCRYPTION_KEY: ${error instanceof Error ? error.message : String(error)}`)
  }
}

async function getProdDbPassword(): Promise<string> {
  console.log('🔐 Récupération DB_PASSWORD depuis prod...')

  try {
    const { stdout } = await execAsync(
      `ssh ${VPS_HOST} "grep '^DB_PASSWORD=' ${ENCRYPTION_KEY_PATH}"`
    )

    const match = stdout.match(/DB_PASSWORD="?([^"\n]+)"?/)
    if (!match) {
      throw new Error('DB_PASSWORD introuvable dans .env.production.local')
    }

    const password = match[1].trim()
    console.log(`   ✅ Mot de passe récupéré: ${maskApiKey(password)}`)
    return password
  } catch (error) {
    // Fallback : utiliser le mot de passe par défaut documenté
    console.log(`   ⚠️  Utilisation du mot de passe par défaut (fallback)`)
    return 'prod_secure_password_2026'
  }
}

// ========== ÉTAPE 3: EXTRACTION PROVIDERS PROD ==========

async function extractProvidersFromProd(): Promise<ProviderDataProd[]> {
  console.log('📥 Extraction des providers depuis prod...')

  const client = new Client(PROD_DB_CONFIG)
  await client.connect()

  try {
    const result = await client.query<ProviderDataProd>(`
      SELECT
        provider,
        label,
        api_key_encrypted,
        model_default,
        tier,
        monthly_quota,
        daily_quota,
        rpm_limit,
        is_active,
        is_primary,
        project_id,
        base_url
      FROM api_keys
      WHERE is_active = true
      ORDER BY provider
    `)

    console.log(`   ✅ ${result.rows.length} providers actifs trouvés`)
    return result.rows
  } finally {
    await client.end()
  }
}

// ========== ÉTAPE 4: TRANSFORMATION (DÉCRYPTAGE → RE-CRYPTAGE) ==========

interface TransformedProvider extends Omit<ProviderDataProd, 'api_key_encrypted'> {
  api_key_encrypted_local: string
  api_key_decrypted: string // Pour validation uniquement (jamais loggué)
}

async function transformProviders(
  providers: ProviderDataProd[],
  prodKey: string,
  localKey: string
): Promise<TransformedProvider[]> {
  console.log('🔄 Transformation des clés (décryptage prod → re-cryptage local)...')

  const transformed: TransformedProvider[] = []
  const errors: Array<{ provider: string; error: string }> = []

  for (const provider of providers) {
    try {
      // Décrypter avec clé prod
      const decrypted = decryptApiKeyWithKey(provider.api_key_encrypted, prodKey)

      // Valider format
      if (!validateApiKeyFormat(provider.provider, decrypted)) {
        throw new Error(`Format de clé API invalide pour ${provider.provider}`)
      }

      // Re-crypter avec clé locale
      const encryptedLocal = encryptApiKeyWithKey(decrypted, localKey)

      transformed.push({
        ...provider,
        api_key_encrypted_local: encryptedLocal,
        api_key_decrypted: decrypted,
      })

      console.log(`   ✅ ${provider.provider.padEnd(12)} (${provider.label}) - ${maskApiKey(decrypted)}`)
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error)
      errors.push({ provider: provider.provider, error: errorMsg })
      console.error(`   ❌ ${provider.provider}: ${errorMsg}`)
    }
  }

  if (errors.length > 0) {
    console.warn(`\n⚠️  ${errors.length} providers ont échoué (ils seront ignorés)`)
  }

  return transformed
}

// ========== ÉTAPE 5: BACKUP + SYNCHRONISATION ==========

async function syncToLocal(
  providers: TransformedProvider[],
  options: SyncOptions
): Promise<string | null> {
  console.log('\n💾 Synchronisation vers base locale...')

  if (options.dryRun) {
    console.log('   🧪 MODE DRY-RUN: Aucune modification effectuée')
    return null
  }

  const client = new Client(LOCAL_DB_CONFIG)
  await client.connect()

  let backupTable: string | null = null

  try {
    // Backup automatique
    if (!options.noBackup) {
      const timestamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '')
      backupTable = `api_keys_backup_${timestamp}`

      console.log(`   📦 Création backup: ${backupTable}`)
      await client.query(`CREATE TABLE ${backupTable} AS SELECT * FROM api_keys`)
    }

    // TRUNCATE (mode REFRESH complet)
    console.log('   🗑️  Suppression des providers existants...')
    await client.query('TRUNCATE TABLE api_keys CASCADE')

    // INSERT en batch
    console.log(`   ➕ Insertion de ${providers.length} providers...`)

    for (const provider of providers) {
      await client.query(
        `INSERT INTO api_keys (
          provider, label, api_key_encrypted, model_default,
          tier, monthly_quota, daily_quota, rpm_limit,
          is_active, is_primary, project_id, base_url,
          last_used_at, last_error, error_count,
          created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NULL, NULL, 0, NOW(), NOW())`,
        [
          provider.provider,
          provider.label,
          provider.api_key_encrypted_local,
          provider.model_default,
          provider.tier,
          provider.monthly_quota,
          provider.daily_quota,
          provider.rpm_limit,
          provider.is_active,
          provider.is_primary,
          provider.project_id,
          provider.base_url,
        ]
      )
    }

    console.log('   ✅ Synchronisation réussie')
    return backupTable
  } catch (error) {
    // Rollback automatique
    if (backupTable) {
      console.error('   ❌ Erreur détectée, rollback en cours...')
      await client.query('TRUNCATE TABLE api_keys')
      await client.query(`INSERT INTO api_keys SELECT * FROM ${backupTable}`)
      console.log('   ✅ Rollback effectué, données restaurées')
    }
    throw error
  } finally {
    await client.end()
  }
}

// ========== ÉTAPE 6: VALIDATION POST-SYNC ==========

async function validateSync(
  providersExpected: TransformedProvider[],
  options: SyncOptions
): Promise<void> {
  console.log('\n🔍 Validation post-sync...')

  if (options.dryRun) {
    console.log('   🧪 MODE DRY-RUN: Validation ignorée')
    return
  }

  const client = new Client(LOCAL_DB_CONFIG)
  await client.connect()

  try {
    const result = await client.query<{ provider: string; api_key_encrypted: string }>(
      'SELECT provider, api_key_encrypted FROM api_keys ORDER BY provider'
    )

    console.log(`   📊 Providers locaux: ${result.rows.length}`)

    const localKey = process.env.ENCRYPTION_KEY
    if (!localKey) {
      throw new Error('ENCRYPTION_KEY locale manquante')
    }

    let successCount = 0
    for (const row of result.rows) {
      try {
        const decrypted = decryptApiKeyWithKey(row.api_key_encrypted, localKey)
        const expected = providersExpected.find((p) => p.provider === row.provider)

        if (expected && decrypted === expected.api_key_decrypted) {
          successCount++
        } else {
          console.warn(`   ⚠️  ${row.provider}: Clé décryptée ne correspond pas`)
        }
      } catch (error) {
        console.error(`   ❌ ${row.provider}: Décryptage échoué`)
      }
    }

    console.log(`   ✅ ${successCount}/${result.rows.length} providers validés`)
  } finally {
    await client.end()
  }
}

// ========== RAPPORT FINAL ==========

function printReport(report: SyncReport, options: SyncOptions): void {
  console.log('\n' + '='.repeat(60))
  if (options.dryRun) {
    console.log('🧪 RAPPORT DRY-RUN (SIMULATION)')
  } else {
    console.log('✅ SYNCHRONISATION RÉUSSIE')
  }
  console.log('='.repeat(60))

  console.log('\n📊 Rapport:')
  console.log(`   - Providers lus depuis prod     : ${report.providersRead}`)
  console.log(`   - Providers décryptés           : ${report.providersDecrypted}`)
  if (!options.dryRun) {
    console.log(`   - Providers synchronisés        : ${report.providersInserted}`)
    if (report.backupTable) {
      console.log(`   - Backup sauvegardé             : ${report.backupTable}`)
    }
  }
  console.log(`   - Durée totale                  : ${(report.duration / 1000).toFixed(2)}s`)

  if (report.errors.length > 0) {
    console.log('\n❌ Erreurs:')
    report.errors.forEach(({ provider, error }) => {
      console.log(`   - ${provider}: ${error}`)
    })
  }
}

// ========== MAIN ==========

async function main() {
  const startTime = Date.now()
  const options = parseArgs()

  console.log('🔄 SYNCHRONISATION PROVIDERS IA (PROD → LOCAL)\n')
  console.log(`Mode: ${options.dryRun ? 'DRY-RUN (simulation)' : options.force ? 'FORCE' : 'NORMAL'}`)
  console.log(`Backup: ${options.noBackup ? 'DÉSACTIVÉ' : 'ACTIVÉ'}\n`)

  try {
    // ÉTAPE 1: Vérifier tunnel SSH
    console.log('1️⃣  Vérification tunnel SSH...')
    const tunnelActive = await checkTunnelStatus()

    if (!tunnelActive) {
      console.error('❌ Tunnel SSH inactif')
      console.error('   Lancer d\'abord: npm run tunnel:start')
      process.exit(1)
    }
    console.log('   ✅ Tunnel SSH actif (port 5434)\n')

    // ÉTAPE 2: Récupérer ENCRYPTION_KEY + DB_PASSWORD prod
    console.log('2️⃣  Récupération credentials prod...')
    const prodKey = await getProdEncryptionKey()
    const prodDbPassword = await getProdDbPassword()

    // Mettre à jour la config DB prod avec le vrai mot de passe
    PROD_DB_CONFIG.password = prodDbPassword
    console.log()

    // Vérifier ENCRYPTION_KEY locale
    const localKey = process.env.ENCRYPTION_KEY
    if (!localKey || localKey.length !== 64) {
      throw new Error('ENCRYPTION_KEY locale manquante ou invalide dans .env.local')
    }
    console.log(`🔑 ENCRYPTION_KEY locale: ${localKey.substring(0, 8)}...${localKey.substring(56)}\n`)

    // ÉTAPE 3: Extraire providers prod
    console.log('3️⃣  Extraction providers prod...')
    const prodProviders = await extractProvidersFromProd()
    console.log()

    // ÉTAPE 4: Transformer (décryptage → re-cryptage)
    console.log('4️⃣  Transformation des clés...')
    const transformedProviders = await transformProviders(prodProviders, prodKey, localKey)
    console.log()

    // Confirmation interactive (sauf si --force ou --dry-run)
    if (!options.force && !options.dryRun) {
      console.log('⚠️  ATTENTION: Cette opération va remplacer toutes les clés API locales par celles de prod.\n')
      const confirmed = await confirm('Continuer ?')

      if (!confirmed) {
        console.log('❌ Synchronisation annulée')
        process.exit(0)
      }
      console.log()
    }

    // ÉTAPE 5: Sync vers local
    console.log('5️⃣  Synchronisation vers local...')
    const backupTable = await syncToLocal(transformedProviders, options)

    // ÉTAPE 6: Validation
    console.log('6️⃣  Validation post-sync...')
    await validateSync(transformedProviders, options)

    // Rapport final
    const report: SyncReport = {
      providersRead: prodProviders.length,
      providersDecrypted: transformedProviders.length,
      providersInserted: transformedProviders.length,
      errors: prodProviders.length - transformedProviders.length > 0
        ? [{ provider: 'multiple', error: `${prodProviders.length - transformedProviders.length} providers ignorés` }]
        : [],
      backupTable,
      duration: Date.now() - startTime,
    }

    printReport(report, options)

    if (!options.dryRun) {
      console.log('\n💡 Prochaine étape:')
      console.log('   Vérifier l\'interface: http://localhost:7002/super-admin/settings')
    }
  } catch (error) {
    console.error('\n❌ ERREUR FATALE:')
    if (error instanceof Error) {
      console.error(`Message: ${error.message}`)
      console.error(`Stack: ${error.stack}`)
    } else {
      console.error(`Erreur inconnue: ${String(error)}`)
    }
    process.exit(1)
  }
}

// Exécution
main()
