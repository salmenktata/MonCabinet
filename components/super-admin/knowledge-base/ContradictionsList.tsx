'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Icons } from '@/lib/icons'
import { toast } from 'sonner'

interface Contradiction {
  id: string
  sourceDocumentId: string
  targetDocumentId: string
  relationType: string
  similarityScore: number
  contradictionType: string | null
  contradictionSeverity: 'low' | 'medium' | 'high' | 'critical' | null
  description: string | null
  sourceExcerpt: string | null
  targetExcerpt: string | null
  suggestedResolution: string | null
  status: 'pending' | 'confirmed' | 'dismissed' | 'resolved'
}

interface ContradictionsListProps {
  relations: Contradiction[]
  currentDocumentId: string
}

const SEVERITY_CONFIG = {
  low: { color: 'bg-blue-500/20 text-blue-400 border-blue-500/30', label: 'Faible' },
  medium: { color: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30', label: 'Moyen' },
  high: { color: 'bg-orange-500/20 text-orange-400 border-orange-500/30', label: 'Important' },
  critical: { color: 'bg-red-500/20 text-red-400 border-red-500/30', label: 'Critique' },
}

export function ContradictionsList({ relations, currentDocumentId }: ContradictionsListProps) {
  const router = useRouter()
  const [loading, setLoading] = useState<string | null>(null)

  const contradictions = relations.filter(r => r.relationType === 'contradiction')
  const duplicates = relations.filter(r => r.relationType === 'duplicate' || r.relationType === 'near_duplicate')

  const handleStatusUpdate = async (relationId: string, status: 'confirmed' | 'dismissed' | 'resolved') => {
    setLoading(relationId)
    try {
      const res = await fetch(`/api/admin/knowledge-base/relations/${relationId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      if (!res.ok) throw new Error('Erreur')
      toast.success('Statut mis à jour')
      router.refresh()
    } catch {
      toast.error('Erreur')
    } finally {
      setLoading(null)
    }
  }

  if (relations.length === 0) {
    return (
      <div className="text-center py-6 text-slate-400 text-sm">
        Aucune relation détectée
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {duplicates.length > 0 && (
        <div>
          <h4 className="text-sm font-medium text-slate-300 mb-2">
            Doublons ({duplicates.length})
          </h4>
          <div className="space-y-2">
            {duplicates.map((dup) => (
              <div key={dup.id} className="p-3 rounded-lg bg-slate-700/50 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="border-yellow-500/30 text-yellow-400 text-xs">
                    {Math.round(dup.similarityScore * 100)}%
                  </Badge>
                  <span className="text-sm text-slate-300">
                    {dup.relationType === 'duplicate' ? 'Doublon exact' : 'Quasi-doublon'}
                  </span>
                </div>
                <StatusActions
                  status={dup.status}
                  loading={loading === dup.id}
                  onUpdate={(s) => handleStatusUpdate(dup.id, s)}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {contradictions.length > 0 && (
        <div>
          <h4 className="text-sm font-medium text-slate-300 mb-2">
            Contradictions ({contradictions.length})
          </h4>
          <div className="space-y-3">
            {contradictions.map((c) => {
              const severity = c.contradictionSeverity
                ? SEVERITY_CONFIG[c.contradictionSeverity]
                : SEVERITY_CONFIG.medium

              return (
                <div key={c.id} className="p-3 rounded-lg bg-slate-700/50 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Badge className={`${severity.color} text-xs`}>
                        {severity.label}
                      </Badge>
                      {c.contradictionType && (
                        <span className="text-xs text-slate-400">{c.contradictionType}</span>
                      )}
                    </div>
                    <StatusActions
                      status={c.status}
                      loading={loading === c.id}
                      onUpdate={(s) => handleStatusUpdate(c.id, s)}
                    />
                  </div>

                  {c.description && (
                    <p className="text-sm text-slate-300">{c.description}</p>
                  )}

                  {(c.sourceExcerpt || c.targetExcerpt) && (
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      {c.sourceExcerpt && (
                        <div className="p-2 bg-slate-800 rounded">
                          <div className="text-slate-400 mb-1">Source</div>
                          <div className="text-slate-300 line-clamp-3">{c.sourceExcerpt}</div>
                        </div>
                      )}
                      {c.targetExcerpt && (
                        <div className="p-2 bg-slate-800 rounded">
                          <div className="text-slate-400 mb-1">Cible</div>
                          <div className="text-slate-300 line-clamp-3">{c.targetExcerpt}</div>
                        </div>
                      )}
                    </div>
                  )}

                  {c.suggestedResolution && (
                    <div className="text-xs text-blue-400 bg-blue-500/10 p-2 rounded">
                      <strong>Résolution suggérée :</strong> {c.suggestedResolution}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

function StatusActions({
  status,
  loading,
  onUpdate,
}: {
  status: string
  loading: boolean
  onUpdate: (status: 'confirmed' | 'dismissed' | 'resolved') => void
}) {
  if (status !== 'pending') {
    return (
      <Badge variant="outline" className="border-slate-600 text-slate-400 text-xs">
        {status === 'confirmed' ? 'Confirmé' : status === 'dismissed' ? 'Rejeté' : 'Résolu'}
      </Badge>
    )
  }

  return (
    <div className="flex items-center gap-1">
      {loading ? (
        <Icons.loader className="h-4 w-4 animate-spin text-slate-400" />
      ) : (
        <>
          <Button size="sm" variant="ghost" onClick={() => onUpdate('confirmed')} className="text-green-400 hover:bg-green-500/10 h-7 px-2 text-xs">
            Confirmer
          </Button>
          <Button size="sm" variant="ghost" onClick={() => onUpdate('dismissed')} className="text-slate-400 hover:bg-slate-600 h-7 px-2 text-xs">
            Rejeter
          </Button>
        </>
      )}
    </div>
  )
}
