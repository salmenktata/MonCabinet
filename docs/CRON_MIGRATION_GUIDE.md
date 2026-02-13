# Guide Migration Crons vers Système Monitoring

## 🎯 Objectif

Instrumenter les 5 crons restants pour activer le monitoring automatique.

## 📋 Crons à Migrer

| Cron | Fichier | Priorité | Complexité |
|------|---------|----------|------------|
| ✅ monitor-openai | `cron-monitor-openai.sh` | - | ✅ Fait |
| ⏳ check-alerts | `cron-check-alerts.sh` | Haute | Simple |
| ⏳ refresh-mv-metadata | `cron-refresh-mv-metadata.sh` | Moyenne | Simple |
| ⏳ reanalyze-kb-failures | `cron-reanalyze-kb-failures.sh` | Haute | Moyenne |
| ⏳ index-kb | `index-kb-progressive.sh` | Haute | Moyenne |
| ⏳ acquisition-weekly | `cron-acquisition-weekly.ts` | Basse | Complexe (TS) |

## 🔧 Pattern de Migration Standard

### Étape 1: Ajouter Imports (en haut du fichier)

**Ajouter après `#!/bin/bash` et `set -e`**:

```bash
#!/bin/bash
set -e

# ⬇️ AJOUTER CES LIGNES ⬇️
# Charger library cron logging
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/lib/cron-logger.sh"

# Récupérer le secret cron et configurer API
CRON_SECRET=$(grep CRON_SECRET /opt/qadhya/.env.production.local | cut -d= -f2)

if [ -z "$CRON_SECRET" ]; then
  echo "❌ CRON_SECRET introuvable dans .env.production.local"
  exit 1
fi

# Configurer variables pour cron-logger
export CRON_SECRET
export CRON_API_BASE="https://qadhya.tn"
# ⬆️ FIN AJOUT ⬆️

# ... reste du code existant ...
```

### Étape 2: Démarrer Tracking (après imports, avant logique métier)

```bash
# ⬇️ AJOUTER CES LIGNES ⬇️
# Démarrer tracking de l'exécution
cron_start "NOM-DU-CRON" "scheduled"

# Trap pour gérer les erreurs inattendues
trap 'cron_fail "Script terminé avec erreur" $?' EXIT
# ⬆️ FIN AJOUT ⬆️

# ... logique métier existante ...
```

### Étape 3: Capturer Métriques (dans la logique métier)

**Identifier les métriques importantes à tracker**:

```bash
# Exemple: nombre d'items traités
PROCESSED_COUNT=0
ERROR_COUNT=0

# ... traitement ...

# Incrémenter compteurs
PROCESSED_COUNT=$((PROCESSED_COUNT + 1))
```

### Étape 4: Fin Script (remplacer `exit 0`)

**Avant**:
```bash
echo "✅ Traitement terminé"
exit 0
```

**Après**:
```bash
echo "✅ Traitement terminé"

# ⬇️ AJOUTER CES LIGNES ⬇️
# Cleanup trap
trap - EXIT

# Enregistrer succès avec métriques
OUTPUT_JSON=$(cat <<EOF
{
  "processed": $PROCESSED_COUNT,
  "errors": $ERROR_COUNT,
  "customMetric": $AUTRE_METRIQUE
}
EOF
)

cron_complete "$OUTPUT_JSON"
# ⬆️ FIN AJOUT ⬆️

exit 0
```

### Étape 5: Gérer Échecs Explicites (si applicable)

**Si le script a des `exit 1` explicites**:

**Avant**:
```bash
if [ "$ALERT_LEVEL" = "critical" ]; then
  echo "⚠️ ERREUR CRITIQUE"
  exit 1
fi
```

**Après**:
```bash
if [ "$ALERT_LEVEL" = "critical" ]; then
  echo "⚠️ ERREUR CRITIQUE"

  # ⬇️ AJOUTER CES LIGNES ⬇️
  # Cleanup trap avant exit
  trap - EXIT

  # Enregistrer échec avec contexte
  cron_fail "Alerte critique détectée: $ALERT_MESSAGE" 1
  # ⬆️ FIN AJOUT ⬆️

  exit 1
fi
```

## 📝 Exemples Complets

### Exemple 1: check-alerts (Simple)

