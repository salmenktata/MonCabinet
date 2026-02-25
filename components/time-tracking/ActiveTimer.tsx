'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { stopTimerAction } from '@/app/actions/time-entries'
import { Button } from '@/components/ui/button'
import { Icons } from '@/lib/icons'
import type { ActiveTimer as ActiveTimerType } from '@/types/time-tracking'

interface ActiveTimerProps {
  timer: ActiveTimerType
}

function formatTime(seconds: number): string {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const secs = seconds % 60
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
}

export default function ActiveTimer({ timer: initialTimer }: ActiveTimerProps) {
  const router = useRouter()
  const [timer, setTimer] = useState<ActiveTimerType | null>(initialTimer)
  const [elapsed, setElapsed] = useState(0)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!timer) return

    const start = new Date(`${timer.date}T${timer.heure_debut}`)
    const now = new Date()
    setElapsed(Math.floor((now.getTime() - start.getTime()) / 1000))

    const interval = setInterval(() => setElapsed((prev) => prev + 1), 1000)
    return () => clearInterval(interval)
  }, [timer])

  const handleStop = async () => {
    if (!timer) return
    setLoading(true)
    const result = await stopTimerAction(timer.id)
    if (result.error) {
      toast.error(result.error)
      setLoading(false)
      return
    }
    toast.success('Timer arrêté')
    setTimer(null)
    router.refresh()
  }

  if (!timer) return null

  const clientName = timer.dossiers?.clients
    ? timer.dossiers.clients.type_client === 'PERSONNE_PHYSIQUE'
      ? `${timer.dossiers.clients.nom} ${timer.dossiers.clients.prenom || ''}`.trim()
      : timer.dossiers.clients.nom
    : ''

  return (
    <div className="rounded-xl border-2 border-orange-300 bg-orange-50 dark:bg-orange-950/20 dark:border-orange-800 p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <div className="h-2.5 w-2.5 rounded-full bg-red-500 animate-pulse shrink-0" />
            <span className="text-xs font-semibold text-orange-800 dark:text-orange-300 uppercase tracking-wide">
              Timer en cours
            </span>
          </div>

          <h3 className="text-sm font-semibold text-foreground">{timer.description}</h3>

          <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
            <Icons.dossiers className="h-3 w-3 shrink-0" />
            <span className="truncate">
              {timer.dossiers?.numero}
              {clientName ? ` — ${clientName}` : ''}
            </span>
          </div>

          <div className="mt-2 flex items-center gap-3">
            <span className="text-2xl font-mono font-bold text-orange-700 dark:text-orange-400">
              {formatTime(elapsed)}
            </span>
            <span className="text-xs text-muted-foreground">Démarré à {timer.heure_debut}</span>
          </div>
        </div>

        <Button
          variant="destructive"
          size="sm"
          onClick={handleStop}
          disabled={loading}
          className="shrink-0"
        >
          {loading ? (
            <Icons.loader className="mr-1.5 h-4 w-4 animate-spin" />
          ) : (
            <Icons.pause className="mr-1.5 h-4 w-4" />
          )}
          Arrêter
        </Button>
      </div>
    </div>
  )
}
