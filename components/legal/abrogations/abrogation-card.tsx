import Link from 'next/link'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ExternalLink, Calendar, FileText, CheckCircle2, AlertCircle } from 'lucide-react'
import { DomainBadge } from './domain-badge'
import type { LegalAbrogation } from '@/types/legal-abrogations'

interface AbrogationCardProps {
  abrogation: LegalAbrogation
  compact?: boolean
}

export function AbrogationCard({ abrogation, compact = false }: AbrogationCardProps) {
  const scopeConfig = {
    total: { label: 'Abrogation Totale', color: 'bg-red-100 text-red-800', icon: '🚫' },
    partial: { label: 'Abrogation Partielle', color: 'bg-orange-100 text-orange-800', icon: '⚠️' },
    implicit: { label: 'Abrogation Implicite', color: 'bg-yellow-100 text-yellow-800', icon: '💡' },
  }

  const confidenceConfig = {
    high: { label: 'Haute', color: 'text-green-600', icon: CheckCircle2 },
    medium: { label: 'Moyenne', color: 'text-yellow-600', icon: AlertCircle },
    low: { label: 'Basse', color: 'text-red-600', icon: AlertCircle },
  }

  const scope = scopeConfig[abrogation.scope]
  const confidence = confidenceConfig[abrogation.confidence]
  const ConfidenceIcon = confidence.icon

  const formattedDate = new Date(abrogation.abrogationDate).toLocaleDateString('fr-TN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

  if (compact) {
    return (
      <div className="flex items-center justify-between p-4 border rounded-lg hover:bg-accent/50 transition-colors">
        <div className="flex-1 space-y-1">
          <div className="flex items-center gap-2">
            <p className="font-medium text-sm">{abrogation.abrogatedReference}</p>
            {abrogation.domain && <DomainBadge domain={abrogation.domain} size="sm" />}
          </div>
          <p className="text-xs text-muted-foreground">
            → {abrogation.abrogatingReference}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">{formattedDate}</span>
          <Link href={`/legal/abrogations/${abrogation.id}`}>
            <Button variant="ghost" size="sm">
              Détails
            </Button>
          </Link>
        </div>
      </div>
    )
  }

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle className="text-lg">
                {abrogation.abrogatedReference}
              </CardTitle>
              {abrogation.domain && <DomainBadge domain={abrogation.domain} />}
            </div>
            <CardDescription className="text-sm text-muted-foreground">
              {abrogation.abrogatedReferenceAr}
            </CardDescription>
          </div>

          <div className="flex flex-col items-end gap-2">
            <Badge className={scope.color}>
              <span className="mr-1">{scope.icon}</span>
              {scope.label}
            </Badge>
            {abrogation.verified && (
              <div className={`flex items-center text-xs ${confidence.color}`}>
                <ConfidenceIcon className="w-3 h-3 mr-1" />
                {confidence.label}
              </div>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Loi abrogeante */}
        <div className="space-y-1">
          <div className="flex items-center text-sm text-muted-foreground">
            <FileText className="w-4 h-4 mr-2" />
            Abrogée par :
          </div>
          <p className="font-medium">{abrogation.abrogatingReference}</p>
          <p className="text-sm text-muted-foreground">{abrogation.abrogatingReferenceAr}</p>
        </div>

        {/* Date et articles */}
        <div className="flex flex-wrap gap-4 text-sm">
          <div className="flex items-center text-muted-foreground">
            <Calendar className="w-4 h-4 mr-2" />
            {formattedDate}
          </div>
          {abrogation.affectedArticles && abrogation.affectedArticles.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">Articles :</span>
              <div className="flex flex-wrap gap-1">
                {abrogation.affectedArticles.slice(0, 3).map((article, idx) => (
                  <Badge key={idx} variant="outline" className="text-xs">
                    {article}
                  </Badge>
                ))}
                {abrogation.affectedArticles.length > 3 && (
                  <Badge variant="outline" className="text-xs">
                    +{abrogation.affectedArticles.length - 3}
                  </Badge>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Notes */}
        {abrogation.notes && (
          <p className="text-sm text-muted-foreground line-clamp-2">{abrogation.notes}</p>
        )}

        {/* Actions */}
        <div className="flex items-center justify-between pt-4 border-t">
          <div className="flex gap-2">
            {abrogation.jortUrl && (
              <a
                href={abrogation.jortUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center text-xs text-primary hover:underline"
              >
                <ExternalLink className="w-3 h-3 mr-1" />
                JORT
              </a>
            )}
            {abrogation.sourceUrl && (
              <a
                href={abrogation.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center text-xs text-primary hover:underline"
              >
                <ExternalLink className="w-3 h-3 mr-1" />
                Source
              </a>
            )}
          </div>

          <Link href={`/legal/abrogations/${abrogation.id}`}>
            <Button variant="outline" size="sm">
              Voir détails
            </Button>
          </Link>
        </div>
      </CardContent>
    </Card>
  )
}
