'use client'

/**
 * Section: Crons Planifiés
 * Phase 6.1: Affiche les crons planifiés avec compte à rebours
 */

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Calendar, Clock, Trash2, RefreshCw, Loader2 } from 'lucide-react'
import { formatDistance, format } from 'date-fns'
import { fr } from 'date-fns/locale'

interface ScheduledCron {
  id: string
  cron_name: string
  scheduled_at: string
  created_at: string
  created_by: string
  status: 'pending' | 'triggered' | 'cancelled' | 'failed'
  parameters: Record<string, any>
  seconds_until_execution: number | null
  execution_status?: string
}

export function ScheduledCronsSection() {
  const [scheduled, setScheduled] = useState<ScheduledCron[]>([])
  const [loading, setLoading] = useState(true)
  const [cancelling, setCancelling] = useState<string | null>(null)

  const fetchScheduled = async () => {
    try {
      const response = await fetch('/api/admin/cron-executions/schedule?status=pending')
      const data = await response.json()

      if (data.success) {
        setScheduled(data.scheduled)
      }
    } catch (error) {
      console.error('[Scheduled Crons] Error fetching:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchScheduled()

    // Auto-refresh toutes les 30s
    const interval = setInterval(fetchScheduled, 30000)

    return () => clearInterval(interval)
  }, [])

  const handleCancel = async (id: string) => {
    if (!confirm('Voulez-vous vraiment annuler ce cron planifié ?')) {
      return
    }

    setCancelling(id)

    try {
      const response = await fetch(`/api/admin/cron-executions/schedule?id=${id}`, {
        method: 'DELETE',
      })

      const data = await response.json()

      if (data.success) {
        // Rafraîchir la liste
        await fetchScheduled()
      } else {
        alert(`Erreur: ${data.error}`)
      }
    } catch (error: any) {
      alert(`Erreur: ${error.message}`)
    } finally {
      setCancelling(null)
    }
  }

  // Calculer countdown en temps réel
  const [now, setNow] = useState(new Date())

  useEffect(() => {
    const interval = setInterval(() => {
      setNow(new Date())
    }, 1000)

    return () => clearInterval(interval)
  }, [])

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Crons Planifiés
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mr-2" />
            Chargement...
          </div>
        </CardContent>
      </Card>
    )
  }

  if (scheduled.length === 0) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5" />
                Crons Planifiés
              </CardTitle>
              <CardDescription>Aucun cron planifié pour l'instant</CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={fetchScheduled}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Rafraîchir
            </Button>
          </div>
        </CardHeader>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Crons Planifiés
            </CardTitle>
            <CardDescription>
              {scheduled.length} cron{scheduled.length > 1 ? 's' : ''} en attente d'exécution
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={fetchScheduled}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Rafraîchir
          </Button>
        </div>
      </CardHeader>

      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Cron</TableHead>
              <TableHead>Planifié pour</TableHead>
              <TableHead>Compte à rebours</TableHead>
              <TableHead>Créé par</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {scheduled.map((cron) => {
              const scheduledDate = new Date(cron.scheduled_at)
              const secondsUntil = Math.floor((scheduledDate.getTime() - now.getTime()) / 1000)
              const isImminent = secondsUntil < 300 // < 5 minutes

              return (
                <TableRow key={cron.id}>
                  <TableCell>
                    <div className="space-y-1">
                      <span className="font-mono text-sm">{cron.cron_name}</span>
                      {Object.keys(cron.parameters).length > 0 && (
                        <div className="text-xs text-muted-foreground">
                          {Object.keys(cron.parameters).length} param{Object.keys(cron.parameters).length > 1 ? 's' : ''}
                        </div>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="space-y-1">
                      <div className="text-sm font-medium">
                        {format(scheduledDate, 'EEEE d MMMM', { locale: fr })}
                      </div>
                      <div className="text-xs text-muted-foreground flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {format(scheduledDate, 'HH:mm:ss')}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={isImminent ? 'default' : 'outline'} className={isImminent ? 'bg-orange-500' : ''}>
                      {secondsUntil > 0 ? formatCountdown(secondsUntil) : 'Imminent'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {cron.created_by}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleCancel(cron.id)}
                      disabled={cancelling === cron.id}
                      className="text-destructive hover:text-destructive"
                    >
                      {cancelling === cron.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4" />
                      )}
                    </Button>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}

function formatCountdown(seconds: number): string {
  if (seconds < 60) {
    return `${seconds}s`
  }
  if (seconds < 3600) {
    const minutes = Math.floor(seconds / 60)
    return `${minutes} min`
  }
  if (seconds < 86400) {
    const hours = Math.floor(seconds / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    return `${hours}h ${minutes}min`
  }
  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  return `${days}j ${hours}h`
}
