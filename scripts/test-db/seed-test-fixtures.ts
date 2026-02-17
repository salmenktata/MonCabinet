/**
 * Insère des fixtures de test standardisées
 * Usage: npm run test:db:seed
 * 
 * Charge les fixtures JSON et les insère dans la base de test
 */

import { readFileSync } from 'fs'
import { join } from 'path'
import pg from 'pg'

const { Pool } = pg

// Configuration (lire depuis .env.local ou utiliser valeurs par défaut)
const DB_NAME = 'qadhya_test'
const DB_USER = process.env.DB_USER || 'moncabinet'
const DB_PASSWORD = process.env.DB_PASSWORD || 'dev_password_change_in_production'
const DB_HOST = process.env.DB_HOST || 'localhost'
const DB_PORT = parseInt(process.env.DB_PORT || '5433')

const FIXTURES_DIR = join(process.cwd(), 'lib', 'test-db', 'fixtures')

/**
 * Charger un fichier JSON de fixtures
 */
function loadFixture<T>(filename: string): T[] {
  const path = join(FIXTURES_DIR, filename)
  const content = readFileSync(path, 'utf-8')
  return JSON.parse(content)
}

/**
 * Insérer des fixtures dans la table users
 * Retourne un Map d'email -> UUID pour référencer dans les autres tables
 */
async function seedUsers(pool: pg.Pool): Promise<Map<string, string>> {
  const users = loadFixture<any>('users.json')
  const userIdMap = new Map<string, string>()

  console.log(`👥 Insertion de ${users.length} utilisateurs...`)

  for (const user of users) {
    // Hash fictif pour test (bcrypt de "password123")
    const passwordHash = '$2a$10$XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX'

    const result = await pool.query(`
      INSERT INTO users (
        email, password_hash, nom, prenom, role,
        status, is_approved, email_verified
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (email) DO UPDATE SET email = EXCLUDED.email
      RETURNING id
    `, [
      user.email,
      passwordHash,
      user.name?.split(' ')[0] || 'Test',
      user.name?.split(' ').slice(1).join(' ') || 'User',
      user.role || 'user',
      'approved',
      true,
      true
    ])

    userIdMap.set(user.email, result.rows[0].id)
  }

  console.log(`✅ ${users.length} utilisateurs insérés`)
  return userIdMap
}

/**
 * Insérer des fixtures web_sources
 */
async function seedWebSources(pool: pg.Pool) {
  const sources = loadFixture<any>('web-sources.json')

  console.log(`🌐 Insertion de ${sources.length} sources web...`)

  for (const source of sources) {
    await pool.query(`
      INSERT INTO web_sources (
        name, base_url, category,
        requires_javascript, ignore_ssl_errors,
        use_sitemap, is_active
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (base_url) DO NOTHING
    `, [
      source.name,
      source.base_url,
      source.category,
      source.requires_javascript || false,
      source.ignore_ssl_errors || false,
      source.use_sitemap || false,
      source.status === 'active' || true
    ])
  }

  console.log(`✅ ${sources.length} sources web insérées`)
}

/**
 * Insérer des fixtures knowledge_base
 */
async function seedKnowledgeBase(pool: pg.Pool) {
  const docs = loadFixture<any>('knowledge-base.json')

  console.log(`📚 Insertion de ${docs.length} documents...`)

  for (const doc of docs) {
    await pool.query(`
      INSERT INTO knowledge_base (
        title, category, language,
        source_file, file_name, file_type,
        metadata, is_indexed
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `, [
      doc.title,
      doc.category,
      doc.language || 'fr',
      doc.file_url || `test/${doc.title.toLowerCase().replace(/ /g, '-')}.pdf`,
      doc.file_url?.split('/').pop() || `${doc.title}.pdf`,
      doc.file_type || 'application/pdf',
      JSON.stringify(doc.metadata || {}),
      doc.is_indexed || false
    ])
  }

  console.log(`✅ ${docs.length} documents insérés`)
}

/**
 * Insérer des fixtures clients
 */
