'use client'

/**
 * Modal pour planifier un cron à une date/heure future
 * Phase 6.1: Scheduling Custom
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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Calendar } from 'lucide-react'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'

interface CronScheduleModalProps {
  isOpen: boolean
  onClose: () => void
  cronName: string
  description: string
  parameters?: Record<string, any>
  onSuccess?: () => void
}

export function CronScheduleModal({
  isOpen,
  onClose,
  cronName,
  description,
  parameters = {},
  onSuccess,
}: CronScheduleModalProps) {
  const [isScheduling, setIsScheduling] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  // Date et heure séparées pour simplifier l'UX
  const [selectedDate, setSelectedDate] = useState<string>('')
  const [selectedTime, setSelectedTime] = useState<string>('')

  const handleSchedule = async () => {
    setIsScheduling(true)
    setError(null)
    setSuccess(false)

    try {
      // Validation
      if (!selectedDate) {
        throw new Error('Veuillez sélectionner une date')
      }
      if (!selectedTime) {
        throw new Error('Veuillez sélectionner une heure')
      }

      // Combiner date + time en ISO timestamp
      const scheduledAt = new Date(`${selectedDate}T${selectedTime}:00`)

      // Vérifier que c'est dans le futur
      const now = new Date()
      if (scheduledAt <= now) {
        throw new Error('La date/heure doit être dans le futur')
      }

      // Minimum 1 minute dans le futur
      const minFuture = new Date(now.getTime() + 60 * 1000)
      if (scheduledAt < minFuture) {
        throw new Error('La date/heure doit être au moins 1 minute dans le futur')
      }

      const response = await fetch('/api/admin/cron-executions/schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cronName,
          scheduledAt: scheduledAt.toISOString(),
          parameters,
          createdBy: 'admin', // TODO: get from session
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Erreur lors de la planification')
      }

      setSuccess(true)

      // Wait 2 seconds to show success message, then close
      setTimeout(() => {
        onSuccess?.()
        onClose()
        setSuccess(false)
        setSelectedDate('')
        setSelectedTime('')
      }, 2000)
    } catch (err: any) {
      setError(err.message || 'Une erreur est survenue')
    } finally {
      setIsScheduling(false)
    }
  }

  // Suggestions rapides
  const quickSchedules = [
    { label: 'Dans 1 heure', getDateTime: () => addHours(new Date(), 1) },
    { label: 'Dans 2 heures', getDateTime: () => addHours(new Date(), 2) },
    { label: 'Demain 9h', getDateTime: () => setTomorrowTime(9, 0) },
    { label: 'Demain 14h', getDateTime: () => setTomorrowTime(14, 0) },
  ]

  const handleQuickSchedule = (getDateTime: () => Date) => {
    const dateTime = getDateTime()
    setSelectedDate(format(dateTime, 'yyyy-MM-dd'))
    setSelectedTime(format(dateTime, 'HH:mm'))
  }

  // Obtenir date/heure minimum (maintenant + 1 min)
  const minDateTime = new Date(Date.now() + 60 * 1000)
  const minDate = format(minDateTime, 'yyyy-MM-dd')
  const minTime = format(minDateTime, 'HH:mm')

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5 text-primary" />
            Planifier l'Exécution
          </DialogTitle>
          <DialogDescription>
            Sélectionner une date et heure pour exécuter automatiquement ce cron.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Cron Info */}
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="font-medium text-muted-foreground">Cron :</span>
              <span className="font-mono">{cronName}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="font-medium text-muted-foreground">Description :</span>
              <span>{description}</span>
            </div>
            {Object.keys(parameters).length > 0 && (
              <div className="flex justify-between text-sm">
                <span className="font-medium text-muted-foreground">Paramètres :</span>
                <span className="text-xs font-mono">{Object.keys(parameters).length} configurés</span>
              </div>
            )}
          </div>

          {/* Quick Schedules */}
          {!success && (
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Raccourcis :</Label>
              <div className="flex flex-wrap gap-2">
                {quickSchedules.map((quick) => (
                  <Button
                    key={quick.label}
                    variant="outline"
                    size="sm"
                    className="text-xs"
                    onClick={() => handleQuickSchedule(quick.getDateTime)}
                  >
                    {quick.label}
                  </Button>
                ))}
              </div>
            </div>
          )}

          {/* Date Picker */}
          {!success && (
            <div className="space-y-2">
              <Label htmlFor="date">Date</Label>
              <Input
                id="date"
                type="date"
                min={minDate}
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                required
              />
            </div>
          )}

          {/* Time Picker */}
          {!success && (
            <div className="space-y-2">
              <Label htmlFor="time">Heure</Label>
              <Input
                id="time"
                type="time"
                min={selectedDate === minDate ? minTime : undefined}
                value={selectedTime}
                onChange={(e) => setSelectedTime(e.target.value)}
                required
              />
              <p className="text-xs text-muted-foreground">
                Heure locale. Minimum 1 minute dans le futur.
              </p>
            </div>
          )}

          {/* Preview */}
          {selectedDate && selectedTime && !success && (
            <Alert>
              <Calendar className="h-4 w-4" />
              <AlertDescription>
                <strong>Exécution prévue :</strong>
                <br />
                {formatDateTime(new Date(`${selectedDate}T${selectedTime}:00`))}
              </AlertDescription>
            </Alert>
          )}

          {/* Error */}
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* Success */}
          {success && (
            <Alert className="border-green-500 bg-green-50 text-green-900">
              <AlertDescription className="flex items-center gap-2">
                <span className="text-xl">✅</span>
                <span>Cron planifié avec succès !</span>
              </AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isScheduling}>
            Annuler
          </Button>
          <Button onClick={handleSchedule} disabled={isScheduling || success}>
            {isScheduling ? 'Planification...' : success ? '✅ Planifié' : 'Planifier'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// Helper functions
function addHours(date: Date, hours: number): Date {
  return new Date(date.getTime() + hours * 60 * 60 * 1000)
}

function setTomorrowTime(hours: number, minutes: number): Date {
  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  tomorrow.setHours(hours, minutes, 0, 0)
  return tomorrow
}

function formatDateTime(date: Date): string {
  return format(date, "EEEE d MMMM yyyy 'à' HH:mm", { locale: fr })
}
