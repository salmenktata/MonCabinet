/**
 * Page de test pour la migration Ollama Option C
 * Permet de tester le mode Rapide vs Premium
 */

'use client'

import { useState } from 'react'
import { useChatStore } from '@/lib/stores/chat-store'
import { ModelSelector } from '@/components/chat/model-selector'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Card } from '@/components/ui/card'

export default function ChatTestPage() {
  const { usePremiumModel, setUsePremiumModel } = useChatStore()
  const [question, setQuestion] = useState('')
  const [response, setResponse] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!question.trim()) return

    setLoading(true)
    setError(null)
    setResponse(null)

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question,
          usePremiumModel,
        }),
      })

      if (!res.ok) {
        const errorData = await res.json()
        throw new Error(errorData.error || 'Erreur API')
      }

      const data = await res.json()
      setResponse(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="container mx-auto p-6 max-w-4xl">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold">Test Migration Ollama Option C</h1>
          <p className="text-muted-foreground mt-2">
            Testez le mode Rapide (Ollama local) vs Premium (cloud providers)
          </p>
        </div>
        <ModelSelector
          isPremium={usePremiumModel}
          onToggle={setUsePremiumModel}
        />
      </div>

      <Card className="p-6 mb-6">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">
              Votre question juridique
            </label>
            <Textarea
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Ex: Quels sont les délais pour déposer une assignation en divorce ?"
              rows={4}
              className="w-full"
            />
          </div>

          <div className="flex items-center gap-4">
            <Button type="submit" disabled={loading || !question.trim()}>
              {loading ? 'Traitement...' : 'Envoyer'}
            </Button>
            {loading && (
              <span className="text-sm text-muted-foreground">
                {usePremiumModel ? '🧠 Mode Premium (~10-30s)' : '⚡ Mode Rapide (~15-20s)'}
              </span>
            )}
          </div>
        </form>
      </Card>

      {error && (
        <Card className="p-6 mb-6 border-red-500">
          <div className="text-red-600">
            <strong>Erreur:</strong> {error}
          </div>
        </Card>
      )}

      {response && (
        <div className="space-y-4">
          <Card className="p-6">
            <h2 className="text-xl font-semibold mb-3">Réponse</h2>
            <div className="prose max-w-none">
              <p className="whitespace-pre-wrap">{response.answer}</p>
            </div>
          </Card>

          <Card className="p-6">
            <h3 className="text-lg font-semibold mb-3">Métadonnées</h3>
            <div className="space-y-2 text-sm">
              <div className="flex gap-2">
                <strong>Sources trouvées:</strong>
                <span>{response.sources?.length || 0}</span>
              </div>
              <div className="flex gap-2">
                <strong>Tokens utilisés:</strong>
                <span>{response.tokensUsed?.total || 0}</span>
              </div>
              <div className="flex gap-2">
                <strong>Conversation ID:</strong>
                <span className="font-mono text-xs">{response.conversationId}</span>
              </div>
            </div>
          </Card>

          {response.sources && response.sources.length > 0 && (
            <Card className="p-6">
              <h3 className="text-lg font-semibold mb-3">
                Sources ({response.sources.length})
              </h3>
              <div className="space-y-3">
                {response.sources.slice(0, 3).map((source: any, idx: number) => (
                  <div key={idx} className="border-l-4 border-primary pl-4">
                    <div className="text-sm font-medium">{source.documentName}</div>
                    <div className="text-xs text-muted-foreground mt-1">
                      Similarité: {(source.similarity * 100).toFixed(1)}%
                    </div>
                    <p className="text-sm mt-2 line-clamp-3">
                      {source.chunkContent}
                    </p>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>
      )}

      <Card className="p-6 mt-6 bg-muted/50">
        <h3 className="text-lg font-semibold mb-3">Guide de Test</h3>
        <div className="space-y-2 text-sm">
          <div>
            <strong>⚡ Mode Rapide:</strong> Ollama qwen3:8b local (gratuit, ~15-20s)
          </div>
          <div>
            <strong>🧠 Mode Premium:</strong> Cloud providers (Groq/DeepSeek/Anthropic, ~10-30s)
          </div>
          <div className="mt-4">
            <strong>Pour tester:</strong>
            <ol className="list-decimal ml-5 mt-2 space-y-1">
              <li>Vérifier qu'Ollama est démarré: <code className="bg-background px-2 py-1 rounded">ollama serve</code></li>
              <li>Poser une question en mode rapide (toggle désactivé)</li>
              <li>Activer le mode premium (toggle)</li>
              <li>Poser la même question et comparer</li>
            </ol>
          </div>
        </div>
      </Card>
    </div>
  )
}
