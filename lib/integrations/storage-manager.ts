/**
 * Storage Manager - Orchestrateur Cloud Storage
 * Gère l'upload/download documents vers cloud providers (Google Drive)
 * Architecture hiérarchique : Clients MonCabinet/ → [Client]/ → [Dossier juridique]/ → fichiers
 */

import { createClient } from '@/lib/supabase/server'
import {
  createGoogleDriveProvider,
  TokenExpiredError,
  CloudStorageError,
  type UploadFileResult,
} from './cloud-storage'

export interface StorageManagerUploadParams {
  userId: string
  dossierId: string
  fileName: string
  fileBuffer: Buffer
  mimeType: string
  categorie?: string
  description?: string
  sourceType?: 'manual' | 'whatsapp' | 'google_drive_sync'
  sourceMetadata?: Record<string, any>
}

export interface StorageManagerUploadResult {
  documentId: string
  externalFileId: string
  externalSharingLink: string
  success: boolean
}

export interface ClientFolderInfo {
  folderId: string
  folderUrl: string
  folderName: string
}

export interface DossierFolderInfo {
  folderId: string
  folderUrl: string
  folderName: string
}

/**
 * Classe principale Storage Manager
 */
export class StorageManager {
  private supabase: ReturnType<typeof createClient>

  constructor() {
    this.supabase = createClient()
  }

  /**
   * Upload document vers cloud storage avec structure hiérarchique
   */
  async uploadDocument(
    params: StorageManagerUploadParams
  ): Promise<StorageManagerUploadResult> {
    try {
      // 1. Récupérer configuration cloud utilisateur
      const cloudConfig = await this.getCloudConfig(params.userId)

      // 2. Vérifier et refresh token si nécessaire
      const accessToken = await this.ensureValidToken(cloudConfig)

      // 3. Récupérer informations dossier et client
      const dossier = await this.getDossier(params.dossierId)
      const client = await this.getClient(dossier.client_id)

      // 4. Créer provider Google Drive
      const provider = createGoogleDriveProvider(accessToken)

      // 5. Créer/vérifier dossier racine "Clients MonCabinet/"
      const rootFolderId = await this.ensureRootFolder(
        provider,
        cloudConfig.root_folder_id
      )

      // 6. Créer/vérifier dossier client "[NOM Prénom - CIN]/"
      const clientFolder = await this.ensureClientFolder(
        provider,
        client,
        rootFolderId
      )

      // 7. Créer/vérifier dossier juridique "Dossier 2025-XXX/"
      const dossierFolder = await this.ensureDossierFolder(
        provider,
        dossier,
        clientFolder.folderId
      )

      // 8. Upload fichier vers Google Drive
      const uploadResult = await provider.uploadFile({
        fileName: params.fileName,
        fileBuffer: params.fileBuffer,
        mimeType: params.mimeType,
        parentFolderId: dossierFolder.folderId,
      })

      // 9. Créer entrée dans BDD
      const documentId = await this.createDocumentRecord({
        userId: params.userId,
        dossierId: params.dossierId,
        fileName: params.fileName,
        mimeType: params.mimeType,
        fileSize: uploadResult.fileSize,
        externalFileId: uploadResult.fileId,
        externalFolderClientId: clientFolder.folderId,
        externalFolderDossierId: dossierFolder.folderId,
        externalSharingLink: uploadResult.webViewLink,
        externalMetadata: {
          webContentLink: uploadResult.webContentLink,
          thumbnailLink: uploadResult.thumbnailLink,
          createdTime: uploadResult.createdTime.toISOString(),
          modifiedTime: uploadResult.modifiedTime.toISOString(),
        },
        categorie: params.categorie,
        description: params.description,
        sourceType: params.sourceType || 'manual',
        sourceMetadata: params.sourceMetadata,
      })

      // 10. Mettre à jour dossier racine si nouveau
      if (rootFolderId !== cloudConfig.root_folder_id) {
        await this.updateRootFolder(params.userId, rootFolderId)
      }

      return {
        documentId,
        externalFileId: uploadResult.fileId,
        externalSharingLink: uploadResult.webViewLink,
        success: true,
      }
    } catch (error) {
      // Rollback en cas d'erreur
      console.error('[StorageManager] Upload failed:', error)

      if (error instanceof TokenExpiredError) {
        throw new CloudStorageError(
          'Token Google Drive expiré. Veuillez vous reconnecter.',
          'TOKEN_EXPIRED',
          'google_drive'
        )
      }

      throw error
    }
  }

