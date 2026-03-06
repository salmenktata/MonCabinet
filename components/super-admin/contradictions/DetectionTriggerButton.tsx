'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Icons } from '@/lib/icons'
import { toast } from 'sonner'

interface DetectionResult {
  processed: number
  succeeded: number
  totalFound: number
  remaining: number
  message: string
}

export function DetectionTriggerButton() {
  const [isLoading, setIsLoading] = useState(false)
  const [lastResult, setLastResult] = useState<DetectionResult | null>(null)

  const handleDetect = async () => {
    setIsLoading(true)
    setLastResult(null)

    try {
      const response = await fetch('/api/admin/kb/detect-contradictions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ batchSize: 5 }),
      })

      const data = await response.json()

      if (!response.ok || !data.success) {
        toast.error(data.error || 'Erreur lors de la détection')
        return
      }

      setLastResult({
        processed: data.processed,
        succeeded: data.succeeded,
        totalFound: data.totalFound,
        remaining: data.remaining,
        message: data.message,
      })

      if (data.totalFound > 0) {
        toast.success(`${data.totalFound} contradiction(s) détectée(s) sur ${data.processed} pages`)
      } else {
        toast.success(`${data.processed} pages analysées — aucune contradiction`)
      }
    } catch {
      toast.error('Erreur réseau')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <Button
        onClick={handleDetect}
        disabled={isLoading}
        variant="outline"
        className="border-border text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        {isLoading ? (
          <>
            <Icons.loader className="h-4 w-4 mr-2 animate-spin" />
            Analyse en cours…
          </>
        ) : (
          <>
            <Icons.alertTriangle className="h-4 w-4 mr-2" />
            Analyser un batch (5 pages)
          </>
        )}
      </Button>

      {lastResult && (
        <p className="text-xs text-muted-foreground">
          {lastResult.succeeded}/{lastResult.processed} pages analysées
          {lastResult.totalFound > 0 && ` · ${lastResult.totalFound} contradiction(s)`}
          {lastResult.remaining > 0 && ` · ${lastResult.remaining} restantes`}
          {lastResult.remaining === 0 && ' · toutes vérifiées'}
        </p>
      )}
    </div>
  )
}
