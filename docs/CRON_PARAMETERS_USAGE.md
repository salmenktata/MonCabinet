# Guide des Paramètres Cron (Phase 6.2)

## 📋 Vue d'ensemble

Le système de monitoring des crons supporte maintenant des **paramètres configurables** pour chaque cron. Les utilisateurs peuvent personnaliser l'exécution via des formulaires dynamiques dans l'interface web.

## 🏗️ Architecture

```
UI Modal (Formulaire dynamique)
    ↓
POST /api/admin/cron-executions/trigger
    ↓
Validation (validateCronParameters)
    ↓
Conversion (parametersToEnvVars)
    ↓
HTTP → Python Server (cron-trigger-server.py)
    ↓
subprocess.Popen(script, env={BATCH_SIZE: 5, ...})
    ↓
Script Bash (lit $BATCH_SIZE, $CATEGORIES, etc.)
```

## 📂 Fichiers Clés

- **`lib/cron/cron-parameters.ts`** : Configuration centrale des paramètres
- **`components/super-admin/monitoring/CronTriggerModal.tsx`** : Formulaire UI dynamique
- **`app/api/admin/cron-executions/trigger/route.ts`** : Validation + conversion
- **`scripts/cron-trigger-server.py`** : Injection variables d'environnement

## 🔧 Ajouter des Paramètres à un Cron

### 1. Définir les Paramètres (`lib/cron/cron-parameters.ts`)

```typescript
export const CRON_PARAMETERS: Record<string, CronParametersConfig> = {
  'mon-cron': {
    cronName: 'mon-cron',
    parameters: [
      {
        name: 'batchSize', // Nom technique (camelCase)
        label: 'Taille du batch', // Label UI (français)
        description: 'Nombre de documents à traiter par batch',
        type: 'number', // number | select | text | boolean | multiselect
        required: false,
        defaultValue: 10,
        min: 1,
        max: 100,
        step: 5,
        envVar: 'BATCH_SIZE', // Variable d'environnement (UPPER_CASE)
      },
      {
        name: 'provider',
        label: 'Provider IA',
        description: 'Choisir le provider LLM à utiliser',
        type: 'select',
        required: false,
        defaultValue: 'auto',
        options: [
          { value: 'auto', label: 'Auto (fallback cascade)' },
          { value: 'openai', label: 'OpenAI uniquement' },
          { value: 'gemini', label: 'Gemini uniquement' },
        ],
        envVar: 'FORCE_PROVIDER',
      },
    ],
  },
}
```

### 2. Adapter le Script Bash

#### Pattern Recommandé

```bash
#!/bin/bash
# scripts/mon-cron.sh

# Phase 6.2: Lire paramètres depuis variables d'environnement
BATCH_SIZE=${BATCH_SIZE:-10}           # Défaut: 10
FORCE_PROVIDER=${FORCE_PROVIDER:-auto} # Défaut: auto
SKIP_EMBEDDINGS=${SKIP_EMBEDDINGS:-0}  # Boolean: 0=false, 1=true
CATEGORIES=${CATEGORIES:-}             # Multiselect: "jurisprudence,codes"

echo "📊 Paramètres:"
echo "   BATCH_SIZE=$BATCH_SIZE"
echo "   FORCE_PROVIDER=$FORCE_PROVIDER"
echo "   SKIP_EMBEDDINGS=$SKIP_EMBEDDINGS"
[[ -n "$CATEGORIES" ]] && echo "   CATEGORIES=$CATEGORIES"

# Utiliser les paramètres dans la logique
if [[ "$SKIP_EMBEDDINGS" == "1" ]]; then
  echo "⚠️ Mode test: embeddings désactivés"
  EXTRA_FLAGS="--skip-embeddings"
fi

# Exemple appel API avec paramètres
RESPONSE=$(curl -s -X POST "$API_URL/api/admin/index-kb" \
  -H "X-Cron-Secret: $CRON_SECRET" \
  -H "Content-Type: application/json" \
  -d "{\"batchSize\": $BATCH_SIZE, \"provider\": \"$FORCE_PROVIDER\"}")

# Traiter CATEGORIES (multiselect)
if [[ -n "$CATEGORIES" ]]; then
  IFS=',' read -ra CATS <<< "$CATEGORIES"
  for cat in "${CATS[@]}"; do
    echo "  📁 Processing category: $cat"
    # Logique par catégorie
  done
fi
```

