'use server'

import { query } from '@/lib/db/postgres'
import { getSession } from '@/lib/auth/session'
import { revalidatePath } from 'next/cache'
import type { KnowledgeCategory, KnowledgeSubcategory } from '@/lib/categories/legal-categories'
import { getCategoriesForContext } from '@/lib/categories/legal-categories'

// Import dynamique pour éviter les problèmes avec pdf-parse
async function getKnowledgeBaseService() {
  return await import('@/lib/ai/knowledge-base-service')
}

// Utiliser le type du système centralisé
export type { KnowledgeCategory, KnowledgeSubcategory }
export type KnowledgeBaseLanguage = 'ar' | 'fr'

// =============================================================================
// VÉRIFICATION ADMIN
// =============================================================================

async function checkAdminAccess(): Promise<{ userId: string } | { error: string }> {
  const session = await getSession()
  if (!session?.user?.id) {
    return { error: 'Non authentifié' }
  }

  const result = await query('SELECT role FROM users WHERE id = $1', [session.user.id])
  const role = result.rows[0]?.role

  // Accepter admin ou super_admin
  if (role !== 'admin' && role !== 'super_admin') {
    return { error: 'Accès réservé aux administrateurs' }
  }

  return { userId: session.user.id }
}

// =============================================================================
// ACTIONS
// =============================================================================

/**
 * Upload un document à la base de connaissances
 */
export async function uploadKnowledgeDocumentAction(formData: FormData) {
  try {
    const authCheck = await checkAdminAccess()
    if ('error' in authCheck) {
      return { error: authCheck.error }
    }

    const category = formData.get('category') as KnowledgeCategory
    const language = (formData.get('language') as KnowledgeBaseLanguage) || 'ar'
    const title = formData.get('title') as string
    const description = formData.get('description') as string | null
    const autoIndex = formData.get('autoIndex') !== 'false'
    const metadataStr = formData.get('metadata') as string | null
    const file = formData.get('file') as File | null
    const text = formData.get('text') as string | null

    // Validation
    if (!category || !title) {
      return { error: 'Catégorie et titre requis' }
    }

    const validLanguages: KnowledgeBaseLanguage[] = ['ar', 'fr']
    if (!validLanguages.includes(language)) {
      return { error: 'Langue invalide' }
    }

    const validCategories = getCategoriesForContext('knowledge_base', 'fr')
      .filter(c => c.value !== 'all')
      .map(c => c.value as KnowledgeCategory)
    if (!validCategories.includes(category)) {
      return { error: `Catégorie invalide` }
    }

    // Récupérer les nouveaux champs
    const subcategory = formData.get('subcategory') as string | null
    const tagsStr = formData.get('tags') as string | null
    let tags: string[] = []
    if (tagsStr) {
      try {
        tags = JSON.parse(tagsStr)
      } catch {
        // Si c'est une chaîne séparée par des virgules
        tags = tagsStr.split(',').map((t) => t.trim()).filter(Boolean)
      }
    }

    if (!file && !text) {
      return { error: 'Un fichier ou un texte est requis' }
    }

    // Préparer le fichier si présent
    let fileData: { buffer: Buffer; filename: string; mimeType: string } | undefined
    if (file) {
      const arrayBuffer = await file.arrayBuffer()
      fileData = {
        buffer: Buffer.from(arrayBuffer),
        filename: file.name,
        mimeType: file.type || 'application/octet-stream',
      }
    }

    // Parser les métadonnées
    let metadata: Record<string, unknown> = {}
    if (metadataStr) {
      try {
        metadata = JSON.parse(metadataStr)
      } catch {
        // Ignorer erreur parsing
      }
    }

    // Upload (import dynamique)
    const { uploadKnowledgeDocument } = await getKnowledgeBaseService()
    const document = await uploadKnowledgeDocument(
      {
        category,
        language,
        title,
        description: description || undefined,
        metadata,
        file: fileData,
        text: text || undefined,
        autoIndex,
        subcategory: subcategory || undefined,
        tags,
      },
      authCheck.userId
    )

    revalidatePath('/parametres/base-connaissances')

    return {
      success: true,
      document: {
        id: document.id,
        title: document.title,
        category: document.category,
        isIndexed: document.isIndexed,
      },
    }
  } catch (error) {
    console.error('Erreur upload knowledge document:', error)
    return {
      error: error instanceof Error ? error.message : 'Erreur lors de l\'upload',
    }
  }
}

