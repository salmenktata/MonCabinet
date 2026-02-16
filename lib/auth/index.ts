/**
 * Auth exports centralisés
 * Re-exporte getSession et types pour compatibilité
 */

export { getSession } from './session'
export type { Session } from 'next-auth'

// Stub authOptions pour compatibilité (non utilisé avec getSession)
export const authOptions = {} as any
