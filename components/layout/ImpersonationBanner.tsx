'use client'

import { useEffect, useState } from 'react'
import { stopImpersonationAction } from '@/app/actions/super-admin/impersonation'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

interface ImpersonationStatus {
  isImpersonating: boolean
  originalAdmin?: { email: string; name: string; id: string }
  targetUser?: { email: string; name: string; id: string }
  startedAt?: number
  expired?: boolean
}

export function ImpersonationBanner() {
  const [status, setStatus] = useState<ImpersonationStatus | null>(null)
  const [stopping, setStopping] = useState(false)
  const [elapsedSeconds, setElapsedSeconds] = useState(0)


  useEffect(() => {
    fetch('/api/auth/impersonation-status')
      .then(res => res.json())
      .then(data => {
        setStatus(data)
        if (data.startedAt) {
          // Calculer le temps écoulé initial
          const elapsed = Math.floor((Date.now() - data.startedAt) / 1000)
          setElapsedSeconds(elapsed)
        }
      })
      .catch(() => setStatus(null))
  }, [])

  useEffect(() => {
    if (!status?.isImpersonating || !status.startedAt) return

    // Timer incrémente chaque seconde
    const interval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - status.startedAt!) / 1000)
      setElapsedSeconds(elapsed)

      // Alerte si > 1h45 (6300 secondes = 105 minutes)
      // Toaster seulement aux minutes rondes pour éviter spam
      if (elapsed === 6300) {
        toast.error('Impersonnalisation longue \u2014 Session active depuis plus de 1h45. Arr\u00eat automatique dans 15 minutes.')
      }

      // Alerte finale à 1h58 (7080 secondes)
      if (elapsed === 7080) {
        toast.error('Expiration imminente \u2014 Arr\u00eat automatique dans 2 minutes !')
      }
    }, 1000)

    return () => clearInterval(interval)
  }, [status])

  if (!status?.isImpersonating) return null

  const handleStop = async () => {
    setStopping(true)
    try {
      const result = await stopImpersonationAction()
      if (!result.error) {
        // Forcer un rechargement complet pour appliquer les cookies restaurés
        window.location.replace('/super-admin/users')
      } else {
        toast.error(result.error)
      }
    } finally {
      setStopping(false)
    }
  }

  // Calculs pour affichage
  const TOTAL_DURATION = 2 * 60 * 60 // 2 heures en secondes
  const minutes = Math.floor(elapsedSeconds / 60)
  const seconds = elapsedSeconds % 60
  const percentage = Math.min(100, (elapsedSeconds / TOTAL_DURATION) * 100)
  const isWarning = percentage > 75 // > 1h30

  return (
    <div className="sticky top-0 z-[9999] bg-red-600 text-white shadow-lg">
      <div className="px-4 py-2 flex items-center justify-center gap-4 text-sm">
        <span className="font-medium">
          Impersonation active : {status.targetUser?.name || status.targetUser?.email}
        </span>
        <span className={cn(
          "font-mono font-bold",
          isWarning && "animate-pulse text-yellow-300"
        )}>
          ⏱️ {minutes}m {seconds.toString().padStart(2, '0')}s
        </span>
        <button
          onClick={handleStop}
          disabled={stopping}
          className="px-3 py-1 bg-white text-red-600 rounded font-medium hover:bg-red-50 transition-colors disabled:opacity-50"
        >
          {stopping ? 'Arrêt...' : 'Arrêter'}
        </button>
      </div>

      {/* Barre de progression */}
      {isWarning && (
        <div className="w-full bg-red-800 h-1">
          <div
            className="h-full bg-yellow-400 transition-all duration-1000"
            style={{ width: `${percentage}%` }}
          />
        </div>
      )}
    </div>
  )
}
