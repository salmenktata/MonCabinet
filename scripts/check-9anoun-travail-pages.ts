#!/usr/bin/env tsx

/**
 * Script pour diagnostiquer la couverture du Code du Travail dans la KB.
 * Analogue à check-9anoun-coc-pages.ts mais pour code-travail.
 *
 * Usage :
 *   DB_PASSWORD=<pwd> npx tsx scripts/check-9anoun-travail-pages.ts
 *
 * Prérequis : tunnel SSH actif sur port 5434
 *   ssh -f -N -L 5434:localhost:5432 root@84.247.165.187
 */

import { Pool } from 'pg'

const PROD_DB_CONFIG = {
  host: 'localhost',
  port: 5434,
  database: 'qadhya',
  user: 'moncabinet',
  password: process.env.DB_PASSWORD || 'moncabinet',
  connectionTimeoutMillis: 10000,
  query_timeout: 30000,
}

async function checkTravailPages() {
  const pool = new Pool(PROD_DB_CONFIG)

  try {
    console.log('\n🔍 Diagnostic Code du Travail — KB Qadhya')
    console.log('📡 Connexion à la base de production (port 5434)...\n')
    await pool.query('SELECT NOW()')
    console.log('✅ Connexion établie\n')

    // 1. Source 9anoun.tn
    const sourceResult = await pool.query(`
      SELECT id, name, base_url, status
      FROM web_sources
      WHERE base_url LIKE '%9anoun.tn%'
      LIMIT 1
    `)
    if (sourceResult.rows.length === 0) {
      console.log('❌ Source 9anoun.tn introuvable en DB')
      return
    }
    const source = sourceResult.rows[0]
    console.log(`✅ Source 9anoun.tn : ${source.id} (${source.status})\n`)

    // 2. Pages web_pages pour code-travail
    const pagesResult = await pool.query(`
      SELECT id, url, title, status, word_count, is_indexed, last_crawled_at
      FROM web_pages
      WHERE source_id = $1
        AND (
          url LIKE '%code-travail%'
          OR title ILIKE '%code du travail%'
          OR title LIKE '%مجلة الشغل%'
        )
      ORDER BY url
    `, [source.id])

    console.log(`📄 Pages Code du Travail trouvées : ${pagesResult.rows.length}`)

    if (pagesResult.rows.length === 0) {
      console.log('❌ Aucune page code-travail dans web_pages → le crawl n\'a jamais indexé ce code\n')
      console.log('💡 Action requise : lancer un crawl 9anoun.tn avec seed_url code-travail')
    } else {
      const byStatus = pagesResult.rows.reduce((acc: Record<string, typeof pagesResult.rows>, p) => {
        const s = p.status || 'unknown'
        if (!acc[s]) acc[s] = []
        acc[s].push(p)
        return acc
      }, {})

      for (const [status, pages] of Object.entries(byStatus)) {
        console.log(`\n  ${status.toUpperCase()} (${pages.length}) :`)
        for (const p of pages.slice(0, 5)) {
          console.log(`    ${p.is_indexed ? '✅' : '❌'} ${p.url}`)
          console.log(`       titre: ${p.title || 'N/A'} | mots: ${p.word_count || 0}`)
        }
        if (pages.length > 5) console.log(`    ... et ${pages.length - 5} autres`)
      }

      const indexed = pagesResult.rows.filter(p => p.is_indexed).length
      console.log(`\n📊 ${indexed}/${pagesResult.rows.length} pages indexées`)
    }

    // 3. Document consolidé Code du Travail dans knowledge_base
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')
    console.log('📚 Documents Code du Travail dans knowledge_base :')

    const kbResult = await pool.query(`
      SELECT id, title, category, doc_type, chunk_count, is_indexed,
             metadata->>'sourceOrigin' as source_origin,
             created_at, updated_at
      FROM knowledge_base
      WHERE title ILIKE '%travail%'
         OR title LIKE '%مجلة الشغل%'
      ORDER BY chunk_count DESC NULLS LAST
    `)

    if (kbResult.rows.length === 0) {
      console.log('❌ Aucun document "Code du Travail" dans knowledge_base')
    } else {
      for (const doc of kbResult.rows) {
        const indexed = doc.is_indexed ? '✅' : '❌'
        console.log(`  ${indexed} [${doc.id.substring(0, 8)}] ${doc.title}`)
        console.log(`     chunks: ${doc.chunk_count || 0} | cat: ${doc.category} | type: ${doc.doc_type}`)
        console.log(`     source: ${doc.source_origin} | updated: ${doc.updated_at?.toISOString().split('T')[0]}`)
      }
    }

    // 4. Chunks dans knowledge_base_chunks pour le doc KB-4 ou code travail
    const chunksResult = await pool.query(`
      SELECT kbc.id, kbc.chunk_index, LEFT(kbc.content, 120) as preview,
             kbc.metadata->>'article_number' as article_number
      FROM knowledge_base_chunks kbc
      JOIN knowledge_base kb ON kb.id = kbc.knowledge_base_id
      WHERE kb.title ILIKE '%travail%' OR kb.title LIKE '%مجلة الشغل%'
      ORDER BY kbc.chunk_index
      LIMIT 20
    `)

    console.log(`\n📦 Chunks Code du Travail (max 20) : ${chunksResult.rows.length} trouvés`)
    for (const c of chunksResult.rows) {
      const art = c.article_number ? `[Art.${c.article_number}]` : '[sans art.]'
      console.log(`  chunk #${c.chunk_index} ${art} : ${c.preview?.replace(/\n/g, ' ')}...`)
    }

    // 5. web_pages_documents (lien pages → document KB)
    if (kbResult.rows.length > 0) {
      const kbIds = kbResult.rows.map((r: { id: string }) => r.id)
      const linksResult = await pool.query(`
        SELECT wpd.knowledge_base_id, COUNT(wpd.web_page_id) as linked_pages
        FROM web_pages_documents wpd
        WHERE wpd.knowledge_base_id = ANY($1)
        GROUP BY wpd.knowledge_base_id
      `, [kbIds])

      console.log('\n🔗 web_pages_documents (pages liées au doc KB) :')
      if (linksResult.rows.length === 0) {
        console.log('  ❌ Aucun lien web_pages_documents → reconsolidation impossible sans lien')
      } else {
        for (const r of linksResult.rows) {
          console.log(`  Doc ${r.knowledge_base_id.substring(0, 8)} → ${r.linked_pages} pages liées`)
        }
      }
    }

  } catch (err) {
    console.error('❌ Erreur :', err)
    if (err instanceof Error && (err.message.includes('ECONNREFUSED') || err.message.includes('ECONNRESET'))) {
      console.error('\n💡 Tunnel SSH probablement inactif.')
      console.error('   Lancer : ssh -f -N -L 5434:localhost:5432 root@84.247.165.187')
    }
  } finally {
    await pool.end()
    console.log('\n🔌 Connexion fermée\n')
  }
}

checkTravailPages()