/**
 * Indexer un document
 */
export async function indexKnowledgeDocumentAction(documentId: string) {
  try {
    const authCheck = await checkAdminAccess()
    if ('error' in authCheck) {
      return { error: authCheck.error }
    }

    const { indexKnowledgeDocument } = await getKnowledgeBaseService()
    const result = await indexKnowledgeDocument(documentId)

    if (!result.success) {
      return { error: result.error || 'Erreur indexation' }
    }

    revalidatePath('/parametres/base-connaissances')

    return {
      success: true,
      chunksCreated: result.chunksCreated,
    }
  } catch (error) {
    console.error('Erreur indexation:', error)
    return {
      error: error instanceof Error ? error.message : 'Erreur indexation',
    }
  }
}

/**
 * Supprimer un document
 */
export async function deleteKnowledgeDocumentAction(documentId: string) {
  try {
    const authCheck = await checkAdminAccess()
    if ('error' in authCheck) {
      return { error: authCheck.error }
    }

    const { deleteKnowledgeDocument } = await getKnowledgeBaseService()
    const deleted = await deleteKnowledgeDocument(documentId)

    if (!deleted) {
      return { error: 'Document non trouvé' }
    }

    revalidatePath('/parametres/base-connaissances')

    return { success: true }
  } catch (error) {
    console.error('Erreur suppression:', error)
    return {
      error: error instanceof Error ? error.message : 'Erreur suppression',
    }
  }
}

/**
 * Mettre à jour un document
 */
export async function updateKnowledgeDocumentAction(
  documentId: string,
  data: {
    title?: string
    description?: string
    category?: KnowledgeCategory
    subcategory?: string
    metadata?: Record<string, unknown>
    tags?: string[]
    language?: 'ar' | 'fr'
  }
) {
  try {
    const authCheck = await checkAdminAccess()
    if ('error' in authCheck) {
      return { error: authCheck.error }
    }

    const { updateKnowledgeDocument } = await getKnowledgeBaseService()
    const document = await updateKnowledgeDocument(documentId, data)

    if (!document) {
      return { error: 'Document non trouvé' }
    }

    revalidatePath('/parametres/base-connaissances')

    return { success: true, document }
  } catch (error) {
    console.error('Erreur mise à jour:', error)
    return {
      error: error instanceof Error ? error.message : 'Erreur mise à jour',
    }
  }
}

/**
 * Récupérer les statistiques
 */
export async function getKnowledgeBaseStatsAction() {
  try {
    const authCheck = await checkAdminAccess()
    if ('error' in authCheck) {
      return { error: authCheck.error }
    }

    const { getKnowledgeBaseStats } = await getKnowledgeBaseService()
    const stats = await getKnowledgeBaseStats()

    return { success: true, stats }
  } catch (error) {
    console.error('Erreur stats:', error)
    return {
      error: error instanceof Error ? error.message : 'Erreur récupération stats',
    }
  }
}

/**
 * Lister les documents
 */
export async function listKnowledgeDocumentsAction(options: {
  category?: KnowledgeCategory
  subcategory?: string
  isIndexed?: boolean
  search?: string
  tags?: string[]
  limit?: number
  offset?: number
}) {
  try {
    const authCheck = await checkAdminAccess()
    if ('error' in authCheck) {
      return { error: authCheck.error }
    }

    const { listKnowledgeDocuments } = await getKnowledgeBaseService()
    const result = await listKnowledgeDocuments(options)

    return {
      success: true,
      documents: result.documents,
      total: result.total,
    }
  } catch (error) {
    console.error('Erreur liste:', error)
    return {
      error: error instanceof Error ? error.message : 'Erreur récupération liste',
    }
  }
}

// =============================================================================
// NOUVELLES ACTIONS: VERSIONING ET MISE À JOUR CONTENU
// =============================================================================

/**
 * Récupérer un document par ID
 */
