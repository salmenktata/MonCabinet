'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Icons } from '@/lib/icons'
import { PipelineTimeline } from './PipelineTimeline'
import { ContentReviewPanel } from './ContentReviewPanel'
import { ClassificationPanel } from './ClassificationPanel'
import { ChunkViewerPanel } from './ChunkViewerPanel'
import { QualityReportPanel } from './QualityReportPanel'
import { FinalApprovalPanel } from './FinalApprovalPanel'

interface PipelineDetailData {
  document: {
    id: string
    title: string
    category: string
    subcategory: string | null
    language: string
    pipeline_stage: string
    pipeline_stage_updated_at: string
    pipeline_notes: string | null
    pipeline_rejected_reason: string | null
    is_indexed: boolean
    is_approved: boolean
    is_active: boolean
    quality_score: number | null
    full_text: string | null
    source_file: string | null
    metadata: Record<string, unknown>
    tags?: string[]
    created_at: string
    updated_at: string
    [key: string]: unknown
  }
  history: Array<{
    id: string
    from_stage: string | null
    to_stage: string
    action: string
    performer_name?: string
    notes: string | null
    quality_score_at_transition: number | null
    created_at: string
  }>
  chunks: {
    count: number
    providers: string[]
  }
  nextStage: string | null
  validTransitions: string[]
}

const STAGE_LABELS: Record<string, string> = {
  source_configured: 'Source configurée',
  crawled: 'Crawlé & Extrait',
  content_reviewed: 'Contenu validé',
  classified: 'Classifié',
  indexed: 'Indexé',
  quality_analyzed: 'Qualité analysée',
  rag_active: 'RAG Actif',
  rejected: 'Rejeté',
  needs_revision: 'À réviser',
}

const STAGE_COLORS: Record<string, string> = {
  crawled: 'bg-blue-100 text-blue-800',
  content_reviewed: 'bg-indigo-100 text-indigo-800',
  classified: 'bg-purple-100 text-purple-800',
  indexed: 'bg-violet-100 text-violet-800',
  quality_analyzed: 'bg-pink-100 text-pink-800',
  rag_active: 'bg-green-100 text-green-800',
  rejected: 'bg-red-100 text-red-800',
  needs_revision: 'bg-orange-100 text-orange-800',
}

