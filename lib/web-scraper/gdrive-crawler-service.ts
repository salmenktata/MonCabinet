/**
 * Service de crawl Google Drive
 *
 * Responsabilités:
 * - Lister les fichiers d'un dossier Google Drive (récursif optionnel)
 * - Détecter les changements via modifiedTime (mode incrémental)
 * - Créer des web_pages avec linked_files pour chaque fichier
 * - Intégration avec le pipeline d'indexation existant
 */

import type { WebSource, CrawlResult, CrawlError, GoogleDriveFile, LinkedFile } from './types'
import { getErrorMessage } from '@/lib/utils/error-utils'
import { getGoogleDriveClient, downloadGoogleDriveFileForIndexing } from './storage-adapter'
import {
  extractFolderIdFromBaseUrl,
  isAllowedFileType,
  mapGoogleDriveFileToLinkedFile,
} from './gdrive-utils'
import { createHash } from 'crypto'
import { db } from '@/lib/db/postgres'
import { parseFile } from './file-parser-service'

const MAX_FILE_SIZE = 50 * 1024 * 1024 // 50MB
const DEFAULT_PAGE_SIZE = 1000 // Max Google Drive API
const GDRIVE_CRAWL_CONCURRENCY = Math.max(1, parseInt(process.env.GDRIVE_CRAWL_CONCURRENCY || '5', 10))

/**
 * Info pré-chargée d'une page existante (batch SELECT)
 */
interface ExistingPageInfo {
  id: string
  content_hash: string
  has_extracted_text: boolean
}

/**
 * Options de crawl Google Drive
 */
interface CrawlOptions {
  incrementalMode?: boolean
}

/**
 * Crawler un dossier Google Drive
 */
export async function crawlGoogleDriveFolder(
  source: WebSource,
  options: CrawlOptions = { incrementalMode: false }
): Promise<CrawlResult> {
  console.log(
    `[GDriveCrawler] Source: ${source.name} (${source.baseUrl}) - Mode: ${
      options.incrementalMode ? 'incremental' : 'full'
    }`
  )

  const result: CrawlResult = {
    success: true,
    pagesProcessed: 0,
    pagesNew: 0,
    pagesChanged: 0,
    pagesFailed: 0,
    pagesSkipped: 0,
    filesDownloaded: 0,
    errors: [],
  }

  try {
    // Extraire folderId
    const folderId = extractFolderIdFromBaseUrl(source.baseUrl)
    if (!folderId) {
      throw new Error(`Invalid Google Drive baseUrl: ${source.baseUrl}`)
    }

    // Configuration
    const driveConfig = source.driveConfig
    if (!driveConfig) {
      throw new Error('Missing driveConfig for Google Drive source')
    }

    const { recursive, fileTypes } = driveConfig

    // Date de référence pour mode incrémental
    const modifiedSince = options.incrementalMode ? source.lastCrawlAt : undefined

    // Lister les fichiers
    console.log(
      `[GDriveCrawler] Listing files (recursive: ${recursive}, modifiedSince: ${modifiedSince?.toISOString() || 'none'})`
    )

    const files = await listDriveFiles(folderId, {
      recursive,
      modifiedSince,
      fileTypes,
      maxPages: source.maxPages,
    })

    console.log(`[GDriveCrawler] Discovered ${files.length} files`)

    // Pré-charger les pages existantes (1 SELECT batch au lieu de N)
    const existingPages = await loadExistingPages(source.id)
    console.log(`[GDriveCrawler] Pre-loaded ${existingPages.size} existing page hashes`)

    // Traiter les fichiers en lots parallèles
    const concurrency = GDRIVE_CRAWL_CONCURRENCY
    const totalBatches = Math.ceil(files.length / concurrency)
    console.log(`[GDriveCrawler] Processing ${files.length} files (concurrency: ${concurrency}, batches: ${totalBatches})`)

    for (let i = 0; i < files.length; i += concurrency) {
      const batch = files.slice(i, i + concurrency)
      const batchNum = Math.floor(i / concurrency) + 1

      const batchResults = await Promise.allSettled(
        batch.map(file => processGDriveFile(source, file, existingPages))
      )

      // Agréger les résultats
      for (let j = 0; j < batchResults.length; j++) {
        const settled = batchResults[j]
        if (settled.status === 'fulfilled') {
          const r = settled.value
          if (!r.skipped) {
            result.pagesProcessed++
            if (r.isNew) result.pagesNew++
            if (r.hasChanged) result.pagesChanged++
          }
        } else {
          const failedFile = batch[j]
          console.error(`[GDriveCrawler] Error processing file ${failedFile.name}:`, settled.reason)
          result.pagesFailed++
          result.errors.push({
            url: failedFile.webViewLink,
            error: settled.reason?.message || 'Unknown error',
            timestamp: new Date().toISOString(),
          })
        }
      }

      // Rate limiting entre les lots (pas entre chaque fichier)
      if (source.rateLimitMs > 0 && i + concurrency < files.length) {
        await sleep(source.rateLimitMs)
      }

      // Log de progression tous les 5 lots ou au dernier
      if (batchNum % 5 === 0 || batchNum === totalBatches) {
        console.log(`[GDriveCrawler] Progress: batch ${batchNum}/${totalBatches} (${Math.min(i + concurrency, files.length)}/${files.length} files)`)
      }
    }

    console.log(
      `[GDriveCrawler] Completed: ${result.pagesProcessed} processed, ${result.pagesNew} new, ${result.pagesChanged} changed, ${result.pagesFailed} failed`
    )
  } catch (error) {
    console.error('[GDriveCrawler] Fatal error:', error)
    result.success = false
    result.errors.push({
      url: source.baseUrl,
      error: getErrorMessage(error),
      timestamp: new Date().toISOString(),
    })
  }

  // Mettre à jour lastCrawlAt si crawl réussi (Phase 3.3 - Incrémental)
  if (result.success && options.incrementalMode) {
    try {
      await db.query(
        `UPDATE web_sources
         SET last_crawl_at = NOW(), updated_at = NOW()
         WHERE id = $1`,
        [source.id]
      )
      console.log(`[GDriveCrawler] ✅ Updated lastCrawlAt for source ${source.id}`)
    } catch (updateError: any) {
      console.warn(`[GDriveCrawler] Failed to update lastCrawlAt:`, updateError.message)
      // Non-fatal, on continue
    }
  }

  return result
}

