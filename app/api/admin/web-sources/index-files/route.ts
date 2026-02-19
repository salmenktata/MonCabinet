import { NextRequest, NextResponse } from 'next/server'
import { withAdminApiAuth } from '@/lib/auth/with-admin-api-auth'
import { db } from '@/lib/db/postgres'
import { indexFile } from '@/lib/web-scraper/file-indexer-service'
import { downloadFile } from '@/lib/web-scraper/scraper-service'
import { uploadWebFile } from '@/lib/web-scraper/storage-adapter'
import type { LinkedFile } from '@/lib/web-scraper/types'
import { safeParseInt } from '@/lib/utils/safe-number'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

interface FileResult {
  pageId: string
  filename: string
  chunksCreated: number
  durationMs: number
  redownloaded?: boolean
  error?: string
}

/**
 * POST /api/admin/web-sources/index-files
 *
 * Indexe les fichiers (PDF, DOCX) téléchargés mais non indexés dans la KB.
 * Re-télécharge automatiquement les fichiers manquants dans MinIO.
 *
 * Query params:
 * - source=<id|name> : Filtrer par web source (ID ou nom partiel). Requis.
 * - dry-run=true     : Mode simulation
 * - limit=<n>        : Nombre max de fichiers à traiter (défaut: 50)
 * - file-index=<n>   : Index du fichier dans linked_files (défaut: 1, car 0 = menu PDF)
 *
 * Headers:
 * - X-Cron-Secret: Secret cron pour authentification
 */
