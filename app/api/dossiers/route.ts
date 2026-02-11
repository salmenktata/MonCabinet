/**
 * API Route: Gestion Dossiers
 *
 * GET /api/dossiers
 * - Liste des dossiers de l'utilisateur avec filtres
 *
 * POST /api/dossiers
 * - Créer un nouveau dossier
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
    adresse: client.adresse,
    cin: client.cin,
  }
}

function mapStatus(statut: string): string {
  const statusMap: Record<string, string> = {
    'ouvert': 'open',
    'en_cours': 'in_progress',
    'en_attente': 'pending',
    'clos': 'closed',
    'archive': 'archived',
  }
  return statusMap[statut] || statut
}

// =============================================================================
// TYPES
// =============================================================================

interface DossierListParams {
  clientId?: string
  type?: string
  status?: string
  priority?: string
  search?: string
  sortBy?: string
  sortOrder?: 'asc' | 'desc'
  limit?: number
  offset?: number
}

// =============================================================================
// GET: Liste dossiers avec filtres
// =============================================================================

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await getSession()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
    }

    const userId = session.user.id
    const searchParams = request.nextUrl.searchParams

    // Parser les paramètres
    const params: DossierListParams = {
      clientId: searchParams.get('clientId') || undefined,
      type: searchParams.get('type') || undefined,
      status: searchParams.get('status') || undefined,
      priority: searchParams.get('priority') || undefined,
      search: searchParams.get('search') || undefined,
      sortBy: searchParams.get('sortBy') || 'created_at',
      sortOrder: (searchParams.get('sortOrder') as 'asc' | 'desc') || 'desc',
      limit: parseInt(searchParams.get('limit') || '50', 10),
      offset: parseInt(searchParams.get('offset') || '0', 10),
    }

    // Construire la requête SQL dynamiquement
    const conditions: string[] = ['d.user_id = $1']
    const values: any[] = [userId]
    let paramIndex = 2

    if (params.clientId) {
      conditions.push(`d.client_id = $${paramIndex}`)
      values.push(params.clientId)
      paramIndex++
    }

    if (params.type) {
      conditions.push(`d.type_procedure = $${paramIndex}`)
      values.push(params.type)
      paramIndex++
    }

    if (params.status) {
      conditions.push(`d.statut = $${paramIndex}`)
      values.push(params.status)
      paramIndex++
    }

    if (params.priority) {
      conditions.push(`d.priorite = $${paramIndex}`)
      values.push(params.priority)
      paramIndex++
    }

    if (params.search) {
      conditions.push(`(
        d.titre ILIKE $${paramIndex} OR
        d.numero ILIKE $${paramIndex} OR
        d.description ILIKE $${paramIndex}
      )`)
      values.push(`%${params.search}%`)
      paramIndex++
    }

    const whereClause = conditions.join(' AND ')

    // Valider sortBy pour éviter injection SQL
    const validSortFields = [
      'created_at',
      'updated_at',
      'date_ouverture',
      'titre',
      'numero',
      'priorite',
      'statut',
    ]
    const sortBy = validSortFields.includes(params.sortBy || '')
      ? params.sortBy || 'created_at'
      : 'created_at'
    const sortOrder = params.sortOrder === 'asc' ? 'ASC' : 'DESC'

    // Requête principale avec JOIN client
    const sql = `
      SELECT d.*,
        json_build_object(
          'id', c.id,
          'type_client', c.type_client,
          'nom', c.nom,
          'prenom', c.prenom,
          'email', c.email,
          'telephone', c.telephone,
          'adresse', c.adresse,
          'cin', c.cin
        ) as clients
      FROM dossiers d
      LEFT JOIN clients c ON d.client_id = c.id
      WHERE ${whereClause}
      ORDER BY d.${sortBy} ${sortOrder}
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `

    values.push(params.limit, params.offset)

    const result = await query(sql, values)

    // Compter le total (pour pagination)
    const countSql = `
      SELECT COUNT(*) as total
      FROM dossiers d
      WHERE ${whereClause}
    `
    const countValues = values.slice(0, -2) // Enlever limit/offset
    const countResult = await query(countSql, countValues)
    const total = parseInt(countResult.rows[0]?.total || '0', 10)

    return NextResponse.json({
      dossiers: result.rows.map(mapDossierFromDB),
      total,
      hasMore: (params.offset || 0) + result.rows.length < total,
      limit: params.limit || 50,
      offset: params.offset || 0,
    })
  } catch (error) {
    console.error('Erreur GET /api/dossiers:', error)
    return NextResponse.json(
      { error: 'Erreur récupération dossiers' },
      { status: 500 }
    )
  }
}

// =============================================================================
// POST: Créer nouveau dossier
// =============================================================================

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await getSession()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
    }

    const userId = session.user.id
    const body = await request.json()

    // Validation avec Zod
    const validatedData = dossierSchema.parse(body)

    // Préparer les données pour insertion
    const dossierData = {
      user_id: userId,
      ...validatedData,
      montant_litige: validatedData.montant_litige || null,
      date_ouverture: validatedData.date_ouverture || new Date().toISOString().split('T')[0],
      workflow_etape_actuelle: validatedData.workflow_etape_actuelle || 'ASSIGNATION',
    }

    const columns = Object.keys(dossierData).join(', ')
    const values = Object.values(dossierData)
    const placeholders = values.map((_, i) => `$${i + 1}`).join(', ')

    const result = await query(
      `INSERT INTO dossiers (${columns}) VALUES (${placeholders}) RETURNING *`,
      values
    )

    // Récupérer le dossier avec les infos client
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
      [result.rows[0].id]
    )

    return NextResponse.json(mapDossierFromDB(dossier.rows[0]), { status: 201 })
  } catch (error) {
    console.error('Erreur POST /api/dossiers:', error)

    // Erreurs de validation Zod
    if (error instanceof Error && error.name === 'ZodError') {
      return NextResponse.json(
        { error: 'Données invalides', details: error.message },
        { status: 400 }
      )
    }

    return NextResponse.json(
      { error: 'Erreur création dossier' },
      { status: 500 }
    )
  }
}
