/**
 * Service de gestion des clés API
 * CRUD sécurisé avec chiffrement
 */

import { db } from '@/lib/db/postgres'
import { encryptApiKey, decryptApiKey, maskApiKey, validateApiKeyFormat } from './encryption'

export interface ApiKeyData {
  id?: string
  provider: 'gemini' | 'deepseek' | 'groq' | 'anthropic' | 'openai' | 'ollama'
  label: string
  apiKey: string // En clair (sera chiffré automatiquement)
  projectId?: string
  baseUrl?: string
  modelDefault?: string
  tier?: 'free' | 'paid' | 'enterprise'
  monthlyQuota?: number
  dailyQuota?: number
  rpmLimit?: number
  isActive?: boolean
  isPrimary?: boolean
}

export interface ApiKeyRecord extends Omit<ApiKeyData, 'apiKey'> {
  id: string
  apiKeyMasked: string
  lastUsedAt: Date | null
  lastError: string | null
  errorCount: number
  createdAt: Date
  updatedAt: Date
}

/**
 * Créer ou mettre à jour une clé API
 */
export async function upsertApiKey(data: ApiKeyData): Promise<ApiKeyRecord> {
  // Valider format
  if (!validateApiKeyFormat(data.provider, data.apiKey)) {
    throw new Error(`Format de clé API invalide pour ${data.provider}`)
  }

  // Chiffrer la clé
  const encrypted = encryptApiKey(data.apiKey)

  const result = await db.query(
    `INSERT INTO api_keys (
      provider, label, api_key_encrypted, project_id, base_url, model_default,
      tier, monthly_quota, daily_quota, rpm_limit, is_active, is_primary
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
    ON CONFLICT (provider) DO UPDATE SET
      label = EXCLUDED.label,
      api_key_encrypted = EXCLUDED.api_key_encrypted,
      project_id = EXCLUDED.project_id,
      base_url = EXCLUDED.base_url,
      model_default = EXCLUDED.model_default,
      tier = EXCLUDED.tier,
      monthly_quota = EXCLUDED.monthly_quota,
      daily_quota = EXCLUDED.daily_quota,
      rpm_limit = EXCLUDED.rpm_limit,
      is_active = EXCLUDED.is_active,
      is_primary = EXCLUDED.is_primary,
      updated_at = NOW()
    RETURNING id, provider, label, project_id, base_url, model_default,
      tier, monthly_quota, daily_quota, rpm_limit, is_active, is_primary,
      last_used_at, last_error, error_count, created_at, updated_at`,
    [
      data.provider,
      data.label,
      encrypted,
      data.projectId || null,
      data.baseUrl || null,
      data.modelDefault || null,
      data.tier || 'free',
      data.monthlyQuota || null,
      data.dailyQuota || null,
      data.rpmLimit || null,
      data.isActive !== false,
      data.isPrimary || false,
    ]
  )

  const row = result.rows[0]
  return {
    ...row,
    apiKeyMasked: maskApiKey(data.apiKey),
    lastUsedAt: row.last_used_at,
    lastError: row.last_error,
    errorCount: row.error_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

/**
 * Récupérer une clé API déchiffrée (pour usage interne uniquement)
 */
export async function getApiKey(provider: string): Promise<string | null> {
  const result = await db.query(
    `SELECT api_key_encrypted FROM api_keys
     WHERE provider = $1 AND is_active = true`,
    [provider]
  )

  if (result.rows.length === 0) return null

  return decryptApiKey(result.rows[0].api_key_encrypted)
}

/**
 * Récupérer les données complètes d'une clé API avec clé décryptée (usage interne)
 */
export async function getApiKeyData(provider: string): Promise<(ApiKeyRecord & { decryptedKey: string }) | null> {
  const result = await db.query(
    `SELECT id, provider, label, api_key_encrypted, project_id, base_url, model_default,
      tier, monthly_quota, daily_quota, rpm_limit, is_active, is_primary,
      last_used_at, last_error, error_count, created_at, updated_at
     FROM api_keys
     WHERE provider = $1`,
    [provider]
  )

  if (result.rows.length === 0) return null

  const row = result.rows[0]
  const decryptedKey = decryptApiKey(row.api_key_encrypted)

  return {
    id: row.id,
    provider: row.provider,
    label: row.label,
    apiKeyMasked: maskApiKey(decryptedKey),
    decryptedKey,
    projectId: row.project_id,
    baseUrl: row.base_url,
    modelDefault: row.model_default,
    tier: row.tier,
    monthlyQuota: row.monthly_quota,
    dailyQuota: row.daily_quota,
    rpmLimit: row.rpm_limit,
    isActive: row.is_active,
    isPrimary: row.is_primary,
    lastUsedAt: row.last_used_at,
    lastError: row.last_error,
    errorCount: row.error_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

/**
 * Lister toutes les clés (masquées)
 */
export async function listApiKeys(): Promise<ApiKeyRecord[]> {
  const result = await db.query(`
    SELECT id, provider, label, project_id, base_url, model_default,
      tier, monthly_quota, daily_quota, rpm_limit, is_active, is_primary,
      last_used_at, last_error, error_count, created_at, updated_at,
      api_key_encrypted
    FROM api_keys
    ORDER BY is_primary DESC, provider ASC
  `)

  return result.rows.map(row => ({
    id: row.id,
    provider: row.provider,
    label: row.label,
    apiKeyMasked: maskApiKey(decryptApiKey(row.api_key_encrypted)),
    projectId: row.project_id,
    baseUrl: row.base_url,
    modelDefault: row.model_default,
    tier: row.tier,
    monthlyQuota: row.monthly_quota,
    dailyQuota: row.daily_quota,
    rpmLimit: row.rpm_limit,
    isActive: row.is_active,
    isPrimary: row.is_primary,
    lastUsedAt: row.last_used_at,
    lastError: row.last_error,
    errorCount: row.error_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }))
}

/**
 * Supprimer une clé API
 */
export async function deleteApiKey(provider: string): Promise<boolean> {
  const result = await db.query(
    `DELETE FROM api_keys WHERE provider = $1`,
    [provider]
  )
  return (result.rowCount || 0) > 0
}

/**
 * Marquer une clé comme utilisée (met à jour last_used_at)
 */
export async function markApiKeyUsed(provider: string): Promise<void> {
  await db.query(
    `UPDATE api_keys SET last_used_at = NOW(), error_count = 0 WHERE provider = $1`,
    [provider]
  )
}

/**
 * Enregistrer une erreur
 */
export async function recordApiKeyError(provider: string, error: string): Promise<void> {
  await db.query(
    `UPDATE api_keys
     SET last_error = $2, error_count = error_count + 1, updated_at = NOW()
     WHERE provider = $1`,
    [provider, error]
  )
}
