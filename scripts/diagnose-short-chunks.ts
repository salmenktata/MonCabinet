#!/usr/bin/env tsx
/**
 * Script de diagnostic des chunks courts/vides dans la KB
 *
 * Analyse les anomalies d'indexation :
 * - Distribution des chunks par taille
 * - Chunks vides ou quasi-vides (<50 chars)
 * - Chunks courts (<40 mots) hors dernier chunk (qui auraient dû être filtrés)
 * - Top docs avec le plus de chunks courts
 * - Docs indexés avec 0 chunks réels (désynchronisation)
 * - Embeddings manquants (chunks non retrouvables via RAG)
 *
 * Usage:
 *   npx tsx scripts/diagnose-short-chunks.ts
 *   npx tsx scripts/diagnose-short-chunks.ts --category=codes
 *   npx tsx scripts/diagnose-short-chunks.ts --rag-only   (filtre rag_enabled=true)
 */

import { db } from '../lib/db/postgres'

const args = process.argv.slice(2)
const filterCategory = args.find(a => a.startsWith('--category='))?.split('=')[1] || null
const ragOnly = args.includes('--rag-only')

function hr(char = '─', len = 80) {
  return char.repeat(len)
}

function pct(n: number, total: number): string {
  if (total === 0) return '0.0%'
  return `${((n / total) * 100).toFixed(1)}%`
}

