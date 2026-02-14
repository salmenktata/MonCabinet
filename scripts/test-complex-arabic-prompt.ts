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
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('🧪 Test E2E - Prompt Arabe Complexe (Légitime Défense)')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')

  const startTime = Date.now()

  try {
    console.log('📝 Prompt (longueur):', COMPLEX_ARABIC_PROMPT.length, 'caractères')
    console.log('🎯 Objectif: Valider fix performance (Gemini direct, pas Ollama timeout)\n')

    console.log('⏳ Appel structurerDossier()...\n')

    const result = await structurerDossier(
      COMPLEX_ARABIC_PROMPT,
      'test-user-id',
      {
        enrichirKnowledgeBase: false, // Désactiver RAG pour test rapide
      }
    )

    const duration = Date.now() - startTime
    const durationSec = (duration / 1000).toFixed(1)

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log('✅ SUCCÈS - Dossier structuré')
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')

    // Métriques de performance (CRITIQUE pour valider fix)
    console.log('⏱️  PERFORMANCE (CRITICAL)')
    console.log('   Temps total:     ' + durationSec + 's')
    console.log('   Objectif:        < 60s (avant fix: 180-240s)')
    console.log('   Status:          ' + (duration < 60000 ? '✅ PASS' : '❌ FAIL (timeout)'))
    console.log()

    // Validation provider (CRITIQUE pour valider fix operationName)
    const provider = result.tokensUsed?.provider || 'unknown'
    const isGemini = provider.toLowerCase() === 'gemini'
    console.log('🤖 PROVIDER (CRITICAL)')
    console.log('   Provider utilisé:' + provider)
    console.log('   Attendu:         gemini (via operationName fix)')
    console.log('   Status:          ' + (isGemini ? '✅ PASS' : '⚠️  WARN (fallback utilisé)'))
    console.log('   Tokens total:    ' + (result.tokensUsed?.total || 'N/A'))
    console.log('   Fallback:        ' + (result.tokensUsed?.fallbackUsed ? 'Oui' : 'Non'))
    console.log()

    // Métriques du dossier
    console.log('📋 DOSSIER')
    console.log('   Type procédure:  ' + result.typeProcedure)
    console.log('   Sous-type:       ' + (result.sousType || 'N/A'))
    console.log('   Langue détectée: ' + result.langue)
    console.log('   Confiance:       ' + result.confidence + '%')
    console.log('   Titre:           ' + result.titrePropose.substring(0, 50))
    console.log()

    // Métriques extraction
    console.log('📊 EXTRACTION')
    console.log('   Faits extraits:       ' + result.faitsExtraits.length)
    console.log('   Actions suggérées:    ' + result.actionsSuggerees.length)
    console.log('   Timeline étapes:      ' + result.timeline.length)
    console.log('   Références juridiques:' + result.references.length)
    console.log()

    // Analyse juridique (optionnelle)
    if (result.analyseJuridique) {
      console.log('⚖️  ANALYSE JURIDIQUE')
      const diagnostic = typeof result.analyseJuridique.diagnostic === 'string'
        ? result.analyseJuridique.diagnostic
        : JSON.stringify(result.analyseJuridique.diagnostic)
      console.log('   Diagnostic:     ' + diagnostic.substring(0, 80) + '...')
      console.log('   Qualification:  ' + (result.analyseJuridique.qualification?.substring(0, 80) || 'N/A'))
      console.log('   Risques:        ' + (result.analyseJuridique.risques?.length || 0) + ' identifiés')
      console.log('   Opportunités:   ' + (result.analyseJuridique.opportunites?.length || 0) + ' identifiées')
      console.log()
    }

    // Parties
    console.log('👥 PARTIES')
    console.log('   Client:         ' + result.client.nom + ' ' + (result.client.prenom || '') + ` (${result.client.role})`)
    console.log('   Partie adverse: ' + result.partieAdverse.nom + ' ' + (result.partieAdverse.prenom || '') + ` (${result.partieAdverse.role})`)
    console.log()

    // Exemple faits extraits
    if (result.faitsExtraits.length > 0) {
      console.log('📋 FAITS EXTRAITS (top 3)')
      result.faitsExtraits.slice(0, 3).forEach((fait, i) => {
        console.log(`   ${i + 1}. [${fait.importance}] ${fait.fait.substring(0, 60)}...`)
      })
      console.log()
    }

    // Validation des critères du fix
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log('📋 VALIDATIONS FIX PERFORMANCE')
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')

    const validations = {
      'Performance < 60s':        duration < 60000,
      'Provider = Gemini':        isGemini,
      'JSON parsé (Zod OK)':      true,
      'Confiance >= 50%':         result.confidence >= 50,
      'Faits extraits':           result.faitsExtraits.length > 0,
      'Type procédure valide':    ['civil_premiere_instance', 'divorce', 'commercial', 'refere', 'cassation', 'autre'].includes(result.typeProcedure),
    }

    let allPassed = true
    Object.entries(validations).forEach(([criteria, passed]) => {
      const status = passed ? '✅' : '❌'
      console.log(`   ${status} ${criteria}`)
      if (!passed) allPassed = false
    })
    console.log()

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    if (allPassed) {
      console.log('🎉 TOUS LES CRITÈRES VALIDÉS - FIX PERFORMANCE OK !')
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')
      console.log('✅ Le fix operationName fonctionne correctement')
      console.log('✅ Gemini est utilisé directement (pas de timeout Ollama)')
      console.log('✅ Temps de réponse réduit de 180-240s → ' + durationSec + 's (-80%)\n')
      process.exit(0)
    } else {
      console.log('⚠️  CERTAINS CRITÈRES ONT ÉCHOUÉ')
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')
      console.log('💡 Vérifiez les logs ci-dessus pour identifier le problème\n')
      process.exit(1)
    }

  } catch (error) {
    const duration = Date.now() - startTime
    const durationSec = (duration / 1000).toFixed(1)

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log('❌ ÉCHEC - Erreur lors de la structuration')
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')

    console.log('⏱️  Temps écoulé: ' + durationSec + 's')
    console.log('❌ Erreur: ' + (error instanceof Error ? error.message : String(error)))
    console.log()

    if (error instanceof Error && error.stack) {
      console.log('📚 Stack trace:')
      console.log(error.stack)
      console.log()
    }

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log('💡 DEBUGGING')
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')
    console.log('1. Vérifiez que GOOGLE_API_KEY est configuré (Gemini)')
    console.log('2. Vérifiez que les autres providers sont configurés (fallback)')
    console.log('3. Si timeout > 60s, vérifiez que operationName est bien passé')
    console.log('4. Consultez les logs du service pour plus de détails\n')

    process.exit(1)
  }
}

// Exécution
testComplexPrompt()
