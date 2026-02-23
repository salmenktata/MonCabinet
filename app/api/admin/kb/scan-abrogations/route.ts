/**
 * POST /api/admin/kb/scan-abrogations
 *
 * Scanne le full_text des documents KB pour détecter des signaux d'abrogation
 * (expressions arabes/françaises), et met à jour abroge_suspected / abroge_confidence.
 *
 * Ignore les docs déjà validés manuellement (abroge_validated_at IS NOT NULL).
 *
 * Body:
 *   batchSize (default: 50)    — nombre de docs à scanner
 *   category  (optional)       — filtrer par catégorie
 *
 * Réponse:
 *   scanned, suspected, skipped, remaining
 */

import { NextResponse } from 'next/server'
import { withAdminApiAuth } from '@/lib/auth/with-admin-api-auth'
import { db } from '@/lib/db/postgres'
import { getErrorMessage } from '@/lib/utils/error-utils'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

// Expressions régulières pour détecter des signaux d'abrogation
const STRONG_SIGNALS = [
  /أُلغي\s+(?:بموجب|بالقانون|بمقتضى)/i,     // abrogé par (arabe avec détail)
  /(?:abrog[eé][e]?s?|annul[eé][e]?s?)\s+(?:par|en vertu)/i, // abrogé/annulé par (français)
  /نُسِخ\s+(?:بموجب|بالقانون)/i,              // abrogé par (arabe naskh)
]

const WEAK_SIGNALS = [
  /(?:ملغى|ملغاة|أُلغي|أُلغيت)/i,           // abrogé (arabe)
  /(?:abrog[eé][e]?|annul[eé][e]?)/i,       // abrogé/annulé (français)
  /(?:نسخ|نُسخ|يُنسخ)/i,                   // naskh/abrogation (arabe)
  /(?:caduque?|périmé[e]?)/i,               // caduc/périmé (français)
]

function detectAbrogationSignals(text: string): { suspected: boolean; confidence: 'low' | 'medium' | 'high' } | null {
  if (!text || text.length < 20) return null

  // Vérifier signaux forts (haute confidence)
  for (const pattern of STRONG_SIGNALS) {
    if (pattern.test(text)) {
      return { suspected: true, confidence: 'high' }
    }
  }

  // Vérifier signaux faibles (basse confidence)
  let weakCount = 0
  for (const pattern of WEAK_SIGNALS) {
    if (pattern.test(text)) weakCount++
  }

  if (weakCount >= 2) {
    return { suspected: true, confidence: 'medium' }
  }

  if (weakCount >= 1) {
    return { suspected: true, confidence: 'low' }
  }

  return null
}

