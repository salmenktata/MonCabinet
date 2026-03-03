'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { Icons } from '@/lib/icons'

interface DayEntry {
  date: string
  byProvider: Record<string, { tokens: number; cost: number; requests: number }>
  total: { tokens: number; cost: number; requests: number }
}

const PROVIDERS_DISPLAY = [
  { id: 'deepseek', label: 'DeepSeek', icon: '🔵', showCost: true },
  { id: 'groq', label: 'Groq', icon: '⚡', showCost: false },
  { id: 'openai', label: 'OpenAI', icon: '🟢', showCost: true },
  { id: 'gemini', label: 'Gemini', icon: '✨', showCost: true },
  { id: 'ollama', label: 'Ollama', icon: '🦙', showCost: false },
]

function formatTokens(n: number): string {
  if (n === 0) return '—'
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`
  return n.toLocaleString('fr-FR')
}

function formatCost(n: number): string {
  if (n === 0) return '—'
  if (n < 0.001) return '<$0.001'
  return `$${n.toFixed(3)}`
}

function formatDate(dateStr: string): { full: string; short: string; isToday: boolean } {
  const date = new Date(dateStr + 'T00:00:00')
  const today = new Date()
  const isToday = dateStr === today.toISOString().slice(0, 10)
  return {
    full: date.toLocaleDateString('fr-FR', { weekday: 'long', day: '2-digit', month: 'long' }),
    short: date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }),
    isToday,
  }
}

export function DailyHistoryTable({ dailyTrend }: { dailyTrend: DayEntry[] }) {
  // Filtrer pour n'afficher que les jours avec activité + 5 derniers jours vides
  const activeDays = dailyTrend.filter(d => d.total.requests > 0)
  const displayed = dailyTrend.slice(0, Math.max(activeDays.length + 3, 7))

  // Totaux
  const totals = displayed.reduce(
    (acc, d) => {
      acc.cost += d.total.cost
      acc.tokens += d.total.tokens
      acc.requests += d.total.requests
      for (const p of PROVIDERS_DISPLAY) {
        acc.byCost[p.id] = (acc.byCost[p.id] || 0) + (d.byProvider[p.id]?.cost || 0)
        acc.byTokens[p.id] = (acc.byTokens[p.id] || 0) + (d.byProvider[p.id]?.tokens || 0)
      }
      return acc
    },
    { cost: 0, tokens: 0, requests: 0, byCost: {} as Record<string, number>, byTokens: {} as Record<string, number> }
  )

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Icons.calendar className="h-5 w-5" />
          Historique journalier (30 jours)
        </CardTitle>
        <CardDescription>
          Consommation tokens et coûts par provider, jour par jour. Coût affiché pour les providers payants.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-muted-foreground">
                <th className="pb-3 text-left font-medium">Date</th>
                {PROVIDERS_DISPLAY.map(p => (
                  <th key={p.id} className="pb-3 text-right font-medium px-2">
                    {p.icon} {p.label}
                    <span className="block text-xs font-normal opacity-60">
                      {p.showCost ? 'tokens / coût' : 'tokens'}
                    </span>
                  </th>
                ))}
                <th className="pb-3 text-right font-medium px-2">
                  Total
                  <span className="block text-xs font-normal opacity-60">tokens / coût</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/30">
              {displayed.map(day => {
                const { short, isToday } = formatDate(day.date)
                return (
                  <tr
                    key={day.date}
                    className={cn(
                      'hover:bg-muted/30 transition-colors',
                      isToday && 'bg-blue-500/5 font-medium'
                    )}
                  >
                    <td className="py-2 pr-4 whitespace-nowrap">
                      <span className={cn(isToday && 'text-blue-400')}>
                        {short}
                        {isToday && <span className="ml-1.5 text-xs text-blue-400 font-normal">Aujourd'hui</span>}
                      </span>
                    </td>
                    {PROVIDERS_DISPLAY.map(p => {
                      const data = day.byProvider[p.id]
                      return (
                        <td key={p.id} className="py-2 px-2 text-right font-mono text-xs">
                          {data ? (
                            <div>
                              <div className="text-foreground">{formatTokens(data.tokens)}</div>
                              {p.showCost && data.cost > 0 && (
                                <div className="text-muted-foreground">{formatCost(data.cost)}</div>
                              )}
                            </div>
                          ) : (
                            <span className="text-muted-foreground/40">—</span>
                          )}
                        </td>
                      )
                    })}
                    <td className="py-2 px-2 text-right font-mono text-xs">
                      {day.total.requests > 0 ? (
                        <div>
                          <div className="font-semibold">{formatTokens(day.total.tokens)}</div>
                          {day.total.cost > 0 && (
                            <div className="text-muted-foreground">{formatCost(day.total.cost)}</div>
                          )}
                        </div>
                      ) : (
                        <span className="text-muted-foreground/40">—</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
            {/* Ligne totaux */}
            <tfoot>
              <tr className="border-t-2 border-border font-semibold bg-muted/30">
                <td className="py-3 pr-4 text-muted-foreground">Total période</td>
                {PROVIDERS_DISPLAY.map(p => (
                  <td key={p.id} className="py-3 px-2 text-right font-mono text-xs">
                    <div>{formatTokens(totals.byTokens[p.id] || 0)}</div>
                    {p.showCost && (totals.byCost[p.id] || 0) > 0 && (
                      <div className="text-muted-foreground">{formatCost(totals.byCost[p.id] || 0)}</div>
                    )}
                  </td>
                ))}
                <td className="py-3 px-2 text-right font-mono text-xs">
                  <div>{formatTokens(totals.tokens)}</div>
                  {totals.cost > 0 && <div className="text-muted-foreground">{formatCost(totals.cost)}</div>}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </CardContent>
    </Card>
  )
}
