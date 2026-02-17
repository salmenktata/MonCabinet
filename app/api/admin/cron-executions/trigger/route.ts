/**
 * API: Trigger Manual Cron Execution
 * POST /api/admin/cron-executions/trigger
 * Auth: Session admin (Next-Auth)
 * Phase 6.2: Support paramètres configurables
 */

import { NextRequest, NextResponse } from 'next/server'
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
    estimatedDuration: 5000, // 5s
  },
  'check-alerts': {
    script: '/opt/qadhya/scripts/cron-check-alerts.sh',
    description: 'Vérification Alertes Système',
    estimatedDuration: 2000, // 2s
  },
  'refresh-mv-metadata': {
    script: '/opt/qadhya/scripts/cron-refresh-mv-metadata.sh',
    description: 'Rafraîchissement Vues Matérialisées',
    estimatedDuration: 8000, // 8s
  },
  'reanalyze-kb-failures': {
    script: '/opt/qadhya/scripts/cron-reanalyze-kb-failures.sh',
    description: 'Réanalyse Échecs KB',
    estimatedDuration: 20000, // 20s
  },
  'index-kb-progressive': {
    script: '/opt/qadhya/scripts/index-kb-progressive.sh',
    description: 'Indexation KB Progressive',
    estimatedDuration: 45000, // 45s
  },
  'acquisition-weekly': {
    script: 'cd /opt/qadhya && npx tsx scripts/cron-acquisition-weekly.ts',
    description: 'Acquisition Hebdomadaire',
    estimatedDuration: 30000, // 30s
  },
  'cleanup-executions': {
    script: '/opt/qadhya/scripts/cron-cleanup-executions.sh',
    description: 'Nettoyage Anciennes Exécutions',
    estimatedDuration: 1000, // 1s
  },
}

export async function POST(req: NextRequest) {
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
}

// GET: List available crons with their configuration
export async function GET(req: NextRequest) {
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
}
