/**
 * System Stats Collector — Métriques VPS temps réel
 *
 * Collecte :
 * - CPU % (via /proc/stat delta sur Linux, fallback loadavg sur macOS)
 * - RAM & Swap (via /proc/meminfo sur Linux, fallback os.totalmem/freemem)
 * - Disque (via commande df -k /)
 * - Load average (os.loadavg)
 * - Heap Node.js (process.memoryUsage)
 * - Uptime hôte + process
 *
 * Historique : snapshots dans Redis sorted set, 1440 points max (24h × 1/min)
 */

import * as os from 'os'
import * as fs from 'fs'
import { exec } from 'child_process'
import { promisify } from 'util'
import { getRedisClient } from '@/lib/cache/redis'

const execAsync = promisify(exec)

// =============================================================================
// TYPES
// =============================================================================

export interface SystemSnapshot {
  timestamp: number
  cpu: {
    usagePercent: number | null   // null sur macOS (pas de /proc/stat)
    loadAvg1m: number
    loadAvg5m: number
    loadAvg15m: number
    cores: number
  }
  memory: {
    totalMb: number
    usedMb: number
    freeMb: number
    availableMb: number
    usedPercent: number
  }
  swap: {
    totalMb: number
    usedMb: number
    usedPercent: number
  }
  disk: {
    totalGb: number
    usedGb: number
    freeGb: number
    usedPercent: number
    mountpoint: string
  } | null
  process: {
    uptimeSeconds: number
    heapUsedMb: number
    heapTotalMb: number
    rssMb: number
    nodeVersion: string
  }
  hostUptimeSeconds: number
  platform: string
}

export interface ServiceHealth {
  name: string
  status: 'healthy' | 'degraded' | 'unreachable'
  latencyMs: number | null
  details: Record<string, string | number | boolean | null>
  error?: string
}

export interface ServicesSnapshot {
  postgres: ServiceHealth & {
    activeConnections: number | null
    maxConnections: number | null
    dbSizeMb: number | null
    cacheHitRatio: number | null
    activeLocks: number | null
  }
  redis: ServiceHealth & {
    memoryUsedMb: number | null
    memoryMaxMb: number | null
    connectedClients: number | null
    opsPerSec: number | null
    hitRate: number | null
    keyCount: number | null
  }
  minio: ServiceHealth
  ollama: ServiceHealth & {
    models: string[]
  }
  nextjs: ServiceHealth & {
    uptimeSeconds: number
    heapUsedMb: number
  }
}

// History point compact pour Redis (taille minimale)
export interface HistoryPoint {
  t: number     // timestamp unix ms
  c: number | null   // cpu %
  r: number          // ram used %
  s: number          // swap used %
  d: number          // disk used %
  l: number          // load avg 1m
}

// =============================================================================
// REDIS KEYS
// =============================================================================

const REDIS_HISTORY_KEY = 'server:metrics:history'
const REDIS_CPU_PREV_KEY = 'server:cpu:prev_stat'
const MAX_HISTORY_POINTS = 1440   // 24h × 1 point/min
const HISTORY_TTL_MS = 24 * 60 * 60 * 1000   // 24h

// =============================================================================
// CPU — /proc/stat delta
// =============================================================================

interface CpuStatRaw {
  user: number; nice: number; system: number; idle: number
  iowait: number; irq: number; softirq: number; steal: number
}

function parseProcStat(): CpuStatRaw | null {
  try {
    const content = fs.readFileSync('/proc/stat', 'utf8')
    const line = content.split('\n')[0]
    const parts = line.split(/\s+/)
    return {
      user: parseInt(parts[1]),
      nice: parseInt(parts[2]),
      system: parseInt(parts[3]),
      idle: parseInt(parts[4]),
      iowait: parseInt(parts[5]) || 0,
      irq: parseInt(parts[6]) || 0,
      softirq: parseInt(parts[7]) || 0,
      steal: parseInt(parts[8]) || 0,
    }
  } catch {
    return null
  }
}

async function getCpuPercent(): Promise<number | null> {
  const current = parseProcStat()
  if (!current) return null

  try {
    const redis = await getRedisClient()
    const prevRaw = redis ? await redis.get(REDIS_CPU_PREV_KEY) : null
    const prev: CpuStatRaw | null = prevRaw ? JSON.parse(prevRaw) : null

    // Stocker le snapshot actuel
    if (redis) {
      await redis.set(REDIS_CPU_PREV_KEY, JSON.stringify(current), { EX: 120 })
    }

    if (!prev) return null   // Pas encore de référence

    const totalCurrent = Object.values(current).reduce((a, b) => a + b, 0)
    const totalPrev = Object.values(prev).reduce((a, b) => a + b, 0)
    const totalDelta = totalCurrent - totalPrev

    const idleDelta = (current.idle + current.iowait) - (prev.idle + prev.iowait)

    if (totalDelta <= 0) return null
    const usagePercent = Math.round((1 - idleDelta / totalDelta) * 1000) / 10
    return Math.max(0, Math.min(100, usagePercent))
  } catch {
    return null
  }
}

