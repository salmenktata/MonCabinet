'use client'

/**
 * Modal de confirmation pour déclencher un cron manuellement
 */

import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Play, AlertTriangle, Loader2 } from 'lucide-react'

interface CronTriggerModalProps {
  isOpen: boolean
  onClose: () => void
  cronName: string
  description: string
  estimatedDuration: number
  onSuccess?: () => void
}

export function CronTriggerModal({
  isOpen,
  onClose,
  cronName,
  description,
  estimatedDuration,
  onSuccess,
}: CronTriggerModalProps) {
  const [isTriggering, setIsTriggering] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const formatDuration = (ms: number) => {
    if (ms < 1000) return `${ms}ms`
    if (ms < 60000) return `${(ms / 1000).toFixed(0)}s`
    return `${(ms / 60000).toFixed(1)}min`
  }

  const handleTrigger = async () => {
    setIsTriggering(true)
    setError(null)
    setSuccess(false)

    try {
      const response = await fetch('/api/admin/cron-executions/trigger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cronName }),
      })

      const data = await response.json()

      if (!response.ok) {
        if (response.status === 409) {
          throw new Error('Ce cron est déjà en cours d\'exécution. Attendez sa fin.')
        }
        throw new Error(data.error || 'Erreur lors du déclenchement')
      }

      setSuccess(true)

      // Wait 2 seconds to show success message, then close
      setTimeout(() => {
        onSuccess?.()
        onClose()
        setSuccess(false)
      }, 2000)
    } catch (err: any) {
      setError(err.message || 'Une erreur est survenue')
    } finally {
      setIsTriggering(false)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Play className="h-5 w-5 text-primary" />
            Déclencher Manuellement
          </DialogTitle>
          <DialogDescription>
            Vous êtes sur le point d'exécuter ce cron manuellement.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Cron Info */}
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="font-medium text-muted-foreground">Nom :</span>
              <span className="font-mono">{cronName}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="font-medium text-muted-foreground">Description :</span>
              <span>{description}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="font-medium text-muted-foreground">Durée estimée :</span>
              <span className="font-mono">{formatDuration(estimatedDuration)}</span>
            </div>
          </div>

          {/* Warning */}
          {!success && !error && (
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                L'exécution sera asynchrone. Rafraîchissez la page dans quelques secondes pour
                voir les résultats.
              </AlertDescription>
            </Alert>
          )}

          {/* Error */}
          {error && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* Success */}
          {success && (
            <Alert className="border-green-500 bg-green-50 text-green-900">
              <AlertDescription className="flex items-center gap-2">
                <span className="text-xl">✅</span>
                <span>Cron démarré avec succès !</span>
              </AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isTriggering}>
            Annuler
          </Button>
          <Button
            onClick={handleTrigger}
            disabled={isTriggering || success}
            className="gap-2"
          >
            {isTriggering ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Démarrage...
              </>
            ) : success ? (
              <>
                <span className="text-lg">✅</span>
                Démarré
              </>
            ) : (
              <>
                <Play className="h-4 w-4" />
                Exécuter Maintenant
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