#### Exemple Réel: `scripts/index-kb-progressive.sh`

```bash
#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/lib/cron-logger.sh"

# Phase 6.2: Paramètres configurables
BATCH_SIZE=${BATCH_SIZE:-2}           # Défaut: 2 docs
CATEGORIES=${CATEGORIES:-}             # Vide = toutes catégories
SKIP_EMBEDDINGS=${SKIP_EMBEDDINGS:-0}  # 0 = génère embeddings

cron_start "index-kb-progressive"
trap 'cron_fail "Script terminated" $?' EXIT

echo "🚀 Indexation KB Progressive (Phase 6.2)"
echo "   Batch size: $BATCH_SIZE"
[[ -n "$CATEGORIES" ]] && echo "   Categories: $CATEGORIES"
[[ "$SKIP_EMBEDDINGS" == "1" ]] && echo "   ⚠️ Skip embeddings: YES"

# Construire payload JSON
PAYLOAD="{\"batchSize\": $BATCH_SIZE"
[[ -n "$CATEGORIES" ]] && PAYLOAD="$PAYLOAD, \"categories\": \"$CATEGORIES\""
[[ "$SKIP_EMBEDDINGS" == "1" ]] && PAYLOAD="$PAYLOAD, \"skipEmbeddings\": true"
PAYLOAD="$PAYLOAD}"

# Appeler API
API_URL="${API_URL:-http://host.docker.internal:7002}"
RESPONSE=$(curl -s -X POST "$API_URL/api/admin/index-kb" \
  -H "X-Cron-Secret: $CRON_SECRET" \
  -H "Content-Type: application/json" \
  -d "$PAYLOAD")

# Parser résultats
INDEXED=$(echo "$RESPONSE" | jq -r '.indexed // 0')
REMAINING=$(echo "$RESPONSE" | jq -r '.remaining // 0')
SUCCESS=$(echo "$RESPONSE" | jq -r '.success')

if [[ "$SUCCESS" == "true" ]]; then
  OUTPUT=$(jq -n \
    --argjson indexed "$INDEXED" \
    --argjson remaining "$REMAINING" \
    '{indexed: $indexed, remaining: $remaining}')

  trap - EXIT
  cron_complete "$OUTPUT"
  exit 0
else
  ERROR=$(echo "$RESPONSE" | jq -r '.error // "Unknown error"')
  cron_fail "$ERROR" 1
  exit 1
fi
```

## 🎨 Types de Paramètres UI

### 1. Number (Slider ou Input)

```typescript
{
  type: 'number',
  min: 1,
  max: 100,
  step: 5,
  defaultValue: 10,
}
```

**Rendu UI** : `<Input type="number" min={1} max={100} step={5} />`

### 2. Select (Dropdown)

```typescript
{
  type: 'select',
  options: [
    { value: 'auto', label: 'Auto', description: 'Fallback cascade' },
    { value: 'openai', label: 'OpenAI' },
  ],
  defaultValue: 'auto',
}
```

**Rendu UI** : `<Select>` avec options affichant label + description

### 3. Boolean (Checkbox)

```typescript
{
  type: 'boolean',
  defaultValue: false,
}
```

**Rendu UI** : `<Checkbox>` avec label "Activé"
**Bash** : `0` (false) ou `1` (true)

### 4. Multiselect (Liste de Checkboxes)

```typescript
{
  type: 'multiselect',
  options: [
    { value: 'jurisprudence', label: 'Jurisprudence' },
    { value: 'codes', label: 'Codes' },
  ],
  defaultValue: [],
}
```

**Rendu UI** : Liste scrollable de `<Checkbox>` (max-height 192px)
**Bash** : `"jurisprudence,codes"` (CSV)

```bash
IFS=',' read -ra ITEMS <<< "$CATEGORIES"
for item in "${ITEMS[@]}"; do
  echo "Processing: $item"
done
```

