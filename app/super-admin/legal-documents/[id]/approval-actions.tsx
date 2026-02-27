'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Icons } from '@/lib/icons'
import { toast } from 'sonner'

interface ApprovalActionsProps {
  documentId: string
  isApproved: boolean
  consolidationStatus: string
  approvedAt: string | null
  isAbrogated?: boolean
}

export function ApprovalActions({
  documentId,
  isApproved,
  consolidationStatus,
  approvedAt,
  isAbrogated = false,
}: ApprovalActionsProps) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [revokeConfirm, setRevokeConfirm] = useState(false)
  const [reindexLoading, setReindexLoading] = useState(false)

  const canApprove = consolidationStatus === 'complete' && !isApproved

  async function handleApprove() {
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/legal-documents/${documentId}/approve`, { method: 'POST' })
      const data = await res.json()
      if (res.ok) {
        const chunks = data.indexing?.chunksCreated ?? data.chunks_count ?? 0
        toast.success(`Document approuvé et indexé — ${chunks} chunk${chunks !== 1 ? 's' : ''} créé${chunks !== 1 ? 's' : ''}`)
        router.refresh()
      } else {
        toast.error(data.error || 'Erreur lors de l\'approbation')
      }
    } catch {
      toast.error('Erreur réseau')
    } finally {
      setLoading(false)
    }
  }

  async function handleReindex() {
    setReindexLoading(true)
    try {
      const res = await fetch(`/api/admin/legal-documents/${documentId}/reindex`, { method: 'POST' })
      const data = await res.json()
      if (res.ok) {
        const chunks = data.chunksCreated ?? 0
        toast.success(`Document réindexé — ${chunks} chunk${chunks !== 1 ? 's' : ''} créé${chunks !== 1 ? 's' : ''}`)
        router.refresh()
      } else {
        toast.error(data.error || 'Erreur lors de la réindexation')
      }
    } catch {
      toast.error('Erreur réseau')
    } finally {
      setReindexLoading(false)
    }
  }

  async function handleRevoke() {
    if (!revokeConfirm) {
      setRevokeConfirm(true)
      // Auto-annuler après 5 secondes
      setTimeout(() => setRevokeConfirm(false), 5000)
      return
    }
    setLoading(true)
    setRevokeConfirm(false)
    try {
      const res = await fetch(`/api/admin/legal-documents/${documentId}/approve`, { method: 'DELETE' })
      const data = await res.json()
      if (res.ok) {
        toast.success('Approbation révoquée — le document n\'est plus visible publiquement')
        router.refresh()
      } else {
        toast.error(data.error || 'Erreur lors de la révocation')
      }
    } catch {
      toast.error('Erreur réseau')
    } finally {
      setLoading(false)
    }
  }

  if (isApproved) {
    return (
      <div className="flex flex-col items-end gap-1.5">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 text-sm text-green-400">
            <Icons.checkCircle className="h-4 w-4" />
            Approuvé
            {approvedAt && (
              <span className="text-xs text-slate-500 font-normal ml-1">
                {new Date(approvedAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })}
              </span>
            )}
          </span>
          {!isAbrogated && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleReindex}
              disabled={reindexLoading}
              className="h-7 text-xs border-blue-500/30 text-blue-400 hover:bg-blue-500/10 hover:border-blue-400/50"
              title="Forcer la réindexation KB (re-chunking + re-embedding)"
            >
              {reindexLoading ? (
                <Icons.loader className="h-3 w-3 animate-spin mr-1" />
              ) : (
                <Icons.database className="h-3 w-3 mr-1" />
              )}
              {reindexLoading ? 'Réindexation…' : 'Réindexer'}
            </Button>
          )}
          {!isAbrogated && (revokeConfirm ? (
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-orange-400 animate-pulse">Confirmer ?</span>
              <Button
                variant="outline"
                size="sm"
                onClick={handleRevoke}
                disabled={loading}
                className="h-7 text-xs border-red-500/40 text-red-400 hover:bg-red-500/10"
              >
                {loading ? <Icons.loader className="h-3 w-3 animate-spin" /> : 'Oui, révoquer'}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setRevokeConfirm(false)}
                className="h-7 text-xs text-slate-400"
              >
                Annuler
              </Button>
            </div>
          ) : (
            <Button
              variant="outline"
              size="sm"
              onClick={handleRevoke}
              disabled={loading}
              className="h-7 text-xs border-slate-600 text-slate-400 hover:border-red-500/40 hover:text-red-400 hover:bg-red-500/5 transition-colors"
            >
              <Icons.shield className="h-3 w-3 mr-1" />
              Révoquer
            </Button>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-end gap-1.5">
      <Button
        size="sm"
        onClick={handleApprove}
        disabled={loading || !canApprove}
        className="bg-green-600 hover:bg-green-700 text-white disabled:opacity-40"
        title={!canApprove ? 'Le document doit être consolidé avant approbation' : undefined}
      >
        {loading ? (
          <>
            <Icons.loader className="h-3.5 w-3.5 mr-1.5 animate-spin" />
            Approbation en cours…
          </>
        ) : (
          <>
            <Icons.checkCircle className="h-3.5 w-3.5 mr-1.5" />
            Approuver pour publication
          </>
        )}
      </Button>
      {!canApprove && consolidationStatus !== 'complete' && (
        <span className="text-xs text-slate-500">
          Consolidation requise avant approbation
        </span>
      )}
    </div>
  )
}
