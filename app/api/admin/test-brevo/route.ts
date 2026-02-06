import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { sendTestEmail, isBrevoConfigured } from '@/lib/email/brevo-client'

export const dynamic = 'force-dynamic'

/**
 * POST /api/admin/test-brevo
 * Envoie un email de test via Brevo
 */
export async function POST() {
  try {
    // Vérifier authentification admin
    const session = await getSession()
    if (!session?.user || !['admin', 'super_admin'].includes(session.user.role || '')) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
    }

    // Vérifier config Brevo
    if (!isBrevoConfigured()) {
      return NextResponse.json(
        { error: 'BREVO_API_KEY non configuré' },
        { status: 500 }
      )
    }

    // Envoyer email de test à l'admin connecté
    const result = await sendTestEmail(session.user.email)

    if (result.success) {
      return NextResponse.json({
        success: true,
        message: `Email de test envoyé à ${session.user.email}`,
        messageId: result.messageId,
      })
    } else {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 500 }
      )
    }
  } catch (error) {
    console.error('[API Test Brevo] Erreur:', error)
    return NextResponse.json(
      { error: 'Erreur serveur' },
      { status: 500 }
    )
  }
}
