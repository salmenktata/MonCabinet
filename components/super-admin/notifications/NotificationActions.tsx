'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Icons } from '@/lib/icons'
import { toast } from 'sonner'
import { markAllNotificationsReadAction } from '@/app/actions/super-admin/notifications'

interface NotificationActionsProps {
  unreadCount: number
  adminId: string
}

export function NotificationActions({ unreadCount, adminId }: NotificationActionsProps) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  const handleMarkAllRead = async () => {
    setLoading(true)
    try {
      const result = await markAllNotificationsReadAction()
      if (result.error) {
        toast.error(result.error)
      } else {
        toast.success(`Notifications lues — ${result.count} notifications marquées comme lues`)
        router.refresh()
      }
    } catch {
      toast.error('Une erreur est survenue')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Button
      onClick={handleMarkAllRead}
      disabled={loading || unreadCount === 0}
      variant="outline"
      className="border-slate-600 text-slate-300 hover:bg-slate-700"
    >
      {loading ? (
        <Icons.loader className="h-4 w-4 mr-2 animate-spin" />
      ) : (
        <Icons.checkCircle className="h-4 w-4 mr-2" />
      )}
      Tout marquer comme lu
    </Button>
  )
}
