'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Icons } from '@/lib/icons'
import { toast } from 'sonner'

interface PageMetadata {
  // Common fields
  documentType: string | null
  documentDate: string | null
  documentNumber: string | null
  titleOfficial: string | null
  language: string | null

  // Jurisprudence
  tribunal: string | null
  chambre: string | null
  decisionNumber: string | null
  decisionDate: string | null

  // Legislation
  textType: string | null
  textNumber: string | null
  publicationDate: string | null
  effectiveDate: string | null
  jortReference: string | null

  // Doctrine
  author: string | null
  publicationName: string | null
  keywords: string[] | null
  abstract: string | null

  // Confidence
  confidence: number | null

  // Allow other fields
  [key: string]: unknown
}

interface WebPageMetadataProps {
  sourceId: string
  pageId: string
}

const DOCUMENT_TYPE_LABELS: Record<string, { label: string; color: string }> = {
  jurisprudence: {
    label: 'Jurisprudence',
    color: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
  },
  legislation: {
    label: 'Législation',
    color: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  },
  doctrine: {
    label: 'Doctrine',
    color: 'bg-green-500/20 text-green-300 border-green-500/30',
  },
  other: {
    label: 'Autre',
    color: 'bg-slate-500/20 text-slate-300 border-slate-500/30',
  },
}

function MetadataField({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-slate-400">{label}</span>
      <span className="text-sm text-white">{value}</span>
    </div>
  )
}

function MetadataSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <h4 className="text-xs font-medium text-slate-400 uppercase tracking-wider">
        {title}
      </h4>
      <div className="grid gap-3 sm:grid-cols-2">
        {children}
      </div>
    </div>
  )
}

function ConfidenceIndicator({ confidence }: { confidence: number }) {
  const percent = Math.round(confidence * 100)
  let color = 'text-red-400 bg-red-500/20'
  if (percent >= 80) {
    color = 'text-green-400 bg-green-500/20'
  } else if (percent >= 60) {
    color = 'text-yellow-400 bg-yellow-500/20'
  } else if (percent >= 40) {
    color = 'text-orange-400 bg-orange-500/20'
  }

  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-slate-700 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${
            percent >= 80
              ? 'bg-green-500'
              : percent >= 60
              ? 'bg-yellow-500'
              : percent >= 40
              ? 'bg-orange-500'
              : 'bg-red-500'
          }`}
          style={{ width: `${percent}%` }}
        />
      </div>
      <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${color}`}>
        {percent}%
      </span>
    </div>
  )
}

