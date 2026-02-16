import { NextResponse } from 'next/server'
import { getImpersonationStatus } from '@/lib/auth/session'

export async function GET() {
  const status = await getImpersonationStatus()
  return NextResponse.json(status)
}
