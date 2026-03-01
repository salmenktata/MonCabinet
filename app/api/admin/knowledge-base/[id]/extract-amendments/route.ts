/**
 * API Route: Extraction d'Amendements JORT
 *
 * POST /api/admin/knowledge-base/[id]/extract-amendments
 * - Déclenche l'extraction d'amendements pour un document IORT
 * - Crée les relations kb_legal_relations (amends/amended_by)
 * - Met à jour les métadonnées des chunks
 *
 * GET /api/admin/knowledge-base/[id]/extract-amendments
 * - Retourne les amendements déjà extraits pour ce document
 *
 * Réservé aux administrateurs
 */

import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

import { getSession } from '@/lib/auth/session'
import { db } from '@/lib/db/postgres'
import { getKnowledgeDocument } from '@/lib/ai/knowledge-base-service'
import { extractAmendmentsFromJORT } from '@/lib/knowledge-base/jort-amendment-extractor'
import { linkAmendmentToKB, getCodeModifiedByJORT, getAmendmentsForKBDoc } from '@/lib/knowledge-base/amendment-linker'
import { checkAdminAccess } from '@/lib/auth/check-admin-access'

// =============================================================================
// AUTH
// =============================================================================

// =============================================================================
// GET — Retourner les amendements connus
// =============================================================================

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const session = await getSession()
    if (!session?.user?.id) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

    const isAdmin = await checkAdminAccess(session.user.id)
    if (!isAdmin) return NextResponse.json({ error: 'Accès réservé aux administrateurs' }, { status: 403 })

    const { id } = await params

    // Récupérer les codes modifiés par ce JORT
    const codesModified = await getCodeModifiedByJORT(id)
    // Récupérer les JORT qui ont modifié ce document (si c'est un code)
    const amendedBy = await getAmendmentsForKBDoc(id)

    // Récupérer le timestamp de la dernière extraction
    const kbResult = await db.query(
      `SELECT jort_amendments_extracted_at FROM knowledge_base WHERE id = $1`,
      [id]
    )
    const extractedAt = kbResult.rows[0]?.jort_amendments_extracted_at ?? null

    return NextResponse.json({
      documentId: id,
      lastExtractedAt: extractedAt,
      codesModified,
      amendedBy,
      isAmendingDocument: codesModified.length > 0,
      isAmendedDocument: amendedBy.length > 0,
    })
  } catch (error) {
    console.error('[extract-amendments] Erreur GET:', error)
    return NextResponse.json({ error: 'Erreur récupération amendements' }, { status: 500 })
  }
}

// =============================================================================
// POST — Déclencher l'extraction
// =============================================================================

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const session = await getSession()
    if (!session?.user?.id) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

    const isAdmin = await checkAdminAccess(session.user.id)
    if (!isAdmin) return NextResponse.json({ error: 'Accès réservé aux administrateurs' }, { status: 403 })

    const { id } = await params
    const body = await request.json().catch(() => ({}))
    const force = body.force === true

    // Récupérer le document
    const kbDoc = await getKnowledgeDocument(id)
    if (!kbDoc) {
      return NextResponse.json({ error: 'Document non trouvé' }, { status: 404 })
    }

    if (!kbDoc.isIndexed) {
      return NextResponse.json(
        { error: 'Document non indexé — indexer d\'abord' },
        { status: 422 }
      )
    }

    // Vérifier si c'est un document IORT
    const sourceOrigin = kbDoc.metadata?.sourceOrigin as string | undefined
    if (sourceOrigin !== 'iort_gov_tn' && !force) {
      return NextResponse.json(
        {
          warning: 'Document non IORT — passez force=true pour analyser quand même',
          sourceOrigin: sourceOrigin ?? 'inconnu',
        },
        { status: 422 }
      )
    }

    console.log(`[extract-amendments] Lancement extraction pour ${id} (${kbDoc.title})`)

    // Extraction
    const extraction = await extractAmendmentsFromJORT(kbDoc)

    // Liaison
    const linking = await linkAmendmentToKB(extraction)

    return NextResponse.json({
      success: true,
      documentId: id,
      documentTitle: kbDoc.title,
      isAmendingDocument: extraction.isAmendingDocument,
      amendmentsFound: extraction.amendments.length,
      extractionMethod: extraction.extractionMethod,
      confidence: extraction.confidence,
      jortReference: extraction.jortReference,
      amendments: extraction.amendments.map((a) => ({
        targetCode: a.targetCodeSlug,
        articles: a.affectedArticles,
        type: a.amendmentType,
        confidence: a.confidence,
      })),
      linking: {
        relationsCreated: linking.relationsCreated,
        originalChunksMarked: linking.originalChunksMarked,
        jortChunksMarked: linking.jortChunksMarked,
        warnings: linking.warnings,
      },
    })
  } catch (error) {
    console.error('[extract-amendments] Erreur POST:', error)
    return NextResponse.json({ error: 'Erreur extraction amendements' }, { status: 500 })
  }
}