/**
 * Pré-charger toutes les pages existantes d'une source (1 query batch)
 */
async function loadExistingPages(sourceId: string): Promise<Map<string, ExistingPageInfo>> {
  const result = await db.query(
    `SELECT id, url_hash, content_hash,
            (extracted_text IS NOT NULL AND extracted_text != '') as has_extracted_text
     FROM web_pages
     WHERE web_source_id = $1`,
    [sourceId]
  )
  const map = new Map<string, ExistingPageInfo>()
  for (const row of result.rows) {
    map.set(row.url_hash, {
      id: row.id,
      content_hash: row.content_hash,
      has_extracted_text: row.has_extracted_text,
    })
  }
  return map
}

/**
 * Traiter un fichier Google Drive (download, parse, upsert)
 */
async function processGDriveFile(
  source: WebSource,
  file: GoogleDriveFile,
  existingPages: Map<string, ExistingPageInfo>
): Promise<{ isNew: boolean; hasChanged: boolean; skipped: boolean }> {
  // Filtrer par taille
  const fileSize = parseInt(file.size, 10)
  if (fileSize > MAX_FILE_SIZE) {
    console.warn(`[GDriveCrawler] File too large: ${file.name} (${fileSize} bytes)`)
    return { isNew: false, hasChanged: false, skipped: true }
  }

  // Créer LinkedFile
  const linkedFile = mapGoogleDriveFileToLinkedFile(file)

  // Vérifier si le fichier est inchangé ET a déjà du texte extrait → skip download
  const url = file.webViewLink
  const urlHash = createHash('sha256').update(url).digest('hex')
  const contentHash = createHash('sha256')
    .update(file.id + file.modifiedTime + file.size)
    .digest('hex')
  const existing = existingPages.get(urlHash)
  if (existing && existing.content_hash === contentHash && existing.has_extracted_text) {
    return { isNew: false, hasChanged: false, skipped: true }
  }

  // Télécharger et extraire le texte si downloadFiles est activé
  let extractedText: string | null = null
  if (source.downloadFiles) {
    try {
      console.log(`[GDriveCrawler] Downloading and parsing: ${file.name} (${file.mimeType})`)

      // Utiliser downloadGoogleDriveFileForIndexing qui gère l'export des Google Docs natifs
      const downloadResult = await downloadGoogleDriveFileForIndexing(file.id, file.mimeType)
      if (downloadResult.success && downloadResult.buffer) {
        linkedFile.downloaded = true

        // Utiliser le mimeType exporté si disponible (ex: Google Doc → DOCX)
        const finalMimeType = downloadResult.mimeType || file.mimeType
        const fileExtension = finalMimeType.includes('wordprocessingml') ? 'docx'
          : finalMimeType.includes('spreadsheetml') ? 'xlsx'
          : finalMimeType.includes('presentationml') ? 'pptx'
          : file.name.split('.').pop()?.toLowerCase() || 'pdf'

        console.log(`[GDriveCrawler] Parsing as ${fileExtension} (from ${finalMimeType})`)
        const parseResult = await parseFile(downloadResult.buffer, fileExtension)

        if (parseResult.success && parseResult.text) {
          extractedText = parseResult.text.trim()
          const wordCount = extractedText.split(/\s+/).length
          console.log(`[GDriveCrawler] ✅ Extracted ${wordCount} words from ${file.name}`)
        } else {
          console.warn(`[GDriveCrawler] ❌ Failed to parse ${file.name}: ${parseResult.error}`)
        }
      } else {
        console.warn(`[GDriveCrawler] ❌ Failed to download ${file.name}: ${downloadResult.error}`)
      }
    } catch (downloadError: any) {
      console.error(`[GDriveCrawler] ❌ Error downloading/parsing ${file.name}:`, downloadError.message)
    }
  }

  // Créer ou mettre à jour web_page avec le texte extrait
  const pageResult = await upsertWebPage(source, file, linkedFile, extractedText, existingPages)
  return { isNew: pageResult.isNew, hasChanged: pageResult.hasChanged, skipped: false }
}