```bash
#!/bin/bash
set -e

# Charger library
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/lib/cron-logger.sh"

# Config
CRON_SECRET=$(grep CRON_SECRET /opt/qadhya/.env.production.local | cut -d= -f2)
export CRON_SECRET
export CRON_API_BASE="https://qadhya.tn"

# Démarrer tracking
cron_start "check-alerts" "scheduled"
trap 'cron_fail "Script terminé avec erreur" $?' EXIT

echo "$(date) - Vérification alertes système"

# Appeler API alertes
RESPONSE=$(curl -s -H "X-Cron-Secret: $CRON_SECRET" \
  https://qadhya.tn/api/admin/alerts/check)

# Parser résultats
ALERTS_COUNT=$(echo "$RESPONSE" | jq -r '.alertsCount // 0')
CRITICAL_COUNT=$(echo "$RESPONSE" | jq -r '.criticalCount // 0')

echo "Alertes trouvées: $ALERTS_COUNT (dont $CRITICAL_COUNT critiques)"

# Cleanup trap
trap - EXIT

# Enregistrer succès
OUTPUT_JSON=$(cat <<EOF
{
  "alertsCount": $ALERTS_COUNT,
  "criticalCount": $CRITICAL_COUNT,
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
EOF
)

cron_complete "$OUTPUT_JSON"
exit 0
```

### Exemple 2: index-kb (Avec Métriques Détaillées)

```bash
#!/bin/bash
set -e

# Charger library
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/lib/cron-logger.sh"

# Config
CRON_SECRET=$(grep CRON_SECRET /opt/qadhya/.env.production.local | cut -d= -f2)
export CRON_SECRET
export CRON_API_BASE="https://qadhya.tn"

# Démarrer tracking
cron_start "index-kb" "scheduled"
trap 'cron_fail "Script terminé avec erreur" $?' EXIT

echo "$(date) - Indexation KB progressive (2 docs)"

# Appeler API indexation
RESPONSE=$(curl -s -X POST \
  -H "X-Cron-Secret: $CRON_SECRET" \
  https://qadhya.tn/api/admin/index-kb)

# Parser résultats
INDEXED=$(echo "$RESPONSE" | jq -r '.indexed // 0')
FAILED=$(echo "$RESPONSE" | jq -r '.failed // 0')
REMAINING=$(echo "$RESPONSE" | jq -r '.remaining // 0')
TOTAL=$(echo "$RESPONSE" | jq -r '.total // 0')

echo "Indexé: $INDEXED docs, Échecs: $FAILED, Restants: $REMAINING/$TOTAL"

# Vérifier échecs
if [ "$FAILED" -gt 0 ]; then
  echo "⚠️ WARNING: $FAILED documents ont échoué"
fi

# Cleanup trap
trap - EXIT

# Enregistrer succès avec métriques détaillées
OUTPUT_JSON=$(cat <<EOF
{
  "indexed": $INDEXED,
  "failed": $FAILED,
  "remaining": $REMAINING,
  "total": $TOTAL,
  "completion_percentage": $(echo "scale=2; ($TOTAL - $REMAINING) * 100 / $TOTAL" | bc)
}
EOF
)

cron_complete "$OUTPUT_JSON"
exit 0
```

### Exemple 3: acquisition-weekly.ts (TypeScript)

**Pattern TypeScript** (à adapter):

```typescript
#!/usr/bin/env node

import { createClient } from '@/lib/supabase/server'

// Helper pour cron logging en TypeScript
async function cronStart(cronName: string, triggerType = 'scheduled') {
  const response = await fetch(`${process.env.CRON_API_BASE}/api/admin/cron-executions/start`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Cron-Secret': process.env.CRON_SECRET!,
    },
    body: JSON.stringify({ cronName, triggerType }),
  })

  const data = await response.json()
  return data.executionId
}

async function cronComplete(executionId: string, output: any) {
  const startTime = Date.now()
  const durationMs = Date.now() - startTime

  await fetch(`${process.env.CRON_API_BASE}/api/admin/cron-executions/complete`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Cron-Secret': process.env.CRON_SECRET!,
    },
    body: JSON.stringify({
      executionId,
      status: 'completed',
      durationMs,
      output,
    }),
  })
}

async function cronFail(executionId: string, errorMessage: string, exitCode = 1) {
  await fetch(`${process.env.CRON_API_BASE}/api/admin/cron-executions/complete`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Cron-Secret': process.env.CRON_SECRET!,
    },
    body: JSON.stringify({
      executionId,
      status: 'failed',
      errorMessage,
      exitCode,
    }),
  })
}

// Main
async function main() {
  let executionId: string | null = null

  try {
    // Démarrer tracking
    executionId = await cronStart('acquisition-weekly', 'scheduled')

    console.log('[Acquisition Weekly] Génération rapport...')

    // ... logique métier ...

    const reportGenerated = true
    const clientsCount = 42

    // Enregistrer succès
    if (executionId) {
      await cronComplete(executionId, {
        reportGenerated,
        clientsCount,
        timestamp: new Date().toISOString(),
      })
    }

    console.log('✅ Rapport généré avec succès')
    process.exit(0)
  } catch (error: any) {
    console.error('❌ Erreur:', error.message)

    if (executionId) {
      await cronFail(executionId, error.message, 1)
    }

    process.exit(1)
  }
}

main()
```

