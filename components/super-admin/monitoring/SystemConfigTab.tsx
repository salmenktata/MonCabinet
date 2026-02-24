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
import { AlertCircle, CheckCircle, XCircle, Database, Cpu, Cloud, HardDrive, ShieldCheck, Power, Loader2 } from 'lucide-react'

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

interface ProviderHealthResult {
  provider: string
  configured: boolean
  healthy: boolean
  status: 'ok' | 'error'
}

interface ProvidersHealthResponse {
  success: boolean
  summary: { healthy: number; total: number; allHealthy: boolean }
  providers: ProviderHealthResult[]
  durationMs: number
  timestamp: string
}

export default function SystemConfigTab() {
  const [healthData, setHealthData] = useState<HealthCheckResponse | null>(null)
  const [envVarData, setEnvVarData] = useState<EnvVarConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date())
  const [providersHealth, setProvidersHealth] = useState<ProvidersHealthResponse | null>(null)
  const [providersLoading, setProvidersLoading] = useState(false)

  // Ollama control state
  const [ollamaStatus, setOllamaStatus] = useState<{
    running: boolean
    status: string
    memoryMB: number | null
  }>({ running: false, status: 'unknown', memoryMB: null })
  const [ollamaLoading, setOllamaLoading] = useState(false)
  const [ollamaActionPending, setOllamaActionPending] = useState(false)

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

  // Fetch LLM providers health (ping réel, cache 5 min côté serveur)
  const fetchProvidersHealth = async () => {
    setProvidersLoading(true)
    try {
      const res = await fetch('/api/admin/monitoring/providers-health')
      if (!res.ok) return
      const data = await res.json()
      setProvidersHealth(data)
    } catch {
      // Silencieux
    } finally {
      setProvidersLoading(false)
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

  // Fetch Ollama real status from trigger server
  const fetchOllamaStatus = async () => {
    try {
      const response = await fetch('/api/admin/ollama')
      if (!response.ok) return
      const data = await response.json()
      setOllamaStatus({
        running: data.running ?? false,
        status: data.status ?? 'unknown',
        memoryMB: data.memoryMB ?? null,
      })
    } catch {
      // Silencieux — le statut reste "unknown"
    }
  }

  // Start or stop Ollama
  const handleOllamaAction = async (action: 'start' | 'stop') => {
    const label = action === 'start' ? 'Démarrer' : 'Arrêter'
    if (!confirm(`${label} Ollama ?`)) return

    setOllamaActionPending(true)
    try {
      const response = await fetch('/api/admin/ollama', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      const data = await response.json()
      if (data.running !== undefined) {
        setOllamaStatus({
          running: data.running,
          status: data.status ?? (data.running ? 'active' : 'inactive'),
          memoryMB: null,
        })
      }
      // Re-fetch pour avoir la RAM
      setTimeout(fetchOllamaStatus, 3000)
    } catch {
      // Silencieux
    } finally {
      setOllamaActionPending(false)
    }
  }

  // Initial load + auto-refresh
  useEffect(() => {
    fetchHealthCheck()
    fetchEnvVarConfig()
    fetchProvidersHealth()
    fetchOllamaStatus()
    const healthInterval = setInterval(fetchHealthCheck, 30000)
    const envInterval = setInterval(fetchEnvVarConfig, 60000)
    const ollamaInterval = setInterval(fetchOllamaStatus, 30000)
    return () => {
      clearInterval(healthInterval)
      clearInterval(envInterval)
      clearInterval(ollamaInterval)
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
      <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg p-6">
        <div className="flex items-center gap-3 text-red-800 dark:text-red-300">
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
              <div className="flex items-center gap-2 px-4 py-2 bg-red-100 dark:bg-red-950/40 border border-red-300 dark:border-red-800 rounded-lg">
                <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400" />
                <span className="text-sm font-semibold text-red-800 dark:text-red-300">Problème Détecté</span>
              </div>
            ) : (
              <div className="flex items-center gap-2 px-4 py-2 bg-green-100 dark:bg-green-950/40 border border-green-300 dark:border-green-800 rounded-lg">
                <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400" />
                <span className="text-sm font-semibold text-green-800 dark:text-green-300">Configuration OK</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Alerte Misconfiguration RAG */}
      {isMisconfigured && (
        <div className="bg-red-50 dark:bg-red-950/30 border-l-4 border-red-600 dark:border-red-500 p-6 rounded-r-lg">
          <div className="flex items-start gap-4">
            <AlertCircle className="w-6 h-6 text-red-600 dark:text-red-400 flex-shrink-0 mt-1" />
            <div className="flex-1">
              <h3 className="text-lg font-bold text-red-900 dark:text-red-200 mb-2">
                🚨 Configuration RAG Invalide
              </h3>
              <p className="text-red-800 dark:text-red-300 mb-4">
                RAG activé mais aucun provider embeddings disponible. L&apos;assistant IA ne fonctionne pas.
              </p>
              <div className="bg-card border border-red-200 dark:border-red-800 rounded-lg p-4 mb-4">
                <p className="font-semibold text-red-900 dark:text-red-200 mb-2">Solutions :</p>
                <ol className="list-decimal list-inside space-y-2 text-sm text-red-800 dark:text-red-300">
                  <li>
                    <strong>Activer Ollama</strong> (gratuit, local) :
                    <code className="block ml-6 mt-1 bg-red-100 dark:bg-red-900/40 px-2 py-1 rounded text-xs">
                      OLLAMA_ENABLED=true
                    </code>
                  </li>
                  <li>
                    <strong>Configurer OpenAI</strong> (payant, cloud) :
                    <code className="block ml-6 mt-1 bg-red-100 dark:bg-red-900/40 px-2 py-1 rounded text-xs">
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

            {/* Ollama — Carte interactive avec Start/Stop */}
            <div className={`rounded-lg border p-4 ${
              ollamaStatus.running
                ? 'bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800'
                : ollamaStatus.status === 'unknown'
                  ? 'bg-muted border-border'
                  : 'bg-gray-50 dark:bg-gray-900/30 border-gray-200 dark:border-gray-700'
            }`}>
              <div className="flex items-center gap-2 mb-2">
                {/* Pastille de statut */}
                <span className={`inline-block w-2.5 h-2.5 rounded-full ${
                  ollamaStatus.running
                    ? 'bg-green-500 animate-pulse'
                    : ollamaStatus.status === 'unknown'
                      ? 'bg-gray-400'
                      : 'bg-gray-400'
                }`} />
                <span className="text-xs font-semibold text-foreground">Ollama (Local)</span>
              </div>
              <div className="text-sm font-bold mb-1">
                {ollamaStatus.running ? 'En cours' : ollamaStatus.status === 'unknown' ? 'Inconnu' : 'Arrêté'}
              </div>
              {ollamaStatus.running && ollamaStatus.memoryMB != null && (
                <div className="text-xs text-muted-foreground mb-2">
                  RAM : {ollamaStatus.memoryMB} MB
                </div>
              )}
              <button
                onClick={() => handleOllamaAction(ollamaStatus.running ? 'stop' : 'start')}
                disabled={ollamaActionPending || ollamaStatus.status === 'unknown'}
                className={`mt-1 flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                  ollamaStatus.running
                    ? 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 hover:bg-red-200 dark:hover:bg-red-900/60 border border-red-300 dark:border-red-700'
                    : 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300 hover:bg-green-200 dark:hover:bg-green-900/60 border border-green-300 dark:border-green-700'
                }`}
              >
                {ollamaActionPending ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Power className="w-3.5 h-3.5" />
                )}
                {ollamaActionPending
                  ? 'En cours...'
                  : ollamaStatus.running
                    ? 'Arrêter'
                    : 'Démarrer'}
              </button>
            </div>

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
              <div className="bg-blue-50 dark:bg-blue-950/30 rounded-lg p-4">
                <div className="text-3xl font-bold text-blue-900 dark:text-blue-200">
                  {ragConfig.kbDocsIndexed.toLocaleString()}
                </div>
                <div className="text-sm text-blue-700 dark:text-blue-400 mt-1">Documents indexés</div>
              </div>
              <div className="bg-green-50 dark:bg-green-950/30 rounded-lg p-4">
                <div className="text-3xl font-bold text-green-900 dark:text-green-200">
                  {ragConfig.kbChunksAvailable.toLocaleString()}
                </div>
                <div className="text-sm text-green-700 dark:text-green-400 mt-1">Chunks disponibles</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Section Providers LLM Health */}
      <div className="bg-card rounded-lg border border-border p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <Cpu className="w-5 h-5 text-muted-foreground" />
            <div>
              <h3 className="text-base font-bold text-foreground">Providers LLM</h3>
              <p className="text-xs text-muted-foreground">Health check réel (ping — cache 5 min)</p>
            </div>
          </div>
          <button
            onClick={fetchProvidersHealth}
            disabled={providersLoading}
            className="text-xs px-3 py-1.5 rounded border border-border hover:bg-muted transition-colors disabled:opacity-50"
          >
            {providersLoading ? <Loader2 className="w-3 h-3 animate-spin inline mr-1" /> : null}
            Tester
          </button>
        </div>
        {!providersHealth && !providersLoading && (
          <p className="text-sm text-muted-foreground">Cliquez sur Tester pour lancer le health check.</p>
        )}
        {providersLoading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" /> Ping des providers en cours...
          </div>
        )}
        {providersHealth && !providersLoading && (
          <div className="space-y-3">
            <div className={`text-xs font-medium px-2 py-1 rounded w-fit ${
              providersHealth.summary.allHealthy
                ? 'bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-300'
                : 'bg-yellow-100 text-yellow-700 dark:bg-yellow-950/40 dark:text-yellow-300'
            }`}>
              {providersHealth.summary.healthy}/{providersHealth.summary.total} providers opérationnels
              {' '}· {providersHealth.durationMs}ms
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {providersHealth.providers.filter(p => p.configured).map(p => (
                <div key={p.provider} className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm ${
                  p.healthy
                    ? 'border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950/20'
                    : 'border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950/20'
                }`}>
                  {p.healthy
                    ? <CheckCircle className="w-3.5 h-3.5 text-green-600 dark:text-green-400 shrink-0" />
                    : <XCircle className="w-3.5 h-3.5 text-red-600 dark:text-red-400 shrink-0" />
                  }
                  <span className={`font-mono font-medium ${p.healthy ? 'text-green-800 dark:text-green-300' : 'text-red-800 dark:text-red-300'}`}>
                    {p.provider}
                  </span>
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Testé le {new Date(providersHealth.timestamp).toLocaleTimeString('fr-FR')}
            </p>
          </div>
        )}
      </div>

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
                ? 'bg-red-100 dark:bg-red-950/40 border-red-300 dark:border-red-800 text-red-800 dark:text-red-300'
                : envVarData.status === 'warning'
                  ? 'bg-yellow-100 dark:bg-yellow-950/40 border-yellow-300 dark:border-yellow-800 text-yellow-800 dark:text-yellow-300'
                  : 'bg-green-100 dark:bg-green-950/40 border-green-300 dark:border-green-800 text-green-800 dark:text-green-300'
            }`}>
              {envVarData.status === 'critical' ? 'CRITIQUE' :
               envVarData.status === 'warning' ? 'AVERTISSEMENT' : 'OK'}
            </div>
          </div>

          <div className="space-y-4">
            {/* Variables REQUIRED manquantes → rouge */}
            {envVarData.missing.length > 0 && (
              <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/30 p-4">
                <div className="flex items-center gap-2 mb-3">
                  <XCircle className="w-4 h-4 text-red-600 dark:text-red-400" />
                  <h4 className="text-sm font-semibold text-red-900 dark:text-red-200">
                    Variables obligatoires manquantes ({envVarData.missing.length})
                  </h4>
                </div>
                <div className="flex flex-wrap gap-2">
                  {envVarData.missing.map((v) => (
                    <code key={v} className="px-2 py-1 bg-red-100 dark:bg-red-900/40 border border-red-300 dark:border-red-700 rounded text-xs font-mono text-red-800 dark:text-red-300">
                      {v}
                    </code>
                  ))}
                </div>
              </div>
            )}

            {/* Variables IMPORTANT manquantes → jaune */}
            {envVarData.importantMissing.length > 0 && (
              <div className="rounded-lg border border-yellow-200 dark:border-yellow-800 bg-yellow-50 dark:bg-yellow-950/30 p-4">
                <div className="flex items-center gap-2 mb-3">
                  <AlertCircle className="w-4 h-4 text-yellow-600 dark:text-yellow-400" />
                  <h4 className="text-sm font-semibold text-yellow-900 dark:text-yellow-200">
                    Variables importantes manquantes ({envVarData.importantMissing.length})
                  </h4>
                </div>
                <div className="flex flex-wrap gap-2">
                  {envVarData.importantMissing.map((v) => (
                    <code key={v} className="px-2 py-1 bg-yellow-100 dark:bg-yellow-900/40 border border-yellow-300 dark:border-yellow-700 rounded text-xs font-mono text-yellow-800 dark:text-yellow-300">
                      {v}
                    </code>
                  ))}
                </div>
              </div>
            )}

            {/* Variables DEPRECATED présentes → jaune */}
            {envVarData.deprecated.length > 0 && (
              <div className="rounded-lg border border-orange-200 dark:border-orange-800 bg-orange-50 dark:bg-orange-950/30 p-4">
                <div className="flex items-center gap-2 mb-3">
                  <AlertCircle className="w-4 h-4 text-orange-600 dark:text-orange-400" />
                  <h4 className="text-sm font-semibold text-orange-900 dark:text-orange-200">
                    Variables dépréciées présentes ({envVarData.deprecated.length})
                  </h4>
                </div>
                <div className="space-y-1.5">
                  {envVarData.deprecated.map((d) => (
                    <div key={d.name} className="flex items-center gap-2 text-xs">
                      <code className="px-2 py-1 bg-orange-100 dark:bg-orange-900/40 border border-orange-300 dark:border-orange-700 rounded font-mono text-orange-800 dark:text-orange-300">
                        {d.name}
                      </code>
                      <span className="text-orange-600 dark:text-orange-400">→ remplacer par</span>
                      <code className="px-2 py-1 bg-orange-100 dark:bg-orange-900/40 border border-orange-300 dark:border-orange-700 rounded font-mono text-orange-800 dark:text-orange-300">
                        {d.replacedBy}
                      </code>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Variables REQUIRED présentes → vert */}
            {envVarData.present.length > 0 && (
              <div className="rounded-lg border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950/30 p-4">
                <div className="flex items-center gap-2 mb-3">
                  <CheckCircle className="w-4 h-4 text-green-600 dark:text-green-400" />
                  <h4 className="text-sm font-semibold text-green-900 dark:text-green-200">
                    Variables obligatoires configurées ({envVarData.present.length}/{envVarData.present.length + envVarData.missing.length})
                  </h4>
                </div>
                <div className="flex flex-wrap gap-2">
                  {envVarData.present.map((v) => (
                    <code key={v} className="px-2 py-1 bg-green-100 dark:bg-green-900/40 border border-green-300 dark:border-green-700 rounded text-xs font-mono text-green-800 dark:text-green-300">
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
      isHealthy ? 'bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800' : 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800'
    }`}>
      <div className="flex items-center gap-3 mb-4">
        <div className={isHealthy ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}>
          {icon}
        </div>
        <h3 className="font-semibold text-foreground">{title}</h3>
      </div>
      <div className="flex items-center gap-2 mb-3">
        {isHealthy ? (
          <CheckCircle className="w-4 h-4 text-green-600 dark:text-green-400" />
        ) : (
          <XCircle className="w-4 h-4 text-red-600 dark:text-red-400" />
        )}
        <span className={`text-sm font-medium ${
          isHealthy ? 'text-green-800 dark:text-green-300' : 'text-red-800 dark:text-red-300'
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
    ok: 'bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800 text-green-800 dark:text-green-300',
    warning: 'bg-yellow-50 dark:bg-yellow-950/30 border-yellow-200 dark:border-yellow-800 text-yellow-800 dark:text-yellow-300',
    error: 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800 text-red-800 dark:text-red-300',
    neutral: 'bg-muted border-border text-foreground',
  }

  const iconColors = {
    ok: 'text-green-600 dark:text-green-400',
    warning: 'text-yellow-600 dark:text-yellow-400',
    error: 'text-red-600 dark:text-red-400',
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
