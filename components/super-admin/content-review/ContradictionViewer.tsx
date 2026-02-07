'use client'

import { Badge } from '@/components/ui/badge'
import { Icons } from '@/lib/icons'
import type { ContentContradiction, ContradictionSeverity } from '@/lib/web-scraper/types'

interface ContradictionViewerProps {
  contradictions: ContentContradiction[]
}

const SEVERITY_COLORS: Record<ContradictionSeverity, string> = {
  low: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  medium: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  high: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  critical: 'bg-red-500/20 text-red-400 border-red-500/30',
}

const SEVERITY_LABELS: Record<ContradictionSeverity, string> = {
  low: 'Faible',
  medium: 'Moyenne',
  high: 'Haute',
  critical: 'Critique',
}

const TYPE_LABELS: Record<string, string> = {
  version_conflict: 'Conflit de version',
  interpretation_conflict: 'Conflit d\'interprétation',
  date_conflict: 'Conflit de date',
  legal_update: 'Mise à jour légale',
  doctrine_vs_practice: 'Doctrine vs pratique',
  cross_reference_error: 'Erreur de référence',
}

export function ContradictionViewer({ contradictions }: ContradictionViewerProps) {
  if (contradictions.length === 0) {
    return (
      <div className="text-center py-4 text-slate-500">
        Aucune contradiction détectée
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {contradictions.map((contradiction) => (
        <ContradictionCard key={contradiction.id} contradiction={contradiction} />
      ))}
    </div>
  )
}

function ContradictionCard({ contradiction }: { contradiction: ContentContradiction }) {
  return (
    <div className="border border-slate-700 rounded-lg overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between p-3 bg-slate-800/50">
        <div className="flex items-center gap-2">
          <Badge
            variant="outline"
            className={SEVERITY_COLORS[contradiction.severity]}
          >
            {SEVERITY_LABELS[contradiction.severity]}
          </Badge>
          <span className="text-sm text-slate-400">
            {TYPE_LABELS[contradiction.contradictionType] || contradiction.contradictionType}
          </span>
        </div>
        <Badge
          variant="outline"
          className={
            contradiction.status === 'pending'
              ? 'bg-yellow-500/20 text-yellow-400'
              : contradiction.status === 'resolved'
              ? 'bg-green-500/20 text-green-400'
              : 'bg-slate-500/20 text-slate-400'
          }
        >
          {contradiction.status === 'pending' ? 'En attente' :
           contradiction.status === 'resolved' ? 'Résolu' :
           contradiction.status === 'dismissed' ? 'Rejeté' :
           contradiction.status}
        </Badge>
      </div>

      {/* Description */}
      <div className="p-3 border-t border-slate-700">
        <p className="text-sm text-slate-300">{contradiction.description}</p>
      </div>

      {/* Excerpts */}
      {(contradiction.sourceExcerpt || contradiction.targetExcerpt) && (
        <div className="grid grid-cols-2 gap-2 p-3 border-t border-slate-700 bg-slate-800/30">
          {contradiction.sourceExcerpt && (
            <div>
              <div className="text-xs text-slate-500 mb-1 flex items-center gap-1">
                <Icons.fileText className="h-3 w-3" />
                Document source
              </div>
              <p className="text-xs text-slate-400 bg-slate-800 p-2 rounded">
                "{contradiction.sourceExcerpt}"
              </p>
            </div>
          )}
          {contradiction.targetExcerpt && (
            <div>
              <div className="text-xs text-slate-500 mb-1 flex items-center gap-1">
                <Icons.fileText className="h-3 w-3" />
                Document cible
              </div>
              <p className="text-xs text-slate-400 bg-slate-800 p-2 rounded">
                "{contradiction.targetExcerpt}"
              </p>
            </div>
          )}
        </div>
      )}

      {/* Impact et résolution suggérée */}
      {(contradiction.legalImpact || contradiction.suggestedResolution) && (
        <div className="p-3 border-t border-slate-700 space-y-2">
          {contradiction.legalImpact && (
            <div>
              <span className="text-xs text-orange-400 font-medium">Impact juridique:</span>
              <p className="text-xs text-slate-400 mt-1">{contradiction.legalImpact}</p>
            </div>
          )}
          {contradiction.suggestedResolution && (
            <div>
              <span className="text-xs text-emerald-400 font-medium">Résolution suggérée:</span>
              <p className="text-xs text-slate-400 mt-1">{contradiction.suggestedResolution}</p>
            </div>
          )}
        </div>
      )}

      {/* Références affectées */}
      {contradiction.affectedReferences && contradiction.affectedReferences.length > 0 && (
        <div className="p-3 border-t border-slate-700">
          <span className="text-xs text-slate-500">Références affectées:</span>
          <div className="flex flex-wrap gap-1 mt-1">
            {contradiction.affectedReferences.map((ref, i) => (
              <Badge key={i} variant="outline" className="text-xs bg-slate-800">
                {ref.reference}
              </Badge>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export function ContradictionSummary({
  contradictions,
}: {
  contradictions: ContentContradiction[]
}) {
  if (contradictions.length === 0) return null

  const bySeverity = contradictions.reduce(
    (acc, c) => {
      acc[c.severity] = (acc[c.severity] || 0) + 1
      return acc
    },
    {} as Record<ContradictionSeverity, number>
  )

  return (
    <div className="flex items-center gap-2">
      <Icons.alertTriangle className="h-4 w-4 text-orange-400" />
      <span className="text-sm text-slate-400">
        {contradictions.length} contradiction{contradictions.length > 1 ? 's' : ''}:
      </span>
      {Object.entries(bySeverity).map(([severity, count]) => (
        <Badge
          key={severity}
          variant="outline"
          className={SEVERITY_COLORS[severity as ContradictionSeverity]}
        >
          {count} {SEVERITY_LABELS[severity as ContradictionSeverity].toLowerCase()}
        </Badge>
      ))}
    </div>
  )
}
