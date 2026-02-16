import { NextResponse } from 'next/server'
import { stopImpersonation } from '@/lib/auth/session'

export async function POST() {
  const result = await stopImpersonation()

  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 400 })
  }

  return NextResponse.json({ success: true, redirectUrl: '/super-admin/users' })
}
