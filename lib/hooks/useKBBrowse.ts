'use client'

import { useQuery } from '@tanstack/react-query'

export interface KBBrowseParams {
  category?: string
  normLevel?: string
  docType?: string
  limit?: number
  offset?: number
  sort?: 'date' | 'title'
  enabled?: boolean
}

export interface KBBrowseResult {
  success: boolean
  results: Array<{
    kbId: string
    title: string
    category: string
    normLevel: string | null
    docType: string | null
    updatedAt: string | null
    similarity: null
    metadata: Record<string, unknown>
  }>
  pagination: {
    total: number
    limit: number
    offset: number
    hasMore: boolean
  }
}

async function fetchKBBrowse(params: {
  category?: string
  normLevel?: string
  docType?: string
  limit: number
  offset: number
  sort: string
}): Promise<KBBrowseResult> {
  const qs = new URLSearchParams({
    limit: String(params.limit),
    offset: String(params.offset),
    sort: params.sort,
  })
  if (params.category) qs.set('category', params.category)
  if (params.normLevel) qs.set('norm_level', params.normLevel)
  if (params.docType) qs.set('doc_type', params.docType)

  const response = await fetch(`/api/client/kb/browse?${qs}`)

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Erreur inconnue' }))
    throw new Error(error.error || `HTTP ${response.status}`)
  }

  return response.json()
}

export function useKBBrowse({
  category,
  normLevel,
  docType,
  limit = 50,
  offset = 0,
  sort = 'date',
  enabled = true,
}: KBBrowseParams = {}) {
  return useQuery({
    queryKey: ['kb-browse', category, normLevel, docType, offset, sort],
    queryFn: () =>
      fetchKBBrowse({
        category,
        normLevel,
        docType,
        limit,
        offset,
        sort,
      }),
    enabled: enabled && (!!category || !!normLevel || !!docType),
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  })
}
