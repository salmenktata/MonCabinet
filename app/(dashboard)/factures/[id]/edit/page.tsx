import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import FactureForm from '@/components/factures/FactureForm'

export default async function EditFacturePage({
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

  // Récupérer la facture
  const { data: facture, error } = await supabase
    .from('factures')
    .select('*')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (error || !facture) {
    console.error('Erreur chargement facture:', error)
    notFound()
  }

  // Récupérer tous les clients
  const { data: clients, error: clientsError } = await supabase
    .from('clients')
    .select('id, type, nom, prenom, denomination')
    .eq('user_id', user.id)
    .order('nom', { ascending: true })

  if (clientsError) {
    console.error('Erreur chargement clients:', clientsError)
  }

  // Récupérer tous les dossiers
  const { data: dossiers, error: dossiersError } = await supabase
    .from('dossiers')
    .select('id, numero_dossier, objet, client_id')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  if (dossiersError) {
    console.error('Erreur chargement dossiers:', dossiersError)
  }

  // Préparer les données pour le formulaire
  const initialData = {
    client_id: facture.client_id,
    dossier_id: facture.dossier_id || '',
    montant_ht: facture.montant_ht,
    taux_tva: facture.taux_tva,
    date_emission: facture.date_emission,
    date_echeance: facture.date_echeance || '',
    statut: facture.statut,
    objet: facture.objet,
    notes: facture.notes || '',
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {/* En-tête */}
      <div>
        <Link
          href={`/factures/${id}`}
          className="text-sm text-blue-600 hover:text-blue-700"
        >
          ← Retour à la facture
        </Link>
        <h1 className="mt-2 text-3xl font-bold text-gray-900">
          Modifier la facture {facture.numero_facture}
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          Modifiez les informations de la facture
        </p>
      </div>

      {/* Formulaire */}
      <div className="rounded-lg border bg-white p-6 shadow-sm">
        <FactureForm
          factureId={id}
          initialData={initialData}
          isEditing={true}
          clients={clients || []}
          dossiers={dossiers || []}
        />
      </div>
    </div>
  )
}
