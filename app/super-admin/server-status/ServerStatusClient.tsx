'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { toast } from 'sonner'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip as RechartsTooltip, ResponsiveContainer, Legend,
} from 'recharts'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { SystemSnapshot, ServicesSnapshot, HistoryPoint } from '@/lib/monitoring/system-stats'

// =============================================================================
// TYPES
// =============================================================================

type HistoryRange = 1 | 6 | 24

interface GaugeProps {
  label: string
  value: number | null
  max?: number
  unit?: string
  subtitle?: string
  thresholds?: { warn: number; crit: number }
}

// =============================================================================
// UTILITIES
// =============================================================================

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400)
  const h = Math.floor((seconds % 86400) / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (d > 0) return `${d}j ${h}h ${m}m`
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

function formatBytes(mb: number, decimals = 1): string {
  if (mb >= 1024) return `${(mb / 1024).toFixed(decimals)} Go`
  return `${mb} Mo`
}

function getStatusColor(value: number | null, warn = 70, crit = 90): string {
  if (value === null) return 'text-muted-foreground'
  if (value >= crit) return 'text-red-400'
  if (value >= warn) return 'text-yellow-400'
  return 'text-green-400'
}

function getGaugeBarColor(value: number | null, warn = 70, crit = 90): string {
  if (value === null) return 'bg-muted'
  if (value >= crit) return 'bg-red-500'
  if (value >= warn) return 'bg-yellow-500'
  return 'bg-green-500'
}

function getServiceStatusBadge(status: string) {
  switch (status) {
    case 'healthy': return <Badge className="bg-green-500/20 text-green-400 border-green-500/30">Actif</Badge>
    case 'degraded': return <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30">Dégradé</Badge>
    default: return <Badge className="bg-red-500/20 text-red-400 border-red-500/30">Injoignable</Badge>
  }
}

function formatTimeAgo(timestamp: number): string {
  const diffMs = Date.now() - timestamp
  if (diffMs < 60000) return 'à l\'instant'
  if (diffMs < 3600000) return `il y a ${Math.floor(diffMs / 60000)}m`
  return `il y a ${Math.floor(diffMs / 3600000)}h`
}

// =============================================================================
// GAUGE COMPONENT
// =============================================================================

function GaugeCard({ label, value, unit = '%', subtitle, thresholds }: GaugeProps) {
  const warn = thresholds?.warn ?? 70
  const crit = thresholds?.crit ?? 90
  const displayValue = value !== null ? `${value}${unit === '%' ? '%' : ''}` : 'N/A'
  const barWidth = value !== null ? Math.min(100, value) : 0

  return (
    <Card className="bg-background border-border">
      <CardContent className="pt-4 pb-3 px-4">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs text-muted-foreground font-medium uppercase tracking-wide">{label}</span>
          <span className={`text-2xl font-bold font-mono ${getStatusColor(value, warn, crit)}`}>
            {displayValue}
          </span>
        </div>
        {/* Barre de progression */}
        <div className="w-full bg-muted rounded-full h-2 mt-2 mb-2">
          <div
            className={`h-2 rounded-full transition-all duration-700 ${getGaugeBarColor(value, warn, crit)}`}
            style={{ width: `${barWidth}%` }}
          />
        </div>
        {subtitle && <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>}
      </CardContent>
    </Card>
  )
}

// =============================================================================
// SERVICE CARD
// =============================================================================

interface ServiceCardProps {
  name: string
  status: string
  latencyMs: number | null
  details: React.ReactNode
  error?: string
}

function ServiceCard({ name, status, latencyMs, details, error }: ServiceCardProps) {
  return (
    <Card className="bg-background border-border">
      <CardContent className="pt-4 pb-3 px-4">
        <div className="flex items-center justify-between mb-2">
          <span className="font-semibold text-foreground text-sm">{name}</span>
          <div className="flex items-center gap-2">
            {latencyMs !== null && (
              <span className={`text-xs font-mono ${latencyMs < 100 ? 'text-green-400' : latencyMs < 500 ? 'text-yellow-400' : 'text-red-400'}`}>
                {latencyMs}ms
              </span>
            )}
            {getServiceStatusBadge(status)}
          </div>
        </div>
        {error ? (
          <p className="text-xs text-red-400 truncate">{error}</p>
        ) : (
          <div className="text-xs text-muted-foreground space-y-0.5">{details}</div>
        )}
      </CardContent>
    </Card>
  )
}

// =============================================================================
// HISTORY CHART
// =============================================================================

interface HistoryChartProps {
  data: HistoryPoint[]
  range: HistoryRange
}

function HistoryChart({ data, range }: HistoryChartProps) {
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">
        Pas encore de données — les graphiques se rempliront au fil des actualisations.
      </div>
    )
  }

  const formatted = data.map((p) => ({
    time: new Date(p.t).toLocaleTimeString('fr-FR', {
      hour: '2-digit', minute: '2-digit',
      ...(range === 24 ? { day: '2-digit', month: '2-digit' } : {}),
    }),
    cpu: p.c !== null ? p.c : undefined,
    ram: p.r,
    swap: p.s > 0 ? p.s : undefined,
    load: p.l,
  }))

  return (
    <ResponsiveContainer width="100%" height={220}>
      <AreaChart data={formatted} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
        <defs>
          <linearGradient id="gradCpu" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#60a5fa" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#60a5fa" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="gradRam" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#4ade80" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#4ade80" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="gradSwap" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.2} />
            <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
        <XAxis
          dataKey="time"
          stroke="#475569"
          tick={{ fontSize: 10, fill: '#64748b' }}
          interval="preserveStartEnd"
          tickLine={false}
        />
        <YAxis
          domain={[0, 100]}
          stroke="#475569"
          tick={{ fontSize: 10, fill: '#64748b' }}
          tickLine={false}
          unit="%"
          width={32}
        />
        <RechartsTooltip
          contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: 6, fontSize: 12 }}
          labelStyle={{ color: '#94a3b8' }}
          formatter={(value: number | undefined, name: string | undefined) => [`${value ?? 0}%`, name === 'cpu' ? 'CPU' : name === 'ram' ? 'RAM' : 'Swap'] as [string, string]}
        />
        <Legend
          formatter={(v) => v === 'cpu' ? 'CPU' : v === 'ram' ? 'RAM' : 'Swap'}
          wrapperStyle={{ fontSize: 11, color: '#94a3b8' }}
        />
        {formatted.some((d) => d.cpu !== undefined) && (
          <Area type="monotone" dataKey="cpu" stroke="#60a5fa" fill="url(#gradCpu)" strokeWidth={1.5} dot={false} name="cpu" />
        )}
        <Area type="monotone" dataKey="ram" stroke="#4ade80" fill="url(#gradRam)" strokeWidth={1.5} dot={false} name="ram" />
        {formatted.some((d) => d.swap !== undefined) && (
          <Area type="monotone" dataKey="swap" stroke="#f59e0b" fill="url(#gradSwap)" strokeWidth={1} dot={false} name="swap" />
        )}
      </AreaChart>
    </ResponsiveContainer>
  )
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export default function ServerStatusClient() {
  const [snapshot, setSnapshot] = useState<SystemSnapshot | null>(null)
  const [services, setServices] = useState<ServicesSnapshot | null>(null)
  const [history, setHistory] = useState<HistoryPoint[]>([])
  const [historyRange, setHistoryRange] = useState<HistoryRange>(6)

  const [loadingCurrent, setLoadingCurrent] = useState(true)
  const [loadingServices, setLoadingServices] = useState(true)
  const [loadingHistory, setLoadingHistory] = useState(true)

  const [lastUpdated, setLastUpdated] = useState<number>(0)
  const refreshTimerRef = useRef<NodeJS.Timeout | null>(null)

  // ---- Fetch functions ----

  const fetchCurrent = useCallback(async (silent = false) => {
    if (!silent) setLoadingCurrent(true)
    try {
      const res = await fetch('/api/admin/server-status?section=current')
      const json = await res.json()
      if (json.ok) {
        setSnapshot(json.data)
        setLastUpdated(Date.now())
      }
    } catch {
      if (!silent) toast.error('Erreur de chargement des métriques système')
    } finally {
      setLoadingCurrent(false)
    }
  }, [])

  const fetchServices = useCallback(async (silent = false) => {
    if (!silent) setLoadingServices(true)
    try {
      const res = await fetch('/api/admin/server-status?section=services')
      const json = await res.json()
      if (json.ok) setServices(json.data)
    } catch {
      // silencieux
    } finally {
      setLoadingServices(false)
    }
  }, [])

  const fetchHistory = useCallback(async (range: HistoryRange = historyRange) => {
    setLoadingHistory(true)
    try {
      const res = await fetch(`/api/admin/server-status?section=history&hours=${range}`)
      const json = await res.json()
      if (json.ok) setHistory(json.data)
    } catch {
      // silencieux
    } finally {
      setLoadingHistory(false)
    }
  }, [historyRange])

  const handleRefreshAll = useCallback(async () => {
    await Promise.all([fetchCurrent(), fetchServices(), fetchHistory(historyRange)])
  }, [fetchCurrent, fetchServices, fetchHistory, historyRange])

  // ---- Initial load ----
  useEffect(() => {
    handleRefreshAll()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ---- Auto-refresh current (15s) ----
  useEffect(() => {
    const timer = setInterval(() => {
      fetchCurrent(true)
    }, 15000)
    refreshTimerRef.current = timer
    return () => clearInterval(timer)
  }, [fetchCurrent])

  // ---- Auto-refresh services (30s) ----
  useEffect(() => {
    const timer = setInterval(() => {
      fetchServices(true)
    }, 30000)
    return () => clearInterval(timer)
  }, [fetchServices])

  // ---- Auto-refresh history (60s) ----
  useEffect(() => {
    const timer = setInterval(() => {
      fetchHistory(historyRange)
    }, 60000)
    return () => clearInterval(timer)
  }, [fetchHistory, historyRange])

  // ---- History range change ----
  const handleRangeChange = (range: HistoryRange) => {
    setHistoryRange(range)
    fetchHistory(range)
  }

  // ==========================================================================
  // RENDER
  // ==========================================================================

  const snap = snapshot
  const svc = services

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Statut Serveur</h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            {snap ? `${snap.platform === 'linux' ? 'VPS Linux' : snap.platform} · Hôte actif ${formatUptime(snap.hostUptimeSeconds)} · ${snap.cpu.cores} vCPU` : 'Chargement...'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {lastUpdated > 0 && (
            <span className="text-xs text-muted-foreground">{formatTimeAgo(lastUpdated)}</span>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefreshAll}
            className="border-border text-muted-foreground hover:bg-card"
          >
            Actualiser
          </Button>
        </div>
      </div>

      {/* ================================================================== */}
      {/* SECTION 1 : Vitals temps réel                                      */}
      {/* ================================================================== */}
      <div>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
          Ressources — temps réel <span className="text-muted-foreground font-normal normal-case">(actualisation auto. 15s)</span>
        </h2>
        {loadingCurrent && !snap ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-24 rounded-lg bg-card animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <GaugeCard
              label="CPU"
              value={snap?.cpu.usagePercent ?? null}
              subtitle={snap ? `Load: ${snap.cpu.loadAvg1m} / ${snap.cpu.loadAvg5m} / ${snap.cpu.loadAvg15m}` : undefined}
              thresholds={{ warn: 70, crit: 90 }}
            />
            <GaugeCard
              label="RAM"
              value={snap?.memory.usedPercent ?? null}
              subtitle={snap ? `${formatBytes(snap.memory.usedMb)} / ${formatBytes(snap.memory.totalMb)}` : undefined}
              thresholds={{ warn: 75, crit: 90 }}
            />
            <GaugeCard
              label="Disque"
              value={snap?.disk?.usedPercent ?? null}
              subtitle={snap?.disk ? `${snap.disk.usedGb} Go / ${snap.disk.totalGb} Go` : 'N/A'}
              thresholds={{ warn: 75, crit: 90 }}
            />
            <GaugeCard
              label="Swap"
              value={snap?.swap.usedPercent ?? null}
              subtitle={snap ? `${formatBytes(snap.swap.usedMb)} / ${formatBytes(snap.swap.totalMb)}` : undefined}
              thresholds={{ warn: 50, crit: 80 }}
            />
          </div>
        )}
      </div>

      {/* Process info row */}
      {snap && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card className="bg-background/50 border-border">
            <CardContent className="pt-3 pb-3 px-4">
              <p className="text-xs text-muted-foreground mb-0.5">Uptime process</p>
              <p className="text-sm font-mono text-foreground">{formatUptime(snap.process.uptimeSeconds)}</p>
            </CardContent>
          </Card>
          <Card className="bg-background/50 border-border">
            <CardContent className="pt-3 pb-3 px-4">
              <p className="text-xs text-muted-foreground mb-0.5">Heap Node.js</p>
              <p className="text-sm font-mono text-foreground">{formatBytes(snap.process.heapUsedMb)} / {formatBytes(snap.process.heapTotalMb)}</p>
            </CardContent>
          </Card>
          <Card className="bg-background/50 border-border">
            <CardContent className="pt-3 pb-3 px-4">
              <p className="text-xs text-muted-foreground mb-0.5">RSS mémoire</p>
              <p className="text-sm font-mono text-foreground">{formatBytes(snap.process.rssMb)}</p>
            </CardContent>
          </Card>
          <Card className="bg-background/50 border-border">
            <CardContent className="pt-3 pb-3 px-4">
              <p className="text-xs text-muted-foreground mb-0.5">Node.js</p>
              <p className="text-sm font-mono text-foreground">{snap.process.nodeVersion}</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ================================================================== */}
      {/* SECTION 2 : Historique                                             */}
      {/* ================================================================== */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
            Historique CPU &amp; RAM
          </h2>
          <div className="flex gap-1">
            {([1, 6, 24] as HistoryRange[]).map((h) => (
              <button
                key={h}
                onClick={() => handleRangeChange(h)}
                className={`px-2.5 py-1 text-xs rounded font-medium transition-colors ${
                  historyRange === h
                    ? 'bg-blue-600 text-foreground'
                    : 'bg-card text-muted-foreground hover:bg-muted'
                }`}
              >
                {h}h
              </button>
            ))}
          </div>
        </div>
        <Card className="bg-background border-border">
          <CardContent className="pt-4 pr-2 pb-2 pl-2">
            {loadingHistory && history.length === 0 ? (
              <div className="h-48 flex items-center justify-center">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500" />
              </div>
            ) : (
              <HistoryChart data={history} range={historyRange} />
            )}
          </CardContent>
        </Card>
      </div>

      {/* ================================================================== */}
      {/* SECTION 3 : Services                                               */}
      {/* ================================================================== */}
      <div>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
          Services <span className="text-muted-foreground font-normal normal-case">(actualisation auto. 30s)</span>
        </h2>
        {loadingServices && !svc ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-20 rounded-lg bg-card animate-pulse" />
            ))}
          </div>
        ) : svc ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {/* PostgreSQL */}
            <ServiceCard
              name="PostgreSQL"
              status={svc.postgres.status}
              latencyMs={svc.postgres.latencyMs}
              error={svc.postgres.error}
              details={
                <>
                  <div className="flex justify-between">
                    <span>Connexions actives</span>
                    <span className="text-muted-foreground font-mono">
                      {svc.postgres.activeConnections ?? '?'} / {svc.postgres.maxConnections ?? '?'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Taille DB</span>
                    <span className="text-muted-foreground font-mono">
                      {svc.postgres.dbSizeMb ? formatBytes(svc.postgres.dbSizeMb) : '?'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Cache hit ratio</span>
                    <span className={`font-mono ${svc.postgres.cacheHitRatio && svc.postgres.cacheHitRatio >= 95 ? 'text-green-400' : 'text-yellow-400'}`}>
                      {svc.postgres.cacheHitRatio !== null ? `${svc.postgres.cacheHitRatio}%` : '?'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Locks en attente</span>
                    <span className={`font-mono ${svc.postgres.activeLocks === 0 ? 'text-muted-foreground' : 'text-red-400'}`}>
                      {svc.postgres.activeLocks ?? '?'}
                    </span>
                  </div>
                </>
              }
            />

            {/* Redis */}
            <ServiceCard
              name="Redis"
              status={svc.redis.status}
              latencyMs={svc.redis.latencyMs}
              error={svc.redis.error}
              details={
                <>
                  <div className="flex justify-between">
                    <span>Mémoire</span>
                    <span className="text-muted-foreground font-mono">
                      {svc.redis.memoryUsedMb !== null ? formatBytes(svc.redis.memoryUsedMb) : '?'}
                      {svc.redis.memoryMaxMb ? ` / ${formatBytes(svc.redis.memoryMaxMb)}` : ''}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Hit rate</span>
                    <span className={`font-mono ${svc.redis.hitRate && svc.redis.hitRate >= 80 ? 'text-green-400' : 'text-yellow-400'}`}>
                      {svc.redis.hitRate !== null ? `${svc.redis.hitRate}%` : 'N/A'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Clients</span>
                    <span className="text-muted-foreground font-mono">{svc.redis.connectedClients ?? '?'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Clés / ops·s⁻¹</span>
                    <span className="text-muted-foreground font-mono">
                      {svc.redis.keyCount ?? '?'} / {svc.redis.opsPerSec ?? '?'}
                    </span>
                  </div>
                </>
              }
            />

            {/* MinIO */}
            <ServiceCard
              name="MinIO (Stockage)"
              status={svc.minio.status}
              latencyMs={svc.minio.latencyMs}
              error={svc.minio.error}
              details={
                <div className="flex justify-between">
                  <span>Health check</span>
                  <span className={`font-mono ${svc.minio.status === 'healthy' ? 'text-green-400' : 'text-red-400'}`}>
                    {svc.minio.status === 'healthy' ? 'OK' : 'KO'}
                  </span>
                </div>
              }
            />

            {/* Ollama */}
            <ServiceCard
              name="Ollama (LLM local)"
              status={svc.ollama.status}
              latencyMs={svc.ollama.latencyMs}
              error={svc.ollama.error}
              details={
                <>
                  <div className="flex justify-between">
                    <span>Modèles chargés</span>
                    <span className="text-muted-foreground font-mono">{svc.ollama.models.length}</span>
                  </div>
                  {svc.ollama.models.slice(0, 3).map((m) => (
                    <div key={m} className="text-muted-foreground truncate">— {m}</div>
                  ))}
                  {svc.ollama.models.length > 3 && (
                    <div className="text-muted-foreground">... +{svc.ollama.models.length - 3} autres</div>
                  )}
                </>
              }
            />

            {/* Next.js */}
            <ServiceCard
              name="Next.js (app)"
              status={svc.nextjs.status}
              latencyMs={svc.nextjs.latencyMs}
              error={undefined}
              details={
                <>
                  <div className="flex justify-between">
                    <span>Uptime process</span>
                    <span className="text-muted-foreground font-mono">{formatUptime(svc.nextjs.uptimeSeconds)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Heap utilisé</span>
                    <span className="text-muted-foreground font-mono">{formatBytes(svc.nextjs.heapUsedMb)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Version</span>
                    <span className="text-muted-foreground font-mono">{svc.nextjs.details.version ?? '?'}</span>
                  </div>
                </>
              }
            />
          </div>
        ) : null}
      </div>

      {/* ================================================================== */}
      {/* SECTION 4 : Stats DB & Redis détaillées                           */}
      {/* ================================================================== */}
      {svc && svc.postgres.status !== 'unreachable' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* PostgreSQL stats */}
          <Card className="bg-background border-border">
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-sm text-muted-foreground font-semibold">Base de données — PostgreSQL</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4 space-y-2 text-sm">
              <StatRow label="Taille totale" value={svc.postgres.dbSizeMb ? formatBytes(svc.postgres.dbSizeMb) : 'N/A'} />
              <StatRow
                label="Connexions actives"
                value={`${svc.postgres.activeConnections ?? '?'} / ${svc.postgres.maxConnections ?? '?'}`}
                highlight={svc.postgres.activeConnections !== null && svc.postgres.maxConnections !== null &&
                  svc.postgres.activeConnections > svc.postgres.maxConnections * 0.8}
              />
              <StatRow
                label="Cache hit ratio"
                value={svc.postgres.cacheHitRatio !== null ? `${svc.postgres.cacheHitRatio}%` : 'N/A'}
                highlight={svc.postgres.cacheHitRatio !== null && svc.postgres.cacheHitRatio < 95}
                highlightColor="yellow"
              />
              <StatRow
                label="Locks en attente"
                value={String(svc.postgres.activeLocks ?? 'N/A')}
                highlight={svc.postgres.activeLocks !== null && svc.postgres.activeLocks > 0}
              />
              <StatRow label="Latence ping" value={svc.postgres.latencyMs !== null ? `${svc.postgres.latencyMs}ms` : 'N/A'} />
            </CardContent>
          </Card>

          {/* Redis stats */}
          <Card className="bg-background border-border">
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-sm text-muted-foreground font-semibold">Cache — Redis</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4 space-y-2 text-sm">
              <StatRow
                label="Mémoire utilisée"
                value={svc.redis.memoryUsedMb !== null
                  ? `${formatBytes(svc.redis.memoryUsedMb)}${svc.redis.memoryMaxMb ? ` / ${formatBytes(svc.redis.memoryMaxMb)}` : ''}`
                  : 'N/A'}
              />
              <StatRow
                label="Hit rate"
                value={svc.redis.hitRate !== null ? `${svc.redis.hitRate}%` : 'N/A'}
                highlight={svc.redis.hitRate !== null && svc.redis.hitRate < 80}
                highlightColor="yellow"
              />
              <StatRow label="Clients connectés" value={String(svc.redis.connectedClients ?? 'N/A')} />
              <StatRow label="Nb clés" value={String(svc.redis.keyCount ?? 'N/A')} />
              <StatRow label="Ops / sec (moy.)" value={svc.redis.opsPerSec !== null ? String(svc.redis.opsPerSec) : 'N/A'} />
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}

// =============================================================================
// HELPERS
// =============================================================================

function StatRow({
  label, value, highlight = false, highlightColor = 'red',
}: {
  label: string
  value: string
  highlight?: boolean
  highlightColor?: 'red' | 'yellow'
}) {
  return (
    <div className="flex items-center justify-between border-b border-border pb-1.5">
      <span className="text-muted-foreground">{label}</span>
      <span className={`font-mono text-sm ${
        highlight
          ? highlightColor === 'red' ? 'text-red-400' : 'text-yellow-400'
          : 'text-foreground'
      }`}>
        {value}
      </span>
    </div>
  )
}