export const POST = withAdminApiAuth(async (request, _ctx, _session) => {
  const startTime = Date.now()

  try {
    const body = await request.json().catch(() => ({}))
    const batchSize = Math.min(parseInt(body.batchSize || '50', 10), 200)
    const category: string | null = body.category || null

    console.log('[ScanAbrogations] Démarrage:', { batchSize, category })

    // Construire la requête pour docs non encore validés
    const params: (string | number)[] = [batchSize]
    let categoryClause = ''
    if (category) {
      params.unshift(category) // devient $1
      categoryClause = 'AND kb.category = $1'
      params[params.length - 1] = batchSize // batchSize devient $2
      params[0] = category
    }

    const queryParams: (string | number)[] = []
    let paramIdx = 1
    let whereCategory = ''
    if (category) {
      whereCategory = `AND kb.category = $${paramIdx++}`
      queryParams.push(category)
    }
    queryParams.push(batchSize)

    const docsResult = await db.query<{
      id: string
      title: string
      category: string
      full_text: string
      abroge_suspected: boolean
    }>(`
      SELECT
        kb.id,
        kb.title,
        kb.category,
        LEFT(kb.full_text, 5000) AS full_text,
        COALESCE(kb.abroge_suspected, false) AS abroge_suspected
      FROM knowledge_base kb
      WHERE kb.is_active = true
        AND kb.full_text IS NOT NULL
        AND LENGTH(kb.full_text) >= 50
        AND kb.abroge_validated_at IS NULL
        ${whereCategory}
      ORDER BY kb.updated_at ASC
      LIMIT $${paramIdx}
    `, queryParams)

    const docs = docsResult.rows

    // Compter les docs restants (total non validés)
    const remainingResult = await db.query<{ count: string }>(`
      SELECT COUNT(*) as count
      FROM knowledge_base kb
      WHERE kb.is_active = true
        AND kb.full_text IS NOT NULL
        AND kb.abroge_validated_at IS NULL
    `)
    const remaining = parseInt(remainingResult.rows[0]?.count || '0', 10)

    if (docs.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'Aucun document à scanner',
        scanned: 0,
        suspected: 0,
        skipped: 0,
        remaining: 0,
        duration: Date.now() - startTime,
      })
    }

    console.log(`[ScanAbrogations] ${docs.length} docs à scanner`)

    let suspected = 0
    let skipped = 0
    const suspectedDocs: Array<{ id: string; title: string; confidence: string }> = []

    for (const doc of docs) {
      const detection = detectAbrogationSignals(doc.full_text)

      if (detection) {
        await db.query(`
          UPDATE knowledge_base
          SET
            abroge_suspected = true,
            abroge_confidence = $2,
            updated_at = NOW()
          WHERE id = $1
        `, [doc.id, detection.confidence])

        suspected++
        suspectedDocs.push({ id: doc.id, title: doc.title, confidence: detection.confidence })
        console.log(`[ScanAbrogations] ⚠️ "${doc.title}" — confidence: ${detection.confidence}`)
      } else if (doc.abroge_suspected) {
        // Si le doc était marqué suspect mais qu'on ne détecte plus de signaux, on reset
        await db.query(`
          UPDATE knowledge_base
          SET
            abroge_suspected = false,
            abroge_confidence = NULL,
            updated_at = NOW()
          WHERE id = $1
        `, [doc.id])
        skipped++
      } else {
        // Mettre à jour updated_at pour avancer dans la queue lors du prochain batch
        await db.query(`
          UPDATE knowledge_base SET updated_at = NOW() WHERE id = $1
        `, [doc.id])
        skipped++
      }
    }

    return NextResponse.json({
      success: true,
      message: `Scan terminé: ${suspected} suspects trouvés sur ${docs.length} docs`,
      scanned: docs.length,
      suspected,
      skipped,
      remaining: Math.max(0, remaining - docs.length),
      duration: Date.now() - startTime,
      suspectedDocs: suspectedDocs.slice(0, 20),
    })
  } catch (error) {
    console.error('[ScanAbrogations] Erreur:', error)
    return NextResponse.json(
      { success: false, error: getErrorMessage(error) },
      { status: 500 }
    )
  }
}, { allowCronSecret: true })

/**
 * GET /api/admin/kb/scan-abrogations
 * Statistiques sur les docs suspects/confirmés abrogés
 */
export const GET = withAdminApiAuth(async () => {
  try {
    const stats = await db.query<{
      total_suspected: number
      total_confirmed: number
      high_confidence: number
      medium_confidence: number
      low_confidence: number
      validated: number
    }>(`
      SELECT
        COUNT(*) FILTER (WHERE abroge_suspected = true AND is_abroge = false) AS total_suspected,
        COUNT(*) FILTER (WHERE is_abroge = true) AS total_confirmed,
        COUNT(*) FILTER (WHERE abroge_suspected = true AND abroge_confidence = 'high') AS high_confidence,
        COUNT(*) FILTER (WHERE abroge_suspected = true AND abroge_confidence = 'medium') AS medium_confidence,
        COUNT(*) FILTER (WHERE abroge_suspected = true AND abroge_confidence = 'low') AS low_confidence,
        COUNT(*) FILTER (WHERE abroge_validated_at IS NOT NULL) AS validated
      FROM knowledge_base
      WHERE is_active = true
    `)

    return NextResponse.json({
      success: true,
      stats: {
        totalSuspected: Number(stats.rows[0].total_suspected),
        totalConfirmed: Number(stats.rows[0].total_confirmed),
        highConfidence: Number(stats.rows[0].high_confidence),
        mediumConfidence: Number(stats.rows[0].medium_confidence),
        lowConfidence: Number(stats.rows[0].low_confidence),
        validated: Number(stats.rows[0].validated),
      },
    })
  } catch (error) {
    console.error('[ScanAbrogations] Erreur stats:', error)
    return NextResponse.json(
      { success: false, error: getErrorMessage(error) },
      { status: 500 }
    )
  }
})
