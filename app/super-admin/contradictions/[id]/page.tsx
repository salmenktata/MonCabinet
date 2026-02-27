/**
 * Page Super Admin — Détail d'une contradiction
 * Affiche tous les détails, les documents impliqués et le formulaire de résolution
 */

import { notFound } from 'next/navigation'
import Link from 'next/link'
import { db } from '@/lib/db/postgres'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Icons } from '@/lib/icons'
import { ResolutionForm } from './resolution-form'
import type { ContradictionStatus, ContradictionSeverity, ContradictionType } from '@/lib/web-scraper/types'

export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ id: string }>
}

// ─── Constants (identiques à la liste) ───────────────────────────────────────

const SEVERITY_COLORS: Record<ContradictionSeverity, string> = {
  low: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  medium: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  high: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  critical: 'bg-red-500/20 text-red-400 border-red-500/30',
}

const SEVERITY_LABELS: Record<ContradictionSeverity, string> = {
  low: 'Faible',
  medium: 'Moyenne',
  high: 'Haute',
  critical: 'Critique',
}

const STATUS_COLORS: Record<ContradictionStatus, string> = {
  pending: 'bg-yellow-500/20 text-yellow-400',
  under_review: 'bg-blue-500/20 text-blue-400',
  resolved: 'bg-green-500/20 text-green-400',
  dismissed: 'bg-slate-500/20 text-slate-400',
  escalated: 'bg-purple-500/20 text-purple-400',
}

const STATUS_LABELS: Record<ContradictionStatus, string> = {
  pending: 'En attente',
  under_review: 'En cours',
  resolved: 'Résolu',
  dismissed: 'Rejeté',
  escalated: 'Escaladé',
}

const TYPE_LABELS: Record<ContradictionType | string, string> = {
  version_conflict: 'Conflit de version',
  interpretation_conflict: "Conflit d'interprétation",
  date_conflict: 'Conflit de date',
  legal_update: 'Mise à jour légale',
  doctrine_vs_practice: 'Doctrine vs pratique',
  cross_reference_error: 'Erreur de référence',
}

// ─── Types internes ───────────────────────────────────────────────────────────

interface ContradictionRow {
  id: string
  source_page_id: string
  target_page_id: string | null
  contradiction_type: string
  severity: ContradictionSeverity
  description: string
  source_excerpt: string | null
  target_excerpt: string | null
  similarity_score: string | null
  legal_impact: string | null
  suggested_resolution: string | null
  affected_references: unknown
  status: ContradictionStatus
  resolution_notes: string | null
  resolved_by: string | null
  resolved_at: string | null
  resolution_action: string | null
  llm_provider: string | null
  llm_model: string | null
  created_at: string
  updated_at: string
}

interface PageRow {
  id: string
  url: string
  title: string | null
  extracted_text: string | null
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function ContradictionDetailPage({ params }: PageProps) {
  const { id } = await params

  // Valider l'UUID
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    notFound()
  }

  // Récupérer la contradiction
  const contradictionResult = await db.query<ContradictionRow>(
    `SELECT
       id, source_page_id, target_page_id, contradiction_type, severity, description,
       source_excerpt, target_excerpt, similarity_score, legal_impact, suggested_resolution,
       affected_references, status, resolution_notes, resolved_by, resolved_at,
       resolution_action, llm_provider, llm_model, created_at, updated_at
     FROM content_contradictions
     WHERE id = $1`,
    [id]
  )

  if (contradictionResult.rows.length === 0) {
    notFound()
  }

  const c = contradictionResult.rows[0]

  // Récupérer les pages source et cible en parallèle
  const pageIds = [c.source_page_id, c.target_page_id].filter(Boolean) as string[]
  const pagesResult = await db.query<PageRow>(
    `SELECT id, url, title, extracted_text FROM web_pages WHERE id = ANY($1)`,
    [pageIds]
  )
  const pagesMap: Record<string, PageRow> = {}
  pagesResult.rows.forEach((p) => { pagesMap[p.id] = p })

