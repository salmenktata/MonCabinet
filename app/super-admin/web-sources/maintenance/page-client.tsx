/**
 * Page Client - Maintenance Sources Web
 */

'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { MaintenanceTab } from '@/components/super-admin/web-sources/MaintenanceTab'
import { ArrowLeft, Database } from 'lucide-react'

export function MaintenancePageClient() {
  const router = useRouter()
  const [sources, setSources] = useState<Array<{ id: string; name: string; categories: string[]; rag_enabled: boolean }>>([])
  const [selectedSourceId, setSelectedSourceId] = useState<string>('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadSources()
  }, [])

  const loadSources = async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/admin/web-sources')
      const data = await response.json()

      if (data.sources) {
        setSources(data.sources)

        // Prioriser les sources rag_enabled=true (impact RAG direct)
        const ragSource = data.sources.find(
          (s: any) => s.rag_enabled === true && s.category !== 'google_drive'
        )
        if (ragSource) {
          setSelectedSourceId(ragSource.id)
        } else if (data.sources.length > 0) {
          setSelectedSourceId(data.sources[0].id)
        }
      }
    } catch (error) {
      console.error('Erreur chargement sources:', error)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button
              onClick={() => router.push('/super-admin/web-sources')}
              variant="outline"
              size="sm"
              className="border-border"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Retour
            </Button>
            <div>
              <h1 className="text-3xl font-bold flex items-center gap-3">
                <Database className="h-8 w-8 text-blue-500" />
                Maintenance Sources Web
              </h1>
              <p className="text-muted-foreground mt-1">
                Actions de nettoyage et réindexation
              </p>
            </div>
          </div>
        </div>

        {/* Sélection source */}
        <Card className="p-6 bg-card border-border">
          <label className="block text-sm font-medium text-foreground mb-2">
            Source Web
          </label>
          <select
            value={selectedSourceId}
            onChange={(e) => setSelectedSourceId(e.target.value)}
            className="w-full px-4 py-2 bg-background border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-blue-500"
            disabled={loading}
          >
            {loading ? (
              <option>Chargement...</option>
            ) : (
              sources.map((source) => (
                <option key={source.id} value={source.id}>
                  {source.name} ({(source.categories || []).join(', ')}){source.rag_enabled ? ' ✓ RAG' : ' — RAG désactivé'}
                </option>
              ))
            )}
          </select>
        </Card>

        {/* Contenu maintenance */}
        {selectedSourceId && !loading && (
          <MaintenanceTab sourceId={selectedSourceId} />
        )}

        {!selectedSourceId && !loading && (
          <Card className="p-12 bg-card border-border text-center">
            <p className="text-muted-foreground">Aucune source web disponible</p>
          </Card>
        )}
      </div>
    </div>
  )
}
