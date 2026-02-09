/**
 * Page Super Admin - Ajouter une source web
 * Wizard en 3 étapes pour configurer une nouvelle source
 */

import nextDynamic from 'next/dynamic'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Icons } from '@/lib/icons'
import { Skeleton } from '@/components/ui/skeleton'

// Lazy load du wizard (929 lignes) pour alléger le bundle initial
const AddWebSourceWizard = nextDynamic(
  () => import('@/components/super-admin/web-sources/AddWebSourceWizard').then(mod => ({ default: mod.AddWebSourceWizard })),
  {
    loading: () => (
      <div className="space-y-6">
        <Skeleton className="h-64 w-full" />
        <div className="flex gap-4">
          <Skeleton className="h-10 w-24" />
          <Skeleton className="h-10 w-24" />
        </div>
      </div>
    )
  }
)

export const dynamic = 'force-dynamic'

export default function NewWebSourcePage() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/super-admin/web-sources">
          <Button variant="ghost" size="sm" className="text-slate-400">
            <Icons.arrowLeft className="h-4 w-4 mr-2" />
            Retour
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-white">Ajouter une source web</h1>
          <p className="text-slate-400 mt-1">
            Configurez une nouvelle source pour l'ingestion automatique
          </p>
        </div>
      </div>

      {/* Wizard */}
      <AddWebSourceWizard />
    </div>
  )
}
