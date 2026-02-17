import { NextRequest, NextResponse } from 'next/server'
import { getErrorMessage } from '@/lib/utils/error-utils'
import { analyzeKBDocumentQuality } from '@/lib/ai/kb-quality-analyzer-service'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { documentId } = body

    if (!documentId) {
      return NextResponse.json(
        { success: false, error: 'documentId required' },
        { status: 400 }
      )
    }

    console.log(`[Re-analyze] Analyzing document ${documentId}...`)

    const result = await analyzeKBDocumentQuality(documentId)

    return NextResponse.json({
      success: true,
      result,
    })
  } catch (error) {
    console.error('[Re-analyze] Error:', error)
    return NextResponse.json(
      { success: false, error: getErrorMessage(error) },
      { status: 500 }
    )
  }
}