### 5. Text (Input texte libre)

```typescript
{
  type: 'text',
  placeholder: 'Entrer un filtre...',
  maxLength: 100,
  pattern: '^[a-zA-Z0-9_-]+$', // Optionnel: validation regex
}
```

## 🧪 Tests

### Test Validation Côté Client

```typescript
import { validateCronParameters } from '@/lib/cron/cron-parameters'

const result = validateCronParameters('index-kb-progressive', {
  batchSize: 150, // Invalide: max = 20
  categories: ['jurisprudence', 'invalid'], // Invalide: "invalid" n'existe pas
})

console.log(result)
// {
//   valid: false,
//   errors: [
//     '"Taille du batch" doit être ≤ 20',
//     '"Catégories à indexer" contient des valeurs invalides: invalid'
//   ]
// }
```

### Test Conversion Env Vars

```typescript
import { parametersToEnvVars } from '@/lib/cron/cron-parameters'

const envVars = parametersToEnvVars('index-kb-progressive', {
  batchSize: 5,
  categories: ['jurisprudence', 'codes'],
  skipEmbeddings: true,
})

console.log(envVars)
// {
//   BATCH_SIZE: '5',
//   CATEGORIES: 'jurisprudence,codes',
//   SKIP_EMBEDDINGS: '1'
// }
```

### Test End-to-End (Local)

```bash
# 1. UI Dashboard → http://localhost:7002/super-admin/monitoring?tab=crons
# 2. Cliquer "index-kb-progressive"
# 3. Modal s'ouvre avec formulaire paramètres
# 4. Modifier "Taille du batch" → 5
# 5. Sélectionner "Jurisprudence" + "Codes"
# 6. Cocher "Sauter les embeddings"
# 7. Cliquer "Exécuter Maintenant"
# 8. Vérifier logs: /var/log/qadhya/index-kb-progressive.log
# 9. Rechercher lignes:
#    Batch size: 5
#    Categories: jurisprudence,codes
#    ⚠️ Skip embeddings: YES
```

## 📊 Exemples Réels

### Cron `reanalyze-kb-failures`

**Paramètres** :
- `maxDocs` (number): Limite de documents (0-500, défaut 50)
- `scoreThreshold` (select): Seuil de qualité (0, 50, 60, 70)
- `forceProvider` (select): Provider LLM (auto, openai, gemini, ollama)

**Usage Bash** :

```bash
MAX_DOCS=${MAX_DOCS:-50}
SCORE_THRESHOLD=${SCORE_THRESHOLD:-50}
FORCE_PROVIDER=${FORCE_PROVIDER:-auto}

RESPONSE=$(curl -s -X POST "$API_URL/api/admin/reanalyze-kb-failures" \
  -H "Content-Type: application/json" \
  -d "{
    \"maxDocs\": $MAX_DOCS,
    \"scoreThreshold\": $SCORE_THRESHOLD,
    \"forceProvider\": \"$FORCE_PROVIDER\"
  }")
```

### Cron `cleanup-executions`

**Paramètres** :
- `retentionDays` (number): Jours de rétention (1-90, défaut 7)
- `keepFailed` (boolean): Conserver échecs (défaut true)

**Usage Bash** :

```bash
RETENTION_DAYS=${RETENTION_DAYS:-7}
KEEP_FAILED=${KEEP_FAILED:-1}

DELETE_CLAUSE="WHERE completed_at < NOW() - INTERVAL '$RETENTION_DAYS days'"
if [[ "$KEEP_FAILED" == "1" ]]; then
  DELETE_CLAUSE="$DELETE_CLAUSE AND status != 'failed'"
fi

psql -c "DELETE FROM cron_executions $DELETE_CLAUSE"
```

## ⚠️ Bonnes Pratiques

### 1. Toujours Fournir des Valeurs par Défaut

```bash
# ✅ BON
BATCH_SIZE=${BATCH_SIZE:-10}

# ❌ MAUVAIS (crash si variable absente)
if [[ -z "$BATCH_SIZE" ]]; then
  BATCH_SIZE=10
fi
```

### 2. Valider les Valeurs Bash

