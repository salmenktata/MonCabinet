import { getSession } from '@/lib/auth/session'
import { db } from '@/lib/db/postgres'
import { redirect } from 'next/navigation'
import { Badge } from '@/components/ui/badge'
import { Icons } from '@/lib/icons'
import Link from 'next/link'
import { SendRecapButton } from './SendRecapButton'

export const dynamic = 'force-dynamic'

// ─── Queries ──────────────────────────────────────────────────────────────────

async function getRecapData(userId: string) {
  const [echeancesRes, facturesRes, dossiersRes, resumeRes] = await Promise.all([
    db.query(
      `SELECT e.id, e.titre, TO_CHAR(e.date_echeance, 'DD/MM/YYYY') AS date_echeance_fmt,
              e.date_echeance, d.numero AS dossier_numero, d.id AS dossier_id
       FROM echeances e
       LEFT JOIN dossiers d ON e.dossier_id = d.id
       WHERE e.user_id = $1
         AND e.statut = 'actif'
         AND e.terminee = false
         AND e.date_echeance BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '7 days'
       ORDER BY e.date_echeance ASC`,
      [userId]
    ),
    db.query(
      `SELECT f.id, f.numero, f.montant_ttc::float AS montant_ttc,
              TO_CHAR(f.date_emission, 'DD/MM/YYYY') AS date_emission_fmt,
              f.date_emission,
              COALESCE(
                NULLIF(TRIM(COALESCE(c.prenom,'') || ' ' || COALESCE(c.nom,'')), ''),
                c.denomination, 'Client'
              ) AS client
       FROM factures f
       LEFT JOIN clients c ON f.client_id = c.id
       WHERE f.user_id = $1
         AND f.statut IN ('envoyee', 'brouillon')
         AND f.date_emission < CURRENT_DATE - INTERVAL '14 days'
       ORDER BY f.date_emission ASC
       LIMIT 10`,
      [userId]
    ),
    db.query(
      `SELECT d.id, d.numero, d.objet, COUNT(e.id)::int AS nb_echeances_depassees
       FROM dossiers d
       JOIN echeances e ON e.dossier_id = d.id
       WHERE d.user_id = $1
         AND d.statut = 'en_cours'
         AND e.statut = 'actif'
         AND e.terminee = false
         AND e.date_echeance < CURRENT_DATE
       GROUP BY d.id, d.numero, d.objet
       HAVING COUNT(e.id) > 0
       ORDER BY nb_echeances_depassees DESC
       LIMIT 10`,
      [userId]
    ),
    db.query(
      `SELECT
         (SELECT COUNT(*)::int FROM clients  WHERE user_id = $1 AND created_at > NOW() - INTERVAL '7 days') AS nouveaux_clients,
         (SELECT COUNT(*)::int FROM dossiers WHERE user_id = $1 AND created_at > NOW() - INTERVAL '7 days') AS dossiers_ouverts,
         (SELECT COUNT(*)::int FROM factures WHERE user_id = $1 AND created_at > NOW() - INTERVAL '7 days') AS factures_emises,
         (SELECT COUNT(*)::int FROM echeances WHERE user_id = $1 AND terminee = true AND updated_at > NOW() - INTERVAL '7 days') AS echeances_terminees`,
      [userId]
    ),
  ])

  return {
    echeances: echeancesRes.rows,
    factures: facturesRes.rows,
    dossiers: dossiersRes.rows,
    resume: resumeRes.rows[0] ?? { nouveaux_clients: 0, dossiers_ouverts: 0, factures_emises: 0, echeances_terminees: 0 },
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getWeekRange() {
  const now = new Date()
  const lundi = new Date(now)
  lundi.setDate(now.getDate() - ((now.getDay() + 6) % 7))
  const dimanche = new Date(lundi)
  dimanche.setDate(lundi.getDate() + 6)
  const fmt = (d: Date) => d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
  return { debut: fmt(lundi), fin: fmt(dimanche) }
}

function getDaysUntil(dateStr: string): number {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const d = new Date(dateStr)
  d.setHours(0, 0, 0, 0)
  return Math.ceil((d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
}

function UrgencyBadge({ days }: { days: number }) {
  if (days <= 0) return <Badge className="bg-red-500/20 text-red-400 border-red-500/30 text-xs">Aujourd'hui</Badge>
  if (days <= 2) return <Badge className="bg-red-500/20 text-red-400 border-red-500/30 text-xs">J-{days}</Badge>
  if (days <= 4) return <Badge className="bg-orange-500/20 text-orange-400 border-orange-500/30 text-xs">J-{days}</Badge>
  return <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30 text-xs">J-{days}</Badge>
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function RecapSemainePage() {
  const session = await getSession()
  if (!session?.user?.id) redirect('/login')

  const { echeances, factures, dossiers, resume } = await getRecapData(session.user.id)
  const { debut, fin } = getWeekRange()

  const isEmpty = (
    echeances.length === 0 &&
    factures.length === 0 &&
    dossiers.length === 0 &&
    resume.nouveaux_clients === 0 &&
    resume.dossiers_ouverts === 0 &&
    resume.factures_emises === 0 &&
    resume.echeances_terminees === 0
  )

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Récapitulatif hebdomadaire</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Semaine du {debut} au {fin}
          </p>
        </div>
        <SendRecapButton />
      </div>

      {isEmpty ? (
        <div className="rounded-xl border border-green-500/20 bg-green-500/5 p-10 text-center">
          <Icons.checkCircle className="h-12 w-12 text-green-400 mx-auto mb-3" />
          <p className="text-lg font-semibold text-white">Tout est à jour !</p>
          <p className="text-sm text-muted-foreground mt-1">
            Aucune échéance urgente, aucune facture en attente, aucun dossier en retard.
          </p>
        </div>
      ) : (
        <div className="space-y-6">

          {/* Section 1 : Échéances semaine prochaine */}
          <section>
            <SectionHeader icon={<Icons.calendar className="h-4 w-4" />} title="Échéances cette semaine" count={echeances.length} />
            {echeances.length === 0 ? (
              <EmptyState text="Aucune échéance cette semaine ✓" />
            ) : (
              <div className="rounded-lg border border-border overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-muted/50 text-muted-foreground text-xs uppercase">
                      <th className="text-left px-4 py-2.5 font-medium">Titre</th>
                      <th className="text-left px-4 py-2.5 font-medium">Dossier</th>
                      <th className="text-left px-4 py-2.5 font-medium">Date</th>
                      <th className="text-left px-4 py-2.5 font-medium">Urgence</th>
                    </tr>
                  </thead>
                  <tbody>
                    {echeances.map((e) => {
                      const days = getDaysUntil(e.date_echeance)
                      return (
                        <tr key={e.id} className="border-t border-border hover:bg-muted/30 transition-colors">
                          <td className="px-4 py-3 font-medium">{e.titre}</td>
                          <td className="px-4 py-3 text-muted-foreground">
                            {e.dossier_id ? (
                              <Link href={`/dossiers/${e.dossier_id}`} className="hover:text-foreground transition-colors">
                                {e.dossier_numero || '—'}
                              </Link>
                            ) : '—'}
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">{e.date_echeance_fmt}</td>
                          <td className="px-4 py-3"><UrgencyBadge days={days} /></td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* Section 2 : Factures à relancer */}
          <section>
            <SectionHeader icon={<Icons.dollar className="h-4 w-4" />} title="Factures à relancer" count={factures.length} />
            {factures.length === 0 ? (
              <EmptyState text="Aucune facture en attente ✓" />
            ) : (
              <div className="rounded-lg border border-border overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-muted/50 text-muted-foreground text-xs uppercase">
                      <th className="text-left px-4 py-2.5 font-medium">N°</th>
                      <th className="text-left px-4 py-2.5 font-medium">Client</th>
                      <th className="text-left px-4 py-2.5 font-medium">Montant</th>
                      <th className="text-left px-4 py-2.5 font-medium">Émise le</th>
                    </tr>
                  </thead>
                  <tbody>
                    {factures.map((f) => (
                      <tr key={f.id} className="border-t border-border hover:bg-muted/30 transition-colors">
                        <td className="px-4 py-3">
                          <Link href={`/factures/${f.id}`} className="font-medium hover:underline">
                            {f.numero}
                          </Link>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">{f.client}</td>
                        <td className="px-4 py-3">
                          <span className="font-semibold text-red-400">
                            {f.montant_ttc.toFixed(3)} TND
                          </span>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">{f.date_emission_fmt}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* Section 3 : Dossiers en retard */}
          <section>
            <SectionHeader icon={<Icons.alertTriangle className="h-4 w-4" />} title="Dossiers en retard" count={dossiers.length} />
            {dossiers.length === 0 ? (
              <EmptyState text="Aucun dossier en retard ✓" />
            ) : (
              <div className="grid sm:grid-cols-2 gap-3">
                {dossiers.map((d) => (
                  <Link
                    key={d.id}
                    href={`/dossiers/${d.id}`}
                    className="flex items-center gap-3 p-4 rounded-lg border border-border hover:border-orange-500/40 hover:bg-orange-500/5 transition-colors"
                  >
                    <div className="h-9 w-9 shrink-0 rounded-full bg-orange-500/15 flex items-center justify-center">
                      <Icons.dossiers className="h-4 w-4 text-orange-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{d.numero}</p>
                      <p className="text-xs text-muted-foreground truncate">{d.objet || '—'}</p>
                    </div>
                    <Badge className="bg-red-500/20 text-red-400 border-red-500/30 text-xs shrink-0">
                      {d.nb_echeances_depassees} en retard
                    </Badge>
                  </Link>
                ))}
              </div>
            )}
          </section>

          {/* Section 4 : Résumé semaine */}
          <section>
            <SectionHeader icon={<Icons.checkCircle className="h-4 w-4" />} title="Semaine écoulée" />
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <StatMini label="Nouveaux clients" value={resume.nouveaux_clients} color="text-blue-400" />
              <StatMini label="Dossiers ouverts" value={resume.dossiers_ouverts} color="text-violet-400" />
              <StatMini label="Factures émises" value={resume.factures_emises} color="text-green-400" />
              <StatMini label="Échéances terminées" value={resume.echeances_terminees} color="text-amber-400" />
            </div>
          </section>

        </div>
      )}
    </div>
  )
}

// ─── Sub-composants ───────────────────────────────────────────────────────────

function SectionHeader({
  icon, title, count,
}: { icon: React.ReactNode; title: string; count?: number }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <span className="text-muted-foreground">{icon}</span>
      <h2 className="text-sm font-semibold">{title}</h2>
      {count !== undefined && count > 0 && (
        <Badge variant="outline" className="text-xs ml-1">{count}</Badge>
      )}
    </div>
  )
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-lg border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
      {text}
    </div>
  )
}

function StatMini({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="rounded-lg border border-border p-4 text-center">
      <div className={`text-2xl font-bold ${color}`}>{value}</div>
      <div className="text-xs text-muted-foreground mt-1">{label}</div>
    </div>
  )
}
