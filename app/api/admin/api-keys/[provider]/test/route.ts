import { NextRequest, NextResponse } from 'next/server'
import { getApiKeyData } from '@/lib/api-keys/api-keys-service'
import { testProviderConnection } from '@/lib/api-keys/test-connection'

/**
 * POST /api/admin/api-keys/[provider]/test
 * Tester la connexion à un provider
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ provider: string }> }
) {
  try {
    const { provider } = await params
    const providerLower = provider.toLowerCase()

    // Récupérer la clé API depuis la base de données
    const apiKeyData = await getApiKeyData(providerLower)

    if (!apiKeyData && providerLower !== 'ollama') {
      return NextResponse.json(
        {
          success: false,
          error: `Aucune clé API trouvée pour ${provider}. Ajoutez-en une d'abord.`
        },
        { status: 404 }
      )
    }

    // Tester la connexion
    const result = await testProviderConnection(
      providerLower,
      apiKeyData?.decryptedKey
    )

    if (result.success) {
      return NextResponse.json({
        success: true,
        message: result.message,
        modelsList: result.modelsList,
        latency: result.latency,
      })
    } else {
      return NextResponse.json(
        {
          success: false,
          error: result.error,
          latency: result.latency,
        },
        { status: 400 }
      )
    }
  } catch (error) {
    console.error('[API Keys Test] Error:', error)

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Erreur serveur'
      },
      { status: 500 }
    )
  }
}
