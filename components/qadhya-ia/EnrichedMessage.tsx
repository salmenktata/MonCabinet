'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Icons } from '@/lib/icons'
import { SourcesPanel } from '@/components/assistant-ia/SourcesPanel'
import { useToast } from '@/lib/hooks/use-toast'
import { createDossierFromStructure } from '@/app/actions/create-dossier-from-structure'
import type { ChatMessage, ChatSource } from '@/components/assistant-ia/ChatMessages'

interface EnrichedMessageProps {
  message: ChatMessage
}

export function EnrichedMessage({ message }: EnrichedMessageProps) {
  const router = useRouter()
  const t = useTranslations('qadhyaIA.enriched')

  // Détection du type de message via metadata
  const messageType = (message as any).metadata?.actionType || 'chat'

  // Render selon le type
  switch (messageType) {
    case 'structure':
      return <StructuredDossierMessage message={message} />
    case 'consult':
      return <ConsultationMessage message={message} />
    default:
      return <ChatMessage message={message} />
  }
}

// Message de conversation normale
function ChatMessage({ message }: { message: ChatMessage }) {
  return (
    <div className="prose prose-sm max-w-none dark:prose-invert">
      <p className="whitespace-pre-wrap">{message.content}</p>
      {message.sources && message.sources.length > 0 && (
        <div className="mt-3">
          <SourcesPanel sources={message.sources} />
        </div>
      )}
    </div>
  )
}

