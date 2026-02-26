import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { query } from '@/lib/db/postgres'
import { PLAN_LIMITS, type PlanType } from '@/lib/plans/plan-config'

export const dynamic = 'force-dynamic'

export async function GET() {
  const session = await getSession()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }

  const userId = session.user.id

  const [userRow, dossiersRow, clientsRow] = await Promise.all([
    query('SELECT plan, trial_ai_uses_remaining FROM users WHERE id = $1', [userId]),
    query('SELECT COUNT(*) AS count FROM dossiers WHERE user_id = $1', [userId]),
    query('SELECT COUNT(*) AS count FROM clients WHERE user_id = $1', [userId]),
  ])

  const plan = (userRow.rows[0]?.plan ?? 'trial') as PlanType
  const limits = PLAN_LIMITS[plan]

  return NextResponse.json({
    plan,
    maxDossiers: limits.maxDossiers === Infinity ? -1 : limits.maxDossiers,
    maxClients: limits.maxClients === Infinity ? -1 : limits.maxClients,
    currentDossiers: parseInt(dossiersRow.rows[0]?.count || '0', 10),
    currentClients: parseInt(clientsRow.rows[0]?.count || '0', 10),
    aiUsesRemaining: userRow.rows[0]?.trial_ai_uses_remaining ?? null,
    aiUsesTotal: limits.aiUsesTotal ?? null,
  })
}