export const POST = withAdminApiAuth(async (request, _ctx, _session) => {
  try {
    const params = request.nextUrl.searchParams
    const sourceFilter = params.get('source')
    const dryRun = params.get('dry-run') === 'true'
    const limit = Math.min(parseInt(params.get('limit') || '50', 10), 500)
    const fileIndex = parseInt(params.get('file-index') || '1', 10)

    if (!sourceFilter) {
      return NextResponse.json(
        { error: 'Paramètre "source" requis (ID ou nom partiel)' },
        { status: 400 }
      )
    }

    const startTime = Date.now()

    // 1. Trouver la source
    const sourceResult = await db.query<{
      id: string
      name: string
      category: string
    }>(
      `SELECT id, name, category FROM web_sources
       WHERE id::text = $1 OR name ILIKE '%' || $1 || '%' OR base_url ILIKE '%' || $1 || '%'
       LIMIT 1`,
      [sourceFilter]
    )

    if (sourceResult.rows.length === 0) {
      return NextResponse.json(
        { error: `Source non trouvée: ${sourceFilter}` },
        { status: 404 }
      )
    }

    const source = sourceResult.rows[0]

    // 2. Trouver les pages avec des fichiers non indexés
    const pagesResult = await db.query<{
      page_id: string
      page_url: string
      linked_files: LinkedFile[]
    }>(
      `SELECT wp.id as page_id, wp.url as page_url, wp.linked_files
       FROM web_pages wp
       WHERE wp.web_source_id = $1
         AND wp.linked_files IS NOT NULL
         AND jsonb_array_length(wp.linked_files) > $2
         AND NOT EXISTS (
           SELECT 1 FROM web_files wf
           WHERE wf.web_page_id = wp.id
             AND wf.url = wp.linked_files->$2->>'url'
             AND wf.is_indexed = true
         )
       ORDER BY wp.created_at
       LIMIT $3`,
      [source.id, fileIndex, limit]
    )

    const pages = pagesResult.rows

    if (pages.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'Aucun fichier non indexé trouvé',
        source: { id: source.id, name: source.name },
        summary: { filesToIndex: 0 }
      })
    }

    // 3. Dry run
    if (dryRun) {
      const files = pages.map(p => {
        const file = p.linked_files[fileIndex]
        return {
          pageId: p.page_id,
          url: p.page_url,
          filename: file?.filename || 'unknown',
          fileUrl: file?.url || 'unknown',
          downloaded: file?.downloaded || false,
          minioPath: file?.minioPath || null,
          needsRedownload: !file?.downloaded || !file?.minioPath,
        }
      })

      return NextResponse.json({
        success: true,
        dryRun: true,
        source: { id: source.id, name: source.name, category: source.category },
        summary: {
          filesToIndex: pages.length,
          needsRedownload: files.filter(f => f.needsRedownload).length,
          alreadyDownloaded: files.filter(f => !f.needsRedownload).length,
        },
        files,
      })
    }

    // 4. Télécharger + indexer chaque fichier
    console.log(`[IndexFiles] Démarrage : ${pages.length} fichiers pour "${source.name}"`)

    const results: FileResult[] = []
    let totalChunks = 0
    let successCount = 0
    let errorCount = 0
    let redownloadCount = 0

    for (const page of pages) {
      const file = page.linked_files[fileIndex]
      if (!file || !file.url) {
        results.push({
          pageId: page.page_id,
          filename: 'unknown',
          chunksCreated: 0,
          durationMs: 0,
          error: 'Pas de fichier à cet index',
        })
        errorCount++
        continue
      }

      const fileStart = Date.now()

      try {
        // Re-télécharger si le fichier n'est pas dans MinIO
        if (!file.downloaded || !file.minioPath) {
          console.log(`[IndexFiles] 📥 Téléchargement ${file.filename} depuis ${file.url}`)

          const dlResult = await downloadFile(file.url, { timeout: 60000 })
          if (!dlResult.success || !dlResult.buffer) {
            errorCount++
            results.push({
              pageId: page.page_id,
              filename: file.filename,
              chunksCreated: 0,
              durationMs: Date.now() - fileStart,
              error: `Téléchargement échoué: ${dlResult.error || 'unknown'}`,
            })
            continue
          }

          // Upload vers MinIO
          const uploadResult = await uploadWebFile(
            dlResult.buffer,
            file.filename,
            dlResult.contentType || 'application/pdf',
            { sourceId: source.id }
          )

          if (!uploadResult.success || !uploadResult.path) {
            errorCount++
            results.push({
              pageId: page.page_id,
              filename: file.filename,
              chunksCreated: 0,
              durationMs: Date.now() - fileStart,
              error: `Upload MinIO échoué: ${uploadResult.error || 'unknown'}`,
            })
            continue
          }

          // Mettre à jour linked_files dans la DB
          file.downloaded = true
          file.minioPath = uploadResult.path
          file.size = dlResult.size

          await db.query(
            `UPDATE web_pages SET
              linked_files = jsonb_set(
                jsonb_set(
                  jsonb_set(linked_files, $2, $3::jsonb),
                  $4, $5::jsonb
                ),
                $6, $7::jsonb
              ),
              updated_at = NOW()
            WHERE id = $1`,
            [
              page.page_id,
              `{${fileIndex},downloaded}`, 'true',
              `{${fileIndex},minioPath}`, JSON.stringify(uploadResult.path),
              `{${fileIndex},size}`, JSON.stringify(dlResult.size || 0),
            ]
          )

          redownloadCount++
          console.log(`[IndexFiles] ✅ Téléchargé ${file.filename} (${dlResult.size} bytes) → ${uploadResult.path}`)
        }

        // Indexer le fichier
        const result = await indexFile(
          file,
          page.page_id,
          source.id,
          source.name,
          source.category
        )

        const durationMs = Date.now() - fileStart

        if (result.success) {
          totalChunks += result.chunksCreated
          successCount++
          results.push({
            pageId: page.page_id,
            filename: file.filename,
            chunksCreated: result.chunksCreated,
            durationMs,
            redownloaded: !page.linked_files[fileIndex].downloaded,
          })
          console.log(`[IndexFiles] ✅ ${file.filename} : ${result.chunksCreated} chunks (${durationMs}ms)`)
        } else {
          errorCount++
          results.push({
            pageId: page.page_id,
            filename: file.filename,
            chunksCreated: 0,
            durationMs,
            error: result.error,
          })
          console.warn(`[IndexFiles] ⚠️ ${file.filename} : ${result.error}`)
        }
      } catch (error) {
        const durationMs = Date.now() - fileStart
        errorCount++
        const errorMsg = error instanceof Error ? error.message : String(error)
        results.push({
          pageId: page.page_id,
          filename: file.filename,
          chunksCreated: 0,
          durationMs,
          error: errorMsg,
        })
        console.error(`[IndexFiles] ❌ ${file.filename} : ${errorMsg}`)
      }
    }

    const totalDurationMs = Date.now() - startTime

    console.log(`[IndexFiles] Terminé : ${successCount}/${pages.length} fichiers, ${redownloadCount} re-téléchargés, ${totalChunks} chunks, ${totalDurationMs}ms`)

    return NextResponse.json({
      success: errorCount === 0,
      source: { id: source.id, name: source.name, category: source.category },
      summary: {
        filesIndexed: successCount,
        filesFailed: errorCount,
        filesRedownloaded: redownloadCount,
        totalChunksCreated: totalChunks,
        totalDurationMs,
      },
      results,
    })

  } catch (error) {
    console.error('[IndexFiles] Erreur fatale:', error)
    return NextResponse.json(
      { error: 'Erreur interne', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    )
  }
}, { allowCronSecret: true })
