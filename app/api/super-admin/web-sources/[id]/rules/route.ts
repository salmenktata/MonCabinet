/**
 * API Route pour la gestion des règles de classification par source
 * GET /api/super-admin/web-sources/[id]/rules - Récupérer les règles
 * POST /api/super-admin/web-sources/[id]/rules - Créer une règle
 * PUT /api/super-admin/web-sources/[id]/rules - Modifier une règle
 * DELETE /api/super-admin/web-sources/[id]/rules - Supprimer une règle
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import {
  getRulesForSource,
  getGlobalRules,
  getRuleById,
  createRule,
  updateRule,
  deleteRule,
  getRulesStats,
  matchRules,
  type CreateRuleInput,
  type UpdateRuleInput,
} from '@/lib/web-scraper/classification-rules-service'
import { db } from '@/lib/db/postgres'

export const dynamic = 'force-dynamic'

interface RouteContext {
  params: Promise<{ id: string }>
}

/**
 * GET - Récupérer les règles d'une source
 */
export async function GET(
  request: NextRequest,
  context: RouteContext
) {
  try {
    const session = await getSession()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
    }

    if (session.user.role !== 'super_admin' && session.user.role !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })
    }

    const { id: webSourceId } = await context.params
    const { searchParams } = new URL(request.url)
    const includeGlobal = searchParams.get('includeGlobal') === 'true'
    const includeStats = searchParams.get('stats') === 'true'
    const testUrl = searchParams.get('testUrl')

    // Vérifier que la source existe
    const sourceResult = await db.query(
      'SELECT id, name FROM web_sources WHERE id = $1',
      [webSourceId]
    )

    if (sourceResult.rows.length === 0) {
      return NextResponse.json({ error: 'Source non trouvée' }, { status: 404 })
    }

    const source = sourceResult.rows[0]

    // Récupérer les règles de la source
    const rules = await getRulesForSource(webSourceId)

    // Optionnellement, récupérer aussi les règles globales
    let globalRules: Awaited<ReturnType<typeof getGlobalRules>> = []
    if (includeGlobal) {
      globalRules = await getGlobalRules()
    }

    // Optionnellement, récupérer les stats
    let stats = null
    if (includeStats) {
      stats = await getRulesStats(webSourceId)
    }

    // Optionnellement, tester les règles sur une URL
    let testResults = null
    if (testUrl) {
      testResults = await matchRules(webSourceId, {
        url: testUrl,
        title: undefined,
        structure: undefined,
      })
    }

    return NextResponse.json({
      success: true,
      data: {
        source: { id: source.id, name: source.name },
        rules,
        globalRules,
        stats,
        testResults,
      },
    })
  } catch (error) {
    console.error('[API Rules] Erreur GET:', error)
    return NextResponse.json(
      { error: 'Erreur lors de la récupération des règles' },
      { status: 500 }
    )
  }
}

/**
 * POST - Créer une règle
 */
