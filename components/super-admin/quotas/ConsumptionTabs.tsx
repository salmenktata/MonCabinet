'use client'

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from '@/components/charts/LazyCharts'

interface DayEntry {
  date: string
  byProvider: Record<string, { tokens: number; cost: number; requests: number }>
  total: { tokens: number; cost: number; requests: number }
}

interface UserEntry {
  userId: string
  email: string | null
  name: string | null
  totalTokens: number
  totalCostUsd: number
  requestsCount: number
}

interface OperationEntry {
  operationType: string
  provider: string
  model: string | null
  requests: number
  inputTokens: number
  outputTokens: number
  totalTokens: number
  costUsd: number
}

const PROVIDER_COLORS: Record<string, string> = {
  deepseek: '#3b82f6',
  groq: '#f97316',
  openai: '#22c55e',
  gemini: '#eab308',
  ollama: '#a855f7',
  anthropic: '#ef4444',
}

const PROVIDER_LABELS: Record<string, string> = {
  deepseek: 'DeepSeek',
  groq: 'Groq',
  openai: 'OpenAI',
  gemini: 'Gemini',
  ollama: 'Ollama',
  anthropic: 'Anthropic',
}

const OPERATION_LABELS: Record<string, string> = {
  'assistant-ia': 'Chat IA',
  'dossiers-assistant': 'Dossiers - Assistant',
  'dossiers-structuration': 'Dossiers - Structure',
  'dossiers-consultation': 'Dossiers - Consultation',
  'document-consolidation': 'Consolidation docs',
  'rag-eval-judge': 'Éval RAG (Judge)',
  'query-classification': 'Classification query',
  'query-expansion': 'Expansion query',
  'indexation': 'Indexation KB',
  'kb-quality-analysis': 'Qualité KB',
  'embedding': 'Embeddings',
  'ariida-generation': 'Génération Ariida',
  'chat': 'Chat (legacy)',
  'generation': 'Génération (legacy)',
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return n.toLocaleString('fr-FR')
}

function formatCost(n: number): string {
  if (n === 0) return '$0.00'
  if (n < 0.001) return '<$0.001'
  return `$${n.toFixed(3)}`
}

