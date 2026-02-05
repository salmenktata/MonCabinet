/**
 * Client MinIO pour stockage fichiers
 *
 * Remplace Supabase Storage avec MinIO auto-hébergé sur VPS.
 * Compatible avec l'API S3.
 */

import { Client as MinioClient, BucketItem } from 'minio'

// Client MinIO singleton
let minioClient: MinioClient | null = null

/**
 * Configuration MinIO depuis variables d'environnement
 */
const minioConfig = {
  endPoint: process.env.MINIO_ENDPOINT || 'localhost',
  port: parseInt(process.env.MINIO_PORT || '9000'),
  useSSL: process.env.MINIO_USE_SSL === 'true',
  accessKey: process.env.MINIO_ACCESS_KEY || '',
  secretKey: process.env.MINIO_SECRET_KEY || '',
}

const defaultBucket = process.env.MINIO_BUCKET || 'documents'

/**
 * Obtenir ou créer le client MinIO
 */
export function getMinioClient(): MinioClient {
  if (!minioClient) {
    if (!minioConfig.accessKey || !minioConfig.secretKey) {
      throw new Error('MINIO_ACCESS_KEY et MINIO_SECRET_KEY requis')
    }

    minioClient = new MinioClient(minioConfig)

    console.log('✅ Client MinIO initialisé:', {
      endpoint: `${minioConfig.endPoint}:${minioConfig.port}`,
      ssl: minioConfig.useSSL,
    })
  }

  return minioClient
}

/**
 * Initialiser le bucket par défaut s'il n'existe pas
 * À appeler au démarrage de l'application
 */
export async function initializeBucket(bucketName: string = defaultBucket): Promise<void> {
  const client = getMinioClient()

  try {
    const exists = await client.bucketExists(bucketName)

    if (!exists) {
      await client.makeBucket(bucketName, 'eu-west-1')
      console.log(`✅ Bucket MinIO créé: ${bucketName}`)

      // Définir politique d'accès (private par défaut)
      const policy = {
        Version: '2012-10-17',
        Statement: [
          {
            Effect: 'Deny',
            Principal: '*',
            Action: ['s3:GetObject'],
            Resource: [`arn:aws:s3:::${bucketName}/*`],
          },
        ],
      }

      await client.setBucketPolicy(bucketName, JSON.stringify(policy))
      console.log(`✅ Politique d'accès définie pour: ${bucketName}`)
    } else {
      console.log(`✅ Bucket MinIO existant: ${bucketName}`)
    }
  } catch (error) {
    console.error('❌ Erreur initialisation bucket MinIO:', error)
    throw error
  }
}

/**
 * Upload un fichier vers MinIO
 *
 * @param file - Buffer ou ReadableStream du fichier
 * @param path - Chemin dans le bucket (ex: "clients/123/document.pdf")
 * @param metadata - Métadonnées optionnelles
 * @returns URL d'accès temporaire (presigned) valide 7 jours
 */
export async function uploadFile(
  file: Buffer | NodeJS.ReadableStream,
  path: string,
  metadata?: Record<string, string>,
  bucketName: string = defaultBucket
): Promise<{ url: string; path: string }> {
  const client = getMinioClient()

  try {
    const metaData = {
      'Content-Type': metadata?.contentType || 'application/octet-stream',
      ...metadata,
    }

    if (Buffer.isBuffer(file)) {
      await client.putObject(bucketName, path, file, file.length, metaData)
    } else {
      await client.putObject(bucketName, path, file, metaData)
    }

    // Générer URL presigned valide 7 jours
    const url = await client.presignedGetObject(bucketName, path, 7 * 24 * 60 * 60)

    console.log(`✅ Fichier uploadé: ${path}`)

    return { url, path }
  } catch (error) {
    console.error('❌ Erreur upload MinIO:', error)
    throw new Error(`Échec upload fichier: ${path}`)
  }
}

/**
 * Télécharger un fichier depuis MinIO
 *
 * @param path - Chemin du fichier dans le bucket
 * @returns Buffer du fichier
 */
export async function downloadFile(
  path: string,
  bucketName: string = defaultBucket
): Promise<Buffer> {
  const client = getMinioClient()

  try {
    const stream = await client.getObject(bucketName, path)

    // Convertir stream en Buffer
    const chunks: Buffer[] = []
    return new Promise((resolve, reject) => {
      stream.on('data', (chunk) => chunks.push(Buffer.from(chunk)))
      stream.on('end', () => resolve(Buffer.concat(chunks)))
      stream.on('error', reject)
    })
  } catch (error) {
    console.error('❌ Erreur download MinIO:', error)
    throw new Error(`Échec téléchargement fichier: ${path}`)
  }
}

/**
 * Obtenir une URL presigned pour accès temporaire
 *
 * @param path - Chemin du fichier
 * @param expirySeconds - Durée de validité en secondes (défaut: 1 heure)
 * @returns URL temporaire
 */
export async function getPresignedUrl(
  path: string,
  expirySeconds: number = 3600,
  bucketName: string = defaultBucket
): Promise<string> {
  const client = getMinioClient()

  try {
    return await client.presignedGetObject(bucketName, path, expirySeconds)
  } catch (error) {
    console.error('❌ Erreur génération URL presigned:', error)
    throw new Error(`Échec génération URL pour: ${path}`)
  }
}

