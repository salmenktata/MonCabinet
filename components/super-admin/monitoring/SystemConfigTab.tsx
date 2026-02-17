'use client'

/**
 * Onglet Configuration Système - Dashboard Monitoring
 *
 * Affiche en temps réel :
 * - État configuration RAG
 * - Providers embeddings actifs
 * - Statistiques KB (docs indexés, chunks)
 * - Alertes misconfiguration
 * - Variables d'environnement (présentes/manquantes/dépréciées)
 */

import { useEffect, useState } from 'react'
import { AlertCircle, CheckCircle, XCircle, Database, Cpu, Cloud, HardDrive, ShieldCheck } from 'lucide-react'

interface EnvVarConfig {
  status: 'ok' | 'warning' | 'critical'
  missing: string[]
  present: string[]
  importantMissing: string[]
  importantPresent: string[]
  deprecated: { name: string; replacedBy: string }[]
  ragConfig: {
    ragEnabled: boolean
    ollamaEnabled: boolean
    openaiConfigured: boolean
    groqConfigured: boolean
    googleConfigured: boolean
    redisConfigured: boolean
  }
  totalChecked: number
  checkedAt: string
}

interface RAGConfig {
  enabled: boolean
  semanticSearchEnabled: boolean
  ollamaEnabled: boolean
  openaiConfigured: boolean
  kbDocsIndexed: number
  kbChunksAvailable: number
  status: 'ok' | 'misconfigured'
}

interface HealthCheckResponse {
  status: 'healthy' | 'unhealthy'
  timestamp: string
  uptime: number
  responseTime: string
  services: {
    database: string
    storage: string
    api: string
  }
  rag?: RAGConfig
  version: string
}

