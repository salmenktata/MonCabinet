/**
 * API: Trigger Manual Cron Execution
 * POST /api/admin/cron-executions/trigger
 * Auth: Session admin (Next-Auth)
 * Phase 6.2: Support paramètres configurables
 */

import { NextRequest, NextResponse } from 'next/server'
import { withAdminApiAuth } from '@/lib/auth/with-admin-api-auth'
import { getErrorMessage } from '@/lib/utils/error-utils'
import { db } from '@/lib/db/postgres'
import {
  validateCronParameters,
  parametersToEnvVars,
} from '@/lib/cron/cron-parameters'

// Map cron names to script paths
const CRON_SCRIPTS: Record<string, { script: string; description: string; estimatedDuration: number }> = {
  'monitor-openai': {
    script: '/opt/qadhya/scripts/cron-monitor-openai.sh',
    description: 'Monitoring Budget OpenAI',
    estimatedDuration: 5000,
  },
  'check-alerts': {
    script: '/opt/qadhya/scripts/cron-check-alerts.sh',
    description: 'Vérification Alertes Système',
    estimatedDuration: 2000,
  },
  'refresh-mv-metadata': {
    script: '/opt/qadhya/scripts/cron-refresh-mv-metadata.sh',
    description: 'Rafraîchissement Vues Matérialisées',
    estimatedDuration: 8000,
  },
  'reanalyze-kb-failures': {
    script: '/opt/qadhya/scripts/cron-reanalyze-kb-failures.sh',
    description: 'Réanalyse Échecs KB',
    estimatedDuration: 20000,
  },
  'index-kb': {
    script: '/opt/qadhya/scripts/index-kb-progressive.sh',
    description: 'Indexation KB Progressive',
    estimatedDuration: 45000,
  },
  'acquisition-weekly': {
    script: 'cd /opt/qadhya && npx tsx scripts/cron-acquisition-weekly.ts',
    description: 'Acquisition Hebdomadaire',
    estimatedDuration: 30000,
  },
  'cleanup-executions': {
    script: '/opt/qadhya/scripts/cron-cleanup-executions.sh',
    description: 'Nettoyage Anciennes Exécutions',
    estimatedDuration: 1000,
  },
  'analyze-kb-weekend': {
    script: '/opt/qadhya/scripts/cron-analyze-kb-weekend.sh',
    description: 'Analyse KB Weekend (Ollama)',
    estimatedDuration: 300000,
  },
  'reindex-kb-openai': {
    script: '/opt/qadhya/scripts/cron-reindex-kb-openai.sh',
    description: 'Réindex KB OpenAI',
    estimatedDuration: 60000,
  },
  'cleanup-orphaned-jobs': {
    script: '/opt/qadhya/scripts/cron-cleanup-orphaned-jobs.sh',
    description: 'Nettoyage Jobs Orphelins',
    estimatedDuration: 5000,
  },
  'check-freshness': {
    script: '/opt/qadhya/scripts/cron-check-freshness.sh',
    description: 'Vérif Fraîcheur Docs',
    estimatedDuration: 10000,
  },
  'check-impersonations': {
    script: '/opt/qadhya/scripts/cron-check-impersonations.sh',
    description: 'Vérif Impersonations',
    estimatedDuration: 5000,
  },
  'check-rag-config': {
    script: '/opt/qadhya/scripts/cron-check-rag-config.sh',
    description: 'Vérif Config RAG',
    estimatedDuration: 10000,
  },
  'ollama-keepalive': {
    script: '/opt/qadhya/scripts/cron-ollama-keepalive.sh',
    description: 'Keep-Alive Ollama',
    estimatedDuration: 10000,
  },
  'pipeline-auto-advance': {
    script: '/opt/qadhya/scripts/cron-pipeline-auto-advance.sh',
    description: 'Pipeline Auto-Advance KB',
    estimatedDuration: 300000,
  },
  'send-notifications': {
    script: '/opt/qadhya/scripts/cron-send-notifications.sh',
    description: 'Envoi Notifications',
    estimatedDuration: 60000,
  },
  'cleanup-corrupted-kb': {
    script: '/opt/qadhya/scripts/cron-cleanup-corrupted-kb.sh',
    description: 'Nettoyage KB Corrompue',
    estimatedDuration: 120000,
  },
  'detect-config-drift': {
    script: '/opt/qadhya/scripts/cron-detect-config-drift.sh',
    description: 'Détection Drift Config',
    estimatedDuration: 5000,
  },
  'eval-rag-weekly': {
    script: 'curl -s -X POST https://qadhya.tn/api/admin/eval/cron -H "X-Cron-Secret: $CRON_SECRET"',
    description: 'Évaluation RAG Hebdomadaire',
    estimatedDuration: 120000,
  },
  'drift-detection': {
    script: 'curl -s -X POST https://qadhya.tn/api/admin/monitoring/drift -H "X-Cron-Secret: $CRON_SECRET"',
    description: 'Drift Detection RAG',
    estimatedDuration: 60000,
  },
  'kb-quality-maintenance': {
    script: '/opt/qadhya/scripts/kb-quality-maintenance.sh',
    description: 'Maintenance Qualité KB (qualité, rechunk, metadata, nettoyage pages courtes)',
    estimatedDuration: 900000,
  },
  'web-crawler': {
    script: '/opt/qadhya/scripts/cron-web-crawler.sh',
    description: 'Crawl Sources Web (9anoun, cassation, iort)',
    estimatedDuration: 300000,
  },
  'crawl-iort': {
    script: '/opt/qadhya/scripts/cron-crawl-iort.sh',
    description: 'Crawl JORT Officiel',
    estimatedDuration: 300000,
  },
  'monitor-rag': {
    script: '/opt/qadhya/scripts/run-monitor-rag.sh',
    description: 'Monitoring RAG Quotidien',
    estimatedDuration: 60000,
  },
  'extract-metadata-cassation': {
    script: '/opt/qadhya/scripts/extract-metadata-cassation.sh',
    description: 'Extraction Métadonnées Cassation',
    estimatedDuration: 120000,
  },
  'expire-trials': {
    script: 'curl -s -X POST http://localhost:3000/api/admin/cron/expire-trials -H "Authorization: Bearer $CRON_SECRET"',
    description: 'Expiration Périodes d\'Essai',
    estimatedDuration: 30000,
  },
  'trial-onboarding': {
    script: 'curl -s -X POST http://localhost:3000/api/admin/cron/trial-onboarding -H "Authorization: Bearer $CRON_SECRET"',
    description: 'Onboarding Utilisateurs Essai',
    estimatedDuration: 30000,
  },
  'check-renewals': {
    script: 'curl -s -X POST http://localhost:3000/api/admin/cron/check-renewals -H "Authorization: Bearer $CRON_SECRET"',
    description: 'Vérification Renouvellements',
    estimatedDuration: 30000,
  },
  'docker-cleanup': {
    script: '/opt/qadhya/scripts/docker-cleanup.sh',
    description: 'Nettoyage Docker Hebdomadaire',
    estimatedDuration: 120000,
  },
  'watchdog-vps': {
    script: '/opt/qadhya/scripts/watchdog.sh',
    description: 'Watchdog VPS (santé Docker/RAM/CPU)',
    estimatedDuration: 10000,
  },
}

