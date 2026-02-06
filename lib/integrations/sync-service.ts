/**
 * Service de Synchronisation Bidirectionnelle Google Drive → Base de Données
 * Détecte les fichiers ajoutés manuellement dans Google Drive et les synchronise avec la BDD
 */

import { query } from '@/lib/db/postgres'
import { createGoogleDriveProvider, ListFilesResult } from './cloud-storage'

interface SyncResult {
  success: boolean
  filesScanned: number
  filesAdded: number
  filesUpdated: number
  filesDeleted: number
  filesNeedsClassification: number
  errors: string[]
  syncLogId?: string
}

interface FileInDrive {
  id: string
  name: string
  mimeType: string
  size: number
  webViewLink: string
  createdTime: Date
  modifiedTime: Date
  parents: string[]
  path: string // Chemin complet reconstruit
}

interface PathAnalysis {
  isInClientFolder: boolean
  isInDossierFolder: boolean
  isInUnclassifiedFolder: boolean
  clientFolderName?: string
  dossierFolderName?: string
  clientId?: string
  dossierId?: string
}

/**
 * Synchroniser Google Drive vers base de données pour un utilisateur
 */
export async function syncGoogleDriveToDatabase(
  userId: string
): Promise<SyncResult> {
  const result: SyncResult = {
    success: false,
    filesScanned: 0,
    filesAdded: 0,
    filesUpdated: 0,
    filesDeleted: 0,
    filesNeedsClassification: 0,
    errors: [],
  }

  try {
    console.log(`[SyncService] Début synchronisation pour user ${userId}`)

    // 1. Créer log de synchronisation
    const syncLogResult = await query(
      `INSERT INTO sync_logs (user_id, provider, sync_type, sync_status, started_at)
       VALUES ($1, $2, $3, $4, NOW())
       RETURNING id`,
      [userId, 'google_drive', 'webhook', 'started']
    )

    if (syncLogResult.rows.length === 0) {
      console.error('[SyncService] Erreur création sync log')
      result.errors.push('Erreur création log synchronisation')
      return result
    }

    const syncLog = syncLogResult.rows[0]
    result.syncLogId = syncLog.id
    const startTime = Date.now()

    // 2. Récupérer configuration cloud utilisateur
    const configResult = await query(
      `SELECT * FROM cloud_providers_config
       WHERE user_id = $1 AND provider = 'google_drive' AND enabled = true`,
      [userId]
    )

    const cloudConfig = configResult.rows[0]

    if (!cloudConfig) {
      const errorMsg = 'Configuration Google Drive non trouvée'
      console.error(`[SyncService] ${errorMsg}`)
      result.errors.push(errorMsg)
      await updateSyncLogFailed(syncLog.id, result, startTime)
      return result
    }

    if (!cloudConfig.root_folder_id) {
      const errorMsg = 'Dossier racine Google Drive non configuré'
      console.error(`[SyncService] ${errorMsg}`)
      result.errors.push(errorMsg)
      await updateSyncLogFailed(syncLog.id, result, startTime)
      return result
    }

    // 3. Créer provider Google Drive
    const provider = createGoogleDriveProvider(cloudConfig.access_token)

    // 4. Récupérer tous les fichiers du dossier racine récursivement
    console.log(
      `[SyncService] Parcours récursif dossier racine: ${cloudConfig.root_folder_id}`
    )
    const filesInDrive = await listFilesRecursively(
      provider,
      cloudConfig.root_folder_id,
      ''
    )

    console.log(
      `[SyncService] ${filesInDrive.length} fichiers trouvés dans Google Drive`
    )
    result.filesScanned = filesInDrive.length

    // 5. Récupérer tous les documents existants en BDD pour cet utilisateur
    const existingDocsResult = await query(
      `SELECT id, external_file_id, external_metadata
       FROM documents
       WHERE user_id = $1 AND storage_provider = 'google_drive'`,
      [userId]
    )

    const existingDocuments = existingDocsResult.rows
    const existingFileIds = new Set(
      existingDocuments?.map((d) => d.external_file_id) || []
    )

    // 6. Récupérer clients et dossiers pour matching
    const clientsResult = await query(
      `SELECT id, nom, prenom, denomination, cin, type_client, google_drive_folder_id
       FROM clients
       WHERE user_id = $1`,
      [userId]
    )

    const dossiersResult = await query(
      `SELECT id, numero, client_id, google_drive_folder_id
       FROM dossiers
       WHERE user_id = $1`,
      [userId]
    )

    const clients = clientsResult.rows
    const dossiers = dossiersResult.rows

    // Créer maps pour recherche rapide
    const clientsByFolderId = new Map<string, any>(
      clients
        ?.filter((c) => c.google_drive_folder_id)
        .map((c) => [c.google_drive_folder_id!, c]) || []
    )
    const dossiersByFolderId = new Map<string, any>(
      dossiers
        ?.filter((d) => d.google_drive_folder_id)
        .map((d) => [d.google_drive_folder_id!, d]) || []
    )

    // 7. Traiter chaque fichier
    for (const file of filesInDrive) {
      try {
        // Ignorer les dossiers (type application/vnd.google-apps.folder)
        if (file.mimeType === 'application/vnd.google-apps.folder') {
          continue
        }

        // Vérifier si fichier existe déjà en BDD
        if (existingFileIds.has(file.id)) {
          // Fichier déjà connu, vérifier si modifié
          const existingDoc = existingDocuments?.find(
            (d) => d.external_file_id === file.id
          )

          if (existingDoc) {
            const existingModifiedTime = existingDoc.external_metadata?.modifiedTime
            const newModifiedTime = file.modifiedTime.toISOString()

            if (existingModifiedTime !== newModifiedTime) {
              // Fichier modifié, mettre à jour métadonnées
              await query(
                `UPDATE documents
                 SET external_metadata = $1, updated_at = NOW()
                 WHERE id = $2`,
                [
                  JSON.stringify({
                    ...existingDoc.external_metadata,
                    modifiedTime: newModifiedTime,
                    webViewLink: file.webViewLink,
                  }),
                  existingDoc.id,
                ]
              )

              result.filesUpdated++
              console.log(`[SyncService] Fichier mis à jour: ${file.name}`)
            }
          }
          continue
        }

        // Nouveau fichier détecté
        console.log(`[SyncService] Nouveau fichier: ${file.name} (${file.path})`)

        // Analyser chemin pour identifier client/dossier
        const pathAnalysis = analyzeFilePath(
          file,
          clientsByFolderId,
          dossiersByFolderId
        )

        // Déterminer si document a besoin de classification
        const needsClassification =
          pathAnalysis.isInUnclassifiedFolder || !pathAnalysis.dossierId

        // Créer entrée document en BDD
        const clientFolderId = pathAnalysis.clientId
          ? clientsByFolderId.get(pathAnalysis.clientId)?.google_drive_folder_id || null
          : null
        const dossierFolderId = pathAnalysis.dossierId
          ? dossiersByFolderId.get(pathAnalysis.dossierId)?.google_drive_folder_id || null
          : null

        try {
          await query(
            `INSERT INTO documents (
              user_id, dossier_id, nom_fichier, type_fichier, taille_fichier,
              storage_provider, external_file_id, external_folder_client_id,
              external_folder_dossier_id, external_sharing_link, external_metadata,
              source_type, source_metadata, needs_classification, created_at, updated_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW(), NOW())`,
            [
              userId,
              pathAnalysis.dossierId || null,
              file.name,
              file.mimeType,
              file.size,
              'google_drive',
              file.id,
              clientFolderId,
              dossierFolderId,
              file.webViewLink,
              JSON.stringify({
                createdTime: file.createdTime.toISOString(),
                modifiedTime: file.modifiedTime.toISOString(),
                webViewLink: file.webViewLink,
                parents: file.parents,
                path: file.path,
              }),
              'google_drive_sync',
              JSON.stringify({
                sync_detected_at: new Date().toISOString(),
                path_analysis: pathAnalysis,
              }),
              needsClassification,
            ]
          )
          result.filesAdded++
          if (needsClassification) {
            result.filesNeedsClassification++
          }
          console.log(
            `[SyncService] Document créé: ${file.name} (needs_classification=${needsClassification})`
          )
        } catch (insertError: any) {
          console.error(
            `[SyncService] Erreur insertion document ${file.name}:`,
            insertError
          )
          result.errors.push(`Erreur insertion ${file.name}: ${insertError.message}`)
        }
      } catch (error: any) {
        console.error(`[SyncService] Erreur traitement fichier ${file.name}:`, error)
        result.errors.push(`Erreur ${file.name}: ${error.message}`)
      }
    }

    // 8. Mettre à jour log de synchronisation (succès)
    const duration = Date.now() - startTime
    await query(
      `UPDATE sync_logs
       SET sync_status = $1, completed_at = NOW(), duration_ms = $2,
           files_scanned = $3, files_added = $4, files_updated = $5,
           files_deleted = $6, files_needs_classification = $7, error_message = $8
       WHERE id = $9`,
      [
        result.errors.length > 0 ? 'partial' : 'success',
        duration,
        result.filesScanned,
        result.filesAdded,
        result.filesUpdated,
        result.filesDeleted,
        result.filesNeedsClassification,
        result.errors.length > 0 ? result.errors.join('; ') : null,
        syncLog.id,
      ]
    )

    // Mettre à jour last_sync_at dans config
    await query(
      `UPDATE cloud_providers_config
       SET last_sync_at = NOW()
       WHERE id = $1`,
      [cloudConfig.id]
    )

    result.success = true
    console.log(`[SyncService] Synchronisation terminée:`, {
      filesScanned: result.filesScanned,
      filesAdded: result.filesAdded,
      filesUpdated: result.filesUpdated,
      filesNeedsClassification: result.filesNeedsClassification,
      duration: `${duration}ms`,
    })

    return result
  } catch (error: any) {
    console.error('[SyncService] Erreur synchronisation:', error)
    result.errors.push(error.message || 'Erreur inconnue')

    if (result.syncLogId) {
      await updateSyncLogFailed(
        result.syncLogId,
        result,
        Date.now()
      )
    }

    return result
  }
}

