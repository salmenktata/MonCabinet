'use client'

/**
 * Modal Détails Enrichi - Exécution Cron
 * S1.1 : Onglets (Vue d'ensemble | Logs | Historique | Output JSON)
 * Exit codes avec badge couleur + explication
 * Historique 5 dernières exécutions avec sparkline
 */

import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from '@/components/charts/LazyCharts'
import { AlertCircle, Clock, CheckCircle2, XCircle, Terminal, History, FileJson, Info } from 'lucide-react'

interface Execution {
  id: string
  cron_name: string
  status: 'running' | 'completed' | 'failed' | 'cancelled'
  started_at: string
  completed_at: string | null
  duration_ms: number | null
  exit_code: number | null
  output: any
  error_message: string | null
  triggered_by: string
}

interface CronExecutionDetailsModalProps {
  execution: Execution | null
  open: boolean
  onClose: () => void
}

// Exit codes expliqués
const EXIT_CODE_EXPLANATIONS: Record<number, { label: string; description: string; severity: 'success' | 'warning' | 'error' }> = {
  0: { label: 'Succès', description: 'Exécution terminée sans erreur', severity: 'success' },
  1: { label: 'Erreur générale', description: 'Erreur générique ou non spécifiée', severity: 'error' },
  2: { label: 'Usage invalide', description: 'Mauvaise utilisation ou paramètres invalides', severity: 'error' },
  126: { label: 'Permission refusée', description: 'Commande non exécutable (permissions)', severity: 'error' },
  127: { label: 'Commande introuvable', description: 'Commande ou script non trouvé', severity: 'error' },
  128: { label: 'Argument invalide', description: 'Argument exit invalide', severity: 'error' },
  130: { label: 'Terminé par Ctrl+C', description: 'Interruption utilisateur (SIGINT)', severity: 'warning' },
  137: { label: 'Tué (SIGKILL)', description: 'Processus tué de force', severity: 'error' },
  143: { label: 'Terminé (SIGTERM)', description: 'Terminaison gracieuse demandée', severity: 'warning' },
}

