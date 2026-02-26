/**
 * POST /api/admin/cron/expire-trials
 *
 * L'expiration automatique par délai (14 jours) a été supprimée.
 * Le trial est désormais sans limite de temps — seules les limites fonctionnelles
 * s'appliquent (30 req IA, 10 dossiers, 20 clients).
 *
 * Cette route est conservée pour ne pas casser le cron VPS existant.
 * Elle est un no-op et retourne toujours expiredCount: 0.
 */

import { NextResponse } from 'next/server'
import { withAdminApiAuth } from '@/lib/auth/with-admin-api-auth'

export const POST = withAdminApiAuth(async () => {
  return NextResponse.json({
    success: true,
    expiredCount: 0,
    emailsSent: 0,
    message: 'Trial expiration by time is disabled — limits are usage-based only.',
    durationMs: 0,
  })
})