export function WebPageMetadata({ sourceId, pageId }: WebPageMetadataProps) {
  const [metadata, setMetadata] = useState<PageMetadata | null>(null)
  const [loading, setLoading] = useState(true)
  const [extracting, setExtracting] = useState(false)

  const fetchMetadata = useCallback(async () => {
    try {
      setLoading(true)
      const response = await fetch(
        `/api/admin/web-sources/${sourceId}/pages/${pageId}/metadata`
      )

      if (!response.ok) {
        const errData = await response.json().catch(() => ({ error: 'Erreur serveur' }))
        throw new Error(errData.error || `Erreur ${response.status}`)
      }

      const data = await response.json()
      setMetadata(data.metadata || data || null)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Impossible de charger les métadonnées.')
    } finally {
      setLoading(false)
    }
  }, [sourceId, pageId])

  useEffect(() => {
    fetchMetadata()
  }, [fetchMetadata])

  const handleReExtract = async () => {
    setExtracting(true)

    try {
      const response = await fetch(
        `/api/admin/web-sources/${sourceId}/pages/${pageId}/metadata`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        }
      )

      if (!response.ok) {
        const errData = await response.json().catch(() => ({ error: 'Erreur serveur' }))
        throw new Error(errData.error || `Erreur ${response.status}`)
      }

      const data = await response.json()
      setMetadata(data.metadata || data || null)

      toast.success('Métadonnées extraites — Les métadonnées ont été ré-extraites avec succès.')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Impossible de ré-extraire les métadonnées.')
    } finally {
      setExtracting(false)
    }
  }

  if (loading) {
    return (
      <Card className="bg-slate-800 border-slate-700">
        <CardContent className="py-8">
          <div className="flex flex-col items-center gap-3">
            <Icons.loader className="h-8 w-8 text-slate-400 animate-spin" />
            <p className="text-sm text-slate-400">Chargement des métadonnées...</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (!metadata) {
    return (
      <Card className="bg-slate-800 border-slate-700">
        <CardHeader className="pb-3">
          <CardTitle className="text-white text-base flex items-center gap-2">
            <Icons.fileSearch className="h-4 w-4" />
            Métadonnées
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-6 text-slate-400">
            <Icons.fileSearch className="h-8 w-8 mx-auto mb-2" />
            <p className="text-sm mb-3">Aucune métadonnée extraite pour cette page.</p>
            <Button
              onClick={handleReExtract}
              disabled={extracting}
              size="sm"
              className="bg-blue-600 hover:bg-blue-700"
            >
              {extracting ? (
                <>
                  <Icons.loader className="h-4 w-4 mr-2 animate-spin" />
                  Extraction...
                </>
              ) : (
                <>
                  <Icons.sparkles className="h-4 w-4 mr-2" />
                  Extraire les métadonnées
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  const docType = metadata.documentType || 'other'
  const typeConfig = DOCUMENT_TYPE_LABELS[docType] || DOCUMENT_TYPE_LABELS.other

  const isJurisprudence = docType === 'jurisprudence'
  const isLegislation = docType === 'legislation'
  const isDoctrine = docType === 'doctrine'

  const hasJurisprudenceFields =
    metadata.tribunal || metadata.chambre || metadata.decisionNumber || metadata.decisionDate
  const hasLegislationFields =
    metadata.textType || metadata.textNumber || metadata.publicationDate || metadata.effectiveDate || metadata.jortReference
  const hasDoctrineFields =
    metadata.author || metadata.publicationName || (metadata.keywords && metadata.keywords.length > 0) || metadata.abstract

  return (
    <Card className="bg-slate-800 border-slate-700">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-white text-base flex items-center gap-2">
            <Icons.fileSearch className="h-4 w-4" />
            Métadonnées
          </CardTitle>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleReExtract}
            disabled={extracting}
            className="text-slate-400 hover:text-white hover:bg-slate-600"
          >
            {extracting ? (
              <Icons.loader className="h-4 w-4 mr-1 animate-spin" />
            ) : (
              <Icons.refresh className="h-4 w-4 mr-1" />
            )}
            Ré-extraire
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-5">
        {/* Document type badge */}
        <div className="flex items-center gap-2">
          <Badge className={typeConfig.color}>{typeConfig.label}</Badge>
          {metadata.language && (
            <Badge className="bg-slate-600/50 text-slate-300 border-slate-500/30">
              {metadata.language === 'ar' ? 'العربية' : metadata.language === 'fr' ? 'Français' : metadata.language}
            </Badge>
          )}
        </div>

        {/* Confidence indicator */}
        {metadata.confidence != null && (
          <div className="space-y-1">
            <span className="text-xs text-slate-400">Confiance d'extraction</span>
            <ConfidenceIndicator confidence={metadata.confidence} />
          </div>
        )}

        {/* Common fields */}
        <MetadataSection title="Informations générales">
          <MetadataField label="Titre officiel" value={metadata.titleOfficial} />
          <MetadataField label="Date du document" value={metadata.documentDate} />
          <MetadataField label="Numéro" value={metadata.documentNumber} />
          <MetadataField label="Langue" value={
            metadata.language === 'ar' ? 'Arabe'
            : metadata.language === 'fr' ? 'Français'
            : metadata.language
          } />
        </MetadataSection>

        {/* Jurisprudence fields */}
        {(isJurisprudence || hasJurisprudenceFields) && (
          <MetadataSection title="Jurisprudence">
            <MetadataField label="Tribunal" value={metadata.tribunal} />
            <MetadataField label="Chambre" value={metadata.chambre} />
            <MetadataField label="N de décision" value={metadata.decisionNumber} />
            <MetadataField label="Date de décision" value={metadata.decisionDate} />
          </MetadataSection>
        )}

        {/* Legislation fields */}
        {(isLegislation || hasLegislationFields) && (
          <MetadataSection title="Législation">
            <MetadataField label="Type de texte" value={metadata.textType} />
            <MetadataField label="N de texte" value={metadata.textNumber} />
            <MetadataField label="Date de publication" value={metadata.publicationDate} />
            <MetadataField label="Date d'effet" value={metadata.effectiveDate} />
            <MetadataField label="Référence JORT" value={metadata.jortReference} />
          </MetadataSection>
        )}

        {/* Doctrine fields */}
        {(isDoctrine || hasDoctrineFields) && (
          <MetadataSection title="Doctrine">
            <MetadataField label="Auteur" value={metadata.author} />
            <MetadataField label="Publication" value={metadata.publicationName} />
            {metadata.keywords && metadata.keywords.length > 0 && (
              <div className="flex flex-col gap-1 sm:col-span-2">
                <span className="text-xs text-slate-400">Mots-clés</span>
                <div className="flex flex-wrap gap-1">
                  {metadata.keywords.map((kw) => (
                    <span
                      key={kw}
                      className="inline-flex items-center rounded-full bg-slate-600/50 text-slate-300 text-xs px-2 py-0.5"
                    >
                      {kw}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {metadata.abstract && (
              <div className="flex flex-col gap-0.5 sm:col-span-2">
                <span className="text-xs text-slate-400">Résumé</span>
                <p className="text-sm text-white leading-relaxed">{metadata.abstract}</p>
              </div>
            )}
          </MetadataSection>
        )}
      </CardContent>
    </Card>
  )
}
