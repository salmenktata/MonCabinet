'use server'

import { query } from '@/lib/db/postgres'
import { getErrorMessage } from '@/lib/utils/error-utils'
import { getSession } from '@/lib/auth/session'
import { revalidatePath } from 'next/cache'
import { createStorageManager } from '@/lib/integrations/storage-manager'
import { createGoogleDriveProvider } from '@/lib/integrations/cloud-storage'
import { decrypt } from '@/lib/crypto'

interface DossierWithUserId {
  user_id: string
}

/**
 * Upload document vers Google Drive via Storage Manager
 */
export async function uploadDocumentAction(formData: FormData) {
  try {
    const session = await getSession()
    if (!session?.user?.id) {
      return { error: 'Non authentifié' }
    }
    const userId = session.user.id

    // Extraire les données du formulaire
    const file = formData.get('file') as File
    const dossierId = formData.get('dossier_id') as string
    const categorie = formData.get('categorie') as string
    const description = formData.get('description') as string

    if (!file) {
      return { error: 'Aucun fichier fourni' }
    }

    if (!dossierId) {
      return { error: 'Dossier non spécifié' }
    }

    // Vérifier que le dossier appartient à l'utilisateur
    const dossierResult = await query(
      `SELECT id FROM dossiers WHERE id = $1 AND user_id = $2`,
      [dossierId, userId]
    )

    if (dossierResult.rows.length === 0) {
      return { error: 'Dossier introuvable ou accès refusé' }
    }

    // Vérifier que Google Drive est connecté
    const cloudConfigResult = await query(
      `SELECT id FROM cloud_providers_config
       WHERE user_id = $1 AND provider = $2 AND enabled = true`,
      [userId, 'google_drive']
    )

    if (cloudConfigResult.rows.length === 0) {
      return {
        error: 'Google Drive non connecté. Veuillez configurer le stockage cloud dans les paramètres.',
      }
    }

    // Convertir File en Buffer
    const arrayBuffer = await file.arrayBuffer()
    const fileBuffer = Buffer.from(arrayBuffer)

    // Uploader via Storage Manager
    const storageManager = createStorageManager()
    const uploadResult = await storageManager.uploadDocument({
      userId: userId,
      dossierId: dossierId,
      fileName: file.name,
      fileBuffer: fileBuffer,
      mimeType: file.type || 'application/octet-stream',
      categorie: categorie || undefined,
      description: description || undefined,
      sourceType: 'manual',
    })

    if (!uploadResult.success) {
      return { error: 'Erreur lors de l\'upload du fichier vers Google Drive' }
    }

    // Récupérer le document créé
    const documentResult = await query(
      `SELECT * FROM documents WHERE id = $1`,
      [uploadResult.documentId]
    )

    if (documentResult.rows.length === 0) {
      console.error('Erreur récupération document')
      return { error: 'Document uploadé mais erreur lors de la récupération' }
    }

    revalidatePath('/dossiers')
    revalidatePath(`/dossiers/${dossierId}`)
    return { success: true, data: documentResult.rows[0] }
  } catch (error) {
    console.error('Erreur upload:', error)

    // Messages d'erreur spécifiques
    const errorCode = error && typeof error === 'object' && 'code' in error ? String((error as { code?: unknown }).code) : null

    if (errorCode === 'TOKEN_EXPIRED') {
      return {
        error: 'Token Google Drive expiré. Veuillez vous reconnecter dans les paramètres.',
      }
    }

    if (errorCode === 'QUOTA_EXCEEDED') {
      return {
        error: 'Quota Google Drive dépassé. Veuillez libérer de l\'espace sur votre Drive.',
      }
    }

    if (errorCode === 'CONFIG_NOT_FOUND') {
      return {
        error: 'Configuration Google Drive non trouvée. Veuillez reconnecter votre compte.',
      }
    }

    return {
      error: getErrorMessage(error) || 'Une erreur est survenue lors de l\'upload',
    }
  }
}

/**
 * Supprimer document de Google Drive et de la BDD
 */
