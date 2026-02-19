/**
 * Utilitaires pour les composants web sources
 */

/**
 * Formate une date en temps relatif ("il y a 2h", "il y a 3j")
 */
export function formatRelativeTime(dateStr: string | null): string {
  if (!dateStr) return '—'

  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()

  if (diffMs < 0) {
    // Date dans le futur
    const absDiff = Math.abs(diffMs)
    if (absDiff < 60_000) return 'dans <1 min'
    if (absDiff < 3_600_000) return `dans ${Math.floor(absDiff / 60_000)} min`
    if (absDiff < 86_400_000) return `dans ${Math.floor(absDiff / 3_600_000)}h`
    return `dans ${Math.floor(absDiff / 86_400_000)}j`
  }

  if (diffMs < 60_000) return 'il y a <1 min'
  if (diffMs < 3_600_000) return `il y a ${Math.floor(diffMs / 60_000)} min`
  if (diffMs < 86_400_000) return `il y a ${Math.floor(diffMs / 3_600_000)}h`
  if (diffMs < 2_592_000_000) return `il y a ${Math.floor(diffMs / 86_400_000)}j`
  return date.toLocaleDateString('fr-FR')
}

/**
 * Calcule le pourcentage d'indexation
 */
export function getIndexationPercentage(indexed: number, total: number): number {
  if (total === 0) return 0
  return Math.round((indexed / total) * 100)
}

/**
 * Détermine le type de source (web ou Google Drive)
 */
export function getSourceType(driveConfig: Record<string, unknown> | null): 'web' | 'gdrive' {
  return driveConfig ? 'gdrive' : 'web'
}