  /**
   * Récupérer configuration cloud utilisateur
   */
  private async getCloudConfig(userId: string) {
    const { data, error } = await this.supabase
      .from('cloud_providers_config')
      .select('*')
      .eq('user_id', userId)
      .eq('provider', 'google_drive')
      .eq('enabled', true)
      .single()

    if (error || !data) {
      throw new CloudStorageError(
        'Configuration Google Drive non trouvée. Veuillez connecter votre compte.',
        'CONFIG_NOT_FOUND',
        'google_drive'
      )
    }

    return {
      id: data.id,
      provider: data.provider,
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      tokenExpiresAt: new Date(data.token_expires_at),
      root_folder_id: data.root_folder_id,
      root_folder_name: data.root_folder_name,
    }
  }

  /**
   * Vérifier et refresh token si expiré
   */
  private async ensureValidToken(cloudConfig: any): Promise<string> {
    const provider = createGoogleDriveProvider(cloudConfig.accessToken)

    // Vérifier si token expiré (buffer 5 min)
    if (provider.isTokenExpired(cloudConfig.tokenExpiresAt)) {
      console.log('[StorageManager] Token expiré, rafraîchissement...')

      // Refresh token
      const refreshed = await provider.refreshAccessToken(
        cloudConfig.refreshToken
      )

      // Mettre à jour BDD
      const newExpiresAt = new Date(Date.now() + refreshed.expiresIn * 1000)

      await this.supabase
        .from('cloud_providers_config')
        .update({
          access_token: refreshed.accessToken,
          token_expires_at: newExpiresAt.toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', cloudConfig.id)

      console.log('[StorageManager] Token rafraîchi avec succès')
      return refreshed.accessToken
    }

    return cloudConfig.accessToken
  }

  /**
   * Récupérer informations dossier
   */
  private async getDossier(dossierId: string) {
    const { data, error } = await this.supabase
      .from('dossiers')
      .select(
        'id, client_id, numero_dossier, objet, google_drive_folder_id, google_drive_folder_url'
      )
      .eq('id', dossierId)
      .single()

    if (error || !data) {
      throw new Error(`Dossier non trouvé: ${dossierId}`)
    }

    return data
  }

  /**
   * Récupérer informations client
   */
  private async getClient(clientId: string) {
    const { data, error } = await this.supabase
      .from('clients')
      .select(
        'id, nom, prenom, denomination, cin, type, google_drive_folder_id, google_drive_folder_url'
      )
      .eq('id', clientId)
      .single()

    if (error || !data) {
      throw new Error(`Client non trouvé: ${clientId}`)
    }

    return data
  }

  /**
   * Créer/vérifier dossier racine "Clients MonCabinet/"
   */
  private async ensureRootFolder(
    provider: any,
    existingRootFolderId?: string | null
  ): Promise<string> {
    // Si dossier racine existe déjà
    if (existingRootFolderId) {
      try {
        // Vérifier qu'il existe toujours
        await provider.getFileMetadata(existingRootFolderId)
        return existingRootFolderId
      } catch (error) {
        console.warn(
          '[StorageManager] Dossier racine non trouvé, recréation...'
        )
      }
    }

    // Créer dossier racine
    const rootFolder = await provider.createFolder({
      folderName: 'Clients MonCabinet',
    })

    console.log(
      `[StorageManager] Dossier racine créé: ${rootFolder.folderId}`
    )
    return rootFolder.folderId
  }

  /**
   * Créer/vérifier dossier client "[NOM Prénom - CIN]/"
   */
  private async ensureClientFolder(
    provider: any,
    client: any,
    rootFolderId: string
  ): Promise<ClientFolderInfo> {
    // Si dossier client existe déjà en BDD
    if (client.google_drive_folder_id) {
      try {
        const metadata = await provider.getFileMetadata(
          client.google_drive_folder_id
        )
        return {
          folderId: client.google_drive_folder_id,
          folderUrl: client.google_drive_folder_url || metadata.webViewLink,
          folderName: metadata.name,
        }
      } catch (error) {
        console.warn(
          '[StorageManager] Dossier client non trouvé, recréation...'
        )
      }
    }

    // Créer nom dossier client
    let folderName: string
    if (client.type === 'personne_morale') {
      folderName = `[${client.denomination}]`
    } else {
      const cin = client.cin ? ` - CIN ${client.cin}` : ''
      const prenom = client.prenom ? ` ${client.prenom}` : ''
      folderName = `[${client.nom}${prenom}${cin}]`
    }

    // Créer dossier client
    const clientFolder = await provider.createFolder({
      folderName,
      parentFolderId: rootFolderId,
    })

    // Mettre à jour BDD client
    await this.supabase
      .from('clients')
      .update({
        google_drive_folder_id: clientFolder.folderId,
        google_drive_folder_url: clientFolder.webViewLink,
        updated_at: new Date().toISOString(),
      })
      .eq('id', client.id)

    console.log(`[StorageManager] Dossier client créé: ${folderName}`)

    return {
      folderId: clientFolder.folderId,
      folderUrl: clientFolder.webViewLink,
      folderName: clientFolder.folderName,
    }
  }

  /**
   * Créer/vérifier dossier juridique "Dossier 2025-XXX/"
   */
  private async ensureDossierFolder(
    provider: any,
    dossier: any,
    clientFolderId: string
  ): Promise<DossierFolderInfo> {
    // Si dossier juridique existe déjà en BDD
    if (dossier.google_drive_folder_id) {
      try {
        const metadata = await provider.getFileMetadata(
          dossier.google_drive_folder_id
        )
        return {
          folderId: dossier.google_drive_folder_id,
          folderUrl: dossier.google_drive_folder_url || metadata.webViewLink,
          folderName: metadata.name,
        }
      } catch (error) {
        console.warn(
          '[StorageManager] Dossier juridique non trouvé, recréation...'
        )
      }
    }

    // Créer nom dossier juridique
    const objet = dossier.objet ? ` (${dossier.objet})` : ''
    const folderName = `Dossier ${dossier.numero_dossier}${objet}`

    // Créer dossier juridique
    const dossierFolder = await provider.createFolder({
      folderName,
      parentFolderId: clientFolderId,
    })

    // Mettre à jour BDD dossier
    await this.supabase
      .from('dossiers')
      .update({
        google_drive_folder_id: dossierFolder.folderId,
        google_drive_folder_url: dossierFolder.webViewLink,
        updated_at: new Date().toISOString(),
      })
      .eq('id', dossier.id)

    console.log(`[StorageManager] Dossier juridique créé: ${folderName}`)

    // Créer aussi dossier "Documents non classés/" pour ce client si première fois
    await this.ensureUnclassifiedFolder(provider, clientFolderId)

    return {
      folderId: dossierFolder.folderId,
      folderUrl: dossierFolder.webViewLink,
      folderName: dossierFolder.folderName,
    }
  }

  /**
   * Créer dossier "Documents non classés/" pour zone tampon
   */
  private async ensureUnclassifiedFolder(
    provider: any,
    clientFolderId: string
  ): Promise<string> {
    try {
      // Vérifier si dossier existe déjà
      const result = await provider.listFiles({
        folderId: clientFolderId,
        query: `name = 'Documents non classés' and mimeType = 'application/vnd.google-apps.folder'`,
      })

      if (result.files.length > 0) {
        return result.files[0].id
      }

      // Créer dossier
      const unclassifiedFolder = await provider.createFolder({
        folderName: 'Documents non classés',
        parentFolderId: clientFolderId,
      })

      console.log(
        `[StorageManager] Dossier "Documents non classés" créé pour client`
      )
      return unclassifiedFolder.folderId
    } catch (error) {
      console.warn(
        '[StorageManager] Erreur création dossier non classés:',
        error
      )
      return '' // Non bloquant
    }
  }

  /**
   * Créer entrée document dans BDD
   */
  private async createDocumentRecord(params: {
    userId: string
    dossierId: string
    fileName: string
    mimeType: string
    fileSize: number
    externalFileId: string
    externalFolderClientId: string
    externalFolderDossierId: string
    externalSharingLink: string
    externalMetadata: any
    categorie?: string
    description?: string
    sourceType: string
    sourceMetadata?: any
  }): Promise<string> {
    const { data, error } = await this.supabase
      .from('documents')
      .insert({
        user_id: params.userId,
        dossier_id: params.dossierId,
        nom_fichier: params.fileName,
        type_fichier: params.mimeType,
        taille_fichier: params.fileSize,
        storage_provider: 'google_drive',
        external_file_id: params.externalFileId,
        external_folder_client_id: params.externalFolderClientId,
        external_folder_dossier_id: params.externalFolderDossierId,
        external_sharing_link: params.externalSharingLink,
        external_metadata: params.externalMetadata,
        source_type: params.sourceType,
        source_metadata: params.sourceMetadata || {},
        categorie: params.categorie,
        description: params.description,
        needs_classification: false, // Déjà classé dans bon dossier
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select('id')
      .single()

    if (error || !data) {
      throw new Error(
        `Échec création entrée document BDD: ${error?.message}`
      )
    }

    return data.id
  }

  /**
   * Mettre à jour dossier racine dans config
   */
  private async updateRootFolder(
    userId: string,
    rootFolderId: string
  ): Promise<void> {
    await this.supabase
      .from('cloud_providers_config')
      .update({
        root_folder_id: rootFolderId,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId)
      .eq('provider', 'google_drive')
  }
}

/**
 * Créer instance Storage Manager
 */
export function createStorageManager(): StorageManager {
  return new StorageManager()
}