  const sourcePage = pagesMap[c.source_page_id] ?? null
  const targetPage = c.target_page_id ? (pagesMap[c.target_page_id] ?? null) : null

  const similarityPct =
    c.similarity_score != null
      ? Math.round(parseFloat(c.similarity_score) * 100)
      : null

  const affectedRefs = Array.isArray(c.affected_references) ? c.affected_references : []

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-slate-500">
        <Link href="/super-admin/contradictions" className="hover:text-slate-300 transition-colors">
          Contradictions
        </Link>
        <Icons.chevronRight className="h-3.5 w-3.5" />
        <span className="text-slate-400">
          {TYPE_LABELS[c.contradiction_type] || c.contradiction_type}
        </span>
      </div>

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="outline" className="text-slate-300 border-slate-600">
              {TYPE_LABELS[c.contradiction_type] || c.contradiction_type}
            </Badge>
            <Badge variant="outline" className={SEVERITY_COLORS[c.severity]}>
              {SEVERITY_LABELS[c.severity]}
            </Badge>
            <Badge variant="outline" className={STATUS_COLORS[c.status]}>
              {STATUS_LABELS[c.status]}
            </Badge>
          </div>
          <p className="text-slate-300 text-sm leading-relaxed">{c.description}</p>
          <p className="text-xs text-slate-500">
            Détecté le{' '}
            {new Date(c.created_at).toLocaleDateString('fr-FR', {
              day: 'numeric',
              month: 'long',
              year: 'numeric',
            })}
          </p>
        </div>
        <Link href="/super-admin/contradictions">
          <Button variant="outline" size="sm" className="border-slate-600 text-slate-400 hover:text-white shrink-0">
            <Icons.chevronLeft className="h-3.5 w-3.5 mr-1" />
            Retour
          </Button>
        </Link>
      </div>

      {/* Formulaire de résolution */}
      <ResolutionForm
        contradictionId={c.id}
        currentStatus={c.status}
        resolutionNotes={c.resolution_notes}
        resolutionAction={c.resolution_action}
        resolvedAt={c.resolved_at ? new Date(c.resolved_at) : null}
        resolvedBy={c.resolved_by}
      />

      {/* Documents impliqués */}
      <section className="rounded-lg border border-slate-700 overflow-hidden">
        <div className="px-4 py-3 bg-slate-800/50 border-b border-slate-700">
          <h2 className="text-sm font-semibold text-white flex items-center gap-2">
            <Icons.fileText className="h-4 w-4 text-slate-400" />
            Documents impliqués
          </h2>
        </div>

        <div className="divide-y divide-slate-700">
          {/* Source */}
          <DocumentCard
            label="Source"
            page={sourcePage}
            excerpt={c.source_excerpt}
            color="blue"
          />

          {/* Séparateur avec icône */}
          <div className="flex items-center justify-center py-2 bg-slate-900/30">
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <Icons.arrowDown className="h-3 w-3" />
              <span>Contradiction détectée</span>
              {similarityPct != null && (
                <span className="text-slate-400 font-medium">
                  — similitude {similarityPct}%
                </span>
              )}
              <Icons.arrowDown className="h-3 w-3" />
            </div>
          </div>

          {/* Cible */}
          {targetPage || c.target_page_id ? (
            <DocumentCard
              label="Cible"
              page={targetPage}
              excerpt={c.target_excerpt}
              color="orange"
            />
          ) : (
            <div className="px-4 py-3 text-sm text-slate-500 italic">
              Aucun document cible (contradiction interne)
            </div>
          )}
        </div>
      </section>

      {/* Analyse */}
      <section className="rounded-lg border border-slate-700 overflow-hidden">
        <div className="px-4 py-3 bg-slate-800/50 border-b border-slate-700">
          <h2 className="text-sm font-semibold text-white flex items-center gap-2">
            <Icons.zap className="h-4 w-4 text-slate-400" />
            Analyse automatique
          </h2>
        </div>

