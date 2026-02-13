'use client'

/**
 * Table Historique Exécutions Crons
 * Avec filtres, tri, pagination et détails collapsibles
 */

import { useState, useEffect } from 'react'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ChevronLeft, ChevronRight, Eye, RefreshCw } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'

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

export function CronsExecutionsTable() {
  const [executions, setExecutions] = useState<Execution[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [cronNameFilter, setCronNameFilter] = useState<string>('all')
  const [selectedExecution, setSelectedExecution] = useState<Execution | null>(null)

  const fetchExecutions = async () => {
    try {
      setLoading(true)

      const params = new URLSearchParams({
        page: page.toString(),
        limit: '50',
      })

      if (statusFilter !== 'all') {
        params.set('status', statusFilter)
      }

      if (cronNameFilter !== 'all') {
        params.set('cronName', cronNameFilter)
      }

      const response = await fetch(`/api/admin/cron-executions/list?${params}`)
      const data = await response.json()

      if (data.success) {
        setExecutions(data.executions)
        setTotalPages(data.pagination.totalPages)
      }
    } catch (error) {
      console.error('[Executions Table] Error:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchExecutions()
  }, [page, statusFilter, cronNameFilter])

  // Récupérer liste unique des cron names
  const uniqueCronNames = Array.from(
    new Set(executions.map((e) => e.cron_name))
  ).sort()

  const getStatusBadge = (status: string) => {
    const variants: Record<string, any> = {
      running: { variant: 'default', className: 'bg-blue-500' },
      completed: { variant: 'default', className: 'bg-green-500' },
      failed: { variant: 'destructive', className: '' },
      cancelled: { variant: 'outline', className: '' },
    }

    const config = variants[status] || { variant: 'outline', className: '' }

    return (
      <Badge variant={config.variant} className={config.className}>
        {status === 'running' && '▶️'}
        {status === 'completed' && '✅'}
        {status === 'failed' && '❌'}
        {status === 'cancelled' && '⏸️'}
        {' '}
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </Badge>
    )
  }

  const formatDuration = (ms: number | null) => {
    if (!ms) return 'N/A'
    if (ms < 1000) return `${ms}ms`
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
    return `${(ms / 60000).toFixed(1)}min`
  }

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Historique Exécutions</CardTitle>
              <CardDescription>
                50 exécutions par page • Page {page} / {totalPages}
              </CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={fetchExecutions}
              disabled={loading}
            >
              <RefreshCw
                className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`}
              />
              Rafraîchir
            </Button>
          </div>

          {/* Filtres */}
          <div className="flex gap-4 mt-4">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Statut" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous les statuts</SelectItem>
                <SelectItem value="running">En cours</SelectItem>
                <SelectItem value="completed">Succès</SelectItem>
                <SelectItem value="failed">Échecs</SelectItem>
                <SelectItem value="cancelled">Annulés</SelectItem>
              </SelectContent>
            </Select>

            <Select value={cronNameFilter} onValueChange={setCronNameFilter}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Cron" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous les crons</SelectItem>
                {uniqueCronNames.map((name) => (
                  <SelectItem key={name} value={name}>
                    {name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>

        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cron</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead>Démarré</TableHead>
                <TableHead>Durée</TableHead>
                <TableHead>Déclencheur</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground">
                    <RefreshCw className="h-4 w-4 animate-spin inline mr-2" />
                    Chargement...
                  </TableCell>
                </TableRow>
              ) : executions.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground">
                    Aucune exécution trouvée
                  </TableCell>
                </TableRow>
              ) : (
                executions.map((exec) => (
                  <TableRow key={exec.id}>
                    <TableCell className="font-medium">{exec.cron_name}</TableCell>
                    <TableCell>{getStatusBadge(exec.status)}</TableCell>
                    <TableCell className="text-sm">
                      {new Date(exec.started_at).toLocaleString('fr-FR', {
                        day: '2-digit',
                        month: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                      })}
                    </TableCell>
                    <TableCell>{formatDuration(exec.duration_ms)}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">
                        {exec.triggered_by}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setSelectedExecution(exec)}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 mt-4">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1 || loading}
              >
                <ChevronLeft className="h-4 w-4" />
                Précédent
              </Button>
              <span className="text-sm text-muted-foreground">
                Page {page} / {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages || loading}
              >
                Suivant
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Modal Détails */}
      {selectedExecution && (
        <Dialog
          open={!!selectedExecution}
          onOpenChange={() => setSelectedExecution(null)}
        >
          <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Détails Exécution</DialogTitle>
              <DialogDescription>
                {selectedExecution.cron_name} • {selectedExecution.id}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 mt-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-sm font-medium text-muted-foreground">Statut</div>
                  <div className="mt-1">{getStatusBadge(selectedExecution.status)}</div>
                </div>
                <div>
                  <div className="text-sm font-medium text-muted-foreground">Durée</div>
                  <div className="mt-1 text-lg font-mono">
                    {formatDuration(selectedExecution.duration_ms)}
                  </div>
                </div>
                <div>
                  <div className="text-sm font-medium text-muted-foreground">Démarré</div>
                  <div className="mt-1 text-sm">
                    {new Date(selectedExecution.started_at).toLocaleString('fr-FR')}
                  </div>
                </div>
                <div>
                  <div className="text-sm font-medium text-muted-foreground">Terminé</div>
                  <div className="mt-1 text-sm">
                    {selectedExecution.completed_at
                      ? new Date(selectedExecution.completed_at).toLocaleString('fr-FR')
                      : 'En cours'}
                  </div>
                </div>
              </div>

              {selectedExecution.error_message && (
                <div>
                  <div className="text-sm font-medium text-muted-foreground mb-2">
                    Erreur
                  </div>
                  <div className="bg-destructive/10 text-destructive p-3 rounded-md text-sm font-mono">
                    {selectedExecution.error_message}
                  </div>
                </div>
              )}

              {selectedExecution.output &&
                Object.keys(selectedExecution.output).length > 0 && (
                  <div>
                    <div className="text-sm font-medium text-muted-foreground mb-2">
                      Output JSON
                    </div>
                    <pre className="bg-muted p-3 rounded-md text-xs overflow-x-auto">
                      {JSON.stringify(selectedExecution.output, null, 2)}
                    </pre>
                  </div>
                )}
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  )
}