## ✅ Checklist Migration

Pour chaque cron migré:

- [ ] Ajouter imports library cron-logger
- [ ] Configurer CRON_SECRET et CRON_API_BASE
- [ ] Appeler `cron_start()` au début
- [ ] Ajouter `trap` pour gestion erreurs
- [ ] Identifier métriques à tracker
- [ ] Capturer métriques dans variables
- [ ] Construire OUTPUT_JSON à la fin
- [ ] Appeler `cron_complete()` avant exit 0
- [ ] Gérer échecs explicites avec `cron_fail()`
- [ ] Cleanup trap avant tous les exits
- [ ] Tester localement avec `CRON_API_BASE=http://localhost:7002`
- [ ] Vérifier exécution apparaît dans dashboard
- [ ] Commit avec message clair

## 🧪 Tests

### Test Local (Avant Commit)

```bash
# 1. Configurer variables locales
export CRON_SECRET="test-secret"
export CRON_API_BASE="http://localhost:7002"

# 2. Lancer dev server
npm run dev

# 3. Exécuter cron modifié
./scripts/cron-check-alerts.sh

# 4. Vérifier dashboard
open http://localhost:7002/super-admin/monitoring?tab=crons

# 5. Vérifier base de données
psql -U postgres -d qadhya_dev -c "
  SELECT cron_name, status, duration_ms, output
  FROM cron_executions
  ORDER BY started_at DESC
  LIMIT 5;
"
```

### Test Production (Après Deploy)

```bash
# 1. SSH vers VPS
ssh root@84.247.165.187

# 2. Exécuter cron manuellement
/opt/qadhya/scripts/cron-check-alerts.sh

# 3. Vérifier logs
tail -f /var/log/qadhya/alerts.log

# 4. Vérifier dashboard
open https://qadhya.tn/super-admin/monitoring?tab=crons

# 5. Vérifier DB
psql -U moncabinet -d qadhya -c "
  SELECT * FROM cron_executions
  WHERE cron_name = 'check-alerts'
  ORDER BY started_at DESC
  LIMIT 1;
"
```

## 📊 Métriques Recommandées par Cron

| Cron | Métriques Output JSON |
|------|----------------------|
| check-alerts | `alertsCount`, `criticalCount`, `emailsSent` |
| refresh-mv-metadata | `viewsRefreshed`, `totalRows`, `durationMs` |
| reanalyze-kb-failures | `reanalyzed`, `fixed`, `stillFailing`, `avgScore` |
| index-kb | `indexed`, `failed`, `remaining`, `total`, `completion_%` |
| acquisition-weekly | `reportGenerated`, `clientsCount`, `conversions`, `revenue` |

## 🚨 Pièges à Éviter

### ❌ Piège 1: Oublier `trap - EXIT`
```bash
# MAUVAIS
cron_complete "$OUTPUT"
exit 0  # ❌ trap EXIT va appeler cron_fail !

# BON
trap - EXIT
cron_complete "$OUTPUT"
exit 0  # ✅ trap désactivé
```

### ❌ Piège 2: JSON Mal Formé
```bash
# MAUVAIS
OUTPUT='{"count": $COUNT}'  # ❌ variable pas interpolée

# BON
OUTPUT=$(cat <<EOF
{
  "count": $COUNT
}
EOF
)
```

### ❌ Piège 3: CRON_SECRET Vide
```bash
# MAUVAIS
export CRON_SECRET=$(grep CRON_SECRET /opt/qadhya/.env)
# ❌ retourne "CRON_SECRET=value"

# BON
export CRON_SECRET=$(grep CRON_SECRET /opt/qadhya/.env | cut -d= -f2)
# ✅ retourne "value"
```

### ❌ Piège 4: Plusieurs `exit 1` Non Gérés
```bash
# MAUVAIS
if [ condition ]; then
  exit 1  # ❌ trap va enregistrer, mais message générique
fi

# BON
if [ condition ]; then
  trap - EXIT
  cron_fail "Message spécifique" 1
  exit 1
fi
```

## 📚 Ressources

- **Documentation complète**: `docs/CRON_MONITORING.md`
- **Library bash**: `scripts/lib/cron-logger.sh`
- **Exemple modifié**: `scripts/cron-monitor-openai.sh`
- **Tests**: `scripts/test-cron-logger.sh`
- **Dashboard**: https://qadhya.tn/super-admin/monitoring?tab=crons

---

**Temps Estimé par Cron**: 15-30 min
**Ordre Recommandé**: check-alerts → refresh-mv → reanalyze-kb → index-kb → acquisition-weekly
