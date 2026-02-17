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
            ⚡ Architecture IA - Mode No-Fallback
          </CardTitle>
          <CardDescription>
            1 provider fixe par opération — fiabilité maximale sans dégradation silencieuse.
            En cas d&apos;échec, l&apos;opération lève une exception et déclenche une alerte email immédiate.
            LLM_FALLBACK_ENABLED=false (défaut prod).
          </CardDescription>
        </CardHeader>
      </Card>

      {/* Tableau des 8 opérations */}
      <Card>
        <CardHeader>
          <CardTitle>8 Opérations — Configuration Prod (Fév 2026)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left p-3 font-semibold">Opération</th>
                  <th className="text-left p-3 font-semibold">Rôle</th>
                  <th className="text-center p-3 font-semibold">Provider (Prod)</th>
                  <th className="text-center p-3 font-semibold">Modèle</th>
                  <th className="text-center p-3 font-semibold">Embeddings</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b hover:bg-muted/50">
                  <td className="p-3 font-mono text-xs">assistant-ia</td>
                  <td className="p-3 text-muted-foreground">Chat utilisateur</td>
                  <td className="p-3 text-center">
                    <Badge className="bg-blue-500">Gemini</Badge>
                  </td>
                  <td className="p-3 text-center font-mono text-xs">gemini-2.5-flash</td>
                  <td className="p-3 text-center font-mono text-xs">text-embedding-3-small</td>
                </tr>
                <tr className="border-b hover:bg-muted/50">
                  <td className="p-3 font-mono text-xs">dossiers-assistant</td>
                  <td className="p-3 text-muted-foreground">Analyse dossiers</td>
                  <td className="p-3 text-center">
                    <Badge className="bg-blue-500">Gemini</Badge>
                  </td>
                  <td className="p-3 text-center font-mono text-xs">gemini-2.5-flash</td>
                  <td className="p-3 text-center font-mono text-xs">text-embedding-3-small</td>
                </tr>
                <tr className="border-b hover:bg-muted/50">
                  <td className="p-3 font-mono text-xs">dossiers-consultation</td>
                  <td className="p-3 text-muted-foreground">Consultation IRAC</td>
                  <td className="p-3 text-center">
                    <Badge className="bg-blue-500">Gemini</Badge>
                  </td>
                  <td className="p-3 text-center font-mono text-xs">gemini-2.5-flash</td>
                  <td className="p-3 text-center font-mono text-xs">text-embedding-3-small</td>
                </tr>
                <tr className="border-b hover:bg-muted/50">
                  <td className="p-3 font-mono text-xs">kb-quality-analysis</td>
                  <td className="p-3 text-muted-foreground">Analyse qualité KB</td>
                  <td className="p-3 text-center">
                    <Badge className="bg-blue-500">Gemini</Badge>
                  </td>
                  <td className="p-3 text-center font-mono text-xs">gemini-2.5-flash</td>
                  <td className="p-3 text-center text-muted-foreground">—</td>
                </tr>
                <tr className="border-b hover:bg-muted/50">
                  <td className="p-3 font-mono text-xs">document-consolidation</td>
                  <td className="p-3 text-muted-foreground">Consolidation docs</td>
                  <td className="p-3 text-center">
                    <Badge className="bg-blue-500">Gemini</Badge>
                  </td>
                  <td className="p-3 text-center font-mono text-xs">gemini-2.5-flash</td>
                  <td className="p-3 text-center font-mono text-xs">text-embedding-3-small</td>
                </tr>
                <tr className="border-b hover:bg-muted/50">
                  <td className="p-3 font-mono text-xs">query-classification</td>
                  <td className="p-3 text-muted-foreground">Classification query</td>
                  <td className="p-3 text-center">
                    <Badge className="bg-orange-500">Groq</Badge>
                  </td>
                  <td className="p-3 text-center font-mono text-xs">llama-3.3-70b-versatile</td>
                  <td className="p-3 text-center text-muted-foreground">—</td>
                </tr>
                <tr className="border-b hover:bg-muted/50">
                  <td className="p-3 font-mono text-xs">query-expansion</td>
                  <td className="p-3 text-muted-foreground">Expansion query</td>
                  <td className="p-3 text-center">
                    <Badge className="bg-orange-500">Groq</Badge>
                  </td>
                  <td className="p-3 text-center font-mono text-xs">llama-3.3-70b-versatile</td>
                  <td className="p-3 text-center text-muted-foreground">—</td>
                </tr>
                <tr className="border-b hover:bg-muted/50">
                  <td className="p-3 font-mono text-xs">indexation</td>
                  <td className="p-3 text-muted-foreground">Indexation KB</td>
                  <td className="p-3 text-center">
                    <Badge variant="secondary">Ollama</Badge>
                  </td>
                  <td className="p-3 text-center font-mono text-xs">qwen3:8b</td>
                  <td className="p-3 text-center font-mono text-xs">text-embedding-3-small</td>
                </tr>
              </tbody>
            </table>
            <p className="text-xs text-muted-foreground mt-2">
              Dev local : tous les providers remplacés par Ollama qwen3:8b + qwen3-embedding:0.6b
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Diagramme No-Fallback */}
      <Card>
        <CardHeader>
          <CardTitle>Comportement No-Fallback</CardTitle>
          <CardDescription>
            Chaque opération appelle un unique provider fixe — pas de cascade automatique
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="bg-muted p-4 rounded-lg overflow-x-auto">
            <pre className="text-xs font-mono whitespace-pre">
{`┌─────────────────────────────────┐
│   Requête IA (ex: assistant-ia) │
└───────────────┬─────────────────┘
                │
                ▼
   ┌────────────────────────────┐
   │  Provider fixe configuré  │
   │  (ex: Gemini 2.5 Flash)   │
   └───────────┬────────────────┘
               │
       ┌───────┴────────┐
       │                │
    Succès           Échec
       │                │
       ▼                ▼
  ┌─────────┐    ┌──────────────────┐
  │ Réponse │    │ throw Exception  │
  └─────────┘    │ + Email Alert    │
                 └──────────────────┘`}
            </pre>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Aucune dégradation silencieuse — une opération échoue clairement ou réussit.
            Alerte email immédiate pour les opérations critiques (severity: critical).
          </p>
        </CardContent>
      </Card>

      {/* Accordion 8 opérations */}
      <Card>
        <CardHeader>
          <CardTitle>Détail des 8 Opérations</CardTitle>
          <CardDescription>
            Configuration effective en production (source : lib/ai/operations-config.ts)
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Accordion type="single" collapsible className="w-full">
            <AccordionItem value="assistant-ia">
              <AccordionTrigger>
                <div className="flex items-center gap-2">
                  <Badge className="bg-blue-500">Gemini</Badge>
                  <span className="font-mono text-xs">assistant-ia</span>
                  <span className="text-sm font-normal text-muted-foreground">
                    Chat utilisateur temps réel
                  </span>
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <div className="space-y-2 text-sm">
                  <p><strong>Modèle :</strong> gemini-2.5-flash</p>
                  <p><strong>Embeddings :</strong> OpenAI text-embedding-3-small (1536-dim)</p>
                  <p><strong>Timeout :</strong> chat 30s, total 45s</p>
                  <p><strong>Alerte :</strong> email, severity critical</p>
                  <p><strong>Contexte :</strong> Chat RAG avec streaming SSE natif, seuil arabe 0.30</p>
                </div>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="dossiers-assistant">
              <AccordionTrigger>
                <div className="flex items-center gap-2">
                  <Badge className="bg-blue-500">Gemini</Badge>
                  <span className="font-mono text-xs">dossiers-assistant</span>
                  <span className="text-sm font-normal text-muted-foreground">
                    Analyse approfondie de dossiers
                  </span>
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <div className="space-y-2 text-sm">
                  <p><strong>Modèle :</strong> gemini-2.5-flash</p>
                  <p><strong>Embeddings :</strong> OpenAI text-embedding-3-small (1536-dim)</p>
                  <p><strong>Timeout :</strong> chat 40s, total 60s</p>
                  <p><strong>Alerte :</strong> email, severity critical</p>
                  <p><strong>Contexte :</strong> Analyse juridique avec contexte 1M tokens Gemini</p>
                </div>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="dossiers-consultation">
              <AccordionTrigger>
                <div className="flex items-center gap-2">
                  <Badge className="bg-blue-500">Gemini</Badge>
                  <span className="font-mono text-xs">dossiers-consultation</span>
                  <span className="text-sm font-normal text-muted-foreground">
                    Consultation formelle IRAC
                  </span>
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <div className="space-y-2 text-sm">
                  <p><strong>Modèle :</strong> gemini-2.5-flash</p>
                  <p><strong>Embeddings :</strong> OpenAI text-embedding-3-small (1536-dim)</p>
                  <p><strong>Timeout :</strong> chat 30s, total 60s</p>
                  <p><strong>Alerte :</strong> email, severity critical</p>
                  <p><strong>Contexte :</strong> Génération consultation juridique structurée (Issue / Rule / Application / Conclusion)</p>
                </div>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="kb-quality-analysis">
              <AccordionTrigger>
                <div className="flex items-center gap-2">
                  <Badge className="bg-blue-500">Gemini</Badge>
                  <span className="font-mono text-xs">kb-quality-analysis</span>
                  <span className="text-sm font-normal text-muted-foreground">
                    Analyse qualité de la Knowledge Base
                  </span>
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <div className="space-y-2 text-sm">
                  <p><strong>Modèle :</strong> gemini-2.5-flash</p>
                  <p><strong>Embeddings :</strong> — (LLM seul)</p>
                  <p><strong>Timeout :</strong> chat 45s, total 90s</p>
                  <p><strong>Alerte :</strong> email, severity warning</p>
                  <p><strong>Contexte :</strong> Analyse qualité arabe juridique, output JSON structuré, contexte 12k tokens</p>
                </div>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="document-consolidation">
              <AccordionTrigger>
                <div className="flex items-center gap-2">
                  <Badge className="bg-blue-500">Gemini</Badge>
                  <span className="font-mono text-xs">document-consolidation</span>
                  <span className="text-sm font-normal text-muted-foreground">
                    Consolidation de documents multi-pages
                  </span>
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <div className="space-y-2 text-sm">
                  <p><strong>Modèle :</strong> gemini-2.5-flash</p>
                  <p><strong>Embeddings :</strong> OpenAI text-embedding-3-small (1536-dim)</p>
                  <p><strong>Timeout :</strong> chat 60s, total 120s</p>
                  <p><strong>Alerte :</strong> log, severity warning</p>
                  <p><strong>Contexte :</strong> Fusion de plusieurs pages en 1 document cohérent, exploite le contexte 1M tokens</p>
                </div>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="query-classification">
              <AccordionTrigger>
                <div className="flex items-center gap-2">
                  <Badge className="bg-orange-500">Groq</Badge>
                  <span className="font-mono text-xs">query-classification</span>
                  <span className="text-sm font-normal text-muted-foreground">
                    Classification de requêtes pour filtrage KB
                  </span>
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <div className="space-y-2 text-sm">
                  <p><strong>Modèle :</strong> llama-3.3-70b-versatile</p>
                  <p><strong>Embeddings :</strong> — (LLM seul)</p>
                  <p><strong>Timeout :</strong> chat 5s, total 10s</p>
                  <p><strong>Alerte :</strong> log, severity info</p>
                  <p><strong>Contexte :</strong> Détermine les catégories KB pertinentes avant recherche vectorielle, ultra-rapide</p>
                </div>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="query-expansion">
              <AccordionTrigger>
                <div className="flex items-center gap-2">
                  <Badge className="bg-orange-500">Groq</Badge>
                  <span className="font-mono text-xs">query-expansion</span>
                  <span className="text-sm font-normal text-muted-foreground">
                    Expansion et reformulation de requêtes courtes
                  </span>
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <div className="space-y-2 text-sm">
                  <p><strong>Modèle :</strong> llama-3.3-70b-versatile</p>
                  <p><strong>Embeddings :</strong> — (LLM seul)</p>
                  <p><strong>Timeout :</strong> chat 5s, total 10s</p>
                  <p><strong>Alerte :</strong> log, severity info</p>
                  <p><strong>Contexte :</strong> Reformule les requêtes &lt;50 caractères pour améliorer le rappel RAG</p>
                </div>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="indexation">
              <AccordionTrigger>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">Ollama</Badge>
                  <span className="font-mono text-xs">indexation</span>
                  <span className="text-sm font-normal text-muted-foreground">
                    Indexation KB (background)
                  </span>
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <div className="space-y-2 text-sm">
                  <p><strong>LLM :</strong> Ollama qwen3:8b (classification)</p>
                  <p><strong>Embeddings prod :</strong> OpenAI text-embedding-3-small (1536-dim)</p>
                  <p><strong>Embeddings dev :</strong> Ollama qwen3-embedding:0.6b (1024-dim)</p>
                  <p><strong>Timeout :</strong> embedding 10s, chat 30s, total 60s</p>
                  <p><strong>Alerte :</strong> log, severity warning</p>
                  <p><strong>Contexte :</strong> Triple embedding parallèle (OpenAI + Ollama + Gemini) pour hybrid search</p>
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </CardContent>
      </Card>

      {/* Économies réelles */}
      <Card className="border-green-500 bg-green-50 dark:bg-green-950">
        <CardHeader>
          <CardTitle className="text-green-700 dark:text-green-300">
            💰 Économies Réalisées
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-center">
            <div>
              <p className="text-3xl font-bold text-green-600 dark:text-green-400">~150-200€/mois</p>
              <p className="text-sm text-muted-foreground">Si GPT-4o / Claude (LLM payant)</p>
            </div>
            <div>
              <p className="text-3xl font-bold text-green-600 dark:text-green-400">→</p>
            </div>
            <div>
              <p className="text-3xl font-bold text-green-600 dark:text-green-400">~$2-5/mois</p>
              <p className="text-sm text-muted-foreground">Coût actuel (OpenAI embeddings uniquement)</p>
            </div>
          </div>
          <div className="mt-4 text-center">
            <p className="text-4xl font-bold text-green-700 dark:text-green-300">
              ~98% d&apos;économie sur les LLM
            </p>
            <p className="text-sm text-muted-foreground mt-2">
              Gain principal : LLM gratuits (Gemini 2.5 Flash + Groq llama-3.3-70b) — seuls les embeddings OpenAI sont facturés (~$2-5/mois)
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

export default AIFlowDiagram
