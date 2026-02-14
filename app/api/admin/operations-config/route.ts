/**
 * API: Liste des configurations IA par opération
 *
 * GET /api/admin/operations-config
 *
 * Retourne toutes les configurations avec métadonnées.
 *
 * Auth: Session super admin uniquement
 * Rate Limit: 100 req/min
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getAllOperationsConfigs } from '@/lib/config/operations-config-service'
import { getDecryptedApiKey } from '@/lib/config/platform-config'
import type { LLMProvider } from '@/lib/ai/llm-fallback-service'
import type { OperationsConfigListResponse } from '@/lib/types/ai-config.types'

export async function GET(request: NextRequest) {
  try {
    // 1. Auth check
    const session = await getServerSession(authOptions)
    if (!session?.user || session.user.role !== 'super_admin') {
      return NextResponse.json({ success: false, error: 'Non autorisé' }, { status: 401 })
    }

    // 2. Fetch all configs
    const configs = await getAllOperationsConfigs()

    // 3. Calcule providers disponibles
    const allProviders: LLMProvider[] = [
      'groq',
      'gemini',
      'deepseek',
      'openai',
      'anthropic',
      'ollama',
    ]
    const availableProviders: LLMProvider[] = []

    for (const provider of allProviders) {
      if (provider === 'ollama') {
        availableProviders.push(provider)
        continue
      }

      const apiKey = await getDecryptedApiKey(provider)
      if (apiKey) {
        availableProviders.push(provider)
      }
    }

    // 4. Métadonnées
    const customConfigs = configs.filter((c) => c.source === 'database').length

    // 5. Response
    const response: OperationsConfigListResponse = {
      success: true,
      operations: configs,
      metadata: {
        totalOperations: configs.length,
        customConfigs,
        availableProviders,
      },
    }

    return NextResponse.json(response, { status: 200 })
  } catch (error) {
    console.error('[API /operations-config] Error:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Erreur interne serveur',
      },
      { status: 500 }
    )
  }
}
