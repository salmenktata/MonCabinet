/**
 * Page Super Admin - Détail Document Juridique
 */

import Link from 'next/link'
import { notFound } from 'next/navigation'
import { db } from '@/lib/db/postgres'
import { Badge } from '@/components/ui/badge'
import { Icons } from '@/lib/icons'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { getStalenessThreshold } from '@/lib/legal-documents/freshness-service'
import { ApprovalActions } from './approval-actions'
import { CollapsibleSection } from './collapsible-section'
import { ConsolidatedTextViewer } from './consolidated-text-viewer'

export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ id: string }>
}

// ── Color maps ────────────────────────────────────────────────────────────────

const TYPE_BADGE: Record<string, string> = {
  code: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  loi: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  decret: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  arrete: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
  circulaire: 'bg-teal-500/20 text-teal-400 border-teal-500/30',
  jurisprudence: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  doctrine: 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30',
  guide: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  formulaire: 'bg-pink-500/20 text-pink-400 border-pink-500/30',
  autre: 'bg-slate-500/20 text-slate-400 border-slate-500/30',
}

const NORM_LEVEL_BADGE: Record<string, string> = {
  constitution:         'bg-amber-500/20 text-amber-300 border-amber-500/30',
  traite_international: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
  loi_organique:        'bg-blue-500/20 text-blue-300 border-blue-500/30',
  loi_ordinaire:        'bg-sky-500/20 text-sky-300 border-sky-500/30',
  marsoum:              'bg-green-500/20 text-green-300 border-green-500/30',
  ordre_reglementaire:  'bg-teal-500/20 text-teal-300 border-teal-500/30',
  arrete_ministeriel:   'bg-orange-500/20 text-orange-300 border-orange-500/30',
  acte_local:           'bg-slate-500/20 text-slate-300 border-slate-500/30',
}

const NORM_LEVEL_LABEL: Record<string, string> = {
  constitution: 'Constitution', traite_international: 'Traité international',
  loi_organique: 'Loi organique', loi_ordinaire: 'Loi ordinaire / Code',
  marsoum: 'Marsoum', ordre_reglementaire: 'Ordre réglementaire',
  arrete_ministeriel: 'Arrêté ministériel', acte_local: 'Acte local',
}

const CONSOLIDATION_BADGE: Record<string, string> = {
  pending: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  partial: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  complete: 'bg-green-500/20 text-green-400 border-green-500/30',
}