export async function deleteDocumentAction(id: string) {
  try {
    const session = await getSession()
    if (!session?.user?.id) {
      return { error: 'Non authentifié' }
    }
    const userId = session.user.id

    // Récupérer le document avec infos dossier
    const documentResult = await query(
      `SELECT d.*, dos.user_id as dossier_user_id
       FROM documents d
       INNER JOIN dossiers dos ON d.dossier_id = dos.id
       WHERE d.id = $1`,
      [id]
    )

    if (documentResult.rows.length === 0) {
      return { error: 'Document introuvable' }
    }

    const document = documentResult.rows[0]

    if (document.dossier_user_id !== userId) {
      return { error: 'Accès refusé' }
    }

    // Si document stocké sur Google Drive
    if (document.storage_provider === 'google_drive' && document.external_file_id) {
      try {
        // Récupérer config cloud
        const cloudConfigResult = await query(
          `SELECT access_token FROM cloud_providers_config
           WHERE user_id = $1 AND provider = $2 AND enabled = true`,
          [userId, 'google_drive']
        )

        if (cloudConfigResult.rows.length > 0) {
          // Déchiffrer le token
          const decryptedToken = await decrypt(cloudConfigResult.rows[0].access_token)

          // Supprimer de Google Drive
          const provider = createGoogleDriveProvider(decryptedToken)
          await provider.deleteFile({
            fileId: document.external_file_id,
          })

          console.log(`[deleteDocumentAction] Fichier supprimé de Google Drive: ${document.external_file_id}`)
        } else {
          console.warn('[deleteDocumentAction] Config Google Drive non trouvée, suppression BDD uniquement')
        }
      } catch (error) {
        console.error('[deleteDocumentAction] Erreur suppression Google Drive:', error)
        // Continue quand même pour supprimer l'entrée en base
        // (le fichier peut déjà être supprimé manuellement de Drive)
      }
    }

    // Supprimer l'entrée de la base de données
    await query(`DELETE FROM documents WHERE id = $1`, [id])

    revalidatePath('/dossiers')
    revalidatePath(`/dossiers/${document.dossier_id}`)
    return { success: true }
  } catch (error) {
    console.error('Erreur suppression:', error)
    return { error: 'Erreur lors de la suppression du document' }
  }
}

/**
 * Obtenir URL document Google Drive (lien partageable)
 */
export async function getDocumentUrlAction(id: string) {
  try {
    const session = await getSession()
    if (!session?.user?.id) {
      return { error: 'Non authentifié' }
    }
    const userId = session.user.id

    // Récupérer le document
    const documentResult = await query(
      `SELECT d.*, dos.user_id as dossier_user_id
       FROM documents d
       INNER JOIN dossiers dos ON d.dossier_id = dos.id
       WHERE d.id = $1`,
      [id]
    )

    if (documentResult.rows.length === 0) {
      return { error: 'Document introuvable' }
    }

    const document = documentResult.rows[0]

    if (document.dossier_user_id !== userId) {
      return { error: 'Accès refusé' }
    }

    // Si document sur Google Drive, retourner lien partageable
    if (document.storage_provider === 'google_drive' && document.external_sharing_link) {
      return {
        success: true,
        url: document.external_sharing_link,
        provider: 'google_drive',
      }
    }

    // Si document legacy sur Supabase Storage (pour rétrocompatibilité)
    if (document.storage_path) {
      console.warn('[getDocumentUrlAction] Document legacy sur Supabase Storage:', id)
      return {
        error: 'Document legacy non accessible. Veuillez re-uploader le document.',
      }
    }

    return { error: 'URL document non disponible' }
  } catch (error) {
    console.error('Erreur récupération URL:', error)
    return { error: 'Erreur lors de la récupération de l\'URL' }
  }
}

/**
 * Mettre à jour métadonnées document (catégorie, description)
 */
