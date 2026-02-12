import { NextRequest, NextResponse } from 'next/server'
import { readdir, readFile, mkdir } from 'fs/promises'
import path from 'path'

/**
 * GET /api/admin/rag-audit/latest
 *
 * Récupère le rapport d'audit le plus récent
 *
 * @returns AuditReport JSON ou null si aucun audit
 */
export async function GET(request: NextRequest) {
  try {
    const auditDir = path.join(process.cwd(), 'tmp', 'rag-audits')

    // Créer le dossier s'il n'existe pas
    await mkdir(auditDir, { recursive: true })

    // Lister les fichiers
    const files = await readdir(auditDir)
    const auditFiles = files
      .filter((f) => f.startsWith('audit-rag-') && f.endsWith('.json'))
      .sort()
      .reverse()

    if (auditFiles.length === 0) {
      return NextResponse.json({
        success: true,
        report: null,
        message: 'Aucun audit disponible',
      })
    }

    // Lire le plus récent
    const latestFile = auditFiles[0]
    const filePath = path.join(auditDir, latestFile)
    const content = await readFile(filePath, 'utf-8')
    const report = JSON.parse(content)

    return NextResponse.json({
      success: true,
      report,
      filename: latestFile,
    })
  } catch (error: any) {
    console.error('[RAG Audit API] Erreur lecture latest :', error)
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Erreur lors de la lecture',
      },
      { status: 500 }
    )
  }
}
