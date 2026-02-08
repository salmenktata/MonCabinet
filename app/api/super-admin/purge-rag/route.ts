import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { query } from '@/lib/db/postgres'
import { purgeAllRAGData, getRAGStats, PurgeOptions, normalizePurgeOptions, getDefaultPurgeOptions } from '@/lib/ai/purge-service'

const CONFIRMATION_TEXT = 'PURGE'

/**
 * Vérifie l'accès super admin
 */
async function checkSuperAdminAccess(): Promise<{ adminId: string; adminEmail: string } | null> {
  const session = await getSession()
  if (!session?.user?.id) {
    return null
  }

  const result = await query('SELECT id, email, role FROM users WHERE id = $1', [session.user.id])
  const user = result.rows[0]

  if (!user || user.role !== 'super_admin') {
    return null
  }

  return { adminId: user.id, adminEmail: user.email }
}

/**
 * Enregistre un audit log
 */
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

/**
 * GET /api/super-admin/purge-rag
 * Récupère les statistiques RAG actuelles
 */
export async function GET() {
  try {
    const auth = await checkSuperAdminAccess()
    if (!auth) {
      return NextResponse.json(
        { error: 'Accès réservé aux super administrateurs' },
        { status: 403 }
      )
    }

    const stats = await getRAGStats()
    return NextResponse.json({ stats })
  } catch (error) {
    console.error('Erreur GET /api/super-admin/purge-rag:', error)
    return NextResponse.json(
      { error: 'Erreur serveur' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/super-admin/purge-rag
 * Exécute la purge sélective des données RAG
 *
 * Body:
 * {
 *   "confirm": "PURGE",
 *   "options": {
 *     "purgeDocuments": true,
 *     "purgeChunks": true,
 *     "purgeVersions": true,
 *     "purgeCategories": false,
 *     "purgeKBFiles": true,
 *     "purgeSources": true,
 *     "purgePages": true,
 *     "purgeWebFiles": true,
 *     "purgeCrawlLogs": true,
 *     "purgeCrawlJobs": true,
 *     "purgeWebMinIO": true
 *   }
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await checkSuperAdminAccess()
    if (!auth) {
      return NextResponse.json(
        { error: 'Accès réservé aux super administrateurs' },
        { status: 403 }
      )
    }

    const body = await request.json()
    const { confirm, options } = body as {
      confirm?: string
      options?: PurgeOptions
    }

    // Vérifier la confirmation
    if (confirm !== CONFIRMATION_TEXT) {
      return NextResponse.json(
        {
          error: `Confirmation requise. Envoyez: { "confirm": "${CONFIRMATION_TEXT}" }`,
        },
        { status: 400 }
      )
    }

    // Utiliser les options par défaut si non spécifiées
    const purgeOptions = options || getDefaultPurgeOptions()

    // Normaliser les options (gérer les dépendances FK)
    const normalizedOptions = normalizePurgeOptions(purgeOptions)

    // Collecter les stats avant purge
    const statsBefore = await getRAGStats()

    // Exécuter la purge
    const result = await purgeAllRAGData(normalizedOptions)

    // Enregistrer l'audit log
    if (result.success) {
      await createAuditLog(
        auth.adminId,
        auth.adminEmail,
        'rag_purge_selective_api',
        'system',
        'rag_data',
        'Purge sélective RAG (API)',
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

    return NextResponse.json({
      success: result.success,
      deletedAt: result.deletedAt,
      statsBefore: result.stats,
      deletedCounts: result.deletedCounts,
      errors: result.errors,
    })
  } catch (error) {
    console.error('Erreur POST /api/super-admin/purge-rag:', error)
    return NextResponse.json(
      { error: 'Erreur serveur lors de la purge' },
      { status: 500 }
    )
  }
}
