/**
 * Script de réanalyse des documents KB échoués (score = 50)
 *
 * Force l'utilisation d'OpenAI pour corriger les 202 échecs Gemini/Ollama
 *
 * Usage:
 *   npx tsx scripts/reanalyze-failed-kb.ts [--dry-run] [--limit=50]
 */

import { db } from '@/lib/db/postgres'
import { analyzeKBDocumentQuality } from '@/lib/ai/kb-quality-analyzer-service'

interface FailedDoc {
  id: string
  title: string
  category: string
  text_length: number
  quality_llm_provider: string
  quality_score: number
}

async function main() {
  const args = process.argv.slice(2)
  const dryRun = args.includes('--dry-run')
  const limitArg = args.find(arg => arg.startsWith('--limit='))
  const limit = limitArg ? parseInt(limitArg.split('=')[1]) : 50

  console.log('🔄 Réanalyse Documents KB Échoués')
  console.log('===================================')
  console.log(`Mode: ${dryRun ? 'DRY RUN' : 'EXÉCUTION RÉELLE'}`)
  console.log(`Limite: ${limit} documents\n`)

  try {
    // 1. Récupérer les documents échoués (score = 50)
    console.log('📋 Récupération documents échoués...')

    const result = await db.query<FailedDoc>(`
      SELECT
        id,
        title,
        category,
        LENGTH(COALESCE(full_text, '')) as text_length,
        quality_llm_provider,
        quality_score
      FROM knowledge_base
      WHERE is_active = true
        AND quality_score = 50
      ORDER BY
        CASE
          WHEN quality_llm_provider = 'ollama' THEN 1
          WHEN quality_llm_provider = 'gemini' THEN 2
          ELSE 3
        END,
        quality_assessed_at ASC
      LIMIT $1
    `, [limit])

    const docs = result.rows

    if (docs.length === 0) {
      console.log('✅ Aucun document échoué trouvé !')
      return
    }

    console.log(`\n📊 ${docs.length} documents à réanalyser :`)
    console.log(`   - Ollama: ${docs.filter(d => d.quality_llm_provider === 'ollama').length}`)
    console.log(`   - Gemini: ${docs.filter(d => d.quality_llm_provider === 'gemini').length}`)
    console.log(`   - Autre: ${docs.filter(d => !['ollama', 'gemini'].includes(d.quality_llm_provider || '')).length}`)
    console.log()

    if (dryRun) {
      console.log('🔍 Mode DRY RUN - Aperçu des documents :')
      docs.slice(0, 10).forEach((doc, i) => {
        console.log(`   ${i + 1}. ${doc.title} (${doc.text_length} chars, ${doc.quality_llm_provider})`)
      })
      if (docs.length > 10) {
        console.log(`   ... et ${docs.length - 10} autres`)
      }
      console.log('\n💡 Lancez sans --dry-run pour exécuter')
      return
    }

    // 2. Réanalyser chaque document
    console.log('🚀 Démarrage réanalyse...\n')

    let succeeded = 0
    let failed = 0
    let improved = 0

    for (let i = 0; i < docs.length; i++) {
      const doc = docs[i]
      const progress = `[${i + 1}/${docs.length}]`

      console.log(`${progress} ${doc.title.substring(0, 50)}...`)
      console.log(`   Avant: ${doc.quality_llm_provider} → score ${doc.quality_score}`)

      try {
        const result = await analyzeKBDocumentQuality(doc.id)

        if (result.success) {
          succeeded++

          const improvement = result.quality_score - doc.quality_score
          if (improvement > 0) {
            improved++
            console.log(`   ✅ Après: ${result.quality_llm_provider} → score ${result.quality_score} (+${improvement})`)
          } else {
            console.log(`   ⚠️  Après: ${result.quality_llm_provider} → score ${result.quality_score} (pas d'amélioration)`)
          }
        } else {
          failed++
          console.log(`   ❌ Échec: ${result.error}`)
        }

      } catch (error) {
        failed++
        console.error(`   ❌ Exception: ${error instanceof Error ? error.message : String(error)}`)
      }

      // Pause entre chaque analyse (rate limiting)
      if (i < docs.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 2000)) // 2s pause
      }
    }

    // 3. Rapport final
    console.log('\n' + '='.repeat(50))
    console.log('📈 Rapport Final')
    console.log('='.repeat(50))
    console.log(`✅ Succès: ${succeeded}/${docs.length} (${((succeeded / docs.length) * 100).toFixed(1)}%)`)
    console.log(`📈 Améliorés: ${improved}/${docs.length} (${((improved / docs.length) * 100).toFixed(1)}%)`)
    console.log(`❌ Échecs: ${failed}/${docs.length} (${((failed / docs.length) * 100).toFixed(1)}%)`)

    if (improved > 0) {
      console.log(`\n🎉 ${improved} documents ont été améliorés avec succès !`)
    }

    if (failed > 0) {
      console.log(`\n⚠️  ${failed} documents n'ont pas pu être réanalysés`)
      console.log('   Vérifiez les logs ci-dessus pour les détails')
    }

    console.log('\n✅ Réanalyse terminée')

  } catch (error) {
    console.error('\n❌ Erreur fatale:', error)
    process.exit(1)
  } finally {
    await db.end()
  }
}

main()
