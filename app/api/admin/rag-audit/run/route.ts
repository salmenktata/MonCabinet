import { NextRequest, NextResponse } from 'next/server'
import { runAudit, type AuditReport } from '@/scripts/audit-rag-data-quality'
import { writeFile, mkdir } from 'fs/promises'
import path from 'path'

/**
 * POST /api/admin/rag-audit/run
 *
 * Exécute un audit complet de la qualité des données RAG
 * Enregistre le rapport dans /tmp/rag-audits/
 *
 * @returns AuditReport JSON
 */
export async function POST(request: NextRequest) {
  try {
    console.log('[RAG Audit API] Démarrage de l\'audit...')

    // Exécuter l'audit
    const report: AuditReport = await runAudit()

    // Sauvegarder le rapport
    const timestamp = new Date().toISOString().split('T')[0]
    const filename = `audit-rag-${timestamp}-${Date.now()}.json`
    const auditDir = path.join(process.cwd(), 'tmp', 'rag-audits')
    const filePath = path.join(auditDir, filename)

    // Créer le dossier si nécessaire
    await mkdir(auditDir, { recursive: true })
    await writeFile(filePath, JSON.stringify(report, null, 2))

    console.log(`[RAG Audit API] Audit terminé, rapport sauvegardé : ${filePath}`)

    return NextResponse.json({
      success: true,
      report,
      savedTo: filePath,
    })
  } catch (error: any) {
    console.error('[RAG Audit API] Erreur :', error)
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Erreur lors de l\'audit',
      },
      { status: 500 }
    )
  }
}
