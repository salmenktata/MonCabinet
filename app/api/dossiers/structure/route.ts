/**
 * API Route pour la structuration de dossiers par IA
 * POST /api/dossiers/structure - Analyse un narratif et retourne un dossier structuré
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { structurerDossier, type StructuringOptions } from '@/lib/ai/dossier-structuring-service'
import { logChatUsage } from '@/lib/ai/usage-tracker'

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    // Vérifier l'authentification
    const session = await getSession()
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Non authentifié' },
        { status: 401 }
      )
    }

    const userId = session.user.id

    // Parser le body
    const body = await request.json()
    const { narratif, options } = body as {
      narratif: string
      options?: StructuringOptions
    }

    // Valider le narratif
    if (!narratif || typeof narratif !== 'string') {
      return NextResponse.json(
        { error: 'Le récit est requis' },
        { status: 400 }
      )
    }

    if (narratif.length < 20) {
      return NextResponse.json(
        { error: 'Le récit doit contenir au moins 20 caractères' },
        { status: 400 }
      )
    }

    if (narratif.length > 10000) {
      return NextResponse.json(
        { error: 'Le récit ne doit pas dépasser 10 000 caractères' },
        { status: 400 }
      )
    }

    // Appeler le service de structuration
    const result = await structurerDossier(narratif, userId, options || {})

    // Logger l'utilisation
    if (result.tokensUsed) {
      await logChatUsage(
        userId,
        'claude-3-5-sonnet-20241022', // modèle utilisé
        result.tokensUsed.input,
        result.tokensUsed.output
      ).catch((err) => console.error('Erreur logging usage:', err))
    }

    return NextResponse.json({
      success: true,
      data: result,
    })
  } catch (error) {
    console.error('Erreur structuration dossier:', error)

    if (error instanceof Error) {
      // Erreurs spécifiques
      if (error.message.includes('ANTHROPIC_API_KEY')) {
        return NextResponse.json(
          { error: 'Service IA non configuré' },
          { status: 503 }
        )
      }

      if (error.message.includes('parsing')) {
        return NextResponse.json(
          { error: 'Erreur d\'analyse du récit. Veuillez reformuler.' },
          { status: 422 }
        )
      }
    }

    return NextResponse.json(
      { error: 'Erreur lors de l\'analyse du dossier' },
      { status: 500 }
    )
  }
}
