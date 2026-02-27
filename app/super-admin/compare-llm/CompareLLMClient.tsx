'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Play, Clock, AlertCircle, CheckCircle2, Database } from 'lucide-react'
import { toast } from 'sonner'

// =============================================================================
// Types
// =============================================================================

interface ProviderResult {
  answer: string
  modelUsed: string
  latencyMs: number
  sourcesCount: number
  sources: Array<{ title: string; score: number }>
  error?: string
}

interface CompareResults {
  gemini: ProviderResult
  openai: ProviderResult
  ollama: ProviderResult
}

const PROVIDERS = [
  {
    key: 'gemini' as const,
    label: 'Gemini',
    model: 'gemini-2.5-flash',
    color: 'text-blue-700 bg-blue-50 border-blue-200',
    badge: 'bg-blue-100 text-blue-800',
  },
  {
    key: 'openai' as const,
    label: 'OpenAI',
    model: 'gpt-4o',
    color: 'text-green-700 bg-green-50 border-green-200',
    badge: 'bg-green-100 text-green-800',
  },
  {
    key: 'ollama' as const,
    label: 'Ollama',
    model: 'qwen3:8b',
    color: 'text-orange-700 bg-orange-50 border-orange-200',
    badge: 'bg-orange-100 text-orange-800',
  },
]

const EXAMPLE_QUESTIONS = [
  'Quelles sont les conditions de validité d\'un contrat selon le Code des Obligations et des Contrats ?',
  'Quel est le délai de prescription pour les actions civiles en droit tunisien ?',
  'Quelles sont les procédures de licenciement en droit du travail tunisien ?',
  'Comment se calcule la pension alimentaire après divorce en Tunisie ?',
]

// =============================================================================
// Main Component
// =============================================================================

export function CompareLLMClient() {
  const [question, setQuestion] = useState('')
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState<CompareResults | null>(null)
  const [error, setError] = useState<string | null>(null)

  const runComparison = async () => {
    if (!question.trim()) {
      toast.error('Veuillez saisir une question')
      return
    }

    setLoading(true)
    setError(null)
    setResults(null)

    try {
      const response = await fetch('/api/admin/compare-llm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: question.trim() }),
      })

      const data = await response.json()

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Erreur lors de la comparaison')
      }

      setResults(data.results)
      toast.success('Comparaison terminée')
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setError(msg)
      toast.error(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="container mx-auto p-6 space-y-6 max-w-7xl">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Comparaison LLM</h1>
        <p className="text-muted-foreground mt-1">
          Testez la même question en parallèle sur Gemini, OpenAI et Ollama avec le pipeline RAG complet.
        </p>
      </div>

      {/* Input */}
      <Card>
        <CardHeader>
          <CardTitle>Question juridique</CardTitle>
          <CardDescription>
            Le pipeline RAG complet (embeddings + BM25 + reranking) sera exécuté pour chaque provider.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Textarea
            placeholder="Ex : Quelles sont les conditions de validité d'un contrat selon le COC ?"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            rows={3}
            className="resize-none text-sm"
          />

          {/* Exemple de questions */}
          <div className="flex flex-wrap gap-2">
            {EXAMPLE_QUESTIONS.map((q, i) => (
              <button
                key={i}
                onClick={() => setQuestion(q)}
                className="text-xs px-3 py-1.5 rounded-full border border-dashed text-muted-foreground hover:text-foreground hover:border-foreground transition-colors"
              >
                {q.length > 60 ? q.slice(0, 60) + '…' : q}
              </button>
            ))}
          </div>

          <Button
            onClick={runComparison}
            disabled={loading || !question.trim()}
            className="w-full"
          >
            {loading ? (
              <>
                <span className="animate-spin mr-2">⟳</span>
                Comparaison en cours (peut prendre 30-60s)…
              </>
            ) : (
              <>
                <Play className="h-4 w-4 mr-2" />
                Lancer la comparaison
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Error */}
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Results */}
      {results && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {PROVIDERS.map((provider) => {
            const result = results[provider.key]
            const hasError = !!result.error
            const hasAnswer = !hasError && result.answer.length > 0

            return (
              <Card key={provider.key} className={`border-2 ${provider.color}`}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {hasError ? (
                        <AlertCircle className="h-5 w-5 text-red-500" />
                      ) : (
                        <CheckCircle2 className="h-5 w-5 text-green-600" />
                      )}
                      <CardTitle className="text-lg">{provider.label}</CardTitle>
                    </div>
                    <span className={`text-xs font-mono px-2 py-1 rounded ${provider.badge}`}>
                      {provider.model}
                    </span>
                  </div>

                  {/* Méta */}
                  <div className="flex items-center gap-3 text-sm text-muted-foreground mt-1">
                    <span className="flex items-center gap-1">
                      <Clock className="h-3.5 w-3.5" />
                      {result.latencyMs > 0 ? `${(result.latencyMs / 1000).toFixed(1)}s` : '—'}
                    </span>
                    <span className="flex items-center gap-1">
                      <Database className="h-3.5 w-3.5" />
                      {result.sourcesCount} source{result.sourcesCount !== 1 ? 's' : ''}
                    </span>
                    {result.modelUsed && result.modelUsed !== provider.key && (
                      <span className="truncate max-w-[120px] opacity-70" title={result.modelUsed}>
                        {result.modelUsed.split('/').pop()}
                      </span>
                    )}
                  </div>
                </CardHeader>

                <CardContent className="space-y-4">
                  {/* Erreur */}
                  {hasError && (
                    <Alert variant="destructive">
                      <AlertDescription className="text-xs break-words">
                        {result.error}
                      </AlertDescription>
                    </Alert>
                  )}

                  {/* Réponse */}
                  {hasAnswer && (
                    <div className="text-sm leading-relaxed whitespace-pre-wrap max-h-[400px] overflow-y-auto rounded-md bg-white/60 p-3 border">
                      {result.answer}
                    </div>
                  )}

                  {/* Sources */}
                  {result.sources.length > 0 && (
                    <div className="space-y-1">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                        Sources RAG
                      </p>
                      <div className="space-y-1">
                        {result.sources.map((src, i) => (
                          <div key={i} className="flex items-center justify-between gap-2 text-xs bg-white/60 rounded px-2 py-1">
                            <span className="truncate flex-1 text-muted-foreground">{src.title || '(sans titre)'}</span>
                            <Badge variant="outline" className="text-xs font-mono shrink-0">
                              {src.score.toFixed(3)}
                            </Badge>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* Empty state */}
      {!results && !loading && !error && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Play className="h-12 w-12 text-muted-foreground mb-4 opacity-40" />
            <h3 className="text-lg font-semibold mb-1">Prêt à comparer</h3>
            <p className="text-muted-foreground text-sm max-w-md">
              Saisissez une question juridique et lancez la comparaison pour voir les réponses des 3 providers côte à côte avec les sources RAG et la latence.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
