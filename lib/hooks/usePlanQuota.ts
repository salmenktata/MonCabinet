'use client'

import { useQuery } from '@tanstack/react-query'
import { PLAN_LIMITS, type PlanType } from '@/lib/plans/plan-config'

interface PlanQuotaData {
  plan: PlanType
  maxDossiers: number
  maxClients: number
  currentDossiers: number
  currentClients: number
  aiUsesRemaining: number | null
  aiUsesTotal: number | null
}

async function fetchPlanQuota(): Promise<PlanQuotaData> {
  const res = await fetch('/api/user/plan-quota')
  if (!res.ok) throw new Error('Failed to fetch plan quota')
  return res.json()
}

export function usePlanQuota() {
  return useQuery({
    queryKey: ['plan-quota'],
    queryFn: fetchPlanQuota,
    staleTime: 30_000, // 30s — données légèrement différées OK
    gcTime: 60_000,
  })
}

/** Retourne 'safe' | 'warning' | 'danger' selon le ratio utilisé/total */
export function getCountAlertLevel(
  current: number,
  max: number
): 'safe' | 'warning' | 'danger' {
  if (max === Infinity || max === 0) return 'safe'
  const ratio = current / max
  if (ratio >= 1) return 'danger'
  if (ratio >= 0.8) return 'warning' // ≥ 80% → warning
  return 'safe'
}
