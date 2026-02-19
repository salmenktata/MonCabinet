import crypto from 'crypto'

/**
 * Vérifie le CRON_SECRET avec timing-safe comparison
 * Supporte le format brut et le format "Bearer <secret>"
 */
export function verifyCronSecret(provided: string | null): boolean {
  const expected = process.env.CRON_SECRET
  if (!provided || !expected) return false

  const clean = provided.replace(/^Bearer\s+/i, '')
  if (clean.length !== expected.length) return false

  return crypto.timingSafeEqual(Buffer.from(clean), Buffer.from(expected))
}
