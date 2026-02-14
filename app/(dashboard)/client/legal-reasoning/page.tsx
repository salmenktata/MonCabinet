/**
 * Page : /client/legal-reasoning
 *
 * Génère un arbre décisionnel IRAC (Issue-Rule-Application-Conclusion)
 * pour une question juridique posée par un client.
 *
 * Sprint 4 - Fonctionnalités Client
 * Sprint 8 - Finalisation UI
 */

'use client'

import { useState } from 'react'
import { ExplanationTreeViewer } from '@/components/client/legal-reasoning/ExplanationTreeViewer'
import type { ExplanationTree, SourceReference } from '@/components/client/legal-reasoning/ExplanationTreeViewer'
import { SourceDetailsModal } from '@/components/client/legal-reasoning/SourceDetailsModal'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { AlertCircle, Loader2, Search, Sparkles } from 'lucide-react'
import { Textarea } from '@/components/ui/textarea'

// =============================================================================
// TYPES
// =============================================================================

interface LegalReasoningRequest {
  question: string
  domain?: string
  maxDepth?: number
  language?: 'fr' | 'ar'
  includeAlternatives?: boolean
}

interface LegalReasoningResponse {
  success: boolean
  tree?: ExplanationTree
  sources?: Array<{
    id: string
    title: string
    category: string
    relevance: number
  }>
  error?: string
  metadata?: {
    processingTimeMs: number
    nodesGenerated: number
    sourcesUsed: number
  }
}

// =============================================================================
// PAGE COMPONENT
// =============================================================================