export async function updateDocumentAction(
  id: string,
  data: { categorie?: string; description?: string }
) {
  try {
    const session = await getSession()
    if (!session?.user?.id) {
      return { error: 'Non authentifié' }
    }
    const userId = session.user.id

    // Vérifier que le document appartient à l'utilisateur
    const checkResult = await query(
      `SELECT d.dossier_id, dos.user_id as dossier_user_id
       FROM documents d
       INNER JOIN dossiers dos ON d.dossier_id = dos.id
       WHERE d.id = $1`,
      [id]
    )

    if (checkResult.rows.length === 0 || checkResult.rows[0].dossier_user_id !== userId) {
      return { error: 'Document introuvable ou accès refusé' }
    }

    const document = checkResult.rows[0]

    const updateResult = await query(
      `UPDATE documents SET
        categorie = COALESCE($1, categorie),
        description = COALESCE($2, description),
        updated_at = NOW()
       WHERE id = $3
       RETURNING *`,
      [data.categorie, data.description, id]
    )

    revalidatePath('/dossiers')
    revalidatePath(`/dossiers/${document.dossier_id}`)
    return { success: true, data: updateResult.rows[0] }
  } catch (error) {
    console.error('Erreur mise à jour:', error)
    return { error: 'Erreur lors de la mise à jour du document' }
  }
}

/**
 * Récupérer tous les documents d'un dossier
 */
export async function getDocumentsByDossierAction(dossierId: string) {
  try {
    const session = await getSession()
    if (!session?.user?.id) {
      return { error: 'Non authentifié' }
    }
    const userId = session.user.id

    // Vérifier que le dossier appartient à l'utilisateur
    const dossierResult = await query(
      `SELECT id FROM dossiers WHERE id = $1 AND user_id = $2`,
      [dossierId, userId]
    )

    if (dossierResult.rows.length === 0) {
      return { error: 'Dossier introuvable ou accès refusé' }
    }

    const documentsResult = await query(
      `SELECT * FROM documents
       WHERE dossier_id = $1
       ORDER BY created_at DESC`,
      [dossierId]
    )

    return { success: true, data: documentsResult.rows }
  } catch (error) {
    console.error('Erreur:', error)
    return { error: 'Erreur lors de la récupération des documents' }
  }
}

/**
 * Télécharger un document depuis Google Drive
 * Retourne le fichier en tant que Buffer
 */
export async function downloadDocumentAction(id: string) {
  try {
    const session = await getSession()
    if (!session?.user?.id) {
      return { error: 'Non authentifié' }
    }
    const userId = session.user.id

    // Récupérer le document
    const documentResult = await query(
      `SELECT d.*, dos.user_id as dossier_user_id
       FROM documents d
       INNER JOIN dossiers dos ON d.dossier_id = dos.id
       WHERE d.id = $1`,
      [id]
    )

    if (documentResult.rows.length === 0) {
      return { error: 'Document introuvable' }
    }

    const document = documentResult.rows[0]

    if (document.dossier_user_id !== userId) {
      return { error: 'Accès refusé' }
    }

    // Si document sur Google Drive
    if (document.storage_provider === 'google_drive' && document.external_file_id) {
      // Récupérer config cloud
      const cloudConfigResult = await query(
        `SELECT access_token FROM cloud_providers_config
         WHERE user_id = $1 AND provider = $2 AND enabled = true`,
        [userId, 'google_drive']
      )

      if (cloudConfigResult.rows.length === 0) {
        return { error: 'Configuration Google Drive non trouvée' }
      }

      // Déchiffrer le token
      const decryptedToken = await decrypt(cloudConfigResult.rows[0].access_token)

      // Télécharger depuis Google Drive
      const provider = createGoogleDriveProvider(decryptedToken)
      const downloadResult = await provider.downloadFile({
        fileId: document.external_file_id,
      })

      return {
        success: true,
        buffer: downloadResult.buffer,
        fileName: downloadResult.fileName,
        mimeType: downloadResult.mimeType,
      }
    }

    return { error: 'Document non disponible pour téléchargement' }
  } catch (error) {
    console.error('Erreur téléchargement document:', error)

    const errorCode2 = error && typeof error === 'object' && 'code' in error ? String((error as { code?: unknown }).code) : null
    if (errorCode2 === 'TOKEN_EXPIRED') {
      return {
        error: 'Token Google Drive expiré. Veuillez vous reconnecter dans les paramètres.',
      }
    }

    return {
      error: getErrorMessage(error) || 'Erreur lors du téléchargement du document',
    }
  }
}

/**
 * Récupérer documents en attente de classification (needs_classification=true)
 */