// =============================================================================
// MÉMOIRE — /proc/meminfo (Linux) ou os module (fallback)
// =============================================================================

function parseMeminfo(): { ram: SystemSnapshot['memory'], swap: SystemSnapshot['swap'] } {
  try {
    const content = fs.readFileSync('/proc/meminfo', 'utf8')
    const getValue = (key: string): number => {
      const match = content.match(new RegExp(`^${key}:\\s+(\\d+)\\s+kB`, 'm'))
      return match ? parseInt(match[1]) * 1024 : 0
    }
    const total = getValue('MemTotal')
    const free = getValue('MemFree')
    const available = getValue('MemAvailable')
    const used = total - available
    const swapTotal = getValue('SwapTotal')
    const swapFree = getValue('SwapFree')
    const swapUsed = swapTotal - swapFree

    return {
      ram: {
        totalMb: Math.round(total / 1024 / 1024),
        usedMb: Math.round(used / 1024 / 1024),
        freeMb: Math.round(free / 1024 / 1024),
        availableMb: Math.round(available / 1024 / 1024),
        usedPercent: total > 0 ? Math.round((used / total) * 1000) / 10 : 0,
      },
      swap: {
        totalMb: Math.round(swapTotal / 1024 / 1024),
        usedMb: Math.round(swapUsed / 1024 / 1024),
        usedPercent: swapTotal > 0 ? Math.round((swapUsed / swapTotal) * 1000) / 10 : 0,
      },
    }
  } catch {
    // Fallback macOS — pas de /proc/meminfo
    const total = os.totalmem()
    const free = os.freemem()
    const used = total - free
    return {
      ram: {
        totalMb: Math.round(total / 1024 / 1024),
        usedMb: Math.round(used / 1024 / 1024),
        freeMb: Math.round(free / 1024 / 1024),
        availableMb: Math.round(free / 1024 / 1024),
        usedPercent: Math.round((used / total) * 1000) / 10,
      },
      swap: { totalMb: 0, usedMb: 0, usedPercent: 0 },
    }
  }
}

// =============================================================================
// DISQUE — df -k /
// =============================================================================

async function getDiskStats(): Promise<SystemSnapshot['disk']> {
  try {
    const { stdout } = await execAsync('df -k / 2>/dev/null || df -k /app 2>/dev/null')
    const lines = stdout.trim().split('\n')
    if (lines.length < 2) return null
    const parts = lines[1].split(/\s+/)
    const totalKb = parseInt(parts[1])
    const usedKb = parseInt(parts[2])
    const freeKb = parseInt(parts[3])
    const mountpoint = parts[5] || '/'
    if (isNaN(totalKb)) return null
    return {
      totalGb: Math.round(totalKb / 1024 / 1024 * 10) / 10,
      usedGb: Math.round(usedKb / 1024 / 1024 * 10) / 10,
      freeGb: Math.round(freeKb / 1024 / 1024 * 10) / 10,
      usedPercent: totalKb > 0 ? Math.round((usedKb / totalKb) * 1000) / 10 : 0,
      mountpoint,
    }
  } catch {
    return null
  }
}

// =============================================================================
// SNAPSHOT PRINCIPAL
// =============================================================================

export async function collectSystemStats(): Promise<SystemSnapshot> {
  const [cpuPercent, diskStats, { ram, swap }] = await Promise.all([
    getCpuPercent(),
    getDiskStats(),
    Promise.resolve(parseMeminfo()),
  ])

  const [load1, load5, load15] = os.loadavg()
  const memUsage = process.memoryUsage()

  return {
    timestamp: Date.now(),
    cpu: {
      usagePercent: cpuPercent,
      loadAvg1m: Math.round(load1 * 100) / 100,
      loadAvg5m: Math.round(load5 * 100) / 100,
      loadAvg15m: Math.round(load15 * 100) / 100,
      cores: os.cpus().length,
    },
    memory: ram,
    swap,
    disk: diskStats,
    process: {
      uptimeSeconds: Math.round(process.uptime()),
      heapUsedMb: Math.round(memUsage.heapUsed / 1024 / 1024),
      heapTotalMb: Math.round(memUsage.heapTotal / 1024 / 1024),
      rssMb: Math.round(memUsage.rss / 1024 / 1024),
      nodeVersion: process.version,
    },
    hostUptimeSeconds: Math.round(os.uptime()),
    platform: os.platform(),
  }
}

// =============================================================================
// SERVICES HEALTH
// =============================================================================

