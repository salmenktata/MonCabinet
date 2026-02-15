'use client'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { ConsultationResponse, ConsultationHistoryItem } from '@/app/actions/consultation'

export function useConsultationHistory() {
  return useQuery<ConsultationHistoryItem[]>({
    queryKey: ['consultation-history'],
    queryFn: async () => {
      const res = await fetch('/api/consultations?limit=50')
      if (!res.ok) throw new Error('Erreur chargement historique')
      return res.json()
    },
    staleTime: 30_000,
    gcTime: 5 * 60_000,
  })
}

export function useConsultation(id: string | null) {
  return useQuery<ConsultationResponse>({
    queryKey: ['consultation', id],
    queryFn: async () => {
      const res = await fetch(`/api/consultations?id=${id}`)
      if (!res.ok) throw new Error('Consultation non trouvée')
      return res.json()
    },
    enabled: !!id,
    staleTime: 30_000,
    gcTime: 5 * 60_000,
  })
}

export function useInvalidateConsultationHistory() {
  const queryClient = useQueryClient()
  return () => queryClient.invalidateQueries({ queryKey: ['consultation-history'] })
}
