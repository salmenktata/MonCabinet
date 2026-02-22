#!/usr/bin/env tsx
/**
 * Test posture stratégique : 3 questions (défense/attaque/neutre)
 */
import { answerQuestion } from '@/lib/ai/rag-chat-service'
import type { LegalStance } from '@/lib/ai/legal-reasoning-prompts'

const questions = [
  {
    stance: 'defense' as LegalStance,
    q: 'Mon client a été mis en détention provisoire depuis 3 mois. Quels sont ses droits et comment contester cette mesure ?',
    label: '🛡️ DÉFENSE'
  },
  {
    stance: 'attack' as LegalStance,
    q: 'Mon client victime d\'un accident de travail n\'a reçu aucune indemnisation depuis 6 mois. Comment attaquer l\'employeur ?',
    label: '⚔️ ATTAQUE'
  },
  {
    stance: 'neutral' as LegalStance,
    q: 'Quelles sont les conditions légales pour résilier un contrat de travail en droit tunisien ?',
    label: '⚖️ NEUTRE'
  }
]

async function run() {
  const results = []
  
  for (const { stance, q, label } of questions) {
    console.log(`\n${'═'.repeat(65)}`)
    console.log(`${label}`)
    console.log(`Q: ${q}`)
    console.log('═'.repeat(65))
    const start = Date.now()

    try {
      const resp = await answerQuestion(q, {
        stance,
        userId: 'test-posture-eval',
        includeKnowledgeBase: true,
      })

      const answer = resp.answer || ''
      const latency = Date.now() - start
      
      // Vérifier les sections clés du Framework Avocat Stratège
      const checks = {
        noeud: /[Nn]œud [Dd]écisif|نقطة التحول|point de bascule/.test(answer),
        scenarios: /[Ss]cénario|سيناريو/.test(answer),
        plan: /[Pp]lan d'[Aa]ction|خطة العمل|URGENT/.test(answer),
        pistes: /[Pp]istes [Cc]réatives|pistes créatives/.test(answer),
        rapport: /[Rr]apport de force|Diagnostic/.test(answer),
      }
      
      const sectionsOK = Object.values(checks).filter(Boolean).length
      const score = Math.round((sectionsOK / 5) * 100)

      console.log(`\n📊 Score sections: ${score}% (${sectionsOK}/5)`)
      console.log(`  ⚡ Nœud Décisif    : ${checks.noeud ? '✅' : '❌'}`)
      console.log(`  🔮 Scénarios       : ${checks.scenarios ? '✅' : '❌'}`)
      console.log(`  📋 Plan d'Action   : ${checks.plan ? '✅' : '❌'}`)
      console.log(`  💡 Pistes Créatives: ${checks.pistes ? '✅' : '❌'}`)
      console.log(`  📊 Diagnostic      : ${checks.rapport ? '✅' : '❌'}`)
      console.log(`  📚 Sources KB      : ${resp.sources?.length || 0}`)
      console.log(`  ⏱️  Latence         : ${latency}ms`)
      
      console.log('\n📝 Extrait (600 chars):')
      console.log(answer.slice(0, 600))
      
      results.push({ label, score, sources: resp.sources?.length || 0, latency, checks })
    } catch(e: any) {
      console.log('❌ Erreur:', e.message)
      results.push({ label, score: 0, error: e.message })
    }
  }
  
  console.log('\n\n' + '═'.repeat(65))
  console.log('RÉSUMÉ POSTURE VALIDATION')
  console.log('═'.repeat(65))
  for (const r of results) {
    console.log(`${r.label}: ${r.score}% | Sources: ${r.sources || 0} | ${r.latency}ms`)
  }
}

run().catch(e => { console.error('FATAL:', e.message); process.exit(1) })
