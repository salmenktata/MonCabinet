import { LEGAL_CATEGORY_TRANSLATIONS } from '@/lib/categories/legal-categories'
import type { LegalCategory } from '@/lib/categories/legal-categories'

/**
 * Formatte une date en format FR (court)
 */
export function formatDate(dateStr: string | null | undefined): string | null {
  if (!dateStr) return null
  try {
    return new Date(dateStr).toLocaleDateString('fr-FR')
  } catch {
    return null
  }
}

/**
 * Formatte une date en format FR long (ex: "15 juin 2023")
 */
export function formatDateLong(dateStr: string | null | undefined): string | null {
  if (!dateStr) return null
  try {
    return new Date(dateStr).toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    })
  } catch {
    return null
  }
}

/**
 * Label FR d'une catégorie juridique
 */
export function getCategoryLabel(category: string): string {
  const translations = LEGAL_CATEGORY_TRANSLATIONS[category as LegalCategory]
  return translations?.fr || category
}

/**
 * Couleur de bordure gauche pour les cartes document
 */
const CATEGORY_BORDER_COLORS: Record<string, string> = {
  legislation: 'border-l-blue-500',
  jurisprudence: 'border-l-purple-500',
  doctrine: 'border-l-green-500',
  jort: 'border-l-red-500',
  modeles: 'border-l-orange-500',
  procedures: 'border-l-cyan-500',
  formulaires: 'border-l-yellow-500',
  codes: 'border-l-indigo-500',
  constitution: 'border-l-pink-500',
  conventions: 'border-l-teal-500',
  guides: 'border-l-lime-500',
  lexique: 'border-l-emerald-500',
  google_drive: 'border-l-violet-500',
}

export function getCategoryBorderColor(category: string): string {
  return CATEGORY_BORDER_COLORS[category] || 'border-l-slate-500'
}

/**
 * Couleur du badge de pertinence (similarity score)
 */
export function getSimilarityColor(similarity: number): string {
  const pct = similarity * 100
  if (pct >= 80) return 'bg-green-500/20 text-green-700 dark:text-green-400 border-green-500/30'
  if (pct >= 60) return 'bg-yellow-500/20 text-yellow-700 dark:text-yellow-400 border-yellow-500/30'
  return 'bg-muted text-muted-foreground'
}

/**
 * Styles unifiés pour les cartes catégorie (landing page)
 * Map explicite pour compatibilité Tailwind CSS purge
 */
const CATEGORY_CARD_STYLES: Record<string, { borderClass: string; iconColor: string; hoverBg: string }> = {
  codes: { borderClass: 'border-indigo-500', iconColor: 'text-indigo-500', hoverBg: 'hover:bg-indigo-500/5' },
  jurisprudence: { borderClass: 'border-purple-500', iconColor: 'text-purple-500', hoverBg: 'hover:bg-purple-500/5' },
  doctrine: { borderClass: 'border-green-500', iconColor: 'text-green-500', hoverBg: 'hover:bg-green-500/5' },
  legislation: { borderClass: 'border-blue-500', iconColor: 'text-blue-500', hoverBg: 'hover:bg-blue-500/5' },
  procedures: { borderClass: 'border-cyan-500', iconColor: 'text-cyan-500', hoverBg: 'hover:bg-cyan-500/5' },
  conventions: { borderClass: 'border-teal-500', iconColor: 'text-teal-500', hoverBg: 'hover:bg-teal-500/5' },
  constitution: { borderClass: 'border-pink-500', iconColor: 'text-pink-500', hoverBg: 'hover:bg-pink-500/5' },
  jort: { borderClass: 'border-red-500', iconColor: 'text-red-500', hoverBg: 'hover:bg-red-500/5' },
  modeles: { borderClass: 'border-orange-500', iconColor: 'text-orange-500', hoverBg: 'hover:bg-orange-500/5' },
  formulaires: { borderClass: 'border-yellow-500', iconColor: 'text-yellow-500', hoverBg: 'hover:bg-yellow-500/5' },
  guides: { borderClass: 'border-lime-500', iconColor: 'text-lime-500', hoverBg: 'hover:bg-lime-500/5' },
  lexique: { borderClass: 'border-emerald-500', iconColor: 'text-emerald-500', hoverBg: 'hover:bg-emerald-500/5' },
  google_drive: { borderClass: 'border-violet-500', iconColor: 'text-violet-500', hoverBg: 'hover:bg-violet-500/5' },
}

const DEFAULT_CARD_STYLE = { borderClass: 'border-slate-500', iconColor: 'text-slate-500', hoverBg: 'hover:bg-slate-500/5' }

export function getCategoryCardStyles(category: string): { borderClass: string; iconColor: string; hoverBg: string } {
  return CATEGORY_CARD_STYLES[category] || DEFAULT_CARD_STYLE
}
