/**
 * Corriger les pages "pending" des codes juridiques clés → "crawled"
 * Pour qu'elles soient éligibles à l'indexation dans KB
 */
import { Pool } from 'pg'

const pool = new Pool({
  host: 'localhost', port: 5434, database: 'qadhya',
  user: 'moncabinet', password: 'prod_secure_password_2026'
})

const CODES_SRC_ID = 'd559807e-ce6a-4e39-acce-c42c1409dc1d'

// Codes prioritaires selon les questions du test
const PRIORITY_PATTERNS = [
  '%مجلة-الشغل/%',          // Code Travail
  '%الأحوال-الشخصية%',        // Code Statut Personnel
  '%مجلة-الالتزامات%',         // COC
  '%مجلة-الجزائية%',           // Code Pénal
  '%مجلة-التجارية%',           // Code Commerce
]

async function main() {
  const c = await pool.connect()
  
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('🔄 Correction pages pending → crawled [PRODUCTION]')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')
  
  // Afficher les pages pending par code
  console.log('Pages pending par code prioritaire:')
  for (const pattern of PRIORITY_PATTERNS) {
    const cnt = await c.query(
      `SELECT count(*) FROM web_pages WHERE web_source_id = $1 AND status = 'pending' AND url LIKE $2`,
      [CODES_SRC_ID, pattern]
    )
    console.log(`  ${cnt.rows[0].count} pages - ${pattern}`)
  }
  
  // Update pending → crawled pour les codes prioritaires
  // ET reset is_indexed=false pour qu'ils soient ré-indexables
  let totalUpdated = 0
  for (const pattern of PRIORITY_PATTERNS) {
    const result = await c.query(
      `UPDATE web_pages 
       SET status = 'crawled', is_indexed = false
       WHERE web_source_id = $1 
       AND status = 'pending'
       AND extracted_text IS NOT NULL 
       AND LENGTH(extracted_text) >= 50
       AND url LIKE $2`,
      [CODES_SRC_ID, pattern]
    )
    totalUpdated += result.rowCount || 0
    console.log(`  ✅ ${result.rowCount} pages corrigées pour ${pattern}`)
  }
  
  console.log(`\n📊 Total corrigé: ${totalUpdated} pages`)
  
  // Vérification
  const eligible = await c.query(`
    SELECT count(*) FROM web_pages
    WHERE web_source_id = $1
    AND status IN ('crawled', 'unchanged')
    AND extracted_text IS NOT NULL 
    AND LENGTH(extracted_text) >= 50
    AND is_indexed = false
  `, [CODES_SRC_ID])
  console.log(`✅ Pages maintenant éligibles à indexer: ${eligible.rows[0].count}`)
  
  c.release()
  await pool.end()
  process.exit(0)
}
main().catch(e => { console.error(e.message); process.exit(1) })
