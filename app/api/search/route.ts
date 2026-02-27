import { NextRequest, NextResponse } from 'next/server'

// Force dynamic rendering - pas de prérendu statique
export const dynamic = 'force-dynamic'

import { query } from '@/lib/db/postgres'
import { getSession } from '@/lib/auth/session'

// =============================================================================
// CACHE MÉMOIRE SIMPLE
// =============================================================================

const searchCache = new Map<string, { data: any; timestamp: number }>()
const CACHE_TTL = 30000 // 30 secondes

function getCachedSearch(key: string) {
  const cached = searchCache.get(key)
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data
  }
  return null
}

function setCachedSearch(key: string, data: any) {
  // Nettoyer les anciennes entrées (max 100)
  if (searchCache.size > 100) {
    const oldest = [...searchCache.entries()]
      .sort((a, b) => a[1].timestamp - b[1].timestamp)[0]
    searchCache.delete(oldest[0])
  }
  searchCache.set(key, { data, timestamp: Date.now() })
}

// =============================================================================
// GET: Recherche globale
// =============================================================================

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const searchQuery = searchParams.get('q')

    if (!searchQuery || searchQuery.length < 2) {
      return NextResponse.json({ results: { clients: [], dossiers: [], factures: [], documents: [], echeances: [], templates: [] } })
    }

    const session = await getSession()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
    }

    const userId = session.user.id
    const searchTerm = `%${searchQuery.trim()}%`

    // Vérifier le cache
    const cacheKey = `${userId}:${searchQuery.trim().toLowerCase()}`
    const cachedResult = getCachedSearch(cacheKey)
    if (cachedResult) {
      return NextResponse.json({ results: cachedResult }, {
        headers: {
          'Cache-Control': 'private, max-age=30',
        }
      })
    }

    // Recherche parallèle dans toutes les tables
    const [clients, dossiers, factures, documents, echeances, templates] = await Promise.all([
      // Clients
      query(
        `SELECT id, nom, prenom, type_client, email,
                COALESCE(denomination, '') as denomination
         FROM clients
         WHERE user_id = $1 AND (
           nom ILIKE $2 OR
           prenom ILIKE $2 OR
           denomination ILIKE $2 OR
           email ILIKE $2
         )
         LIMIT 5`,
        [userId, searchTerm]
      ),
      // Dossiers (avec nom client)
      query(
        `SELECT d.id, d.numero, d.objet, d.statut, d.type_procedure,
                COALESCE(
                  NULLIF(TRIM(COALESCE(c.prenom,'') || ' ' || COALESCE(c.nom,'')), ''),
                  c.denomination
                ) AS client_nom
         FROM dossiers d
         LEFT JOIN clients c ON d.client_id = c.id
         WHERE d.user_id = $1 AND (
           d.numero ILIKE $2 OR
           d.objet ILIKE $2
         )
         LIMIT 5`,
        [userId, searchTerm]
      ),
      // Factures (avec nom client)
      query(
        `SELECT f.id, f.numero, f.montant_ttc::float AS montant_ttc, f.statut,
                COALESCE(
                  NULLIF(TRIM(COALESCE(c.prenom,'') || ' ' || COALESCE(c.nom,'')), ''),
                  c.denomination, 'Client'
                ) AS client_nom
         FROM factures f
         LEFT JOIN clients c ON f.client_id = c.id
         WHERE f.user_id = $1 AND (f.numero ILIKE $2)
         LIMIT 5`,
        [userId, searchTerm]
      ),
      // Documents
      query(
        `SELECT id, nom as nom_fichier, type as type_document
         FROM documents
         WHERE user_id = $1 AND nom ILIKE $2
         LIMIT 5`,
        [userId, searchTerm]
      ),
      // Échéances actives non terminées
      query(
        `SELECT id, titre, TO_CHAR(date_echeance,'DD/MM/YYYY') AS date_echeance_fmt, statut
         FROM echeances
         WHERE user_id = $1 AND titre ILIKE $2
           AND terminee = false AND statut = 'actif'
         LIMIT 5`,
        [userId, searchTerm]
      ),
      // Templates
      query(
        `SELECT id, nom, description, langue
         FROM templates
         WHERE user_id = $1 AND (nom ILIKE $2 OR description ILIKE $2)
         LIMIT 5`,
        [userId, searchTerm]
      ),
    ])

    const results = {
      clients: clients.rows || [],
      dossiers: dossiers.rows || [],
      factures: factures.rows || [],
      documents: documents.rows || [],
      echeances: echeances.rows || [],
      templates: templates.rows || [],
    }

    // Mettre en cache
    setCachedSearch(cacheKey, results)

    return NextResponse.json({ results }, {
      headers: {
        'Cache-Control': 'private, max-age=30',
      }
    })
  } catch (error) {
    console.error('Erreur recherche:', error)
    return NextResponse.json({ error: 'Erreur' }, { status: 500 })
  }
}
