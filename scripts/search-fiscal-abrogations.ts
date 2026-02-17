/**
 * Recherche dans la KB des documents fiscaux contenant des abrogations
 * Focus: Lois de finances 2020-2025, codes fiscaux, JORT
 */
import { Pool } from 'pg'

const PROD_DB = {
  host: 'localhost',
  port: 5434,
  database: 'qadhya',
  user: 'moncabinet',
  password: process.env.DB_PASSWORD || '',
}

interface FiscalDocument {
  id: string
  title: string
  category: string
  source_file: string
  chunks_with_abrogation: number
  sample_content: string
}

async function main() {
  const pool = new Pool(PROD_DB)

  console.log('🔍 Recherche documents fiscaux avec abrogations...\n')

  try {
    // Rechercher documents fiscaux avec mentions d'abrogation
    const result = await pool.query<FiscalDocument>(`
      WITH fiscal_docs AS (
        SELECT DISTINCT
          kb.id,
          kb.title,
          kb.category::text as category,
          kb.source_file,
          COUNT(DISTINCT kbc.id) as chunks_with_abrogation,
          STRING_AGG(DISTINCT SUBSTRING(kbc.content, 1, 200), ' | ') as sample_content
        FROM knowledge_base kb
        JOIN knowledge_base_chunks kbc ON kb.id = kbc.knowledge_base_id
        WHERE kb.is_active = true
          AND kb.category IN ('legislation', 'fiscal', 'codes')
          AND (
            -- Français
            kbc.content ILIKE '%loi de finances%'
            OR kbc.content ILIKE '%code général%'
            OR kbc.content ILIKE '%code des impôts%'
            OR kbc.content ILIKE '%JORT%'
            OR kbc.content ILIKE '%journal officiel%'
            -- Arabe
            OR kbc.content LIKE '%قانون المالية%'
            OR kbc.content LIKE '%المجلة العامة%'
          )
          AND (
            -- Mentions d'abrogation
            kbc.content ILIKE '%abroge%'
            OR kbc.content ILIKE '%abrogée%'
            OR kbc.content LIKE '%ملغى%'
            OR kbc.content LIKE '%إلغاء%'
          )
        GROUP BY kb.id, kb.title, kb.category, kb.source_file
        ORDER BY chunks_with_abrogation DESC
        LIMIT 50
      )
      SELECT * FROM fiscal_docs
    `)

    console.log(`📊 Résultats: ${result.rows.length} documents trouvés\n`)
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')

    if (result.rows.length === 0) {
      console.log('❌ Aucun document fiscal avec abrogations trouvé')
      console.log('💡 Suggestions:')
      console.log('   - Vérifier que des sources JORT sont indexées')
      console.log('   - Lancer un crawl spécifique JORT fiscal')
      console.log('   - Rechercher manuellement sur legislation.tn')
      return
    }

    // Grouper par catégorie
    const byCategory = result.rows.reduce((acc, doc) => {
      if (!acc[doc.category]) acc[doc.category] = []
      acc[doc.category].push(doc)
      return acc
    }, {} as Record<string, FiscalDocument[]>)

    // Afficher par catégorie
    for (const [category, docs] of Object.entries(byCategory)) {
      console.log(`\n📂 Catégorie: ${category.toUpperCase()} (${docs.length} documents)`)
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')

      docs.forEach((doc, i) => {
        console.log(`${i + 1}. ${doc.title}`)
        console.log(`   ID: ${doc.id}`)
        console.log(`   Chunks avec abrogation: ${doc.chunks_with_abrogation}`)
        console.log(`   Source: ${doc.source_file || 'N/A'}`)
        console.log(`   Extrait: ${doc.sample_content.substring(0, 150)}...`)
        console.log()
      })
    }

    // Statistiques globales
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log('📈 STATISTIQUES')
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')

    const totalChunks = result.rows.reduce((sum, doc) => sum + doc.chunks_with_abrogation, 0)
    const topDoc = result.rows[0]

    console.log(`Total documents: ${result.rows.length}`)
    console.log(`Total chunks avec abrogations: ${totalChunks}`)
    console.log(`Moyenne chunks/doc: ${(totalChunks / result.rows.length).toFixed(1)}`)
    console.log(`\nDocument le plus riche:`)
    console.log(`  ${topDoc.title}`)
    console.log(`  ${topDoc.chunks_with_abrogation} chunks avec abrogations`)

    // Exporter IDs pour extraction détaillée
    const ids = result.rows.map(doc => doc.id)
    console.log(`\n💾 IDs pour extraction détaillée:`)
    console.log(ids.join(','))

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log('\n✅ Recherche terminée!')
    console.log('\n📝 Prochaine étape:')
    console.log('   npx tsx scripts/extract-fiscal-chunks.ts --ids <IDs>')

  } catch (error) {
    console.error('\n❌ Erreur:', error.message)
    process.exit(1)
  } finally {
    await pool.end()
  }
}

main().catch(console.error)
