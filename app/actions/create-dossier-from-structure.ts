'use server'

import { getSession } from '@/lib/auth/session'
import { db } from '@/lib/db/postgres'
import { revalidatePath } from 'next/cache'

/**
 * Crée un dossier à partir d'une structure IA
 */
export async function createDossierFromStructure(
  structured: any,
  clientId?: string
): Promise<{ success: boolean; dossierId?: string; error?: string }> {
  try {
    // Vérifier l'authentification
    const session = await getSession()
    if (!session?.user?.id) {
      return { success: false, error: 'Non autorisé' }
    }

    const userId = session.user.id

    // Vérifier que le client existe si fourni
    if (clientId) {
      const clientCheck = await db.query(
        `SELECT id FROM clients WHERE id = $1 AND user_id = $2`,
        [clientId, userId]
      )
      if (clientCheck.rows.length === 0) {
        return { success: false, error: 'Client non trouvé' }
      }
    }

    // Extraire les informations de la structure
    const {
      objet,
      categorie,
      parties,
      faits,
      procedure,
      pretentions,
      type_procedure,
    } = structured

    // Déterminer le type d'affaire
    let typeAffaire = 'autre'
    if (categorie) {
      // Mapper les catégories aux types d'affaires
      const categorieMap: Record<string, string> = {
        'droit_civil': 'civil',
        'droit_commercial': 'commercial',
        'droit_penal': 'penal',
        'droit_famille': 'famille',
        'droit_travail': 'travail',
        'droit_administratif': 'administratif',
      }
      typeAffaire = categorieMap[categorie] || 'autre'
    }

    // Générer un numéro de dossier unique
    const year = new Date().getFullYear()
    const countResult = await db.query(
      `SELECT COUNT(*) as count FROM dossiers WHERE user_id = $1 AND EXTRACT(YEAR FROM created_at) = $2`,
      [userId, year]
    )
    const count = parseInt(countResult.rows[0]?.count || '0') + 1
    const numero = `${year}-${count.toString().padStart(4, '0')}`

    // Créer le dossier
    const result = await db.query(
      `INSERT INTO dossiers (
        user_id,
        client_id,
        numero,
        titre,
        type_affaire,
        description,
        faits,
        statut,
        created_at,
        updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
      RETURNING id`,
      [
        userId,
        clientId || null,
        numero,
        objet || 'Dossier sans titre',
        typeAffaire,
        procedure || null,
        faits || null,
        'nouveau',
      ]
    )

    const dossierId = result.rows[0].id

    // Créer les prétentions comme notes si présentes
    if (pretentions && Array.isArray(pretentions) && pretentions.length > 0) {
      const pretentionsText = pretentions.join('\n- ')
      await db.query(
        `INSERT INTO notes (
          dossier_id,
          user_id,
          titre,
          contenu,
          created_at,
          updated_at
        ) VALUES ($1, $2, $3, $4, NOW(), NOW())`,
        [
          dossierId,
          userId,
          'Prétentions',
          `Prétentions identifiées par l'IA:\n- ${pretentionsText}`,
        ]
      )
    }

    // Créer les parties comme notes si présentes
    if (parties) {
      const partiesText = `Demandeur: ${parties.demandeur || 'N/A'}\nDéfendeur: ${parties.defendeur || 'N/A'}`
      await db.query(
        `INSERT INTO notes (
          dossier_id,
          user_id,
          titre,
          contenu,
          created_at,
          updated_at
        ) VALUES ($1, $2, $3, $4, NOW(), NOW())`,
        [
          dossierId,
          userId,
          'Parties',
          partiesText,
        ]
      )
    }

    // Revalider les caches
    revalidatePath('/dossiers')
    revalidatePath(`/dossiers/${dossierId}`)

    return { success: true, dossierId }
  } catch (error) {
    console.error('[Create Dossier from Structure] Error:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Erreur inconnue',
    }
  }
}
