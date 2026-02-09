import { NextRequest, NextResponse } from 'next/server'
import {
  getApiKeyData,
  upsertApiKey,
  deleteApiKey,
} from '@/lib/api-keys/api-keys-service'
import { z } from 'zod'

// Schema de validation pour la mise à jour d'une clé API
const updateApiKeySchema = z.object({
  label: z.string().min(1, 'Le label est requis'),
  apiKey: z.string().min(1, 'La clé API est requise'),
  modelDefault: z.string().optional(),
  tier: z.enum(['free', 'paid', 'enterprise']).optional(),
  rpmLimit: z.number().int().positive().optional(),
  monthlyQuota: z.number().int().positive().optional(),
  isActive: z.boolean().optional(),
  isPrimary: z.boolean().optional(),
})

// Regex de validation par provider
const API_KEY_PATTERNS: Record<string, RegExp> = {
  gemini: /^AIza[0-9A-Za-z_-]{35}$/,
  deepseek: /^sk-[a-zA-Z0-9]{48}$/,
  groq: /^gsk_[a-zA-Z0-9]{52}$/,
  anthropic: /^sk-ant-[a-zA-Z0-9_-]{95,}$/,
  openai: /^sk-(proj-)?[a-zA-Z0-9_-]{20,}$/,  // Support ancien format (sk-...) et nouveau (sk-proj-...)
  ollama: /^.*/,  // Ollama n'a pas de format spécifique (peut être vide)
}

/**
 * PUT /api/admin/api-keys/[provider]
 * Mettre à jour ou créer une clé API pour un provider
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ provider: string }> }
) {
  try {
    const { provider } = await params

    // Valider le body
    const body = await request.json()
    const validated = updateApiKeySchema.parse(body)

    // Valider le format de la clé API selon le provider
    const pattern = API_KEY_PATTERNS[provider.toLowerCase()]
    if (pattern && !pattern.test(validated.apiKey)) {
      return NextResponse.json(
        {
          success: false,
          error: `Format de clé API invalide pour ${provider}. Vérifiez le format attendu.`
        },
        { status: 400 }
      )
    }

    // Upsert la clé API
    const apiKey = await upsertApiKey({
      provider: provider.toLowerCase() as 'gemini' | 'deepseek' | 'groq' | 'anthropic' | 'openai' | 'ollama',
      label: validated.label,
      apiKey: validated.apiKey,
      modelDefault: validated.modelDefault,
      tier: validated.tier,
      rpmLimit: validated.rpmLimit,
      monthlyQuota: validated.monthlyQuota,
      isActive: validated.isActive ?? true,
      isPrimary: validated.isPrimary ?? false,
    })

    return NextResponse.json({
      success: true,
      key: apiKey,
    })
  } catch (error) {
    console.error('[API Keys PUT] Error:', error)

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          success: false,
          error: 'Données invalides',
          details: error.errors
        },
        { status: 400 }
      )
    }

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Erreur serveur'
      },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/admin/api-keys/[provider]
 * Supprimer une clé API pour un provider
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ provider: string }> }
) {
  try {
    const { provider } = await params

    // Vérifier que la clé existe et n'est pas primaire
    const existingKey = await getApiKeyData(provider.toLowerCase())

    if (!existingKey) {
      return NextResponse.json(
        { success: false, error: `Aucune clé API trouvée pour ${provider}` },
        { status: 404 }
      )
    }

    if (existingKey.isPrimary) {
      return NextResponse.json(
        {
          success: false,
          error: `Impossible de supprimer une clé primaire. Désactivez le flag "isPrimary" d'abord.`
        },
        { status: 403 }
      )
    }

    // Supprimer la clé
    await deleteApiKey(provider.toLowerCase())

    return NextResponse.json({
      success: true,
      message: `Clé API ${provider} supprimée avec succès`,
    })
  } catch (error) {
    console.error('[API Keys DELETE] Error:', error)

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Erreur serveur'
      },
      { status: 500 }
    )
  }
}

/**
 * GET /api/admin/api-keys/[provider]
 * Récupérer une clé API pour un provider (sans la clé décryptée)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ provider: string }> }
) {
  try {
    const { provider } = await params

    const apiKey = await getApiKeyData(provider.toLowerCase())

    if (!apiKey) {
      return NextResponse.json(
        { success: false, error: `Aucune clé API trouvée pour ${provider}` },
        { status: 404 }
      )
    }

    // Ne pas retourner la clé décryptée
    const { decryptedKey, ...safeKey } = apiKey

    return NextResponse.json({
      success: true,
      key: safeKey,
    })
  } catch (error) {
    console.error('[API Keys GET] Error:', error)

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Erreur serveur'
      },
      { status: 500 }
    )
  }
}
