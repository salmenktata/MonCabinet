import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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

  // Calculer les jours restants
  const getJoursRestants = (dateEcheance: string) => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const echeance = new Date(dateEcheance)
    echeance.setHours(0, 0, 0, 0)
    const diffTime = echeance.getTime() - today.getTime()
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
    return diffDays
  }

  // Trier par date et limiter à 5
  const echeancesUrgentes = echeances
    .sort((a, b) => new Date(a.date_echeance).getTime() - new Date(b.date_echeance).getTime())
    .slice(0, 5)

  const getDelaiText = (jours: number) => {
    if (jours < 0) return tUrgent('overdue')
    if (jours === 0) return tUrgent('today')
    if (jours === 1) return tUrgent('tomorrow')
    return tUrgent('inDays', { days: jours })
  }

  const getDelaiVariant = (jours: number) => {
    if (jours < 0) return 'destructive'
    if (jours === 0) return 'destructive'
    if (jours <= 3) return 'warning'
    return 'secondary'
  }

  return (
    <Card>
      <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between space-y-2 sm:space-y-0 pb-3 sm:pb-4">
        <CardTitle className="text-lg sm:text-xl font-semibold">
          <div className="flex items-center gap-2">
            <Icons.alertCircle className="h-5 w-5 text-orange-600" />
            {tUrgent('title')}
          </div>
        </CardTitle>
        <Button variant="ghost" size="sm" asChild>
          <Link href="/echeances">
            {tUrgent('viewAll')}
            <Icons.arrowRight className="ml-2 h-4 w-4" />
          </Link>
        </Button>
      </CardHeader>
      <CardContent>
        {echeancesUrgentes.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <Icons.checkCircle className="h-12 w-12 text-green-500 mb-3" />
            <p className="text-sm text-muted-foreground">
              {tUrgent('noUrgentDeadlines')}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {echeancesUrgentes.map((echeance) => {
              const joursRestants = getJoursRestants(echeance.date_echeance)
              return (
                <Link
                  key={echeance.id}
                  href={`/echeances`}
                  className="block rounded-lg border p-3 transition-colors hover:bg-accent"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <Icons.calendar className="h-4 w-4 text-muted-foreground shrink-0" />
                        <p className="font-medium text-sm truncate">
                          {echeance.titre}
                        </p>
                      </div>
                      {echeance.dossier && (
                        <p className="text-xs text-muted-foreground truncate ml-6">
                          {tUrgent('dossierReference', {
                            number: echeance.dossier.numero,
                            object: echeance.dossier.objet
                          })}
                        </p>
                      )}
                    </div>
                    <Badge
                      variant={getDelaiVariant(joursRestants) as any}
                      className="shrink-0"
                    >
                      {getDelaiText(joursRestants)}
                    </Badge>
                  </div>
                </Link>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
