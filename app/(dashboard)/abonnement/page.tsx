import { getSession } from '@/lib/auth/session'
import { redirect } from 'next/navigation'
import { query } from '@/lib/db/postgres'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Icons } from '@/lib/icons'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

const PLAN_CONFIG = {
  trial: {
    label: 'Essai gratuit',
    color: 'text-emerald-500',
    bg: 'bg-emerald-500/10 border-emerald-500/20',
    badge: 'bg-emerald-500/20 text-emerald-400',
    features: ['30 requêtes IA (total)', '10 dossiers', '20 clients', '500 Mo stockage', 'Support email'],
  },
  pro: {
    label: 'Pro',
    color: 'text-blue-500',
    bg: 'bg-blue-500/10 border-blue-500/20',
    badge: 'bg-blue-500/20 text-blue-400',
    features: ['200 requêtes IA/mois', 'Dossiers illimités', 'Clients illimités', '10 Go stockage', 'Support email + chat'],
  },
  enterprise: {
    label: 'Expert',
    color: 'text-purple-500',
    bg: 'bg-purple-500/10 border-purple-500/20',
    badge: 'bg-purple-500/20 text-purple-400',
    features: ['IA illimitée', 'Dossiers illimités', 'Clients illimités', 'Stockage illimité', 'Support prioritaire'],
  },
  expired_trial: {
    label: 'Essai expiré',
    color: 'text-red-500',
    bg: 'bg-red-500/10 border-red-500/20',
    badge: 'bg-red-500/20 text-red-400',
    features: [],
  },
  free: {
    label: 'Gratuit (legacy)',
    color: 'text-slate-400',
    bg: 'bg-slate-700/50 border-slate-600',
    badge: 'bg-slate-600 text-slate-300',
    features: ['5 requêtes IA/mois'],
  },
}

