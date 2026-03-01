/**
 * API Route - Gestion du Gold Eval Dataset
 *
 * GET    /api/admin/eval/gold                  → Liste les questions (filtres: domain, difficulty, intentType, search, limit, offset)
 * GET    /api/admin/eval/gold?stats=true        → Stats agrégées
 * GET    /api/admin/eval/gold?export=true       → Export JSON complet
 * POST   /api/admin/eval/gold                  → Créer une question
 * PATCH  /api/admin/eval/gold?id=xxx           → Modifier une question
 * DELETE /api/admin/eval/gold?id=xxx           → Supprimer une question
 *
 * @module app/api/admin/eval/gold/route
 */

import { NextRequest, NextResponse } from 'next/server'
import { withAdminApiAuth } from '@/lib/auth/with-admin-api-auth'
import {
  listGoldCases,
  getGoldDatasetStats,
  getGoldCase,
  createGoldCase,
  updateGoldCase,
  deleteGoldCase,
  exportGoldDataset,
} from '@/lib/ai/gold-dataset-service'

// =============================================================================
// GET — Liste, stats, export
// =============================================================================

export const GET = withAdminApiAuth(async (request: NextRequest) => {
  const { searchParams } = request.nextUrl
  const statsOnly = searchParams.get('stats') === 'true'
  const exportAll = searchParams.get('export') === 'true'

  if (statsOnly) {
    const stats = await getGoldDatasetStats()
    return NextResponse.json(stats)
  }

  if (exportAll) {
    const cases = await exportGoldDataset()
    return NextResponse.json(cases, {
      headers: {
        'Content-Disposition': 'attachment; filename="gold-eval-dataset.json"',
        'Content-Type': 'application/json',
      },
    })
  }

  const domain = searchParams.get('domain') || undefined
  const difficulty = searchParams.get('difficulty') || undefined
  const intentType = searchParams.get('intentType') || undefined
  const search = searchParams.get('search') || undefined
  const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 200)
  const offset = parseInt(searchParams.get('offset') || '0')

  const [cases, stats] = await Promise.all([
    listGoldCases({ domain, difficulty, intentType, search, limit, offset }),
    getGoldDatasetStats(),
  ])

  return NextResponse.json({ cases, stats })
})

// =============================================================================
// POST — Créer une question
// =============================================================================

export const POST = withAdminApiAuth(async (request: NextRequest) => {
  const body = await request.json().catch(() => null)

  if (!body) {
    return NextResponse.json({ error: 'Body JSON invalide' }, { status: 400 })
  }

  const { domain, difficulty, question, intentType, keyPoints, mandatoryCitations } = body

  if (!domain || !difficulty || !question || !intentType) {
    return NextResponse.json(
      { error: 'Champs requis : domain, difficulty, question, intentType' },
      { status: 400 }
    )
  }

  if (!Array.isArray(keyPoints) || keyPoints.length === 0) {
    return NextResponse.json(
      { error: 'keyPoints doit être un tableau non vide' },
      { status: 400 }
    )
  }

  try {
    const created = await createGoldCase({
      id: body.id || undefined,
      domain,
      difficulty,
      question,
      intentType,
      keyPoints,
      mandatoryCitations: Array.isArray(mandatoryCitations) ? mandatoryCitations : [],
      expectedArticles: Array.isArray(body.expectedArticles) ? body.expectedArticles : [],
      goldChunkIds: Array.isArray(body.goldChunkIds) ? body.goldChunkIds : [],
      goldDocumentIds: Array.isArray(body.goldDocumentIds) ? body.goldDocumentIds : [],
      minRecallAt5: body.minRecallAt5 ?? null,
      evaluationCriteria: body.evaluationCriteria ?? null,
      notes: body.notes ?? null,
    })

    return NextResponse.json({ success: true, case: created }, { status: 201 })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erreur inconnue'
    if (message.includes('duplicate key') || message.includes('unique')) {
      return NextResponse.json({ error: `L'id "${body.id}" existe déjà` }, { status: 409 })
    }
    return NextResponse.json({ error: message }, { status: 500 })
  }
})

// =============================================================================
// PATCH — Modifier une question
// =============================================================================

export const PATCH = withAdminApiAuth(async (request: NextRequest) => {
  const { searchParams } = request.nextUrl
  const id = searchParams.get('id')

  if (!id) {
    return NextResponse.json({ error: 'Paramètre id requis' }, { status: 400 })
  }

  const existing = await getGoldCase(id)
  if (!existing) {
    return NextResponse.json({ error: `Question "${id}" introuvable` }, { status: 404 })
  }

  const body = await request.json().catch(() => null)
  if (!body) {
    return NextResponse.json({ error: 'Body JSON invalide' }, { status: 400 })
  }

  const updated = await updateGoldCase(id, {
    domain: body.domain,
    difficulty: body.difficulty,
    question: body.question,
    intentType: body.intentType,
    keyPoints: body.keyPoints,
    mandatoryCitations: body.mandatoryCitations,
    expectedArticles: body.expectedArticles,
    goldChunkIds: body.goldChunkIds,
    goldDocumentIds: body.goldDocumentIds,
    minRecallAt5: body.minRecallAt5,
    evaluationCriteria: body.evaluationCriteria,
    notes: body.notes,
  })

  return NextResponse.json({ success: true, case: updated })
})

// =============================================================================
// DELETE — Supprimer une question
// =============================================================================

export const DELETE = withAdminApiAuth(async (request: NextRequest) => {
  const { searchParams } = request.nextUrl
  const id = searchParams.get('id')

  if (!id) {
    return NextResponse.json({ error: 'Paramètre id requis' }, { status: 400 })
  }

  const deleted = await deleteGoldCase(id)
  if (!deleted) {
    return NextResponse.json({ error: `Question "${id}" introuvable` }, { status: 404 })
  }

  return NextResponse.json({ success: true, id })
})