export async function POST(
  request: NextRequest,
  context: RouteContext
) {
  try {
    const session = await getSession()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
    }

    if (session.user.role !== 'super_admin' && session.user.role !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })
    }

    const { id: webSourceId } = await context.params
    const body = await request.json()

    const {
      name,
      description,
      conditions,
      targetCategory,
      targetDomain,
      targetDocumentType,
      priority,
      confidenceBoost,
    } = body

    // Validation
    if (!name) {
      return NextResponse.json(
        { error: 'Nom requis' },
        { status: 400 }
      )
    }

    if (!conditions || !Array.isArray(conditions) || conditions.length === 0) {
      return NextResponse.json(
        { error: 'Au moins une condition est requise' },
        { status: 400 }
      )
    }

    // Vérifier que la source existe
    const sourceResult = await db.query(
      'SELECT id FROM web_sources WHERE id = $1',
      [webSourceId]
    )

    if (sourceResult.rows.length === 0) {
      return NextResponse.json({ error: 'Source non trouvée' }, { status: 404 })
    }

    // Valider les conditions
    const validConditionTypes = [
      'url_pattern', 'url_contains', 'url_segment', 'url_starts_with', 'url_ends_with',
      'breadcrumb_contains', 'breadcrumb_level', 'breadcrumb_exact',
      'title_contains', 'title_pattern', 'heading_contains', 'domain_match',
    ]

    for (const condition of conditions) {
      if (!condition.type || !validConditionTypes.includes(condition.type)) {
        return NextResponse.json(
          { error: `Type de condition invalide: ${condition.type}` },
          { status: 400 }
        )
      }
      if (!condition.value) {
        return NextResponse.json(
          { error: 'Chaque condition doit avoir une valeur' },
          { status: 400 }
        )
      }
    }

    const input: CreateRuleInput = {
      webSourceId,
      name,
      description,
      conditions,
      targetCategory,
      targetDomain,
      targetDocumentType,
      priority: priority || 0,
      confidenceBoost: confidenceBoost || 0.2,
    }

    const rule = await createRule(input, session.user.id)

    return NextResponse.json({
      success: true,
      data: rule,
      message: 'Règle créée avec succès',
    })
  } catch (error) {
    console.error('[API Rules] Erreur POST:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erreur lors de la création' },
      { status: 500 }
    )
  }
}

/**
 * PUT - Modifier une règle
 */
export async function PUT(
  request: NextRequest,
  context: RouteContext
) {
  try {
    const session = await getSession()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
    }

    if (session.user.role !== 'super_admin' && session.user.role !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })
    }

    const body = await request.json()
    const { ruleId, ...updates } = body

    if (!ruleId) {
      return NextResponse.json(
        { error: 'ruleId requis' },
        { status: 400 }
      )
    }

    // Vérifier que la règle existe
    const existing = await getRuleById(ruleId)
    if (!existing) {
      return NextResponse.json({ error: 'Règle non trouvée' }, { status: 404 })
    }

    const input: UpdateRuleInput = {}
    if (updates.name !== undefined) input.name = updates.name
    if (updates.description !== undefined) input.description = updates.description
    if (updates.conditions !== undefined) input.conditions = updates.conditions
    if (updates.targetCategory !== undefined) input.targetCategory = updates.targetCategory
    if (updates.targetDomain !== undefined) input.targetDomain = updates.targetDomain
    if (updates.targetDocumentType !== undefined) input.targetDocumentType = updates.targetDocumentType
    if (updates.priority !== undefined) input.priority = updates.priority
    if (updates.confidenceBoost !== undefined) input.confidenceBoost = updates.confidenceBoost
    if (updates.isActive !== undefined) input.isActive = updates.isActive

    const updated = await updateRule(ruleId, input)

    if (!updated) {
      return NextResponse.json(
        { error: 'Erreur lors de la mise à jour' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      data: updated,
      message: 'Règle modifiée avec succès',
    })
  } catch (error) {
    console.error('[API Rules] Erreur PUT:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erreur lors de la modification' },
      { status: 500 }
    )
  }
}

/**
 * DELETE - Supprimer une règle
 */
export async function DELETE(
  request: NextRequest,
  context: RouteContext
) {
  try {
    const session = await getSession()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
    }

    if (session.user.role !== 'super_admin' && session.user.role !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const ruleId = searchParams.get('ruleId')

    if (!ruleId) {
      return NextResponse.json(
        { error: 'ruleId requis' },
        { status: 400 }
      )
    }

    const deleted = await deleteRule(ruleId)

    if (!deleted) {
      return NextResponse.json(
        { error: 'Règle non trouvée' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      success: true,
      message: 'Règle supprimée avec succès',
    })
  } catch (error) {
    console.error('[API Rules] Erreur DELETE:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erreur lors de la suppression' },
      { status: 500 }
    )
  }
}
