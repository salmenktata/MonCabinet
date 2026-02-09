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
import { getGoogleDriveClient, downloadFromGoogleDrive } from './storage-adapter'
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

    // Traiter chaque fichier
    for (const file of files) {
      try {
        // Filtrer par taille
        const fileSize = parseInt(file.size, 10)
        if (fileSize > MAX_FILE_SIZE) {
          console.warn(`[GDriveCrawler] File too large: ${file.name} (${fileSize} bytes)`)
          continue
        }

        // Créer LinkedFile
        const linkedFile = mapGoogleDriveFileToLinkedFile(file)

        // Télécharger et extraire le texte si downloadFiles est activé
        let extractedText: string | null = null
        if (source.downloadFiles) {
          try {
            console.log(`[GDriveCrawler] Downloading and parsing: ${file.name}`)

            // Télécharger le fichier depuis Google Drive
            const downloadResult = await downloadFromGoogleDrive(file.id)
            if (downloadResult.success && downloadResult.buffer) {
              // Marquer le fichier comme téléchargé
              linkedFile.downloaded = true

              // Parser le fichier pour extraire le texte
              // Extraire l'extension du nom de fichier
              const fileExtension = file.name.split('.').pop()?.toLowerCase() || 'pdf'

              const parseResult = await parseFile(
                downloadResult.buffer,
                fileExtension
              )

              if (parseResult.success && parseResult.text) {
                extractedText = parseResult.text.trim()
                const wordCount = extractedText.split(/\s+/).length
                console.log(`[GDriveCrawler] Extracted ${wordCount} words from ${file.name}`)
              } else {
                console.warn(`[GDriveCrawler] Failed to parse ${file.name}: ${parseResult.error}`)
              }
            } else {
              console.warn(`[GDriveCrawler] Failed to download ${file.name}: ${downloadResult.error}`)
            }
          } catch (downloadError: any) {
            console.error(`[GDriveCrawler] Error downloading/parsing ${file.name}:`, downloadError.message)
            // Continue même si le téléchargement/parsing échoue
          }
        }

        // Créer ou mettre à jour web_page avec le texte extrait
        const pageResult = await upsertWebPage(source, file, linkedFile, extractedText)

        if (pageResult.isNew) {
          result.pagesNew++
        } else if (pageResult.hasChanged) {
          result.pagesChanged++
        }

        result.pagesProcessed++

        // Rate limiting
        if (source.rateLimitMs > 0) {
          await sleep(source.rateLimitMs)
        }
      } catch (error: any) {
        console.error(`[GDriveCrawler] Error processing file ${file.name}:`, error)
        result.pagesFailed++
        result.errors.push({
          url: file.webViewLink,
          error: error.message,
          timestamp: new Date().toISOString(),
        })
      }
    }

    console.log(
      `[GDriveCrawler] Completed: ${result.pagesProcessed} processed, ${result.pagesNew} new, ${result.pagesChanged} changed, ${result.pagesFailed} failed`
    )
  } catch (error: any) {
    console.error('[GDriveCrawler] Fatal error:', error)
    result.success = false
    result.errors.push({
      url: source.baseUrl,
      error: error.message,
      timestamp: new Date().toISOString(),
    })
  }

  return result
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
      const response: any = await drive.files.list({
        q: query,
        fields: 'nextPageToken, files(id, name, mimeType, size, modifiedTime, webViewLink, webContentLink)',
        pageSize: DEFAULT_PAGE_SIZE,
        pageToken: pageToken || undefined,
      })

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

  return files
}

/**
 * Créer ou mettre à jour une web_page pour un fichier Google Drive
 */
async function upsertWebPage(
  source: WebSource,
  file: GoogleDriveFile,
  linkedFile: LinkedFile,
  extractedText: string | null = null
): Promise<{ isNew: boolean; hasChanged: boolean; pageId: string }> {
  const url = file.webViewLink
  const urlHash = createHash('sha256').update(url).digest('hex')
  const contentHash = createHash('sha256')
    .update(file.id + file.modifiedTime + file.size)
    .digest('hex')

  // Vérifier si la page existe déjà
  const existingPage = await db.query(
    `SELECT id, content_hash, status
     FROM web_pages
     WHERE url_hash = $1
       AND web_source_id = $2`,
    [urlHash, source.id]
  )

  if (existingPage.rows.length > 0) {
    const page = existingPage.rows[0]

    // Vérifier si le contenu a changé
    if (page.content_hash === contentHash) {
      // Hash identique MAIS forcer update extracted_text si disponible et manquant
      if (extractedText && !page.extracted_text) {
        console.log(`[GDriveCrawler] Force update extracted_text: ${file.name}`)
        await db.query(
          `UPDATE web_pages
           SET extracted_text = $1,
               status = 'crawled',
               last_changed_at = NOW()
           WHERE id = $2`,
          [extractedText, page.id]
        )
        return { isNew: false, hasChanged: true, pageId: page.id }
      }

      // Pas de changement
      return { isNew: false, hasChanged: false, pageId: page.id }
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
      [file.name, contentHash, JSON.stringify([linkedFile]), page.id, extractedText]
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
      [page.id]
    )

    console.log(`[GDriveCrawler] Updated page: ${file.name}`)
    return { isNew: false, hasChanged: true, pageId: page.id }
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
  console.log(`[GDriveCrawler] Created page: ${file.name}`)

  return { isNew: true, hasChanged: false, pageId }
}

/**
 * Helper: sleep
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
