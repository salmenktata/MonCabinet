'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Icons } from '@/lib/icons'
import { SourcesPanel } from '@/components/assistant-ia/SourcesPanel'
import { MarkdownMessage } from '@/components/assistant-ia/MarkdownMessage'
import { toast } from 'sonner'
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
      return <ChatMessageView message={message} />
  }
}

// Badge de posture stratégique (défense / attaque)
function StanceBadge({ stance, defenseLabel, attackLabel }: { stance: string | undefined; defenseLabel: string; attackLabel: string }) {
  if (!stance || stance === 'neutral') return null
  if (stance === 'defense') {
    return (
      <Badge variant="outline" className="text-[10px] gap-1 text-blue-600 border-blue-200 dark:text-blue-300 dark:border-blue-700">
        <Icons.shield className="h-2.5 w-2.5" /> {defenseLabel}
      </Badge>
    )
  }
  if (stance === 'attack') {
    return (
      <Badge variant="outline" className="text-[10px] gap-1 text-red-600 border-red-200 dark:text-red-300 dark:border-red-700">
        <Icons.target className="h-2.5 w-2.5" /> {attackLabel}
      </Badge>
    )
  }
  return null
}

// Message de conversation normale - utilise MarkdownMessage pour le rendu
function ChatMessageView({ message }: { message: ChatMessage }) {
  const t = useTranslations('qadhyaIA.stance')
  const stance = (message as any).metadata?.stance as string | undefined
  return (
    <div>
      {stance && stance !== 'neutral' && (
        <div className="mb-2">
          <StanceBadge stance={stance} defenseLabel={t('defense')} attackLabel={t('attack')} />
        </div>
      )}
      <div className="text-base">
        <MarkdownMessage
          content={message.content}
          sources={message.sources}
        />
      </div>
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
        toast.success(`${t('success')} \u2014 ${t('dossierCreated')}`)
        router.push(`/dossiers/${result.dossierId}`)
      } else {
        toast.error(result.error || t('createError'))
      }
    } catch (error) {
      toast.error(t('createError'))
    } finally {
      setIsCreating(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* Header structuré */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
            <Icons.edit className="h-4 w-4 text-amber-600 dark:text-amber-400" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-foreground">{t('title')}</h3>
            <p className="text-xs text-muted-foreground">{structured.objet || t('noTitle')}</p>
          </div>
        </div>
        {structured.categorie && (
          <Badge variant="secondary" className="text-[11px]">{structured.categorie}</Badge>
        )}
      </div>

      <div className="space-y-3">
        {/* Parties */}
        {structured.parties && (
          <div className="rounded-xl bg-muted/30 p-3">
            <h4 className="font-medium mb-2 text-xs text-muted-foreground uppercase tracking-wider">{t('parties')}</h4>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                <div>
                  <p className="text-[11px] text-muted-foreground">{t('demandeur')}</p>
                  <p className="text-sm font-medium">{structured.parties.demandeur || '-'}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-red-500" />
                <div>
                  <p className="text-[11px] text-muted-foreground">{t('defendeur')}</p>
                  <p className="text-sm font-medium">{structured.parties.defendeur || '-'}</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Faits */}
        {structured.faits && (
          <div>
            <h4 className="font-medium mb-1.5 text-xs text-primary flex items-center gap-1.5">
              <span className="w-1 h-3.5 rounded-full bg-primary/60" />
              {t('faits')}
            </h4>
            <p className="text-base text-foreground/85 leading-relaxed ps-3">{structured.faits}</p>
          </div>
        )}

        {/* Procédure */}
        {structured.procedure && (
          <div>
            <h4 className="font-medium mb-1.5 text-xs text-primary flex items-center gap-1.5">
              <span className="w-1 h-3.5 rounded-full bg-primary/60" />
              {t('procedure')}
            </h4>
            <p className="text-base text-foreground/85 leading-relaxed ps-3">{structured.procedure}</p>
          </div>
        )}

        {/* Prétentions */}
        {structured.pretentions && Array.isArray(structured.pretentions) && (
          <div>
            <h4 className="font-medium mb-1.5 text-xs text-primary flex items-center gap-1.5">
              <span className="w-1 h-3.5 rounded-full bg-primary/60" />
              {t('pretentions')}
            </h4>
            <ul className="space-y-1 ps-3">
              {structured.pretentions.map((p: string, i: number) => (
                <li key={i} className="text-base text-foreground/85 flex items-start gap-2">
                  <span className="text-primary/40 text-xs mt-1">&#9656;</span>
                  {p}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex gap-2 pt-3 border-t border-border/30">
        <Button onClick={handleCreateDossier} size="sm" className="flex-1 rounded-xl" disabled={isCreating}>
          {isCreating ? (
            <>
              <Icons.loader className="mr-2 h-3.5 w-3.5 animate-spin" />
              {t('creating')}
            </>
          ) : (
            <>
              <Icons.check className="mr-2 h-3.5 w-3.5" />
              {t('createDossier')}
            </>
          )}
        </Button>
        <Button variant="outline" size="sm" className="rounded-xl" disabled={isCreating}>
          <Icons.edit className="mr-2 h-3.5 w-3.5" />
          {t('edit')}
        </Button>
      </div>
    </div>
  )
}

// Message consultation juridique
function ConsultationMessage({ message }: { message: ChatMessage }) {
  const t = useTranslations('qadhyaIA.enriched.consult')
  const stance = (message as any).metadata?.stance as string | undefined

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
    <div className="space-y-4">
      {/* Header consultation */}
      <div className="flex items-center gap-2">
        <div className="w-7 h-7 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
          <Icons.scale className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-base font-semibold text-foreground">{t('title')}</h3>
            <StanceBadge stance={stance} defenseLabel={t('defense')} attackLabel={t('attack')} />
          </div>
          <p className="text-xs text-muted-foreground">{t('subtitle')}</p>
        </div>
      </div>

      <div className="space-y-3">
        {/* Sections IRAC avec couleurs distinctes */}
        {consultation.problematique && (
          <div>
            <h4 className="font-medium mb-1.5 text-xs text-blue-600 dark:text-blue-400 flex items-center gap-1.5">
              <span className="w-1 h-3.5 rounded-full bg-blue-500" />
              {t('problematique')}
            </h4>
            <p className="text-base text-foreground/85 leading-relaxed ps-3">
              {consultation.problematique}
            </p>
          </div>
        )}

        {consultation.regles && (
          <div>
            <h4 className="font-medium mb-1.5 text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
              <span className="w-1 h-3.5 rounded-full bg-amber-500" />
              {t('regles')}
            </h4>
            <p className="text-base text-foreground/85 leading-relaxed ps-3">{consultation.regles}</p>
          </div>
        )}

        {consultation.analyse && (
          <div>
            <h4 className="font-medium mb-1.5 text-xs text-purple-600 dark:text-purple-400 flex items-center gap-1.5">
              <span className="w-1 h-3.5 rounded-full bg-purple-500" />
              {t('analyse')}
            </h4>
            <p className="text-base text-foreground/85 leading-relaxed ps-3">{consultation.analyse}</p>
          </div>
        )}

        {consultation.conclusion && (
          <div className="rounded-xl bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-200/30 dark:border-emerald-800/30 p-3">
            <h4 className="font-medium mb-1.5 text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
              <Icons.check className="h-3.5 w-3.5" />
              {t('conclusion')}
            </h4>
            <p className="text-base font-medium text-foreground/90 leading-relaxed">{consultation.conclusion}</p>
          </div>
        )}

        {/* Conseil simple (si pas de structure IRAC) */}
        {!consultation.problematique && consultation.conseil && (
          <div className="text-base">
            <MarkdownMessage content={consultation.conseil} sources={message.sources} />
          </div>
        )}

        {/* Actions recommandées */}
        {actions.length > 0 && (
          <div className="rounded-xl bg-muted/30 p-3">
            <h4 className="font-medium mb-2 text-xs text-muted-foreground uppercase tracking-wider">{t('actions')}</h4>
            <ul className="space-y-1.5">
              {actions.map((action: string, i: number) => (
                <li key={i} className="flex items-start gap-2">
                  <div className="w-5 h-5 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center shrink-0 mt-0.5">
                    <Icons.check className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <span className="text-base text-foreground/85">{action}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Sources KB */}
        {message.sources && message.sources.length > 0 && (
          <SourcesPanel sources={message.sources} />
        )}
      </div>
    </div>
  )
}