async function main() {
  console.log('\n🔬 DIAGNOSTIC CHUNKS COURTS/VIDES — KB Qadhya')
  console.log(hr('═'))
  if (filterCategory) console.log(`🔎 Filtre catégorie : ${filterCategory}`)
  if (ragOnly) console.log(`🔎 Filtre RAG enabled uniquement`)
  console.log()

  const categoryFilter = filterCategory ? `AND kb.category = '${filterCategory}'` : ''
  const ragFilter = ragOnly
    ? `AND EXISTS (
        SELECT 1 FROM web_pages wp
        JOIN web_sources ws ON ws.id = wp.web_source_id
        WHERE wp.knowledge_base_id = kb.id AND ws.rag_enabled = true
      ) OR kb.rag_enabled = true`
    : ''

  try {
    // =========================================================================
    // 1. Vue d'ensemble globale
    // =========================================================================
    console.log('📊 1. VUE D\'ENSEMBLE GLOBALE')
    console.log(hr())

    const overview = await db.query<{
      total_chunks: number
      total_docs: number
      avg_chunks_per_doc: number
      min_chars: number
      max_chars: number
      avg_chars: number
      median_chars: number
    }>(`
      SELECT
        COUNT(kbc.id)::int AS total_chunks,
        COUNT(DISTINCT kbc.knowledge_base_id)::int AS total_docs,
        ROUND(COUNT(kbc.id)::numeric / NULLIF(COUNT(DISTINCT kbc.knowledge_base_id), 0), 1)::float AS avg_chunks_per_doc,
        MIN(LENGTH(kbc.content))::int AS min_chars,
        MAX(LENGTH(kbc.content))::int AS max_chars,
        ROUND(AVG(LENGTH(kbc.content)))::int AS avg_chars,
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY LENGTH(kbc.content))::int AS median_chars
      FROM knowledge_base_chunks kbc
      JOIN knowledge_base kb ON kb.id = kbc.knowledge_base_id
      WHERE kb.is_indexed = true
      ${categoryFilter}
    `)

    const o = overview.rows[0]
    console.log(`  Total chunks      : ${o.total_chunks.toLocaleString()}`)
    console.log(`  Total docs        : ${o.total_docs.toLocaleString()}`)
    console.log(`  Moy chunks/doc    : ${o.avg_chunks_per_doc}`)
    console.log(`  Taille (chars)    : min=${o.min_chars} | moy=${o.avg_chars} | médiane=${o.median_chars} | max=${o.max_chars}`)
    console.log()

    // =========================================================================
    // 2. Distribution par tranches de taille
    // =========================================================================
    console.log('📏 2. DISTRIBUTION PAR TAILLE DE CHUNK')
    console.log(hr())

    const distribution = await db.query<{
      size_range: string
      chunk_count: number
      pct: number
    }>(`
      SELECT
        CASE
          WHEN LENGTH(kbc.content) = 0                 THEN '0 — vide'
          WHEN LENGTH(kbc.content) < 50                THEN '1-49 chars (quasi-vide)'
          WHEN LENGTH(kbc.content) < 200               THEN '50-199 chars (très court)'
          WHEN LENGTH(kbc.content) < 500               THEN '200-499 chars (court)'
          WHEN LENGTH(kbc.content) < 1500              THEN '500-1499 chars (normal)'
          WHEN LENGTH(kbc.content) < 4000              THEN '1500-3999 chars (long)'
          ELSE '4000+ chars (très long)'
        END AS size_range,
        COUNT(*)::int AS chunk_count,
        ROUND(100.0 * COUNT(*) / (
          SELECT COUNT(*) FROM knowledge_base_chunks kbc2
          JOIN knowledge_base kb2 ON kb2.id = kbc2.knowledge_base_id
          WHERE kb2.is_indexed = true ${categoryFilter}
        ), 1)::float AS pct
      FROM knowledge_base_chunks kbc
      JOIN knowledge_base kb ON kb.id = kbc.knowledge_base_id
      WHERE kb.is_indexed = true ${categoryFilter}
      GROUP BY size_range
      ORDER BY MIN(LENGTH(kbc.content))
    `)

    const totalChunks = o.total_chunks
    console.log(`  ${'Tranche'.padEnd(30)} ${'Chunks'.padStart(8)}  ${'%'.padStart(6)}  Barre`)
    console.log(`  ${hr('-', 70)}`)
    for (const row of distribution.rows) {
      const bar = '█'.repeat(Math.round(row.pct / 2))
      console.log(`  ${row.size_range.padEnd(30)} ${row.chunk_count.toString().padStart(8)}  ${row.pct.toString().padStart(5)}%  ${bar}`)
    }
    console.log()

    // =========================================================================
    // 3. Chunks vides ou quasi-vides (<50 chars)
    // =========================================================================
    console.log('🚨 3. CHUNKS VIDES OU QUASI-VIDES (< 50 chars)')
    console.log(hr())

    const emptyChunks = await db.query<{
      id: string
      title: string
      category: string
      chars: number
      chunk_index: number
      total_chunks_doc: number
      content_preview: string
    }>(`
      SELECT
        kbc.id,
        kb.title,
        kb.category,
        LENGTH(kbc.content)::int AS chars,
        kbc.chunk_index::int,
        COUNT(*) OVER (PARTITION BY kbc.knowledge_base_id)::int AS total_chunks_doc,
        LEFT(kbc.content, 80) AS content_preview
      FROM knowledge_base_chunks kbc
      JOIN knowledge_base kb ON kb.id = kbc.knowledge_base_id
      WHERE kb.is_indexed = true
        AND LENGTH(kbc.content) < 50
        ${categoryFilter}
      ORDER BY LENGTH(kbc.content), kb.category
    `)

    if (emptyChunks.rows.length === 0) {
      console.log('  ✅ Aucun chunk vide ou quasi-vide trouvé')
    } else {
      console.log(`  ⚠️  ${emptyChunks.rows.length} chunks < 50 chars\n`)
      for (const row of emptyChunks.rows) {
        console.log(`  [${row.chars} chars] idx=${row.chunk_index}/${row.total_chunks_doc - 1} | ${row.category} | "${row.title?.substring(0, 50)}"`)
        console.log(`           → "${row.content_preview}"`)
      }
    }
    console.log()

    // =========================================================================
    // 4. Chunks courts (<40 mots) hors dernier chunk — auraient dû être filtrés
    // =========================================================================
    console.log('⚠️  4. CHUNKS COURTS (< 40 mots) HORS DERNIER CHUNK')
    console.log(hr())
    console.log('   Ces chunks auraient dû être filtrés par MIN_CHUNK_WORDS=40 lors du chunking.')
    console.log('   Présence = documents chunkés AVANT le fix Feb 24, 2026.\n')

    const shortByCat = await db.query<{
      category: string
      suspicious_chunks: number
      avg_words: number
      total_chunks_cat: number
      pct_short: number
    }>(`
      WITH chunk_ranks AS (
        SELECT
          kbc.id,
          kb.category,
          (LENGTH(kbc.content) - LENGTH(REPLACE(kbc.content, ' ', '')) + 1) AS word_count,
          ROW_NUMBER() OVER (PARTITION BY kbc.knowledge_base_id ORDER BY kbc.chunk_index DESC) AS rev_rank,
          COUNT(*) OVER (PARTITION BY kb.category) AS total_chunks_cat
        FROM knowledge_base_chunks kbc
        JOIN knowledge_base kb ON kb.id = kbc.knowledge_base_id
        WHERE kb.is_indexed = true ${categoryFilter}
      )
      SELECT
        category,
        COUNT(*) FILTER (WHERE word_count < 40 AND rev_rank > 1)::int AS suspicious_chunks,
        ROUND(AVG(word_count) FILTER (WHERE word_count < 40 AND rev_rank > 1), 1)::float AS avg_words,
        MAX(total_chunks_cat)::int AS total_chunks_cat,
        ROUND(100.0 * COUNT(*) FILTER (WHERE word_count < 40 AND rev_rank > 1)
          / NULLIF(MAX(total_chunks_cat), 0), 1)::float AS pct_short
      FROM chunk_ranks
      GROUP BY category
      HAVING COUNT(*) FILTER (WHERE word_count < 40 AND rev_rank > 1) > 0
      ORDER BY suspicious_chunks DESC
    `)

    if (shortByCat.rows.length === 0) {
      console.log('  ✅ Aucun chunk court suspect (hors dernier chunk)')
    } else {
      const totalSuspicious = shortByCat.rows.reduce((s, r) => s + r.suspicious_chunks, 0)
      console.log(`  Total suspects : ${totalSuspicious} chunks (${pct(totalSuspicious, totalChunks)} de la KB)\n`)
      console.log(`  ${'Catégorie'.padEnd(20)} ${'Courts'.padStart(8)}  ${'Moy mots'.padStart(10)}  ${'% de cat'.padStart(10)}`)
      console.log(`  ${hr('-', 55)}`)
      for (const row of shortByCat.rows) {
        const flag = row.pct_short > 10 ? ' 🔴' : row.pct_short > 5 ? ' 🟡' : ' 🟢'
        console.log(`  ${row.category.padEnd(20)} ${row.suspicious_chunks.toString().padStart(8)}  ${row.avg_words.toString().padStart(10)}  ${row.pct_short.toString().padStart(9)}%${flag}`)
      }
    }
    console.log()

    // =========================================================================
    // 5. Top 20 docs avec le plus de chunks courts
    // =========================================================================
    console.log('📋 5. TOP 20 DOCUMENTS AVEC CHUNKS COURTS')
    console.log(hr())

    const topShortDocs = await db.query<{
      title: string
      category: string
      doc_type: string
      chunk_count: number
      short_chunks: number
      pct_short: number
    }>(`
      WITH chunk_ranks AS (
        SELECT
          kbc.knowledge_base_id,
          (LENGTH(kbc.content) - LENGTH(REPLACE(kbc.content, ' ', '')) + 1) AS word_count,
          ROW_NUMBER() OVER (PARTITION BY kbc.knowledge_base_id ORDER BY kbc.chunk_index DESC) AS rev_rank
        FROM knowledge_base_chunks kbc
        JOIN knowledge_base kb ON kb.id = kbc.knowledge_base_id
        WHERE kb.is_indexed = true ${categoryFilter}
      )
      SELECT
        kb.title,
        kb.category,
        COALESCE(kb.doc_type::text, 'NULL') AS doc_type,
        kb.chunk_count::int,
        COUNT(*) FILTER (WHERE word_count < 40 AND rev_rank > 1)::int AS short_chunks,
        ROUND(100.0 * COUNT(*) FILTER (WHERE word_count < 40 AND rev_rank > 1)
          / NULLIF(kb.chunk_count, 0), 1)::float AS pct_short
      FROM chunk_ranks cr
      JOIN knowledge_base kb ON kb.id = cr.knowledge_base_id
      GROUP BY kb.id, kb.title, kb.category, kb.doc_type, kb.chunk_count
      HAVING COUNT(*) FILTER (WHERE word_count < 40 AND rev_rank > 1) > 0
      ORDER BY short_chunks DESC
      LIMIT 20
    `)

    if (topShortDocs.rows.length === 0) {
      console.log('  ✅ Aucun document avec chunks courts suspects')
    } else {
      for (const row of topShortDocs.rows) {
        const flag = row.pct_short > 50 ? '🔴' : row.pct_short > 25 ? '🟡' : '🟢'
        console.log(`  ${flag} ${row.short_chunks} courts / ${row.chunk_count} total (${row.pct_short}%) [${row.category}/${row.doc_type}]`)
        console.log(`     "${row.title?.substring(0, 70)}"`)
      }
    }
    console.log()

    // =========================================================================
    // 6. Docs indexés avec 0 chunks réels (désynchronisation)
    // =========================================================================
    console.log('🔗 6. DOCUMENTS INDEXÉS SANS CHUNKS (DÉSYNCHRONISATION)')
    console.log(hr())

    const missingChunks = await db.query<{
      id: string
      title: string
      category: string
      recorded: number
      actual: number
    }>(`
      SELECT
        kb.id,
        kb.title,
        kb.category,
        kb.chunk_count::int AS recorded,
        COUNT(kbc.id)::int AS actual
      FROM knowledge_base kb
      LEFT JOIN knowledge_base_chunks kbc ON kbc.knowledge_base_id = kb.id
      WHERE kb.is_indexed = true ${categoryFilter}
      GROUP BY kb.id, kb.title, kb.category, kb.chunk_count
      HAVING COUNT(kbc.id) = 0
      ORDER BY kb.updated_at DESC
    `)

    if (missingChunks.rows.length === 0) {
      console.log('  ✅ Tous les docs indexés ont des chunks en DB')
    } else {
      console.log(`  ⚠️  ${missingChunks.rows.length} docs indexés sans chunks\n`)
      for (const row of missingChunks.rows) {
        console.log(`  🔴 recorded=${row.recorded} actual=0 | [${row.category}] "${row.title?.substring(0, 60)}"`)
        console.log(`     id=${row.id}`)
      }
    }
    console.log()

    // =========================================================================
    // 7. Désynchronisation chunk_count vs chunks réels
    // =========================================================================
    console.log('🔢 7. DÉSYNCHRONISATION chunk_count ENREGISTRÉ vs RÉEL')
    console.log(hr())

    const chunkCountMismatch = await db.query<{
      title: string
      category: string
      recorded: number
      actual: number
      delta: number
    }>(`
      WITH actual_chunks AS (
        SELECT knowledge_base_id, COUNT(*)::int AS actual_count
        FROM knowledge_base_chunks
        GROUP BY knowledge_base_id
      )
      SELECT
        kb.title,
        kb.category,
        kb.chunk_count::int AS recorded,
        ac.actual_count AS actual,
        (ac.actual_count - kb.chunk_count)::int AS delta
      FROM knowledge_base kb
      JOIN actual_chunks ac ON ac.knowledge_base_id = kb.id
      WHERE kb.is_indexed = true
        AND kb.chunk_count != ac.actual_count
        ${categoryFilter}
      ORDER BY ABS(ac.actual_count - kb.chunk_count) DESC
      LIMIT 20
    `)

    if (chunkCountMismatch.rows.length === 0) {
      console.log('  ✅ chunk_count cohérent avec les chunks en DB')
    } else {
      console.log(`  ⚠️  ${chunkCountMismatch.rows.length} docs avec chunk_count désynchronisé (top 20)\n`)
      console.log(`  ${'Titre'.padEnd(50)} ${'Enreg.'.padStart(8)}  ${'Réel'.padStart(6)}  ${'Delta'.padStart(6)}`)
      console.log(`  ${hr('-', 75)}`)
      for (const row of chunkCountMismatch.rows) {
        const sign = row.delta > 0 ? '+' : ''
        console.log(`  ${row.title?.substring(0, 50).padEnd(50)} ${row.recorded.toString().padStart(8)}  ${row.actual.toString().padStart(6)}  ${(sign + row.delta).padStart(6)}`)
      }
    }
    console.log()

    // =========================================================================
    // 8. Embeddings manquants
    // =========================================================================
    console.log('🧮 8. EMBEDDINGS MANQUANTS (chunks non retrouvables via RAG)')
    console.log(hr())

    const embeddings = await db.query<{
      no_ollama_emb: number
      no_openai_emb: number
      no_gemini_emb: number
      no_emb_at_all: number
      total: number
    }>(`
      SELECT
        COUNT(*) FILTER (WHERE kbc.embedding IS NULL)::int AS no_ollama_emb,
        COUNT(*) FILTER (WHERE kbc.embedding_openai IS NULL)::int AS no_openai_emb,
        COUNT(*) FILTER (WHERE kbc.embedding_gemini IS NULL)::int AS no_gemini_emb,
        COUNT(*) FILTER (WHERE kbc.embedding IS NULL AND kbc.embedding_openai IS NULL AND kbc.embedding_gemini IS NULL)::int AS no_emb_at_all,
        COUNT(*)::int AS total
      FROM knowledge_base_chunks kbc
      JOIN knowledge_base kb ON kb.id = kbc.knowledge_base_id
      WHERE kb.is_indexed = true ${categoryFilter}
    `)

    const emb = embeddings.rows[0]
    console.log(`  Total chunks indexés : ${emb.total.toLocaleString()}`)
    console.log(`  Sans Ollama emb      : ${emb.no_ollama_emb.toLocaleString()} (${pct(emb.no_ollama_emb, emb.total)})`)
    console.log(`  Sans OpenAI emb      : ${emb.no_openai_emb.toLocaleString()} (${pct(emb.no_openai_emb, emb.total)})`)
    console.log(`  Sans Gemini emb      : ${emb.no_gemini_emb.toLocaleString()} (${pct(emb.no_gemini_emb, emb.total)})`)
    console.log()
    if (emb.no_emb_at_all > 0) {
      console.log(`  🔴 CRITIQUE : ${emb.no_emb_at_all} chunks sans AUCUN embedding → invisibles pour le RAG !`)
    } else {
      console.log(`  ✅ Tous les chunks ont au moins un embedding`)
    }
    console.log()

    // =========================================================================
    // 9. Résumé & recommandations
    // =========================================================================
    console.log(hr('═'))
    console.log('📋 RÉSUMÉ & RECOMMANDATIONS')
    console.log(hr('═'))

    const tinyChunks = distribution.rows.find(r => r.size_range.includes('quasi-vide'))?.chunk_count || 0
    const veryShortChunks = distribution.rows.find(r => r.size_range.includes('très court'))?.chunk_count || 0
    const totalSuspect = shortByCat.rows.reduce((s, r) => s + r.suspicious_chunks, 0)

    if (emptyChunks.rows.length > 0) {
      console.log(`  🔴 ACTION REQUISE : ${emptyChunks.rows.length} chunks quasi-vides (<50 chars)`)
      console.log(`     → Supprimer via SQL ou désactiver les documents parent`)
    }
    if (missingChunks.rows.length > 0) {
      console.log(`  🔴 ACTION REQUISE : ${missingChunks.rows.length} docs indexés sans chunks`)
      console.log(`     → Relancer l'indexation : POST /api/admin/kb/reindex-articles`)
    }
    if (emb.no_emb_at_all > 0) {
      console.log(`  🔴 ACTION REQUISE : ${emb.no_emb_at_all} chunks sans embedding`)
      console.log(`     → Relancer : POST /api/admin/kb/reindex-kb-ollama`)
    }
    if (totalSuspect > 0) {
      const pctSuspect = ((totalSuspect / totalChunks) * 100).toFixed(1)
      const severity = parseFloat(pctSuspect) > 10 ? '🔴' : parseFloat(pctSuspect) > 3 ? '🟡' : '🟢'
      console.log(`  ${severity} ${totalSuspect} chunks courts suspects (${pctSuspect}% de la KB)`)
      if (parseFloat(pctSuspect) > 3) {
        console.log(`     → Rechunker les documents concernés : POST /api/admin/kb/rechunk-large`)
      }
    }
    if (chunkCountMismatch.rows.length > 0) {
      console.log(`  🟡 ${chunkCountMismatch.rows.length} docs avec chunk_count désynchronisé`)
      console.log(`     → Corriger : UPDATE knowledge_base SET chunk_count = (SELECT COUNT(*) FROM knowledge_base_chunks WHERE knowledge_base_id = id)`)
    }
    if (emb.no_ollama_emb > 0) {
      console.log(`  🟡 ${emb.no_ollama_emb.toLocaleString()} chunks sans embedding Ollama`)
      console.log(`     → Relancer : POST /api/admin/index-kb (reindex-kb-ollama)`)
    }

    const allOk = emptyChunks.rows.length === 0 && missingChunks.rows.length === 0
      && emb.no_emb_at_all === 0 && totalSuspect === 0 && chunkCountMismatch.rows.length === 0
    if (allOk) {
      console.log('  ✅ Aucune anomalie critique détectée — KB en bonne santé !')
    }
    console.log()

  } catch (err) {
    console.error('❌ Erreur lors de l\'analyse :', err)
    process.exit(1)
  } finally {
    await db.end()
  }
}

main()