export async function getServicesHealth(): Promise<ServicesSnapshot> {
  const [postgres, redis, minio, ollama] = await Promise.allSettled([
    checkPostgres(),
    checkRedis(),
    checkMinio(),
    checkOllama(),
  ])

  const memUsage = process.memoryUsage()

  return {
    postgres: postgres.status === 'fulfilled' ? postgres.value : {
      name: 'PostgreSQL', status: 'unreachable', latencyMs: null,
      details: {}, error: String(postgres.reason),
      activeConnections: null, maxConnections: null, dbSizeMb: null,
      cacheHitRatio: null, activeLocks: null,
    },
    redis: redis.status === 'fulfilled' ? redis.value : {
      name: 'Redis', status: 'unreachable', latencyMs: null,
      details: {}, error: String(redis.reason),
      memoryUsedMb: null, memoryMaxMb: null, connectedClients: null,
      opsPerSec: null, hitRate: null, keyCount: null,
    },
    minio: minio.status === 'fulfilled' ? minio.value : {
      name: 'MinIO', status: 'unreachable', latencyMs: null,
      details: {}, error: String(minio.reason),
    },
    ollama: ollama.status === 'fulfilled' ? ollama.value : {
      name: 'Ollama', status: 'unreachable', latencyMs: null,
      details: {}, error: String(ollama.reason), models: [],
    },
    nextjs: {
      name: 'Next.js',
      status: 'healthy',
      latencyMs: 0,
      details: { version: process.env.npm_package_version || 'unknown' },
      uptimeSeconds: Math.round(process.uptime()),
      heapUsedMb: Math.round(memUsage.heapUsed / 1024 / 1024),
    },
  }
}

async function checkPostgres(): Promise<ServicesSnapshot['postgres']> {
  const { getPool } = await import('@/lib/db/postgres')
  const start = Date.now()
  const pool = getPool()
  const client = await pool.connect()
  try {
    const [statsRes, sizeRes, locksRes] = await Promise.all([
      client.query(`
        SELECT
          (SELECT count(*)::int FROM pg_stat_activity WHERE state != 'idle') AS active_connections,
          (SELECT setting::int FROM pg_settings WHERE name = 'max_connections') AS max_connections,
          (SELECT ROUND(blks_hit::numeric / NULLIF(blks_hit + blks_read, 0) * 100, 1)
           FROM pg_stat_database WHERE datname = current_database()) AS cache_hit_ratio
      `),
      client.query(`SELECT ROUND(pg_database_size(current_database()) / 1024.0 / 1024.0, 1) AS size_mb`),
      client.query(`SELECT count(*)::int AS locks FROM pg_locks WHERE granted = false`),
    ])
    const latencyMs = Date.now() - start
    const stats = statsRes.rows[0]
    return {
      name: 'PostgreSQL',
      status: latencyMs < 500 ? 'healthy' : 'degraded',
      latencyMs,
      details: {},
      activeConnections: stats.active_connections,
      maxConnections: stats.max_connections,
      dbSizeMb: parseFloat(sizeRes.rows[0].size_mb),
      cacheHitRatio: parseFloat(stats.cache_hit_ratio) || null,
      activeLocks: locksRes.rows[0].locks,
    }
  } finally {
    client.release()
  }
}

async function checkRedis(): Promise<ServicesSnapshot['redis']> {
  const redis = await getRedisClient()
  if (!redis) throw new Error('Redis client unavailable')
  const start = Date.now()
  const info = await redis.info()
  const latencyMs = Date.now() - start

  const getValue = (key: string): string | null => {
    const match = info.match(new RegExp(`^${key}:(.+)$`, 'm'))
    return match ? match[1].trim() : null
  }

  const usedMemoryBytes = parseInt(getValue('used_memory') || '0')
  const maxMemoryBytes = parseInt(getValue('maxmemory') || '0')
  const hits = parseInt(getValue('keyspace_hits') || '0')
  const misses = parseInt(getValue('keyspace_misses') || '0')
  const totalCmds = parseInt(getValue('total_commands_processed') || '0')
  const connectedClients = parseInt(getValue('connected_clients') || '0')
  const uptimeSeconds = parseInt(getValue('uptime_in_seconds') || '0')

  // Compter les clés total
  let keyCount = 0
  const keystats = await redis.info('keyspace')
  const keyMatch = keystats.match(/keys=(\d+)/g)
  if (keyMatch) keyCount = keyMatch.reduce((sum, m) => sum + parseInt(m.replace('keys=', '')), 0)

  const hitRate = (hits + misses) > 0 ? Math.round(hits / (hits + misses) * 1000) / 10 : null

  // ops/sec estimé
  const opsPerSec = uptimeSeconds > 0 ? Math.round(totalCmds / uptimeSeconds) : null

  return {
    name: 'Redis',
    status: latencyMs < 100 ? 'healthy' : 'degraded',
    latencyMs,
    details: { version: getValue('redis_version') || 'unknown' },
    memoryUsedMb: Math.round(usedMemoryBytes / 1024 / 1024),
    memoryMaxMb: maxMemoryBytes > 0 ? Math.round(maxMemoryBytes / 1024 / 1024) : null,
    connectedClients,
    opsPerSec,
    hitRate,
    keyCount,
  }
}

