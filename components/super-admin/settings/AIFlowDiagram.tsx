'use client'

import React from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'

const AIFlowDiagram: React.FC = () => {
  return (
    <div className="space-y-6">
      {/* Introduction */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            ⚡ Architecture Hybride IA - Option C
          </CardTitle>
          <CardDescription>
            Système dual-mode optimisant coûts et performance : Mode Rapide (gratuit, Ollama local) pour l'usage quotidien,
            Mode Premium (cloud providers) pour les tâches critiques.
          </CardDescription>
        </CardHeader>
      </Card>

      {/* Tableau comparatif Mode Rapide vs Mode Premium */}
      <Card>
        <CardHeader>
          <CardTitle>Comparaison des Modes</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left p-3 font-semibold">Provider</th>
                  <th className="text-center p-3 font-semibold">Mode Rapide ⚡</th>
                  <th className="text-center p-3 font-semibold">Mode Premium 🧠</th>
                  <th className="text-center p-3 font-semibold">Embeddings</th>
                  <th className="text-center p-3 font-semibold">Latence</th>
                  <th className="text-center p-3 font-semibold">Coût</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b hover:bg-muted/50">
                  <td className="p-3 font-medium">🤖 Ollama</td>
                  <td className="p-3 text-center">
                    <Badge className="bg-green-500">🟢 Priorité</Badge>
                  </td>
                  <td className="p-3 text-center">
                    <Badge variant="secondary">⚫ Skip</Badge>
                  </td>
                  <td className="p-3 text-center">
                    <Badge className="bg-green-500">🟢 Exclusif</Badge>
                  </td>
                  <td className="p-3 text-center">~15-20s</td>
                  <td className="p-3 text-center font-semibold text-green-600">0€</td>
                </tr>
                <tr className="border-b hover:bg-muted/50">
                  <td className="p-3 font-medium">🧠 Gemini</td>
                  <td className="p-3 text-center">
                    <Badge variant="outline">🟡 Fallback 1</Badge>
                  </td>
                  <td className="p-3 text-center">
                    <Badge className="bg-blue-500">🟢 Priorité</Badge>
                  </td>
                  <td className="p-3 text-center">
                    <Badge variant="destructive">❌</Badge>
                  </td>
                  <td className="p-3 text-center">~10-15s</td>
                  <td className="p-3 text-center font-semibold text-green-600">Gratuit*</td>
                </tr>
                <tr className="border-b hover:bg-muted/50">
                  <td className="p-3 font-medium">💜 DeepSeek</td>
                  <td className="p-3 text-center">
                    <Badge variant="outline">🟡 Fallback 2</Badge>
                  </td>
                  <td className="p-3 text-center">
                    <Badge variant="outline">🟡 Fallback 1</Badge>
                  </td>
                  <td className="p-3 text-center">
                    <Badge variant="destructive">❌</Badge>
                  </td>
                  <td className="p-3 text-center">~15-25s</td>
                  <td className="p-3 text-center">0.14$/1M tokens</td>
                </tr>
                <tr className="border-b hover:bg-muted/50">
                  <td className="p-3 font-medium">⚡ Groq</td>
                  <td className="p-3 text-center">
                    <Badge variant="outline">🟡 Fallback 3</Badge>
                  </td>
                  <td className="p-3 text-center">
                    <Badge variant="outline">🟡 Fallback 2</Badge>
                  </td>
                  <td className="p-3 text-center">
                    <Badge variant="destructive">❌</Badge>
                  </td>
                  <td className="p-3 text-center">~5-10s</td>
                  <td className="p-3 text-center font-semibold text-green-600">Gratuit*</td>
                </tr>
                <tr className="border-b hover:bg-muted/50">
                  <td className="p-3 font-medium">🧡 Anthropic</td>
                  <td className="p-3 text-center">
                    <Badge variant="outline">🟡 Fallback 4</Badge>
                  </td>
                  <td className="p-3 text-center">
                    <Badge variant="outline">🟡 Fallback 3</Badge>
                  </td>
                  <td className="p-3 text-center">
                    <Badge variant="destructive">❌</Badge>
                  </td>
                  <td className="p-3 text-center">~10-20s</td>
                  <td className="p-3 text-center">3$/1M tokens</td>
                </tr>
              </tbody>
            </table>
            <p className="text-xs text-muted-foreground mt-2">
              * Gratuit avec quotas limités (Gemini: 60 req/min, 1500 req/jour | Groq: 30 req/min, 14400 req/jour)
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Diagramme de flux Mermaid */}
      <Card>
        <CardHeader>
          <CardTitle>Diagramme de Fallback LLM</CardTitle>
          <CardDescription>
            Hiérarchie de fallback automatique en cas d'erreur ou de rate limiting (429/5xx)
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="bg-muted p-4 rounded-lg overflow-x-auto">
            <pre className="text-xs font-mono whitespace-pre">
{`┌─────────────────────────┐
│   Requête IA (Chat)     │
└───────────┬─────────────┘
            │
            ▼
    ┌───────────────┐
    │ Mode Sélect ? │
    └───┬───────┬───┘
        │       │
   ⚡ Rapide   🧠 Premium
        │       │
        ▼       ▼
    ┌──────┐ ┌────────┐
    │Ollama│ │ Gemini │
    └───┬──┘ └───┬────┘
        │        │
    Erreur?  429/5xx?
        │        │
        ▼        ▼
    ┌────────┐ ┌──────────┐
    │ Gemini │ │ DeepSeek │
    └───┬────┘ └────┬─────┘
        │           │
    429/5xx?    429/5xx?
        │           │
        ▼           ▼
    ┌──────────┐ ┌──────┐
    │ DeepSeek │ │ Groq │
    └────┬─────┘ └───┬──┘
         │           │
     429/5xx?    429/5xx?
         │           │
         ▼           ▼
      ┌──────┐  ┌───────────┐
      │ Groq │  │ Anthropic │
      └───┬──┘  └─────┬─────┘
          │           │
      429/5xx?    Échec?
          │           │
          ▼           ▼
     ┌───────────┐ ┌────────────┐
     │ Anthropic │ │ ❌ Erreur  │
     └─────┬─────┘ └────────────┘
           │
       Échec?
           │
           ▼
      ┌────────────┐
      │ ❌ Erreur  │
      └────────────┘`}
            </pre>
          </div>
        </CardContent>
      </Card>

      {/* Stratégies par contexte */}
      <Card>
        <CardHeader>
          <CardTitle>Stratégies par Contexte d'Usage</CardTitle>
          <CardDescription>
            Chaque opération IA utilise une stratégie de fallback optimisée selon ses besoins
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Accordion type="single" collapsible className="w-full">
            <AccordionItem value="rag-chat">
              <AccordionTrigger>
                <div className="flex items-center gap-2">
                  <Badge>rag-chat</Badge>
                  <span className="text-sm font-normal text-muted-foreground">
                    Chat RAG avec recherche vectorielle
                  </span>
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <div className="space-y-2 text-sm">
                  <p><strong>Stratégie :</strong> Gemini (x2 tentatives) → DeepSeek → Ollama</p>
                  <p><strong>Volume :</strong> 2-3M tokens/jour (haute fréquence)</p>
                  <p><strong>Raison :</strong> Gemini gratuit avec quotas généreux, fallback économique DeepSeek</p>
                </div>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="embeddings">
              <AccordionTrigger>
                <div className="flex items-center gap-2">
                  <Badge>embeddings</Badge>
                  <span className="text-sm font-normal text-muted-foreground">
                    Génération d'embeddings vectoriels
                  </span>
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <div className="space-y-2 text-sm">
                  <p><strong>Stratégie :</strong> Ollama exclusif (qwen3-embedding:0.6b)</p>
                  <p><strong>Économie :</strong> -400 à -750$/mois (OpenAI text-embedding-3-small)</p>
                  <p><strong>Raison :</strong> Volume massif (1000+ docs), coût prohibitif en cloud</p>
                  <p className="text-destructive"><strong>⚠️ Pas de fallback :</strong> Throw error si Ollama down</p>
                </div>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="quality-analysis">
              <AccordionTrigger>
                <div className="flex items-center gap-2">
                  <Badge>quality-analysis</Badge>
                  <span className="text-sm font-normal text-muted-foreground">
                    Analyse qualité juridique
                  </span>
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <div className="space-y-2 text-sm">
                  <p><strong>Stratégie :</strong> DeepSeek → Gemini → Ollama</p>
                  <p><strong>Volume :</strong> Faible (quelques centaines/jour)</p>
                  <p><strong>Raison :</strong> DeepSeek excellent rapport qualité/prix pour analyse approfondie</p>
                </div>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="structuring">
              <AccordionTrigger>
                <div className="flex items-center gap-2">
                  <Badge>structuring</Badge>
                  <span className="text-sm font-normal text-muted-foreground">
                    Structuration de documents
                  </span>
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <div className="space-y-2 text-sm">
                  <p><strong>Stratégie :</strong> DeepSeek → Gemini → Ollama</p>
                  <p><strong>Volume :</strong> Moyen (quelques milliers/jour)</p>
                  <p><strong>Raison :</strong> Tâche structurée bénéficiant de la précision DeepSeek</p>
                </div>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="translation">
              <AccordionTrigger>
                <div className="flex items-center gap-2">
                  <Badge>translation</Badge>
                  <span className="text-sm font-normal text-muted-foreground">
                    Traduction bilingue FR/AR
                  </span>
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <div className="space-y-2 text-sm">
                  <p><strong>Stratégie :</strong> Gemini → Groq</p>
                  <p><strong>Volume :</strong> Faible (quelques centaines/jour)</p>
                  <p><strong>Raison :</strong> Gemini excellent en multilingue, Groq ultra-rapide en fallback</p>
                </div>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="web-scraping">
              <AccordionTrigger>
                <div className="flex items-center gap-2">
                  <Badge>web-scraping</Badge>
                  <span className="text-sm font-normal text-muted-foreground">
                    Extraction web intelligente
                  </span>
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <div className="space-y-2 text-sm">
                  <p><strong>Stratégie :</strong> Gemini → Ollama</p>
                  <p><strong>Volume :</strong> Variable (dépend du crawling)</p>
                  <p><strong>Raison :</strong> Extraction simple, Gemini suffisant avec fallback local</p>
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </CardContent>
      </Card>

      {/* Économies réalisées */}
      <Card className="border-green-500 bg-green-50 dark:bg-green-950">
        <CardHeader>
          <CardTitle className="text-green-700 dark:text-green-300">
            💰 Économies Réalisées
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-center">
            <div>
              <p className="text-3xl font-bold text-green-600 dark:text-green-400">~100€/mois</p>
              <p className="text-sm text-muted-foreground">Coût avant Option C</p>
            </div>
            <div>
              <p className="text-3xl font-bold text-green-600 dark:text-green-400">→</p>
            </div>
            <div>
              <p className="text-3xl font-bold text-green-600 dark:text-green-400">~0-5€/mois</p>
              <p className="text-sm text-muted-foreground">Coût après Option C</p>
            </div>
          </div>
          <div className="mt-4 text-center">
            <p className="text-4xl font-bold text-green-700 dark:text-green-300">
              ~1200€/an économisés 🎉
            </p>
            <p className="text-sm text-muted-foreground mt-2">
              Gain principal : Embeddings Ollama local vs OpenAI cloud (-400 à -750$/mois)
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

export default AIFlowDiagram