export async function getUnclassifiedDocumentsAction() {
  try {
    const session = await getSession()
    if (!session?.user?.id) {
      return { error: 'Non authentifié' }
    }
    const userId = session.user.id

    // Récupérer documents non classés avec infos dossier/client
    const result = await query(
      `SELECT d.*,
              json_build_object(
                'id', dos.id,
                'numero', dos.numero,
                'objet', dos.objet,
                'client_id', dos.client_id,
                'clients', json_build_object(
                  'id', c.id,
                  'nom', c.nom,
                  'prenom', c.prenom,
                  'type_client', c.type_client
                )
              ) as dossiers
       FROM documents d
       LEFT JOIN dossiers dos ON d.dossier_id = dos.id
       LEFT JOIN clients c ON dos.client_id = c.id
       WHERE d.user_id = $1
         AND d.needs_classification = true
         AND d.dossier_id IS NULL
       ORDER BY d.created_at DESC`,
      [userId]
    )

    return { success: true, data: result.rows }
  } catch (error) {
    console.error('Erreur:', error)
    return { error: 'Erreur lors de la récupération des documents' }
  }
}

/**
 * Classer un document en le rattachant à un dossier
 */
export async function classifyDocumentAction(
  documentId: string,
  dossierId: string
) {
  try {
    const session = await getSession()
    if (!session?.user?.id) {
      return { error: 'Non authentifié' }
    }
    const userId = session.user.id

    // Vérifier que le document appartient à l'utilisateur
    const documentResult = await query(
      `SELECT id, external_file_id, nom_fichier, user_id
       FROM documents WHERE id = $1`,
      [documentId]
    )

    if (documentResult.rows.length === 0 || documentResult.rows[0].user_id !== userId) {
      return { error: 'Document introuvable ou accès refusé' }
    }

    const document = documentResult.rows[0]

    // Vérifier que le dossier appartient à l'utilisateur
    const dossierResult = await query(
      `SELECT id, numero, client_id, google_drive_folder_id
       FROM dossiers WHERE id = $1 AND user_id = $2`,
      [dossierId, userId]
    )

    if (dossierResult.rows.length === 0) {
      return { error: 'Dossier introuvable ou accès refusé' }
    }

    const dossier = dossierResult.rows[0]

    // TODO (optionnel) : Déplacer fichier dans Google Drive vers bon dossier juridique
    // Pour l'instant, on se contente de mettre à jour la BDD

    // Mettre à jour document en BDD
    await query(
      `UPDATE documents SET
        dossier_id = $1,
        needs_classification = false,
        classified_at = NOW(),
        external_folder_dossier_id = $2,
        updated_at = NOW()
       WHERE id = $3`,
      [dossierId, dossier.google_drive_folder_id, documentId]
    )

    console.log(
      `[classifyDocumentAction] Document ${document.nom_fichier} classé dans dossier ${dossier.numero}`
    )

    revalidatePath('/dashboard')
    revalidatePath(`/dossiers/${dossierId}`)

    return { success: true }
  } catch (error) {
    console.error('Erreur classification:', error)
    return { error: 'Erreur lors de la classification du document' }
  }
}

/**
 * Ignorer un document non classé (masquer de la liste)
 */
export async function ignoreUnclassifiedDocumentAction(documentId: string) {
  try {
    const session = await getSession()
    if (!session?.user?.id) {
      return { error: 'Non authentifié' }
    }
    const userId = session.user.id

    // Vérifier que le document appartient à l'utilisateur
    const documentResult = await query(
      `SELECT id, user_id FROM documents WHERE id = $1`,
      [documentId]
    )

    if (documentResult.rows.length === 0 || documentResult.rows[0].user_id !== userId) {
      return { error: 'Document introuvable ou accès refusé' }
    }

    // Marquer comme classé mais sans dossier (pour le masquer de la liste)
    await query(
      `UPDATE documents SET
        needs_classification = false,
        classified_at = NOW(),
        updated_at = NOW()
       WHERE id = $1`,
      [documentId]
    )

    console.log(`[ignoreUnclassifiedDocumentAction] Document ignoré: ${documentId}`)

    revalidatePath('/dashboard')

    return { success: true }
  } catch (error) {
    console.error('Erreur ignorer:', error)
    return { error: 'Erreur lors de l\'opération' }
  }
}
