#!/usr/bin/env npx tsx
/**
 * Script de backfill : Générer les embeddings Ollama manquants pour les chunks constitution
 *
 * Contexte : Les 40 chunks constitution ont été indexés avec OpenAI (TURBO_MODE)
 * mais n'ont pas d'embedding Ollama (colonne `embedding` = NULL).
 * La SQL function search_knowledge_base_hybrid filtre kbc.embedding IS NOT NULL
 * pour le provider 'ollama' → 0 résultats pour les requêtes constitutionnelles.
 *
 * Ce script :
 * 1. Identifie les chunks constitution avec embedding IS NULL
 * 2. Appelle Ollama nomic-embed-text pour chaque chunk
 * 3. Met à jour knowledge_base_chunks.embedding
 *
 * Usage :
 *   npx tsx scripts/backfill-constitution-embeddings.ts [--dry-run]
 *   # Prod via tunnel 5434 :
 *   DATABASE_URL=postgres://moncabinet:prod_secure_password_2026@127.0.0.1:5434/qadhya \
 *   OLLAMA_BASE_URL=http://84.247.165.187:11434 \
 *   npx tsx scripts/backfill-constitution-embeddings.ts
 */

import { Pool } from 'pg'

const isDryRun = process.argv.includes('--dry-run')

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'http://localhost:11434'
const OLLAMA_MODEL = process.env.OLLAMA_EMBEDDING_MODEL || 'nomic-embed-text'
const CONCURRENCY = 2
const EXPECTED_DIMS = 768

async function generateOllamaEmbedding(text: string): Promise<number[]> {
  const response = await fetch(`${OLLAMA_BASE_URL}/api/embeddings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: OLLAMA_MODEL, prompt: text, keep_alive: '60m' }),
  })

  if (!response.ok) {
    const err = await response.text()
    throw new Error(`Ollama error ${response.status}: ${err}`)
  }

  const data = (await response.json()) as { embedding: number[] }
  if (!data.embedding || data.embedding.length !== EXPECTED_DIMS) {
    throw new Error(`Embedding invalide: dims=${data.embedding?.length} (attendu ${EXPECTED_DIMS})`)
  }
  return data.embedding
}

function formatEmbeddingForPostgres(embedding: number[]): string {
  return `[${embedding.join(',')}]`
}

async function main() {
  const dbUrl = process.env.DATABASE_URL
  if (!dbUrl) {
    console.error('ERROR: DATABASE_URL manquant')
    console.error('Usage: DATABASE_URL=postgres://... npx tsx scripts/backfill-constitution-embeddings.ts')
    process.exit(1)
  }

  const pool = new Pool({ connectionString: dbUrl })

  console.log(`[Backfill Constitution Embeddings] Démarrage`)
  console.log(`  Ollama: ${OLLAMA_BASE_URL} | Modèle: ${OLLAMA_MODEL}`)
  console.log(`  Mode: ${isDryRun ? 'DRY RUN' : 'PRODUCTION'}`)

  // 1. Récupérer les chunks constitution sans embedding Ollama
  const chunksResult = await pool.query(`
    SELECT
      kbc.id as chunk_id,
      kbc.knowledge_base_id,
      kbc.content,
      kbc.chunk_index,
      kb.title
    FROM knowledge_base_chunks kbc
    JOIN knowledge_base kb ON kb.id = kbc.knowledge_base_id
    WHERE kb.category = 'constitution'
      AND kbc.embedding IS NULL
      AND kb.is_indexed = true
    ORDER BY kb.title, kbc.chunk_index
  `)

  const chunks = chunksResult.rows
  console.log(`\n[Backfill] ${chunks.length} chunks constitution sans embedding Ollama`)

  if (chunks.length === 0) {
    console.log('[Backfill] Rien à faire.')
    await pool.end()
    return
  }

  if (isDryRun) {
    console.log('[DRY RUN] Chunks à traiter :')
    for (const c of chunks) {
      console.log(`  - ${c.title} (chunk ${c.chunk_index}) — ${c.content.length} chars`)
    }
    await pool.end()
    return
  }

  // 2. Générer et mettre à jour par batch
  let success = 0
  let errors = 0

  for (let i = 0; i < chunks.length; i += CONCURRENCY) {
    const batch = chunks.slice(i, i + CONCURRENCY)

    await Promise.all(
      batch.map(async (chunk) => {
        try {
          const embedding = await generateOllamaEmbedding(chunk.content)
          const embeddingStr = formatEmbeddingForPostgres(embedding)

          await pool.query(
            `UPDATE knowledge_base_chunks SET embedding = $1::vector WHERE id = $2`,
            [embeddingStr, chunk.chunk_id]
          )

          console.log(`  [OK] ${chunk.title} (chunk ${chunk.chunk_index}) — dims=${embedding.length}`)
          success++
        } catch (err) {
          console.error(`  [ERR] ${chunk.title} (chunk ${chunk.chunk_index}):`, err)
          errors++
        }
      })
    )

    // Pause courte entre batches pour ne pas surcharger Ollama
    if (i + CONCURRENCY < chunks.length) {
      await new Promise((r) => setTimeout(r, 200))
    }
  }

  console.log(`\n[Backfill] Terminé : ${success} OK, ${errors} erreurs`)

  if (errors > 0) {
    console.warn(`[Backfill] ${errors} chunks non traités — relancer le script pour réessayer`)
  }

  await pool.end()
}

main().catch((err) => {
  console.error('[Backfill FATAL]', err)
  process.exit(1)
})