export default function SystemConfigTab() {
  const [healthData, setHealthData] = useState<HealthCheckResponse | null>(null)
  const [envVarData, setEnvVarData] = useState<EnvVarConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date())

  // Fetch health check data
  const fetchHealthCheck = async () => {
    try {
      const response = await fetch('/api/health')
      if (!response.ok) throw new Error('Health check failed')
      const data = await response.json()
      setHealthData(data)
      setError(null)
      setLastUpdate(new Date())
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Health check failed')
    } finally {
      setLoading(false)
    }
  }

  // Fetch env var drift data
  const fetchEnvVarConfig = async () => {
    try {
      const response = await fetch('/api/admin/monitoring/system-config')

      if (!response.ok) {
        // Non bloquant : afficher sans la section env vars
        return
      }

      const data = await response.json()
      setEnvVarData(data)
    } catch {
      // Silencieux : section env vars optionnelle
    }
  }

  // Initial load + auto-refresh every 60s
  useEffect(() => {
    fetchHealthCheck()
    fetchEnvVarConfig()
    const healthInterval = setInterval(fetchHealthCheck, 30000)
    const envInterval = setInterval(fetchEnvVarConfig, 60000)
    return () => {
      clearInterval(healthInterval)
      clearInterval(envInterval)
    }
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  if (error || !healthData) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-6">
        <div className="flex items-center gap-3 text-red-800">
          <XCircle className="w-6 h-6" />
          <div>
            <h3 className="font-semibold">Erreur Health Check</h3>
            <p className="text-sm">{error || 'Impossible de récupérer les données'}</p>
          </div>
        </div>
      </div>
    )
  }

  const ragConfig = healthData.rag

  // Déterminer le statut global
  const isMisconfigured = ragConfig?.status === 'misconfigured'
  const hasIssue = healthData.status !== 'healthy' || isMisconfigured

  return (
    <div className="space-y-6">
      {/* Header avec statut global */}
      <div className="bg-card rounded-lg border border-border p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-foreground">Configuration Système</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Dernière mise à jour : {lastUpdate.toLocaleTimeString('fr-FR')}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {hasIssue ? (
              <div className="flex items-center gap-2 px-4 py-2 bg-red-100 border border-red-300 rounded-lg">
                <AlertCircle className="w-5 h-5 text-red-600" />
                <span className="text-sm font-semibold text-red-800">Problème Détecté</span>
              </div>
            ) : (
              <div className="flex items-center gap-2 px-4 py-2 bg-green-100 border border-green-300 rounded-lg">
                <CheckCircle className="w-5 h-5 text-green-600" />
                <span className="text-sm font-semibold text-green-800">Configuration OK</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Alerte Misconfiguration RAG */}
      {isMisconfigured && (
        <div className="bg-red-50 border-l-4 border-red-600 p-6 rounded-r-lg">
          <div className="flex items-start gap-4">
            <AlertCircle className="w-6 h-6 text-red-600 flex-shrink-0 mt-1" />
            <div className="flex-1">
              <h3 className="text-lg font-bold text-red-900 mb-2">
                🚨 Configuration RAG Invalide
              </h3>
              <p className="text-red-800 mb-4">
                RAG activé mais aucun provider embeddings disponible. L&apos;assistant IA ne fonctionne pas.
              </p>
              <div className="bg-card border border-red-200 rounded-lg p-4 mb-4">
                <p className="font-semibold text-red-900 mb-2">Solutions :</p>
                <ol className="list-decimal list-inside space-y-2 text-sm text-red-800">
                  <li>
                    <strong>Activer Ollama</strong> (gratuit, local) :
                    <code className="block ml-6 mt-1 bg-red-100 px-2 py-1 rounded text-xs">
                      OLLAMA_ENABLED=true
                    </code>
                  </li>
                  <li>
                    <strong>Configurer OpenAI</strong> (payant, cloud) :
                    <code className="block ml-6 mt-1 bg-red-100 px-2 py-1 rounded text-xs">
                      OPENAI_API_KEY=sk-proj-...
                    </code>
                  </li>
                </ol>
              </div>
              <button
                onClick={fetchHealthCheck}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-sm font-medium"
              >
                Recharger après correction
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Grid des services */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Service Database */}
        <ServiceCard
          icon={<Database className="w-6 h-6" />}
          title="Base de Données"
          status={healthData.services.database}
          details={[
            { label: 'PostgreSQL', value: 'Actif' }
          ]}
        />

        {/* Service Storage */}
        <ServiceCard
          icon={<HardDrive className="w-6 h-6" />}
          title="Stockage"
          status={healthData.services.storage}
          details={[
            { label: 'MinIO', value: 'Actif' }
          ]}
        />

        {/* Service API */}
        <ServiceCard
          icon={<Cloud className="w-6 h-6" />}
          title="API"
          status={healthData.services.api}
          details={[
            { label: 'Next.js', value: healthData.version }
          ]}
        />
      </div>

      {/* Configuration RAG détaillée */}
      {ragConfig && (
        <div className="bg-card rounded-lg border border-border p-6">
          <div className="flex items-center gap-3 mb-6">
            <Cpu className="w-6 h-6 text-blue-600" />
            <h3 className="text-lg font-bold text-foreground">Configuration RAG</h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {/* RAG Enabled */}
            <ConfigItem
              label="RAG"
              value={ragConfig.enabled ? 'Activé' : 'Désactivé'}
              status={ragConfig.enabled ? 'ok' : 'warning'}
              icon={ragConfig.enabled ? <CheckCircle className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
            />

            {/* Semantic Search */}
            <ConfigItem
              label="Recherche Sémantique"
              value={ragConfig.semanticSearchEnabled ? 'Activée' : 'Désactivée'}
              status={ragConfig.semanticSearchEnabled ? 'ok' : 'error'}
              icon={ragConfig.semanticSearchEnabled ? <CheckCircle className="w-5 h-5" /> : <XCircle className="w-5 h-5" />}
            />

            {/* Ollama */}
            <ConfigItem
              label="Ollama (Local)"
              value={ragConfig.ollamaEnabled ? 'Actif' : 'Inactif'}
              status={ragConfig.ollamaEnabled ? 'ok' : 'neutral'}
              icon={ragConfig.ollamaEnabled ? <CheckCircle className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
            />

            {/* OpenAI */}
            <ConfigItem
              label="OpenAI (Cloud)"
              value={ragConfig.openaiConfigured ? 'Configuré' : 'Non configuré'}
              status={ragConfig.openaiConfigured ? 'ok' : 'neutral'}
              icon={ragConfig.openaiConfigured ? <CheckCircle className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
            />
          </div>

          {/* Statistiques KB */}
          <div className="mt-6 pt-6 border-t border-border">
            <h4 className="text-sm font-semibold text-foreground mb-4">Statistiques Knowledge Base</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-blue-50 rounded-lg p-4">
                <div className="text-3xl font-bold text-blue-900">
                  {ragConfig.kbDocsIndexed.toLocaleString()}
                </div>
                <div className="text-sm text-blue-700 mt-1">Documents indexés</div>
              </div>
              <div className="bg-green-50 rounded-lg p-4">
                <div className="text-3xl font-bold text-green-900">
                  {ragConfig.kbChunksAvailable.toLocaleString()}
                </div>
                <div className="text-sm text-green-700 mt-1">Chunks disponibles</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Section Variables d'Environnement */}
      {envVarData && (
        <div className="bg-card rounded-lg border border-border p-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <ShieldCheck className={`w-6 h-6 ${
                envVarData.status === 'critical' ? 'text-red-600' :
                envVarData.status === 'warning' ? 'text-yellow-600' : 'text-green-600'
              }`} />
              <div>
                <h3 className="text-lg font-bold text-foreground">Variables d&apos;Environnement</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {envVarData.totalChecked} variables vérifiées
                </p>
              </div>
            </div>
            <div className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${
              envVarData.status === 'critical'
                ? 'bg-red-100 border-red-300 text-red-800'
                : envVarData.status === 'warning'
                  ? 'bg-yellow-100 border-yellow-300 text-yellow-800'
                  : 'bg-green-100 border-green-300 text-green-800'
            }`}>
              {envVarData.status === 'critical' ? 'CRITIQUE' :
               envVarData.status === 'warning' ? 'AVERTISSEMENT' : 'OK'}
            </div>
          </div>

          <div className="space-y-4">
            {/* Variables REQUIRED manquantes → rouge */}
            {envVarData.missing.length > 0 && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-4">
                <div className="flex items-center gap-2 mb-3">
                  <XCircle className="w-4 h-4 text-red-600" />
                  <h4 className="text-sm font-semibold text-red-900">
                    Variables obligatoires manquantes ({envVarData.missing.length})
                  </h4>
                </div>
                <div className="flex flex-wrap gap-2">
                  {envVarData.missing.map((v) => (
                    <code key={v} className="px-2 py-1 bg-red-100 border border-red-300 rounded text-xs font-mono text-red-800">
                      {v}
                    </code>
                  ))}
                </div>
              </div>
            )}

            {/* Variables IMPORTANT manquantes → jaune */}
            {envVarData.importantMissing.length > 0 && (
              <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-4">
                <div className="flex items-center gap-2 mb-3">
                  <AlertCircle className="w-4 h-4 text-yellow-600" />
                  <h4 className="text-sm font-semibold text-yellow-900">
                    Variables importantes manquantes ({envVarData.importantMissing.length})
                  </h4>
                </div>
                <div className="flex flex-wrap gap-2">
                  {envVarData.importantMissing.map((v) => (
                    <code key={v} className="px-2 py-1 bg-yellow-100 border border-yellow-300 rounded text-xs font-mono text-yellow-800">
                      {v}
                    </code>
                  ))}
                </div>
              </div>
            )}

            {/* Variables DEPRECATED présentes → jaune */}
            {envVarData.deprecated.length > 0 && (
              <div className="rounded-lg border border-orange-200 bg-orange-50 p-4">
                <div className="flex items-center gap-2 mb-3">
                  <AlertCircle className="w-4 h-4 text-orange-600" />
                  <h4 className="text-sm font-semibold text-orange-900">
                    Variables dépréciées présentes ({envVarData.deprecated.length})
                  </h4>
                </div>
                <div className="space-y-1.5">
                  {envVarData.deprecated.map((d) => (
                    <div key={d.name} className="flex items-center gap-2 text-xs">
                      <code className="px-2 py-1 bg-orange-100 border border-orange-300 rounded font-mono text-orange-800">
                        {d.name}
                      </code>
                      <span className="text-orange-600">→ remplacer par</span>
                      <code className="px-2 py-1 bg-orange-100 border border-orange-300 rounded font-mono text-orange-800">
                        {d.replacedBy}
                      </code>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Variables REQUIRED présentes → vert */}
            {envVarData.present.length > 0 && (
              <div className="rounded-lg border border-green-200 bg-green-50 p-4">
                <div className="flex items-center gap-2 mb-3">
                  <CheckCircle className="w-4 h-4 text-green-600" />
                  <h4 className="text-sm font-semibold text-green-900">
                    Variables obligatoires configurées ({envVarData.present.length}/{envVarData.present.length + envVarData.missing.length})
                  </h4>
                </div>
                <div className="flex flex-wrap gap-2">
                  {envVarData.present.map((v) => (
                    <code key={v} className="px-2 py-1 bg-green-100 border border-green-300 rounded text-xs font-mono text-green-800">
                      {v}
                    </code>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Informations système */}
      <div className="bg-muted rounded-lg border border-border p-6">
        <h3 className="text-sm font-semibold text-foreground mb-4">Informations Système</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
          <div>
            <span className="text-muted-foreground">Uptime :</span>
            <span className="ml-2 font-medium text-foreground">
              {Math.floor(healthData.uptime / 3600)}h {Math.floor((healthData.uptime % 3600) / 60)}m
            </span>
          </div>
          <div>
            <span className="text-muted-foreground">Temps de réponse :</span>
            <span className="ml-2 font-medium text-foreground">{healthData.responseTime}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Version :</span>
            <span className="ml-2 font-medium text-foreground">{healthData.version}</span>
          </div>
        </div>
      </div>
    </div>
  )
}

// Composant Service Card
function ServiceCard({
  icon,
  title,
  status,
  details,
}: {
  icon: React.ReactNode
  title: string
  status: string
  details: { label: string; value: string }[]
}) {
  const isHealthy = status === 'healthy'

  return (
    <div className={`rounded-lg border p-6 ${
      isHealthy ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'
    }`}>
      <div className="flex items-center gap-3 mb-4">
        <div className={isHealthy ? 'text-green-600' : 'text-red-600'}>
          {icon}
        </div>
        <h3 className="font-semibold text-foreground">{title}</h3>
      </div>
      <div className="flex items-center gap-2 mb-3">
        {isHealthy ? (
          <CheckCircle className="w-4 h-4 text-green-600" />
        ) : (
          <XCircle className="w-4 h-4 text-red-600" />
        )}
        <span className={`text-sm font-medium ${
          isHealthy ? 'text-green-800' : 'text-red-800'
        }`}>
          {status}
        </span>
      </div>
      <div className="space-y-1">
        {details.map((detail, idx) => (
          <div key={idx} className="text-xs text-muted-foreground">
            <span className="font-medium">{detail.label}:</span> {detail.value}
          </div>
        ))}
      </div>
    </div>
  )
}

// Composant Config Item
function ConfigItem({
  label,
  value,
  status,
  icon,
}: {
  label: string
  value: string
  status: 'ok' | 'warning' | 'error' | 'neutral'
  icon: React.ReactNode
}) {
  const colors = {
    ok: 'bg-green-50 border-green-200 text-green-800',
    warning: 'bg-yellow-50 border-yellow-200 text-yellow-800',
    error: 'bg-red-50 border-red-200 text-red-800',
    neutral: 'bg-muted border-border text-foreground',
  }

  const iconColors = {
    ok: 'text-green-600',
    warning: 'text-yellow-600',
    error: 'text-red-600',
    neutral: 'text-muted-foreground',
  }

  return (
    <div className={`rounded-lg border p-4 ${colors[status]}`}>
      <div className="flex items-center gap-2 mb-2">
        <div className={iconColors[status]}>
          {icon}
        </div>
        <span className="text-xs font-semibold">{label}</span>
      </div>
      <div className="text-sm font-bold">{value}</div>
    </div>
  )
}