async function checkMinio(): Promise<ServiceHealth> {
  const rawEndpoint = process.env.MINIO_ENDPOINT || 'localhost'
  const port = process.env.MINIO_PORT || '9000'
  const useSSL = process.env.MINIO_USE_SSL === 'true'
  let minioEndpoint: string
  if (rawEndpoint.startsWith('http://') || rawEndpoint.startsWith('https://')) {
    minioEndpoint = rawEndpoint.replace(/\/$/, '')
  } else {
    // Extraire le host sans port si rawEndpoint contient déjà un port
    const host = rawEndpoint.includes(':') ? rawEndpoint.split(':')[0] : rawEndpoint
    minioEndpoint = `${useSSL ? 'https' : 'http'}://${host}:${port}`
  }
  const healthUrl = `${minioEndpoint}/minio/health/live`
  const start = Date.now()
  try {
    const res = await fetch(healthUrl, { method: 'HEAD', signal: AbortSignal.timeout(5000) })
    const latencyMs = Date.now() - start
    return {
      name: 'MinIO',
      status: res.ok ? 'healthy' : 'degraded',
      latencyMs,
      details: { statusCode: res.status },
    }
  } catch (err) {
    return {
      name: 'MinIO',
      status: 'unreachable',
      latencyMs: Date.now() - start,
      details: {},
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

async function checkOllama(): Promise<ServicesSnapshot['ollama']> {
  const ollamaUrl = process.env.OLLAMA_BASE_URL || 'http://localhost:11434'
  const start = Date.now()
  try {
    const res = await fetch(`${ollamaUrl}/api/tags`, { signal: AbortSignal.timeout(5000) })
    const latencyMs = Date.now() - start
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json()
    const models: string[] = (data.models || []).map((m: { name: string }) => m.name)
    return {
      name: 'Ollama',
      status: 'healthy',
      latencyMs,
      details: { modelCount: models.length },
      models,
    }
  } catch (err) {
    return {
      name: 'Ollama',
      status: 'unreachable',
      latencyMs: Date.now() - start,
      details: {},
      error: err instanceof Error ? err.message : String(err),
      models: [],
    }
  }
}

// =============================================================================
// HISTORIQUE REDIS
// =============================================================================

export async function storeSnapshotToRedis(snapshot: SystemSnapshot): Promise<void> {
  try {
    const redis = await getRedisClient()
    if (!redis) return

    const point: HistoryPoint = {
      t: snapshot.timestamp,
      c: snapshot.cpu.usagePercent,
      r: snapshot.memory.usedPercent,
      s: snapshot.swap.usedPercent,
      d: snapshot.disk?.usedPercent ?? 0,
      l: snapshot.cpu.loadAvg1m,
    }

    const cutoffMs = Date.now() - HISTORY_TTL_MS

    await Promise.all([
      // Ajouter le nouveau point (score = timestamp pour tri chronologique)
      redis.zAdd(REDIS_HISTORY_KEY, { score: snapshot.timestamp, value: JSON.stringify(point) }),
      // Supprimer les vieux points > 24h
      redis.zRemRangeByScore(REDIS_HISTORY_KEY, 0, cutoffMs),
    ])

    // Garder max 1440 points
    const count = await redis.zCard(REDIS_HISTORY_KEY)
    if (count > MAX_HISTORY_POINTS) {
      // Supprimer les plus anciens en supprimant par range d'index
      await redis.zRemRangeByRank(REDIS_HISTORY_KEY, 0, count - MAX_HISTORY_POINTS - 1)
    }

    // TTL sur la clé entière
    await redis.expire(REDIS_HISTORY_KEY, 25 * 3600)
  } catch {
    // Fire-and-forget : pas de crash si Redis indisponible
  }
}

export async function getHistoryFromRedis(hours: 1 | 6 | 24 = 24): Promise<HistoryPoint[]> {
  try {
    const redis = await getRedisClient()
    if (!redis) return []

    const cutoffMs = Date.now() - hours * 60 * 60 * 1000
    const members = await redis.zRangeByScore(
      REDIS_HISTORY_KEY,
      cutoffMs,
      Date.now(),
      { LIMIT: { offset: 0, count: MAX_HISTORY_POINTS } }
    )
    return members.map((m) => JSON.parse(m) as HistoryPoint)
  } catch {
    return []
  }
}
