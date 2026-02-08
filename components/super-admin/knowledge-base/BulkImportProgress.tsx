'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Icons } from '@/lib/icons'

interface FileResult {
  filename: string
  title: string
  status: 'success' | 'failed' | 'processing' | 'pending'
  documentId?: string
  error?: string
}

interface BatchStatus {
  batchId: string
  status: 'processing' | 'completed' | 'partially_completed' | 'failed'
  totalFiles: number
  processedFiles: number
  successCount: number
  failedCount: number
  files: FileResult[]
}

interface BulkImportProgressProps {
  batchId: string
  onComplete?: () => void
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: keyof typeof Icons }> = {
  processing: {
    label: 'En cours',
    color: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
    icon: 'loader',
  },
  completed: {
    label: 'Terminé',
    color: 'bg-green-500/20 text-green-300 border-green-500/30',
    icon: 'checkCircle',
  },
  partially_completed: {
    label: 'Partiellement terminé',
    color: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30',
    icon: 'alertTriangle',
  },
  failed: {
    label: 'Échoué',
    color: 'bg-red-500/20 text-red-300 border-red-500/30',
    icon: 'xCircle',
  },
}

const FILE_STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  success: { label: 'Succès', color: 'text-green-400' },
  failed: { label: 'Erreur', color: 'text-red-400' },
  processing: { label: 'En cours', color: 'text-blue-400' },
  pending: { label: 'En attente', color: 'text-slate-400' },
}

export function BulkImportProgress({ batchId, onComplete }: BulkImportProgressProps) {
  const [batch, setBatch] = useState<BatchStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchStatus = useCallback(async () => {
    try {
      const response = await fetch(`/api/admin/knowledge-base/bulk/${batchId}`)

      if (!response.ok) {
        const errData = await response.json().catch(() => ({ error: 'Erreur serveur' }))
        throw new Error(errData.error || `Erreur ${response.status}`)
      }

      const data: BatchStatus = await response.json()
      setBatch(data)
      setError(null)

      // If no longer processing, stop polling and notify parent
      if (data.status !== 'processing') {
        onComplete?.()
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur de chargement')
    } finally {
      setLoading(false)
    }
  }, [batchId, onComplete])

  useEffect(() => {
    // Initial fetch
    fetchStatus()

    // Poll every 2 seconds while processing
    const interval = setInterval(() => {
      // Only poll if we have batch data and it's still processing
      // We read batch from the ref-like closure; use the state setter function form
      setBatch((currentBatch) => {
        if (!currentBatch || currentBatch.status === 'processing') {
          fetchStatus()
        }
        return currentBatch
      })
    }, 2000)

    return () => clearInterval(interval)
  }, [fetchStatus])

  const progressPercent = batch
    ? batch.totalFiles > 0
      ? Math.round((batch.processedFiles / batch.totalFiles) * 100)
      : 0
    : 0

  const statusConfig = batch ? STATUS_CONFIG[batch.status] || STATUS_CONFIG.processing : null

  if (loading && !batch) {
    return (
      <Card className="bg-slate-800 border-slate-700">
        <CardContent className="py-8">
          <div className="flex flex-col items-center gap-3">
            <Icons.loader className="h-8 w-8 text-slate-400 animate-spin" />
            <p className="text-sm text-slate-400">Chargement du statut...</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (error && !batch) {
    return (
      <Card className="bg-slate-800 border-slate-700">
        <CardContent className="py-8">
          <div className="flex flex-col items-center gap-3">
            <Icons.alertCircle className="h-8 w-8 text-red-400" />
            <p className="text-sm text-red-400">{error}</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (!batch) return null

  return (
    <Card className="bg-slate-800 border-slate-700">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-white text-base flex items-center gap-2">
            <Icons.layers className="h-4 w-4" />
            Import en masse
          </CardTitle>
          {statusConfig && (
            <Badge className={statusConfig.color}>
              {batch.status === 'processing' && (
                <Icons.loader className="h-3 w-3 mr-1 animate-spin" />
              )}
              {statusConfig.label}
            </Badge>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Progress bar */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-slate-400">
              {batch.processedFiles} / {batch.totalFiles} fichier(s)
            </span>
            <span className="text-white font-medium">{progressPercent}%</span>
          </div>
          <Progress
            value={progressPercent}
            className="h-2 bg-slate-700"
          />
        </div>

        {/* Summary counts */}
        <div className="flex items-center gap-4 text-xs">
          {batch.successCount > 0 && (
            <span className="flex items-center gap-1 text-green-400">
              <Icons.checkCircle className="h-3 w-3" />
              {batch.successCount} succès
            </span>
          )}
          {batch.failedCount > 0 && (
            <span className="flex items-center gap-1 text-red-400">
              <Icons.xCircle className="h-3 w-3" />
              {batch.failedCount} erreur(s)
            </span>
          )}
          {batch.totalFiles - batch.processedFiles > 0 && batch.status === 'processing' && (
            <span className="flex items-center gap-1 text-slate-400">
              <Icons.clock className="h-3 w-3" />
              {batch.totalFiles - batch.processedFiles} en attente
            </span>
          )}
        </div>

        {/* Individual file results */}
        {batch.files.length > 0 && (
          <div className="space-y-1.5 max-h-64 overflow-y-auto">
            {batch.files.map((file, index) => {
              const fileConfig = FILE_STATUS_CONFIG[file.status] || FILE_STATUS_CONFIG.pending

              return (
                <div
                  key={`${file.filename}-${index}`}
                  className="flex items-start gap-2 p-2 rounded bg-slate-900/50"
                >
                  <div className="shrink-0 mt-0.5">
                    {file.status === 'success' && (
                      <Icons.checkCircle className="h-4 w-4 text-green-400" />
                    )}
                    {file.status === 'failed' && (
                      <Icons.xCircle className="h-4 w-4 text-red-400" />
                    )}
                    {file.status === 'processing' && (
                      <Icons.loader className="h-4 w-4 text-blue-400 animate-spin" />
                    )}
                    {file.status === 'pending' && (
                      <Icons.clock className="h-4 w-4 text-slate-500" />
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white truncate" title={file.title || file.filename}>
                      {file.title || file.filename}
                    </p>
                    {file.filename !== file.title && (
                      <p className="text-xs text-slate-500 truncate">{file.filename}</p>
                    )}
                    {file.error && (
                      <p className="text-xs text-red-400 mt-0.5">{file.error}</p>
                    )}
                  </div>

                  <span className={`text-xs shrink-0 ${fileConfig.color}`}>
                    {fileConfig.label}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
