/**
 * API Monitoring - Vérification Variables d'Environnement
 *
 * GET /api/admin/monitoring/system-config
 *
 * Vérifie la présence des variables d'environnement critiques,
 * importantes et signale les variables dépréciées.
 *
 * Auth: Protégée par middleware session super-admin (route /super-admin/*)
 *
 * Réponse:
 * {
 *   "status": "ok" | "warning" | "critical",
 *   "missing": ["DATABASE_URL"],           // rouge: REQUIRED absentes
 *   "present": ["NEXTAUTH_SECRET", ...],   // vert: REQUIRED présentes
 *   "importantMissing": ["REDIS_URL"],     // jaune: importantes absentes
 *   "importantPresent": ["GROQ_API_KEY"],  // vert: importantes présentes
 *   "deprecated": [{"name":"ANTHROPIC_API_KEY","replacedBy":"GROQ_API_KEY"}],
 *   "ragConfig": { ... },
 *   "totalChecked": 25
 * }
 */

import { NextResponse } from 'next/server'

// Variables OBLIGATOIRES — leur absence = erreur critique (rouge)
const REQUIRED_VARS = [
  'DATABASE_URL',
  'NEXTAUTH_SECRET',
  'NEXTAUTH_URL',
  'MINIO_ENDPOINT',
  'MINIO_ACCESS_KEY',
  'MINIO_SECRET_KEY',
  'RAG_ENABLED',
  'CRON_SECRET',
  'NODE_ENV',
]

// Variables importantes — leur absence = avertissement (jaune)
const IMPORTANT_VARS = [
  'OLLAMA_ENABLED',
  'OLLAMA_BASE_URL',
  'OPENAI_API_KEY',
  'GROQ_API_KEY',
  'GOOGLE_API_KEY',
  'REDIS_URL',
  'ENCRYPTION_KEY',
  'NEXT_PUBLIC_APP_URL',
]

// Variables dépréciées — leur présence = avertissement (jaune)
const DEPRECATED_VARS: { name: string; replacedBy: string }[] = [
  { name: 'ANTHROPIC_API_KEY', replacedBy: 'GOOGLE_API_KEY' },
  { name: 'NEXT_PUBLIC_SUPABASE_URL', replacedBy: 'DATABASE_URL' },
  { name: 'NEXT_PUBLIC_SUPABASE_ANON_KEY', replacedBy: 'NEXTAUTH_SECRET' },
]

export async function GET() {
  // Auth: protégée par middleware session super-admin
  // Les routes /api/admin/* sont appelées uniquement depuis /super-admin/* (session vérifiée)

  // Vérifier variables REQUIRED
  const missing = REQUIRED_VARS.filter((v) => !process.env[v])
  const present = REQUIRED_VARS.filter((v) => !!process.env[v])

  // Vérifier variables IMPORTANT
  const importantMissing = IMPORTANT_VARS.filter((v) => !process.env[v])
  const importantPresent = IMPORTANT_VARS.filter((v) => !!process.env[v])

  // Vérifier variables DEPRECATED
  const deprecated = DEPRECATED_VARS.filter((d) => !!process.env[d.name]).map((d) => ({
    name: d.name,
    replacedBy: d.replacedBy,
  }))

  // Config RAG runtime
  const ragConfig = {
    ragEnabled: process.env.RAG_ENABLED === 'true',
    ollamaEnabled: process.env.OLLAMA_ENABLED === 'true',
    openaiConfigured: !!process.env.OPENAI_API_KEY,
    groqConfigured: !!process.env.GROQ_API_KEY,
    googleConfigured: !!process.env.GOOGLE_API_KEY,
    redisConfigured: !!process.env.REDIS_URL,
  }

  // Statut global
  let status: 'ok' | 'warning' | 'critical' = 'ok'
  if (missing.length > 0) {
    status = 'critical'
  } else if (importantMissing.length > 0 || deprecated.length > 0) {
    status = 'warning'
  }

  return NextResponse.json({
    status,
    missing,
    present,
    importantMissing,
    importantPresent,
    deprecated,
    ragConfig,
    totalChecked: REQUIRED_VARS.length + IMPORTANT_VARS.length + DEPRECATED_VARS.length,
    checkedAt: new Date().toISOString(),
  })
}
