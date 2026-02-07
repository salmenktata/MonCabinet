/**
 * API Route: Administration - Sources Web
 *
 * GET /api/admin/web-sources
 * - Liste les sources web configurées
 * - Paramètres: category, isActive, healthStatus, search, limit, offset
 *
 * POST /api/admin/web-sources
 * - Crée une nouvelle source web
 *
 * Réservé aux administrateurs
 */

import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

import { getSession } from '@/lib/auth/session'
import { db } from '@/lib/db/postgres'
import {
  listWebSources,
  createWebSource,
  getWebSourcesStats,
} from '@/lib/web-scraper'
import type { CreateWebSourceInput, WebSourceCategory } from '@/lib/web-scraper'

// =============================================================================
// VÉRIFICATION ADMIN
// =============================================================================

async function checkAdminAccess(userId: string): Promise<boolean> {
  const result = await db.query('SELECT role FROM users WHERE id = $1', [userId])
  const role = result.rows[0]?.role
  return role === 'admin' || role === 'super_admin'
}

// =============================================================================
// GET: Liste des sources
// =============================================================================

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await getSession()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
    }

    const isAdmin = await checkAdminAccess(session.user.id)
    if (!isAdmin) {
      return NextResponse.json({ error: 'Accès réservé aux administrateurs' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const category = searchParams.get('category') || undefined
    const isActive = searchParams.get('isActive')
    const healthStatus = searchParams.get('healthStatus') as 'healthy' | 'degraded' | 'failing' | 'unknown' | null
    const search = searchParams.get('search') || undefined
    const limit = parseInt(searchParams.get('limit') || '50')
    const offset = parseInt(searchParams.get('offset') || '0')
    const includeStats = searchParams.get('includeStats') === 'true'

    const { sources, total } = await listWebSources({
      category,
      isActive: isActive ? isActive === 'true' : undefined,
      healthStatus: healthStatus || undefined,
      search,
      limit,
      offset,
    })

    let stats = null
    if (includeStats) {
      stats = await getWebSourcesStats()
    }

    return NextResponse.json({
      sources,
      total,
      pagination: {
        limit,
        offset,
        hasMore: offset + sources.length < total,
      },
      ...(stats ? { stats } : {}),
    })
  } catch (error) {
    console.error('Erreur liste web sources:', error)
    return NextResponse.json(
      { error: 'Erreur récupération des sources' },
      { status: 500 }
    )
  }
}

// =============================================================================
// POST: Créer une source
// =============================================================================

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await getSession()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
    }

    const isAdmin = await checkAdminAccess(session.user.id)
    if (!isAdmin) {
      return NextResponse.json({ error: 'Accès réservé aux administrateurs' }, { status: 403 })
    }

    const body = await request.json()

    // Validation
    if (!body.name || !body.baseUrl || !body.category) {
      return NextResponse.json(
        { error: 'Nom, URL de base et catégorie requis' },
        { status: 400 }
      )
    }

    // Valider l'URL
    try {
      new URL(body.baseUrl)
    } catch {
      return NextResponse.json(
        { error: 'URL invalide' },
        { status: 400 }
      )
    }

    const validCategories: WebSourceCategory[] = [
      'legislation', 'jurisprudence', 'doctrine', 'jort',
      'modeles', 'procedures', 'formulaires', 'autre'
    ]
    if (!validCategories.includes(body.category)) {
      return NextResponse.json(
        { error: `Catégorie invalide. Valeurs acceptées: ${validCategories.join(', ')}` },
        { status: 400 }
      )
    }

    const input: CreateWebSourceInput = {
      name: body.name,
      baseUrl: body.baseUrl,
      description: body.description,
      category: body.category,
      language: body.language || 'fr',
      priority: body.priority || 5,
      crawlFrequency: body.crawlFrequency || '24 hours',
      maxDepth: body.maxDepth || 3,
      maxPages: body.maxPages || 200,
      requiresJavascript: body.requiresJavascript || false,
      cssSelectors: body.cssSelectors || {},
      urlPatterns: body.urlPatterns || [],
      excludedPatterns: body.excludedPatterns || [],
      sitemapUrl: body.sitemapUrl,
      rssFeedUrl: body.rssFeedUrl,
      useSitemap: body.useSitemap || false,
      downloadFiles: body.downloadFiles !== false,
      respectRobotsTxt: body.respectRobotsTxt !== false,
      rateLimitMs: body.rateLimitMs || 1000,
      customHeaders: body.customHeaders || {},
    }

    const source = await createWebSource(input, session.user.id)

    return NextResponse.json(
      {
        message: 'Source créée avec succès',
        source,
      },
      { status: 201 }
    )
  } catch (error) {
    console.error('Erreur création web source:', error)
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Erreur création source',
      },
      { status: 500 }
    )
  }
}
