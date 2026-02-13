#!/usr/bin/env tsx
/**
 * Script de test: Prompt arabe complexe - Légitime défense
 * Valide la correction du bug de parsing JSON
 *
 * Utilisation:
 *   npx tsx scripts/test-complex-arabic-prompt.ts
 */

import { structurerDossier } from '@/lib/ai/dossier-structuring-service'

// Prompt complexe réel de l'utilisateur qui échouait avant le fix
const COMPLEX_ARABIC_PROMPT = `
شجار ليلي أمام نادٍ، انتهى بإصابة خطيرة ثم وفاة لاحقًا، والمتهم يؤكد أنه كان يدافع عن نفسه بعد أن تعرض لاعتداء جماعي.

**التفاصيل الكاملة:**

في ليلة من ليالي الصيف، وقع شجار عنيف أمام أحد النوادي الليلية في تونس العاصمة. المتهم (أحمد بن محمد، 28 سنة) كان يغادر النادي مع مجموعة من أصدقائه حوالي الساعة 2 صباحاً.

حسب رواية المتهم، تعرض لاعتداء مفاجئ من طرف مجموعة من 4-5 أشخاص كانوا ينتظرونه خارج النادي. بدأ الاعتداء بالصراخ والشتائم، ثم تطور إلى اعتداء بدني جماعي.

المتهم يدّعي أنه حاول الفرار، لكن المعتدين أحاطوا به ومنعوه من الهروب. في لحظة ما، شعر بأن حياته في خطر الموت الحقيقي، خاصة عندما شاهد أحدهم يخرج سلاحاً أبيض (سكين).

في حالة من الذعر والخوف الشديد، التقط المتهم زجاجة مكسورة من الأرض واستخدمها للدفاع عن نفسه. في خضم المعركة، أصاب أحد المعتدين (الضحية: خالد بن علي، 32 سنة) بجروح خطيرة في الرقبة.

تدخلت الشرطة بعد دقائق من الحادثة بناءً على اتصال من أحد المارة. نُقل الضحية فوراً إلى المستشفى في حالة حرجة. للأسف، توفي الضحية بعد 3 أيام في المستشفى بسبب نزيف حاد.

**الأدلة المتوفرة:**
- شهادة شاهدين محايدين شاهدا بداية الاعتداء الجماعي
- تسجيلات كاميرات المراقبة تُظهر بداية الشجار (لكن زاوية التصوير لا تُظهر كل التفاصيل)
- تقرير طبي يُثبت إصابات المتهم (كدمات، جروح خفيفة)
- سكين وُجد بالقرب من مكان الحادثة (ليس عليه بصمات المتهم)
- تقرير الطب الشرعي يُثبت أن الجرح القاتل كان بزجاجة مكسورة

**الوضع القانوني الحالي:**
- المتهم موقوف احتياطياً منذ 6 أشهر
- التهمة: القتل العمد (الفصل 201 من المجلة الجزائية)
- النيابة العامة ترفض الاعتراف بالدفاع الشرعي
- عائلة الضحية تطالب بالقصاص وتعويضات مالية ضخمة

**ما يطلبه العميل (عائلة المتهم):**
1. تحليل قانوني دقيق لمفهوم الدفاع الشرعي في القانون التونسي
2. تقييم فرص نجاح دفع الدفاع الشرعي في هذه القضية
3. استراتيجية دفاع محكمة لتخفيف التهمة من القتل العمد إلى القتل الخطأ أو حتى البراءة
4. حساب المدة المحتملة للسجن في كل سيناريو
5. خطة عمل قانونية مفصّلة مع المواعيد والإجراءات
`.trim()

async function testComplexPrompt() {
  console.log('🧪 Test Prompt Complexe Arabe - Légitime Défense\n')
  console.log('═'.repeat(80))
  console.log('📝 Prompt (longueur):', COMPLEX_ARABIC_PROMPT.length, 'caractères\n')

  const startTime = Date.now()

  try {
    console.log('⏳ Appel structurerDossier...\n')

    const result = await structurerDossier(
      COMPLEX_ARABIC_PROMPT,
      'test-user-id',
      {
        enrichirKnowledgeBase: false, // Désactiver pour test rapide
      }
    )

    const duration = Date.now() - startTime

    console.log('✅ SUCCÈS - Dossier structuré\n')
    console.log('═'.repeat(80))
    console.log('📊 Résultats:')
    console.log('  Type procédure:', result.typeProcedure)
    console.log('  Sous-type:', result.sousType || 'N/A')
    console.log('  Langue détectée:', result.langue)
    console.log('  Confiance:', result.confidence + '%')
    console.log('  Titre proposé:', result.titrePropose)
    console.log('\n📈 Métriques:')
    console.log('  Faits extraits:', result.faitsExtraits.length)
    console.log('  Actions suggérées:', result.actionsSuggerees.length)
    console.log('  Calculs juridiques:', result.calculs.length)
    console.log('  Timeline étapes:', result.timeline.length)
    console.log('  Références juridiques:', result.references.length)
    console.log('\n🤖 IA:')
    console.log('  Tokens utilisés:', result.tokensUsed?.total || 'N/A')
    console.log('  Temps total:', duration, 'ms')

    if (result.analyseJuridique) {
      console.log('\n⚖️ Analyse Juridique:')
      console.log('  Diagnostic:', result.analyseJuridique.diagnostic.substring(0, 100) + '...')
      console.log('  Qualification:', result.analyseJuridique.qualification.substring(0, 100) + '...')
      console.log('  Risques identifiés:', result.analyseJuridique.risques.length)
      console.log('  Opportunités:', result.analyseJuridique.opportunites.length)
    }

    console.log('\n👥 Parties:')
    console.log('  Client:', result.client.nom, result.client.prenom || '', `(${result.client.role})`)
    console.log(
      '  Partie adverse:',
      result.partieAdverse.nom,
      result.partieAdverse.prenom || '',
      `(${result.partieAdverse.role})`
    )

    if (result.faitsExtraits.length > 0) {
      console.log('\n📋 Exemple de faits extraits:')
      result.faitsExtraits.slice(0, 3).forEach((fait, i) => {
        console.log(
          `  ${i + 1}. [${fait.importance}] ${fait.fait.substring(0, 80)}...`
        )
      })
    }

    console.log('\n═'.repeat(80))
    console.log('✅ Test réussi! Le parsing JSON avec retry logic fonctionne.')

    process.exit(0)
  } catch (error) {
    const duration = Date.now() - startTime

    console.error('\n❌ ÉCHEC - Erreur lors de la structuration\n')
    console.error('═'.repeat(80))
    console.error('❌ Erreur:', error instanceof Error ? error.message : String(error))
    console.error('⏱️ Temps écoulé:', duration, 'ms')

    if (error instanceof Error && error.stack) {
      console.error('\n📚 Stack trace:')
      console.error(error.stack)
    }

    console.error('\n═'.repeat(80))
    console.error('💡 Suggestions:')
    console.error('  1. Vérifiez que les variables d\'environnement sont configurées')
    console.error('  2. Vérifiez que Gemini/Groq/DeepSeek sont accessibles')
    console.error('  3. Consultez les logs ci-dessus pour identifier l\'erreur exacte')

    process.exit(1)
  }
}

// Exécution
testComplexPrompt()
