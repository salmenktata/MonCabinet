/**
 * Seed données démo pour un nouvel utilisateur (onboarding)
 *
 * Insère 3 clients, 3 dossiers, 3 échéances, 3 actions et 1 facture
 * fictifs en arabe pour permettre à l'utilisateur d'explorer l'application.
 *
 * Idempotent : ne ré-insère pas si des clients existent déjà pour cet utilisateur.
 */

import { transaction, query } from '@/lib/db/postgres'
import { createLogger } from '@/lib/logger'
import { PoolClient } from 'pg'

const log = createLogger('SeedUserData')

const DEMO_NOTE = '(بيانات تجريبية - يمكن حذفها)'

/**
 * Insère des données démo pour un utilisateur donné.
 * Ne fait rien si l'utilisateur a déjà des clients.
 */
export async function seedUserData(userId: string): Promise<void> {
  // Vérification idempotence : skip si l'user a déjà des données
  const existing = await query<{ count: string }>(
    'SELECT COUNT(*)::text AS count FROM clients WHERE user_id = $1',
    [userId]
  )
  if (parseInt(existing.rows[0]?.count ?? '0', 10) > 0) {
    log.info('Données démo déjà présentes, skip', { userId })
    return
  }

  // Préfixe unique basé sur les 4 premiers caractères de l'UUID (sans tirets)
  const prefix = userId.replace(/-/g, '').substring(0, 4).toUpperCase()

  // Dates futures pour les échéances
  const fmt = (daysFromNow: number): string => {
    const d = new Date()
    d.setDate(d.getDate() + daysFromNow)
    return d.toISOString().split('T')[0]
  }

  await transaction(async (client: PoolClient) => {
    // ─── 1. Clients ───────────────────────────────────────────────
    // Note prod : type_client (lowercase), nom IS NOT NULL pour tous les types
    const pmResult = await client.query<{ id: string }>(
      `INSERT INTO clients (user_id, type_client, nom, denomination, telephone, adresse, notes)
       VALUES ($1, 'personne_morale', 'شركة الأفق للتجارة والخدمات', 'شركة الأفق للتجارة والخدمات', '+216 71 123 456', 'شارع الحرية، تونس', $2)
       RETURNING id`,
      [userId, DEMO_NOTE]
    )

    const pp1Result = await client.query<{ id: string }>(
      `INSERT INTO clients (user_id, type_client, nom, prenom, telephone, adresse, notes)
       VALUES ($1, 'personne_physique', 'بن يوسف', 'سعد', '+216 98 765 432', 'شارع فلسطين، صفاقس', $2)
       RETURNING id`,
      [userId, DEMO_NOTE]
    )

    const pp2Result = await client.query<{ id: string }>(
      `INSERT INTO clients (user_id, type_client, nom, prenom, telephone, adresse, notes)
       VALUES ($1, 'personne_physique', 'بن سالم', 'منى', '+216 22 111 222', 'حي النصر، سوسة', $2)
       RETURNING id`,
      [userId, DEMO_NOTE]
    )

    const clientPM = pmResult.rows[0].id
    const clientPP1 = pp1Result.rows[0].id
    const clientPP2 = pp2Result.rows[0].id

    // ─── 2. Dossiers ─────────────────────────────────────────────
    // Note prod : colonne "numero" (pas "numero_dossier"), statut: en_cours/clos/archive
    const dos1Result = await client.query<{ id: string }>(
      `INSERT INTO dossiers
         (user_id, client_id, numero, type_procedure, objet, tribunal, statut, notes)
       VALUES ($1, $2, $3, 'commercial', 'نزاع تجاري - عقد توريد بضاعة', 'المحكمة التجارية بتونس', 'en_cours', $4)
       RETURNING id`,
      [userId, clientPM, `DEMO-${prefix}-001`, DEMO_NOTE]
    )

    const dos2Result = await client.query<{ id: string }>(
      `INSERT INTO dossiers
         (user_id, client_id, numero, type_procedure, objet, tribunal, statut, notes)
       VALUES ($1, $2, $3, 'civil', 'نزاع عقاري - ملكية مشتركة', 'المحكمة الابتدائية بصفاقس', 'en_cours', $4)
       RETURNING id`,
      [userId, clientPP1, `DEMO-${prefix}-002`, DEMO_NOTE]
    )

    const dos3Result = await client.query<{ id: string }>(
      `INSERT INTO dossiers
         (user_id, client_id, numero, type_procedure, objet, tribunal, statut, notes)
       VALUES ($1, $2, $3, 'famille', 'طلاق بالتراضي', 'محكمة الأسرة بسوسة', 'clos', $4)
       RETURNING id`,
      [userId, clientPP2, `DEMO-${prefix}-003`, DEMO_NOTE]
    )

    const dossierId1 = dos1Result.rows[0].id
    const dossierId2 = dos2Result.rows[0].id
    const dossierId3 = dos3Result.rows[0].id

    // ─── 3. Échéances ────────────────────────────────────────────
    // Note prod : user_id requis, type_echeance + statut: actif/termine/annule
    await client.query(
      `INSERT INTO echeances (user_id, dossier_id, type_echeance, titre, date_echeance, statut)
       VALUES
         ($1, $2, 'audience', 'جلسة استماع أولى',    $5, 'actif'),
         ($1, $3, 'audience', 'معاينة بالعين',         $6, 'actif'),
         ($1, $4, 'audience', 'جلسة النطق بالحكم',     $7, 'actif')`,
      [userId, dossierId1, dossierId2, dossierId3, fmt(30), fmt(45), fmt(60)]
    )

    // ─── 4. Actions ──────────────────────────────────────────────
    // Note prod : user_id requis, statut: a_faire/en_cours/termine
    await client.query(
      `INSERT INTO actions (user_id, dossier_id, titre, statut)
       VALUES
         ($1, $2, 'إعداد العريضة الافتتاحية', 'a_faire'),
         ($1, $3, 'جمع الوثائق والأدلة',       'en_cours'),
         ($1, $4, 'مراسلة الخصم',              'termine')`,
      [userId, dossierId1, dossierId2, dossierId3]
    )

    // ─── 5. Facture démo ─────────────────────────────────────────
    // Note prod : "numero" (pas "numero_facture"), statut: brouillon/envoyee/payee/annulee
    // Pas de colonnes annee/sequence/taux_tva
    const montantHt = 500.0
    const montantTva = 95.0   // 500 × 19%
    const montantTtc = 595.0  // 500 + 95

    await client.query(
      `INSERT INTO factures
         (user_id, dossier_id, client_id, numero,
          montant_ht, montant_tva, montant_ttc, statut, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'brouillon', $8)`,
      [userId, dossierId1, clientPM, `DEMO-${prefix}-F001`,
       montantHt, montantTva, montantTtc, DEMO_NOTE]
    )

    log.info('Données démo insérées avec succès', { userId, prefix })
  })
}
