'use client'

import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'

interface FunnelStage {
  stage: string
  label: string
  count: number
  percentage: number
}

interface PipelineFunnelProps {
  stages: FunnelStage[]
  total: number
  pendingValidation: number
  rejected: number
  needsRevision: number
  onStageClick?: (stage: string) => void
}

const STAGE_COLORS: Record<string, string> = {
  source_configured: '#94a3b8',
  crawled: '#60a5fa',
  content_reviewed: '#818cf8',
  classified: '#a78bfa',
  indexed: '#c084fc',
  quality_analyzed: '#f472b6',
  rag_active: '#34d399',
}

// Étapes traversées automatiquement (auto-advance instantané, toujours à 0)
const AUTO_ADVANCE_STAGES = new Set(['content_reviewed', 'classified'])

export function PipelineFunnel({
  stages,
  total,
  pendingValidation,
  rejected,
  needsRevision,
  onStageClick,
}: PipelineFunnelProps) {
  return (
    <div className="space-y-4">
      {/* KPIs */}
      <div className="grid grid-cols-4 gap-4">
        <div className="rounded-lg border bg-card p-4">
          <p className="text-sm text-muted-foreground">Total documents</p>
          <p className="text-2xl font-bold">{total.toLocaleString()}</p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <p className="text-sm text-muted-foreground">En attente validation</p>
          <p className="text-2xl font-bold text-amber-500">{pendingValidation.toLocaleString()}</p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <p className="text-sm text-muted-foreground">RAG Actif</p>
          <p className="text-2xl font-bold text-green-500">
            {stages.find(s => s.stage === 'rag_active')?.count.toLocaleString() || 0}
          </p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <p className="text-sm text-muted-foreground">Rejetés / A réviser</p>
          <p className="text-2xl font-bold text-red-500">
            {rejected} / <span className="text-orange-500">{needsRevision}</span>
          </p>
        </div>
      </div>

      {/* Funnel Chart */}
      <div className="rounded-lg border bg-card p-4">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-medium text-muted-foreground">Funnel Pipeline</h3>
          <span className="text-xs text-muted-foreground">
            2 étapes automatiques masquées (Contenu validé, Classifié — traversées instantanément)
          </span>
        </div>
        <ResponsiveContainer width="100%" height={250}>
          <BarChart data={stages.filter(s => !AUTO_ADVANCE_STAGES.has(s.stage))} layout="horizontal">
            <XAxis
              dataKey="label"
              tick={{ fontSize: 11 }}
              interval={0}
              angle={-20}
              textAnchor="end"
              height={60}
            />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip
              formatter={(value: unknown) => [
                `${Number(value).toLocaleString()} docs`,
                'Documents',
              ]}
            />
            <Bar
              dataKey="count"
              radius={[4, 4, 0, 0]}
              cursor="pointer"
              onClick={(_data: unknown, index: number) => {
                const stage = stages[index]
                if (stage) onStageClick?.(stage.stage)
              }}
            >
              {stages.map((entry) => (
                <Cell
                  key={entry.stage}
                  fill={STAGE_COLORS[entry.stage] || '#94a3b8'}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
