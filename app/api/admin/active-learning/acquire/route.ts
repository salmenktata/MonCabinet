/**
 * API Route - Acquisition Automatique Gap KB (Phase 5.2)
 *
 * POST /api/admin/active-learning/acquire
 * Body: { gapId: string, topic: string }
 *
 * Lance crawl automatique pour combler gap KB identifié.
 *
 * @module app/api/admin/active-learning/acquire/route
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth/auth-options'
import { db } from '@/lib/db/postgres'
import { WebSourceCategory } from '@/lib/web-scraper/types'

// =============================================================================
// POST - Lancer Acquisition Automatique
// =============================================================================

export async function POST(request: NextRequest) {
  try {
    // Authentification admin
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
    }

    // Vérifier rôle admin/super-admin
    const userResult = await db.query(
      `SELECT role FROM users WHERE id = $1`,
      [session.user.id]
    )
    const userRole = userResult.rows[0]?.role
    if (userRole !== 'admin' && userRole !== 'super-admin') {
      return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })
    }

    // Parser body
    const body = await request.json()
    const { gapId, topic } = body

    if (!gapId || !topic) {
      return NextResponse.json(
        { error: 'gapId et topic requis' },
        { status: 400 }
      )
    }

    console.log(
      `[Active Learning Acquire] Lancement acquisition pour gap "${topic}"...`
    )

    // 1. Déterminer source type et URL selon topic
    const sourceConfig = determineSourceConfig(topic)

    // 2. Créer web_source en DB
    const insertQuery = `
      INSERT INTO web_sources (
        name,
        base_url,
        category,
        description,
        status,
        crawl_frequency,
        max_pages,
        created_by,
        metadata
      ) VALUES ($1, $2, $3, $4, 'pending', 'weekly', 100, $5, $6)
      RETURNING id
    `

    const result = await db.query(insertQuery, [
      `Acquisition Auto - ${topic}`,
      sourceConfig.baseUrl,
      sourceConfig.category,
      `Source créée automatiquement par Active Learning pour combler gap KB: ${topic}`,
      session.user.id,
      JSON.stringify({
        gapId,
        topic,
        createdBy: 'active_learning',
        createdAt: new Date().toISOString(),
      }),
    ])

    const sourceId = result.rows[0].id

    // 3. Créer crawl job
    const jobQuery = `
      INSERT INTO web_crawl_jobs (
        source_id,
        status,
        scheduled_for
      ) VALUES ($1, 'pending', NOW())
      RETURNING id
    `

    const jobResult = await db.query(jobQuery, [sourceId])
    const jobId = jobResult.rows[0].id

    console.log(
      `[Active Learning Acquire] ✅ Source ${sourceId} et job ${jobId} créés pour "${topic}"`
    )

    return NextResponse.json({
      success: true,
      sourceId,
      jobId,
      topic,
      message: `Acquisition lancée pour "${topic}"`,
    })
  } catch (error) {
    console.error('[Active Learning Acquire] Erreur:', error)
    return NextResponse.json(
      {
        error: 'Erreur serveur',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    )
  }
}

// =============================================================================
// UTILITAIRES
// =============================================================================

interface SourceConfig {
  baseUrl: string
  category: WebSourceCategory
}

function determineSourceConfig(topic: string): SourceConfig {
  const topicLower = topic.toLowerCase()

  // Jurisprudence
  if (
    topicLower.includes('jurisprudence') ||
    topicLower.includes('cassation') ||
    topicLower.includes('appel') ||
    topicLower.includes('arrêt')
  ) {
    return {
      baseUrl: 'https://cassation.tn',
      category: 'jurisprudence',
    }
  }

  // Codes et lois
  if (
    topicLower.includes('code') ||
    topicLower.includes('loi') ||
    topicLower.includes('legislation') ||
    topicLower.includes('décret')
  ) {
    return {
      baseUrl: 'https://legislation.tn',
      category: 'codes',
    }
  }

  // Domaines spécifiques
  if (topicLower.includes('immobilier') || topicLower.includes('bail')) {
    return {
      baseUrl: 'https://cassation.tn',
      category: 'jurisprudence',
    }
  }

  if (topicLower.includes('travail') || topicLower.includes('salaire')) {
    return {
      baseUrl: 'https://cassation.tn',
      category: 'jurisprudence',
    }
  }

  if (topicLower.includes('famille') || topicLower.includes('divorce')) {
    return {
      baseUrl: 'https://cassation.tn',
      category: 'jurisprudence',
    }
  }

  if (topicLower.includes('pénal') || topicLower.includes('crime')) {
    return {
      baseUrl: 'https://cassation.tn',
      category: 'jurisprudence',
    }
  }

  if (topicLower.includes('commercial') || topicLower.includes('société')) {
    return {
      baseUrl: 'https://cassation.tn',
      category: 'jurisprudence',
    }
  }

  // Doctrine (par défaut)
  return {
    baseUrl: 'https://da5ira.com',
    category: 'doctrine',
  }
}
