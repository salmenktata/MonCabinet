/**
 * API Route: Gestion Client Individuel
 *
 * GET /api/clients/[id]
 * - Récupérer un client par ID
 *
 * PATCH /api/clients/[id]
 * - Mettre à jour un client
 *
 * DELETE /api/clients/[id]
 * - Supprimer un client
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { query } from '@/lib/db/postgres'

// Force dynamic rendering
export const dynamic = 'force-dynamic'

// =============================================================================
// HELPERS: Mapping snake_case → camelCase
// =============================================================================

function mapClientFromDB(row: any): any {
  return {
    id: row.id,
    userId: row.user_id,
    typeClient: row.type_client,
    nom: row.nom,
    prenom: row.prenom,
    cin: row.cin,
    email: row.email,
    telephone: row.telephone,
    telephoneSecondaire: row.telephone_secondaire,
    adresse: row.adresse,
    codePostal: row.code_postal,
    ville: row.ville,
    pays: row.pays,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    dossiers: row.dossiers || [],
  }
}

// =============================================================================
// GET: Récupérer client par ID
// =============================================================================

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { id: clientId } = await params
    const session = await getSession()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
    }

    const userId = session.user.id

    // Récupérer le client avec ses dossiers
    const result = await query(
      `SELECT c.*,
        (
          SELECT COALESCE(json_agg(
            json_build_object(
              'id', d.id,
              'numero', d.numero,
              'titre', d.titre,
              'statut', d.statut,
              'type_procedure', d.type_procedure,
              'date_ouverture', d.date_ouverture,
              'created_at', d.created_at
            ) ORDER BY d.created_at DESC
          ), '[]'::json)
          FROM dossiers d
          WHERE d.client_id = c.id
        ) as dossiers
      FROM clients c
      WHERE c.id = $1 AND c.user_id = $2`,
      [clientId, userId]
    )

    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Client non trouvé' }, { status: 404 })
    }

    return NextResponse.json(mapClientFromDB(result.rows[0]))
  } catch (error) {
    console.error('Erreur GET /api/clients/[id]:', error)
    return NextResponse.json(
      { error: 'Erreur récupération client' },
      { status: 500 }
    )
  }
}

// =============================================================================
// PATCH: Mettre à jour client
// =============================================================================

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { id: clientId } = await params
    const session = await getSession()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
    }

    const userId = session.user.id
    const body = await request.json()

    // Supprimer les champs undefined et non modifiables
    const updateData: Record<string, any> = {}
    const allowedFields = [
      'nom',
      'prenom',
      'cin',
      'email',
      'telephone',
      'telephone_secondaire',
      'adresse',
      'code_postal',
      'ville',
      'pays',
      'notes',
      'type_client',
    ]

    allowedFields.forEach((field) => {
      if (body[field] !== undefined) {
        updateData[field] = body[field]
      }
    })

    // Si aucune donnée à mettre à jour
    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { error: 'Aucune donnée à mettre à jour' },
        { status: 400 }
      )
    }

    // Construire la clause SET dynamiquement
    const setClause = Object.keys(updateData)
      .map((key, i) => `${key} = $${i + 1}`)
      .join(', ')
    const values = [...Object.values(updateData), clientId, userId]

    const result = await query(
      `UPDATE clients
       SET ${setClause}, updated_at = NOW()
       WHERE id = $${values.length - 1} AND user_id = $${values.length}
       RETURNING *`,
      values
    )

    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Client non trouvé' }, { status: 404 })
    }

    return NextResponse.json(mapClientFromDB(result.rows[0]))
  } catch (error) {
    console.error('Erreur PATCH /api/clients/[id]:', error)

    // Erreur contrainte unique
    if (error instanceof Error && error.message.includes('duplicate key')) {
      return NextResponse.json(
        { error: 'Un client avec cet email ou CIN existe déjà' },
        { status: 409 }
      )
    }

    return NextResponse.json(
      { error: 'Erreur mise à jour client' },
      { status: 500 }
    )
  }
}

// =============================================================================
// DELETE: Supprimer client
// =============================================================================

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { id: clientId } = await params
    const session = await getSession()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
    }

    const userId = session.user.id

    // Vérifier si le client a des dossiers
    const checkDossiers = await query(
      'SELECT COUNT(*) as count FROM dossiers WHERE client_id = $1',
      [clientId]
    )

    const dossierCount = parseInt(checkDossiers.rows[0]?.count || '0', 10)

    if (dossierCount > 0) {
      return NextResponse.json(
        {
          error: `Impossible de supprimer : ce client a ${dossierCount} dossier(s)`,
          dossierCount,
        },
        { status: 409 }
      )
    }

    // Supprimer le client
    const result = await query(
      'DELETE FROM clients WHERE id = $1 AND user_id = $2 RETURNING id',
      [clientId, userId]
    )

    if (result.rowCount === 0) {
      return NextResponse.json({ error: 'Client non trouvé' }, { status: 404 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Erreur DELETE /api/clients/[id]:', error)
    return NextResponse.json(
      { error: 'Erreur suppression client' },
      { status: 500 }
    )
  }
}