/**
 * Obtenir une URL presigned pour upload direct depuis client
 *
 * @param path - Chemin du fichier à uploader
 * @param expirySeconds - Durée de validité en secondes (défaut: 10 minutes)
 * @returns URL temporaire pour PUT
 */
export async function getPresignedUploadUrl(
  path: string,
  expirySeconds: number = 600,
  bucketName: string = defaultBucket
): Promise<string> {
  const client = getMinioClient()

  try {
    return await client.presignedPutObject(bucketName, path, expirySeconds)
  } catch (error) {
    console.error('❌ Erreur génération URL upload presigned:', error)
    throw new Error(`Échec génération URL upload pour: ${path}`)
  }
}

/**
 * Supprimer un fichier
 *
 * @param path - Chemin du fichier à supprimer
 */
export async function deleteFile(
  path: string,
  bucketName: string = defaultBucket
): Promise<void> {
  const client = getMinioClient()

  try {
    await client.removeObject(bucketName, path)
    console.log(`✅ Fichier supprimé: ${path}`)
  } catch (error) {
    console.error('❌ Erreur suppression MinIO:', error)
    throw new Error(`Échec suppression fichier: ${path}`)
  }
}

/**
 * Supprimer plusieurs fichiers
 *
 * @param paths - Liste des chemins à supprimer
 */
export async function deleteFiles(
  paths: string[],
  bucketName: string = defaultBucket
): Promise<void> {
  const client = getMinioClient()

  try {
    await client.removeObjects(bucketName, paths)
    console.log(`✅ ${paths.length} fichiers supprimés`)
  } catch (error) {
    console.error('❌ Erreur suppression batch MinIO:', error)
    throw new Error(`Échec suppression fichiers batch`)
  }
}

/**
 * Lister les fichiers dans un préfixe
 *
 * @param prefix - Préfixe du chemin (ex: "clients/123/")
 * @returns Liste des fichiers
 */
export async function listFiles(
  prefix: string = '',
  bucketName: string = defaultBucket
): Promise<BucketItem[]> {
  const client = getMinioClient()

  try {
    const stream = client.listObjects(bucketName, prefix, true)
    const files: BucketItem[] = []

    return new Promise((resolve, reject) => {
      stream.on('data', (obj) => files.push(obj))
      stream.on('end', () => resolve(files))
      stream.on('error', reject)
    })
  } catch (error) {
    console.error('❌ Erreur listing MinIO:', error)
    throw new Error(`Échec listing fichiers: ${prefix}`)
  }
}

/**
 * Copier un fichier
 *
 * @param sourcePath - Chemin source
 * @param destinationPath - Chemin destination
 */
export async function copyFile(
  sourcePath: string,
  destinationPath: string,
  bucketName: string = defaultBucket
): Promise<void> {
  const client = getMinioClient()

  try {
    await client.copyObject(
      bucketName,
      destinationPath,
      `/${bucketName}/${sourcePath}`,
      null
    )
    console.log(`✅ Fichier copié: ${sourcePath} → ${destinationPath}`)
  } catch (error) {
    console.error('❌ Erreur copie MinIO:', error)
    throw new Error(`Échec copie fichier: ${sourcePath}`)
  }
}

/**
 * Obtenir métadonnées d'un fichier
 *
 * @param path - Chemin du fichier
 * @returns Métadonnées (size, etag, lastModified, etc.)
 */
export async function getFileMetadata(
  path: string,
  bucketName: string = defaultBucket
): Promise<{ size: number; etag: string; lastModified: Date; metaData: any }> {
  const client = getMinioClient()

  try {
    const stat = await client.statObject(bucketName, path)
    return {
      size: stat.size,
      etag: stat.etag,
      lastModified: stat.lastModified,
      metaData: stat.metaData,
    }
  } catch (error) {
    console.error('❌ Erreur récupération métadonnées MinIO:', error)
    throw new Error(`Échec récupération métadonnées: ${path}`)
  }
}

/**
 * Vérifier si un fichier existe
 *
 * @param path - Chemin du fichier
 * @returns true si le fichier existe
 */
export async function fileExists(
  path: string,
  bucketName: string = defaultBucket
): Promise<boolean> {
  try {
    await getFileMetadata(path, bucketName)
    return true
  } catch {
    return false
  }
}

/**
 * Health check MinIO
 * Utilisé par l'endpoint /api/health
 */
export async function healthCheck(): Promise<boolean> {
  try {
    const client = getMinioClient()
    await client.bucketExists(defaultBucket)
    return true
  } catch (error) {
    console.error('❌ Health check MinIO échoué:', error)
    return false
  }
}

/**
 * Exports helpers
 */
export const storage = {
  upload: uploadFile,
  download: downloadFile,
  delete: deleteFile,
  deleteMany: deleteFiles,
  list: listFiles,
  copy: copyFile,
  getUrl: getPresignedUrl,
  getUploadUrl: getPresignedUploadUrl,
  getMetadata: getFileMetadata,
  exists: fileExists,
  healthCheck,
  initialize: initializeBucket,
}

export default storage
