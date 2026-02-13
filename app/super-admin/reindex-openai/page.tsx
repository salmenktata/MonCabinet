/**
 * Page Super Admin - Réindexation OpenAI
 * Interface pour lancer et monitorer la réindexation de la KB avec OpenAI embeddings
 */

'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Icons } from '@/lib/icons'
import { useToast } from '@/lib/hooks/use-toast'
import { PlayCircle, RefreshCw, CheckCircle, AlertCircle, TrendingUp } from 'lucide-react'

interface ReindexStats {
  total: number
  embeddings: {
    ollama: {
      indexed: number
      percentage: number
    }
    openai: {
      indexed: number
      remaining: number
      percentage: number
    }
  }
  tsvector: {
    indexed: number
    percentage: number
  }
  estimatedCost: {
    perBatch: string
    remaining: string
    total: string
  }
}

interface BatchResult {
  success: boolean
  batch: {
    indexed: number
    errors: number
    errorDetails?: Array<{ id: string; error: string }>
  }
  progress: {
    totalChunks: number
    indexed: number
    remaining: number
    percentage: number
  }
  next: {
    message: string
    endpoint: string
  } | null
}

export default function ReindexOpenAIPage() {
  const { toast } = useToast()
  const [stats, setStats] = useState<ReindexStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [reindexing, setReindexing] = useState(false)
  const [autoReindex, setAutoReindex] = useState(false)
  const [batchSize, setBatchSize] = useState(50)
  const [totalIndexed, setTotalIndexed] = useState(0)
  const [batchCount, setBatchCount] = useState(0)

  // Charger les stats
  const fetchStats = async () => {
    try {
      const res = await fetch('/api/admin/reindex-kb-openai')
      if (!res.ok) throw new Error('Failed to fetch stats')
      const data = await res.json()
      setStats(data)
    } catch (error) {
      console.error('Error fetching stats:', error)
      toast({
        title: 'Erreur',
        description: 'Impossible de récupérer les statistiques',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchStats()
  }, [])

  // Lancer un batch
  const runBatch = async () => {
    if (reindexing) return

    setReindexing(true)
    try {
      const res = await fetch(`/api/admin/reindex-kb-openai?batch_size=${batchSize}`, {
        method: 'POST',
      })

      if (!res.ok) throw new Error('Failed to run batch')

      const result: BatchResult = await res.json()

      setTotalIndexed((prev) => prev + result.batch.indexed)
      setBatchCount((prev) => prev + 1)

      // Mettre à jour les stats
      await fetchStats()

      toast({
        title: 'Batch terminé',
        description: `${result.batch.indexed} chunks indexés, ${result.batch.errors} erreurs`,
      })

      // Si auto-reindex et qu'il reste des chunks, continuer
      if (autoReindex && result.next) {
        setTimeout(() => runBatch(), 2000)
      } else {
        setReindexing(false)
        if (!result.next) {
          setAutoReindex(false)
          toast({
            title: 'Réindexation terminée !',
            description: `Total: ${totalIndexed + result.batch.indexed} chunks indexés`,
          })
        }
      }
    } catch (error) {
      setReindexing(false)
      setAutoReindex(false)
      toast({
        title: 'Erreur',
        description: error instanceof Error ? error.message : 'Erreur inconnue',
        variant: 'destructive',
      })
    }
  }

  // Lancer réindexation complète
  const startAutoReindex = () => {
    setAutoReindex(true)
    setTotalIndexed(0)
    setBatchCount(0)
    runBatch()
  }

  // Arrêter réindexation
  const stopAutoReindex = () => {
    setAutoReindex(false)
    setReindexing(false)
  }

  if (loading) {
    return (
      <div className="container mx-auto py-8">
        <div className="flex items-center justify-center">
          <Icons.loader className="h-8 w-8 animate-spin" />
        </div>
      </div>
    )
  }

  const remaining = stats?.embeddings.openai.remaining || 0
  const percentage = stats?.embeddings.openai.percentage || 0
  const isComplete = remaining === 0

  return (
    <div className="container mx-auto py-8 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Réindexation OpenAI</h1>
        <p className="text-muted-foreground mt-2">
          Indexer la Knowledge Base avec OpenAI text-embedding-3-small (1536 dimensions)
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Chunks
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.total.toLocaleString()}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              OpenAI Indexés
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {stats?.embeddings.openai.indexed.toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground mt-1">{percentage.toFixed(1)}%</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">Restants</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">
              {remaining.toLocaleString()}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Coût Estimé
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.estimatedCost.remaining}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Total: {stats?.estimatedCost.total}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Progress */}
      {!isComplete && (
        <Card>
          <CardHeader>
            <CardTitle>Progression</CardTitle>
            <CardDescription>
              {stats?.embeddings.openai.indexed.toLocaleString()} /{' '}
              {stats?.total.toLocaleString()} chunks indexés
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Progress value={percentage} className="h-2" />
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>{percentage.toFixed(1)}% complété</span>
              <span>
                ~{Math.ceil(remaining / batchSize)} batches restants (batch size: {batchSize})
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Complete Alert */}
      {isComplete && (
        <Alert className="bg-green-50 border-green-200">
          <CheckCircle className="h-4 w-4 text-green-600" />
          <AlertDescription className="text-green-800">
            Réindexation terminée ! Tous les {stats?.total.toLocaleString()} chunks sont indexés
            avec OpenAI embeddings.
          </AlertDescription>
        </Alert>
      )}

      {/* Session Stats */}
      {(totalIndexed > 0 || batchCount > 0) && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Session Actuelle</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-4 text-sm">
              <div>
                <p className="text-muted-foreground">Chunks indexés</p>
                <p className="text-2xl font-bold text-blue-600">{totalIndexed}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Batches exécutés</p>
                <p className="text-2xl font-bold text-purple-600">{batchCount}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Moyenne par batch</p>
                <p className="text-2xl font-bold text-teal-600">
                  {batchCount > 0 ? Math.round(totalIndexed / batchCount) : 0}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Actions */}
      <Card>
        <CardHeader>
          <CardTitle>Actions</CardTitle>
          <CardDescription>Lancer la réindexation par batches</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Batch Size Selector */}
          <div className="flex items-center gap-4">
            <label className="text-sm font-medium">Taille du batch:</label>
            <div className="flex gap-2">
              {[10, 50, 100].map((size) => (
                <Button
                  key={size}
                  variant={batchSize === size ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setBatchSize(size)}
                  disabled={reindexing}
                >
                  {size}
                </Button>
              ))}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3">
            {!autoReindex ? (
              <>
                <Button
                  onClick={runBatch}
                  disabled={reindexing || isComplete}
                  className="flex-1"
                  variant="outline"
                >
                  {reindexing ? (
                    <>
                      <Icons.loader className="mr-2 h-4 w-4 animate-spin" />
                      Indexation...
                    </>
                  ) : (
                    <>
                      <PlayCircle className="mr-2 h-4 w-4" />
                      Lancer 1 Batch ({batchSize} chunks)
                    </>
                  )}
                </Button>

                <Button
                  onClick={startAutoReindex}
                  disabled={reindexing || isComplete}
                  className="flex-1 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700"
                >
                  <TrendingUp className="mr-2 h-4 w-4" />
                  Réindexation Complète
                </Button>
              </>
            ) : (
              <Button
                onClick={stopAutoReindex}
                variant="destructive"
                className="flex-1"
              >
                <AlertCircle className="mr-2 h-4 w-4" />
                Arrêter la Réindexation
              </Button>
            )}

            <Button onClick={fetchStats} variant="ghost" size="icon" disabled={reindexing}>
              <RefreshCw className={`h-4 w-4 ${reindexing ? 'animate-spin' : ''}`} />
            </Button>
          </div>

          {/* Status */}
          {autoReindex && (
            <Alert className="bg-blue-50 border-blue-200">
              <Icons.loader className="h-4 w-4 animate-spin text-blue-600" />
              <AlertDescription className="text-blue-800">
                Réindexation automatique en cours... Batch {batchCount + 1} /{' '}
                {Math.ceil(remaining / batchSize)}
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Comparison */}
      <Card>
        <CardHeader>
          <CardTitle>Comparaison Embeddings</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Ollama (qwen3)</span>
                <Badge variant="outline">1024-dim</Badge>
              </div>
              <Progress value={stats?.embeddings.ollama.percentage} className="h-2" />
              <p className="text-xs text-muted-foreground">
                {stats?.embeddings.ollama.indexed.toLocaleString()} chunks (
                {stats?.embeddings.ollama.percentage.toFixed(1)}%)
              </p>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">OpenAI</span>
                <Badge className="bg-green-600">1536-dim</Badge>
              </div>
              <Progress value={percentage} className="h-2" />
              <p className="text-xs text-muted-foreground">
                {stats?.embeddings.openai.indexed.toLocaleString()} chunks (
                {percentage.toFixed(1)}%)
              </p>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">TsVector (BM25)</span>
                <Badge variant="outline">Full-text</Badge>
              </div>
              <Progress value={stats?.tsvector.percentage} className="h-2" />
              <p className="text-xs text-muted-foreground">
                {stats?.tsvector.indexed.toLocaleString()} chunks (
                {stats?.tsvector.percentage.toFixed(1)}%)
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Info */}
      <Alert>
        <AlertDescription className="text-sm">
          <strong>Note:</strong> La réindexation utilise l&apos;API OpenAI (text-embedding-3-small).
          Coût estimé: {stats?.estimatedCost.total} pour {stats?.total.toLocaleString()} chunks.
          Temps estimé: ~{Math.ceil((remaining / batchSize) * 0.5)} minutes (batch {batchSize}).
        </AlertDescription>
      </Alert>
    </div>
  )
}
