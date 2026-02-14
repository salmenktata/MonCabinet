'use client'

/**
 * Boutons de déclenchement rapide des crons
 * Affiche une liste de boutons pour trigger chaque cron
 */

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Play, Loader2, RefreshCw, Calendar } from 'lucide-react'
import { CronTriggerModal } from './CronTriggerModal'
import { CronScheduleModal } from './CronScheduleModal'

interface CronConfig {
  cronName: string
  description: string
  estimatedDuration: number
  isRunning: boolean
}

export function CronQuickTrigger() {
  const [crons, setCrons] = useState<CronConfig[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedCron, setSelectedCron] = useState<CronConfig | null>(null)
  const [selectedCronForSchedule, setSelectedCronForSchedule] = useState<CronConfig | null>(null)

  const fetchCrons = async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/admin/cron-executions/trigger')
      const data = await response.json()

      if (data.success) {
        setCrons(data.crons)
      }
    } catch (error) {
      console.error('[Quick Trigger] Error fetching crons:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchCrons()
  }, [])

  const handleSuccess = () => {
    // Rafraîchir la liste après succès
    setTimeout(() => {
      fetchCrons()
    }, 1000)
  }

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Déclenchement Manuel</CardTitle>
              <CardDescription>
                Exécuter un cron à la demande sans attendre le schedule
              </CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={fetchCrons}
              disabled={loading}
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              Rafraîchir
            </Button>
          </div>
        </CardHeader>

        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mr-2" />
              Chargement...
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {crons.map((cron) => (
                <div
                  key={cron.cronName}
                  className="border rounded-lg p-4 space-y-3 hover:border-primary/50 transition-colors"
                >
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 w-full">
                      {cron.isRunning ? (
                        <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
                      ) : (
                        <Play className="h-4 w-4 text-primary" />
                      )}
                      <span className="font-mono text-xs truncate flex-1 text-left">
                        {cron.cronName}
                      </span>
                    </div>

                    <span className="text-xs text-muted-foreground text-left w-full block">
                      {cron.description}
                    </span>

                    <div className="flex items-center justify-between w-full">
                      <Badge
                        variant={cron.isRunning ? 'default' : 'outline'}
                        className="text-xs"
                      >
                        ~{formatDuration(cron.estimatedDuration)}
                      </Badge>
                      {cron.isRunning && (
                        <Badge className="bg-blue-500 text-white text-xs">
                          En cours
                        </Badge>
                      )}
                    </div>
                  </div>

                  {/* Phase 6.1: Boutons Exécuter / Planifier */}
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      className="flex-1 gap-1 text-xs"
                      onClick={() => setSelectedCron(cron)}
                      disabled={cron.isRunning}
                    >
                      <Play className="h-3 w-3" />
                      Exécuter
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1 gap-1 text-xs"
                      onClick={() => setSelectedCronForSchedule(cron)}
                      disabled={cron.isRunning}
                    >
                      <Calendar className="h-3 w-3" />
                      Planifier
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Modal de confirmation exécution immédiate */}
      {selectedCron && (
        <CronTriggerModal
          isOpen={!!selectedCron}
          onClose={() => setSelectedCron(null)}
          cronName={selectedCron.cronName}
          description={selectedCron.description}
          estimatedDuration={selectedCron.estimatedDuration}
          onSuccess={handleSuccess}
        />
      )}

      {/* Phase 6.1: Modal planification */}
      {selectedCronForSchedule && (
        <CronScheduleModal
          isOpen={!!selectedCronForSchedule}
          onClose={() => setSelectedCronForSchedule(null)}
          cronName={selectedCronForSchedule.cronName}
          description={selectedCronForSchedule.description}
          parameters={{}} // TODO: passer paramètres depuis formulaire
          onSuccess={handleSuccess}
        />
      )}
    </>
  )
}

function formatDuration(ms: number) {
  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(0)}s`
  return `${(ms / 60000).toFixed(1)}min`
}