/**
 * Lister les fichiers d'un dossier Google Drive
 */
async function listDriveFiles(
  folderId: string,
  options: {
    recursive?: boolean
    modifiedSince?: Date | null
    fileTypes?: ('pdf' | 'docx' | 'doc' | 'xlsx' | 'pptx')[]
    maxPages?: number
  }
): Promise<GoogleDriveFile[]> {
  const drive = await getGoogleDriveClient()
  const files: GoogleDriveFile[] = []
  const foldersToVisit: string[] = [folderId]
  const visitedFolders = new Set<string>()

  let totalFilesLimit = options.maxPages || 1000

  while (foldersToVisit.length > 0 && files.length < totalFilesLimit) {
    const currentFolder = foldersToVisit.pop()!

    // Éviter boucles infinies
    if (visitedFolders.has(currentFolder)) {
      continue
    }
    visitedFolders.add(currentFolder)

    // Construire query
    let query = `'${currentFolder}' in parents and trashed = false`

    // Filtre par date de modification (mode incrémental)
    if (options.modifiedSince) {
      const isoDate = options.modifiedSince.toISOString()
      query += ` and modifiedTime > '${isoDate}'`
    }

    // Pagination Google Drive API
    let pageToken: string | undefined | null = undefined

    do {
      // Timeout de 2 minutes pour éviter blocage indéfini
      const listPromise = drive.files.list({
        q: query,
        fields: 'nextPageToken, files(id, name, mimeType, size, modifiedTime, webViewLink, webContentLink)',
        pageSize: DEFAULT_PAGE_SIZE,
        pageToken: pageToken || undefined,
      })

      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Google Drive API timeout (2min)')), 120000)
      )

      const response: any = await Promise.race([listPromise, timeoutPromise])

      const items = response.data.files || []

      for (const item of items) {
        // Si c'est un dossier et mode récursif
        if (item.mimeType === 'application/vnd.google-apps.folder') {
          if (options.recursive) {
            foldersToVisit.push(item.id!)
          }
          continue
        }

        // Si c'est un fichier
        const driveFile: GoogleDriveFile = {
          id: item.id!,
          name: item.name!,
          mimeType: item.mimeType!,
          size: item.size || '0',
          modifiedTime: item.modifiedTime!,
          webViewLink: item.webViewLink!,
          webContentLink: item.webContentLink,
        }

        // Filtrer par type de fichier
        if (options.fileTypes && !isAllowedFileType(driveFile, options.fileTypes)) {
          continue
        }

        files.push(driveFile)

        // Limiter le nombre de fichiers
        if (files.length >= totalFilesLimit) {
          break
        }
      }

      pageToken = response.data.nextPageToken

      // Limiter le nombre de fichiers
      if (files.length >= totalFilesLimit) {
        break
      }
    } while (pageToken)
  }

  if (files.length >= totalFilesLimit) {
    console.warn(`[GDriveCrawler] ⚠️ Limite atteinte: ${files.length}/${totalFilesLimit} fichiers. Des fichiers peuvent manquer. Augmentez max_pages sur la source.`)
  }

  return files
}

