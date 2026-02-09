/**
 * Service de chiffrement/déchiffrement pour clés API
 * Utilise AES-256-GCM avec la clé ENCRYPTION_KEY de .env
 */

import crypto from 'crypto'

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 16
const TAG_LENGTH = 16

function getEncryptionKey(): Buffer {
  const key = process.env.ENCRYPTION_KEY
  if (!key) {
    throw new Error('ENCRYPTION_KEY manquante (générer: openssl rand -hex 32)')
  }
  return Buffer.from(key, 'hex')
}

export function encryptApiKey(apiKey: string): string {
  const key = getEncryptionKey()
  const iv = crypto.randomBytes(IV_LENGTH)
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv)
  
  const encrypted = Buffer.concat([
    cipher.update(apiKey, 'utf8'),
    cipher.final()
  ])
  
  const tag = cipher.getAuthTag()
  const result = Buffer.concat([iv, tag, encrypted])
  
  return result.toString('base64')
}

export function decryptApiKey(encryptedData: string): string {
  const key = getEncryptionKey()
  const data = Buffer.from(encryptedData, 'base64')
  
  const iv = data.subarray(0, IV_LENGTH)
  const tag = data.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH)
  const encrypted = data.subarray(IV_LENGTH + TAG_LENGTH)
  
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(tag)
  
  const decrypted = Buffer.concat([
    decipher.update(encrypted),
    decipher.final()
  ])
  
  return decrypted.toString('utf8')
}

export function maskApiKey(apiKey: string): string {
  if (apiKey.length <= 12) return '*'.repeat(apiKey.length)
  return apiKey.substring(0, 6) + '...' + apiKey.substring(apiKey.length - 5)
}

export function validateApiKeyFormat(provider: string, apiKey: string): boolean {
  const patterns: Record<string, RegExp> = {
    gemini: /^AIza[a-zA-Z0-9_-]{35}$/,
    deepseek: /^sk-[a-zA-Z0-9]{32,}$/,
    groq: /^gsk_[a-zA-Z0-9]{40,}$/,
    anthropic: /^sk-ant-api03-[a-zA-Z0-9_-]{90,}$/,
    openai: /^sk-(proj-)?[a-zA-Z0-9_-]{20,}$/,  // Support ancien format (sk-...) et nouveau (sk-proj-...)
  }

  const pattern = patterns[provider]
  return pattern ? pattern.test(apiKey) : apiKey.length > 0
}
