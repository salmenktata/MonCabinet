#!/usr/bin/env tsx
/**
 * Génération Rapport Clés API Production
 *
 * Génère un rapport Markdown détaillé avec métriques, statuts,
 * et recommandations d'actions.
 *
 * Phase 5 du système de vérification complète.
 *
 * Usage:
 *   npx tsx scripts/generate-api-keys-report.ts --input=/tmp/results.json
 */

import fs from 'fs'

// =============================================================================
// TYPES
// =============================================================================

interface TestResult {
  provider: string
  status: 'success' | 'error' | 'warning'
  latency_ms: number
  error?: string
  quota_remaining?: string
  details?: string
}

// =============================================================================
// GÉNÉRATION RAPPORT
// =============================================================================

function generateActionItems(errors: TestResult[], warnings: TestResult[]): string {
  if (errors.length === 0 && warnings.length === 0) {
    return `
## 🎯 Recommandations

✅ **Système opérationnel** - Aucune action critique requise

**Maintenance préventive** :
- Continuer monitoring quotidien via \`npm run verify:api-keys\`
- Vérifier budget OpenAI : \`npm run monitor:openai\`
- Surveiller dashboard : https://qadhya.tn/super-admin/monitoring
`
  }

  let actions = '\n## 🚨 Actions Requises\n'

  if (errors.length > 0) {
    actions += '\n### ❌ Critiques (À corriger immédiatement)\n\n'
    errors.forEach(e => {
      actions += `**${e.provider}** : \`${e.error}\`\n`
      actions += `- Vérifier clé dans \`/opt/qadhya/.env.production.local\`\n`
      actions += `- Consulter dashboard provider pour quota/expiration\n`
      actions += `- Tester manuellement : voir docs/${e.provider.toLowerCase()}-test.md\n\n`
    })
  }

  if (warnings.length > 0) {
    actions += '\n### ⚠️  Avertissements (À surveiller)\n\n'
    warnings.forEach(w => {
      actions += `- **${w.provider}** : ${w.error || 'Service dégradé'}\n`
    })
    actions += '\n'
  }

  actions += `
**Procédure correction** :
1. SSH VPS : \`ssh root@84.247.165.187\`
2. Éditer : \`nano /opt/qadhya/.env.production.local\`
3. Sync DB : \`cd /opt/qadhya && npx tsx scripts/sync-env-to-db.ts\`
4. Restart container : \`docker compose restart nextjs\`
5. Re-tester : \`npm run verify:api-keys\`
`

  return actions
}

function generatePerformanceSection(results: TestResult[]): string {
  const validResults = results.filter(r => r.status === 'success')

  if (validResults.length === 0) {
    return '\n## 📈 Performance\n\n⚠️  Aucun provider fonctionnel pour calculer les métriques\n'
  }

  const avgLatency = Math.round(
    validResults.reduce((acc, r) => acc + r.latency_ms, 0) / validResults.length
  )

  const sorted = [...validResults].sort((a, b) => a.latency_ms - b.latency_ms)
  const fastest = sorted[0]
  const slowest = sorted[sorted.length - 1]

  return `
## 📈 Performance

- **Latence moyenne** : ${avgLatency}ms
- **Provider le plus rapide** : ${fastest.provider} (${fastest.latency_ms}ms)
- **Provider le plus lent** : ${slowest.provider} (${slowest.latency_ms}ms)

**Recommandation** : Prioriser ${fastest.provider} pour opérations critiques (latence < ${fastest.latency_ms + 100}ms)
`
}

