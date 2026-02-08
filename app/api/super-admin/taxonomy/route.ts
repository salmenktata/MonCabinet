/**
 * API Route pour la gestion de la taxonomie juridique
 * GET /api/super-admin/taxonomy - Récupérer la taxonomie
 * POST /api/super-admin/taxonomy - Créer un élément
 * PUT /api/super-admin/taxonomy - Modifier un élément
 * DELETE /api/super-admin/taxonomy - Supprimer un élément
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import {
  getAllActiveTaxonomy,
  getTaxonomyByType,
  getTaxonomyByCode,
  createTaxonomy,
  updateTaxonomy,
  deleteTaxonomy,
  getTaxonomyStats,
  invalidateTaxonomyCache,
  type TaxonomyType,
  type CreateTaxonomyInput,
  type UpdateTaxonomyInput,
} from '@/lib/web-scraper/taxonomy-service'

export const dynamic = 'force-dynamic'

/**
 * GET - Récupérer la taxonomie
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
    }

    if (session.user.role !== 'super_admin' && session.user.role !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const type = searchParams.get('type') as TaxonomyType | null
    const code = searchParams.get('code')
    const includeStats = searchParams.get('stats') === 'true'

    // Récupérer un élément spécifique par code
    if (code) {
      const item = await getTaxonomyByCode(code)
      if (!item) {
        return NextResponse.json({ error: 'Élément non trouvé' }, { status: 404 })
      }
      return NextResponse.json({ success: true, data: item })
    }

    // Récupérer par type
    if (type) {
      const items = await getTaxonomyByType(type)
      return NextResponse.json({ success: true, data: items })
    }

    // Récupérer tout
    const taxonomy = await getAllActiveTaxonomy()

    // Grouper par type
    const grouped = {
      category: taxonomy.filter(t => t.type === 'category'),
      domain: taxonomy.filter(t => t.type === 'domain'),
      document_type: taxonomy.filter(t => t.type === 'document_type'),
      tribunal: taxonomy.filter(t => t.type === 'tribunal'),
      chamber: taxonomy.filter(t => t.type === 'chamber'),
    }

    let stats = null
    if (includeStats) {
      stats = await getTaxonomyStats()
    }

    return NextResponse.json({
      success: true,
      data: grouped,
      stats,
    })
  } catch (error) {
    console.error('[API Taxonomy] Erreur GET:', error)
    return NextResponse.json(
      { error: 'Erreur lors de la récupération de la taxonomie' },
      { status: 500 }
    )
  }
}

/**
 * POST - Créer un élément de taxonomie
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
    }

    if (session.user.role !== 'super_admin' && session.user.role !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })
    }

    const body = await request.json()
    const { type, code, parentCode, labelFr, labelAr, description, icon, color, sortOrder } = body

    // Validation
    if (!type || !code || !labelFr || !labelAr) {
      return NextResponse.json(
        { error: 'Champs requis manquants: type, code, labelFr, labelAr' },
        { status: 400 }
      )
    }

    const validTypes: TaxonomyType[] = ['category', 'domain', 'document_type', 'tribunal', 'chamber']
    if (!validTypes.includes(type)) {
      return NextResponse.json(
        { error: `Type invalide. Types valides: ${validTypes.join(', ')}` },
        { status: 400 }
      )
    }

    // Vérifier si le code existe déjà
    const existing = await getTaxonomyByCode(code)
    if (existing) {
      return NextResponse.json(
        { error: 'Ce code existe déjà' },
        { status: 409 }
      )
    }

    const input: CreateTaxonomyInput = {
      type,
      code,
      parentCode,
      labelFr,
      labelAr,
      description,
      icon,
      color,
      sortOrder,
    }

    const created = await createTaxonomy(input)
    invalidateTaxonomyCache()

    return NextResponse.json({
      success: true,
      data: created,
      message: 'Élément créé avec succès',
    })
  } catch (error) {
    console.error('[API Taxonomy] Erreur POST:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erreur lors de la création' },
      { status: 500 }
    )
  }
}

/**
 * PUT - Modifier un élément de taxonomie
 */
export async function PUT(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
    }

    if (session.user.role !== 'super_admin' && session.user.role !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })
    }

    const body = await request.json()
    const { code, ...updates } = body

    if (!code) {
      return NextResponse.json(
        { error: 'Code requis' },
        { status: 400 }
      )
    }

    const input: UpdateTaxonomyInput = {}
    if (updates.labelFr !== undefined) input.labelFr = updates.labelFr
    if (updates.labelAr !== undefined) input.labelAr = updates.labelAr
    if (updates.description !== undefined) input.description = updates.description
    if (updates.icon !== undefined) input.icon = updates.icon
    if (updates.color !== undefined) input.color = updates.color
    if (updates.isActive !== undefined) input.isActive = updates.isActive
    if (updates.sortOrder !== undefined) input.sortOrder = updates.sortOrder
    if (updates.parentCode !== undefined) input.parentCode = updates.parentCode

    const updated = await updateTaxonomy(code, input)

    if (!updated) {
      return NextResponse.json(
        { error: 'Élément non trouvé' },
        { status: 404 }
      )
    }

    invalidateTaxonomyCache()

    return NextResponse.json({
      success: true,
      data: updated,
      message: 'Élément modifié avec succès',
    })
  } catch (error) {
    console.error('[API Taxonomy] Erreur PUT:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erreur lors de la modification' },
      { status: 500 }
    )
  }
}

/**
 * DELETE - Supprimer un élément de taxonomie
 */
export async function DELETE(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
    }

    if (session.user.role !== 'super_admin' && session.user.role !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const code = searchParams.get('code')

    if (!code) {
      return NextResponse.json(
        { error: 'Code requis' },
        { status: 400 }
      )
    }

    const deleted = await deleteTaxonomy(code)

    if (!deleted) {
      return NextResponse.json(
        { error: 'Élément non trouvé' },
        { status: 404 }
      )
    }

    invalidateTaxonomyCache()

    return NextResponse.json({
      success: true,
      message: 'Élément supprimé avec succès',
    })
  } catch (error) {
    console.error('[API Taxonomy] Erreur DELETE:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erreur lors de la suppression' },
      { status: 500 }
    )
  }
}
