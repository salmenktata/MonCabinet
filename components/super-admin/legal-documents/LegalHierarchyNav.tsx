import Link from 'next/link'
import { NORM_LEVELS_ORDERED, NORM_LEVEL_CONFIG, type NormLevel } from '@/lib/categories/norm-levels'

interface LegalHierarchyNavProps {
  normLevelCounts: Record<string, number>
  selectedNormLevel: string | null
  buildHref: (normLevel: string | undefined) => string
  totalCount: number
}

// Couleurs dark-theme pour chaque niveau (bg hover + border actif)
const DARK_COLORS: Record<NormLevel, { card: string; active: string; badge: string; rank: string }> = {
  constitution:       { card: 'hover:border-amber-500/50 hover:bg-amber-500/5',   active: 'border-amber-500/60 bg-amber-500/10',   badge: 'bg-amber-500/20 text-amber-300',  rank: 'text-amber-400' },
  traite_international:{ card: 'hover:border-purple-500/50 hover:bg-purple-500/5', active: 'border-purple-500/60 bg-purple-500/10', badge: 'bg-purple-500/20 text-purple-300', rank: 'text-purple-400' },
  loi_organique:      { card: 'hover:border-blue-500/50 hover:bg-blue-500/5',     active: 'border-blue-500/60 bg-blue-500/10',     badge: 'bg-blue-500/20 text-blue-300',    rank: 'text-blue-400' },
  loi_ordinaire:      { card: 'hover:border-sky-500/50 hover:bg-sky-500/5',       active: 'border-sky-500/60 bg-sky-500/10',       badge: 'bg-sky-500/20 text-sky-300',      rank: 'text-sky-400' },
  marsoum:            { card: 'hover:border-green-500/50 hover:bg-green-500/5',   active: 'border-green-500/60 bg-green-500/10',   badge: 'bg-green-500/20 text-green-300',  rank: 'text-green-400' },
  ordre_reglementaire:{ card: 'hover:border-teal-500/50 hover:bg-teal-500/5',     active: 'border-teal-500/60 bg-teal-500/10',     badge: 'bg-teal-500/20 text-teal-300',    rank: 'text-teal-400' },
  arrete_ministeriel: { card: 'hover:border-orange-500/50 hover:bg-orange-500/5', active: 'border-orange-500/60 bg-orange-500/10', badge: 'bg-orange-500/20 text-orange-300', rank: 'text-orange-400' },
  acte_local:         { card: 'hover:border-slate-400/50 hover:bg-slate-500/5',   active: 'border-slate-400/60 bg-slate-500/10',   badge: 'bg-slate-500/20 text-slate-300',  rank: 'text-slate-400' },
}

export function LegalHierarchyNav({
  normLevelCounts,
  selectedNormLevel,
  buildHref,
  totalCount,
}: LegalHierarchyNavProps) {
  return (
    <div className="space-y-3">
      {/* Titre section */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-widest text-slate-400">
            Hiérarchie des normes — الترتيب الهرمي للنصوص القانونية
          </span>
        </div>
        {selectedNormLevel && (
          <Link
            href={buildHref(undefined)}
            className="text-xs text-slate-400 hover:text-white transition-colors"
          >
            Voir tout ({totalCount})
          </Link>
        )}
      </div>

      {/* Grille de cartes hiérarchiques */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-4 gap-2">
        {NORM_LEVELS_ORDERED.map((config) => {
          const colors = DARK_COLORS[config.value]
          const count = normLevelCounts[config.value] || 0
          const isActive = selectedNormLevel === config.value

          return (
            <Link
              key={config.value}
              href={buildHref(config.value)}
              className={`
                group relative flex flex-col gap-1 p-3 rounded-lg border transition-all cursor-pointer
                ${isActive
                  ? `${colors.active} ring-1 ring-inset ring-white/10`
                  : `border-slate-700 bg-slate-900/40 ${colors.card}`
                }
              `}
            >
              {/* Rang + Nom AR */}
              <div className="flex items-center justify-between gap-1">
                <span className={`text-xs font-bold tabular-nums ${colors.rank}`}>
                  {config.order}
                </span>
                <span className="text-xs text-slate-300 font-medium text-right" dir="rtl" lang="ar">
                  {config.labelAr}
                </span>
              </div>

              {/* Nom FR */}
              <div className="text-xs font-medium text-slate-200 leading-tight">
                {config.labelFr}
              </div>

              {/* Count */}
              <div className={`
                mt-auto inline-flex items-center self-start px-1.5 py-0.5 rounded text-xs font-semibold tabular-nums
                ${count > 0 ? colors.badge : 'bg-slate-700/50 text-slate-500'}
              `}>
                {count > 0 ? count.toLocaleString('fr-FR') : '—'}
              </div>

              {/* Indicateur actif */}
              {isActive && (
                <span className="absolute top-2 right-2 h-1.5 w-1.5 rounded-full bg-white/60" />
              )}
            </Link>
          )
        })}

        {/* Carte "Non classé" */}
        {(() => {
          const unclassified = normLevelCounts['null'] || normLevelCounts[''] || 0
          const isActive = selectedNormLevel === 'null'
          return (
            <Link
              href={buildHref('null')}
              className={`
                group flex flex-col gap-1 p-3 rounded-lg border transition-all cursor-pointer
                ${isActive
                  ? 'border-slate-400/60 bg-slate-500/10 ring-1 ring-inset ring-white/10'
                  : 'border-slate-700 bg-slate-900/40 hover:border-slate-500/50 hover:bg-slate-700/20'
                }
              `}
            >
              <div className="flex items-center justify-between gap-1">
                <span className="text-xs font-bold text-slate-500">—</span>
                <span className="text-xs text-slate-500 text-right" dir="rtl">غير مصنف</span>
              </div>
              <div className="text-xs font-medium text-slate-400 leading-tight">Non classé</div>
              <div className="mt-auto inline-flex items-center self-start px-1.5 py-0.5 rounded text-xs font-semibold bg-slate-700/50 text-slate-400 tabular-nums">
                {unclassified > 0 ? unclassified.toLocaleString('fr-FR') : '—'}
              </div>
            </Link>
          )
        })()}
      </div>
    </div>
  )
}
