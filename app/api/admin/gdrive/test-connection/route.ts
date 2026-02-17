import { getErrorMessage } from '@/lib/utils/error-utils'
/**
 * API Route: Test de connexion Google Drive
 *
 * POST /api/admin/gdrive/test-connection
 * Body: { folderId: string }
 *
 * Vérifie que le service account peut accéder au dossier
 * et liste les premiers fichiers pour validation.
 */

import { NextRequest, NextResponse } from 'next/server'
import {
  validateDriveFolderAccess,
  parseGoogleDriveFolderUrl
} from '@/lib/web-scraper/gdrive-utils'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { folderId } = body

    if (!folderId || typeof folderId !== 'string') {
      return NextResponse.json(
        { success: false, error: 'Missing or invalid folderId' },
        { status: 400 }
      )
    }

    // Parser l'URL pour extraire le folderId si nécessaire
    const parsedFolderId = parseGoogleDriveFolderUrl(folderId)

    if (!parsedFolderId) {
      return NextResponse.json(
        {
          success: false,
          error: 'Format d\'URL invalide. Utilisez l\'URL complète ou le folderId directement.'
        },
        { status: 400 }
      )
    }

    // Valider l'accès au dossier
    const result = await validateDriveFolderAccess(parsedFolderId)

    if (!result.success) {
      return NextResponse.json(result, { status: 400 })
    }

    return NextResponse.json({
      success: true,
      fileCount: result.fileCount,
      message: `Connexion réussie. ${result.fileCount} fichier(s) découvert(s).`,
    })
  } catch (error) {
    console.error('[API] Test connection error:', error)
    return NextResponse.json(
      { success: false, error: getErrorMessage(error) || 'Erreur inconnue' },
      { status: 500 }
    )
  }
}
