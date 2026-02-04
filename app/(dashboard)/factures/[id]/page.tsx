import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import FactureDetailClient from '@/components/factures/FactureDetailClient'

export default async function FactureDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const supabase = await createClient()
  const { id } = await params

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  // Récupérer la facture avec toutes les relations
  const { data: facture, error } = await supabase
    .from('factures')
    .select(`
      *,
      clients (
        id,
        type,
        nom,
        prenom,
        denomination,
        email,
        telephone,
        adresse,
        code_postal,
        ville,
        cin,
        registre_commerce
      ),
      dossiers (
        id,
        numero_dossier,
        objet,
        type_dossier
      )
    `)
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (error || !facture) {
    console.error('Erreur chargement facture:', error)
    notFound()
  }

  // Récupérer le profil de l'avocat pour le PDF
  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  const clientName = facture.clients
    ? facture.clients.type === 'PERSONNE_PHYSIQUE'
      ? `${facture.clients.nom} ${facture.clients.prenom || ''}`.trim()
      : facture.clients.denomination
    : 'Client supprimé'

  const isRetard =
    facture.statut === 'IMPAYEE' &&
    facture.date_echeance &&
    new Date(facture.date_echeance) < new Date()

  const statutColors: Record<string, string> = {
    BROUILLON: 'bg-gray-100 text-gray-700',
    ENVOYEE: 'bg-blue-100 text-blue-700',
    PAYEE: 'bg-green-100 text-green-700',
    IMPAYEE: 'bg-red-100 text-red-700',
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      {/* En-tête */}
      <div className="flex items-center justify-between">
        <div>
          <Link
            href="/factures"
            className="text-sm text-blue-600 hover:text-blue-700"
          >
            ← Retour aux factures
          </Link>
          <h1 className="mt-2 text-3xl font-bold text-gray-900">
            Facture {facture.numero_facture}
          </h1>
        </div>
        <div className="flex items-center gap-3">
          <span
            className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-medium ${
              statutColors[facture.statut]
            }`}
          >
            {facture.statut}
          </span>
          {isRetard && (
            <span className="inline-flex items-center rounded-full bg-red-100 px-3 py-1 text-sm font-medium text-red-700">
              ⚠️ En retard
            </span>
          )}
        </div>
      </div>

      {/* Contenu principal */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Colonne principale - Détails de la facture */}
        <div className="lg:col-span-2 space-y-6">
          {/* Carte principale */}
          <div className="rounded-lg border bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              Informations facture
            </h2>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-gray-500">Numéro</p>
                  <p className="font-medium text-gray-900">{facture.numero_facture}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Date d'émission</p>
                  <p className="font-medium text-gray-900">
                    {new Date(facture.date_emission).toLocaleDateString('fr-FR')}
                  </p>
                </div>
              </div>

              {facture.date_echeance && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-gray-500">Date d'échéance</p>
                    <p className="font-medium text-gray-900">
                      {new Date(facture.date_echeance).toLocaleDateString('fr-FR')}
                    </p>
                  </div>
                  {facture.date_paiement && (
                    <div>
                      <p className="text-sm text-gray-500">Date de paiement</p>
                      <p className="font-medium text-green-600">
                        {new Date(facture.date_paiement).toLocaleDateString('fr-FR')}
                      </p>
                    </div>
                  )}
                </div>
              )}

              <div>
                <p className="text-sm text-gray-500">Objet</p>
                <p className="font-medium text-gray-900">{facture.objet}</p>
              </div>

              {facture.notes && (
                <div>
                  <p className="text-sm text-gray-500">Notes</p>
                  <p className="text-sm text-gray-700 whitespace-pre-wrap">
                    {facture.notes}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Montants */}
          <div className="rounded-lg border bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Montants</h2>

            <div className="space-y-3">
              <div className="flex justify-between text-gray-700">
                <span>Montant HT</span>
                <span className="font-medium">
                  {parseFloat(facture.montant_ht).toFixed(3)} TND
                </span>
              </div>
              <div className="flex justify-between text-gray-700">
                <span>TVA ({facture.taux_tva}%)</span>
                <span className="font-medium">
                  {parseFloat(facture.montant_tva).toFixed(3)} TND
                </span>
              </div>
              <div className="border-t pt-3 flex justify-between">
                <span className="text-lg font-semibold text-gray-900">
                  Montant TTC
                </span>
                <span className="text-2xl font-bold text-blue-600">
                  {parseFloat(facture.montant_ttc).toFixed(3)} TND
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Colonne latérale */}
        <div className="space-y-6">
          {/* Informations client */}
          <div className="rounded-lg border bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Client</h2>
            {facture.clients ? (
              <div className="space-y-3">
                <div>
                  <p className="text-sm text-gray-500">Nom</p>
                  <p className="font-medium text-gray-900">{clientName}</p>
                </div>
                {facture.clients.email && (
                  <div>
                    <p className="text-sm text-gray-500">Email</p>
                    <a
                      href={`mailto:${facture.clients.email}`}
                      className="text-sm text-blue-600 hover:text-blue-700"
                    >
                      {facture.clients.email}
                    </a>
                  </div>
                )}
                {facture.clients.telephone && (
                  <div>
                    <p className="text-sm text-gray-500">Téléphone</p>
                    <a
                      href={`tel:${facture.clients.telephone}`}
                      className="text-sm text-blue-600 hover:text-blue-700"
                    >
                      {facture.clients.telephone}
                    </a>
                  </div>
                )}
                {facture.clients.adresse && (
                  <div>
                    <p className="text-sm text-gray-500">Adresse</p>
                    <p className="text-sm text-gray-700">
                      {facture.clients.adresse}
                      {facture.clients.code_postal && `, ${facture.clients.code_postal}`}
                      {facture.clients.ville && ` ${facture.clients.ville}`}
                    </p>
                  </div>
                )}
                <div className="pt-3">
                  <Link
                    href={`/clients/${facture.clients.id}`}
                    className="text-sm text-blue-600 hover:text-blue-700"
                  >
                    Voir la fiche client →
                  </Link>
                </div>
              </div>
            ) : (
              <p className="text-sm text-gray-500">Client supprimé</p>
            )}
          </div>

          {/* Dossier lié */}
          {facture.dossiers && (
            <div className="rounded-lg border bg-white p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">
                Dossier lié
              </h2>
              <div className="space-y-3">
                <div>
                  <p className="text-sm text-gray-500">Numéro</p>
                  <p className="font-medium text-gray-900">
                    {facture.dossiers.numero_dossier}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Objet</p>
                  <p className="text-sm text-gray-700">{facture.dossiers.objet}</p>
                </div>
                <div className="pt-3">
                  <Link
                    href={`/dossiers/${facture.dossiers.id}`}
                    className="text-sm text-blue-600 hover:text-blue-700"
                  >
                    Voir le dossier →
                  </Link>
                </div>
              </div>
            </div>
          )}

          {/* Actions */}
          <FactureDetailClient facture={facture} profile={profile} />
        </div>
      </div>
    </div>
  )
}
