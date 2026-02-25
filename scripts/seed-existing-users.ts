/**
 * Script : Seed données démo pour les utilisateurs existants
 *
 * Usage : npx tsx scripts/seed-existing-users.ts
 *
 * Insère des données démo (clients, dossiers, échéances, actions, facture)
 * pour Salmen et Hassen. Idempotent : ne re-seed pas si des données existent déjà.
 */

import 'dotenv/config'
import { query } from '@/lib/db/postgres'
import { seedUserData } from '@/lib/db/seed-user-data'

async function main() {
  console.log('🌱 Seed données démo — utilisateurs existants\n')

  // Cherche les utilisateurs cibles
  const targets: Array<{ label: string; sqlWhere: string; params: string[] }> = [
    {
      label: 'Salmen (salmen.ktata@gmail.com)',
      sqlWhere: 'email = $1',
      params: ['salmen.ktata@gmail.com'],
    },
    {
      label: 'Hassen',
      sqlWhere: "LOWER(prenom) LIKE 'hassen'",
      params: [],
    },
  ]

  for (const target of targets) {
    console.log(`🔍 Recherche : ${target.label}`)

    const result = await query<{ id: string; email: string; prenom: string; nom: string }>(
      `SELECT id, email, prenom, nom FROM users WHERE ${target.sqlWhere}`,
      target.params.length > 0 ? target.params : undefined
    )

    if (result.rows.length === 0) {
      console.log(`   ⚠️  Utilisateur non trouvé — skip\n`)
      continue
    }

    if (result.rows.length > 1) {
      console.log(`   ⚠️  Plusieurs utilisateurs trouvés (${result.rows.length}) — skip pour éviter ambiguïté`)
      result.rows.forEach((r) =>
        console.log(`      - ${r.id} | ${r.email} | ${r.prenom} ${r.nom}`)
      )
      console.log()
      continue
    }

    const user = result.rows[0]
    console.log(`   ✅ Trouvé : ${user.prenom} ${user.nom} (${user.email}) — id: ${user.id}`)

    // Vérifier état actuel
    const countResult = await query<{ count: string }>(
      'SELECT COUNT(*)::text AS count FROM clients WHERE user_id = $1',
      [user.id]
    )
    const existingCount = parseInt(countResult.rows[0]?.count ?? '0', 10)

    if (existingCount > 0) {
      console.log(`   ℹ️  ${existingCount} client(s) déjà présents — données démo déjà présentes, skip\n`)
      continue
    }

    // Seed
    console.log('   📝 Insertion des données démo...')
    await seedUserData(user.id)

    // Vérification post-seed
    const [clientsRes, dossiersRes, echeancesRes, actionsRes, facturesRes] = await Promise.all([
      query<{ count: string }>('SELECT COUNT(*)::text AS count FROM clients   WHERE user_id = $1', [user.id]),
      query<{ count: string }>('SELECT COUNT(*)::text AS count FROM dossiers  WHERE user_id = $1', [user.id]),
      query<{ count: string }>(`SELECT COUNT(*)::text AS count FROM echeances e
         JOIN dossiers d ON d.id = e.dossier_id WHERE d.user_id = $1`, [user.id]),
      query<{ count: string }>(`SELECT COUNT(*)::text AS count FROM actions a
         JOIN dossiers d ON d.id = a.dossier_id WHERE d.user_id = $1`, [user.id]),
      query<{ count: string }>('SELECT COUNT(*)::text AS count FROM factures  WHERE user_id = $1', [user.id]),
    ])

    console.log('   ✅ Seed terminé :')
    console.log(`      clients    : ${clientsRes.rows[0].count}`)
    console.log(`      dossiers   : ${dossiersRes.rows[0].count}`)
    console.log(`      échéances  : ${echeancesRes.rows[0].count}`)
    console.log(`      actions    : ${actionsRes.rows[0].count}`)
    console.log(`      factures   : ${facturesRes.rows[0].count}`)
    console.log()
  }

  console.log('✅ Script terminé.')
  process.exit(0)
}

main().catch((err) => {
  console.error('❌ Erreur fatale :', err)
  process.exit(1)
})