/**
 * Parcourir récursivement tous les fichiers d'un dossier Google Drive
 */
async function listFilesRecursively(
  provider: any,
  folderId: string,
  currentPath: string
): Promise<FileInDrive[]> {
  const allFiles: FileInDrive[] = []

  try {
    let pageToken: string | undefined = undefined

    do {
      // Lister fichiers du dossier
      const result: ListFilesResult = await provider.listFiles({
        folderId,
        pageSize: 100,
        pageToken,
      })

      for (const file of result.files) {
        const filePath = currentPath ? `${currentPath}/${file.name}` : file.name

        // Si c'est un dossier, parcourir récursivement
        if (file.mimeType === 'application/vnd.google-apps.folder') {
          allFiles.push({
            id: file.id,
            name: file.name,
            mimeType: file.mimeType,
            size: file.size,
            webViewLink: file.webViewLink,
            createdTime: file.createdTime,
            modifiedTime: file.modifiedTime,
            parents: file.parents || [folderId],
            path: filePath,
          })

          // Parcourir sous-dossier
          const subFiles = await listFilesRecursively(provider, file.id, filePath)
          allFiles.push(...subFiles)
        } else {
          // Fichier normal
          allFiles.push({
            id: file.id,
            name: file.name,
            mimeType: file.mimeType,
            size: file.size,
            webViewLink: file.webViewLink,
            createdTime: file.createdTime,
            modifiedTime: file.modifiedTime,
            parents: file.parents || [folderId],
            path: filePath,
          })
        }
      }

      pageToken = result.nextPageToken
    } while (pageToken)

    return allFiles
  } catch (error: any) {
    console.error(`[SyncService] Erreur listFiles récursif:`, error)
    throw error
  }
}

