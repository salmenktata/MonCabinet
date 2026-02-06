'use client'

/**
 * Widget Dashboard : Statut Messages WhatsApp
 *
 * Affiche:
 * - Nombre messages reçus (7 jours)
 * - Documents en attente de rattachement
 * - Taux rattachement automatique
 * - Derniers messages
 *
 * NOTE: Fonctionnalité WhatsApp à implémenter
 */

import { useEffect, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { MessageSquare, Clock, CheckCircle2, AlertCircle, ArrowRight, Settings } from 'lucide-react'
import Link from 'next/link'
import { formatDistanceToNow } from 'date-fns'
import { fr } from 'date-fns/locale'
import { getWhatsAppStatsAction, getWhatsAppPendingDocsAction } from '@/app/actions/messaging'

interface WhatsAppStats {
  total_messages: number
  media_messages: number
  documents_created: number
  unknown_clients: number
  errors: number
  last_message_at: string | null
}

interface PendingDocument {
  id: string
  file_name: string
  sender_phone: string
  sender_name: string | null
  created_at: string
  client_id: string | null
  client_nom: string | null
  client_prenom: string | null
}

export function WhatsAppStatusWidget() {
  const [stats, setStats] = useState<WhatsAppStats | null>(null)
  const [pendingDocs, setPendingDocs] = useState<PendingDocument[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    try {
      // Récupérer stats et documents en parallèle
      const [statsResult, docsResult] = await Promise.all([
        getWhatsAppStatsAction(),
        getWhatsAppPendingDocsAction()
      ])

      if (statsResult.data) {
        setStats(statsResult.data)
      }

      if (docsResult.data) {
        setPendingDocs(docsResult.data)
      }
    } catch (error) {
      console.error('Erreur chargement stats WhatsApp:', error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5" />
            Messages WhatsApp
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse space-y-4">
            <div className="h-4 bg-gray-200 rounded w-3/4"></div>
            <div className="h-4 bg-gray-200 rounded w-1/2"></div>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (!stats || stats.total_messages === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5" />
            Messages WhatsApp
          </CardTitle>
          <CardDescription>
            Intégration WhatsApp Business à configurer
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-6 text-center">
            <Settings className="h-12 w-12 text-muted-foreground/50 mb-3" />
            <p className="text-sm text-muted-foreground mb-4">
              Connectez votre compte WhatsApp Business pour recevoir et traiter automatiquement les documents de vos clients.
            </p>
            <Link href="/parametres/messagerie">
              <Button size="sm">
                Configurer WhatsApp
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    )
  }

  const autoAttachRate = stats.total_messages > 0
    ? Math.round((stats.documents_created / stats.total_messages) * 100)
    : 0

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MessageSquare className="h-5 w-5" />
          Messages WhatsApp
        </CardTitle>
        <CardDescription>
          {stats.last_message_at
            ? `Dernier message: ${formatDistanceToNow(new Date(stats.last_message_at), {
                addSuffix: true,
                locale: fr,
              })}`
            : 'Aucun message reçu'}
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Statistiques principales */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <p className="text-2xl font-bold">{stats.total_messages}</p>
            <p className="text-sm text-muted-foreground">Messages reçus (30j)</p>
          </div>

          <div className="space-y-1">
            <p className="text-2xl font-bold">{stats.media_messages}</p>
            <p className="text-sm text-muted-foreground">Documents reçus</p>
          </div>

          <div className="space-y-1">
            <p className="text-2xl font-bold text-green-600">{autoAttachRate}%</p>
            <p className="text-sm text-muted-foreground">Rattachement auto</p>
          </div>

          <div className="space-y-1">
            <p className="text-2xl font-bold text-orange-600">{pendingDocs.length}</p>
            <p className="text-sm text-muted-foreground">En attente</p>
          </div>
        </div>

        {/* Alertes */}
        {stats.unknown_clients > 0 && (
          <div className="flex items-start gap-2 p-3 bg-orange-50 border border-orange-200 rounded-lg">
            <AlertCircle className="h-5 w-5 text-orange-600 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-medium text-orange-900">
                {stats.unknown_clients} message(s) de numéros inconnus
              </p>
              <p className="text-xs text-orange-700 mt-1">
                Créez les clients correspondants pour activer le rattachement automatique
              </p>
            </div>
          </div>
        )}

        {stats.errors > 0 && (
          <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
            <AlertCircle className="h-5 w-5 text-red-600 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-medium text-red-900">
                {stats.errors} erreur(s) de traitement
              </p>
              <p className="text-xs text-red-700 mt-1">
                Vérifiez les logs pour plus de détails
              </p>
            </div>
          </div>
        )}

        {/* Documents en attente */}
        {pendingDocs.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-medium flex items-center gap-2">
                <Clock className="h-4 w-4" />
                Documents en attente
              </h4>
              <Link href="/dashboard/documents/pending">
                <Button variant="ghost" size="sm">
                  Tout voir
                  <ArrowRight className="h-4 w-4 ml-1" />
                </Button>
              </Link>
            </div>

            <div className="space-y-2">
              {pendingDocs.map((doc) => (
                <div
                  key={doc.id}
                  className="flex items-center justify-between p-2 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{doc.file_name}</p>
                    <p className="text-xs text-muted-foreground">
                      {doc.client_id && doc.client_nom
                        ? `${doc.client_prenom} ${doc.client_nom}`
                        : doc.sender_name || doc.sender_phone}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(doc.created_at), {
                        addSuffix: true,
                        locale: fr,
                      })}
                    </p>
                  </div>

                  <Badge variant="outline" className="ml-2">
                    {doc.client_id ? 'Rattacher' : 'Numéro inconnu'}
                  </Badge>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Message si tout est OK */}
        {pendingDocs.length === 0 && stats.total_messages > 0 && (
          <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg">
            <CheckCircle2 className="h-5 w-5 text-green-600" />
            <p className="text-sm text-green-900">
              Tous les documents sont traités !
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