export function PipelineDocumentDetail({ documentId }: { documentId: string }) {
  const router = useRouter()
  const [data, setData] = useState<PipelineDetailData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)
  const [rejectReason, setRejectReason] = useState('')
  const [showReject, setShowReject] = useState(false)

  const fetchDetail = useCallback(async () => {
    setIsLoading(true)
    try {
      const res = await fetch(`/api/admin/pipeline/documents/${documentId}`)
      if (res.ok) {
        setData(await res.json())
      }
    } catch (error) {
      console.error('Erreur:', error)
    } finally {
      setIsLoading(false)
    }
  }, [documentId])

  useEffect(() => { fetchDetail() }, [fetchDetail])

  const handleAdvance = async () => {
    setActionLoading(true)
    try {
      const res = await fetch(`/api/admin/pipeline/documents/${documentId}/advance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      if (res.ok) await fetchDetail()
    } finally {
      setActionLoading(false)
    }
  }

  const handleReject = async () => {
    if (!rejectReason.trim()) return
    setActionLoading(true)
    try {
      const res = await fetch(`/api/admin/pipeline/documents/${documentId}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: rejectReason }),
      })
      if (res.ok) {
        setShowReject(false)
        setRejectReason('')
        await fetchDetail()
      }
    } finally {
      setActionLoading(false)
    }
  }

  const handleReplay = async () => {
    setActionLoading(true)
    try {
      const res = await fetch(`/api/admin/pipeline/documents/${documentId}/replay`, {
        method: 'POST',
      })
      if (res.ok) await fetchDetail()
    } finally {
      setActionLoading(false)
    }
  }

  const handleEdit = async (updates: Record<string, unknown>) => {
    setActionLoading(true)
    try {
      const res = await fetch(`/api/admin/pipeline/documents/${documentId}/edit`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      })
      if (res.ok) await fetchDetail()
    } finally {
      setActionLoading(false)
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Icons.loader className="h-6 w-6 animate-spin" />
      </div>
    )
  }

  if (!data) {
    return <div className="p-8 text-center text-muted-foreground">Document non trouvé</div>
  }

  const { document: doc, history, chunks, nextStage, validTransitions } = data
  const stage = doc.pipeline_stage
  const canAdvance = nextStage && validTransitions.includes(nextStage) && stage !== 'rejected'
  const canReject = validTransitions.includes('rejected')
  const canReplay = ['crawled', 'classified', 'indexed', 'quality_analyzed'].includes(stage)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/super-admin/pipeline">
            <Button variant="ghost" size="sm">
              <Icons.arrowLeft className="h-4 w-4 mr-1" />
              Pipeline
            </Button>
          </Link>
          <div>
            <h1 className="text-xl font-bold line-clamp-1">{doc.title}</h1>
            <div className="flex items-center gap-2 mt-1">
              <Badge className={STAGE_COLORS[stage] || 'bg-gray-100 text-gray-800'}>
                {STAGE_LABELS[stage] || stage}
              </Badge>
              <Badge variant="outline">{doc.category}</Badge>
              <Badge variant="outline" className="uppercase">{doc.language}</Badge>
            </div>
          </div>
        </div>
      </div>

      {/* Rejected banner */}
      {stage === 'rejected' && doc.pipeline_rejected_reason && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4">
          <div className="flex items-start gap-2">
            <Icons.xCircle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-red-700">Document rejeté</p>
              <p className="text-sm text-red-600 mt-1">{doc.pipeline_rejected_reason}</p>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main content - left 2/3 */}
        <div className="lg:col-span-2 space-y-6">
          {/* Stage-specific panel */}
          {(stage === 'crawled' || stage === 'content_reviewed') && (
            <div className="rounded-lg border p-6">
              <ContentReviewPanel
                document={doc}
                onSave={handleEdit}
                isLoading={actionLoading}
              />
            </div>
          )}

          <div className="rounded-lg border p-6">
            <ClassificationPanel
              document={{ ...doc, tags: doc.tags || [] }}
              onSave={handleEdit}
              onReplay={handleReplay}
              isLoading={actionLoading}
            />
          </div>

          {stage === 'indexed' && (
            <div className="rounded-lg border p-6">
              <ChunkViewerPanel
                documentId={doc.id}
                chunksCount={chunks.count}
                providers={chunks.providers}
                isIndexed={doc.is_indexed}
              />
            </div>
          )}

          {stage === 'quality_analyzed' && (
            <div className="rounded-lg border p-6">
              <QualityReportPanel document={doc} />
            </div>
          )}

          {stage === 'rag_active' && (
            <div className="rounded-lg border p-6">
              <FinalApprovalPanel
                document={doc}
                chunksCount={chunks.count}
                providers={chunks.providers}
              />
            </div>
          )}

          {/* For rejected/needs_revision, show content review */}
          {(stage === 'rejected' || stage === 'needs_revision') && (
            <div className="rounded-lg border p-6">
              <ContentReviewPanel
                document={doc}
                onSave={handleEdit}
                isLoading={actionLoading}
              />
            </div>
          )}

          {/* Actions */}
          <div className="rounded-lg border p-4">
            <h3 className="text-sm font-medium mb-3">Actions</h3>
            <div className="flex flex-wrap gap-2">
              {canAdvance && (
                <Button onClick={handleAdvance} disabled={actionLoading}>
                  {actionLoading ? <Icons.loader className="h-4 w-4 animate-spin mr-1" /> : <Icons.checkCircle className="h-4 w-4 mr-1" />}
                  Approuver → {STAGE_LABELS[nextStage] || nextStage}
                </Button>
              )}

              {canReplay && (
                <Button variant="outline" onClick={handleReplay} disabled={actionLoading}>
                  <Icons.refresh className="h-4 w-4 mr-1" />
                  Rejouer
                </Button>
              )}

              {canReject && !showReject && (
                <Button variant="destructive" onClick={() => setShowReject(true)} disabled={actionLoading}>
                  <Icons.xCircle className="h-4 w-4 mr-1" />
                  Rejeter
                </Button>
              )}

              {stage === 'rejected' && validTransitions.includes('crawled') && (
                <Button onClick={async () => {
                  setActionLoading(true)
                  try {
                    const res = await fetch(`/api/admin/pipeline/documents/${documentId}/advance`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ targetStage: 'crawled' }),
                    })
                    if (res.ok) await fetchDetail()
                  } finally {
                    setActionLoading(false)
                  }
                }} disabled={actionLoading}>
                  <Icons.undo className="h-4 w-4 mr-1" />
                  Re-soumettre
                </Button>
              )}
            </div>

            {showReject && (
              <div className="mt-3 flex items-center gap-2">
                <input
                  type="text"
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  placeholder="Raison du rejet..."
                  className="flex-1 rounded-md border px-3 py-2 text-sm"
                  autoFocus
                />
                <Button variant="destructive" size="sm" onClick={handleReject} disabled={actionLoading || !rejectReason.trim()}>
                  Confirmer
                </Button>
                <Button variant="ghost" size="sm" onClick={() => { setShowReject(false); setRejectReason('') }}>
                  Annuler
                </Button>
              </div>
            )}
          </div>
        </div>

        {/* Sidebar - right 1/3 */}
        <div className="space-y-6">
          {/* Timeline */}
          <div className="rounded-lg border p-4">
            <h3 className="text-sm font-medium mb-3">Historique Pipeline</h3>
            <PipelineTimeline history={history} />
          </div>

          {/* Metadata */}
          <div className="rounded-lg border p-4">
            <h3 className="text-sm font-medium mb-3">Informations</h3>
            <dl className="space-y-2 text-sm">
              <div>
                <dt className="text-muted-foreground">ID</dt>
                <dd className="font-mono text-xs">{doc.id}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Créé le</dt>
                <dd>{new Date(doc.created_at).toLocaleDateString('fr-FR')}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Mis à jour</dt>
                <dd>{new Date(doc.updated_at).toLocaleDateString('fr-FR')}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Étape depuis</dt>
                <dd>{new Date(doc.pipeline_stage_updated_at).toLocaleDateString('fr-FR')}</dd>
              </div>
              {doc.source_file && (
                <div>
                  <dt className="text-muted-foreground">Source</dt>
                  <dd>
                    <a href={doc.source_file} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline text-xs break-all">
                      {doc.source_file}
                    </a>
                  </dd>
                </div>
              )}
            </dl>
          </div>
        </div>
      </div>
    </div>
  )
}
