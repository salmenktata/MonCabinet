import { getErrorMessage } from '@/lib/utils/error-utils'
import { NextResponse } from 'next/server'
import { listApiKeys } from '@/lib/api-keys/api-keys-service'
import { withAdminApiAuth } from '@/lib/auth/with-admin-api-auth'

/**
 * GET /api/admin/api-keys
 * Liste toutes les clés API (masquées) depuis la base de données
 */
export const GET = withAdminApiAuth(async (_request, _ctx, _session) => {
  try {
    const keys = await listApiKeys()

    return NextResponse.json({
      success: true,
      keys: keys.map(key => ({
        id: key.id,
        provider: key.provider,
        label: key.label,
        apiKeyMasked: key.apiKeyMasked,
        modelDefault: key.modelDefault,
        tier: key.tier,
        isActive: key.isActive,
        isPrimary: key.isPrimary,
        lastUsedAt: key.lastUsedAt,
        lastError: key.lastError,
        errorCount: key.errorCount,
        rpmLimit: key.rpmLimit,
        monthlyQuota: key.monthlyQuota,
        createdAt: key.createdAt,
        updatedAt: key.updatedAt,
      }))
    })
  } catch (error) {
    console.error('[API] Erreur listage clés API:', error)
    return NextResponse.json(
      { success: false, error: getErrorMessage(error) },
      { status: 500 }
    )
  }
})