const CONTRIBUTION_BADGE: Record<string, string> = {
  article:   'bg-blue-500/20 text-blue-300 border-blue-500/30',
  section:   'bg-purple-500/20 text-purple-300 border-purple-500/30',
  annexe:    'bg-teal-500/20 text-teal-300 border-teal-500/30',
  preamble:  'bg-amber-500/20 text-amber-300 border-amber-500/30',
  full:      'bg-green-500/20 text-green-300 border-green-500/30',
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function LegalDocumentDetailPage({ params }: PageProps) {
  const { id } = await params

  const [docResult, pagesResult, amendmentsResult] = await Promise.all([
    db.query<any>(
      `SELECT ld.*,
        ws.name as source_name, ws.base_url as source_url,
        kb.title as kb_title, kb.is_indexed as kb_is_indexed, kb.rag_enabled as kb_rag_enabled,
        (SELECT COUNT(*) FROM web_pages_documents wpd WHERE wpd.legal_document_id = ld.id)::TEXT as linked_pages_count,
        (SELECT COUNT(*) FROM knowledge_base_chunks kbc WHERE kbc.knowledge_base_id = ld.knowledge_base_id)::TEXT as chunks_count,
        EXTRACT(DAY FROM NOW() - COALESCE(ld.last_verified_at, ld.created_at))::INTEGER as staleness_days
      FROM legal_documents ld
      LEFT JOIN web_sources ws ON ld.canonical_source_id = ws.id
      LEFT JOIN knowledge_base kb ON ld.knowledge_base_id = kb.id
      WHERE ld.id = $1`,
      [id]
    ),
    db.query<{
      url: string
      title: string | null
      article_number: string | null
      page_order: number | null
      contribution_type: string
      word_count: number | null
    }>(
      `SELECT wp.url, wp.title, wpd.article_number, wpd.page_order, wpd.contribution_type, wp.word_count
      FROM web_pages_documents wpd
      JOIN web_pages wp ON wpd.web_page_id = wp.id
      WHERE wpd.legal_document_id = $1
      ORDER BY wpd.page_order ASC NULLS LAST
      LIMIT 50`,
      [id]
    ),
    db.query<{
      id: string
      amending_law_reference: string | null
      amendment_date: string | null
      amendment_scope: string | null
      affected_articles: string[] | null
      description: string | null
    }>(
      `SELECT * FROM legal_document_amendments
      WHERE original_document_id = $1
      ORDER BY amendment_date DESC NULLS LAST`,
      [id]
    ),
  ])

  if (docResult.rows.length === 0) notFound()

  const doc = docResult.rows[0]
  const pages = pagesResult.rows
  const amendments = amendmentsResult.rows
  const threshold = getStalenessThreshold(doc.document_type || 'autre')
  const stalenessDays = doc.staleness_days ?? 0
  const structure = doc.structure as any
  const chunksCount = parseInt(doc.chunks_count || '0', 10)
  const linkedPagesCount = parseInt(doc.linked_pages_count || '0', 10)

  const stalenessRatio = threshold > 0 ? Math.min(stalenessDays / threshold, 1) : 0
  const freshnessColor = stalenessDays > threshold
    ? 'text-red-400' : stalenessDays > threshold * 0.75
    ? 'text-yellow-400' : 'text-green-400'
  const freshnessBarColor = stalenessDays > threshold
    ? 'bg-red-500' : stalenessDays > threshold * 0.75
    ? 'bg-yellow-500' : 'bg-green-500'

  return (
    <div className="space-y-5">

      {/* ── Breadcrumb + Header ──────────────────────────────────────── */}
      <div className="space-y-3">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-1.5 text-xs text-slate-500">
          <Link href="/super-admin/legal-documents" className="hover:text-slate-300 transition-colors flex items-center gap-1">
            <Icons.scale className="h-3.5 w-3.5" />
            Documents Juridiques
          </Link>
          <Icons.chevronRight className="h-3 w-3" />
          <span className="text-slate-400 font-mono">{doc.citation_key}</span>
        </nav>

        {/* Header principal */}
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-2 min-w-0">
            {/* Titre AR */}
            {doc.official_title_ar && (
              <h1
                className="text-xl font-bold text-white leading-snug"
                dir="rtl"
                lang="ar"
              >
                {doc.official_title_ar}
              </h1>
            )}
            {/* Titre FR */}
            {doc.official_title_fr && (
              <p className="text-slate-400 text-sm leading-snug">
                {doc.official_title_fr}
              </p>
            )}
            {/* Badges d'identité rapides */}
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <Badge variant="outline" className={TYPE_BADGE[doc.document_type] ?? TYPE_BADGE.autre}>
                {doc.document_type || 'autre'}
              </Badge>
              {doc.norm_level && (
                <Badge variant="outline" className={NORM_LEVEL_BADGE[doc.norm_level] ?? 'bg-slate-500/20 text-slate-400 border-slate-500/30'}>
                  {NORM_LEVEL_LABEL[doc.norm_level] ?? doc.norm_level}
                </Badge>
              )}
              <Badge variant="outline" className={CONSOLIDATION_BADGE[doc.consolidation_status] ?? CONSOLIDATION_BADGE.pending}>
                {doc.consolidation_status === 'complete' ? 'Consolidé' : doc.consolidation_status === 'partial' ? 'Partiel' : 'En attente'}
              </Badge>
              {doc.is_abrogated && (
                <Badge variant="outline" className="bg-red-500/20 text-red-400 border-red-500/30">
                  Abrogé{doc.abrogation_date ? ` (${fmtDate(doc.abrogation_date)})` : ''}
                </Badge>
              )}
            </div>
          </div>

          {/* Actions approbation */}
          <div className="shrink-0">
            <ApprovalActions
              documentId={doc.id}
              isApproved={doc.is_approved ?? false}
              consolidationStatus={doc.consolidation_status}
              approvedAt={doc.approved_at}
              isAbrogated={doc.is_abrogated ?? false}
            />
          </div>
        </div>
      </div>

      {/* ── Métriques rapides ────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <MetricCard
          icon={Icons.link}
          label="Pages liées"
          value={linkedPagesCount}
          color="text-blue-400"
        />
        <MetricCard
          icon={Icons.hash}
          label="Articles"
          value={pages.filter(p => p.contribution_type === 'article' || p.contribution_type === 'section').length}
          color="text-sky-400"
        />
        <MetricCard
          icon={Icons.database}
          label="Chunks KB"
          value={chunksCount}
          color={chunksCount > 0 ? 'text-emerald-400' : 'text-slate-500'}
          note={chunksCount > 0 && doc.is_approved && doc.kb_is_indexed ? 'Indexé' : chunksCount > 0 ? 'Non visible' : undefined}
        />
        <MetricCard
          icon={Icons.clock}
          label="Fraîcheur"
          value={`${stalenessDays}j`}
          color={freshnessColor}
          note={`seuil ${threshold}j`}
          bar={{ ratio: stalenessRatio, color: freshnessBarColor }}
        />
      </div>

      {/* ── Informations ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* Carte Identité */}
        <InfoCard title="Identité" icon={Icons.scale}>
          <InfoRow label="Citation Key">
            <code className="font-mono text-sm text-white bg-slate-800 px-2 py-0.5 rounded">{doc.citation_key}</code>
          </InfoRow>
          <InfoRow label="Catégorie principale">
            {doc.primary_category ? (
              <span className="text-sm text-slate-200">{doc.primary_category}</span>
            ) : <Empty />}
          </InfoRow>
          {doc.secondary_categories?.length > 0 && (
            <InfoRow label="Catégories secondaires">
              <div className="flex flex-wrap gap-1">
                {(doc.secondary_categories as string[]).map(c => (
                  <Badge key={c} variant="outline" className="bg-slate-500/15 text-slate-300 border-slate-500/25 text-xs">{c}</Badge>
                ))}
              </div>
            </InfoRow>
          )}
          {doc.legal_domains?.length > 0 && (
            <InfoRow label="Domaines juridiques">
              <div className="flex flex-wrap gap-1">
                {(doc.legal_domains as string[]).map(d => (
                  <Badge key={d} variant="outline" className="bg-blue-500/15 text-blue-300 border-blue-500/25 text-xs">{d}</Badge>
                ))}
              </div>
            </InfoRow>
          )}
          {doc.tags?.length > 0 && (
            <InfoRow label="Tags">
              <div className="flex flex-wrap gap-1">
                {(doc.tags as string[]).map(t => (
                  <Badge key={t} variant="outline" className="bg-slate-500/15 text-slate-400 border-slate-500/25 text-xs">
                    <Icons.tag className="h-2.5 w-2.5 mr-0.5" />
                    {t}
                  </Badge>
                ))}
              </div>
            </InfoRow>
          )}
          <InfoRow label="Source canonique">
            {doc.source_name ? (
              <a
                href={doc.source_url || '#'}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-sm text-blue-400 hover:text-blue-300 transition-colors"
              >
                {doc.source_name}
                <Icons.externalLink className="h-3 w-3" />
              </a>
            ) : <Empty />}
          </InfoRow>
        </InfoCard>

        {/* Carte Dates & Statut */}
        <InfoCard title="Dates & Statut" icon={Icons.calendar}>
          <InfoRow label="Publication">
            {doc.publication_date ? (
              <span className="text-sm text-slate-200">{fmtDate(doc.publication_date)}</span>
            ) : <Empty />}
          </InfoRow>
          <InfoRow label="Entrée en vigueur">
            {doc.effective_date ? (
              <span className="text-sm text-slate-200">{fmtDate(doc.effective_date)}</span>
            ) : <Empty />}
          </InfoRow>
          <InfoRow label="Réf. JORT">
            {doc.jort_reference ? (
              <span className="text-sm font-mono text-slate-200">{doc.jort_reference}</span>
            ) : <Empty />}
          </InfoRow>
          <InfoRow label="Dernière vérification">
            <span className="text-sm text-slate-200">
              {doc.last_verified_at ? fmtDate(doc.last_verified_at) : 'Jamais'}
            </span>
          </InfoRow>
          <InfoRow label="Approbation">
            {doc.is_approved ? (
              <span className="inline-flex items-center gap-1.5 text-sm text-green-400">
                <Icons.checkCircle className="h-4 w-4" />
                Approuvé{doc.approved_at ? ` le ${fmtDate(doc.approved_at)}` : ''}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-sm text-slate-500">
                <Icons.clock className="h-4 w-4" />
                En attente d&apos;approbation
              </span>
            )}
          </InfoRow>
          <InfoRow label="Base de connaissance">
            {doc.knowledge_base_id ? (
              <div className="space-y-1">
                <span className="text-sm text-slate-200">
                  {doc.kb_title || doc.knowledge_base_id.slice(0, 8)}
                </span>
                <div className="flex items-center gap-2 text-xs">
                  <span className={chunksCount > 0 ? 'text-blue-400' : 'text-slate-500'}>
                    {chunksCount} chunk{chunksCount !== 1 ? 's' : ''}
                  </span>
                  {doc.kb_is_indexed ? (
                    <span className="text-emerald-400">• Indexé</span>
                  ) : (
                    <span className="text-slate-500">• Non indexé</span>
                  )}
                  {doc.kb_rag_enabled === false && (
                    <span className="text-orange-400">• RAG désactivé</span>
                  )}
                </div>
              </div>
            ) : (
              <span className="text-sm text-slate-500">Non lié à la KB</span>
            )}
          </InfoRow>
        </InfoCard>
      </div>

      {/* ── Structure ─────────────────────────────────────────────────── */}
      {structure && (
        <InfoCard title="Structure du document" icon={Icons.layers}>
          <StructureTree structure={structure} />
        </InfoCard>
      )}

      {/* ── Amendements ───────────────────────────────────────────────── */}
      {amendments.length > 0 && (
        <section className="rounded-lg border border-slate-700 overflow-hidden">
          <div className="flex items-center gap-2 px-5 py-3.5 border-b border-slate-700 bg-slate-900/60">
            <Icons.history className="h-4 w-4 text-orange-400" />
            <h2 className="text-sm font-semibold text-white">Amendements</h2>
            <span className="text-xs text-slate-500 tabular-nums">({amendments.length})</span>
          </div>
          <Table>
            <TableHeader>
              <TableRow className="border-slate-700 hover:bg-transparent bg-slate-900/40">
                <TableHead className="text-slate-400 text-xs uppercase tracking-wide">Référence</TableHead>
                <TableHead className="text-slate-400 text-xs uppercase tracking-wide">Date</TableHead>
                <TableHead className="text-slate-400 text-xs uppercase tracking-wide">Portée</TableHead>
                <TableHead className="text-slate-400 text-xs uppercase tracking-wide">Articles</TableHead>
                <TableHead className="text-slate-400 text-xs uppercase tracking-wide">Description</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {amendments.map((a) => (
                <TableRow key={a.id} className="border-slate-700/50 hover:bg-slate-800/30">
                  <TableCell className="text-sm text-white font-medium">
                    {a.amending_law_reference || <span className="text-slate-600">—</span>}
                  </TableCell>
                  <TableCell className="text-sm text-slate-300 tabular-nums whitespace-nowrap">
                    {a.amendment_date ? fmtDate(a.amendment_date) : <span className="text-slate-600">—</span>}
                  </TableCell>
                  <TableCell>
                    {a.amendment_scope ? (
                      <Badge variant="outline" className="bg-orange-500/15 text-orange-300 border-orange-500/25 text-xs">
                        {a.amendment_scope}
                      </Badge>
                    ) : <span className="text-slate-600 text-sm">—</span>}
                  </TableCell>
                  <TableCell className="text-xs text-slate-400 max-w-[160px] truncate">
                    {a.affected_articles?.join(', ') || <span className="text-slate-600">—</span>}
                  </TableCell>
                  <TableCell className="text-sm text-slate-400 max-w-xs truncate">
                    {a.description || <span className="text-slate-600">—</span>}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </section>
      )}

      {/* ── Texte consolidé ───────────────────────────────────────────── */}
      {doc.consolidated_text && (
        <section className="rounded-lg border border-slate-700 overflow-hidden">
          <div className="flex items-center gap-2 px-5 py-3.5 border-b border-slate-700 bg-slate-900/60">
            <Icons.bookOpen className="h-4 w-4 text-slate-400" />
            <h2 className="text-sm font-semibold text-white">Texte consolidé</h2>
          </div>
          <ConsolidatedTextViewer
            text={doc.consolidated_text}
            totalArticles={structure?.totalArticles}
            totalWords={structure?.totalWords}
          />
        </section>
      )}

      {/* ── Pages liées ───────────────────────────────────────────────── */}
      <CollapsibleSection
        defaultOpen={false}
        header={
          <>
            <Icons.link className="h-4 w-4 text-slate-400" />
            <h2 className="text-sm font-semibold text-white">Pages liées</h2>
            <span className="text-xs text-slate-500 tabular-nums">
              ({pages.length}{linkedPagesCount > 50 ? ` / ${linkedPagesCount}` : ''})
            </span>
          </>
        }
        footer={
          linkedPagesCount > 50 ? (
            <div className="px-5 py-3 text-xs text-slate-500 border-t border-slate-700 bg-slate-900/30">
              Affichage limité à 50 pages sur {linkedPagesCount}
            </div>
          ) : undefined
        }
      >
        <Table>
          <TableHeader>
            <TableRow className="border-slate-700 hover:bg-transparent bg-slate-900/40">
              <TableHead className="text-slate-400 text-xs uppercase tracking-wide w-12">#</TableHead>
              <TableHead className="text-slate-400 text-xs uppercase tracking-wide w-28">Article</TableHead>
              <TableHead className="text-slate-400 text-xs uppercase tracking-wide">Titre / URL</TableHead>
              <TableHead className="text-slate-400 text-xs uppercase tracking-wide">Type</TableHead>
              <TableHead className="text-slate-400 text-xs uppercase tracking-wide text-right">Mots</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pages.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8 text-slate-500">
                  <Icons.link className="h-6 w-6 mx-auto mb-2 opacity-30" />
                  Aucune page liée
                </TableCell>
              </TableRow>
            ) : (
              pages.map((p, i) => (
                <TableRow key={i} className="border-slate-700/50 hover:bg-slate-800/30">
                  <TableCell className="text-xs text-slate-600 tabular-nums">
                    {p.page_order ?? i + 1}
                  </TableCell>
                  <TableCell className="font-mono text-xs text-slate-300">
                    {p.article_number || <span className="text-slate-600">—</span>}
                  </TableCell>
                  <TableCell className="max-w-md">
                    <a
                      href={p.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-blue-400 hover:text-blue-300 transition-colors truncate block"
                      title={p.url}
                    >
                      {p.title || p.url}
                    </a>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={`text-xs ${CONTRIBUTION_BADGE[p.contribution_type] ?? 'bg-slate-500/20 text-slate-300 border-slate-500/30'}`}>
                      {p.contribution_type}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right text-xs text-slate-400 tabular-nums">
                    {p.word_count ? p.word_count.toLocaleString('fr-FR') : <span className="text-slate-600">—</span>}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CollapsibleSection>
    </div>
  )
}

// ── Utilities ─────────────────────────────────────────────────────────────────

function fmtDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })
  } catch {
    return dateStr
  }
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Empty() {
  return <span className="text-slate-600 text-sm">—</span>
}

function InfoCard({
  title,
  icon: Icon,
  children,
}: {
  title: string
  icon: React.ComponentType<{ className?: string }>
  children: React.ReactNode
}) {
  return (
    <div className="rounded-lg border border-slate-700 overflow-hidden">
      <div className="flex items-center gap-2 px-5 py-3.5 border-b border-slate-700 bg-slate-900/60">
        <Icon className="h-4 w-4 text-slate-400" />
        <h2 className="text-sm font-semibold text-white">{title}</h2>
      </div>
      <div className="px-5 py-4 space-y-3 bg-slate-900/30">
        {children}
      </div>
    </div>
  )
}

function InfoRow({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="flex items-start gap-3">
      <span className="text-xs text-slate-500 w-36 shrink-0 pt-0.5 leading-relaxed">{label}</span>
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  )
}

function MetricCard({
  icon: Icon,
  label,
  value,
  color,
  note,
  bar,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: number | string
  color: string
  note?: string
  bar?: { ratio: number; color: string }
}) {
  return (
    <div className="p-4 bg-slate-900/50 border border-slate-700 rounded-lg space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs text-slate-400">{label}</span>
        <Icon className={`h-3.5 w-3.5 ${color}`} />
      </div>
      <div className="flex items-end justify-between gap-2">
        <span className={`text-xl font-bold tabular-nums ${color}`}>{value}</span>
        {note && <span className="text-xs text-slate-500 mb-0.5">{note}</span>}
      </div>
      {bar && (
        <div className="h-1 bg-slate-700 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${bar.color}`}
            style={{ width: `${Math.round(bar.ratio * 100)}%` }}
          />
        </div>
      )}
    </div>
  )
}

function StructureTree({ structure }: { structure: any }) {
  if (!structure) return null

  const renderNode = (node: any, depth: number = 0): React.ReactNode => {
    if (!node) return null
    if (Array.isArray(node)) {
      return (
        <ul className={`space-y-1 ${depth > 0 ? 'ml-4 border-l border-slate-700/60 pl-3' : ''}`}>
          {node.map((item: any, i: number) => (
            <li key={i}>{renderNode(item, depth + 1)}</li>
          ))}
        </ul>
      )
    }
    if (typeof node === 'object') {
      const title = node.title || node.name || node.label
      const children = node.children || node.items || node.articles || node.chapters || node.sections
      return (
        <div>
          {title && (
            <div className="text-sm text-slate-300 leading-snug">
              {node.number && <span className="text-slate-500 mr-2 font-mono text-xs">{node.number}</span>}
              {title}
              {node.count && <span className="text-slate-500 ml-2 text-xs">({node.count})</span>}
            </div>
          )}
          {children && renderNode(children, depth + 1)}
        </div>
      )
    }
    return <span className="text-sm text-slate-400">{String(node)}</span>
  }

  return <div className="space-y-2">{renderNode(structure)}</div>
}
