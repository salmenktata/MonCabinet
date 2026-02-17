/**
 * API Endpoint: Extraction métadonnées structurées
 *
 * POST /api/admin/kb/extract-metadata/:id
 *
 * Extrait les métadonnées juridiques structurées d'un document KB spécifique
 */

import { NextRequest, NextResponse } from 'next/server'
import { extractStructuredMetadataV2 } from '@/lib/knowledge-base/structured-metadata-extractor-service'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: knowledgeBaseId } = await params

    // Auth: X-Cron-Secret ou Bearer token
    const authHeader = request.headers.get('x-cron-secret') || request.headers.get('authorization')
    const cronSecret = process.env.CRON_SECRET
    if (cronSecret && authHeader !== cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
    }
    // }

    // 2. Parser les options depuis le body
    const body = await request.json().catch(() => ({}))
    const options = {
      forceReextract: body.force === true,
      useRegexOnly: body.regexOnly === true,
      useLLMOnly: body.llmOnly === true,
    }

    console.log(`[API Extract Metadata] Extraction pour KB ${knowledgeBaseId}`, options)

    // 3. Extraire les métadonnées
    const result = await extractStructuredMetadataV2(knowledgeBaseId, options)

    // 4. Retourner le résultat
    if (result.success) {
      return NextResponse.json({
        success: true,
        metadata: result.metadata,
        warnings: result.warnings,
        extractionConfidence: result.metadata?.extractionConfidence,
        extractionMethod: result.metadata?.extractionMethod,
      })
    } else {
      return NextResponse.json(
        {
          success: false,
          errors: result.errors,
          warnings: result.warnings,
        },
        { status: 400 }
      )
    }
  } catch (error) {
    console.error('[API Extract Metadata] Erreur:', error)
    return NextResponse.json(
      {
        success: false,
        error: 'Erreur serveur',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    )
  }
}

/**
 * GET /api/admin/kb/extract-metadata/:id
 *
 * Récupère les métadonnées structurées existantes pour un document KB
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: knowledgeBaseId } = await params

    // Auth: X-Cron-Secret ou Bearer token
    const getAuthHeader = request.headers.get('x-cron-secret') || request.headers.get('authorization')
    const getCronSecret = process.env.CRON_SECRET
    if (getCronSecret && getAuthHeader !== getCronSecret && getAuthHeader !== `Bearer ${getCronSecret}`) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
    }

    // Importer db ici pour éviter l'import au top level
    const { db } = await import('@/lib/db/postgres')

    // Récupérer les métadonnées existantes
    const result = await db.query(
      `SELECT
        meta.*,
        trib_tax.label_fr AS tribunal_label_fr,
        trib_tax.label_ar AS tribunal_label_ar,
        chambre_tax.label_fr AS chambre_label_fr,
        chambre_tax.label_ar AS chambre_label_ar
      FROM kb_structured_metadata meta
      LEFT JOIN legal_taxonomy trib_tax ON meta.tribunal_code = trib_tax.code
      LEFT JOIN legal_taxonomy chambre_tax ON meta.chambre_code = chambre_tax.code
      WHERE meta.knowledge_base_id = $1`,
      [knowledgeBaseId]
    )

    if (result.rows.length === 0) {
      return NextResponse.json(
        {
          success: false,
          message: 'Aucune métadonnée structurée trouvée pour ce document',
        },
        { status: 404 }
      )
    }

    const metadata = result.rows[0]

    return NextResponse.json({
      success: true,
      metadata: {
        // Informations générales
        documentDate: metadata.document_date,
        documentNumber: metadata.document_number,
        titleOfficial: metadata.title_official,
        language: metadata.language,

        // Jurisprudence
        tribunalCode: metadata.tribunal_code,
        tribunalLabelFr: metadata.tribunal_label_fr,
        tribunalLabelAr: metadata.tribunal_label_ar,
        chambreCode: metadata.chambre_code,
        chambreLabelFr: metadata.chambre_label_fr,
        chambreLabelAr: metadata.chambre_label_ar,
        decisionNumber: metadata.decision_number,
        decisionDate: metadata.decision_date,
        parties: metadata.parties,
        solution: metadata.solution,
        legalBasis: metadata.legal_basis,
        rapporteur: metadata.rapporteur,

        // Législation
        loiNumber: metadata.loi_number,
        jortNumber: metadata.jort_number,
        jortDate: metadata.jort_date,
        effectiveDate: metadata.effective_date,
        ministry: metadata.ministry,
        codeName: metadata.code_name,
        articleRange: metadata.article_range,

        // Doctrine
        author: metadata.author,
        coAuthors: metadata.co_authors,
        publicationName: metadata.publication_name,
        publicationDate: metadata.publication_date,
        university: metadata.university,
        keywords: metadata.keywords,
        abstract: metadata.abstract,

        // Extraction metadata
        fieldConfidence: metadata.field_confidence,
        extractionMethod: metadata.extraction_method,
        extractionConfidence: metadata.extraction_confidence,
        llmProvider: metadata.llm_provider,
        llmModel: metadata.llm_model,

        // Audit
        extractedAt: metadata.extracted_at,
        updatedAt: metadata.updated_at,
        version: metadata.version,
        validatedBy: metadata.validated_by,
        validatedAt: metadata.validated_at,
      },
    })
  } catch (error) {
    console.error('[API Extract Metadata GET] Erreur:', error)
    return NextResponse.json(
      {
        success: false,
        error: 'Erreur serveur',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    )
  }
}