export function CronExecutionDetailsModal({
  execution,
  open,
  onClose,
}: CronExecutionDetailsModalProps) {
  const [history, setHistory] = useState<Execution[]>([])
  const [historyStats, setHistoryStats] = useState<any>(null)
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [activeTab, setActiveTab] = useState('overview')

  // Charger l'historique quand le modal s'ouvre
  useEffect(() => {
    if (open && execution && activeTab === 'history') {
      fetchHistory()
    }
  }, [open, execution, activeTab])

  const fetchHistory = async () => {
    if (!execution) return

    try {
      setLoadingHistory(true)
      const response = await fetch(
        `/api/admin/cron-executions/history?cronName=${execution.cron_name}&limit=10`
      )
      const data = await response.json()

      if (data.success) {
        setHistory(data.executions)
        setHistoryStats(data.stats)
      }
    } catch (error) {
      console.error('[Modal] Error loading history:', error)
    } finally {
      setLoadingHistory(false)
    }
  }

  if (!execution) return null

  const formatDuration = (ms: number | null) => {
    if (!ms || typeof ms !== 'number' || isNaN(ms)) return 'N/A'
    if (ms < 1000) return `${ms}ms`
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
    return `${(ms / 60000).toFixed(1)}min`
  }

  const getStatusBadge = (status: string) => {
    const config: Record<string, { icon: any; className: string; label: string }> = {
      running: { icon: Clock, className: 'bg-blue-500', label: 'En cours' },
      completed: { icon: CheckCircle2, className: 'bg-green-500', label: 'Succès' },
      failed: { icon: XCircle, className: 'bg-red-500', label: 'Échec' },
      cancelled: { icon: AlertCircle, className: 'bg-gray-500', label: 'Annulé' },
    }

    const { icon: Icon, className, label } = config[status] || config.cancelled

    return (
      <Badge variant="default" className={className}>
        <Icon className="h-3 w-3 mr-1" />
        {label}
      </Badge>
    )
  }

  const getExitCodeBadge = (code: number | null) => {
    if (code === null) {
      return <Badge variant="outline">N/A</Badge>
    }

    const explanation = EXIT_CODE_EXPLANATIONS[code] || {
      label: `Code ${code}`,
      description: 'Code de sortie non documenté',
      severity: 'error' as const,
    }

    const variantMap = {
      success: 'default',
      warning: 'outline',
      error: 'destructive',
    }

    return (
      <div className="flex items-center gap-2">
        <Badge variant={variantMap[explanation.severity] as any}>
          {explanation.label} ({code})
        </Badge>
        <span className="text-xs text-muted-foreground">{explanation.description}</span>
      </div>
    )
  }

  // Données sparkline (historique)
  const sparklineData = history.map((exec, idx) => ({
    index: history.length - idx,
    duration: exec.duration_ms || 0,
    status: exec.status,
  }))

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Détails Exécution</DialogTitle>
          <DialogDescription>
            {execution.cron_name} • {execution.id.slice(0, 8)}...
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="overview">
              <Info className="h-4 w-4 mr-2" />
              Vue d'ensemble
            </TabsTrigger>
            <TabsTrigger value="logs">
              <Terminal className="h-4 w-4 mr-2" />
              Logs
            </TabsTrigger>
            <TabsTrigger value="history">
              <History className="h-4 w-4 mr-2" />
              Historique
            </TabsTrigger>
            <TabsTrigger value="output">
              <FileJson className="h-4 w-4 mr-2" />
              Output JSON
            </TabsTrigger>
          </TabsList>

          <ScrollArea className="flex-1 mt-4">
            {/* Onglet 1 : Vue d'ensemble */}
            <TabsContent value="overview" className="space-y-4 p-1">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-sm font-medium text-muted-foreground">Statut</div>
                  <div className="mt-1">{getStatusBadge(execution.status)}</div>
                </div>
                <div>
                  <div className="text-sm font-medium text-muted-foreground">Durée</div>
                  <div className="mt-1 text-lg font-mono">
                    {formatDuration(execution.duration_ms)}
                  </div>
                </div>
                <div>
                  <div className="text-sm font-medium text-muted-foreground">Exit Code</div>
                  <div className="mt-1">{getExitCodeBadge(execution.exit_code)}</div>
                </div>
                <div>
                  <div className="text-sm font-medium text-muted-foreground">Déclencheur</div>
                  <div className="mt-1">
                    <Badge variant="outline">{execution.triggered_by}</Badge>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-sm font-medium text-muted-foreground">Démarré</div>
                  <div className="mt-1 text-sm">
                    {new Date(execution.started_at).toLocaleString('fr-FR')}
                  </div>
                </div>
                <div>
                  <div className="text-sm font-medium text-muted-foreground">Terminé</div>
                  <div className="mt-1 text-sm">
                    {execution.completed_at
                      ? new Date(execution.completed_at).toLocaleString('fr-FR')
                      : 'En cours'}
                  </div>
                </div>
              </div>

              {execution.error_message && (
                <div>
                  <div className="text-sm font-medium text-muted-foreground mb-2">
                    Message d'erreur
                  </div>
                  <div className="bg-destructive/10 text-destructive p-3 rounded-md text-sm font-mono">
                    {execution.error_message}
                  </div>
                </div>
              )}
            </TabsContent>

            {/* Onglet 2 : Logs */}
            <TabsContent value="logs" className="p-1">
              <div className="bg-muted p-4 rounded-md">
                {execution.output?.stdout || execution.output?.stderr ? (
                  <div className="space-y-4">
                    {execution.output.stdout && (
                      <div>
                        <div className="text-xs font-medium text-muted-foreground mb-2">
                          STDOUT
                        </div>
                        <pre className="text-xs font-mono whitespace-pre-wrap">
                          {execution.output.stdout}
                        </pre>
                      </div>
                    )}
                    {execution.output.stderr && (
                      <div>
                        <div className="text-xs font-medium text-destructive mb-2">STDERR</div>
                        <pre className="text-xs font-mono whitespace-pre-wrap text-destructive">
                          {execution.output.stderr}
                        </pre>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-sm text-muted-foreground text-center py-8">
                    Aucun log disponible pour cette exécution
                  </div>
                )}
              </div>
            </TabsContent>

            {/* Onglet 3 : Historique */}
            <TabsContent value="history" className="space-y-4 p-1">
              {loadingHistory ? (
                <div className="text-center py-8 text-muted-foreground">
                  Chargement de l'historique...
                </div>
              ) : history.length > 0 ? (
                <>
                  {/* Stats rapides */}
                  {historyStats && (
                    <div className="grid grid-cols-3 gap-4 p-4 bg-muted rounded-md">
                      <div className="text-center">
                        <div className="text-2xl font-bold text-green-600">
                          {historyStats.completed}
                        </div>
                        <div className="text-xs text-muted-foreground">Succès</div>
                      </div>
                      <div className="text-center">
                        <div className="text-2xl font-bold text-red-600">
                          {historyStats.failed}
                        </div>
                        <div className="text-xs text-muted-foreground">Échecs</div>
                      </div>
                      <div className="text-center">
                        <div className="text-2xl font-bold">
                          {formatDuration(historyStats.avgDuration)}
                        </div>
                        <div className="text-xs text-muted-foreground">Durée moy.</div>
                      </div>
                    </div>
                  )}

                  {/* Sparkline durées */}
                  <div>
                    <div className="text-sm font-medium mb-2">
                      Évolution durées (10 dernières exécutions)
                    </div>
                    <ResponsiveContainer width="100%" height={150}>
                      <LineChart data={sparklineData}>
                        <XAxis dataKey="index" hide />
                        <YAxis hide />
                        <Tooltip
                          content={({ payload }) => {
                            if (!payload || payload.length === 0) return null
                            const data = payload[0].payload
                            return (
                              <div className="bg-card border p-2 rounded text-xs">
                                <div>Durée: {formatDuration(data.duration)}</div>
                                <div>Statut: {data.status}</div>
                              </div>
                            )
                          }}
                        />
                        <Line
                          type="monotone"
                          dataKey="duration"
                          stroke="hsl(var(--primary))"
                          strokeWidth={2}
                          dot={{ r: 3 }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>

                  {/* Liste exécutions */}
                  <div>
                    <div className="text-sm font-medium mb-2">
                      Historique des exécutions
                    </div>
                    <div className="space-y-2">
                      {history.map((exec) => (
                        <div
                          key={exec.id}
                          className={`p-3 rounded border ${
                            exec.id === execution.id ? 'border-primary bg-primary/5' : ''
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              {getStatusBadge(exec.status)}
                              <span className="text-xs text-muted-foreground">
                                {new Date(exec.started_at).toLocaleString('fr-FR', {
                                  month: '2-digit',
                                  day: '2-digit',
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })}
                              </span>
                            </div>
                            <div className="text-xs font-mono">
                              {formatDuration(exec.duration_ms)}
                            </div>
                          </div>
                          {exec.error_message && (
                            <div className="text-xs text-destructive mt-1 truncate">
                              {exec.error_message}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  Aucun historique disponible
                </div>
              )}
            </TabsContent>

            {/* Onglet 4 : Output JSON */}
            <TabsContent value="output" className="p-1">
              {execution.output && Object.keys(execution.output).length > 0 ? (
                <pre className="bg-muted p-4 rounded-md text-xs font-mono overflow-x-auto">
                  {JSON.stringify(execution.output, null, 2)}
                </pre>
              ) : (
                <div className="text-sm text-muted-foreground text-center py-8">
                  Aucun output JSON disponible
                </div>
              )}
            </TabsContent>
          </ScrollArea>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}
