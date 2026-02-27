'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Icons } from '@/lib/icons'
import { toast } from 'sonner'

export function SendRecapButton() {
  const [loading, setLoading] = useState(false)

  const handleSend = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/cron/weekly-recap', { method: 'POST' })
      const data = await res.json()
      if (res.ok && data.success) {
        toast.success(`Récapitulatif envoyé (${data.emailsSent} email${data.emailsSent !== 1 ? 's' : ''})`)
      } else {
        toast.error('Erreur lors de l\'envoi')
      }
    } catch {
      toast.error('Impossible de contacter le serveur')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleSend}
      disabled={loading}
      className="gap-2"
    >
      {loading ? (
        <Icons.loader className="h-4 w-4 animate-spin" />
      ) : (
        <Icons.mail className="h-4 w-4" />
      )}
      Recevoir par email
    </Button>
  )
}
