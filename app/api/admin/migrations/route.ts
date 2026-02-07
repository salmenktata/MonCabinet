/**
 * API de gestion des migrations
 * GET - Vérifier l'état des migrations
 * POST - Appliquer les migrations en attente
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { runMigrations, checkMigrations, getTablesInfo } from '@/lib/db/migrations'

export async function GET(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session?.user || session.user.role !== 'super_admin') {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
    }

    const status = await checkMigrations()
    const tablesInfo = await getTablesInfo()

    return NextResponse.json({
      migrations: status,
      database: {
        tables: tablesInfo.tables.length,
        tablesList: tablesInfo.tables
      }
    })
  } catch (error) {
    console.error('Erreur vérification migrations:', error)
    return NextResponse.json(
      { error: 'Erreur serveur', details: String(error) },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session?.user || session.user.role !== 'super_admin') {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
    }

    const result = await runMigrations()

    return NextResponse.json({
      success: result.errors.length === 0,
      applied: result.applied,
      skipped: result.skipped,
      errors: result.errors
    })
  } catch (error) {
    console.error('Erreur application migrations:', error)
    return NextResponse.json(
      { error: 'Erreur serveur', details: String(error) },
      { status: 500 }
    )
  }
}
