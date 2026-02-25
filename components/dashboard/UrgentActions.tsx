import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Icons } from '@/lib/icons'
import { cn } from '@/lib/utils'

interface Echeance {
  id: string
  titre: string
  date_echeance: string
  priorite?: 'URGENT' | 'NORMAL' | 'FAIBLE'
  dossier?: {
    numero: string
    objet: string
  }
}

interface UrgentActionsProps {
  echeances: Echeance[]
}

export function UrgentActions({ echeances }: UrgentActionsProps) {
  const t = useTranslations('dashboard')
  const tUrgent = useTranslations('urgentActions')

  const getJoursRestants = (dateEcheance: string) => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const echeance = new Date(dateEcheance)
    echeance.setHours(0, 0, 0, 0)
    const diffTime = echeance.getTime() - today.getTime()
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24))
  }

  const echeancesUrgentes = echeances
    .sort((a, b) => new Date(a.date_echeance).getTime() - new Date(b.date_echeance).getTime())
    .slice(0, 8)

  const getDelaiText = (jours: number) => {
    if (jours < 0) return tUrgent('overdue')
    if (jours === 0) return tUrgent('today')
    if (jours === 1) return tUrgent('tomorrow')
    return tUrgent('inDays', { days: jours })
  }

  const getUrgencyStyle = (jours: number) => {
    if (jours < 0) return { border: 'border-l-red-500', badge: 'destructive' as const, dot: 'bg-red-500' }
    if (jours === 0) return { border: 'border-l-red-500', badge: 'destructive' as const, dot: 'bg-red-500' }
    if (jours <= 3) return { border: 'border-l-orange-500', badge: 'warning' as const, dot: 'bg-orange-500' }
    return { border: 'border-l-muted-foreground/30', badge: 'secondary' as const, dot: 'bg-muted-foreground/50' }
  }

  return (
    <div className="rounded-xl border bg-card/50 backdrop-blur-sm flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/50">
        <div className="flex items-center gap-2">
          <Icons.alertCircle className="h-4 w-4 text-orange-500" />
          <h3 className="text-sm font-semibold">{tUrgent('title')}</h3>
        </div>
        <Button variant="ghost" size="sm" className="h-7 text-xs" asChild>
          <Link href="/echeances">
            {tUrgent('viewAll')}
            <Icons.arrowRight className="ms-1.5 h-3 w-3" />
          </Link>
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto max-h-[340px]">
        {echeancesUrgentes.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center px-4">
            <Icons.checkCircle className="h-10 w-10 text-green-500 mb-2" />
            <p className="text-sm text-muted-foreground">{tUrgent('noUrgentDeadlines')}</p>
          </div>
        ) : (
          <div className="divide-y divide-border/30">
            {echeancesUrgentes.map((echeance) => {
              const joursRestants = getJoursRestants(echeance.date_echeance)
              const urgency = getUrgencyStyle(joursRestants)
              return (
                <Link
                  key={echeance.id}
                  href="/echeances"
                  className={cn(
                    'flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-accent/50',
                    'border-l-2',
                    urgency.border
                  )}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{echeance.titre}</p>
                    {echeance.dossier && (
                      <p className="text-xs text-muted-foreground truncate mt-0.5">
                        {tUrgent('dossierReference', {
                          number: echeance.dossier.numero,
                          object: echeance.dossier.objet,
                        })}
                      </p>
                    )}
                  </div>
                  <Badge
                    variant={urgency.badge as any}
                    className="shrink-0 text-xs h-5 px-1.5"
                  >
                    {getDelaiText(joursRestants)}
                  </Badge>
                </Link>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
