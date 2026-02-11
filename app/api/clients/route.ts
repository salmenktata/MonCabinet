/**
 * API Route: Gestion Clients
 *
 * GET /api/clients
 * - Liste des clients de l'utilisateur avec filtres
 *
 * POST /api/clients
 * - Créer un nouveau client
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
// TYPES
// =============================================================================

interface ClientListParams {
  type?: 'particulier' | 'entreprise'
  search?: string
  sortBy?: string
  sortOrder?: 'asc' | 'desc'
  limit?: number
  offset?: number
}

// =============================================================================
// GET: Liste clients avec filtres
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
    const params: ClientListParams = {
      type: (searchParams.get('type') as 'particulier' | 'entreprise') || undefined,
      search: searchParams.get('search') || undefined,
      sortBy: searchParams.get('sortBy') || 'created_at',
      sortOrder: (searchParams.get('sortOrder') as 'asc' | 'desc') || 'desc',
      limit: parseInt(searchParams.get('limit') || '50', 10),
      offset: parseInt(searchParams.get('offset') || '0', 10),
    }

    // Construire la requête SQL dynamiquement
    const conditions: string[] = ['user_id = $1']
    const values: any[] = [userId]
    let paramIndex = 2

    if (params.type) {
      conditions.push(`type_client = $${paramIndex}`)
      values.push(params.type)
      paramIndex++
    }

    if (params.search) {
      conditions.push(`(
        nom ILIKE $${paramIndex} OR
        prenom ILIKE $${paramIndex} OR
        email ILIKE $${paramIndex} OR
        telephone ILIKE $${paramIndex} OR
        cin ILIKE $${paramIndex}
      )`)
      values.push(`%${params.search}%`)
      paramIndex++
    }

    const whereClause = conditions.join(' AND ')

    // Valider sortBy pour éviter injection SQL
    const validSortFields = [
      'created_at',
      'updated_at',
      'nom',
      'prenom',
      'type_client',
    ]
    const sortBy = validSortFields.includes(params.sortBy || '')
      ? params.sortBy || 'created_at'
      : 'created_at'
    const sortOrder = params.sortOrder === 'asc' ? 'ASC' : 'DESC'

    // Requête principale
    const sql = `
      SELECT *
      FROM clients
      WHERE ${whereClause}
      ORDER BY ${sortBy} ${sortOrder}
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `

    values.push(params.limit, params.offset)

    const result = await query(sql, values)

    // Compter le total (pour pagination)
    const countSql = `
      SELECT COUNT(*) as total
      FROM clients
      WHERE ${whereClause}
    `
    const countValues = values.slice(0, -2) // Enlever limit/offset
    const countResult = await query(countSql, countValues)
    const total = parseInt(countResult.rows[0]?.total || '0', 10)

    return NextResponse.json({
      clients: result.rows.map(mapClientFromDB),
      total,
      hasMore: (params.offset || 0) + result.rows.length < total,
      limit: params.limit || 50,
      offset: params.offset || 0,
    })
  } catch (error) {
    console.error('Erreur GET /api/clients:', error)
    return NextResponse.json(
      { error: 'Erreur récupération clients' },
      { status: 500 }
    )
  }
}

// =============================================================================
// POST: Créer nouveau client
// =============================================================================

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await getSession()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
    }

    const userId = session.user.id
    const body = await request.json()

    // Validation basique
    if (!body.nom) {
      return NextResponse.json(
        { error: 'Le nom est requis' },
        { status: 400 }
      )
    }

    if (!body.type_client || !['particulier', 'entreprise'].includes(body.type_client)) {
      return NextResponse.json(
        { error: 'Type client invalide (particulier ou entreprise)' },
        { status: 400 }
      )
    }

    // Préparer les données pour insertion
    const clientData = {
      user_id: userId,
      type_client: body.type_client,
      nom: body.nom,
      prenom: body.prenom || null,
      cin: body.cin || null,
      email: body.email || null,
      telephone: body.telephone || null,
      telephone_secondaire: body.telephone_secondaire || null,
      adresse: body.adresse || null,
      code_postal: body.code_postal || null,
      ville: body.ville || null,
      pays: body.pays || 'Tunisie',
      notes: body.notes || null,
    }

    const columns = Object.keys(clientData).join(', ')
    const values = Object.values(clientData)
    const placeholders = values.map((_, i) => `$${i + 1}`).join(', ')

    const result = await query(
      `INSERT INTO clients (${columns}) VALUES (${placeholders}) RETURNING *`,
      values
    )

    return NextResponse.json(mapClientFromDB(result.rows[0]), { status: 201 })
  } catch (error) {
    console.error('Erreur POST /api/clients:', error)

    // Erreur contrainte unique (email, CIN, etc.)
    if (error instanceof Error && error.message.includes('duplicate key')) {
      return NextResponse.json(
        { error: 'Un client avec cet email ou CIN existe déjà' },
        { status: 409 }
      )
    }

    return NextResponse.json(
      { error: 'Erreur création client' },
      { status: 500 }
    )
  }
}
