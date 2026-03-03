'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from '@/components/charts/LazyCharts'
import { Icons } from '@/lib/icons'

interface DayEntry {
  date: string
  total: { tokens: number; cost: number; requests: number }
}

interface ForecastSummary {
  totalCostMonthUsd: number
  forecastEndOfMonthUsd: number
  forecastDaysRemaining: number
  daysElapsed: number
  daysInMonth: number
  currentDate: string
}

function formatCost(n: number): string {
  if (n === 0) return '$0.00'
  if (n < 0.001) return '<$0.001'
  return `$${n.toFixed(3)}`
}

interface ChartPoint {
  date: string
  actual?: number
  forecast?: number
  isToday?: boolean
}

export function CostForecastChart({
  dailyTrend,
  forecast,
}: {
  dailyTrend: DayEntry[]
  forecast: ForecastSummary
}) {
  const today = forecast.currentDate
  const now = new Date(today + 'T00:00:00')
  const year = now.getFullYear()
  const month = now.getMonth()

  // Construire un index de coût par date
  const actualByDate: Record<string, number> = {}
  for (const d of dailyTrend) {
    actualByDate[d.date] = d.total.cost
  }

  // Coût cumulatif des jours passés
  let cumulative = 0
  const chartData: ChartPoint[] = []

  for (let day = 1; day <= forecast.daysInMonth; day++) {
    const d = new Date(year, month, day)
    const dateStr = d.toISOString().slice(0, 10)
    const isToday = dateStr === today
    const isPast = d <= now

    if (isPast) {
      cumulative += actualByDate[dateStr] || 0
      chartData.push({
        date: dateStr,
        actual: Math.round(cumulative * 10000) / 10000,
        isToday,
      })
    } else {
      // Projection linéaire : coût moyen par jour × jours restants
      const dailyAvg = forecast.daysElapsed > 0
        ? forecast.totalCostMonthUsd / forecast.daysElapsed
        : 0
      const projectedDay = day - forecast.daysElapsed
      const projectedCost = forecast.totalCostMonthUsd + dailyAvg * projectedDay
      chartData.push({
        date: dateStr,
        forecast: Math.round(projectedCost * 10000) / 10000,
        isToday: false,
      })
    }
  }

  // Ajouter le point de jonction (aujourd'hui dans les deux séries)
  const todayIdx = chartData.findIndex(p => p.date === today)
  if (todayIdx >= 0) {
    chartData[todayIdx].forecast = chartData[todayIdx].actual
  }

  const forecastAlert = forecast.forecastEndOfMonthUsd > 10
  const forecastGood = forecast.forecastEndOfMonthUsd < 3

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Icons.trendingUp className="h-5 w-5" />
              Prévision de coût — Fin de mois
            </CardTitle>
            <CardDescription>
              Coût cumulatif réel (bleu) + projection linéaire jusqu'au {new Date(year, month + 1, 0).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long' })} (orange tirets)
            </CardDescription>
          </div>
          <Badge
            className={
              forecastAlert
                ? 'bg-red-500/20 text-red-400 border-red-500/30'
                : forecastGood
                ? 'bg-green-500/20 text-green-400 border-green-500/30'
                : 'bg-orange-500/20 text-orange-400 border-orange-500/30'
            }
          >
            Prévision : {formatCost(forecast.forecastEndOfMonthUsd)}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        {/* Métriques rapides */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="text-center p-3 bg-muted/30 rounded-lg">
            <p className="text-xs text-muted-foreground">Dépensé</p>
            <p className="text-lg font-bold">{formatCost(forecast.totalCostMonthUsd)}</p>
            <p className="text-xs text-muted-foreground">Jour {forecast.daysElapsed}/{forecast.daysInMonth}</p>
          </div>
          <div className="text-center p-3 bg-muted/30 rounded-lg">
            <p className="text-xs text-muted-foreground">Moy. quotidienne</p>
            <p className="text-lg font-bold">
              {formatCost(forecast.daysElapsed > 0 ? forecast.totalCostMonthUsd / forecast.daysElapsed : 0)}
            </p>
            <p className="text-xs text-muted-foreground">par jour</p>
          </div>
          <div className={`text-center p-3 rounded-lg ${forecastAlert ? 'bg-red-500/10' : forecastGood ? 'bg-green-500/10' : 'bg-orange-500/10'}`}>
            <p className="text-xs text-muted-foreground">Projection fin mois</p>
            <p className={`text-lg font-bold ${forecastAlert ? 'text-red-400' : forecastGood ? 'text-green-400' : 'text-orange-400'}`}>
              {formatCost(forecast.forecastEndOfMonthUsd)}
            </p>
            <p className="text-xs text-muted-foreground">J-{forecast.forecastDaysRemaining}</p>
          </div>
        </div>

        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={chartData} margin={{ top: 5, right: 20, bottom: 0, left: 20 }}>
            <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
            <XAxis
              dataKey="date"
              tickFormatter={(d) => {
                const parts = d.split('-')
                return `${parts[2]}/${parts[1]}`
              }}
              tick={{ fontSize: 10 }}
            />
            <YAxis
              tickFormatter={(v) => `$${v.toFixed(2)}`}
              tick={{ fontSize: 10 }}
              width={55}
            />
            <Tooltip
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              formatter={((value: number, name: string) => [
                formatCost(value ?? 0),
                name === 'actual' ? 'Coût réel cumulé' : 'Projection',
              ]) as any}
              labelFormatter={(d) => new Date(d + 'T00:00:00').toLocaleDateString('fr-FR')}
            />
            <Legend
              formatter={(value) => value === 'actual' ? 'Coût réel' : 'Projection'}
            />
            {/* Ligne verticale = aujourd'hui */}
            <ReferenceLine
              x={today}
              stroke="#6b7280"
              strokeDasharray="4 4"
              label={{ value: "Auj.", position: 'top', fontSize: 10, fill: '#6b7280' }}
            />
            <Line
              type="monotone"
              dataKey="actual"
              stroke="#3b82f6"
              strokeWidth={2.5}
              dot={false}
              connectNulls={false}
              name="actual"
            />
            <Line
              type="monotone"
              dataKey="forecast"
              stroke="#f97316"
              strokeWidth={2}
              strokeDasharray="6 3"
              dot={false}
              connectNulls={false}
              name="forecast"
            />
          </LineChart>
        </ResponsiveContainer>

        {forecastAlert && (
          <div className="mt-4 p-3 border border-red-500/30 bg-red-500/5 rounded-lg text-sm text-red-400">
            ⚠️ La prévision dépasse $10/mois. Vérifier les opérations coûteuses dans l'onglet « Par opération ».
          </div>
        )}
      </CardContent>
    </Card>
  )
}