async function seedClients(pool: pg.Pool, userIdMap: Map<string, string>) {
  const clients = loadFixture<any>('clients.json')

  // Utiliser le premier user comme propriétaire des clients
  const defaultUserId = Array.from(userIdMap.values())[0]

  console.log(`👤 Insertion de ${clients.length} clients...`)

  for (const client of clients) {
    await pool.query(`
      INSERT INTO clients (
        user_id, nom, prenom, type_client,
        email, telephone, adresse, cin
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `, [
      defaultUserId,
      client.nom,
      client.prenom,
      client.type || 'personne_physique',
      client.email,
      client.telephone,
      client.adresse,
      client.cin_matricule || client.cin
    ])
  }

  console.log(`✅ ${clients.length} clients insérés`)
}

/**
 * Insérer des fixtures dossiers
 */
async function seedDossiers(pool: pg.Pool, userIdMap: Map<string, string>) {
  const dossiers = loadFixture<any>('dossiers.json')

  // Utiliser le premier user comme propriétaire des dossiers
  const defaultUserId = Array.from(userIdMap.values())[0]

  // Récupérer les IDs des clients créés (on va utiliser les 5 premiers)
  const { rows: clients } = await pool.query(`
    SELECT id FROM clients ORDER BY created_at LIMIT 5
  `)

  console.log(`📁 Insertion de ${dossiers.length} dossiers...`)

  for (let i = 0; i < dossiers.length; i++) {
    const dossier = dossiers[i]
    const clientId = clients[i]?.id || null

    // Convertir le statut (status → statut avec valeurs correctes)
    let statut = 'en_cours'
    if (dossier.status === 'termine' || dossier.status === 'clos') {
      statut = 'clos'
    } else if (dossier.status === 'archive') {
      statut = 'archive'
    }

    await pool.query(`
      INSERT INTO dossiers (
        user_id, client_id, numero, objet,
        statut, date_ouverture, date_cloture
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (numero) DO NOTHING
    `, [
      defaultUserId,
      clientId,
      dossier.numero,
      dossier.titre || dossier.description,
      statut,
      dossier.date_ouverture,
      dossier.date_cloture || null
    ])
  }

  console.log(`✅ ${dossiers.length} dossiers insérés`)
}

/**
 * Afficher un résumé
 */
async function printSummary(pool: pg.Pool) {
  console.log('\n📊 Résumé des fixtures insérées:\n')

  const tables = [
    { name: 'users', label: 'Utilisateurs' },
    { name: 'web_sources', label: 'Sources Web' },
    { name: 'knowledge_base', label: 'Documents KB' },
    { name: 'clients', label: 'Clients' },
    { name: 'dossiers', label: 'Dossiers' }
  ]

  for (const table of tables) {
    try {
      const { rows } = await pool.query(`SELECT COUNT(*) as count FROM ${table.name}`)
      console.log(`   ${table.label.padEnd(20)} : ${rows[0].count} entrées`)
    } catch (error) {
      console.log(`   ${table.label.padEnd(20)} : Erreur (${error.message.substring(0, 50)})`)
    }
  }

  console.log('\n✅ Fixtures insérées avec succès!')
}

/**
 * Fonction principale
 */
async function main() {
  console.log('🚀 Insertion des fixtures de test\n')
  console.log(`📌 Base: ${DB_NAME}`)
  console.log(`📌 Source: ${FIXTURES_DIR}\n`)

  const pool = new Pool({
    host: DB_HOST,
    port: DB_PORT,
    user: DB_USER,
    password: DB_PASSWORD,
    database: DB_NAME
  })

  try {
    // 1. Créer users et récupérer leurs IDs
    const userIdMap = await seedUsers(pool)

    // 2. Créer web_sources (pas de dépendances)
    await seedWebSources(pool)

    // 3. Créer knowledge_base (pas de dépendances)
    await seedKnowledgeBase(pool)

    // 4. Créer clients (dépend de users)
    await seedClients(pool, userIdMap)

    // 5. Créer dossiers (dépend de users et clients)
    await seedDossiers(pool, userIdMap)

    await printSummary(pool)

    console.log('\n🎉 Base de test prête pour les tests!')
    process.exit(0)

  } catch (error) {
    console.error('\n❌ Erreur lors de l\'insertion des fixtures:', error)
    process.exit(1)
  } finally {
    await pool.end()
  }
}

// Exécution
main()
