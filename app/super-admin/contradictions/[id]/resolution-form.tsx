'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Icons } from '@/lib/icons'
import { toast } from 'sonner'
import { resolveContradictionByAdmin } from '@/app/actions/super-admin/content-review'
import type { ContradictionStatus } from '@/lib/web-scraper/types'

interface ResolutionFormProps {
  contradictionId: string
  currentStatus: ContradictionStatus
  resolutionNotes?: string | null
  resolutionAction?: string | null
  resolvedAt?: Date | null
  resolvedBy?: string | null
}

const RESOLVABLE_STATUSES: ContradictionStatus[] = ['pending', 'under_review', 'escalated']

export function ResolutionForm({
  contradictionId,
  currentStatus,
  resolutionNotes,
  resolutionAction,
  resolvedAt,
  resolvedBy,
}: ResolutionFormProps) {
  const router = useRouter()
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(false)
  const [dismissConfirm, setDismissConfirm] = useState(false)

  const isResolvable = RESOLVABLE_STATUSES.includes(currentStatus)

  async function handleSubmit(status: 'resolved' | 'dismissed') {
    if (!notes.trim()) {
      toast.error('Les notes de résolution sont requises')
      return
    }
    setLoading(true)
    try {
      const result = await resolveContradictionByAdmin(contradictionId, {
        status,
        notes: notes.trim(),
      })
      if (result.success) {
        toast.success(
          status === 'resolved'
            ? 'Contradiction marquée comme résolue'
            : 'Contradiction rejetée'
        )
        router.refresh()
      } else {
        toast.error(result.error || 'Erreur lors de la résolution')
      }
    } catch {
      toast.error('Erreur réseau')
    } finally {
      setLoading(false)
      setDismissConfirm(false)
    }
  }

  // Affichage résumé si déjà résolue/rejetée
  if (!isResolvable) {
    return (
      <div className="rounded-lg border border-slate-700 bg-slate-900/30 p-4">
        <h3 className="text-sm font-medium text-slate-300 mb-3 flex items-center gap-2">
          <Icons.checkCircle className="h-4 w-4 text-green-400" />
          Résolution
        </h3>
        <div className="space-y-2 text-sm">
          {resolutionNotes && (
            <div>
              <span className="text-slate-500">Notes :</span>{' '}
              <span className="text-slate-300">{resolutionNotes}</span>
            </div>
          )}
          {resolutionAction && (
            <div>
              <span className="text-slate-500">Action :</span>{' '}
              <span className="text-slate-300">{resolutionAction}</span>
            </div>
          )}
          {resolvedBy && (
            <div>
              <span className="text-slate-500">Résolu par :</span>{' '}
              <span className="text-slate-300">{resolvedBy}</span>
            </div>
          )}
          {resolvedAt && (
            <div>
              <span className="text-slate-500">Le :</span>{' '}
              <span className="text-slate-300">
                {new Date(resolvedAt).toLocaleDateString('fr-FR', {
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
            </div>
          )}
        </div>
      </div>
    )
  }

  // Formulaire de résolution
  return (
    <div className="rounded-lg border border-slate-700 bg-slate-900/30 p-4 space-y-4">
      <h3 className="text-sm font-medium text-slate-300 flex items-center gap-2">
        <Icons.edit className="h-4 w-4 text-blue-400" />
        Résoudre cette contradiction
      </h3>

      <div className="space-y-2">
        <Label htmlFor="resolution-notes" className="text-slate-400 text-xs">
          Notes de résolution <span className="text-red-400">*</span>
        </Label>
        <Textarea
          id="resolution-notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Décrivez comment cette contradiction a été traitée, les sources consultées, la décision prise…"
          rows={4}
          className="bg-slate-800/50 border-slate-600 text-slate-200 placeholder:text-slate-500 resize-none focus:border-slate-400"
          disabled={loading}
        />
        <p className="text-xs text-slate-500">{notes.length} / 2000 caractères</p>
      </div>

      <div className="flex items-center gap-2 pt-1">
        <Button
          size="sm"
          onClick={() => handleSubmit('resolved')}
          disabled={loading || !notes.trim()}
          className="bg-green-600 hover:bg-green-700 text-white disabled:opacity-40"
        >
          {loading ? (
            <Icons.loader className="h-3.5 w-3.5 mr-1.5 animate-spin" />
          ) : (
            <Icons.checkCircle className="h-3.5 w-3.5 mr-1.5" />
          )}
          Marquer comme résolu
        </Button>

        {dismissConfirm ? (
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-orange-400 animate-pulse">Confirmer le rejet ?</span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleSubmit('dismissed')}
              disabled={loading || !notes.trim()}
              className="h-7 text-xs border-red-500/40 text-red-400 hover:bg-red-500/10"
            >
              {loading ? <Icons.loader className="h-3 w-3 animate-spin" /> : 'Oui, rejeter'}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setDismissConfirm(false)}
              className="h-7 text-xs text-slate-400"
            >
              Annuler
            </Button>
          </div>
        ) : (
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              if (!notes.trim()) {
                toast.error('Ajoutez des notes avant de rejeter')
                return
              }
              setDismissConfirm(true)
              setTimeout(() => setDismissConfirm(false), 5000)
            }}
            disabled={loading}
            className="border-slate-600 text-slate-400 hover:border-red-500/40 hover:text-red-400 hover:bg-red-500/5 transition-colors"
          >
            <Icons.x className="h-3.5 w-3.5 mr-1.5" />
            Rejeter
          </Button>
        )}
      </div>
    </div>
  )
}
