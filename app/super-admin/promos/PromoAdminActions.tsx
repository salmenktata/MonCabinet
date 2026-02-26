'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Icons } from '@/lib/icons'
import { toast } from 'sonner'
import { togglePromoAction, deletePromoAction } from '@/app/actions/super-admin/promos'

interface PromoAdminActionsProps {
  promoId: string
  isActive: boolean
  usedCount: number
}

export function PromoAdminActions({ promoId, isActive, usedCount }: PromoAdminActionsProps) {
  const [loading, setLoading] = useState(false)

  async function handleToggle() {
    setLoading(true)
    const result = await togglePromoAction(promoId, !isActive)
    if (result.error) toast.error(result.error)
    else toast.success(isActive ? 'Code désactivé' : 'Code activé')
    setLoading(false)
  }

  async function handleDelete() {
    setLoading(true)
    const result = await deletePromoAction(promoId)
    if (result.error) toast.error(result.error)
    else toast.success(usedCount > 0 ? 'Code désactivé (déjà utilisé)' : 'Code supprimé')
    setLoading(false)
  }

  return (
    <div className="flex items-center gap-1">
      <Button
        variant="ghost"
        size="sm"
        onClick={handleToggle}
        disabled={loading}
        className={isActive ? 'text-yellow-400 hover:text-yellow-300' : 'text-emerald-400 hover:text-emerald-300'}
        title={isActive ? 'Désactiver' : 'Activer'}
      >
        {isActive ? <Icons.pause className="h-4 w-4" /> : <Icons.play className="h-4 w-4" />}
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={handleDelete}
        disabled={loading}
        className="text-red-400 hover:text-red-300"
        title="Supprimer"
      >
        <Icons.trash className="h-4 w-4" />
      </Button>
    </div>
  )
}
