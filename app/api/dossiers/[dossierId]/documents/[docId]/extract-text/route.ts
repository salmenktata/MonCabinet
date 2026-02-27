/**
 * API Route - Extraction de texte d'un document client (MinIO)
 *
 * GET /api/dossiers/[dossierId]/documents/[docId]/extract-text
 *
 * Télécharge le fichier depuis MinIO et extrait le texte (PDF, DOCX).
 * Utilisé pour la fonctionnalité "Lire le texte" dans les dossiers clients.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { query } from '@/lib/db/postgres'
import { downloadFile } from '@/lib/storage/minio'
import { parseFile } from '@/lib/web-scraper/file-parser-service'
import { detectTextLanguage } from '@/lib/web-scraper/content-extractor'

export const dynamic = 'force-dynamic'

// Types MIME supportés pour l'extraction
const SUPPORTED_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
  'text/plain',
]

function getMimeFileType(mimeType: string): string {
  if (mimeType.includes('pdf')) return 'pdf'
  if (mimeType.includes('wordprocessingml') || mimeType.includes('docx')) return 'docx'
  if (mimeType.includes('msword') || mimeType.includes('doc')) return 'doc'
  if (mimeType.includes('text')) return 'txt'
  // Fallback : essayer de deviner par extension
  return 'pdf'
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ dossierId: string; docId: string }> }
) {
  try {
    const session = await getSession()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
    }

    const { dossierId, docId } = await params

    // Récupérer le document + vérifier propriété
    const docResult = await query(
      `SELECT id, user_id, dossier_id, nom_fichier, type_fichier, minio_path, storage_provider
       FROM documents
       WHERE id = $1 AND dossier_id = $2 AND user_id = $3`,
      [docId, dossierId, session.user.id]
    )

    if (docResult.rows.length === 0) {
      return NextResponse.json(
        { error: 'Document non trouvé ou accès refusé' },
        { status: 404 }
      )
    }

    const doc = docResult.rows[0]

    if (doc.storage_provider !== 'minio' || !doc.minio_path) {
      return NextResponse.json(
        { error: 'Extraction disponible uniquement pour les fichiers stockés localement (MinIO)' },
        { status: 400 }
      )
    }

    const mimeType = doc.type_fichier || ''
    if (!SUPPORTED_TYPES.some((t) => mimeType.includes(t.split('/')[1])) && !mimeType.includes('pdf') && !mimeType.includes('word') && !mimeType.includes('text')) {
      return NextResponse.json(
        { error: `Type de fichier non supporté pour l'extraction : ${mimeType}` },
        { status: 400 }
      )
    }

    // Télécharger depuis MinIO
    const buffer = await downloadFile(doc.minio_path)

    // Extraire le texte via le service existant
    const fileType = getMimeFileType(mimeType)
    const parsed = await parseFile(buffer, fileType)

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error || "Impossible d'extraire le texte de ce document" },
        { status: 422 }
      )
    }

    const language = detectTextLanguage(parsed.text) || 'fr'

    return NextResponse.json({
      text: parsed.text,
      wordCount: parsed.metadata.wordCount,
      pageCount: parsed.metadata.pageCount ?? null,
      language,
      filename: doc.nom_fichier,
      ocrApplied: parsed.metadata.ocrApplied ?? false,
    })
  } catch (error) {
    console.error('[extract-text] Erreur:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erreur inattendue' },
      { status: 500 }
    )
  }
}
