/**
 * API Route: Configuration des providers IA
 *
 * GET  /api/super-admin/providers/ai - Récupérer la config actuelle
 * POST /api/super-admin/providers/ai - Mettre à jour les clés API
 *
 * Réservé aux super admins
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { db } from '@/lib/db/postgres'
import {
  getAIProviderConfig,
  setAIApiKey,
  setOllamaConfig,
  type AIProvider,
} from '@/lib/config/provider-config'

/**
 * Vérifie que l'utilisateur est super admin
 */
async function requireSuperAdmin(session: { user?: { id?: string } } | null) {
  if (!session?.user?.id) {
    return { error: 'Non authentifié', status: 401 }
  }

  const adminCheck = await db.query(
    `SELECT is_super_admin FROM users WHERE id = $1`,
    [session.user.id]
  )

  if (!adminCheck.rows[0]?.is_super_admin) {
    return { error: 'Accès réservé aux super admins', status: 403 }
  }

  return null
}

/**
 * GET - Récupérer la configuration IA actuelle
 */
export async function GET() {
  try {
    const session = await getSession()
    const authError = await requireSuperAdmin(session)
    if (authError) {
      return NextResponse.json({ error: authError.error }, { status: authError.status })
    }

    // ⚠️ LOGGING - Interface dépréciée (Sprint 2)
    console.warn(
      `[DEPRECATED] /api/super-admin/providers/ai utilisée par user ${session?.user?.id} - ` +
      `Rediriger vers /super-admin/settings (Architecture IA) - ` +
      `Cette API sera supprimée dans 2 semaines (Sprint 3)`
    )

    const config = await getAIProviderConfig()

    return NextResponse.json({
      success: true,
      data: config,
    })
  } catch (error) {
    console.error('[Providers AI GET] Erreur:', error)
    return NextResponse.json(
      { error: 'Erreur serveur' },
      { status: 500 }
    )
  }
}

/**
 * POST - Mettre à jour la configuration IA
 * Body: { deepseekApiKey?, groqApiKey?, openaiApiKey?, anthropicApiKey?, ollamaEnabled?, ollamaBaseUrl? }
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getSession()
    const authError = await requireSuperAdmin(session)
    if (authError) {
      return NextResponse.json({ error: authError.error }, { status: authError.status })
    }

    // ⚠️ LOGGING - Interface dépréciée (Sprint 2)
    console.warn(
      `[DEPRECATED] POST /api/super-admin/providers/ai utilisée par user ${session?.user?.id} - ` +
      `Cette API est en lecture seule. Rediriger vers /super-admin/settings (Architecture IA) - ` +
      `Suppression prévue dans 2 semaines (Sprint 3)`
    )

    const body = await request.json()
    const {
      deepseekApiKey,
      groqApiKey,
      openaiApiKey,
      anthropicApiKey,
      ollamaEnabled,
      ollamaBaseUrl,
    } = body

    const results: string[] = []

    // Mettre à jour les clés API
    const apiKeyUpdates: { provider: Exclude<AIProvider, 'ollama'>; key: string | undefined }[] = [
      { provider: 'deepseek', key: deepseekApiKey },
      { provider: 'groq', key: groqApiKey },
      { provider: 'openai', key: openaiApiKey },
      { provider: 'anthropic', key: anthropicApiKey },
    ]

    for (const { provider, key } of apiKeyUpdates) {
      if (key !== undefined) {
        if (typeof key !== 'string' || (key.length > 0 && key.length < 10)) {
          return NextResponse.json(
            { error: `Clé API ${provider} invalide` },
            { status: 400 }
          )
        }

        if (key.length > 0) {
          const success = await setAIApiKey(provider, key)
          if (!success) {
            return NextResponse.json(
              { error: `Échec mise à jour clé ${provider}` },
              { status: 500 }
            )
          }
          results.push(`Clé ${provider} mise à jour`)
        }
      }
    }

    // Mettre à jour Ollama
    if (ollamaEnabled !== undefined) {
      const success = await setOllamaConfig(ollamaEnabled, ollamaBaseUrl)
      if (!success) {
        return NextResponse.json(
          { error: 'Échec mise à jour Ollama' },
          { status: 500 }
        )
      }
      results.push(ollamaEnabled ? 'Ollama activé' : 'Ollama désactivé')
    }

    // Logger l'action
    try {
      await db.query(
        `INSERT INTO admin_audit_logs (admin_id, action, target_type, target_id, details)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          session!.user!.id,
          'update_ai_provider_config',
          'platform_config',
          'ai',
          JSON.stringify({ changes: results }),
        ]
      )
    } catch (logError) {
      console.error('[Providers AI] Erreur log audit:', logError)
    }

    // Récupérer la nouvelle config
    const newConfig = await getAIProviderConfig()

    return NextResponse.json({
      success: true,
      message: results.length > 0 ? results.join(', ') : 'Aucune modification',
      data: newConfig,
    })
  } catch (error) {
    console.error('[Providers AI POST] Erreur:', error)
    return NextResponse.json(
      { error: 'Erreur serveur' },
      { status: 500 }
    )
  }
}
