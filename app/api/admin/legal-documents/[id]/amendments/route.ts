import { NextResponse } from 'next/server'
import { withAdminApiAuth } from '@/lib/auth/with-admin-api-auth'
import { getDocumentAmendments } from '@/lib/legal-documents/document-service'

export const GET = withAdminApiAuth(async (_req, ctx) => {
  const { id } = await ctx.params!
  const amendments = await getDocumentAmendments(id)
  return NextResponse.json({ amendments })
}, { allowCronSecret: true })
