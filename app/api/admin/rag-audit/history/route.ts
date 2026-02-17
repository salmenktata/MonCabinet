import { getErrorMessage } from '@/lib/utils/error-utils'
import { NextRequest, NextResponse } from 'next/server'
import { readdir, readFile, stat, mkdir } from 'fs/promises'
import path from 'path'

interface AuditHistoryItem {
  filename: string
  timestamp: string
  createdAt: Date
  summary: {
    overallHealthScore: number
    totalIndexedDocs: number
    totalChunks: number
    criticalIssuesCount: number
    warningsCount: number
  }
}

/**
 * GET /api/admin/rag-audit/history
 *
 * Récupère l'historique des 10 derniers audits (metadata seulement)
 *
 * @returns Array<AuditHistoryItem>
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
      .slice(0, 10) // Garder seulement les 10 derniers

    const history: AuditHistoryItem[] = []

    for (const filename of auditFiles) {
      try {
        const filePath = path.join(auditDir, filename)
        const content = await readFile(filePath, 'utf-8')
        const report = JSON.parse(content)
        const stats = await stat(filePath)

        history.push({
          filename,
          timestamp: report.timestamp,
          createdAt: stats.mtime,
          summary: {
            overallHealthScore: report.summary.overallHealthScore,
            totalIndexedDocs: report.summary.totalIndexedDocs,
            totalChunks: report.summary.totalChunks,
            criticalIssuesCount: report.summary.criticalIssuesCount,
            warningsCount: report.summary.warningsCount,
          },
        })
      } catch (err) {
        console.warn(`[RAG Audit API] Erreur lecture ${filename} :`, err)
      }
    }

    return NextResponse.json({
      success: true,
      history,
      total: history.length,
    })
  } catch (error) {
    console.error('[RAG Audit API] Erreur lecture history :', error)
    return NextResponse.json(
      {
        success: false,
        error: getErrorMessage(error) || 'Erreur lors de la lecture',
      },
      { status: 500 }
    )
  }
}
