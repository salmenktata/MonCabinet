/**
 * API: Configuration IA pour une opération spécifique
 *
 * GET /api/admin/operations-config/[operationName]
 * PUT /api/admin/operations-config/[operationName]
 * DELETE /api/admin/operations-config/[operationName] (reset)
 *
 * Auth: Session super admin uniquement
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import {
  getOperationConfig,
  updateOperationConfig,
  resetOperationConfig,
  testProviderConnectivity,
} from '@/lib/config/operations-config-service'
import { getDecryptedApiKey } from '@/lib/config/platform-config'
import type { OperationName } from '@/lib/ai/operations-config'
import type { LLMProvider } from '@/lib/ai/llm-fallback-service'
import type {
  OperationConfigDetailResponse,
  OperationConfigUpdateResponse,
  ProviderAvailability,
} from '@/lib/types/ai-config.types'
import { operationNameSchema } from '@/lib/validations/operations-config-schemas'

// =============================================================================
// GET - Récupère configuration + status providers
// =============================================================================

export async function GET(
  request: NextRequest,
  { params }: { params: { operationName: string } }
) {
  try {
    // 1. Auth check
    const session = await getServerSession(authOptions)
    if (!session?.user || session.user.role !== 'super_admin') {
      return NextResponse.json({ success: false, error: 'Non autorisé' }, { status: 401 })
    }

    // 2. Validate operation name
    const validationResult = operationNameSchema.safeParse(params.operationName)
    if (!validationResult.success) {
      return NextResponse.json(
        { success: false, error: 'Nom opération invalide' },
        { status: 400 }
      )
    }

    const operationName = validationResult.data

    // 3. Fetch config
    const config = await getOperationConfig(operationName)

    // 4. Check provider availability
    const allProviders: LLMProvider[] = [
      'groq',
      'gemini',
      'deepseek',
      'openai',
      'anthropic',
      'ollama',
    ]

    const providerAvailability: Record<LLMProvider, ProviderAvailability> = {} as any

    await Promise.all(
      allProviders.map(async (provider) => {
        if (provider === 'ollama') {
          providerAvailability[provider] = {
            available: true,
            hasApiKey: true,
            lastError: null,
          }
          return
        }

        const apiKey = await getDecryptedApiKey(provider)
        providerAvailability[provider] = {
          available: !!apiKey,
          hasApiKey: !!apiKey,
          lastError: apiKey ? null : 'Clé API manquante',
        }
      })
    )

    // 5. Response
    const response: OperationConfigDetailResponse = {
      success: true,
      operation: config,
      providerAvailability,
    }

    return NextResponse.json(response, { status: 200 })
  } catch (error) {
    console.error(`[API /operations-config/${params.operationName}] Error:`, error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Erreur interne serveur',
      },
      { status: 500 }
    )
  }
}

// =============================================================================
// PUT - Met à jour configuration
// =============================================================================

export async function PUT(
  request: NextRequest,
  { params }: { params: { operationName: string } }
) {
  try {
    // 1. Auth check
    const session = await getServerSession(authOptions)
    if (!session?.user || session.user.role !== 'super_admin') {
      return NextResponse.json({ success: false, error: 'Non autorisé' }, { status: 401 })
    }

    // 2. Validate operation name
    const validationResult = operationNameSchema.safeParse(params.operationName)
    if (!validationResult.success) {
      return NextResponse.json(
        { success: false, error: 'Nom opération invalide' },
        { status: 400 }
      )
    }

    const operationName = validationResult.data

    // 3. Parse body
    const body = await request.json()

    // 4. Update config
    const result = await updateOperationConfig(operationName, body, session.user.id)

    if (!result.success) {
      return NextResponse.json(
        {
          success: false,
          error: result.error,
          warnings: result.warnings,
        },
        { status: 400 }
      )
    }

    // 5. Response
    const response: OperationConfigUpdateResponse = {
      success: true,
      operation: result.config!,
      changes: {
        fields: Object.keys(body),
        previous: {},
        current: body,
      },
      warnings: result.warnings || [],
    }

    return NextResponse.json(response, { status: 200 })
  } catch (error) {
    console.error(`[API /operations-config/${params.operationName}] PUT Error:`, error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Erreur interne serveur',
      },
      { status: 500 }
    )
  }
}

// =============================================================================
// DELETE - Reset configuration aux valeurs par défaut
// =============================================================================

export async function DELETE(
  request: NextRequest,
  { params }: { params: { operationName: string } }
) {
  try {
    // 1. Auth check
    const session = await getServerSession(authOptions)
    if (!session?.user || session.user.role !== 'super_admin') {
      return NextResponse.json({ success: false, error: 'Non autorisé' }, { status: 401 })
    }

    // 2. Validate operation name
    const validationResult = operationNameSchema.safeParse(params.operationName)
    if (!validationResult.success) {
      return NextResponse.json(
        { success: false, error: 'Nom opération invalide' },
        { status: 400 }
      )
    }

    const operationName = validationResult.data

    // 3. Reset config
    const result = await resetOperationConfig(operationName, session.user.id)

    if (!result.success) {
      return NextResponse.json(
        {
          success: false,
          error: result.error,
        },
        { status: 400 }
      )
    }

    // 4. Response
    return NextResponse.json(
      {
        success: true,
        operation: result.config,
        message: 'Configuration réinitialisée aux valeurs par défaut',
      },
      { status: 200 }
    )
  } catch (error) {
    console.error(`[API /operations-config/${params.operationName}] DELETE Error:`, error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Erreur interne serveur',
      },
      { status: 500 }
    )
  }
}