export default async function AbonnementPage() {
  const session = await getSession()
  if (!session?.user?.id) redirect('/login')

  const result = await query(
    `SELECT
       u.id, u.email, u.nom, u.prenom, u.plan, u.plan_expires_at,
       u.trial_started_at, u.trial_ai_uses_remaining,
       u.upgrade_requested_plan, u.upgrade_requested_at, u.upgrade_request_note,
       u.ai_uses_this_month, u.ai_uses_reset_at,
       (SELECT COUNT(*) FROM dossiers WHERE user_id = u.id) AS dossier_count,
       (SELECT COUNT(*) FROM clients WHERE user_id = u.id) AS client_count
     FROM users u
     WHERE u.id = $1`,
    [session.user.id]
  )

  const user = result.rows[0]
  if (!user) redirect('/login')

  const plan = user.plan as keyof typeof PLAN_CONFIG
  const config = PLAN_CONFIG[plan] ?? PLAN_CONFIG.free

  const dossierCount = parseInt(user.dossier_count || 0)
  const clientCount = parseInt(user.client_count || 0)
  const aiUsesRemaining = user.trial_ai_uses_remaining ?? 30
  const aiUsesThisMonth = parseInt(user.ai_uses_this_month || 0)

  const maxDossiers = plan === 'trial' ? 10 : null
  const maxClients = plan === 'trial' ? 20 : null
  const maxAiUses = plan === 'trial' ? 30 : plan === 'pro' ? 200 : null

  const daysUntilExpiry = user.plan_expires_at
    ? Math.ceil((new Date(user.plan_expires_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    : null

  const showCTA = plan === 'trial' || plan === 'expired_trial' || plan === 'free'
  const showUpgrade = plan === 'pro'

  return (
    <div className="max-w-3xl mx-auto space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold">Mon abonnement</h1>
        <p className="text-muted-foreground">Votre plan actuel et vos compteurs d'utilisation</p>
      </div>

      {/* Plan actuel */}
      <Card className={`border ${config.bg}`}>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Icons.creditCard className={`h-5 w-5 ${config.color}`} />
              <CardTitle className="text-lg">Plan actuel</CardTitle>
            </div>
            <Badge className={config.badge}>{config.label}</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {config.features.length > 0 && (
            <ul className="space-y-2">
              {config.features.map((f) => (
                <li key={f} className="flex items-center gap-2 text-sm">
                  <Icons.check className="h-4 w-4 text-emerald-500 shrink-0" />
                  <span>{f}</span>
                </li>
              ))}
            </ul>
          )}

          {user.plan_expires_at && (
            <div className={`flex items-center gap-2 text-sm p-3 rounded-lg ${
              daysUntilExpiry !== null && daysUntilExpiry <= 7
                ? 'bg-red-500/10 text-red-400'
                : daysUntilExpiry !== null && daysUntilExpiry <= 30
                  ? 'bg-yellow-500/10 text-yellow-400'
                  : 'bg-slate-700/50 text-slate-400'
            }`}>
              <Icons.clock className="h-4 w-4 shrink-0" />
              <span>
                {daysUntilExpiry !== null && daysUntilExpiry > 0
                  ? `Expire le ${new Date(user.plan_expires_at).toLocaleDateString('fr-FR')} (dans ${daysUntilExpiry} jour${daysUntilExpiry > 1 ? 's' : ''})`
                  : `Expiré le ${new Date(user.plan_expires_at).toLocaleDateString('fr-FR')}`
                }
              </span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Compteurs d'utilisation */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Utilisation</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* IA */}
          {plan === 'trial' && (
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-muted-foreground">Requêtes IA (total)</span>
                <span className="font-medium">{30 - aiUsesRemaining} / 30</span>
              </div>
              <div className="w-full bg-muted rounded-full h-2">
                <div
                  className="h-2 rounded-full bg-emerald-500 transition-all"
                  style={{ width: `${Math.min(((30 - aiUsesRemaining) / 30) * 100, 100)}%` }}
                />
              </div>
            </div>
          )}

          {plan === 'pro' && (
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-muted-foreground">Requêtes IA ce mois</span>
                <span className="font-medium">{aiUsesThisMonth} / 200</span>
              </div>
              <div className="w-full bg-muted rounded-full h-2">
                <div
                  className="h-2 rounded-full bg-blue-500 transition-all"
                  style={{ width: `${Math.min((aiUsesThisMonth / 200) * 100, 100)}%` }}
                />
              </div>
            </div>
          )}

          {plan === 'enterprise' && (
            <div className="flex items-center gap-2 text-sm text-emerald-500">
              <Icons.check className="h-4 w-4" />
              <span>IA illimitée</span>
            </div>
          )}

          {/* Dossiers */}
          <div>
            <div className="flex justify-between text-sm mb-1">
              <span className="text-muted-foreground">Dossiers</span>
              <span className="font-medium">
                {dossierCount}{maxDossiers !== null ? ` / ${maxDossiers}` : ''}
              </span>
            </div>
            {maxDossiers !== null && (
              <div className="w-full bg-muted rounded-full h-2">
                <div
                  className={`h-2 rounded-full transition-all ${dossierCount >= maxDossiers ? 'bg-red-500' : 'bg-blue-500'}`}
                  style={{ width: `${Math.min((dossierCount / maxDossiers) * 100, 100)}%` }}
                />
              </div>
            )}
          </div>

          {/* Clients */}
          <div>
            <div className="flex justify-between text-sm mb-1">
              <span className="text-muted-foreground">Clients</span>
              <span className="font-medium">
                {clientCount}{maxClients !== null ? ` / ${maxClients}` : ''}
              </span>
            </div>
            {maxClients !== null && (
              <div className="w-full bg-muted rounded-full h-2">
                <div
                  className={`h-2 rounded-full transition-all ${clientCount >= maxClients ? 'bg-red-500' : 'bg-blue-500'}`}
                  style={{ width: `${Math.min((clientCount / maxClients) * 100, 100)}%` }}
                />
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Historique demandes */}
      {user.upgrade_requested_plan && (
        <Card className="border-orange-500/30 bg-orange-500/5">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Icons.clock className="h-4 w-4 text-orange-400" />
              <CardTitle className="text-base text-orange-400">Demande d'upgrade en attente</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>
              Plan demandé : <strong>{user.upgrade_requested_plan === 'solo' ? 'Pro — 89 DT/mois' : 'Expert — 229 DT/mois'}</strong>
            </p>
            {user.upgrade_requested_at && (
              <p className="text-muted-foreground">
                Envoyée le {new Date(user.upgrade_requested_at).toLocaleDateString('fr-FR')}
              </p>
            )}
            {user.upgrade_request_note && (
              <p className="text-muted-foreground italic">Note : {user.upgrade_request_note}</p>
            )}
          </CardContent>
        </Card>
      )}

      {/* CTA */}
      {showCTA && !user.upgrade_requested_plan && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Passer à un plan payant</CardTitle>
            <CardDescription>Accédez à toutes les fonctionnalités sans limitation</CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/upgrade">
              <Button className="w-full">
                <Icons.arrowUp className="h-4 w-4 mr-2" />
                Voir les plans Pro et Expert
              </Button>
            </Link>
          </CardContent>
        </Card>
      )}

      {showUpgrade && !user.upgrade_requested_plan && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Passer à Expert</CardTitle>
            <CardDescription>IA illimitée, stockage illimité, support prioritaire</CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/upgrade">
              <Button variant="outline" className="w-full">
                <Icons.arrowUp className="h-4 w-4 mr-2" />
                Voir le plan Expert — 229 DT/mois
              </Button>
            </Link>
          </CardContent>
        </Card>
      )}

      {plan === 'enterprise' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Support prioritaire</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-3">
              En tant qu'abonné Expert, vous bénéficiez d'un support prioritaire.
            </p>
            <a href="mailto:support@qadhya.tn">
              <Button variant="outline" className="w-full">
                <Icons.mail className="h-4 w-4 mr-2" />
                Contacter le support
              </Button>
            </a>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
