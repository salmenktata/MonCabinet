'use client'

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { ResponsiveSankey } from '@nivo/sankey'
import { Badge } from '@/components/ui/badge'

interface PipelineFunnelSectionProps {
  stats: any
}

export default function PipelineFunnelSection({ stats }: PipelineFunnelSectionProps) {
  if (!stats || !stats.funnel) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Vue Funnel - Pipeline 7 Étapes</CardTitle>
          <CardDescription>Chargement...</CardDescription>
        </CardHeader>
      </Card>
    )
  }

  const { stages } = stats.funnel

  // Transformer les données pour Sankey
  const nodes = stages.map((stage: any) => ({
    id: stage.stage,
    label: stage.label,
  }))

  // Créer les liens entre stages NON-VIDES uniquement (skip les stages à 0)
  // pour garantir un flux Sankey connecté même si des étapes intermédiaires sont vides
  const nonZeroStages = stages.filter((s: any) => s.count > 0)
  const links = []
  for (let i = 0; i < nonZeroStages.length - 1; i++) {
    links.push({
      source: nonZeroStages[i].stage,
      target: nonZeroStages[i + 1].stage,
      value: nonZeroStages[i + 1].count,
    })
  }

  const connectedStageIds = new Set(links.flatMap((l: any) => [l.source, l.target]))
  const filteredNodes = nodes.filter((n: { id: string }) => connectedStageIds.has(n.id))
  const hasData = links.length > 0 && filteredNodes.length >= 2

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Vue Funnel - Pipeline 7 Étapes</CardTitle>
          <CardDescription>
            Visualisation du flux de documents à travers les 7 étapes du pipeline
          </CardDescription>
        </CardHeader>
        <CardContent>
          {hasData ? (
            <div style={{ height: '500px' }}>
              <ResponsiveSankey
                data={{ nodes: filteredNodes, links }}
                margin={{ top: 40, right: 160, bottom: 40, left: 50 }}
                align="justify"
                colors={{ scheme: 'category10' }}
                nodeOpacity={1}
                nodeThickness={18}
                nodeInnerPadding={3}
                nodeSpacing={24}
                nodeBorderWidth={0}
                linkOpacity={0.5}
                linkHoverOthersOpacity={0.1}
                enableLinkGradient={true}
                labelPosition="outside"
                labelOrientation="horizontal"
                labelPadding={16}
                labelTextColor={{ from: 'color', modifiers: [['darker', 1]] }}
              />
            </div>
          ) : (
            <div className="flex items-center justify-center h-48 text-muted-foreground">
              Données insuffisantes pour afficher le funnel
            </div>
          )}
        </CardContent>
      </Card>

      {/* Stats détaillées par étape */}
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {stages.map((stage: any) => (
          <Card key={stage.stage}>
            <CardHeader className="pb-3">
              <CardDescription className="text-xs">{stage.label}</CardDescription>
              <CardTitle className="text-2xl">{stage.count.toLocaleString()}</CardTitle>
            </CardHeader>
            <CardContent>
              <Badge variant="outline" className="text-xs">
                {stage.percentage}% du total
              </Badge>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