// ─── Onglet Consommation (graphe empilé 30j) ───────────────────────────────────
function ConsumptionChart({ dailyTrend }: { dailyTrend: DayEntry[] }) {
  const providers = ['deepseek', 'groq', 'openai', 'gemini', 'ollama']
  const activeProviders = providers.filter(p =>
    dailyTrend.some(d => (d.byProvider[p]?.tokens || 0) > 0)
  )

  const chartData = [...dailyTrend].reverse().map(d => ({
    date: d.date,
    ...Object.fromEntries(
      activeProviders.map(p => [p, d.byProvider[p]?.tokens || 0])
    ),
  }))

  return (
    <Card>
      <CardHeader>
        <CardTitle>Consommation tokens par provider (30j)</CardTitle>
        <CardDescription>Graphe empilé — chaque couleur représente un provider</CardDescription>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={350}>
          <AreaChart data={chartData} margin={{ top: 10, right: 20, bottom: 0, left: 20 }}>
            <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
            <XAxis
              dataKey="date"
              tickFormatter={(d) => {
                const parts = d.split('-')
                return `${parts[2]}/${parts[1]}`
              }}
              tick={{ fontSize: 11 }}
            />
            <YAxis
              tickFormatter={(v) => formatTokens(v)}
              tick={{ fontSize: 11 }}
              width={60}
            />
            <Tooltip
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              formatter={((value: number, name: string) => [
                formatTokens(value ?? 0),
                PROVIDER_LABELS[name] || name,
              ]) as any}
              labelFormatter={(d) => new Date(d + 'T00:00:00').toLocaleDateString('fr-FR')}
            />
            <Legend
              formatter={(value) => PROVIDER_LABELS[value] || value}
            />
            {activeProviders.map(p => (
              <Area
                key={p}
                type="monotone"
                dataKey={p}
                stackId="1"
                stroke={PROVIDER_COLORS[p] || '#888'}
                fill={PROVIDER_COLORS[p] || '#888'}
                fillOpacity={0.6}
                name={p}
              />
            ))}
          </AreaChart>
        </ResponsiveContainer>

        {activeProviders.length === 0 && (
          <div className="h-64 flex items-center justify-center text-muted-foreground">
            Aucune donnée de consommation sur 30 jours
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ─── Onglet Par utilisateur ───────────────────────────────────────────────────
function UserBreakdown({ topUsers }: { topUsers: UserEntry[] }) {
  if (topUsers.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          Aucun utilisateur identifié ce mois. Les requêtes système (crons, eval) ne sont pas attribuées.
        </CardContent>
      </Card>
    )
  }

  const maxTokens = Math.max(...topUsers.map(u => u.totalTokens), 1)

  return (
    <Card>
      <CardHeader>
        <CardTitle>Top utilisateurs ce mois</CardTitle>
        <CardDescription>Consommation cumulée par utilisateur identifié</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {topUsers.map((user, idx) => (
            <div key={user.userId} className="flex items-center gap-3">
              <span className="text-muted-foreground font-mono text-sm w-5 shrink-0">
                {idx + 1}.
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-medium text-sm truncate">
                      {user.name || user.email || user.userId.slice(0, 8) + '…'}
                    </span>
                    {user.email && user.name && (
                      <span className="text-muted-foreground text-xs truncate hidden sm:block">
                        {user.email}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="font-mono text-sm">{formatTokens(user.totalTokens)}</span>
                    {user.totalCostUsd > 0 && (
                      <Badge variant="outline" className="text-xs font-mono">
                        {formatCost(user.totalCostUsd)}
                      </Badge>
                    )}
                    <span className="text-muted-foreground text-xs">
                      {user.requestsCount} req.
                    </span>
                  </div>
                </div>
                <div className="w-full bg-muted rounded-full h-1.5">
                  <div
                    className="h-1.5 rounded-full bg-blue-500 transition-all"
                    style={{ width: `${(user.totalTokens / maxTokens) * 100}%` }}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

// ─── Onglet Par opération ──────────────────────────────────────────────────────
function OperationBreakdown({ byOperation }: { byOperation: OperationEntry[] }) {
  if (byOperation.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          Aucune opération ce mois
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Breakdown par opération ce mois</CardTitle>
        <CardDescription>Consommation par type d'opération et provider</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-muted-foreground">
                <th className="pb-3 text-left font-medium">Opération</th>
                <th className="pb-3 text-left font-medium">Provider / Modèle</th>
                <th className="pb-3 text-right font-medium">Requêtes</th>
                <th className="pb-3 text-right font-medium">Input</th>
                <th className="pb-3 text-right font-medium">Output</th>
                <th className="pb-3 text-right font-medium">Coût</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/30">
              {byOperation.map((op, idx) => (
                <tr key={idx} className="hover:bg-muted/30 transition-colors">
                  <td className="py-2.5 pr-4">
                    <span className="font-medium">
                      {OPERATION_LABELS[op.operationType] || op.operationType}
                    </span>
                  </td>
                  <td className="py-2.5 pr-4">
                    <div className="flex flex-col">
                      <span
                        className="text-sm font-medium"
                        style={{ color: PROVIDER_COLORS[op.provider] || 'inherit' }}
                      >
                        {PROVIDER_LABELS[op.provider] || op.provider}
                      </span>
                      {op.model && (
                        <span className="text-xs text-muted-foreground font-mono truncate max-w-[160px]" title={op.model}>
                          {op.model}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="py-2.5 pr-4 text-right font-mono text-xs">
                    {op.requests.toLocaleString('fr-FR')}
                  </td>
                  <td className="py-2.5 pr-4 text-right font-mono text-xs text-muted-foreground">
                    {formatTokens(op.inputTokens)}
                  </td>
                  <td className="py-2.5 pr-4 text-right font-mono text-xs text-muted-foreground">
                    {formatTokens(op.outputTokens)}
                  </td>
                  <td className="py-2.5 text-right font-mono text-xs font-semibold">
                    {op.costUsd > 0 ? formatCost(op.costUsd) : <span className="text-green-500">$0</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  )
}

// ─── Composant principal ───────────────────────────────────────────────────────
interface ConsumptionTabsProps {
  dailyTrend: DayEntry[]
  topUsers: UserEntry[]
  byOperation: OperationEntry[]
}

export function ConsumptionTabs({ dailyTrend, topUsers, byOperation }: ConsumptionTabsProps) {
  return (
    <Tabs defaultValue="consumption">
      <TabsList className="grid w-full grid-cols-3">
        <TabsTrigger value="consumption">Consommation 30j</TabsTrigger>
        <TabsTrigger value="users">Par utilisateur</TabsTrigger>
        <TabsTrigger value="operations">Par opération</TabsTrigger>
      </TabsList>
      <TabsContent value="consumption" className="mt-4">
        <ConsumptionChart dailyTrend={dailyTrend} />
      </TabsContent>
      <TabsContent value="users" className="mt-4">
        <UserBreakdown topUsers={topUsers} />
      </TabsContent>
      <TabsContent value="operations" className="mt-4">
        <OperationBreakdown byOperation={byOperation} />
      </TabsContent>
    </Tabs>
  )
}
