'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Loader2, Play, CheckCircle2, XCircle, AlertCircle } from 'lucide-react'
import { toast } from 'sonner'

interface JobStatus {
  id: string
  status: 'running' | 'completed' | 'failed'
  started_at: string
  completed_at: string | null
  metadata: {
    limit?: number
    progress?: {
      processed: number
      total: number
      succeeded: number
      failed: number
      skipped: number
    }
    stats?: {
      total: number
      processed: number
      succeeded: number
      failed: number
      skipped: number
    }
  }
  error_message?: string | null
}

export function ClassifyBatchButton() {
  const [limit, setLimit] = useState(100)
  const [isRunning, setIsRunning] = useState(false)
  const [currentJob, setCurrentJob] = useState<JobStatus | null>(null)

  const handleStartClassification = async () => {
    try {
      setIsRunning(true)

      const response = await fetch('/api/super-admin/classify-pages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ limit }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Erreur lors du lancement')
      }

      toast.success(`Classification lancée pour ${data.pages_count} pages`)

      // Démarrer polling du status
      pollJobStatus(data.job_id)
    } catch (error) {
      console.error('Erreur:', error)
      toast.error(error instanceof Error ? error.message : 'Erreur inconnue')
      setIsRunning(false)
    }
  }

  const pollJobStatus = async (jobId: string) => {
    const interval = setInterval(async () => {
      try {
        const response = await fetch(`/api/super-admin/classify-pages?job_id=${jobId}`)
        const data = await response.json()

        if (!response.ok) {
          throw new Error(data.error)
        }

        setCurrentJob(data.job)

        // Arrêter le polling si le job est terminé
        if (data.job.status === 'completed' || data.job.status === 'failed') {
          clearInterval(interval)
          setIsRunning(false)

          if (data.job.status === 'completed') {
            const stats = data.job.metadata.stats
            toast.success(
              `Classification terminée : ${stats.succeeded} succès, ${stats.failed} échecs`
            )
          } else {
            toast.error(`Échec : ${data.job.error_message}`)
          }
        }
      } catch (error) {
        console.error('Erreur polling:', error)
        clearInterval(interval)
        setIsRunning(false)
      }
    }, 3000) // Poll toutes les 3 secondes
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'running':
        return (
          <Badge variant="default" className="gap-1">
            <Loader2 className="w-3 h-3 animate-spin" />
            En cours
          </Badge>
        )
      case 'completed':
        return (
          <Badge variant="success" className="gap-1">
            <CheckCircle2 className="w-3 h-3" />
            Terminé
          </Badge>
        )
      case 'failed':
        return (
          <Badge variant="destructive" className="gap-1">
            <XCircle className="w-3 h-3" />
            Échec
          </Badge>
        )
      default:
        return null
    }
  }

  const getProgress = () => {
    if (!currentJob?.metadata.progress) return 0
    const { processed, total } = currentJob.metadata.progress
    return (processed / total) * 100
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Play className="w-5 h-5" />
          Classification Batch
        </CardTitle>
        <CardDescription>
          Classifier automatiquement les pages web non classifiées
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Formulaire */}
        <div className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="limit">Nombre de pages à classifier</Label>
            <Input
              id="limit"
              type="number"
              min={1}
              max={10000}
              value={limit}
              onChange={(e) => setLimit(parseInt(e.target.value) || 100)}
              disabled={isRunning}
            />
            <p className="text-sm text-muted-foreground">
              Temps estimé : ~{Math.round((limit * 5) / 60)} minutes
            </p>
          </div>

          <Button
            onClick={handleStartClassification}
            disabled={isRunning}
            className="w-full"
          >
            {isRunning ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Classification en cours...
              </>
            ) : (
              <>
                <Play className="w-4 h-4 mr-2" />
                Lancer la classification
              </>
            )}
          </Button>
        </div>

        {/* Status du job actuel */}
        {currentJob && (
          <div className="space-y-3 border-t pt-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Status</span>
              {getStatusBadge(currentJob.status)}
            </div>

            {currentJob.metadata.progress && (
              <>
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span>Progression</span>
                    <span className="font-medium">
                      {currentJob.metadata.progress.processed} / {currentJob.metadata.progress.total}
                    </span>
                  </div>
                  <Progress value={getProgress()} className="h-2" />
                </div>

                <div className="grid grid-cols-3 gap-2 text-sm">
                  <div className="space-y-1">
                    <div className="text-muted-foreground">Succès</div>
                    <div className="font-semibold text-green-600">
                      {currentJob.metadata.progress.succeeded}
                    </div>
                  </div>
                  <div className="space-y-1">
                    <div className="text-muted-foreground">Échecs</div>
                    <div className="font-semibold text-red-600">
                      {currentJob.metadata.progress.failed}
                    </div>
                  </div>
                  <div className="space-y-1">
                    <div className="text-muted-foreground">Skippés</div>
                    <div className="font-semibold text-yellow-600">
                      {currentJob.metadata.progress.skipped}
                    </div>
                  </div>
                </div>
              </>
            )}

            {currentJob.metadata.stats && currentJob.status === 'completed' && (
              <div className="bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800 rounded-lg p-3 space-y-2">
                <div className="flex items-center gap-2 text-green-700 dark:text-green-400 font-medium">
                  <CheckCircle2 className="w-4 h-4" />
                  Classification terminée
                </div>
                <div className="text-sm text-green-600 dark:text-green-500">
                  {currentJob.metadata.stats.succeeded} pages classifiées avec succès
                  {currentJob.metadata.stats.failed > 0 &&
                    `, ${currentJob.metadata.stats.failed} échecs`}
                </div>
              </div>
            )}

            {currentJob.error_message && (
              <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-lg p-3">
                <div className="flex items-center gap-2 text-red-700 dark:text-red-400 font-medium mb-1">
                  <AlertCircle className="w-4 h-4" />
                  Erreur
                </div>
                <p className="text-sm text-red-600 dark:text-red-500">
                  {currentJob.error_message}
                </p>
              </div>
            )}
          </div>
        )}

        {/* Avertissement */}
        <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
          <div className="flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-blue-600 dark:text-blue-400 mt-0.5" />
            <div className="text-sm text-blue-700 dark:text-blue-300">
              <p className="font-medium mb-1">Note importante</p>
              <ul className="list-disc list-inside space-y-1 text-blue-600 dark:text-blue-400">
                <li>La classification utilise l'IA (Groq/Gemini/DeepSeek)</li>
                <li>Temps moyen : ~5-10 secondes par page</li>
                <li>Le process continue en arrière-plan</li>
              </ul>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
