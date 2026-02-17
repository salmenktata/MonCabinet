#!/usr/bin/env tsx
/**
 * Script de re-chunking des documents avec chunks trop grands
 *
 * Identifie les documents dont les chunks dépassent 2000 caractères
 * et les re-chunke avec la nouvelle configuration (RAG_CHUNK_SIZE=400)
 *
 * Usage:
 *   npm run rechunk:large
 *
 * Options:
 *   --dry-run    : Affiche les documents à re-chunker sans les modifier
 *   --limit=N    : Limite le nombre de documents à traiter
 *
 * @author Claude Code
 * @date 2026-02-10
 */

import { db } from '@/lib/db/postgres'
import { chunkText } from '@/lib/ai/chunking-service'
import { generateEmbedding } from '@/lib/ai/embeddings-service'

// ============================================================================
// Configuration
// ============================================================================

const MAX_CHUNK_CHARS = 2000
const DRY_RUN = process.argv.includes('--dry-run')
const LIMIT = parseInt(process.argv.find(arg => arg.startsWith('--limit='))?.split('=')[1] || '999', 10)

// ============================================================================
// Fonctions principales
// ============================================================================

async function identifyProblematicDocuments() {
  console.log('🔍 Identification des documents avec chunks trop grands...\n')

  const result = await db.query<{
    doc_id: string
    title: string
    category: string
    total_chunks: number
    large_chunks: number
    max_chars: number
    avg_chars: number
  }>(`
    SELECT
      kb.id as doc_id,
      kb.title,
      kb.category,
      COUNT(kbc.id) as total_chunks,
      COUNT(*) FILTER (WHERE LENGTH(kbc.content) > $1) as large_chunks,
      MAX(LENGTH(kbc.content)) as max_chars,
      ROUND(AVG(LENGTH(kbc.content))) as avg_chars
    FROM knowledge_base kb
    JOIN knowledge_base_chunks kbc ON kb.id = kbc.knowledge_base_id
    WHERE kb.is_active = true
    GROUP BY kb.id, kb.title, kb.category
    HAVING COUNT(*) FILTER (WHERE LENGTH(kbc.content) > $1) > 0
    ORDER BY large_chunks DESC, max_chars DESC
    LIMIT $2
  `, [MAX_CHUNK_CHARS, LIMIT])

  return result.rows
}

async function rechunkDocument(docId: string, title: string, category: string) {
  console.log(`\n📝 Re-chunking "${title}" (${docId})...`)

  // 1. Récupérer le texte complet du document
  const docResult = await db.query<{
    full_text: string
  }>(`
    SELECT full_text
    FROM knowledge_base
    WHERE id = $1
  `, [docId])

  if (docResult.rows.length === 0 || !docResult.rows[0].full_text) {
    console.error(`   ❌ Document sans full_text`)
    return { success: false, error: 'No full_text' }
  }

  const fullText = docResult.rows[0].full_text
  const wordCount = fullText.split(/\s+/).length

  console.log(`   📊 Texte complet: ${wordCount} mots, ${fullText.length} caractères`)

  // 2. Supprimer les anciens chunks
  await db.query(`
    DELETE FROM knowledge_base_chunks
    WHERE knowledge_base_id = $1
  `, [docId])

  console.log(`   🗑️  Anciens chunks supprimés`)

  // 3. Re-chunker avec la nouvelle configuration
  const startTime = Date.now()
  const newChunks = chunkText(fullText, {
    category: category.toLowerCase(),
    preserveParagraphs: true,
    preserveSentences: true,
  })

  console.log(`   ✂️  Nouveau chunking: ${newChunks.length} chunks (${Date.now() - startTime}ms)`)

  // Statistiques des nouveaux chunks
  const chunkSizes = newChunks.map(c => c.content.length)
  const avgSize = Math.round(chunkSizes.reduce((a, b) => a + b, 0) / chunkSizes.length)
  const maxSize = Math.max(...chunkSizes)
  const minSize = Math.min(...chunkSizes)

  console.log(`   📊 Taille chunks: min=${minSize}, max=${maxSize}, moy=${avgSize} chars`)

  // 4. Générer embeddings et insérer les nouveaux chunks
  let successCount = 0
  let errorCount = 0

  for (const [index, chunk] of newChunks.entries()) {
    try {
      // Générer embedding
      const embedding = await generateEmbedding(chunk.content)

      // Insérer le chunk avec embedding
      await db.query(`
        INSERT INTO knowledge_base_chunks (
          knowledge_base_id,
          chunk_index,
          content,
          word_count,
          char_count,
          embedding
        ) VALUES ($1, $2, $3, $4, $5, $6)
      `, [
        docId,
        index,
        chunk.content,
        chunk.metadata.wordCount,
        chunk.metadata.charCount,
        JSON.stringify(embedding),
      ])

      successCount++
    } catch (error) {
      console.error(`   ❌ Erreur chunk ${index}:`, error.message)
      errorCount++
    }
  }

  // 5. Mettre à jour le compteur de chunks dans knowledge_base
  await db.query(`
    UPDATE knowledge_base
    SET chunk_count = $1,
        updated_at = NOW()
    WHERE id = $2
  `, [successCount, docId])

  console.log(`   ✅ ${successCount}/${newChunks.length} chunks insérés avec embeddings`)

  return {
    success: errorCount === 0,
    oldChunks: null, // Supprimés avant comptage
    newChunks: newChunks.length,
    inserted: successCount,
    failed: errorCount,
  }
}

