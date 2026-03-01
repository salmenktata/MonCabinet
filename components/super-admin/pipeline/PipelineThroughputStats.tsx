'use client'

interface ThroughputData {
  dailyAdvanced: Array<{ date: string; count: number }>
  rejectionsBySource: Array<{ source_name: string; rejected: number; total: number; rate: number }>
  slaBreaches: number
}

interface PipelineThroughputStatsProps {
  throughput: ThroughputData
  avgTimePerStage?: Array<{ stage: string; avgHours: number; count: number }>
}

export function PipelineThroughputStats({ throughput, avgTimePerStage }: PipelineThroughputStatsProps) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Throughput 7j */}
        <div className="rounded-lg border bg-card p-4">
          <p className="text-sm font-medium text-muted-foreground mb-2">Throughput 7j</p>
          <div className="space-y-1">
            {throughput.dailyAdvanced.length > 0 ? (
              throughput.dailyAdvanced.slice(0, 7).map(d => (
                <div key={d.date} className="flex justify-between text-sm">
                  <span className="text-muted-foreground">
                    {new Date(d.date).toLocaleDateString('fr-FR', { weekday: 'short', day: '2-digit' })}
                  </span>
                  <span className="font-medium">{d.count} docs</span>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">Aucune activité</p>
            )}
          </div>
        </div>

        {/* SLA Breaches */}
        <div className="rounded-lg border bg-card p-4">
          <p className="text-sm font-medium text-muted-foreground mb-2">SLA ({'>'}3j sans avancer)</p>
          <p className={`text-3xl font-bold ${throughput.slaBreaches > 0 ? 'text-red-600' : 'text-green-600'}`}>
            {throughput.slaBreaches}
          </p>
          <p className="text-xs text-muted-foreground mt-1">documents en attente</p>
        </div>

        {/* Taux rejet par source */}
        <div className="rounded-lg border bg-card p-4">
          <p className="text-sm font-medium text-muted-foreground mb-2">Taux rejet par source</p>
          <div className="space-y-1">
            {throughput.rejectionsBySource.length > 0 ? (
              throughput.rejectionsBySource.slice(0, 5).map(s => (
                <div key={s.source_name} className="flex justify-between text-sm">
                  <span className="truncate max-w-[140px] text-muted-foreground">{s.source_name}</span>
                  <span className={`font-medium ${s.rate > 20 ? 'text-red-600' : s.rate > 10 ? 'text-amber-600' : 'text-green-600'}`}>
                    {s.rate}%
                  </span>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">Aucune donnée</p>
            )}
          </div>
        </div>
      </div>

      {/* Temps moyen par transition */}
      {avgTimePerStage && avgTimePerStage.length > 0 && (
        <div className="rounded-lg border bg-card p-4">
          <p className="text-sm font-medium text-muted-foreground mb-3">Temps moyen par transition</p>
          <div className="flex flex-wrap gap-3">
            {avgTimePerStage.map(t => (
              <div key={t.stage} className="rounded-md bg-muted/50 px-3 py-1.5 text-sm">
                <span className="text-muted-foreground">{t.stage}</span>
                <span className="ml-2 font-medium">
                  {t.avgHours < 1
                    ? `${Math.round(t.avgHours * 60)}min`
                    : t.avgHours < 24
                    ? `${t.avgHours}h`
                    : `${Math.round(t.avgHours / 24)}j`}
                </span>
                <span className="ml-1 text-xs text-muted-foreground">({t.count})</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
