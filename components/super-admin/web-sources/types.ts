/**
 * Types partagés pour les composants web sources
 * Types sérialisés (dates en string) pour les composants client
 */

import type { WebSourceCategory, WebSourceLanguage, HealthStatus } from '@/lib/web-scraper/types'

export type { WebSourceCategory, WebSourceLanguage, HealthStatus }

/**
 * Source web sérialisée pour les composants client (dates en string, noms snake_case SQL)
 */
export interface WebSourceListItem {
  id: string
  name: string
  base_url: string
  description: string | null
  category: string
  language: string
  priority: number
  is_active: boolean
  health_status: string
  consecutive_failures: number
  last_crawl_at: string | null
  next_crawl_at: string | null
  pages_count: number
  indexed_count: number
  total_pages_discovered: number
  avg_pages_per_crawl: number
  drive_config: Record<string, unknown> | null
}

/**
 * Stats globales des sources web
 */
export interface WebSourcesStatsData {
  totalSources: number
  activeSources: number
  healthySources: number
  failingSources: number
  totalPages: number
  indexedPages: number
  pendingJobs: number
  runningJobs: number
}

/**
 * Champs triables
 */
export type SortField = 'name' | 'last_crawl_at' | 'pages_count' | 'priority' | 'indexation_rate'

/**
 * Direction du tri
 */
export type SortDirection = 'asc' | 'desc'

/**
 * Vues disponibles
 */
export type ViewMode = 'table' | 'cards'
