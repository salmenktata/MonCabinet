/**
 * API: Démarrer une exécution de cron
 * POST /api/admin/cron-executions/start
 * Auth: X-Cron-Secret header
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const CRON_SECRET = process.env.CRON_SECRET

export async function POST(req: NextRequest) {
  try {
    // 1. Vérification auth
    const authHeader = req.headers.get('x-cron-secret')
    if (!authHeader || authHeader !== CRON_SECRET) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // 2. Parse body
    const body = await req.json()
    const { cronName, triggerType = 'scheduled', metadata = {} } = body

    if (!cronName) {
      return NextResponse.json(
        { error: 'cronName is required' },
        { status: 400 }
      )
    }

    // 3. Créer record d'exécution
    const supabase = await createClient()

    const { data: execution, error } = await supabase
      .from('cron_executions')
      .insert({
        cron_name: cronName,
        status: 'running',
        triggered_by: triggerType,
        metadata,
        started_at: new Date().toISOString(),
      })
      .select('id, cron_name, started_at')
      .single()

    if (error) {
      console.error('[Cron Start] Database error:', error)
      return NextResponse.json(
        { error: 'Failed to create execution record', details: error.message },
        { status: 500 }
      )
    }

    console.log(`[Cron Start] ${cronName} - execution ${execution.id}`)

    return NextResponse.json({
      success: true,
      executionId: execution.id,
      cronName: execution.cron_name,
      startedAt: execution.started_at,
    })
  } catch (error: any) {
    console.error('[Cron Start] Error:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    )
  }
}
