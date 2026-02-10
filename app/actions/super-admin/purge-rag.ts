'use server'

import { query } from '@/lib/db/postgres'
import { getSession } from '@/lib/auth/session'
import { revalidatePath } from 'next/cache'
import { purgeAllRAGData, getRAGStats, PurgeOptions, PurgeStats, PurgeResult, normalizePurgeOptions } from '@/lib/ai/purge-service'

// =============================================================================
// CONSTANTES
// =============================================================================

const CONFIRMATION_TEXT = 'PURGE'
const SECURITY_DELAY_MS = 5000 // 5 secondes de délai de sécurité

// =============================================================================
// TYPES
// =============================================================================

export type { PurgeOptions, PurgeStats, PurgeResult }

// =============================================================================
// VÉRIFICATION SUPER ADMIN
// =============================================================================

async function checkSuperAdminAccess(): Promise<{ adminId: string; adminEmail: string } | { error: string }> {
  const session = await getSession()
  if (!session?.user?.id) {
    return { error: 'Non authentifié' }
  }

  const result = await query('SELECT id, email, role FROM users WHERE id = $1', [session.user.id])
  const user = result.rows[0]

  if (!user || user.role !== 'super_admin') {
    return { error: 'Accès réservé aux super administrateurs' }
  }

  return { adminId: user.id, adminEmail: user.email }
}

// =============================================================================
// AUDIT LOG
// =============================================================================

async function createAuditLog(
  adminId: string,
  adminEmail: string,
  actionType: string,
  targetType: string,
  targetId: string,
  targetIdentifier: string,
  oldValue?: Record<string, unknown>,
  newValue?: Record<string, unknown>
) {
  await query(
    `INSERT INTO admin_audit_logs
     (admin_id, admin_email, action_type, target_type, target_id, target_identifier, old_value, new_value)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      adminId,
      adminEmail,
      actionType,
      targetType,
      targetId,
      targetIdentifier,
      oldValue ? JSON.stringify(oldValue) : null,
      newValue ? JSON.stringify(newValue) : null
    ]
  )
}

// =============================================================================
// ACTIONS
// =============================================================================

/**
 * Récupère les statistiques RAG actuelles
 */
export async function getRAGStatsAction(): Promise<{ stats: PurgeStats } | { error: string }> {
  try {
    const authCheck = await checkSuperAdminAccess()
    if ('error' in authCheck) {
      return { error: authCheck.error }
    }

    const stats = await getRAGStats()
    return { stats }
  } catch (error) {
    console.error('Erreur récupération stats RAG:', error)
    return { error: 'Erreur lors de la récupération des statistiques' }
  }
}

/**
 * Retourne un résultat d'erreur formaté
 */
function errorResult(error: string): PurgeResult & { error: string } {
  return {
    success: false,
    stats: {
      knowledgeBase: { documents: 0, chunks: 0, versions: 0 },
      webSources: { sources: 0, pages: 0, files: 0, crawlJobs: 0, crawlLogs: 0 },
      contentReview: { reviewQueue: 0, qualityAssessments: 0, classifications: 0, contradictions: 0 },
      storage: { knowledgeBaseFiles: 0, webFiles: 0 },
    },
    deletedAt: new Date(),
    error,
  }
}

/**
 * Purge sélective des données RAG
 *
 * Sécurités:
 * - Rôle super_admin uniquement
 * - Double confirmation (checkbox + texte "PURGE")
 * - Délai de sécurité de 5 secondes
 * - Transaction tout ou rien
 * - Audit log avec options sélectionnées
 */
export async function purgeRAGAction(
  confirmText: string,
  hasConfirmedCheckbox: boolean,
  options?: PurgeOptions
): Promise<PurgeResult & { error?: string }> {
  try {
    // 1. Vérifier rôle super_admin
    const authCheck = await checkSuperAdminAccess()
    if ('error' in authCheck) {
      return errorResult(authCheck.error)
    }

    // 2. Vérifier confirmation checkbox
    if (!hasConfirmedCheckbox) {
      return errorResult('Vous devez cocher la case de confirmation')
    }

    // 3. Vérifier confirmation texte
    if (confirmText !== CONFIRMATION_TEXT) {
      return errorResult(`Texte de confirmation incorrect. Tapez exactement: ${CONFIRMATION_TEXT}`)
    }

    // 4. Normaliser les options (forcer dépendances FK)
    const normalizedOptions = options ? normalizePurgeOptions(options) : undefined

    // 5. Vérifier qu'au moins une option est sélectionnée
    if (normalizedOptions) {
      const hasSomethingToPurge = Object.entries(normalizedOptions).some(
        ([key, value]) => key.startsWith('purge') && value === true
      )
      if (!hasSomethingToPurge) {
        return errorResult('Vous devez sélectionner au moins un élément à purger')
      }
    }

    // 6. Délai de sécurité (simulation côté serveur)
    await new Promise((resolve) => setTimeout(resolve, SECURITY_DELAY_MS))

    // 7. Collecter statistiques avant purge (pour l'audit)
    const statsBefore = await getRAGStats()

    // 8. Exécuter la purge
    console.log('🔄 Options de purge normalisées:', JSON.stringify(normalizedOptions, null, 2))
    const result = await purgeAllRAGData(normalizedOptions)
    console.log('📊 Résultat purge:', JSON.stringify({ success: result.success, errors: result.errors, deletedCounts: result.deletedCounts }, null, 2))

    // 9. Enregistrer audit log avec détails des options
    if (result.success) {
      await createAuditLog(
        authCheck.adminId,
        authCheck.adminEmail,
        'rag_purge_selective',
        'system',
        authCheck.adminId, // Utiliser l'ID de l'admin au lieu de 'rag_data'
        'Purge sélective RAG',
        {
          knowledgeBase: statsBefore.knowledgeBase,
          webSources: statsBefore.webSources,
          storage: statsBefore.storage,
        },
        {
          purgedAt: result.deletedAt.toISOString(),
          options: normalizedOptions,
          deletedCounts: result.deletedCounts,
        }
      )
    }

    // 10. Revalider les chemins concernés
    revalidatePath('/super-admin/knowledge-base')
    revalidatePath('/super-admin/web-sources')
    revalidatePath('/super-admin/content-review')
    revalidatePath('/super-admin/dashboard')
    revalidatePath('/super-admin/settings')

    return result
  } catch (error) {
    console.error('Erreur purge RAG:', error)
    const errorMessage = error instanceof Error ? error.message : 'Erreur inconnue'
    return errorResult(`Erreur lors de la purge: ${errorMessage}`)
  }
}

