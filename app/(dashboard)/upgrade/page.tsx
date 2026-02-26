import { getSession } from '@/lib/auth/session'
import { redirect } from 'next/navigation'
import { query } from '@/lib/db/postgres'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

export const dynamic = 'force-dynamic'

interface PlanCardProps {
  name: string
  price: string
  priceNote: string
  description: string
  features: { text: string; included: boolean }[]
  cta: string
  ctaHref: string
  highlighted?: boolean
  badge?: string
}

function PlanCard({ name, price, priceNote, description, features, cta, ctaHref, highlighted, badge }: PlanCardProps) {
  return (
    <div className={`relative rounded-2xl p-8 flex flex-col border ${
      highlighted
        ? 'bg-blue-900/20 border-blue-500/50 ring-2 ring-blue-500'
        : 'bg-slate-800/50 border-slate-700'
    }`}>
      {badge && (
        <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-blue-600 text-white text-xs font-bold px-4 py-1 rounded-full whitespace-nowrap">
          {badge}
        </div>
      )}
      <div className="mb-6">
        <h3 className="text-xl font-bold text-white">{name}</h3>
        <p className="text-sm text-slate-400 mt-1">{description}</p>
      </div>

      <div className="mb-6">
        <div className="flex items-baseline gap-1">
          <span className="text-4xl font-bold text-white">{price}</span>
          <span className="text-slate-400 text-sm">{priceNote}</span>
        </div>
      </div>

      <ul className="space-y-3 mb-8 flex-1">
        {features.map((f, i) => (
          <li key={i} className={`flex items-start gap-2 text-sm ${f.included ? 'text-slate-200' : 'text-slate-500'}`}>
            {f.included ? (
              <svg className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            ) : (
              <svg className="w-5 h-5 text-slate-600 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            )}
            <span>{f.text}</span>
          </li>
        ))}
      </ul>

      <Link
        href={ctaHref}
        className={`text-center py-3 px-6 rounded-xl font-semibold transition-all ${
          highlighted
            ? 'bg-blue-600 hover:bg-blue-500 text-white'
            : 'bg-slate-700 hover:bg-slate-600 text-white border border-slate-600'
        }`}
      >
        {cta}
      </Link>
    </div>
  )
}

export default async function UpgradePage() {
  const session = await getSession()
  if (!session?.user?.id) redirect('/login')

  // Récupérer les infos du plan actuel
  const result = await query(
    `SELECT plan, trial_ai_uses_remaining, trial_started_at,
     EXTRACT(DAY FROM (trial_started_at + INTERVAL '14 days' - NOW())) AS trial_days_remaining
     FROM users WHERE id = $1`,
    [session.user.id]
  )
  const user = result.rows[0]
  const plan = user?.plan || 'free'
  const trialDaysLeft = Math.max(0, Math.ceil(user?.trial_days_remaining || 0))
  const trialUsesLeft = user?.trial_ai_uses_remaining ?? 0
  const isExpired = plan === 'expired_trial' || (plan === 'trial' && trialDaysLeft === 0)
  const isPaid = plan === 'pro' || plan === 'enterprise'

  // Si déjà sur un plan payant, rediriger vers le profil
  if (isPaid) redirect('/dashboard')

  const soloFeatures = [
    { text: 'Dossiers illimités', included: true },
    { text: 'Clients illimités', included: true },
    { text: '200 requêtes IA / mois', included: true },
    { text: 'Chat IA juridique', included: true },
    { text: 'Structuration automatique', included: true },
    { text: 'Templates documents', included: true },
    { text: 'Facturation complète', included: true },
    { text: '10 Go de stockage', included: true },
    { text: 'Support Email + Chat', included: true },
    { text: 'Jusqu\'à 10 utilisateurs', included: false },
    { text: 'SLA garanti', included: false },
  ]

  const cabinetFeatures = [
    { text: 'Dossiers illimités', included: true },
    { text: 'Clients illimités', included: true },
    { text: 'IA illimitée', included: true },
    { text: 'Jusqu\'à 10 utilisateurs', included: true },
    { text: 'Rôles et permissions', included: true },
    { text: 'Stockage illimité', included: true },
    { text: 'Support prioritaire dédié', included: true },
    { text: 'SLA garanti', included: true },
    { text: 'Formation incluse', included: true },
  ]

  return (
    <div className="max-w-5xl mx-auto py-8 px-4 space-y-8">
      {/* Header */}
      <div className="text-center">
        {isExpired ? (
          <>
            <Badge className="bg-red-500/20 text-red-400 mb-4">Essai terminé</Badge>
            <h1 className="text-3xl font-bold text-white mb-3">
              Votre essai gratuit est terminé
            </h1>
            <p className="text-slate-400 max-w-lg mx-auto">
              Vous avez profité de toutes les fonctionnalités Qadhya. Choisissez un plan pour continuer.
            </p>
          </>
        ) : (
          <>
            <Badge className="bg-emerald-500/20 text-emerald-400 mb-4">
              Essai en cours — {trialDaysLeft}j restants • {trialUsesLeft}/30 requêtes IA
            </Badge>
            <h1 className="text-3xl font-bold text-white mb-3">
              Passez à la vitesse supérieure
            </h1>
            <p className="text-slate-400 max-w-lg mx-auto">
              Continuez sans interruption avec un accès IA illimité et toutes les fonctionnalités avancées.
            </p>
          </>
        )}
      </div>

      {/* Plans */}
      <div className="grid md:grid-cols-2 gap-8 mt-8">
        <PlanCard
          name="Solo"
          price="89 DT"
          priceNote="/mois (ou 71 DT/mois en annuel)"
          description="Pour l'avocat indépendant qui veut tout optimiser"
          features={soloFeatures}
          cta="Choisir Solo"
          ctaHref="/contact?plan=solo"
          highlighted
          badge="Le plus populaire"
        />
        <PlanCard
          name="Cabinet"
          price="229 DT"
          priceNote="/mois (ou 183 DT/mois en annuel)"
          description="Pour les cabinets multi-associés avec besoin d'IA intensive"
          features={cabinetFeatures}
          cta="Contacter l'équipe"
          ctaHref="/contact?plan=cabinet"
        />
      </div>

      {/* Garanties */}
      <Card className="bg-slate-800/50 border-slate-700">
        <CardContent className="pt-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
            {[
              { icon: '🔒', label: 'Données hébergées en Tunisie', sub: 'Sécurité SSL' },
              { icon: '🚀', label: 'Activation immédiate', sub: 'Pas d\'attente' },
              { icon: '❌', label: 'Sans engagement', sub: 'Annulation à tout moment' },
              { icon: '🏛️', label: 'Conforme Barreau', sub: 'Calculs légaux tunisiens' },
            ].map((g, i) => (
              <div key={i} className="text-center">
                <div className="text-2xl mb-1">{g.icon}</div>
                <p className="text-white text-sm font-medium">{g.label}</p>
                <p className="text-slate-400 text-xs">{g.sub}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* FAQ rapide */}
      <Card className="bg-slate-800/50 border-slate-700">
        <CardHeader>
          <CardTitle className="text-white text-lg">Questions fréquentes</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {[
            {
              q: 'Comment activer mon abonnement ?',
              a: 'Contactez notre équipe via le formulaire de contact. L\'activation est manuelle pour le moment — nous traitons chaque demande sous 24h.',
            },
            {
              q: 'Mes données d\'essai sont-elles conservées ?',
              a: 'Oui. Tous vos dossiers, clients et documents créés pendant l\'essai sont conservés et accessibles dès l\'activation de votre plan.',
            },
            {
              q: 'Puis-je passer du Solo au Cabinet plus tard ?',
              a: 'Oui, vous pouvez changer de plan à tout moment. Le changement prend effet immédiatement.',
            },
          ].map((faq, i) => (
            <div key={i} className="border-b border-slate-700 pb-4 last:border-0 last:pb-0">
              <p className="text-white text-sm font-medium mb-1">{faq.q}</p>
              <p className="text-slate-400 text-sm">{faq.a}</p>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}
