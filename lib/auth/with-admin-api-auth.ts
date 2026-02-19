import { NextRequest, NextResponse } from 'next/server'
import { getSession, type Session } from '@/lib/auth/session'
import { verifyCronSecret } from '@/lib/auth/verify-cron-secret'

export type AdminApiHandler = (
  request: NextRequest,
  context: { params?: Promise<Record<string, string>> },
  session: Session | null
) => Promise<NextResponse>

interface WithAdminApiAuthOptions {
  /** Si true, accepte aussi CRON_SECRET en plus de la session admin */
  allowCronSecret?: boolean
}

/**
 * Wrapper pour protéger les routes /api/admin/*
 *
 * Vérifie :
 * - Session cookie → role === 'super_admin'
 * - OU si allowCronSecret: CRON_SECRET header (timing-safe)
 *
 * Usage:
 * ```ts
 * export const GET = withAdminApiAuth(async (req, ctx, session) => {
 *   return NextResponse.json({ ok: true })
 * })
 *
 * // Pour les routes cron qui acceptent aussi CRON_SECRET:
 * export const POST = withAdminApiAuth(async (req, ctx, session) => {
 *   // session peut être null si auth via CRON_SECRET
 *   return NextResponse.json({ ok: true })
 * }, { allowCronSecret: true })
 * ```
 */
export function withAdminApiAuth(
  handler: AdminApiHandler,
  options: WithAdminApiAuthOptions = {}
): (request: NextRequest, context?: any) => Promise<NextResponse> {
  return async (request: NextRequest, context: { params?: Promise<Record<string, string>> } = {}): Promise<NextResponse> => {
    // 1. Vérifier CRON_SECRET si autorisé
    if (options.allowCronSecret) {
      const authHeader = request.headers.get('authorization')
      const cronSecret = request.headers.get('x-cron-secret')
      const secretValue = cronSecret || authHeader

      if (verifyCronSecret(secretValue)) {
        return handler(request, context, null)
      }
    }

    // 2. Vérifier la session admin
    try {
      const session = await getSession()

      if (!session?.user?.id) {
        return NextResponse.json(
          { success: false, error: 'Non authentifié' },
          { status: 401 }
        )
      }

      if (session.user.role !== 'super_admin') {
        return NextResponse.json(
          { success: false, error: 'Accès non autorisé' },
          { status: 403 }
        )
      }

      return handler(request, context, session)
    } catch {
      return NextResponse.json(
        { success: false, error: 'Erreur d\'authentification' },
        { status: 401 }
      )
    }
  }
}
