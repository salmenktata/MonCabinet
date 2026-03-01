import { NextResponse } from 'next/server'
import { withAdminApiAuth } from '@/lib/auth/with-admin-api-auth'
import { getDocumentVersionHistory } from '@/lib/kb/document-version-tracker'

export const GET = withAdminApiAuth(async (_req, ctx) => {
  const { id } = await ctx.params!
  const versions = await getDocumentVersionHistory(id, 20)
  return NextResponse.json({ versions })
}, { allowCronSecret: true })