export const POST = withAdminApiAuth(async (req, _ctx, _session) => {
  try {
    // 1. Parse body
    const body = await req.json()
    const { cronName, parameters = {} } = body

    if (!cronName || typeof cronName !== 'string') {
      return NextResponse.json(
        { success: false, error: 'cronName is required' },
        { status: 400 }
      )
    }

    // 2. Validate cron exists
    const cronConfig = CRON_SCRIPTS[cronName]
    if (!cronConfig) {
      return NextResponse.json(
        { success: false, error: `Unknown cron: ${cronName}` },
        { status: 400 }
      )
    }

    // Phase 6.2: Valider les paramètres
    const validation = validateCronParameters(cronName, parameters)
    if (!validation.valid) {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid parameters',
          validationErrors: validation.errors,
        },
        { status: 400 }
      )
    }

    // Phase 6.2: Convertir paramètres en variables d'environnement
    const envVars = parametersToEnvVars(cronName, parameters)

    console.log(`[Manual Trigger] Parameters for ${cronName}:`, parameters)
    console.log(`[Manual Trigger] Env vars:`, envVars)

    // 3. Check if cron is not already running
    const runningCheck = await db.query(
      `SELECT id FROM cron_executions
       WHERE cron_name = $1 AND status = 'running'
       LIMIT 1`,
      [cronName]
    )

    if (runningCheck.rows.length > 0) {
      return NextResponse.json(
        {
          success: false,
          error: 'Cron is already running',
          runningExecutionId: runningCheck.rows[0].id,
        },
        { status: 409 }
      )
    }

    // 4. Execute cron via trigger server (HTTP call to host service)
    const triggerServerUrl = process.env.CRON_TRIGGER_SERVER_URL || 'http://host.docker.internal:9998/trigger'

    // Phase 6.2: Passer les paramètres au serveur Python
    fetch(triggerServerUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        cronName,
        envVars, // Phase 6.2: Variables d'environnement
      }),
    })
      .then((response) => {
        if (!response.ok) {
          console.error(`[Manual Trigger] Server error: ${response.status}`)
        } else {
          console.log(`[Manual Trigger] ✅ Cron ${cronName} triggered successfully`)
        }
      })
      .catch((error) => {
        console.error(`[Manual Trigger] Failed to call trigger server:`, error.message)
      })

    // 5. Return success (execution started)
    return NextResponse.json({
      success: true,
      cronName,
      description: cronConfig.description,
      estimatedDuration: cronConfig.estimatedDuration,
      message: 'Cron execution started. Check table for results.',
      note: 'Execution is asynchronous. Refresh page in a few seconds.',
    })
  } catch (error) {
    console.error('[Manual Trigger] Error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error', details: getErrorMessage(error) },
      { status: 500 }
    )
  }
}, { allowCronSecret: true })

// GET: List available crons with their configuration
export const GET = withAdminApiAuth(async (req, _ctx, _session) => {
  try {
    // Get current running status for each cron
    const runningCrons = await db.query(
      `SELECT DISTINCT cron_name
       FROM cron_executions
       WHERE status = 'running'`
    )

    const runningSet = new Set(runningCrons.rows.map((r) => r.cron_name))

    const crons = Object.entries(CRON_SCRIPTS).map(([name, config]) => ({
      cronName: name,
      description: config.description,
      estimatedDuration: config.estimatedDuration,
      isRunning: runningSet.has(name),
    }))

    return NextResponse.json({
      success: true,
      crons,
    })
  } catch (error) {
    console.error('[List Crons] Error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error', details: getErrorMessage(error) },
      { status: 500 }
    )
  }
}, { allowCronSecret: true })