export default function LegalReasoningPage() {
  const [question, setQuestion] = useState('')
  const [domain, setDomain] = useState<string>('all')
  const [language, setLanguage] = useState<'fr' | 'ar'>('fr')
  const [includeAlternatives, setIncludeAlternatives] = useState(false)

  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<LegalReasoningResponse | null>(null)
  const [selectedSource, setSelectedSource] = useState<SourceReference | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!question.trim()) {
      setError('Veuillez poser une question juridique')
      return
    }

    setIsLoading(true)
    setError(null)
    setResult(null)

    try {
      const body: LegalReasoningRequest = {
        question: question.trim(),
        domain: domain === 'all' ? undefined : domain,
        maxDepth: 3,
        language,
        includeAlternatives,
      }

      const response = await fetch('/api/client/legal-reasoning', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      const data: LegalReasoningResponse = await response.json()

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Erreur lors de la génération du raisonnement')
      }

      setResult(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue')
    } finally {
      setIsLoading(false)
    }
  }

  const handleReset = () => {
    setQuestion('')
    setDomain('all')
    setLanguage('fr')
    setIncludeAlternatives(false)
    setResult(null)
    setError(null)
  }

  const handleExport = (format: 'pdf' | 'json' | 'markdown', tree: ExplanationTree) => {
    const timestamp = new Date().toISOString().split('T')[0]
    const questionSlug = question.slice(0, 50).replace(/[^a-zA-Z0-9]/g, '-').toLowerCase()

    if (format === 'json') {
      // Export JSON
      const jsonContent = JSON.stringify(tree, null, 2)
      const blob = new Blob([jsonContent], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `irac-${questionSlug}-${timestamp}.json`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } else if (format === 'markdown') {
      // Export Markdown (depuis tree.exportFormats)
      const markdownContent = tree.exportFormats?.markdown || generateMarkdown(tree)
      const blob = new Blob([markdownContent], { type: 'text/markdown' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `analyse-irac-${timestamp}.md`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } else if (format === 'pdf') {
      // TODO Sprint 10.2: Implémenter export PDF avec jsPDF
      alert('Export PDF bientôt disponible. Utilisez JSON ou Markdown pour l\'instant.')
    }
  }

  const generateMarkdown = (tree: ExplanationTree): string => {
    return `# Analyse Juridique IRAC\n\n**Question** : ${tree.summary.question}\n\n**Date** : ${new Date().toLocaleDateString('fr-FR')}\n\n## Conclusion\n\n${tree.summary.conclusion}\n\n## Règles Applicables\n\n${tree.summary.mainRules.map((rule, i) => `${i + 1}. ${rule}`).join('\n')}\n\n---\n\nGénéré par Qadhya - Assistant Juridique IA`
  }

  return (
    <div className="container mx-auto py-6 space-y-6">
      {/* Header */}
      <div className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <Sparkles className="h-8 w-8 text-primary" />
          Raisonnement Juridique IRAC
        </h1>
        <p className="text-muted-foreground">
          Générez un arbre décisionnel structuré (Issue-Rule-Application-Conclusion)
          pour analyser votre question juridique avec les sources pertinentes.
        </p>
      </div>

      {/* Formulaire de question */}
      <Card>
        <CardHeader>
          <CardTitle>Poser une question juridique</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Question */}
            <div className="space-y-2">
              <Label htmlFor="question">
                Question juridique <span className="text-destructive">*</span>
              </Label>
              <Textarea
                id="question"
                placeholder="Ex: Un employeur peut-il licencier un salarié sans indemnité en cas de faute grave ?"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                rows={4}
                required
                className="resize-none"
              />
              <p className="text-xs text-muted-foreground">
                Posez une question précise en droit tunisien
              </p>
            </div>

            {/* Filtres optionnels */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Domaine */}
              <div className="space-y-2">
                <Label htmlFor="domain">Domaine juridique</Label>
                <Select value={domain} onValueChange={setDomain}>
                  <SelectTrigger id="domain">
                    <SelectValue placeholder="Tous les domaines" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tous les domaines</SelectItem>
                    <SelectItem value="civil">Civil</SelectItem>
                    <SelectItem value="commercial">Commercial</SelectItem>
                    <SelectItem value="penal">Pénal</SelectItem>
                    <SelectItem value="administratif">Administratif</SelectItem>
                    <SelectItem value="travail">Droit du travail</SelectItem>
                    <SelectItem value="famille">Famille</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Langue */}
              <div className="space-y-2">
                <Label htmlFor="language">Langue de réponse</Label>
                <Select value={language} onValueChange={(v: 'fr' | 'ar') => setLanguage(v)}>
                  <SelectTrigger id="language">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="fr">Français</SelectItem>
                    <SelectItem value="ar">العربية</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Raisonnements alternatifs */}
              <div className="flex items-end">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={includeAlternatives}
                    onChange={(e) => setIncludeAlternatives(e.target.checked)}
                    className="h-4 w-4 rounded border-border"
                  />
                  <span className="text-sm">Inclure alternatives</span>
                </label>
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-2">
              <Button
                type="submit"
                disabled={isLoading || !question.trim()}
                className="flex-1"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Génération en cours...
                  </>
                ) : (
                  <>
                    <Search className="mr-2 h-4 w-4" />
                    Générer le raisonnement
                  </>
                )}
              </Button>
              {result && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleReset}
                >
                  Nouvelle question
                </Button>
              )}
            </div>

            {/* Erreur */}
            {error && (
              <div className="bg-destructive/10 border border-destructive rounded-lg p-4 flex items-start gap-3">
                <AlertCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold text-destructive">Erreur</p>
                  <p className="text-sm text-destructive/80">{error}</p>
                </div>
              </div>
            )}
          </form>
        </CardContent>
      </Card>

      {/* Résultat - Arbre décisionnel */}
      {result?.tree && (
        <div className="space-y-4">
          {/* Métadonnées */}
          {result.metadata && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card>
                <CardContent className="pt-6">
                  <div className="text-sm text-muted-foreground">Nœuds générés</div>
                  <div className="text-2xl font-bold">{result.metadata.nodesGenerated}</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="text-sm text-muted-foreground">Sources utilisées</div>
                  <div className="text-2xl font-bold">{result.metadata.sourcesUsed}</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="text-sm text-muted-foreground">Temps de traitement</div>
                  <div className="text-2xl font-bold">
                    {(result.metadata.processingTimeMs / 1000).toFixed(1)}s
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Arbre */}
          <ExplanationTreeViewer
            tree={result.tree}
            onSourceClick={(source) => {
              setSelectedSource(source)
            }}
            onExport={(format) => {
              if (result.tree) {
                handleExport(format, result.tree)
              }
            }}
          />
        </div>
      )}

      {/* Guide d'utilisation */}
      <div className="bg-muted/30 rounded-lg p-6 border">
        <h3 className="font-semibold mb-3">Méthode IRAC</h3>
        <div className="space-y-2 text-sm text-muted-foreground">
          <div className="flex items-start gap-2">
            <div className="h-5 w-5 rounded-full bg-blue-100 text-blue-600 dark:bg-blue-950 dark:text-blue-400 flex items-center justify-center shrink-0 text-xs font-bold mt-0.5">
              I
            </div>
            <div>
              <strong className="text-blue-600 dark:text-blue-400">Issue (Problématique) :</strong>{' '}
              Identification claire de la question juridique à résoudre.
            </div>
          </div>

          <div className="flex items-start gap-2">
            <div className="h-5 w-5 rounded-full bg-purple-100 text-purple-600 dark:bg-purple-950 dark:text-purple-400 flex items-center justify-center shrink-0 text-xs font-bold mt-0.5">
              R
            </div>
            <div>
              <strong className="text-purple-600 dark:text-purple-400">Rule (Règle) :</strong>{' '}
              Énoncé des règles juridiques applicables (lois, jurisprudence, doctrine).
            </div>
          </div>

          <div className="flex items-start gap-2">
            <div className="h-5 w-5 rounded-full bg-amber-100 text-amber-600 dark:bg-amber-950 dark:text-amber-400 flex items-center justify-center shrink-0 text-xs font-bold mt-0.5">
              A
            </div>
            <div>
              <strong className="text-amber-600 dark:text-amber-400">Application :</strong>{' '}
              Application des règles juridiques aux faits du cas d'espèce.
            </div>
          </div>

          <div className="flex items-start gap-2">
            <div className="h-5 w-5 rounded-full bg-green-100 text-green-600 dark:bg-green-950 dark:text-green-400 flex items-center justify-center shrink-0 text-xs font-bold mt-0.5">
              C
            </div>
            <div>
              <strong className="text-green-600 dark:text-green-400">Conclusion :</strong>{' '}
              Réponse juridique motivée à la question posée.
            </div>
          </div>
        </div>
      </div>

      {/* Modal détails source */}
      <SourceDetailsModal
        source={selectedSource}
        isOpen={selectedSource !== null}
        onClose={() => setSelectedSource(null)}
      />
    </div>
  )
}
