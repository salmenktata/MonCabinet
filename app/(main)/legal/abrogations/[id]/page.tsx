import { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import {
  ArrowLeft,
  Calendar,
  FileText,
  ExternalLink,
  CheckCircle2,
  AlertCircle,
  Clock,
} from 'lucide-react'
import { DomainBadge } from '@/components/legal/abrogations/domain-badge'
import type { LegalAbrogation } from '@/types/legal-abrogations'

interface Props {
  params: Promise<{ id: string }>
}

async function getAbrogation(id: string): Promise<LegalAbrogation | null> {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  const res = await fetch(`${baseUrl}/api/legal/abrogations/${id}`, {
    next: { revalidate: 3600 }, // Cache 1 heure
  })

  if (!res.ok) {
    if (res.status === 404) return null
    throw new Error('Failed to fetch abrogation')
  }

  return res.json()
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params
  const abrogation = await getAbrogation(id)

  if (!abrogation) {
    return {
      title: 'Abrogation non trouvée | Qadhya',
    }
  }

  return {
    title: `${abrogation.abrogatedReference} - Abrogation | Qadhya`,
    description: `Détails de l'abrogation : ${abrogation.abrogatedReference} par ${abrogation.abrogatingReference} le ${new Date(abrogation.abrogationDate).toLocaleDateString('fr-TN')}`,
  }
}

export default async function AbrogationDetailPage({ params }: Props) {
  const { id } = await params
  const abrogation = await getAbrogation(id)

  if (!abrogation) {
    notFound()
  }

  const scopeConfig = {
    total: {
      label: 'Abrogation Totale',
      description: 'La loi entière a été abrogée',
      color: 'bg-red-100 text-red-800 border-red-300',
      icon: '🚫',
    },
    partial: {
      label: 'Abrogation Partielle',
      description: 'Certains articles ont été abrogés',
      color: 'bg-orange-100 text-orange-800 border-orange-300',
      icon: '⚠️',
    },
    implicit: {
      label: 'Abrogation Implicite',
      description: "Abrogation par contradiction avec une nouvelle loi",
      color: 'bg-yellow-100 text-yellow-800 border-yellow-300',
      icon: '💡',
    },
  }

  const confidenceConfig = {
    high: { label: 'Haute Confiance', icon: CheckCircle2, color: 'text-green-600' },
    medium: { label: 'Confiance Moyenne', icon: AlertCircle, color: 'text-yellow-600' },
    low: { label: 'Faible Confiance', icon: AlertCircle, color: 'text-red-600' },
  }

  const statusConfig = {
    verified: { label: 'Vérifiée', icon: CheckCircle2, color: 'text-green-600' },
    pending: { label: 'En Attente', icon: Clock, color: 'text-yellow-600' },
    disputed: { label: 'Contestée', icon: AlertCircle, color: 'text-red-600' },
  }

  const scope = scopeConfig[abrogation.scope]
  const confidence = confidenceConfig[abrogation.confidence]
  const status = statusConfig[abrogation.verificationStatus]
  const ConfidenceIcon = confidence.icon
  const StatusIcon = status.icon

  const formattedDate = new Date(abrogation.abrogationDate).toLocaleDateString('fr-TN', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

  return (
    <div className="container mx-auto py-8 space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/legal/abrogations" className="hover:text-foreground transition-colors">
          Abrogations
        </Link>
        <span>/</span>
        <span className="text-foreground">{abrogation.abrogatedReference}</span>
      </div>

      {/* Header */}
      <div className="space-y-4">
        <Link href="/legal/abrogations">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Retour à la liste
          </Button>
        </Link>

        <div className="space-y-2">
          <div className="flex flex-wrap items-start gap-3">
            <h1 className="text-3xl font-bold flex-1">{abrogation.abrogatedReference}</h1>
            {abrogation.domain && <DomainBadge domain={abrogation.domain} size="lg" />}
          </div>
          <p className="text-xl text-muted-foreground" dir="rtl">
            {abrogation.abrogatedReferenceAr}
          </p>
        </div>
      </div>

      {/* Type d'abrogation */}
      <Card className={`border-2 ${scope.color}`}>
        <CardHeader>
          <div className="flex items-center gap-2">
            <span className="text-2xl">{scope.icon}</span>
            <div>
              <CardTitle>{scope.label}</CardTitle>
              <CardDescription>{scope.description}</CardDescription>
            </div>
          </div>
        </CardHeader>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Informations principales */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Loi Abrogeante
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="font-semibold text-lg">{abrogation.abrogatingReference}</p>
              <p className="text-muted-foreground" dir="rtl">
                {abrogation.abrogatingReferenceAr}
              </p>
            </div>

            <Separator />

            <div className="space-y-2">
              <div className="flex items-center text-sm">
                <Calendar className="h-4 w-4 mr-2 text-muted-foreground" />
                <span className="font-medium">Date d'abrogation :</span>
              </div>
              <p className="text-lg">{formattedDate}</p>
            </div>

            {abrogation.affectedArticles && abrogation.affectedArticles.length > 0 && (
              <>
                <Separator />
                <div className="space-y-2">
                  <p className="font-medium text-sm">
                    Articles affectés ({abrogation.affectedArticles.length}) :
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {abrogation.affectedArticles.map((article, idx) => (
                      <Badge key={idx} variant="outline">
                        {article}
                      </Badge>
                    ))}
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Métadonnées */}
        <Card>
          <CardHeader>
            <CardTitle>Métadonnées</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Statut de vérification */}
            <div className="space-y-2">
              <p className="text-sm font-medium">Statut de Vérification</p>
              <div className={`flex items-center gap-2 ${status.color}`}>
                <StatusIcon className="h-4 w-4" />
                <span className="font-medium">{status.label}</span>
              </div>
            </div>

            <Separator />

            {/* Niveau de confiance */}
            <div className="space-y-2">
              <p className="text-sm font-medium">Niveau de Confiance</p>
              <div className={`flex items-center gap-2 ${confidence.color}`}>
                <ConfidenceIcon className="h-4 w-4" />
                <span className="font-medium">{confidence.label}</span>
              </div>
            </div>

            <Separator />

            {/* Dates système */}
            <div className="space-y-2 text-xs text-muted-foreground">
              {abrogation.createdAt && (
                <p>
                  Créé le :{' '}
                  {new Date(abrogation.createdAt).toLocaleDateString('fr-TN', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                  })}
                </p>
              )}
              {abrogation.updatedAt && (
                <p>
                  Mis à jour le :{' '}
                  {new Date(abrogation.updatedAt).toLocaleDateString('fr-TN', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                  })}
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Notes */}
      {abrogation.notes && (
        <Card>
          <CardHeader>
            <CardTitle>Notes et Contexte</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground whitespace-pre-wrap">{abrogation.notes}</p>
          </CardContent>
        </Card>
      )}

      {/* Sources */}
      {(abrogation.jortUrl || abrogation.sourceUrl) && (
        <Card>
          <CardHeader>
            <CardTitle>Sources et Références</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {abrogation.jortUrl && (
              <a
                href={abrogation.jortUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-primary hover:underline"
              >
                <ExternalLink className="h-4 w-4" />
                <span>Journal Officiel de la République Tunisienne (JORT)</span>
              </a>
            )}
            {abrogation.sourceUrl && (
              <a
                href={abrogation.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-primary hover:underline"
              >
                <ExternalLink className="h-4 w-4" />
                <span>Source externe : {new URL(abrogation.sourceUrl).hostname}</span>
              </a>
            )}
          </CardContent>
        </Card>
      )}

      {/* Actions */}
      <div className="flex gap-4">
        <Link href="/legal/abrogations">
          <Button variant="outline">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Retour à la liste
          </Button>
        </Link>
        <Button
          variant="outline"
          onClick={() => {
            navigator.clipboard.writeText(window.location.href)
            // TODO: Toast notification
          }}
        >
          Copier le lien
        </Button>
      </div>
    </div>
  )
}
