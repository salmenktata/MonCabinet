'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { deleteFactureAction, changerStatutFactureAction } from '@/app/actions/factures'

interface FactureDetailClientProps {
  facture: any
  profile: any
}

export default function FactureDetailClient({
  facture,
  profile,
}: FactureDetailClientProps) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleDelete = async () => {
    if (!confirm('Supprimer cette facture ? Cette action est irréversible.')) return

    setLoading(true)
    const result = await deleteFactureAction(facture.id)

    if (result.error) {
      setError(result.error)
      setLoading(false)
      return
    }

    router.push('/factures')
    router.refresh()
  }

  const handleChangeStatut = async (newStatut: string) => {
    setLoading(true)
    setError('')

    const result = await changerStatutFactureAction(facture.id, newStatut)

    if (result.error) {
      setError(result.error)
      setLoading(false)
      return
    }

    router.refresh()
    setLoading(false)
  }

  const handleGeneratePDF = () => {
    // Générer le PDF
    const clientName = facture.clients
      ? facture.clients.type === 'PERSONNE_PHYSIQUE'
        ? `${facture.clients.nom} ${facture.clients.prenom || ''}`.trim()
        : facture.clients.denomination
      : 'Client supprimé'

    // Créer le contenu HTML pour le PDF
    const pdfContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Facture ${facture.numero_facture}</title>
  <style>
    @page { size: A4; margin: 2cm; }
    body { font-family: Arial, sans-serif; font-size: 11pt; line-height: 1.6; color: #333; }
    .header { text-align: center; margin-bottom: 40px; border-bottom: 2px solid #2563eb; padding-bottom: 20px; }
    .header h1 { color: #2563eb; margin: 0; font-size: 24pt; }
    .info-section { display: flex; justify-content: space-between; margin-bottom: 30px; }
    .info-box { width: 48%; }
    .info-box h3 { font-size: 12pt; color: #2563eb; margin-bottom: 10px; }
    .info-box p { margin: 5px 0; }
    .details { margin: 30px 0; }
    .details table { width: 100%; border-collapse: collapse; margin: 20px 0; }
    .details th, .details td { padding: 12px; text-align: left; border-bottom: 1px solid #e5e7eb; }
    .details th { background-color: #f3f4f6; font-weight: 600; }
    .totals { margin-top: 30px; text-align: right; }
    .totals table { width: 40%; margin-left: auto; border-collapse: collapse; }
    .totals td { padding: 8px; }
    .totals .total-row { font-size: 14pt; font-weight: bold; color: #2563eb; border-top: 2px solid #2563eb; }
    .footer { margin-top: 50px; text-align: center; font-size: 9pt; color: #6b7280; border-top: 1px solid #e5e7eb; padding-top: 20px; }
    .label { color: #6b7280; font-size: 10pt; }
  </style>
</head>
<body>
  <div class="header">
    <h1>FACTURE</h1>
    <p style="font-size: 18pt; margin: 10px 0;">${facture.numero_facture}</p>
  </div>

  <div class="info-section">
    <div class="info-box">
      <h3>De :</h3>
      <p><strong>${profile?.nom || ''} ${profile?.prenom || ''}</strong></p>
      ${profile?.cabinet ? `<p>${profile.cabinet}</p>` : ''}
      ${profile?.adresse ? `<p>${profile.adresse}</p>` : ''}
      ${profile?.code_postal || profile?.ville ? `<p>${profile.code_postal || ''} ${profile.ville || ''}</p>` : ''}
      ${profile?.email ? `<p>Email: ${profile.email}</p>` : ''}
      ${profile?.telephone ? `<p>Tél: ${profile.telephone}</p>` : ''}
    </div>

    <div class="info-box">
      <h3>À :</h3>
      <p><strong>${clientName}</strong></p>
      ${facture.clients?.adresse ? `<p>${facture.clients.adresse}</p>` : ''}
      ${facture.clients?.code_postal || facture.clients?.ville ? `<p>${facture.clients.code_postal || ''} ${facture.clients.ville || ''}</p>` : ''}
      ${facture.clients?.email ? `<p>Email: ${facture.clients.email}</p>` : ''}
      ${facture.clients?.telephone ? `<p>Tél: ${facture.clients.telephone}</p>` : ''}
    </div>
  </div>

  <div class="details">
    <table>
      <tr>
        <td><span class="label">Date d'émission:</span></td>
        <td><strong>${new Date(facture.date_emission).toLocaleDateString('fr-FR')}</strong></td>
      </tr>
      ${facture.date_echeance ? `
      <tr>
        <td><span class="label">Date d'échéance:</span></td>
        <td><strong>${new Date(facture.date_echeance).toLocaleDateString('fr-FR')}</strong></td>
      </tr>
      ` : ''}
      ${facture.dossiers ? `
      <tr>
        <td><span class="label">Dossier:</span></td>
        <td><strong>${facture.dossiers.numero_dossier}</strong> - ${facture.dossiers.objet}</td>
      </tr>
      ` : ''}
    </table>

    <h3 style="color: #2563eb; margin-top: 30px;">Objet</h3>
    <p>${facture.objet}</p>

    ${facture.notes ? `
    <h3 style="color: #2563eb; margin-top: 20px;">Notes</h3>
    <p style="white-space: pre-wrap;">${facture.notes}</p>
    ` : ''}
  </div>

  <div class="totals">
    <table>
      <tr>
        <td>Montant HT</td>
        <td style="text-align: right;"><strong>${parseFloat(facture.montant_ht).toFixed(3)} TND</strong></td>
      </tr>
      <tr>
        <td>TVA (${facture.taux_tva}%)</td>
        <td style="text-align: right;"><strong>${parseFloat(facture.montant_tva).toFixed(3)} TND</strong></td>
      </tr>
      <tr class="total-row">
        <td>Total TTC</td>
        <td style="text-align: right;"><strong>${parseFloat(facture.montant_ttc).toFixed(3)} TND</strong></td>
      </tr>
    </table>
  </div>

  <div class="footer">
    <p>Facture générée le ${new Date().toLocaleDateString('fr-FR')}</p>
    ${profile?.siret ? `<p>SIRET: ${profile.siret}</p>` : ''}
  </div>
</body>
</html>
    `

    // Ouvrir dans une nouvelle fenêtre pour impression
    const printWindow = window.open('', '_blank')
    if (printWindow) {
      printWindow.document.write(pdfContent)
      printWindow.document.close()
      printWindow.onload = () => {
        printWindow.print()
      }
    }
  }

  return (
    <div className="rounded-lg border bg-white p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-gray-900 mb-4">Actions</h2>

      {error && (
        <div className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-800">
          {error}
        </div>
      )}

      <div className="space-y-3">
        {/* Générer PDF */}
        <button
          onClick={handleGeneratePDF}
          disabled={loading}
          className="w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          📄 Générer PDF
        </button>

        {/* Changer statut */}
        {facture.statut !== 'PAYEE' && (
          <button
            onClick={() => handleChangeStatut('PAYEE')}
            disabled={loading}
            className="w-full rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
          >
            ✓ Marquer comme payée
          </button>
        )}

        {facture.statut === 'BROUILLON' && (
          <button
            onClick={() => handleChangeStatut('ENVOYEE')}
            disabled={loading}
            className="w-full rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            📧 Marquer comme envoyée
          </button>
        )}

        {facture.statut !== 'IMPAYEE' && facture.statut !== 'PAYEE' && (
          <button
            onClick={() => handleChangeStatut('IMPAYEE')}
            disabled={loading}
            className="w-full rounded-md border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
          >
            ⚠️ Marquer comme impayée
          </button>
        )}

        {/* Modifier */}
        <button
          onClick={() => router.push(`/factures/${facture.id}/edit`)}
          disabled={loading}
          className="w-full rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          ✏️ Modifier
        </button>

        {/* Supprimer */}
        <button
          onClick={handleDelete}
          disabled={loading}
          className="w-full rounded-md border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
        >
          🗑️ Supprimer
        </button>
      </div>
    </div>
  )
}
