/**
 * Page : Pipeline Status
 * /super-admin/pipeline-status
 *
 * Dashboard complet de tracking et re-trigger du pipeline documents KB
 */

import { Metadata } from 'next'
import { getSession } from '@/lib/auth/session'
import { redirect } from 'next/navigation'
import PipelineStatusClient from './PipelineStatusClient'

export const metadata: Metadata = {
  title: 'Pipeline Documents - Qadhya',
  description: 'Tracking et re-trigger du pipeline de traitement des documents KB',
}

export default async function PipelineStatusPage() {
  const session = await getSession()

  // Vérification authentification et rôle (admin ou super_admin)
  const allowedRoles = ['admin', 'super_admin']
  if (!session?.user?.role || !allowedRoles.includes(session.user.role)) {
    redirect('/login')
  }

  return <PipelineStatusClient />
}