// Message dossier structuré
function StructuredDossierMessage({ message }: { message: ChatMessage }) {
  const router = useRouter()
  const { toast } = useToast()
  const t = useTranslations('qadhyaIA.enriched.structure')
  const [isCreating, setIsCreating] = useState(false)

  // Parser le contenu JSON
  const structured = useMemo(() => {
    try {
      return JSON.parse(message.content)
    } catch {
      return null
    }
  }, [message.content])

  if (!structured) {
    return (
      <div className="text-destructive text-sm">
        {t('parseError')}
      </div>
    )
  }

  const handleCreateDossier = async () => {
    setIsCreating(true)
    try {
      const result = await createDossierFromStructure(structured)

      if (result.success && result.dossierId) {
        toast({
          title: t('success'),
          description: t('dossierCreated'),
        })
        router.push(`/dossiers/${result.dossierId}`)
      } else {
        toast({
          title: t('error'),
          description: result.error || t('createError'),
          variant: 'destructive',
        })
      }
    } catch (error) {
      toast({
        title: t('error'),
        description: t('createError'),
        variant: 'destructive',
      })
    } finally {
      setIsCreating(false)
    }
  }

  return (
    <Card className="p-6">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Icons.edit className="h-5 w-5" />
            {t('title')}
          </h3>
          <p className="text-sm text-muted-foreground mt-1">
            {structured.objet || t('noTitle')}
          </p>
        </div>
        {structured.categorie && (
          <Badge variant="secondary">{structured.categorie}</Badge>
        )}
      </div>

      <div className="space-y-4">
        {/* Parties */}
        {structured.parties && (
          <div>
            <h4 className="font-medium mb-2 text-sm">{t('parties')}</h4>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs font-medium text-muted-foreground">
                  {t('demandeur')}
                </p>
                <p className="text-sm">{structured.parties.demandeur || '-'}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground">
                  {t('defendeur')}
                </p>
                <p className="text-sm">{structured.parties.defendeur || '-'}</p>
              </div>
            </div>
          </div>
        )}

        {/* Faits */}
        {structured.faits && (
          <div>
            <h4 className="font-medium mb-2 text-sm">{t('faits')}</h4>
            <p className="text-sm text-muted-foreground">{structured.faits}</p>
          </div>
        )}

        {/* Procédure */}
        {structured.procedure && (
          <div>
            <h4 className="font-medium mb-2 text-sm">{t('procedure')}</h4>
            <p className="text-sm text-muted-foreground">{structured.procedure}</p>
          </div>
        )}

        {/* Prétentions */}
        {structured.pretentions && Array.isArray(structured.pretentions) && (
          <div>
            <h4 className="font-medium mb-2 text-sm">{t('pretentions')}</h4>
            <ul className="list-disc list-inside space-y-1">
              {structured.pretentions.map((p: string, i: number) => (
                <li key={i} className="text-sm text-muted-foreground">
                  {p}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex gap-2 mt-6 pt-4 border-t">
        <Button onClick={handleCreateDossier} className="flex-1" disabled={isCreating}>
          {isCreating ? (
            <>
              <Icons.loader className="mr-2 h-4 w-4 animate-spin" />
              {t('creating')}
            </>
          ) : (
            <>
              <Icons.check className="mr-2 h-4 w-4" />
              {t('createDossier')}
            </>
          )}
        </Button>
        <Button variant="outline" disabled={isCreating}>
          <Icons.edit className="mr-2 h-4 w-4" />
          {t('edit')}
        </Button>
      </div>
    </Card>
  )
}

// Message consultation juridique
function ConsultationMessage({ message }: { message: ChatMessage }) {
  const t = useTranslations('qadhyaIA.enriched.consult')

  // Parser le contenu (format IRAC ou texte simple)
  const consultation = useMemo(() => {
    try {
      const parsed = JSON.parse(message.content)
      return parsed
    } catch {
      // Si ce n'est pas du JSON, on considère que c'est du texte simple
      return { conseil: message.content }
    }
  }, [message.content])

  // Extraire les actions recommandées du texte markdown
  const actions = useMemo(() => {
    if (consultation.actions) return consultation.actions

    // Tenter d'extraire depuis le texte markdown
    const match = consultation.conseil?.match(/## Actions Recommandées\s*\n([\s\S]+?)(?:\n##|$)/i)
    if (match) {
      const actionsText = match[1]
      return actionsText
        .split('\n')
        .filter((line: string) => line.trim().match(/^\d+\./))
        .map((line: string) => line.replace(/^\d+\.\s*/, '').trim())
    }
    return []
  }, [consultation])

  return (
    <Card className="p-6">
      <div className="flex items-start gap-3 mb-4">
        <Icons.scale className="h-5 w-5 text-primary mt-1" />
        <div>
          <h3 className="text-lg font-semibold">{t('title')}</h3>
          <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
        </div>
      </div>

      <div className="space-y-4">
        {/* Problématique */}
        {consultation.problematique && (
          <div>
            <h4 className="font-medium mb-2 text-sm">{t('problematique')}</h4>
            <p className="text-sm text-muted-foreground">
              {consultation.problematique}
            </p>
          </div>
        )}

        {/* Règles */}
        {consultation.regles && (
          <div>
            <h4 className="font-medium mb-2 text-sm">{t('regles')}</h4>
            <p className="text-sm text-muted-foreground">{consultation.regles}</p>
          </div>
        )}

        {/* Analyse */}
        {consultation.analyse && (
          <div>
            <h4 className="font-medium mb-2 text-sm">{t('analyse')}</h4>
            <p className="text-sm text-muted-foreground">{consultation.analyse}</p>
          </div>
        )}

        {/* Conclusion */}
        {consultation.conclusion && (
          <div>
            <h4 className="font-medium mb-2 text-sm">{t('conclusion')}</h4>
            <p className="text-sm font-medium">{consultation.conclusion}</p>
          </div>
        )}

        {/* Conseil simple (si pas de structure IRAC) */}
        {!consultation.problematique && consultation.conseil && (
          <div className="prose prose-sm max-w-none dark:prose-invert">
            <div dangerouslySetInnerHTML={{ __html: consultation.conseil }} />
          </div>
        )}

        {/* Actions recommandées */}
        {actions.length > 0 && (
          <div>
            <h4 className="font-medium mb-2 text-sm">{t('actions')}</h4>
            <ul className="space-y-2">
              {actions.map((action: string, i: number) => (
                <li key={i} className="flex items-start gap-2">
                  <Icons.check className="h-4 w-4 text-green-600 mt-0.5 shrink-0" />
                  <span className="text-sm text-muted-foreground">{action}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Sources KB */}
        {message.sources && message.sources.length > 0 && (
          <div className="pt-4 border-t">
            <SourcesPanel sources={message.sources} />
          </div>
        )}
      </div>
    </Card>
  )
}
