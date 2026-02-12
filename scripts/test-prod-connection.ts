#!/usr/bin/env tsx
/**
 * Script pour tester la connexion à la DB prod via tunnel SSH
 */

import { Pool } from 'pg'

async function testConnection() {
  const pool = new Pool({
    host: 'localhost',
    port: 5434,
    database: 'qadhya',
    user: 'moncabinet',
    password: 'prod_secure_password_2026',
    connectionTimeoutMillis: 5000,
  })

  try {
    console.log('🔌 Test de connexion à PostgreSQL prod...')
    console.log('   Host: localhost:5434')
    console.log('   Database: moncabinet')
    console.log('   User: moncabinet')
    console.log()

    const result = await pool.query('SELECT COUNT(*) as total FROM knowledge_base WHERE is_indexed = true')
    console.log('✅ Connexion réussie !')
    console.log(`📊 Documents indexés: ${result.rows[0].total}`)
    console.log()

    // Test chunks
    const chunks = await pool.query('SELECT COUNT(*) as total FROM knowledge_base_chunks')
    console.log(`📝 Chunks totaux: ${chunks.rows[0].total}`)
    console.log()

    // Test version DB
    const version = await pool.query('SELECT version()')
    console.log(`🗄️  PostgreSQL: ${version.rows[0].version.split(' ').slice(0, 2).join(' ')}`)

    await pool.end()
    process.exit(0)
  } catch (error) {
    console.error('❌ Erreur de connexion:', error)
    await pool.end()
    process.exit(1)
  }
}

testConnection()
