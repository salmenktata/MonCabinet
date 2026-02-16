'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { stopImpersonationAction } from '@/app/actions/super-admin/impersonation'

interface ImpersonationStatus {
  isImpersonating: boolean
  originalAdmin?: { email: string; name: string }
  targetUser?: { email: string; name: string }
}

export function ImpersonationBanner() {
  const router = useRouter()
  const [status, setStatus] = useState<ImpersonationStatus | null>(null)
  const [stopping, setStopping] = useState(false)

  useEffect(() => {
    fetch('/api/auth/impersonation-status')
      .then(res => res.json())
      .then(data => setStatus(data))
      .catch(() => setStatus(null))
  }, [])

  if (!status?.isImpersonating) return null

  const handleStop = async () => {
    setStopping(true)
    try {
      const result = await stopImpersonationAction()
      if (!result.error) {
        router.push('/super-admin/users')
        router.refresh()
      }
    } finally {
      setStopping(false)
    }
  }

  return (
    <div className="fixed top-0 left-0 right-0 z-[9999] bg-red-600 text-white px-4 py-2 flex items-center justify-center gap-4 text-sm shadow-lg">
      <span className="font-medium">
        Impersonation active : vous voyez l&apos;application en tant que{' '}
        <strong>{status.targetUser?.name || status.targetUser?.email}</strong>
      </span>
      <button
        onClick={handleStop}
        disabled={stopping}
        className="px-3 py-1 bg-white text-red-600 rounded font-medium hover:bg-red-50 transition-colors disabled:opacity-50"
      >
        {stopping ? 'Arrêt...' : 'Arrêter l\'impersonation'}
      </button>
    </div>
  )
}
