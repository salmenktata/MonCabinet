/**
 * Page Super Admin - Détail d'un item de revue
 */

import { Suspense } from 'react'
import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { Icons } from '@/lib/icons'
import { getReviewItemDetails } from '@/app/actions/super-admin/content-review'
import { ReviewDetail } from '@/components/super-admin/content-review'
import { getSession } from '@/lib/auth/session'

export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{
    id: string
  }>
}

export default async function ReviewItemPage({ params }: PageProps) {
  const session = await getSession()

  if (!session?.user?.id) {
    redirect('/login')
  }

  const { id } = await params

  const { review, targetDetails } = await getReviewItemDetails(id)

  if (!review) {
    notFound()
  }

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm">
        <Link
          href="/super-admin/content-review"
          className="text-slate-400 hover:text-white flex items-center gap-1"
        >
          <Icons.chevronLeft className="h-4 w-4" />
          Retour à la queue
        </Link>
      </div>

      {/* Contenu */}
      <Suspense fallback={<div className="h-96 bg-slate-800 animate-pulse rounded-lg" />}>
        <ReviewDetail
          review={review}
          targetDetails={targetDetails}
          userId={session.user.id}
        />
      </Suspense>
    </div>
  )
}