/**
 * Créer ou mettre à jour une web_page pour un fichier Google Drive
 */
async function upsertWebPage(
  source: WebSource,
  file: GoogleDriveFile,
  linkedFile: LinkedFile,
  extractedText: string | null = null,
  existingPages?: Map<string, ExistingPageInfo>
): Promise<{ isNew: boolean; hasChanged: boolean; pageId: string }> {
  const url = file.webViewLink
  const urlHash = createHash('sha256').update(url).digest('hex')
  const contentHash = createHash('sha256')
    .update(file.id + file.modifiedTime + file.size)
    .digest('hex')

  // Utiliser le cache pré-chargé si disponible, sinon fallback SELECT
  const existingInfo = existingPages?.get(urlHash)

  if (existingInfo) {
    // Vérifier si le contenu a changé
    if (existingInfo.content_hash === contentHash) {
      // Hash identique MAIS forcer update extracted_text si disponible et manquant
      if (extractedText && !existingInfo.has_extracted_text) {
        console.log(`[GDriveCrawler] Force update extracted_text: ${file.name}`)
        await db.query(
          `UPDATE web_pages
           SET extracted_text = $1,
               status = 'crawled',
               last_changed_at = NOW()
           WHERE id = $2`,
          [extractedText, existingInfo.id]
        )
        // Mettre à jour le cache
        existingInfo.has_extracted_text = true
        return { isNew: false, hasChanged: true, pageId: existingInfo.id }
      }

      // Pas de changement
      return { isNew: false, hasChanged: false, pageId: existingInfo.id }
    }

    // Contenu a changé → mettre à jour
    await db.query(
      `UPDATE web_pages
       SET
         title = $1,
         content_hash = $2,
         linked_files = $3,
         extracted_text = $5,
         status = 'crawled',
         last_crawled_at = NOW(),
         last_changed_at = NOW(),
         updated_at = NOW()
       WHERE id = $4`,
      [file.name, contentHash, JSON.stringify([linkedFile]), existingInfo.id, extractedText]
    )

    // Créer une version
    await db.query(
      `INSERT INTO web_page_versions (
         web_page_id,
         version,
         title,
         content_hash,
         word_count,
         change_type,
         diff_summary
       )
       SELECT
         id,
         COALESCE((
           SELECT MAX(version) + 1
           FROM web_page_versions
           WHERE web_page_id = $1
         ), 1),
         title,
         content_hash,
         word_count,
         'content_change',
         'Fichier modifié dans Google Drive'
       FROM web_pages
       WHERE id = $1`,
      [existingInfo.id]
    )

    // Mettre à jour le cache
    existingInfo.content_hash = contentHash
    existingInfo.has_extracted_text = !!extractedText

    console.log(`[GDriveCrawler] Updated page: ${file.name}`)
    return { isNew: false, hasChanged: true, pageId: existingInfo.id }
  }

  // Nouvelle page → créer
  const insertResult = await db.query(
    `INSERT INTO web_pages (
       web_source_id,
       url,
       url_hash,
       title,
       content_hash,
       linked_files,
       extracted_text,
       status,
       crawl_depth,
       first_seen_at,
       last_crawled_at
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'crawled', 0, NOW(), NOW())
     RETURNING id`,
    [
      source.id,
      url,
      urlHash,
      file.name,
      contentHash,
      JSON.stringify([linkedFile]),
      extractedText,
    ]
  )

  const pageId = insertResult.rows[0].id

  // Ajouter au cache pour les lots suivants
  existingPages?.set(urlHash, {
    id: pageId,
    content_hash: contentHash,
    has_extracted_text: !!extractedText,
  })

  console.log(`[GDriveCrawler] Created page: ${file.name}`)

  return { isNew: true, hasChanged: false, pageId }
}

/**
 * Helper: sleep
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