export async function getKnowledgeDocumentAction(documentId: string) {
  try {
    const authCheck = await checkAdminAccess()
    if ('error' in authCheck) {
      return { error: authCheck.error }
    }

    const { getKnowledgeDocument } = await getKnowledgeBaseService()
    const document = await getKnowledgeDocument(documentId)

    if (!document) {
      return { error: 'Document non trouvé' }
    }

    return { success: true, document }
  } catch (error) {
    console.error('Erreur récupération document:', error)
    return {
      error: error instanceof Error ? error.message : 'Erreur récupération document',
    }
  }
}

/**
 * Mise à jour complète du contenu d'un document (nouveau fichier ou texte)
 */
export async function updateKnowledgeDocumentContentAction(
  documentId: string,
  formData: FormData
) {
  try {
    const authCheck = await checkAdminAccess()
    if ('error' in authCheck) {
      return { error: authCheck.error }
    }

    const file = formData.get('file') as File | null
    const text = formData.get('text') as string | null
    const reindex = formData.get('reindex') !== 'false'
    const changeReason = formData.get('changeReason') as string | null

    if (!file && !text) {
      return { error: 'Un fichier ou un texte est requis' }
    }

    // Préparer le fichier si présent
    let fileData: { buffer: Buffer; filename: string; mimeType: string } | undefined
    if (file) {
      const arrayBuffer = await file.arrayBuffer()
      fileData = {
        buffer: Buffer.from(arrayBuffer),
        filename: file.name,
        mimeType: file.type || 'application/octet-stream',
      }
    }

    const { updateKnowledgeDocumentContent } = await getKnowledgeBaseService()
    const result = await updateKnowledgeDocumentContent(
      documentId,
      {
        file: fileData,
        text: text || undefined,
        reindex,
        changeReason: changeReason || undefined,
      },
      authCheck.userId
    )

    if (!result.success) {
      return { error: result.error || 'Erreur mise à jour contenu' }
    }

    revalidatePath('/super-admin/knowledge-base')
    revalidatePath(`/super-admin/knowledge-base/${documentId}`)

    return {
      success: true,
      document: result.document,
      versionCreated: result.versionCreated,
    }
  } catch (error) {
    console.error('Erreur mise à jour contenu:', error)
    return {
      error: error instanceof Error ? error.message : 'Erreur mise à jour contenu',
    }
  }
}

/**
 * Récupérer l'historique des versions d'un document
 */
export async function getKnowledgeDocumentVersionsAction(
  documentId: string,
  options?: { limit?: number; offset?: number }
) {
  try {
    const authCheck = await checkAdminAccess()
    if ('error' in authCheck) {
      return { error: authCheck.error }
    }

    const { getKnowledgeDocumentVersions } = await getKnowledgeBaseService()
    const versions = await getKnowledgeDocumentVersions(documentId, options)

    return { success: true, versions }
  } catch (error) {
    console.error('Erreur récupération versions:', error)
    return {
      error: error instanceof Error ? error.message : 'Erreur récupération versions',
    }
  }
}

/**
 * Restaurer une version antérieure d'un document
 */
export async function restoreKnowledgeDocumentVersionAction(
  documentId: string,
  versionId: string,
  reason?: string
) {
  try {
    const authCheck = await checkAdminAccess()
    if ('error' in authCheck) {
      return { error: authCheck.error }
    }

    const { restoreKnowledgeDocumentVersion } = await getKnowledgeBaseService()
    const result = await restoreKnowledgeDocumentVersion(
      documentId,
      versionId,
      authCheck.userId,
      reason
    )

    if (!result.success) {
      return { error: result.error || 'Erreur restauration' }
    }

    revalidatePath('/super-admin/knowledge-base')
    revalidatePath(`/super-admin/knowledge-base/${documentId}`)

    return { success: true, document: result.document }
  } catch (error) {
    console.error('Erreur restauration version:', error)
    return {
      error: error instanceof Error ? error.message : 'Erreur restauration',
    }
  }
}

/**
 * Récupérer les catégories disponibles
 */
