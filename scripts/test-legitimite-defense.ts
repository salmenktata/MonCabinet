/**
 * Script de test : Recherche KB sur légitime défense (question utilisateur)
 *
 * Simule la requête exacte de l'utilisateur pour diagnostiquer pourquoi 0 sources.
 */

import { searchKnowledgeBaseHybrid } from '../lib/ai/knowledge-base-service'

const QUESTION = `وقع شجار ليلي أمام نادٍ، انتهى بإصابة خطيرة ثم وفاة لاحقًا، والمتهم يؤكد أنه كان يدافع عن نفسه بعد أن تعرض لاعتداء جماعي. توجد تسجيلات كاميرا من زوايا مختلفة: أحدها يظهر الضحية يهاجم أولًا، وآخر يظهر المتهم يوجّه ضربة بعد تراجع الخطر، وشاهد رئيسي يغيّر أقواله لاحقًا مدعيًا أنه تعرض للتهديد. الملف يتطلب تحديد لحظة الخطر "الحال" وهل الرد كان متناسبًا أم تجاوز حدود الدفاع الشرعي، مع اعتماد تقارير الطب الشرعي لتقدير آلية الإصابة، ومقارنة زمن التسجيلات، وتحليل تناقض الأقوال، إضافة إلى بحث مسألة التأثير على الشهود وبطلان بعض الإجراءات إن كانت المعاينات ناقصة.`

async function testLegitimeDefense() {
  console.log('🔍 Test recherche KB - Légitime défense\n')
  console.log('Question:', QUESTION.substring(0, 100) + '...\n')

  try {
    // Test 1: Recherche globale avec seuil très permissif (0.20)
    console.log('📊 Test 1: Recherche globale (seuil 0.20)')
    const results1 = await searchKnowledgeBaseHybrid(QUESTION, {
      limit: 15,
      threshold: 0.20,
    })
    console.log(`✅ ${results1.length} résultats trouvés`)
    if (results1.length > 0) {
      console.log('\nTop 3 résultats:')
      results1.slice(0, 3).forEach((r, i) => {
        console.log(`  ${i + 1}. [${r.similarity.toFixed(3)}] ${r.category} - ${r.title.substring(0, 60)}`)
        console.log(`     ${r.chunkContent.substring(0, 100)}...\n`)
      })
    }

    // Test 2: Recherche par catégorie penal
    console.log('\n📊 Test 2: Recherche catégorie "codes" (seuil 0.30)')
    const results2 = await searchKnowledgeBaseHybrid(QUESTION, {
      limit: 10,
      threshold: 0.30,
      category: 'codes',
    })
    console.log(`✅ ${results2.length} résultats trouvés`)
    if (results2.length > 0) {
      console.log('\nTop 3:')
      results2.slice(0, 3).forEach((r, i) => {
        console.log(`  ${i + 1}. [${r.similarity.toFixed(3)}] ${r.category} - ${r.title.substring(0, 60)}`)
      })
    }

    // Test 3: Recherche mots-clés arabes simples
    console.log('\n📊 Test 3: Recherche simplifiée "الدفاع الشرعي" (seuil 0.25)')
    const results3 = await searchKnowledgeBaseHybrid('الدفاع الشرعي', {
      limit: 10,
      threshold: 0.25,
    })
    console.log(`✅ ${results3.length} résultats trouvés`)
    if (results3.length > 0) {
      console.log('\nTop 3:')
      results3.slice(0, 3).forEach((r, i) => {
        console.log(`  ${i + 1}. [${r.similarity.toFixed(3)}] ${r.category} - ${r.title.substring(0, 60)}`)
      })
    }

    // Diagnostic final
    console.log('\n' + '='.repeat(80))
    console.log('📋 DIAGNOSTIC')
    console.log('='.repeat(80))
    if (results1.length === 0 && results2.length === 0 && results3.length === 0) {
      console.log('❌ AUCUN résultat trouvé dans TOUS les tests')
      console.log('   → Problème possible: embeddings non indexés, erreur SQL, ou contenu KB vide')
    } else {
      console.log('✅ Des résultats existent dans la KB')
      if (results1.length === 0) {
        console.log('⚠️  Mais recherche globale (Test 1) retourne 0 résultats')
        console.log('   → Seuil 0.20 trop élevé pour cette query')
      }
      if (results2.length === 0) {
        console.log('⚠️  Recherche catégorie "codes" retourne 0 résultats')
        console.log('   → Classification incorrecte ou catégorie vide')
      }
    }

  } catch (error) {
    console.error('❌ Erreur:', error instanceof Error ? error.message : error)
    console.error('Stack:', error instanceof Error ? error.stack : 'N/A')
  }
}

testLegitimeDefense()
