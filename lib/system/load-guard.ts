/**
 * Load Guard — Garde-fou charge serveur VPS
 *
 * Surveille le CPU (load average) et la RAM disponible pour éviter de
 * saturer le VPS pendant les opérations lourdes (indexation, backfill, crawl).
 *
 * Seuils calibrés pour VPS 8 vCPU / 24 Go RAM :
 *   safe       → load/vCPU < 0.50 ET RAM libre > 30%   → délai normal
 *   warning    → load/vCPU < 0.75 ET RAM libre > 15%   → délai × 3
 *   overloaded → sinon                                  → pause 10s
 */

import os from 'os'

export type LoadLevel = 'safe' | 'warning' | 'overloaded'

export interface SystemMetrics {
  cpuLoad1m: number
  cpuCount: number
  loadPerCpu: number
  freeMemPercent: number
  heapUsedMB: number
  loadLevel: LoadLevel
}

// Seuils CPU (load par vCPU)
const CPU_SAFE_THRESHOLD = 0.50      // < 50% CPU → safe
const CPU_WARNING_THRESHOLD = 0.75   // 50–75% CPU → warning, > 75% → overloaded

// Seuils RAM libre (en % de la RAM totale)
const MEM_SAFE_THRESHOLD = 30        // > 30% libre → safe
const MEM_WARNING_THRESHOLD = 15     // 15–30% libre → warning, < 15% → overloaded

export function getSystemMetrics(): SystemMetrics {
  const cpuLoad1m = os.loadavg()[0]
  const cpuCount = os.cpus().length
  const loadPerCpu = cpuLoad1m / cpuCount

  const totalMem = os.totalmem()
  const freeMem = os.freemem()
  const freeMemPercent = (freeMem / totalMem) * 100

  const heapUsedMB = Math.round(process.memoryUsage().heapUsed / 1024 / 1024)

  const loadLevel = computeLoadLevel(loadPerCpu, freeMemPercent)

  return { cpuLoad1m, cpuCount, loadPerCpu, freeMemPercent, heapUsedMB, loadLevel }
}

function computeLoadLevel(loadPerCpu: number, freeMemPercent: number): LoadLevel {
  if (loadPerCpu > CPU_WARNING_THRESHOLD || freeMemPercent < MEM_WARNING_THRESHOLD) {
    return 'overloaded'
  }
  if (loadPerCpu > CPU_SAFE_THRESHOLD || freeMemPercent < MEM_SAFE_THRESHOLD) {
    return 'warning'
  }
  return 'safe'
}

/**
 * Pause adaptative entre batches.
 * - safe       → baseDelayMs
 * - warning    → baseDelayMs × 3
 * - overloaded → 10 000ms (laisse le serveur respirer)
 */
export async function adaptiveSleep(baseDelayMs: number): Promise<LoadLevel> {
  const { loadLevel, loadPerCpu, freeMemPercent } = getSystemMetrics()

  let delay: number
  if (loadLevel === 'overloaded') {
    delay = 10_000
    console.warn(
      `[LoadGuard] Serveur surchargé (load/cpu=${loadPerCpu.toFixed(2)}, RAM libre=${freeMemPercent.toFixed(1)}%) — pause ${delay}ms`
    )
  } else if (loadLevel === 'warning') {
    delay = baseDelayMs * 3
    console.log(
      `[LoadGuard] Charge élevée (load/cpu=${loadPerCpu.toFixed(2)}, RAM libre=${freeMemPercent.toFixed(1)}%) — délai rallongé ${delay}ms`
    )
  } else {
    delay = baseDelayMs
  }

  await new Promise(resolve => setTimeout(resolve, delay))
  return loadLevel
}

/**
 * Attend que le serveur redescende à un niveau acceptable.
 * Retourne true si OK dans le délai, false si timeout.
 *
 * @param maxWaitMs  Temps maximum d'attente en ms (défaut : 30s)
 * @param pollMs     Intervalle de vérification (défaut : 5s)
 */
export async function waitForSafeLoad(
  maxWaitMs: number = 30_000,
  pollMs: number = 5_000
): Promise<boolean> {
  const deadline = Date.now() + maxWaitMs

  while (Date.now() < deadline) {
    const { loadLevel } = getSystemMetrics()
    if (loadLevel !== 'overloaded') return true
    await new Promise(resolve => setTimeout(resolve, pollMs))
  }

  return false
}
