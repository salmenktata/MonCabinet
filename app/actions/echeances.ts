'use server'

import { query } from '@/lib/db/postgres'
import { getSession } from '@/lib/auth/session'
import { echeanceSchema, calculateEcheanceSchema, type EcheanceFormData, type CalculateEcheanceData } from '@/lib/validations/echeance'
import { calculerEcheance } from '@/lib/utils/delais-tunisie'
import { revalidatePath } from 'next/cache'

export async function createEcheanceAction(formData: EcheanceFormData) {
  try {
    // Validation
    const validatedData = echeanceSchema.parse(formData)

    // Vérifier l'authentification
    const session = await getSession()
    if (!session?.user?.id) {
      return { error: 'Non authentifié' }
    }

    // Vérifier que le dossier appartient à l'utilisateur
    const dossierResult = await query(
      'SELECT id FROM dossiers WHERE id = $1 AND user_id = $2',
      [validatedData.dossier_id, session.user.id]
    )

    if (dossierResult.rows.length === 0) {
      return { error: 'Dossier introuvable ou accès refusé' }
    }

    // Créer l'échéance
    const columns = Object.keys(validatedData).join(', ')
    const values = Object.values(validatedData)
    const placeholders = values.map((_, i) => `$${i + 1}`).join(', ')

    const result = await query(
      `INSERT INTO echeances (${columns}) VALUES (${placeholders}) RETURNING *`,
      values
    )

    revalidatePath('/dossiers')
    revalidatePath(`/dossiers/${validatedData.dossier_id}`)
    revalidatePath('/echeances')
    return { success: true, data: result.rows[0] }
  } catch (error) {
    console.error('Erreur création échéance:', error)
    return { error: 'Erreur lors de la création de l\'échéance' }
  }
}

export async function updateEcheanceAction(id: string, formData: Partial<EcheanceFormData>) {
  try {
    const session = await getSession()
    if (!session?.user?.id) {
      return { error: 'Non authentifié' }
    }

    // Vérifier que l'échéance existe et appartient à l'utilisateur (via le dossier)
    const checkResult = await query(
      `SELECT e.id, e.dossier_id
       FROM echeances e
       JOIN dossiers d ON e.dossier_id = d.id
       WHERE e.id = $1 AND d.user_id = $2`,
      [id, session.user.id]
    )

    if (checkResult.rows.length === 0) {
      return { error: 'Échéance introuvable ou accès refusé' }
    }

    const echeance = checkResult.rows[0]

    // Mettre à jour
    const setClause = Object.keys(formData)
      .map((key, i) => `${key} = $${i + 1}`)
      .join(', ')
    const values = [...Object.values(formData), id]

    const result = await query(
      `UPDATE echeances SET ${setClause} WHERE id = $${values.length} RETURNING *`,
      values
    )

    revalidatePath('/dossiers')
    revalidatePath(`/dossiers/${echeance.dossier_id}`)
    revalidatePath('/echeances')
    return { success: true, data: result.rows[0] }
  } catch (error) {
    console.error('Erreur mise à jour échéance:', error)
    return { error: 'Erreur lors de la mise à jour' }
  }
}

export async function deleteEcheanceAction(id: string) {
  try {
    const session = await getSession()
    if (!session?.user?.id) {
      return { error: 'Non authentifié' }
    }

    // Récupérer l'échéance pour le revalidatePath
    const echeanceResult = await query(
      `SELECT e.dossier_id
       FROM echeances e
       JOIN dossiers d ON e.dossier_id = d.id
       WHERE e.id = $1 AND d.user_id = $2`,
      [id, session.user.id]
    )

    if (echeanceResult.rows.length === 0) {
      return { error: 'Échéance introuvable ou accès refusé' }
    }

    const echeance = echeanceResult.rows[0]

    await query('DELETE FROM echeances WHERE id = $1', [id])

    revalidatePath('/dossiers')
    revalidatePath(`/dossiers/${echeance.dossier_id}`)
    revalidatePath('/echeances')

    return { success: true }
  } catch (error) {
    console.error('Erreur suppression échéance:', error)
    return { error: 'Erreur lors de la suppression' }
  }
}

export async function marquerEcheanceRespecte(id: string) {
  try {
    const session = await getSession()
    if (!session?.user?.id) {
      return { error: 'Non authentifié' }
    }

    // Vérifier et récupérer le dossier_id
    const checkResult = await query(
      `SELECT e.dossier_id
       FROM echeances e
       JOIN dossiers d ON e.dossier_id = d.id
       WHERE e.id = $1 AND d.user_id = $2`,
      [id, session.user.id]
    )

    if (checkResult.rows.length === 0) {
      return { error: 'Échéance introuvable' }
    }

    const echeance = checkResult.rows[0]

    const result = await query(
      `UPDATE echeances SET statut = 'respecte' WHERE id = $1 RETURNING *`,
      [id]
    )

    revalidatePath('/dossiers')
    revalidatePath(`/dossiers/${echeance.dossier_id}`)
    revalidatePath('/echeances')
    return { success: true, data: result.rows[0] }
  } catch (error) {
    console.error('Erreur marquage échéance:', error)
    return { error: 'Erreur lors du marquage' }
  }
}

export async function calculateEcheanceAction(formData: CalculateEcheanceData) {
  try {
    // Validation
    const validatedData = calculateEcheanceSchema.parse(formData)

    const dateDepart = new Date(validatedData.date_point_depart)
    const dateEcheance = calculerEcheance(
      dateDepart,
      validatedData.nombre_jours,
      validatedData.delai_type,
      validatedData.exclure_vacances_judiciaires
    )

    return {
      success: true,
      data: {
        date_echeance: dateEcheance.toISOString().split('T')[0],
        date_point_depart: validatedData.date_point_depart,
        nombre_jours: validatedData.nombre_jours,
        delai_type: validatedData.delai_type,
      },
    }
  } catch (error) {
    console.error('Erreur calcul échéance:', error)
    return { error: 'Erreur lors du calcul de l\'échéance' }
  }
}

export async function getEcheancesUrgentesAction() {
  try {
    const session = await getSession()
    if (!session?.user?.id) {
      return { error: 'Non authentifié' }
    }

    // Récupérer les échéances des 15 prochains jours
    const dans15Jours = new Date()
    dans15Jours.setDate(dans15Jours.getDate() + 15)

    const result = await query(
      `SELECT
        e.*,
        json_build_object(
          'id', d.id,
          'numero', d.numero,
          'objet', d.objet,
          'clients', json_build_object(
            'nom', c.nom,
            'prenom', c.prenom,
            'type_client', c.type_client
          )
        ) as dossiers
       FROM echeances e
       JOIN dossiers d ON e.dossier_id = d.id
       LEFT JOIN clients c ON d.client_id = c.id
       WHERE e.statut = 'actif'
         AND e.date_echeance <= $1
         AND d.user_id = $2
       ORDER BY e.date_echeance ASC`,
      [dans15Jours.toISOString().split('T')[0], session.user.id]
    )

    return { success: true, data: result.rows }
  } catch (error) {
    console.error('Erreur récupération échéances urgentes:', error)
    return { error: 'Erreur lors de la récupération des échéances' }
  }
}
