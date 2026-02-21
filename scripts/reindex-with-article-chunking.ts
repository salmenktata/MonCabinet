#!/usr/bin/env tsx
/**
 * Script de réindexation avec chunking article-level (Phase 3)
 *
 * Permet de migrer des documents vers la stratégie de chunking par article.
 * Utile pour les codes juridiques où chaque article doit être un chunk indépendant.
 *
 * Usage:
 *   # Dry-run (affichage sans modification)
 *   npx tsx scripts/reindex-with-article-chunking.ts --dry-run
 *
 *   # Réindexer tous les codes
 *   npx tsx scripts/reindex-with-article-chunking.ts --category=codes
 *
 *   # Réindexer un document spécifique
 *   npx tsx scripts/reindex-with-article-chunking.ts --id=<uuid>
 *
 *   # Limiter le nombre de documents
 *   npx tsx scripts/reindex-with-article-chunking.ts --category=codes --limit=5
 */

import { db } from '../lib/db/postgres'
import { indexKnowledgeDocument } from '../lib/ai/knowledge-base-service'

// =============================================================================
// ARGUMENTS CLI
// =============================================================================

const args = process.argv.slice(2)
const flags = {
  dryRun: args.includes('--dry-run'),
  id: args.find((a) => a.startsWith('--id='))?.split('=')[1],
  category: args.find((a) => a.startsWith('--category='))?.split('=')[1],
  limit: parseInt(args.find((a) => a.startsWith('--limit='))?.split('=')[1] || '0') || undefined,
}

console.log('🔧 Réindexation avec chunking article-level (Phase 3)\n')
console.log('Paramètres:', flags, '\n')

// =============================================================================
// FONCTIONS PRINCIPALES
// =============================================================================

/**
 * Récupère les documents candidats pour la migration
 */
async function getCandidateDocuments() {
  let query = `
    SELECT
      kb.id,
      kb.title,
      kb.category,
      kb.language,
      kb.chunking_strategy,
      kb.chunk_count,
      LENGTH(kb.full_text) as text_length,
      -- Détecte si le document contient des articles
      CASE
        WHEN kb.language = 'fr' AND kb.full_text ~* '(?:Article|art\.?)\s+\d+' THEN true
        WHEN kb.language = 'ar' AND kb.full_text ~ '(?:الفصل|فصل)\s+\d+' THEN true
        ELSE false
      END as has_articles,
      -- Estime nombre d'articles
      CASE
        WHEN kb.language = 'fr' THEN
          (SELECT COUNT(*) FROM regexp_matches(kb.full_text, '(?:Article|art\.?)\s+\d+', 'gi'))
        WHEN kb.language = 'ar' THEN
          (SELECT COUNT(*) FROM regexp_matches(kb.full_text, '(?:الفصل|فصل)\s+\d+', 'g'))
        ELSE 0
      END as estimated_articles
    FROM knowledge_base kb
    WHERE kb.is_active = true
  `

  const conditions: string[] = []
  const values: any[] = []

  // Filtrer par ID si fourni
  if (flags.id) {
    conditions.push(`kb.id = $${values.length + 1}`)
    values.push(flags.id)
  } else {
    // Sinon, filtrer par catégorie et stratégie
    if (flags.category) {
      conditions.push(`kb.category = $${values.length + 1}`)
      values.push(flags.category)
    } else {
      // Par défaut: catégories juridiques
      conditions.push(`kb.category IN ('codes', 'legislation', 'constitution', 'jort')`)
    }

    // Seulement documents pas encore migrés
    conditions.push(`(kb.chunking_strategy IS NULL OR kb.chunking_strategy = 'adaptive')`)
  }

  if (conditions.length > 0) {
    query += ` AND ${conditions.join(' AND ')}`
  }

  query += ` ORDER BY estimated_articles DESC`

  if (flags.limit) {
    query += ` LIMIT ${flags.limit}`
  }

  const result = await db.query(query, values)
  return result.rows
}

/**
 * Réindexe un document avec stratégie article-level
 */