/**
 * Analyser le chemin d'un fichier pour identifier client/dossier
 */
function analyzeFilePath(
  file: FileInDrive,
  clientsByFolderId: Map<string, any>,
  dossiersByFolderId: Map<string, any>
): PathAnalysis {
  const analysis: PathAnalysis = {
    isInClientFolder: false,
    isInDossierFolder: false,
    isInUnclassifiedFolder: false,
  }

  // Vérifier si dans "Documents non classés/"
  if (file.path.includes('Documents non classés')) {
    analysis.isInUnclassifiedFolder = true
    return analysis
  }

  // Essayer de matcher avec les parents du fichier
  for (const parentId of file.parents) {
    // Vérifier si parent est un dossier juridique
    const dossier = dossiersByFolderId.get(parentId)
    if (dossier) {
      analysis.isInDossierFolder = true
      analysis.dossierId = dossier.id
      analysis.dossierFolderName = file.path.split('/').slice(-2, -1)[0] || ''

      // Récupérer client associé au dossier
      const client = Array.from(clientsByFolderId.values()).find(
        (c) => c.id === dossier.client_id
      )
      if (client) {
        analysis.isInClientFolder = true
        analysis.clientId = client.id
        analysis.clientFolderName = file.path.split('/').slice(-3, -2)[0] || ''
      }

      return analysis
    }

    // Vérifier si parent est un dossier client
    const client = clientsByFolderId.get(parentId)
    if (client) {
      analysis.isInClientFolder = true
      analysis.clientId = client.id
      analysis.clientFolderName = file.path.split('/').slice(-2, -1)[0] || ''
      return analysis
    }
  }

  // Si aucun match trouvé, analyser le chemin textuellement (fallback)
  const pathParts = file.path.split('/')

  // Chercher pattern "[NOM Prénom - CIN ...]/"
  for (let i = 0; i < pathParts.length; i++) {
    const part = pathParts[i]

    // Pattern dossier client : commence par [ et contient CIN ou Société
    if (part.startsWith('[') && (part.includes('CIN') || part.includes('Société'))) {
      analysis.isInClientFolder = true
      analysis.clientFolderName = part
    }

    // Pattern dossier juridique : commence par "Dossier "
    if (part.startsWith('Dossier ')) {
      analysis.isInDossierFolder = true
      analysis.dossierFolderName = part

      // Extraire numéro dossier (ex: "Dossier 2025-001" → "2025-001")
      const match = part.match(/Dossier\s+([0-9-]+)/)
      if (match) {
        const numeroDossier = match[1]

        // Chercher dossier avec ce numéro
        const dossier = Array.from(dossiersByFolderId.values()).find(
          (d) => d.numero === numeroDossier
        )

        if (dossier) {
          analysis.dossierId = dossier.id
          analysis.clientId = dossier.client_id
        }
      }
    }
  }

  return analysis
}

/**
 * Mettre à jour log de synchronisation en cas d'échec
 */
async function updateSyncLogFailed(
  syncLogId: string,
  result: SyncResult,
  startTime: number
): Promise<void> {
  const duration = Date.now() - startTime

  await query(
    `UPDATE sync_logs
     SET sync_status = 'failed', completed_at = NOW(), duration_ms = $1,
         files_scanned = $2, files_added = $3, files_updated = $4, error_message = $5
     WHERE id = $6`,
    [
      duration,
      result.filesScanned,
      result.filesAdded,
      result.filesUpdated,
      result.errors.join('; '),
      syncLogId,
    ]
  )
}
