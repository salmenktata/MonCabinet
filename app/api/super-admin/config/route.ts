/**
 * API Route pour la gestion des configurations plateforme
 * PUT /api/super-admin/config - Mettre à jour une configuration
 * GET /api/super-admin/config - Récupérer toutes les configurations
 * Cache: 24 heures (config système rarement modifiée)
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { setConfig, getAllConfigs, clearConfigCache } from '@/lib/config/platform-config'
import { getCacheHeaders, CACHE_PRESETS } from '@/lib/api/cache-headers'

// Force dynamic rendering
export const dynamic = 'force-dynamic'

/**
 * GET - Récupérer toutes les configurations
 */
export async function GET() {
  try {
    const session = await getSession()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
    }

    // Vérifier le rôle super-admin
    if (session.user.role !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })
    }

    const configs = await getAllConfigs()

    // Masquer les valeurs secrètes
    const safeConfigs = configs.map((c) => ({
      ...c,
      value: c.is_secret ? `${c.value.slice(0, 8)}...` : c.value,
    }))

    return NextResponse.json({ success: true, data: safeConfigs }, {
      headers: getCacheHeaders(CACHE_PRESETS.VERY_LONG) // Cache 24h
    })
  } catch (error) {
    console.error('Erreur récupération configs:', error)
    return NextResponse.json(
      { error: 'Erreur lors de la récupération des configurations' },
      { status: 500 }
    )
  }
}

/**
 * PUT - Mettre à jour une configuration
 */
export async function PUT(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
    }

    // Vérifier le rôle super-admin
    if (session.user.role !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })
    }

    const body = await request.json()
    const { key, value } = body

    if (!key || !value) {
      return NextResponse.json(
        { error: 'Clé et valeur requises' },
        { status: 400 }
      )
    }

    // Liste des clés autorisées à modifier
    const allowedKeys = [
      'DEEPSEEK_API_KEY',
      'DEEPSEEK_MODEL',
      'GROQ_API_KEY',
      'GROQ_MODEL',
      'OPENAI_API_KEY',
      'ANTHROPIC_API_KEY',
      'BREVO_API_KEY',
      'RESEND_API_KEY',
    ]

    if (!allowedKeys.includes(key)) {
      return NextResponse.json(
        { error: 'Clé non autorisée' },
        { status: 400 }
      )
    }

    const success = await setConfig(key, value)

    if (!success) {
      return NextResponse.json(
        { error: 'Erreur lors de la mise à jour' },
        { status: 500 }
      )
    }

    // Invalider le cache
    clearConfigCache()

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Erreur mise à jour config:', error)
    return NextResponse.json(
      { error: 'Erreur lors de la mise à jour' },
      { status: 500 }
    )
  }
}