export async function getKnowledgeCategoriesAction() {
  try {
    const authCheck = await checkAdminAccess()
    if ('error' in authCheck) {
      return { error: authCheck.error }
    }

    const result = await query(`
      SELECT id, parent_id, label_fr, label_ar, icon, sort_order
      FROM knowledge_categories
      ORDER BY sort_order, label_fr
    `)

    return { success: true, categories: result.rows }
  } catch (error) {
    console.error('Erreur récupération catégories:', error)
    return {
      error: error instanceof Error ? error.message : 'Erreur récupération catégories',
    }
  }
}

/**
 * Déclencher l'analyse qualité d'un document KB
 */
export async function analyzeKBDocumentQualityAction(documentId: string) {
  try {
    const authCheck = await checkAdminAccess()
    if ('error' in authCheck) {
      return { error: authCheck.error }
    }

    const { addToQueue } = await import('@/lib/ai/indexing-queue-service')
    await addToQueue('kb_quality_analysis', documentId, 7)

    return { success: true, message: 'Analyse qualité ajoutée à la queue' }
  } catch (error) {
    console.error('Erreur analyse qualité:', error)
    return {
      error: error instanceof Error ? error.message : 'Erreur analyse qualité',
    }
  }
}

/**
 * Récupérer les documents nécessitant une revue qualité
 */
export async function getKBDocumentsRequiringReviewAction(options?: {
  limit?: number
  offset?: number
}) {
  try {
    const authCheck = await checkAdminAccess()
    if ('error' in authCheck) {
      return { error: authCheck.error }
    }

    const { limit = 20, offset = 0 } = options || {}

    const result = await query(
      `SELECT id, title, category, quality_score, quality_requires_review, quality_assessed_at
       FROM knowledge_base
       WHERE quality_requires_review = true AND is_active = true
       ORDER BY quality_score ASC NULLS LAST
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    )

    const countResult = await query(
      `SELECT COUNT(*) FROM knowledge_base WHERE quality_requires_review = true AND is_active = true`
    )

    return {
      success: true,
      documents: result.rows,
      total: parseInt(countResult.rows[0].count) || 0,
    }
  } catch (error) {
    console.error('Erreur récupération documents revue:', error)
    return {
      error: error instanceof Error ? error.message : 'Erreur récupération documents',
    }
  }
}

/**
 * Actions groupées sur plusieurs documents
 */
export async function bulkKnowledgeDocumentAction(
  action: 'delete' | 'index' | 'change_category',
  documentIds: string[],
  options?: { category?: KnowledgeCategory; subcategory?: string }
) {
  try {
    const authCheck = await checkAdminAccess()
    if ('error' in authCheck) {
      return { error: authCheck.error }
    }

    if (!documentIds.length) {
      return { error: 'Aucun document sélectionné' }
    }

    const service = await getKnowledgeBaseService()
    const results: { id: string; success: boolean; error?: string }[] = []

    for (const id of documentIds) {
      try {
        switch (action) {
          case 'delete': {
            const deleted = await service.deleteKnowledgeDocument(id)
            results.push({ id, success: deleted, error: deleted ? undefined : 'Non trouvé' })
            break
          }
          case 'index': {
            const result = await service.indexKnowledgeDocument(id)
            results.push({ id, success: result.success, error: result.error })
            break
          }
          case 'change_category': {
            if (!options?.category) {
              results.push({ id, success: false, error: 'Catégorie requise' })
            } else {
              const doc = await service.updateKnowledgeDocument(id, {
                category: options.category,
                subcategory: options.subcategory,
              })
              results.push({ id, success: !!doc, error: doc ? undefined : 'Non trouvé' })
            }
            break
          }
        }
      } catch (err) {
        results.push({
          id,
          success: false,
          error: err instanceof Error ? err.message : 'Erreur',
        })
      }
    }

    revalidatePath('/super-admin/knowledge-base')

    const successCount = results.filter((r) => r.success).length
    const failCount = results.filter((r) => !r.success).length

    return {
      success: true,
      results,
      summary: {
        total: documentIds.length,
        succeeded: successCount,
        failed: failCount,
      },
    }
  } catch (error) {
    console.error('Erreur action groupée:', error)
    return {
      error: error instanceof Error ? error.message : 'Erreur action groupée',
    }
  }
}
