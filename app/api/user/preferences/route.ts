import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { query } from '@/lib/db/postgres'

export const dynamic = 'force-dynamic'

// Clés autorisées pour éviter toute injection de données arbitraires
const ALLOWED_KEYS = ['dashboard-sidebar-collapsed', 'super-admin-sidebar-collapsed', 'chat-history-collapsed']

export async function PATCH(request: Request) {
  const session = await getSession()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Body invalide' }, { status: 400 })
  }

  // Filtrer uniquement les clés autorisées
  const filtered: Record<string, boolean> = {}
  for (const key of ALLOWED_KEYS) {
    if (key in body && typeof body[key] === 'boolean') {
      filtered[key] = body[key] as boolean
    }
  }

  if (Object.keys(filtered).length === 0) {
    return NextResponse.json({ error: 'Aucune préférence valide' }, { status: 400 })
  }

  await query(
    'UPDATE users SET ui_preferences = COALESCE(ui_preferences, \'{}\'::jsonb) || $1::jsonb WHERE id = $2',
    [JSON.stringify(filtered), session.user.id]
  )

  return NextResponse.json({ success: true })
}
