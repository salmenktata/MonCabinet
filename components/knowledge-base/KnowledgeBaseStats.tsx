'use client'

import { FileText, CheckCircle, Clock, Layers } from 'lucide-react'

export interface KnowledgeBaseStatsData {
  totalDocuments: number
  indexedDocuments: number
  pendingDocuments: number
  totalChunks: number
  byCategory: {
    jurisprudence?: number
    code?: number
    doctrine?: number
    modele?: number
    autre?: number
  }
}

interface KnowledgeBaseStatsProps {
  stats: KnowledgeBaseStatsData
}

const CATEGORY_CONFIG = {
  jurisprudence: { label: 'Jurisprudence', color: 'bg-blue-100 text-blue-700' },
  code: { label: 'Codes', color: 'bg-green-100 text-green-700' },
  doctrine: { label: 'Doctrine', color: 'bg-purple-100 text-purple-700' },
  modele: { label: 'Modèles', color: 'bg-orange-100 text-orange-700' },
  autre: { label: 'Autres', color: 'bg-muted text-foreground' },
}

export default function KnowledgeBaseStats({ stats }: KnowledgeBaseStatsProps) {
  const statCards = [
    {
      label: 'Documents',
      value: stats.totalDocuments,
      icon: FileText,
      color: 'text-blue-600 bg-blue-100',
    },
    {
      label: 'Indexés',
      value: stats.indexedDocuments,
      icon: CheckCircle,
      color: 'text-green-600 bg-green-100',
    },
    {
      label: 'En attente',
      value: stats.pendingDocuments,
      icon: Clock,
      color: 'text-orange-600 bg-orange-100',
    },
    {
      label: 'Chunks',
      value: stats.totalChunks,
      icon: Layers,
      color: 'text-purple-600 bg-purple-100',
    },
  ]

  return (
    <div className="space-y-4">
      {/* Cartes de statistiques principales */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {statCards.map((stat) => (
          <div
            key={stat.label}
            className="rounded-lg border bg-card p-4 flex items-center gap-3"
          >
            <div className={`p-2 rounded-lg ${stat.color}`}>
              <stat.icon className="h-5 w-5" />
            </div>
            <div>
              <p className="text-2xl font-bold">{stat.value}</p>
              <p className="text-sm text-muted-foreground">{stat.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Distribution par catégorie */}
      {stats.byCategory && Object.keys(stats.byCategory).length > 0 && (
        <div className="rounded-lg border bg-card p-4">
          <h3 className="text-sm font-medium text-muted-foreground mb-3">
            Répartition par catégorie
          </h3>
          <div className="flex flex-wrap gap-2">
            {Object.entries(stats.byCategory).map(([category, count]) => {
              if (!count) return null
              const config = CATEGORY_CONFIG[category as keyof typeof CATEGORY_CONFIG]
              if (!config) return null
              return (
                <span
                  key={category}
                  className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium ${config.color}`}
                >
                  {config.label}
                  <span className="bg-card/50 px-1.5 py-0.5 rounded text-xs">
                    {count}
                  </span>
                </span>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