async function reindexDocument(doc: any): Promise<{
  success: boolean
  chunksCreated: number
  error?: string
}> {
  console.log(`\n📄 ${doc.title}`)
  console.log(`   Catégorie: ${doc.category}, Langue: ${doc.language}`)
  console.log(`   Stratégie actuelle: ${doc.chunking_strategy || 'adaptive'}`)
  console.log(`   Chunks actuels: ${doc.chunk_count || 0}`)
  console.log(`   Articles estimés: ${doc.estimated_articles}`)

  if (!doc.has_articles) {
    console.log('   ⚠️  Aucun article détecté dans le texte, skip')
    return { success: false, chunksCreated: 0, error: 'Aucun article détecté' }
  }

  if (flags.dryRun) {
    console.log('   ⏭️  DRY-RUN : Pas de modification (utiliser sans --dry-run pour réindexer)')
    return { success: true, chunksCreated: doc.estimated_articles }
  }

  // Marquer pour re-chunking (supprime anciens chunks)
  await db.query(
    `SELECT mark_for_rechunking($1, 'article'::chunking_strategy)`,
    [doc.id]
  )

  // Réindexer avec stratégie article
  const result = await indexKnowledgeDocument(doc.id, { strategy: 'article' })

  if (result.success) {
    console.log(`   ✅ Réindexé avec succès : ${result.chunksCreated} chunks créés`)
    console.log(`   📊 Différence : ${result.chunksCreated} articles vs ${doc.chunk_count || 0} chunks adaptatifs`)
  } else {
    console.log(`   ❌ Échec réindexation : ${result.error}`)
  }

  return result
}

/**
 * Affiche statistiques finales
 */
function displayStats(results: Array<{ success: boolean; chunksCreated: number; error?: string }>) {
  const successful = results.filter((r) => r.success).length
  const failed = results.filter((r) => !r.success).length
  const totalChunks = results.reduce((sum, r) => sum + (r.success ? r.chunksCreated : 0), 0)

  console.log('\n' + '='.repeat(70))
  console.log('📊 STATISTIQUES FINALES\n')
  console.log(`Documents traités : ${results.length}`)
  console.log(`  ✅ Succès        : ${successful}`)
  console.log(`  ❌ Échecs        : ${failed}`)
  console.log(`  📦 Total chunks  : ${totalChunks}`)

  if (failed > 0) {
    console.log('\nDocuments en échec:')
    results
      .filter((r) => !r.success)
      .forEach((r, i) => {
        console.log(`  ${i + 1}. ${r.error}`)
      })
  }

  console.log('='.repeat(70))
}

// =============================================================================
// EXÉCUTION PRINCIPALE
// =============================================================================

async function main() {
  try {
    const startTime = Date.now()

    // 1. Récupérer documents candidats
    console.log('🔍 Recherche de documents candidats...\n')
    const candidates = await getCandidateDocuments()

    console.log(`✅ ${candidates.length} document(s) candidat(s) trouvé(s)`)

    if (candidates.length === 0) {
      console.log('\nAucun document à réindexer. Terminé.')
      process.exit(0)
    }

    // 2. Afficher résumé
    console.log('\n' + '='.repeat(70))
    console.log('RÉSUMÉ DES CANDIDATS')
    console.log('='.repeat(70))

    const byCategoryLanguage = candidates.reduce((acc, doc) => {
      const key = `${doc.category} (${doc.language})`
      acc[key] = (acc[key] || 0) + 1
      return acc
    }, {} as Record<string, number>)

    Object.entries(byCategoryLanguage).forEach(([key, count]) => {
      console.log(`  ${key}: ${count} document(s)`)
    })

    const totalArticles = candidates.reduce((sum, doc) => sum + parseInt(doc.estimated_articles), 0)
    console.log(`\nTotal articles estimés: ${totalArticles}`)
    console.log('='.repeat(70))

    // 3. Confirmation si pas dry-run
    if (!flags.dryRun && !flags.id) {
      console.log('\n⚠️  ATTENTION : Cette opération va réindexer les documents sélectionnés.')
      console.log('⚠️  Les chunks actuels seront supprimés et recréés.')
      console.log('\nPour faire un dry-run (test sans modification), utiliser --dry-run')
      console.log('Appuyez sur Entrée pour continuer, ou Ctrl+C pour annuler...')

      // Attendre entrée utilisateur (simple pause)
      await new Promise((resolve) => {
        process.stdin.once('data', resolve)
      })
    }

    // 4. Réindexer chaque document
    console.log('\n🚀 Démarrage réindexation...')

    const results: Array<{ success: boolean; chunksCreated: number; error?: string }> = []

    for (const doc of candidates) {
      const result = await reindexDocument(doc)
      results.push(result)

      // Pause entre documents pour éviter surcharge
      if (!flags.dryRun) {
        await new Promise((resolve) => setTimeout(resolve, 500))
      }
    }

    // 5. Afficher statistiques
    displayStats(results)

    const duration = Date.now() - startTime
    console.log(`\n⏱️  Durée totale: ${(duration / 1000).toFixed(1)}s`)

    if (flags.dryRun) {
      console.log('\n💡 Pour appliquer les modifications, relancez sans --dry-run')
    }

    process.exit(0)
  } catch (error) {
    console.error('\n❌ Erreur:', error)
    process.exit(1)
  }
}

main()