        <div className="p-4 space-y-4">
          {/* Impact légal */}
          {c.legal_impact && (
            <div>
              <dt className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">
                Impact légal
              </dt>
              <dd className="text-sm text-slate-300">{c.legal_impact}</dd>
            </div>
          )}

          {/* Résolution suggérée */}
          {c.suggested_resolution && (
            <div>
              <dt className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">
                Résolution suggérée par le LLM
              </dt>
              <dd className="text-sm text-slate-300 bg-slate-800/50 rounded p-3 border border-slate-700">
                {c.suggested_resolution}
              </dd>
            </div>
          )}

          {/* Références affectées */}
          {affectedRefs.length > 0 && (
            <div>
              <dt className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-2">
                Références affectées ({affectedRefs.length})
              </dt>
              <dd className="flex flex-wrap gap-2">
                {affectedRefs.map((ref: any, i: number) => (
                  <span
                    key={i}
                    className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-slate-800 border border-slate-700 text-slate-300"
                  >
                    {ref.article || ref.code || ref.text || JSON.stringify(ref)}
                  </span>
                ))}
              </dd>
            </div>
          )}

          {/* Score similarité */}
          {similarityPct != null && (
            <div>
              <dt className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">
                Score de similarité
              </dt>
              <dd className="flex items-center gap-3">
                <div className="flex-1 max-w-xs bg-slate-800 rounded-full h-2 overflow-hidden">
                  <div
                    className="h-full bg-blue-500 rounded-full transition-all"
                    style={{ width: `${similarityPct}%` }}
                  />
                </div>
                <span className="text-sm font-medium text-slate-300">{similarityPct}%</span>
              </dd>
            </div>
          )}

          {/* LLM */}
          {(c.llm_provider || c.llm_model) && (
            <div>
              <dt className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">
                Modèle IA utilisé
              </dt>
              <dd className="text-xs text-slate-400">
                {[c.llm_provider, c.llm_model].filter(Boolean).join(' / ')}
              </dd>
            </div>
          )}

          {!c.legal_impact && !c.suggested_resolution && similarityPct == null && (
            <p className="text-sm text-slate-500 italic">
              Aucune analyse automatique disponible pour cette contradiction.
            </p>
          )}
        </div>
      </section>
    </div>
  )
}

// ─── Sous-composant carte document ────────────────────────────────────────────

function DocumentCard({
  label,
  page,
  excerpt,
  color,
}: {
  label: string
  page: PageRow | null
  excerpt: string | null
  color: 'blue' | 'orange'
}) {
  const colorClasses = {
    blue: 'text-blue-400 border-blue-500/20 bg-blue-500/5',
    orange: 'text-orange-400 border-orange-500/20 bg-orange-500/5',
  }

  const snippet = excerpt ?? (page?.extracted_text ? page.extracted_text.slice(0, 400) : null)

  return (
    <div className="p-4">
      <div className="flex items-center gap-2 mb-2">
        <span className={`text-xs font-semibold uppercase tracking-wide ${colorClasses[color].split(' ')[0]}`}>
          {label}
        </span>
        {page && (
          <a
            href={page.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-slate-400 hover:text-white transition-colors truncate max-w-sm"
            title={page.url}
          >
            {page.title || page.url}
            <Icons.externalLink className="h-3 w-3 inline ml-1 opacity-60" />
          </a>
        )}
        {!page && (
          <span className="text-xs text-slate-500 italic">Page non trouvée</span>
        )}
      </div>
      {snippet && (
        <blockquote className={`text-xs text-slate-300 leading-relaxed rounded p-3 border ${colorClasses[color].split(' ').slice(1).join(' ')} line-clamp-4`}>
          {snippet.length > 400 ? snippet.slice(0, 400) + '…' : snippet}
        </blockquote>
      )}
    </div>
  )
}
