import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { sendDailyDigestNotifications } from '@/lib/notifications/daily-digest-service'
import { isBrevoConfigured } from '@/lib/email/brevo-client'

export const dynamic = 'force-dynamic'
export const maxDuration = 300 // 5 minutes max

/**
 * POST /api/admin/trigger-daily-digest
 * Déclenche manuellement l'envoi des notifications quotidiennes
 */
export async function POST() {
  try {
    // Vérifier authentification super admin
    const session = await getSession()
    if (!session?.user || session.user.role !== 'super_admin') {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
    }

    // Vérifier config Brevo
    if (!isBrevoConfigured()) {
      return NextResponse.json(
        { error: 'BREVO_API_KEY non configuré' },
        { status: 500 }
      )
    }

    console.log('[API Trigger Daily Digest] Déclenchement manuel par', session.user.email)

    // Exécuter le service
    const stats = await sendDailyDigestNotifications()

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      stats: {
        totalUsers: stats.totalUsers,
        emailsSent: stats.emailsSent,
        emailsFailed: stats.emailsFailed,
        duration: `${stats.duration}ms`,
      },
      errors: stats.errors.length > 0 ? stats.errors : undefined,
    })
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Erreur inconnue'
    console.error('[API Trigger Daily Digest] Erreur:', errorMessage)

    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    )
  }
}
