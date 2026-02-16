#!/usr/bin/env tsx
/**
 * Analyse Détaillée Qualité KB - Production
 *
 * Analyse la distribution des scores, identifie les problèmes
 * et propose une stratégie de nettoyage/réindexation
 *
 * Usage: npx tsx scripts/analyze-kb-quality-detailed.ts
 */

interface KBStats {
  totalDocs: string
  withScore: string
  withoutScore: string
  avgScore: string
  coverage: number
}

async function fetchKBStats(): Promise<KBStats> {
  const response = await fetch('https://qadhya.tn/api/admin/kb/analyze-quality')
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`)
  }
  const data = await response.json()
  return data.stats
}

async function analyzeQuality() {
  console.log('🔍 Analyse Détaillée Qualité KB Production')
  console.log('=' .repeat(80))
  console.log()

  try {
    // 1. Stats globales
    const stats = await fetchKBStats()

    const totalDocs = parseInt(stats.totalDocs)
    const withScore = parseInt(stats.withScore)
    const withoutScore = parseInt(stats.withoutScore)
    const avgScore = parseInt(stats.avgScore)
    const coverage = stats.coverage

    console.log('📊 STATISTIQUES GLOBALES\n')
    console.log(`Total documents indexés:    ${totalDocs.toLocaleString()}`)
    console.log(`Documents avec score:       ${withScore.toLocaleString()} (${coverage}%)`)
    console.log(`Documents sans score:       ${withoutScore.toLocaleString()} (${100 - coverage}%)`)
    console.log(`Score moyen global:         ${avgScore}/100 ${avgScore < 70 ? '⚠️' : avgScore < 80 ? '📈' : '✅'}`)
    console.log()

    // 2. Analyse par range de qualité (estimation basée sur moyenne)
    console.log('📈 ESTIMATION DISTRIBUTION PAR RANGE\n')
    console.log('(Basée sur score moyen global, pas de breakdown disponible via API)')
    console.log()

    // Estimations basées sur l'expérience
    const estimatedBreakdown = {
      excellent: Math.round(withScore * 0.15), // >=90
      good: Math.round(withScore * 0.25), // 80-89
      medium: Math.round(withScore * 0.30), // 70-79
      low: Math.round(withScore * 0.20), // 60-69
      failed: Math.round(withScore * 0.10), // 50 (échec)
    }

    console.log(`>=90 (Excellent):    ~${estimatedBreakdown.excellent.toLocaleString()} docs (15% estimé)`)
    console.log(`80-89 (Bon):         ~${estimatedBreakdown.good.toLocaleString()} docs (25% estimé)`)
    console.log(`70-79 (Moyen):       ~${estimatedBreakdown.medium.toLocaleString()} docs (30% estimé)`)
    console.log(`60-69 (Faible):      ~${estimatedBreakdown.low.toLocaleString()} docs (20% estimé)`)
    console.log(`50 (Échec analyse):  ~${estimatedBreakdown.failed.toLocaleString()} docs (10% estimé)`)
    console.log()

    // 3. Problèmes identifiés
    console.log('🔴 PROBLÈMES IDENTIFIÉS\n')

    const problems: string[] = []

    if (avgScore < 70) {
      problems.push(`⚠️  Score moyen global ${avgScore}/100 < 70 (CRITIQUE)`)
    }

    if (coverage < 60) {
      problems.push(`⚠️  Couverture ${coverage}% < 60% - ${withoutScore} docs non analysés`)
    }

    const estimatedScore50 = estimatedBreakdown.failed
    if (estimatedScore50 > 0) {
      problems.push(`⚠️  ~${estimatedScore50} docs score=50 (échecs analyse LLM)`)
    }

    const estimatedBelow70 = estimatedBreakdown.low + estimatedBreakdown.failed
    if (estimatedBelow70 > 0) {
      problems.push(`⚠️  ~${estimatedBelow70} docs score <70 (faible qualité)`)
    }

    if (problems.length === 0) {
      console.log('✅ Aucun problème majeur détecté')
    } else {
      problems.forEach((problem) => console.log(problem))
    }
    console.log()

    // 4. Impact sur RAG
    console.log('🎯 IMPACT SUR SYSTÈME RAG\n')

    const ragThreshold = 70
    const estimatedBelowThreshold = estimatedBelow70
    const percentageBelowThreshold =
      ((estimatedBelowThreshold / totalDocs) * 100).toFixed(1)

    console.log(`Seuil qualité RAG:           ${ragThreshold}/100`)
    console.log(
      `Docs en-dessous du seuil:    ~${estimatedBelowThreshold.toLocaleString()} (${percentageBelowThreshold}%)`)
    console.log(
      `Docs exploitables RAG:       ~${(totalDocs - estimatedBelowThreshold).toLocaleString()} (${(100 - parseFloat(percentageBelowThreshold)).toFixed(1)}%)`
    )
    console.log()

    if (parseFloat(percentageBelowThreshold) > 20) {
      console.log('⚠️  ALERTE: >20% docs non exploitables par RAG')
      console.log('   → Impact significatif sur qualité réponses')
      console.log()
    }

    // 5. Recommandations
    console.log('💡 RECOMMANDATIONS & PLAN D\'ACTION\n')

    const recommendations: Array<{ priority: string; action: string; script: string }> = []

    if (coverage < 100) {
      recommendations.push({
        priority: '🔴 HAUTE',
        action: `Analyser ${withoutScore} documents sans score (coverage ${coverage}% → 100%)`,
        script: 'bash scripts/analyze-kb-quality-prod.sh 50 20',
      })
    }

    if (estimatedScore50 > 50) {
      recommendations.push({
        priority: '🔴 HAUTE',
        action: `Réanalyser ~${estimatedScore50} docs score=50 avec OpenAI (fallback Gemini/Ollama)`,
        script: 'npx tsx scripts/reanalyze-failed-kb.ts --limit=100',
      })
    }

    if (avgScore < 70) {
      recommendations.push({
        priority: '🟠 MOYENNE',
        action: 'Créer script nettoyage contenu corrompu (caractères �, HTML mal parsé)',
        script: 'npx tsx scripts/cleanup-corrupted-kb.ts (À CRÉER)',
      })
    }

    if (estimatedBelow70 > 200) {
      recommendations.push({
        priority: '🟡 BASSE',
        action: `Réindexer ~${estimatedBelow70} docs <70 avec extraction améliorée`,
        script: 'npx tsx scripts/reindex-kb-improved.ts --threshold=70 (À CRÉER)',
      })
    }

    recommendations.forEach((rec, i) => {
      console.log(`${i + 1}. ${rec.priority} - ${rec.action}`)
      console.log(`   Commande: ${rec.script}`)
      console.log()
    })

    // 6. Estimation temps/coût
    console.log('⏱️  ESTIMATION TEMPS & COÛT\n')

    const docsToReanalyze = estimatedScore50 + withoutScore
    const estimatedMinutes = Math.ceil((docsToReanalyze * 3) / 60) // 3s/doc
    const estimatedCost = (docsToReanalyze * 0.003).toFixed(2) // $0.003/doc OpenAI

    console.log(`Documents à traiter:    ${docsToReanalyze.toLocaleString()}`)
    console.log(`Temps estimé:           ~${estimatedMinutes} minutes`)
    console.log(`Coût estimé OpenAI:     ~$${estimatedCost}`)
    console.log()

    // 7. Scripts disponibles
    console.log('🛠️  SCRIPTS DISPONIBLES\n')
    console.log('Analyse:')
    console.log('  - scripts/analyze-kb-quality-prod.sh [batch_size] [max_batches]')
    console.log('  - Skill: /analyze-kb-quality')
    console.log()
    console.log('Réanalyse:')
    console.log('  - scripts/reanalyze-failed-kb.ts [--dry-run] [--limit=50]')
    console.log('  - scripts/cron-reanalyze-kb-failures.sh (automatique 3h)')
    console.log()
    console.log('Nettoyage:')
    console.log('  - scripts/cleanup-corrupted-kb.ts (À CRÉER)')
    console.log('  - scripts/reindex-kb-improved.ts (À CRÉER)')
    console.log()

    console.log('=' .repeat(80))
    console.log('✅ Analyse terminée\n')
  } catch (error) {
    console.error('❌ Erreur analyse:', error)
    throw error
  }
}

// Exécuter
analyzeQuality().catch((error) => {
  console.error(error)
  process.exit(1)
})
