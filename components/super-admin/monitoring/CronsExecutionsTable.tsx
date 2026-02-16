'use client'

/**
 * Table Historique Exécutions Crons
 * Avec filtres, tri, pagination et détails collapsibles
 * QW2: Headers triables avec icônes ⬆️⬇️
 * QW3: Export CSV avec filtres appliqués
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
import { ChevronLeft, ChevronRight, Eye, RefreshCw, Download, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react'
import { CronExecutionDetailsModal } from './CronExecutionDetailsModal'

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

type SortField = 'cron_name' | 'status' | 'started_at' | 'duration_ms' | 'triggered_by'
type SortDirection = 'asc' | 'desc' | null

export function CronsExecutionsTable() {
  const [executions, setExecutions] = useState<Execution[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [cronNameFilter, setCronNameFilter] = useState<string>('all')
  const [selectedExecution, setSelectedExecution] = useState<Execution | null>(null)

  // QW2: États pour tri
  const [sortField, setSortField] = useState<SortField | null>(null)
  const [sortDirection, setSortDirection] = useState<SortDirection>(null)

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
    if (!ms || typeof ms !== 'number' || isNaN(ms)) return 'N/A'
    if (ms < 1000) return `${ms}ms`
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
    return `${(ms / 60000).toFixed(1)}min`
  }

  // QW2: Fonction de tri
  const handleSort = (field: SortField) => {
    if (sortField === field) {
      // Cycle: asc → desc → null
      if (sortDirection === 'asc') {
        setSortDirection('desc')
      } else if (sortDirection === 'desc') {
        setSortDirection(null)
        setSortField(null)
      }
    } else {
      setSortField(field)
      setSortDirection('asc')
    }
  }

  // Tri des données
  const sortedExecutions = [...executions].sort((a, b) => {
    if (!sortField || !sortDirection) return 0

    let aValue: any = a[sortField]
    let bValue: any = b[sortField]

    // Gérer les valeurs null/undefined
    if (aValue === null || aValue === undefined) return 1
    if (bValue === null || bValue === undefined) return -1

    // Dates
    if (sortField === 'started_at') {
      aValue = new Date(aValue).getTime()
      bValue = new Date(bValue).getTime()
    }

    // Comparaison
    if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1
    if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1
    return 0
  })

  // Icône de tri
  const getSortIcon = (field: SortField) => {
    if (sortField !== field) {
      return <ArrowUpDown className="h-3 w-3 ml-1 inline opacity-30" />
    }
    if (sortDirection === 'asc') {
      return <ArrowUp className="h-3 w-3 ml-1 inline text-primary" />
    }
    return <ArrowDown className="h-3 w-3 ml-1 inline text-primary" />
  }

  // QW3: Export CSV
  const exportToCSV = () => {
    const headers = ['Cron', 'Statut', 'Démarré', 'Durée (ms)', 'Exit Code', 'Déclencheur', 'ID']
    const rows = sortedExecutions.map((exec) => [
      exec.cron_name,
      exec.status,
      new Date(exec.started_at).toLocaleString('fr-FR'),
      exec.duration_ms?.toString() || 'N/A',
      exec.exit_code?.toString() || 'N/A',
      exec.triggered_by,
      exec.id,
    ])

    const csvContent = [
      headers.join(','),
      ...rows.map((row) => row.map((cell) => `"${cell}"`).join(',')),
    ].join('\n')

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    const url = URL.createObjectURL(blob)

    const filename = `crons-executions-${new Date().toISOString().split('T')[0]}.csv`
    link.setAttribute('href', url)
    link.setAttribute('download', filename)
    link.style.visibility = 'hidden'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
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
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={exportToCSV}
                disabled={loading || executions.length === 0}
              >
                <Download className="h-4 w-4 mr-2" />
                Export CSV
              </Button>
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
                <TableHead
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => handleSort('cron_name')}
                >
                  Cron {getSortIcon('cron_name')}
                </TableHead>
                <TableHead
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => handleSort('status')}
                >
                  Statut {getSortIcon('status')}
                </TableHead>
                <TableHead
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => handleSort('started_at')}
                >
                  Démarré {getSortIcon('started_at')}
                </TableHead>
                <TableHead
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => handleSort('duration_ms')}
                >
                  Durée {getSortIcon('duration_ms')}
                </TableHead>
                <TableHead
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => handleSort('triggered_by')}
                >
                  Déclencheur {getSortIcon('triggered_by')}
                </TableHead>
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
                sortedExecutions.map((exec) => (
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

      {/* S1.1 : Modal Détails Enrichi */}
      <CronExecutionDetailsModal
        execution={selectedExecution}
        open={!!selectedExecution}
        onClose={() => setSelectedExecution(null)}
      />
    </>
  )
}
