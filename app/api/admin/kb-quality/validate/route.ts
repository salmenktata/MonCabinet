/**
 * API : Validation Métadonnées KB
 *
 * POST /api/admin/kb-quality/validate - Valider et mettre à jour métadonnées
 */

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db/postgres'

// =============================================================================
// Types
// =============================================================================

interface ValidationPayload {
  documentId: string
  userId: string
  metadata: {
    tribunalCode?: string | null
    chambreCode?: string | null
    decisionNumber?: string | null
    decisionDate?: string | null
    solution?: string | null
    legalBasis?: string[] | null
    loiNumber?: string | null
    codeName?: string | null
    author?: string | null
    publicationDate?: string | null
    keywords?: string[] | null
  }
  validated: boolean // true = validation OK, false = rejet
  comment?: string
}

// =============================================================================
// POST - Valider métadonnées
// =============================================================================

export async function POST(request: NextRequest) {
  try {
    const payload: ValidationPayload = await request.json()
    const { documentId, userId, metadata, validated, comment } = payload

    if (!documentId || !userId) {
      return NextResponse.json(
        {
          success: false,
          error: 'documentId et userId requis',
        },
        { status: 400 }
      )
    }

    // Transaction pour atomicité
    const client = await db.pool.connect()
    try {
      await client.query('BEGIN')

      // 1. Mettre à jour les métadonnées
      const updateFields: string[] = []
      const updateValues: any[] = []
      let paramIndex = 1

      // Mapping des champs (camelCase → snake_case)
      const fieldMapping: Record<string, string> = {
        tribunalCode: 'tribunal_code',
        chambreCode: 'chambre_code',
        decisionNumber: 'decision_number',
        decisionDate: 'decision_date',
        solution: 'solution',
        legalBasis: 'legal_basis',
        loiNumber: 'loi_number',
        codeName: 'code_name',
        author: 'author',
        publicationDate: 'publication_date',
        keywords: 'keywords',
      }

      for (const [camelKey, snakeKey] of Object.entries(fieldMapping)) {
        if (metadata[camelKey as keyof typeof metadata] !== undefined) {
          const value = metadata[camelKey as keyof typeof metadata]

          // Traitement spécial pour dates
          if (camelKey.includes('Date') && value) {
            updateFields.push(`${snakeKey} = $${paramIndex++}`)
            updateValues.push(new Date(value as string))
          }
          // Traitement spécial pour arrays
          else if (Array.isArray(value)) {
            updateFields.push(`${snakeKey} = $${paramIndex++}`)
            updateValues.push(value)
          }
          // Autres champs
          else {
            updateFields.push(`${snakeKey} = $${paramIndex++}`)
            updateValues.push(value)
          }
        }
      }

      // Ajouter extraction_method = 'manual' (validé manuellement)
      updateFields.push(`extraction_method = $${paramIndex++}`)
      updateValues.push('manual')

      // Augmenter extraction_confidence à 1.0 si validé
      if (validated) {
        updateFields.push(`extraction_confidence = $${paramIndex++}`)
        updateValues.push(1.0)
      }

      updateFields.push(`updated_at = NOW()`)
      updateFields.push(`version = version + 1`)

      // WHERE clause
      updateValues.push(documentId)

      const updateQuery = `
        UPDATE kb_structured_metadata
        SET ${updateFields.join(', ')}
        WHERE knowledge_base_id = $${paramIndex}
      `

      await client.query(updateQuery, updateValues)

      // 2. Enregistrer l'action de validation dans une table d'audit (optionnel)
      // TODO: Créer table kb_validation_logs si besoin de tracking détaillé

      // 3. Incrémenter les points du validateur (gamification)
      const pointsQuery = `
        INSERT INTO user_validation_stats (user_id, documents_validated, points, last_validation_at)
        VALUES ($1, 1, 1, NOW())
        ON CONFLICT (user_id) DO UPDATE SET
          documents_validated = user_validation_stats.documents_validated + 1,
          points = user_validation_stats.points + 1,
          last_validation_at = NOW()
      `
      await client.query(pointsQuery, [userId])

      await client.query('COMMIT')

      return NextResponse.json({
        success: true,
        data: {
          documentId,
          validated,
          pointsEarned: 1,
          message: validated
            ? 'Métadonnées validées avec succès'
            : 'Document marqué pour révision',
        },
      })
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
  } catch (error) {
    console.error('[API KB Quality Validate] Erreur POST:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Erreur inconnue',
      },
      { status: 500 }
    )
  }
}
