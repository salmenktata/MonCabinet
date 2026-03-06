/**
 * Réindexation OpenAI embeddings en PRODUCTION via tunnel SSH
 * Cible: 3358 chunks sans embedding_openai
 * Prérequis: tunnel SSH actif sur port 5434 (localhost:5434 → prod:5433)
 */
import { config } from 'dotenv'
import { resolve } from 'path'

config({ path: resolve(__dirname, '../.env.local') })
process.env.DATABASE_URL = 'postgresql://moncabinet:prod_secure_password_2026@localhost:5434/qadhya'

import { Pool } from 'pg'
import { generateEmbedding, formatEmbeddingForPostgres } from '../lib/ai/embeddings-service'

const pool = new Pool({ connectionString: process.env.DATABASE_URL })

const BATCH_SIZE = parseInt(process.argv[2] || '30', 10)
const MAX_CHUNKS = parseInt(process.argv[3] || '500', 10)

async function main() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('🔄 Réindexation OpenAI Embeddings [PRODUCTION]')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log(`📡 DB: ${process.env.DATABASE_URL?.replace(/:[^:@]+@/, ':***@')}`)
  console.log(`📦 Batch: ${BATCH_SIZE} | Max: ${MAX_CHUNKS} chunks\n`)
  
  // Count total à traiter (priorité: Constitution + codes)
  const countRes = await pool.query(`
    SELECT count(*) FROM knowledge_base_chunks kbc
    JOIN knowledge_base kb ON kb.id = kbc.knowledge_base_id
    WHERE kbc.embedding_openai IS NULL
    AND kb.rag_enabled = true
    AND kb.is_indexed = true
  `)
  const total = parseInt(countRes.rows[0].count)
  console.log(`📊 Total chunks sans embedding_openai (rag_active): ${total}`)
  console.log(`🎯 Traitement limité à: ${Math.min(total, MAX_CHUNKS)} chunks\n`)
  
  let processed = 0
  let succeeded = 0
  let failed = 0
  const startTime = Date.now()
  
  while (processed < Math.min(total, MAX_CHUNKS)) {
    // Prioriser Constitution et codes juridiques
    const chunks = await pool.query(`
      SELECT kbc.id, kbc.content, kb.title, kb.category
      FROM knowledge_base_chunks kbc
      JOIN knowledge_base kb ON kb.id = kbc.knowledge_base_id
      WHERE kbc.embedding_openai IS NULL
      AND kb.rag_enabled = true
      AND kb.is_indexed = true
      ORDER BY 
        CASE 
          WHEN kb.title LIKE '%دستور%' OR kb.title LIKE '%Constitution%' THEN 1
          WHEN kb.title LIKE '%مجلة الشغل%' OR kb.title LIKE '%الالتزامات%' THEN 2
          WHEN kb.title LIKE '%الأحوال الشخصية%' OR kb.title LIKE '%مجلة الجزائية%' THEN 3
          ELSE 4
        END,
        kb.created_at DESC
      LIMIT $1
    `, [BATCH_SIZE])
    
    if (chunks.rows.length === 0) {
      console.log('✅ Plus de chunks à traiter!')
      break
    }
    
    const batchStart = Date.now()
    const embeddings = await Promise.allSettled(
      chunks.rows.map(chunk => generateEmbedding(chunk.content, { operationName: 'indexation' }))
    )
    
    for (let i = 0; i < chunks.rows.length; i++) {
      const chunk = chunks.rows[i]
      const result = embeddings[i]
      
      if (result.status === 'fulfilled') {
        try {
          const embStr = formatEmbeddingForPostgres(result.value.embedding)
          await pool.query(
            `UPDATE knowledge_base_chunks SET embedding_openai = $1::vector WHERE id = $2`,
            [embStr, chunk.id]
          )
          succeeded++
        } catch (e) {
          console.error(`❌ UPDATE failed for chunk ${chunk.id.substring(0,8)}:`, e instanceof Error ? e.message : e)
          failed++
        }
      } else {
        console.error(`❌ Embedding failed for chunk ${chunk.id.substring(0,8)}:`, result.reason?.message)
        failed++
      }
    }
    
    processed += chunks.rows.length
    const batchMs = Date.now() - batchStart
    const eta = ((Math.min(total, MAX_CHUNKS) - processed) * (batchMs / chunks.rows.length) / 1000 / 60).toFixed(1)
    console.log(`✅ ${processed}/${Math.min(total, MAX_CHUNKS)} | ${batchMs}ms/batch | ETA: ${eta}min | ✓${succeeded} ✗${failed} | ${chunks.rows[0]?.title?.substring(0,40)}...`)
  }
  
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log(`✅ Total: ${processed} | Succès: ${succeeded} | Échecs: ${failed}`)
  console.log(`⏱️  Temps: ${((Date.now() - startTime) / 1000 / 60).toFixed(1)} min`)
  
  await pool.end()
  process.exit(0)
}

main().catch(e => { console.error('❌ Fatal:', e); process.exit(1) })
