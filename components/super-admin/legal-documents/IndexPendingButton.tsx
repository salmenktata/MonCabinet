'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Icons } from '@/lib/icons'
import { toast } from 'sonner'
import { indexAllPendingLegalDocuments } from '@/app/actions/legal-documents'

interface IndexPendingButtonProps {
  pendingCount: number
}

const BATCH_LIMIT = 30

export function IndexPendingButton({ pendingCount: initialCount }: IndexPendingButtonProps) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [remaining, setRemaining] = useState(initialCount)

  if (remaining === 0) return null

  async function handleIndex() {
    setLoading(true)
    const toastId = toast.loading(`Indexation en cours… (max ${BATCH_LIMIT} docs)`)
    try {
      const result = await indexAllPendingLegalDocuments(BATCH_LIMIT)
      toast.dismiss(toastId)
      if (result.error) {
        toast.error(result.error)
      } else {
        const failedMsg = result.failed > 0 ? ` · ${result.failed} échec(s)` : ''
        toast.success(
          result.indexed === 0
            ? 'Aucun document à indexer'
            : `${result.indexed} document(s) indexé(s)${failedMsg}${result.remaining > 0 ? ` · ${result.remaining} restant(s)` : ''}`
        )
        setRemaining(result.remaining)
        router.refresh()
      }
    } catch {
      toast.dismiss(toastId)
      toast.error('Erreur réseau')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Button
      size="sm"
      variant="outline"
      onClick={handleIndex}
      disabled={loading}
      className="border-yellow-500/40 text-yellow-400 hover:bg-yellow-500/10 hover:border-yellow-400/60 transition-colors"
      title={`${remaining} document(s) approuvé(s) sans chunks KB — cliquez pour indexer (par lots de ${BATCH_LIMIT})`}
    >
      {loading ? (
        <Icons.loader className="h-3.5 w-3.5 mr-1.5 animate-spin" />
      ) : (
        <Icons.database className="h-3.5 w-3.5 mr-1.5" />
      )}
      {loading
        ? 'Indexation…'
        : `Indexer ${remaining > BATCH_LIMIT ? `${BATCH_LIMIT}/${remaining}` : remaining} doc${remaining !== 1 ? 's' : ''}`}
    </Button>
  )
}
