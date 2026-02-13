/**
 * Types pour le système d'abrogations juridiques tunisiennes
 */

export type AbrogationScope = 'total' | 'partial' | 'implicit'
export type AbrogationConfidence = 'high' | 'medium' | 'low'
export type AbrogationVerificationStatus = 'verified' | 'pending' | 'disputed'

export type LegalDomain =
  | 'penal'
  | 'civil'
  | 'commercial'
  | 'travail'
  | 'administratif'
  | 'constitutionnel'
  | 'fiscal'
  | 'famille'
  | 'procedure_civile'
  | 'procedure_penale'
  | 'foncier'
  | 'autre'

export interface LegalAbrogation {
  id: string
  abrogatedReference: string
  abrogatedReferenceAr: string
  abrogatingReference: string
  abrogatingReferenceAr: string
  abrogationDate: string
  scope: AbrogationScope
  affectedArticles: string[]
  jortUrl?: string
  sourceUrl?: string
  notes?: string
  domain?: LegalDomain | null
  verified: boolean
  confidence: AbrogationConfidence
  verificationStatus: AbrogationVerificationStatus
  createdAt?: string
  updatedAt?: string
}

export interface AbrogationSearchResult extends LegalAbrogation {
  similarityScore: number
}

export interface AbrogationListResponse {
  total: number
  limit: number
  offset: number
  data: LegalAbrogation[]
}

export interface AbrogationSearchResponse {
  total: number
  query: string
  threshold: number
  data: AbrogationSearchResult[]
}

export interface AbrogationStats {
  total: number
  byDomain: Record<LegalDomain, number>
  byScope: Record<AbrogationScope, number>
  byConfidence: Record<AbrogationConfidence, number>
  verified: number
  pending: number
  disputed: number
  recentAbrogations: LegalAbrogation[]
}