```bash
# Validation nombre positif
if [[ ! "$BATCH_SIZE" =~ ^[0-9]+$ ]] || [[ "$BATCH_SIZE" -le 0 ]]; then
  echo "❌ BATCH_SIZE invalide: $BATCH_SIZE"
  exit 1
fi

# Validation enum
VALID_PROVIDERS="auto openai gemini ollama"
if [[ ! "$VALID_PROVIDERS" =~ (^|[[:space:]])"$FORCE_PROVIDER"($|[[:space:]]) ]]; then
  echo "❌ FORCE_PROVIDER invalide: $FORCE_PROVIDER"
  exit 1
fi
```

### 3. Logger les Paramètres Utilisés

```bash
echo "📊 Paramètres d'exécution:"
echo "   BATCH_SIZE=$BATCH_SIZE"
echo "   CATEGORIES=$CATEGORIES"
echo "   SKIP_EMBEDDINGS=$SKIP_EMBEDDINGS"
```

→ Permet de déboguer via `/var/log/qadhya/{cron}.log`

### 4. Documenter dans le Script

```bash
#!/bin/bash
# scripts/mon-cron.sh
#
# Variables d'environnement supportées (Phase 6.2):
#   BATCH_SIZE       Nombre de documents par batch (défaut: 10, min: 1, max: 100)
#   CATEGORIES       Liste CSV de catégories (ex: "jurisprudence,codes")
#   SKIP_EMBEDDINGS  Sauter génération embeddings (0=false, 1=true)
#   FORCE_PROVIDER   Provider LLM forcé (auto|openai|gemini|ollama)
```

## 🐛 Debugging

### Vérifier les Paramètres Reçus

**Logs serveur Python** (`/var/log/qadhya/cron-trigger-server.log`) :

```
[2026-02-14 10:30:15] ▶️  Triggering cron: index-kb-progressive (Indexation KB Progressive)
[2026-02-14 10:30:15]    📊 Parameters: {"BATCH_SIZE": "5", "CATEGORIES": "jurisprudence,codes", "SKIP_EMBEDDINGS": "1"}
[2026-02-14 10:30:15]    🔧 BATCH_SIZE=5
[2026-02-14 10:30:15]    🔧 CATEGORIES=jurisprudence,codes
[2026-02-14 10:30:15]    🔧 SKIP_EMBEDDINGS=1
[2026-02-14 10:30:15] ✅ Cron started: index-kb-progressive
```

**Logs script bash** (`/var/log/qadhya/index-kb-progressive.log`) :

```
🚀 Indexation KB Progressive (Phase 6.2)
   Batch size: 5
   Categories: jurisprudence,codes
   ⚠️ Skip embeddings: YES
```

### Erreurs Courantes

#### 1. Variable Non Passée au Script

**Symptôme** : `BATCH_SIZE=` (vide) dans logs bash
**Cause** : `envVar` mal configuré dans `cron-parameters.ts`
**Fix** : Vérifier `envVar: 'BATCH_SIZE'` (UPPER_CASE)

#### 2. Validation Échoue Côté Serveur

**Symptôme** : HTTP 400 "Invalid parameters"
**Cause** : Validation stricte (min/max, enum, etc.)
**Fix** : Vérifier `validationErrors` dans réponse API

#### 3. Type Mismatch Bash

**Symptôme** : Script crash "integer expression expected"
**Cause** : `BATCH_SIZE` contient texte au lieu de nombre
**Fix** : Valider avec `[[ "$BATCH_SIZE" =~ ^[0-9]+$ ]]`

## 📚 Références

- **Config paramètres** : `lib/cron/cron-parameters.ts`
- **UI Modal** : `components/super-admin/monitoring/CronTriggerModal.tsx`
- **API Trigger** : `app/api/admin/cron-executions/trigger/route.ts`
- **Serveur Python** : `scripts/cron-trigger-server.py`
- **Exemple script** : `scripts/index-kb-progressive.sh`
- **Tests** : `npm run test:cron-parameters` (TODO)

---

**Dernière mise à jour** : 14 février 2026 - Phase 6.2 Paramètres Cron ✅