function generateReport(results: TestResult[]): string {
  const success = results.filter(r => r.status === 'success')
  const warnings = results.filter(r => r.status === 'warning')
  const errors = results.filter(r => r.status === 'error')

  const timestamp = new Date().toLocaleString('fr-FR', {
    timeZone: 'Africa/Tunis',
    dateStyle: 'full',
    timeStyle: 'long'
  })

  const statusIcon = errors.length === 0 ? '✅' : errors.length <= 2 ? '⚠️' : '❌'
  const statusText = errors.length === 0 ? 'OPÉRATIONNEL' : errors.length <= 2 ? 'DÉGRADÉ' : 'CRITIQUE'

  const report = `
# Rapport Vérification Clés API Production

**Date** : ${timestamp}
**Statut Global** : ${statusIcon} ${statusText}

---

## 📊 Résumé Global

| Métrique | Valeur |
|----------|--------|
| ✅ Fonctionnels | ${success.length}/6 providers |
| ⚠️  Avertissements | ${warnings.length} |
| ❌ Erreurs | ${errors.length} |
| 🎯 Taux de réussite | ${Math.round((success.length / results.length) * 100)}% |

---

## 🔑 Détails par Provider

${results.map(r => {
  const icon = r.status === 'success' ? '✅' : r.status === 'warning' ? '⚠️' : '❌'
  return `
### ${icon} ${r.provider}

- **Statut** : ${r.status.toUpperCase()}
- **Latence** : ${r.latency_ms}ms
${r.details ? `- **Détails** : ${r.details}` : ''}
${r.error ? `- **Erreur** : \`${r.error}\`` : ''}
`
}).join('\n')}

---

${generatePerformanceSection(results)}

---

${generateActionItems(errors, warnings)}

---

## 🔄 Prochaines Étapes

${errors.length === 0 ? `
✅ **Système stable**
- Planifier prochaine vérification : 7 jours
- Monitoring continu : Dashboard Super Admin
- Alertes email configurées : Actives
` : `
⚠️ **Actions requises**
1. Corriger les ${errors.length} provider(s) en erreur (voir Actions Requises ci-dessus)
2. Relancer vérification : \`npm run verify:api-keys\`
3. Valider cascade fallback : \`npm run test:api-keys:fallback\`
4. Surveiller pendant 24h après correction
`}

---

## 📚 Documentation

- **Gestion clés API** : \`docs/API_KEYS_MANAGEMENT.md\`
- **Système monitoring** : \`docs/CRON_MONITORING.md\`
- **Troubleshooting** : \`docs/DEPLOYMENT_ROLLBACK_TROUBLESHOOTING.md\`

---

**Généré par** : \`scripts/generate-api-keys-report.ts\`
**Projet** : Qadhya - Plateforme SaaS juridique
**Environnement** : Production (qadhya.tn)
`.trim()

  return report
}

// =============================================================================
// ORCHESTRATION
// =============================================================================

async function main() {
  const inputArg = process.argv.find(arg => arg.startsWith('--input='))

  if (!inputArg) {
    console.error('❌ Usage: generate-api-keys-report.ts --input=<results.json>')
    console.error('')
    console.error('Exemple:')
    console.error('  npx tsx scripts/generate-api-keys-report.ts --input=/tmp/results.json')
    process.exit(1)
  }

  const inputFile = inputArg.split('=')[1]

  if (!fs.existsSync(inputFile)) {
    console.error(`❌ Fichier introuvable: ${inputFile}`)
    process.exit(1)
  }

  // Lire résultats
  const results: TestResult[] = JSON.parse(fs.readFileSync(inputFile, 'utf-8'))

  // Générer rapport
  const report = generateReport(results)

  // Sauvegarder rapport
  const reportFile = `/tmp/api-keys-report-${Date.now()}.md`
  fs.writeFileSync(reportFile, report)

  // Afficher rapport
  console.log(report)
  console.log('')
  console.log(`📄 Rapport sauvegardé : ${reportFile}`)
  console.log('')

  // Exit code basé sur statut
  const errors = results.filter(r => r.status === 'error').length
  process.exit(errors === 0 ? 0 : 1)
}

main().catch(err => {
  console.error('❌ Erreur fatale:', err)
  process.exit(1)
})
