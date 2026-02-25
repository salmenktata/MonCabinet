/**
 * API Route: Gestion Dossier Individuel
 *
 * GET /api/dossiers/[id]
 * - Récupérer un dossier par ID
 *
 * PATCH /api/dossiers/[id]
 * - Mettre à jour un dossier
 *
 * DELETE /api/dossiers/[id]
 * - Supprimer un dossier
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { query } from '@/lib/db/postgres'
import { dossierSchema } from '@/lib/validations/dossier'

// Force dynamic rendering
export const dynamic = 'force-dynamic'

// =============================================================================
// HELPERS: Mapping snake_case → camelCase
// =============================================================================

function mapDossierFromDB(row: any): any {
  return {
    id: row.id,
    userId: row.user_id,
    clientId: row.client_id,
    titre: row.titre,
    numero: row.numero,
    description: row.description,
    type: row.type_procedure,
    status: mapStatus(row.statut),
    priority: row.priorite,
    category: row.categorie,
    numeroAffaire: row.numero_affaire,
    juridiction: row.juridiction,
    dateOuverture: row.date_ouverture,
    dateCloture: row.date_cloture,
    montant: row.montant,
    devise: row.devise,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    client: row.clients ? mapClientFromDB(row.clients) : undefined,
    documents: row.documents || [],
    events: [],
    actions: row.actions || [],
    echeances: row.echeances || [],
    // Champs supplémentaires pour compatibilité
    objet: row.objet,
    tribunal: row.tribunal,
    statut: row.statut, // Garder aussi la version originale pour compatibilité
    // Champs workflow
    workflow_etape_actuelle: row.workflow_etape_actuelle,
    type_procedure: row.type_procedure,
  }
}

function mapClientFromDB(client: any): any {
  return {
    id: client.id,
    nom: client.nom,
    prenom: client.prenom,
    email: client.email,
    telephone: client.telephone,
    type: client.type_client,
    typeClient: client.type_client,
    adresse: client.adresse,
    cin: client.cin,
  }
}

function mapStatus(statut: string): string {
  const statusMap: Record<string, string> = {
    'ouvert': 'open',
    'actif': 'in_progress',
    'en_cours': 'in_progress',
    'en_attente': 'pending',
    'clos': 'closed',
    'archive': 'archived',
  }
  return statusMap[statut] || statut
}

// =============================================================================
// GET: Récupérer dossier par ID
// =============================================================================

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { id: dossierId } = await params
    const session = await getSession()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
    }

    const userId = session.user.id

    // Récupérer le dossier avec client, documents, événements, actions, échéances
    const result = await query(
      `SELECT d.*,
        json_build_object(
          'id', c.id,
          'type_client', c.type_client,
          'nom', c.nom,
          'prenom', c.prenom,
          'email', c.email,
          'telephone', c.telephone,
          'adresse', c.adresse,
          'cin', c.cin,
          'notes', c.notes
        ) as clients,
        (
          SELECT COALESCE(json_agg(
            json_build_object(
              'id', doc.id,
              'nom', doc.nom,
              'type', doc.type,
              'url', doc.chemin_fichier,
              'taille', doc.taille_fichier,
              'created_at', doc.created_at
            ) ORDER BY doc.created_at DESC
          ), '[]'::json)
          FROM documents doc
          WHERE doc.dossier_id = d.id
        ) as documents,
        (
          SELECT COALESCE(json_agg(
            act.* ORDER BY act.created_at DESC
          ), '[]'::json)
          FROM actions act
          WHERE act.dossier_id = d.id
        ) as actions,
        (
          SELECT COALESCE(json_agg(
            ech.* ORDER BY ech.date_echeance ASC
          ), '[]'::json)
          FROM echeances ech
          WHERE ech.dossier_id = d.id
        ) as echeances
      FROM dossiers d
      LEFT JOIN clients c ON d.client_id = c.id
      WHERE d.id = $1 AND d.user_id = $2`,
      [dossierId, userId]
    )

    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Dossier non trouvé' }, { status: 404 })
    }

    return NextResponse.json(mapDossierFromDB(result.rows[0]))
  } catch (error) {
    console.error('Erreur GET /api/dossiers/[id]:', error)
    return NextResponse.json(
      { error: 'Erreur récupération dossier' },
      { status: 500 }
    )
  }
}

// =============================================================================
// PATCH: Mettre à jour dossier
// =============================================================================

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { id: dossierId } = await params
    const session = await getSession()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
    }

    const userId = session.user.id
    const body = await request.json()

    // Validation partielle avec Zod (partial update)
    const validatedData = dossierSchema.partial().parse(body)

    // Supprimer les champs undefined
    const updateData: Record<string, any> = {}
    Object.entries(validatedData).forEach(([key, value]) => {
      if (value !== undefined) {
        updateData[key] = value
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
    const values = [...Object.values(updateData), dossierId, userId]

    const result = await query(
      `UPDATE dossiers
       SET ${setClause}, updated_at = NOW()
       WHERE id = $${values.length - 1} AND user_id = $${values.length}
       RETURNING *`,
      values
    )

    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Dossier non trouvé' }, { status: 404 })
    }

    // Récupérer le dossier mis à jour avec client
    const dossier = await query(
      `SELECT d.*,
        json_build_object(
          'id', c.id,
          'type_client', c.type_client,
          'nom', c.nom,
          'prenom', c.prenom,
          'email', c.email,
          'telephone', c.telephone
        ) as clients
      FROM dossiers d
      LEFT JOIN clients c ON d.client_id = c.id
      WHERE d.id = $1`,
      [dossierId]
    )

    return NextResponse.json(mapDossierFromDB(dossier.rows[0]))
  } catch (error) {
    console.error('Erreur PATCH /api/dossiers/[id]:', error)

    // Erreurs de validation Zod
    if (error instanceof Error && error.name === 'ZodError') {
      return NextResponse.json(
        { error: 'Données invalides', details: error.message },
        { status: 400 }
      )
    }

    return NextResponse.json(
      { error: 'Erreur mise à jour dossier' },
      { status: 500 }
    )
  }
}

// =============================================================================
// DELETE: Supprimer dossier
// =============================================================================

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { id: dossierId } = await params
    const session = await getSession()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
    }

    const userId = session.user.id

    // Supprimer le dossier (cascade supprime documents, événements, etc.)
    const result = await query(
      'DELETE FROM dossiers WHERE id = $1 AND user_id = $2 RETURNING id',
      [dossierId, userId]
    )

    if (result.rowCount === 0) {
      return NextResponse.json({ error: 'Dossier non trouvé' }, { status: 404 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Erreur DELETE /api/dossiers/[id]:', error)
    return NextResponse.json(
      { error: 'Erreur suppression dossier' },
      { status: 500 }
    )
  }
}
