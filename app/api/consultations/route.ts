import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { getConsultationHistory, getConsultationById } from '@/app/actions/consultation'

export async function GET(request: NextRequest) {
  const session = await getSession()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')

  if (id) {
    const result = await getConsultationById(id)
    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 404 })
    }
    return NextResponse.json(result.data)
  }

  const limit = parseInt(searchParams.get('limit') || '50', 10)
  const result = await getConsultationHistory(limit)
  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 500 })
  }
  return NextResponse.json(result.data)
}
