'use client'

/**
 * Timeline Chart - Exécutions crons sur 7 derniers jours
 * Stacked bar chart (completed vs failed)
 */

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'

interface CronsTimelineChartProps {
  data: Array<{
    date: string
    completed: number
    failed: number
    running: number
    total: number
  }>
}

export function CronsTimelineChart({ data }: CronsTimelineChartProps) {
  if (!data || data.length === 0) {
    return null
  }

  // Formater les données pour Recharts
  const chartData = data.map((d) => ({
    ...d,
    date: new Date(d.date).toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
    }),
  }))

  return (
    <Card>
      <CardHeader>
        <CardTitle>Timeline Exécutions</CardTitle>
        <CardDescription>
          Historique des exécutions sur les derniers jours
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
            <XAxis
              dataKey="date"
              className="text-xs"
              tick={{ fill: 'hsl(var(--muted-foreground))' }}
            />
            <YAxis
              className="text-xs"
              tick={{ fill: 'hsl(var(--muted-foreground))' }}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: 'hsl(var(--card))',
                border: '1px solid hsl(var(--border))',
                borderRadius: '6px',
              }}
              labelStyle={{ color: 'hsl(var(--foreground))' }}
              itemStyle={{ color: 'hsl(var(--foreground))' }}
            />
            <Legend
              wrapperStyle={{ paddingTop: '20px' }}
              iconType="rect"
            />
            <Bar
              dataKey="completed"
              name="Succès"
              stackId="a"
              fill="hsl(142, 76%, 36%)"
              radius={[0, 0, 4, 4]}
            />
            <Bar
              dataKey="failed"
              name="Échecs"
              stackId="a"
              fill="hsl(0, 84%, 60%)"
              radius={[4, 4, 0, 0]}
            />
          </BarChart>
        </ResponsiveContainer>

        {/* Stats rapides sous le graphique */}
        <div className="mt-4 grid grid-cols-3 gap-4 border-t pt-4">
          <div className="text-center">
            <div className="text-2xl font-bold text-green-600">
              {data.reduce((sum, d) => sum + d.completed, 0)}
            </div>
            <div className="text-xs text-muted-foreground">Total Succès</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-red-600">
              {data.reduce((sum, d) => sum + d.failed, 0)}
            </div>
            <div className="text-xs text-muted-foreground">Total Échecs</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold">
              {data.reduce((sum, d) => sum + d.total, 0)}
            </div>
            <div className="text-xs text-muted-foreground">Total Exécutions</div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
