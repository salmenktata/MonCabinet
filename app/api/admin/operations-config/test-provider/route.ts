/**
 * API: Test connectivité provider
 *
 * POST /api/admin/operations-config/test-provider
 *
 * Body:
 * {
 *   "provider": "groq",
 *   "testType": "chat",
 *   "operationName": "assistant-ia" // optionnel
 * }
 *
 * Auth: Session super admin uniquement
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { testProviderConnectivity } from '@/lib/config/operations-config-service'
import { providerTestSchema } from '@/lib/validations/operations-config-schemas'
import type { ProviderTestResponse } from '@/lib/types/ai-config.types'

export async function POST(request: NextRequest) {
  try {
    // 1. Auth check
    const session = await getServerSession(authOptions)
    if (!session?.user || session.user.role !== 'super_admin') {
      return NextResponse.json({ success: false, error: 'Non autorisé' }, { status: 401 })
    }

    // 2. Parse & validate body
    const body = await request.json()
    const validationResult = providerTestSchema.safeParse(body)

    if (!validationResult.success) {
      return NextResponse.json(
        {
          success: false,
          error: 'Données invalides',
          details: validationResult.error.errors,
        },
        { status: 400 }
      )
    }

    const { provider, testType, operationName } = validationResult.data

    // 3. Test provider
    const testResult = await testProviderConnectivity(provider, testType, operationName)

    // 4. Response
    const response: ProviderTestResponse = {
      success: testResult.available,
      provider,
      result: testResult,
    }

    return NextResponse.json(response, {
      status: testResult.available ? 200 : 503,
    })
  } catch (error) {
    console.error('[API /operations-config/test-provider] Error:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Erreur interne serveur',
      },
      { status: 500 }
    )
  }
}