async function main() {
  console.log('═══════════════════════════════════════════════════════════════')
  console.log('  Re-chunking Documents avec Chunks Trop Grands')
  console.log('═══════════════════════════════════════════════════════════════')
  console.log('')
  console.log(`Configuration:`)
  console.log(`  - Seuil max: ${MAX_CHUNK_CHARS} caractères`)
  console.log(`  - Limite: ${LIMIT} documents`)
  console.log(`  - Mode: ${DRY_RUN ? 'DRY RUN (simulation)' : 'PRODUCTION'}`)
  console.log('')

  // 1. Identifier les documents problématiques
  const problematicDocs = await identifyProblematicDocuments()

  if (problematicDocs.length === 0) {
    console.log('✅ Aucun document avec chunks trop grands trouvé !')
    process.exit(0)
  }

  console.log(`📋 ${problematicDocs.length} documents identifiés:\n`)

  // Afficher le tableau récapitulatif
  console.log('┌─────────────────────────────────────────────────────────────────────┐')
  console.log('│ Titre                       │ Catégorie      │ Chunks │ Large │ Max  │')
  console.log('├─────────────────────────────────────────────────────────────────────┤')

  for (const doc of problematicDocs) {
    const title = doc.title.substring(0, 27).padEnd(27)
    const category = doc.category.padEnd(14)
    const total = String(doc.total_chunks).padStart(6)
    const large = String(doc.large_chunks).padStart(5)
    const max = String(doc.max_chars).padStart(5)

    console.log(`│ ${title} │ ${category} │ ${total} │ ${large} │ ${max} │`)
  }

  console.log('└─────────────────────────────────────────────────────────────────────┘')

  if (DRY_RUN) {
    console.log('\n✅ Mode DRY RUN - Aucun document modifié')
    console.log('\nPour re-chunker ces documents, relancez sans --dry-run:')
    console.log('  npm run rechunk:large')
    process.exit(0)
  }

  // 2. Demander confirmation
  console.log('\n⚠️  ATTENTION: Cette opération va:')
  console.log('   - Supprimer les anciens chunks')
  console.log('   - Re-chunker les documents avec la nouvelle config (RAG_CHUNK_SIZE=400)')
  console.log('   - Régénérer tous les embeddings')
  console.log('')

  // 3. Re-chunker chaque document
  const results: Array<{
    docId: string
    title: string
    success: boolean
    newChunks?: number
    error?: string
  }> = []

  const startTime = Date.now()

  for (const [index, doc] of problematicDocs.entries()) {
    console.log(`\n[${index + 1}/${problematicDocs.length}] ───────────────────────────────────────`)

    try {
      const result = await rechunkDocument(doc.doc_id, doc.title, doc.category)

      results.push({
        docId: doc.doc_id,
        title: doc.title,
        success: result.success,
        newChunks: result.newChunks,
      })
    } catch (error) {
      console.error(`❌ Erreur globale:`, error.message)

      results.push({
        docId: doc.doc_id,
        title: doc.title,
        success: false,
        error: getErrorMessage(error),
      })
    }
  }

  const totalTime = Date.now() - startTime
  const avgTime = Math.round(totalTime / problematicDocs.length)

  // 4. Résumé
  const succeeded = results.filter(r => r.success).length
  const failed = results.filter(r => !r.success).length

  console.log('\n\n═══════════════════════════════════════════════════════════════')
  console.log('  📊 Résumé Final')
  console.log('═══════════════════════════════════════════════════════════════')
  console.log('')
  console.log(`Documents:`)
  console.log(`  ✅ Réussis: ${succeeded}/${problematicDocs.length}`)
  console.log(`  ❌ Échoués: ${failed}`)
  console.log('')
  console.log(`Temps:`)
  console.log(`  ⏱️  Total: ${Math.round(totalTime / 1000)}s`)
  console.log(`  ⏱️  Moyen/doc: ${Math.round(avgTime / 1000)}s`)
  console.log('')

  if (failed > 0) {
    console.log('❌ Documents échoués:')
    results.filter(r => !r.success).forEach(r => {
      console.log(`   - ${r.title}: ${r.error || 'Erreur inconnue'}`)
    })
  }

  console.log('═══════════════════════════════════════════════════════════════')

  process.exit(failed > 0 ? 1 : 0)
}

// Exécuter
main().catch(error => {
  console.error('\n❌ Erreur fatale:', error)
  process.exit(1)
})
