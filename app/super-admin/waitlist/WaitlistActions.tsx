'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'

// Bouton "Tout inviter" (bulk)
function InviteAllButton({ pendingIds }: { pendingIds: string[] }) {
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  if (pendingIds.length === 0) return null

  const handleInviteAll = async () => {
    if (!confirm(`Envoyer une invitation à ${pendingIds.length} personne(s) en attente ?`)) return
    setLoading(true)

    try {
      const res = await fetch('/api/admin/waitlist/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inviteAll: true }),
      })
      const data = await res.json()

      if (!res.ok) {
        toast.error(data.error || 'Erreur lors de l\'envoi')
        return
      }

      toast.success(`${data.sent}/${data.total} invitation(s) envoyée(s)`)
      router.refresh()
    } catch {
      toast.error('Erreur réseau')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Button
      onClick={handleInviteAll}
      disabled={loading}
      size="sm"
      className="bg-blue-600 hover:bg-blue-500 text-white"
    >
      {loading ? 'Envoi...' : `Tout inviter (${pendingIds.length})`}
    </Button>
  )
}

// Bouton "Inviter" individuel
function InviteButton({ waitlistId, email, name }: { waitlistId: string; email: string; name: string }) {
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  const router = useRouter()

  const handleInvite = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/waitlist/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ waitlistIds: [waitlistId] }),
      })
      const data = await res.json()

      if (!res.ok || data.sent === 0) {
        toast.error(data.error || 'Échec d\'envoi')
        return
      }

      toast.success(`Invitation envoyée à ${name}`)
      setDone(true)
      router.refresh()
    } catch {
      toast.error('Erreur réseau')
    } finally {
      setLoading(false)
    }
  }

  if (done) return <span className="text-xs text-emerald-400">Envoyé ✓</span>

  return (
    <button
      onClick={handleInvite}
      disabled={loading}
      className="text-xs bg-blue-600/20 hover:bg-blue-600/40 text-blue-400 border border-blue-600/30 px-3 py-1 rounded-lg transition-colors disabled:opacity-50"
      title={`Inviter ${email}`}
    >
      {loading ? '...' : 'Inviter'}
    </button>
  )
}

// Export composant composite
export function WaitlistActions({ pendingIds }: { pendingIds: string[] }) {
  return <InviteAllButton pendingIds={pendingIds} />
}

WaitlistActions.InviteButton = InviteButton
