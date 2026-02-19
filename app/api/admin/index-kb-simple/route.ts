import { getErrorMessage } from '@/lib/utils/error-utils'
/**
 * API temporaire - Indexation simple Knowledge Base (sans pipeline intelligent)
 * POST /api/admin/index-kb-simple
 */

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db/postgres'
import { indexWebPage } from '@/lib/web-scraper/web-indexer-service'
import { safeParseInt } from '@/lib/utils/safe-number'
import { withAdminApiAuth } from '@/lib/auth/with-admin-api-auth'

export const dynamic = 'force-dynamic'
export const maxDuration = 300 // 5 minutes

export const POST = withAdminApiAuth(async (request, _ctx, _session) => {
  try {
    // Désactiver le pipeline intelligent
    process.env.ENABLE_INTELLIGENT_PIPELINE = 'false'

    console.log('🚀 Démarrage indexation simple Google Drive...')

    // Récupérer l'ID de la source Google Drive
    const sourceResult = await db.query(
      "SELECT id, name FROM web_sources WHERE base_url LIKE 'gdrive://%'"
    )

    if (sourceResult.rows.length === 0) {
      return NextResponse.json({ error: 'Source Google Drive non trouvée' }, { status: 404 })
    }

    const source = sourceResult.rows[0]
    const sourceId = source.id
    const sourceName = source.name

    console.log(`📁 Source: ${sourceName}`)

    // Récupérer le nombre de fichiers à indexer depuis le body (optionnel)
    const body = await request.json().catch(() => ({}))
    const batchSize = body.batchSize || 10 // Par défaut 10 fichiers à la fois

    // Compter les pages à indexer
    const countResult = await db.query(
      `SELECT COUNT(*) as count
       FROM web_pages
       WHERE web_source_id = $1
         AND is_indexed = false
         AND extracted_text IS NOT NULL
         AND LENGTH(extracted_text) > 100`,
      [sourceId]
    )

    const totalToIndex = parseInt(countResult.rows[0].count, 10)
    console.log(`📊 Fichiers à indexer: ${totalToIndex}`)

    if (totalToIndex === 0) {
      return NextResponse.json({
        message: 'Aucun fichier à indexer',
        processed: 0,
        succeeded: 0,
        failed: 0,
        remaining: 0,
      })
    }

    // Récupérer un batch de pages à indexer
    const pagesResult = await db.query(
      `SELECT id, title, LENGTH(extracted_text) as text_length
       FROM web_pages
       WHERE web_source_id = $1
         AND is_indexed = false
         AND extracted_text IS NOT NULL
         AND LENGTH(extracted_text) > 100
       ORDER BY last_crawled_at DESC
       LIMIT $2`,
      [sourceId, batchSize]
    )

    let succeeded = 0
    let failed = 0
    const errors: string[] = []

    // Indexer chaque page
    for (let i = 0; i < pagesResult.rows.length; i++) {
      const page = pagesResult.rows[i]
      const progress = `[${i + 1}/${pagesResult.rows.length}]`

      try {
        console.log(`${progress} Indexation: ${page.title} (${page.text_length} chars)`)

        const result = await indexWebPage(page.id)

        if (result.success) {
          succeeded++
          console.log(`  ✓ Succès - ${result.chunksCreated} chunks créés`)
        } else {
          failed++
          const errorMsg = `${page.title}: ${result.error}`
          console.error(`  ✗ Échec: ${result.error}`)
          errors.push(errorMsg)
        }
      } catch (error) {
        failed++
        const errorMsg = `${page.title}: ${getErrorMessage(error)}`
        console.error(`  ✗ Erreur: ${getErrorMessage(error)}`)
        errors.push(errorMsg)
      }

      // Petit délai pour éviter de surcharger
      await new Promise(resolve => setTimeout(resolve, 100))
    }

    const remaining = totalToIndex - pagesResult.rows.length

    console.log('📊 Batch terminé:')
    console.log(`  ✅ Succès: ${succeeded}`)
    console.log(`  ❌ Échecs: ${failed}`)
    console.log(`  📋 Restants: ${remaining}`)

    return NextResponse.json({
      message: `Batch terminé: ${succeeded}/${pagesResult.rows.length} réussies`,
      processed: pagesResult.rows.length,
      succeeded,
      failed,
      remaining,
      totalToIndex,
      errors: errors.slice(0, 5), // Max 5 erreurs dans la réponse
    })
  } catch (error) {
    console.error('❌ Erreur fatale:', error)
    return NextResponse.json(
      {
        error: getErrorMessage(error),
        stack: error instanceof Error ? error.stack : undefined,
      },
      { status: 500 }
    )
  }
})
