# 🎉 Gestion Dynamique Providers IA - Guide d'Utilisation

**Status**: ✅ **IMPLÉMENTÉ** (Phases 1-5 complètes)
**Date**: 15 février 2026

---

## 🚀 Démarrage Rapide (5 minutes)

### 1. Appliquer Migration SQL

```bash
# En développement
npm run db:migrate

# Ou manuellement
psql -U postgres -d qadhya_dev -f migrations/20260215_create_operation_provider_configs.sql
```

### 2. Activer Feature Flag

```bash
# .env.local (dev)
DYNAMIC_OPERATION_CONFIG=true
```

### 3. Démarrer Serveur

```bash
npm run dev
```

### 4. Accéder à l'UI

Ouvrir: http://localhost:7002/super-admin/settings?tab=ai-architecture

✅ **Vous devriez voir** :
- Schéma de flux IA (existant)
- Configuration des Providers (existant) **+ colonne "Operations Actives"** 🆕
- **Configuration par Opération** (nouveau panel accordion) 🆕

---

## 📊 Fonctionnalités Disponibles

### 1. **Accordion 6 Opérations**

Chaque operation a sa propre configuration:
- ✅ `assistant-ia` : Chat utilisateur temps réel
- ✅ `indexation` : Indexation KB en batch
- ✅ `dossiers-assistant` : Analyse approfondie dossiers
- ✅ `dossiers-consultation` : Consultation juridique IRAC
- ✅ `kb-quality-analysis` : Analyse qualité documents longs
- ✅ `kb-quality-analysis-short` : Analyse qualité documents courts

### 2. **Configuration Provider par Opération**

Pour chaque opération, vous pouvez:
- ✅ **Enable/Disable providers** (switch toggle)
- ✅ **Set primary provider** (radio button)
- ✅ **Reorder fallback chain** (up/down arrows)
- ✅ **Configure timeouts** (inputs embedding/chat/total)
- ✅ **Test providers** (button "Tester tous")

### 3. **Validation Temps Réel**

- ❌ Bloque si primary provider disabled
- ❌ Bloque si chat timeout > total timeout
- ❌ Bloque si aucun provider enabled
- ⚠️ Warning si provider sans clé API

### 4. **Unsaved Changes Warning**

- 🟡 Sticky bar apparaît si modifications non sauvegardées
- 🟡 Warning beforeunload si quitter page
- 🟡 Affiche liste opérations modifiées

### 5. **Colonne "Operations Actives" (ProviderConfigTable)**

- ✅ Affiche quelles opérations utilisent chaque provider
- 🏆 Badge vert = Primary pour cette opération
- 🔵 Badge bleu = Fallback pour cette opération
- ✅ Max 3 opérations affichées + count

---

## 🛠️ Exemples d'Usage

### Exemple 1: Changer Provider Primaire

**Objectif**: Passer de Groq à Gemini pour `assistant-ia`

1. Aller sur `/super-admin/settings?tab=ai-architecture`
2. Expand accordion "Assistant IA"
3. Trouver ligne "Gemini"
4. Cliquer "Définir primaire"
5. Cliquer "Enregistrer tout"

**Résultat**:
- ✅ Gemini devient primary
- ✅ Groq devient fallback #1
- ✅ Cache invalidé
- ✅ Audit trail enregistré

### Exemple 2: Désactiver Provider

**Objectif**: Désactiver DeepSeek pour économiser quota

1. Expand accordion n'importe quelle opération
2. Trouver ligne "DeepSeek"
3. Toggle switch OFF
4. Auto-save (100ms debounce)

**Résultat**:
- ✅ DeepSeek retiré de `enabled_providers`
- ✅ Pas utilisé dans fallback chain
- ✅ Badge "Inactif" dans ProviderConfigTable

### Exemple 3: Reorder Fallback Chain

**Objectif**: Mettre Ollama en dernier fallback

1. Expand accordion
2. Trouver ligne "Ollama"
3. Cliquer flèche DOWN plusieurs fois
4. Auto-save

**Résultat**:
- ✅ Ordre fallback mis à jour
- ✅ Ollama utilisé en dernier recours seulement

### Exemple 4: Augmenter Timeout

**Objectif**: Chat timeout 30s → 40s pour `dossiers-consultation`

1. Expand accordion "Consultation Juridique"
2. Dans section "Timeouts", trouver "Chat"
3. Changer `30000` → `40000`
4. Auto-save

**Résultat**:
- ✅ Timeout chat augmenté
- ✅ Validation: 40000 ≤ total (60000) ✅

### Exemple 5: Tester Tous Providers

**Objectif**: Vérifier tous providers opérationnels

1. Expand accordion n'importe quelle opération
2. Cliquer "Tester tous"
3. Attendre 5-10s

**Résultat**:
- ✅ Toast notifications pour chaque provider
- ✅ Badges latency affichés (ex: "✅ 292ms")
- ✅ Errors affichés si échec

---

## 📡 API REST Disponibles

### GET /api/admin/operations-config

Liste toutes les configurations

```bash
curl http://localhost:7002/api/admin/operations-config \
  -H "Cookie: session=..."
```

**Response**:
```json
{
  "success": true,
  "operations": [
    {
      "operationName": "assistant-ia",
      "primaryProvider": "groq",
      "fallbackProviders": ["gemini", "deepseek", "ollama"],
      "source": "database"
    }
  ],
  "metadata": {
    "totalOperations": 6,
    "customConfigs": 2,
    "availableProviders": ["groq", "gemini", "deepseek", "openai", "ollama"]
  }
}
```

### GET /api/admin/operations-config/assistant-ia

Récupère une config + provider status

```bash
curl http://localhost:7002/api/admin/operations-config/assistant-ia
```

**Response**:
```json
{
  "success": true,
  "operation": { ... },
  "providerAvailability": {
    "groq": { "available": true, "hasApiKey": true },
    "gemini": { "available": true, "hasApiKey": true },
    "deepseek": { "available": false, "lastError": "API key manquante" }
  }
}
```

### PUT /api/admin/operations-config/assistant-ia

Met à jour configuration

```bash
curl -X PUT http://localhost:7002/api/admin/operations-config/assistant-ia \
  -H "Content-Type: application/json" \
  -d '{"primaryProvider": "gemini", "timeoutChat": 35000}'
```

**Response**:
```json
{
  "success": true,
  "operation": { ... },
  "changes": {
    "fields": ["primaryProvider", "timeoutChat"],
    "previous": { "primaryProvider": "groq" },
    "current": { "primaryProvider": "gemini" }
  },
  "warnings": []
}
```

### DELETE /api/admin/operations-config/assistant-ia

Reset aux valeurs par défaut

```bash
curl -X DELETE http://localhost:7002/api/admin/operations-config/assistant-ia
```

### POST /api/admin/operations-config/test-provider

Teste un provider

```bash
curl -X POST http://localhost:7002/api/admin/operations-config/test-provider \
  -H "Content-Type: application/json" \
  -d '{"provider": "groq", "testType": "chat"}'
```

**Response**:
```json
{
  "success": true,
  "provider": "groq",
  "result": {
    "available": true,
    "latencyMs": 292,
    "modelUsed": "llama-3.3-70b-versatile",
    "tokensUsed": { "input": 25, "output": 15, "total": 40 }
  }
}
```

---

## 🗄️ Structure Base de Données

### Table `operation_provider_configs`

```sql
CREATE TABLE operation_provider_configs (
  id UUID PRIMARY KEY,
  operation_name VARCHAR(100) UNIQUE,

  -- Providers
  primary_provider VARCHAR(50),
  fallback_providers JSONB,         -- ["gemini", "deepseek"]
  enabled_providers JSONB,           -- ["groq", "gemini", "deepseek"]

  -- Embeddings
  embeddings_provider VARCHAR(50),
  embeddings_model VARCHAR(100),
  embeddings_dimensions INTEGER,

  -- Timeouts (ms)
  timeout_embedding INTEGER,
  timeout_chat INTEGER,
  timeout_total INTEGER,

  -- LLM config
  llm_temperature DECIMAL(3,2),
  llm_max_tokens INTEGER,

  -- State
  is_active BOOLEAN DEFAULT true,
  use_static_config BOOLEAN DEFAULT false,  -- Fallback mode

  -- Audit
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  created_by VARCHAR(255),
  updated_by VARCHAR(255)
);
```

### Table `ai_config_change_history`

Audit trail complet de tous changements:

```sql
CREATE TABLE ai_config_change_history (
  id UUID PRIMARY KEY,
  operation_name VARCHAR(100),
  change_type VARCHAR(50),           -- create, update, reset, etc.
  changed_fields TEXT[],             -- ["primaryProvider", "timeoutChat"]
  old_values JSONB,
  new_values JSONB,
  changed_at TIMESTAMPTZ,
  changed_by VARCHAR(255)
);
```

### Vue `vw_provider_operation_usage`

Statistiques d'utilisation:

```sql
SELECT * FROM vw_provider_operation_usage;

-- Results:
provider  | operations_count | primary_count | operations_primary
----------+------------------+---------------+-------------------
groq      | 4                | 1             | {assistant-ia}
gemini    | 5                | 3             | {dossiers-assistant, ...}
openai    | 3                | 2             | {indexation, kb-quality-analysis-short}
```

---

## ⚙️ Configuration Avancée

### Feature Flag

```bash
# .env.local (dev) ou .env.production.local (prod)

# Active config dynamique (DB override static)
DYNAMIC_OPERATION_CONFIG=true

# Désactive config dynamique (fallback static uniquement)
DYNAMIC_OPERATION_CONFIG=false
```

### Cache TTL

Par défaut: **2 minutes**

Pour modifier:
```typescript
// lib/config/operations-config-service.ts
const CACHE_TTL_SECONDS = 120  // Changer ici
```

### Fallback Mode par Opération

Forcer une opération à utiliser config statique uniquement:

```sql
UPDATE operation_provider_configs
SET use_static_config = true
WHERE operation_name = 'assistant-ia';
```

---

## 🧪 Tests

### Tests Unitaires

```bash
npm run test lib/config/__tests__/operations-config-service.test.ts
```

**Coverage**: 40+ tests
- getOperationConfig (cache, DB, fallback)
- updateOperationConfig (validation, errors)
- resetOperationConfig
- Cache behavior

### Tests E2E (À créer)

```bash
npm run test:e2e
```

Scénarios:
- Change primary provider → verify DB updated
- Reorder fallback → verify order persisted
- Invalid config → verify blocked with error
- Test provider → verify latency returned

---

## 🚨 Troubleshooting

### Problème: Config pas sauvegardée

**Symptômes**: Clic "Enregistrer tout", mais rien ne change

**Solutions**:
1. ✅ Vérifier validation errors (alert box rouge)
2. ✅ Ouvrir console navigateur (F12), chercher erreurs API
3. ✅ Vérifier session super admin valide
4. ✅ Vérifier network tab: PUT request retourne 200

### Problème: Providers affichés mais pas testables

**Symptômes**: Button "Tester tous" ne fonctionne pas

**Solutions**:
1. ✅ Vérifier clés API configurées (tab "Architecture IA" → table providers)
2. ✅ Ouvrir console, chercher erreurs fetch
3. ✅ Tester API manuellement: `POST /api/admin/operations-config/test-provider`

### Problème: Unsaved changes bar ne disparaît pas

**Symptômes**: Barre jaune reste affichée après save

**Solutions**:
1. ✅ Actualiser page (F5)
2. ✅ Vérifier que save a réussi (toast vert)
3. ✅ Clear cache navigateur

### Problème: Colonne "Operations Actives" vide

**Symptômes**: Tous providers affichent "Aucune"

**Solutions**:
1. ✅ Vérifier migration SQL appliquée
2. ✅ Vérifier seed data insérée: `SELECT COUNT(*) FROM operation_provider_configs;` (doit = 6)
3. ✅ Reload page (refresh state)

---

## 📚 Documentation Complète

- **`docs/DYNAMIC_PROVIDERS_IMPLEMENTATION.md`** : Plan complet, architecture, déploiement
- **`lib/config/operations-config-service.ts`** : Code service avec comments inline
- **`migrations/20260215_create_operation_provider_configs.sql`** : Schema DB avec comments

---

## 🎯 Prochaines Étapes

### Production

1. **Appliquer migration SQL**:
   ```bash
   ssh root@84.247.165.187
   psql -U moncabinet -d qadhya -f /opt/qadhya/migrations/20260215_create_operation_provider_configs.sql
   ```

2. **Activer feature flag**:
   ```bash
   echo "DYNAMIC_OPERATION_CONFIG=true" >> /opt/qadhya/.env.production.local
   ```

3. **Rebuild Docker (Tier 2)**:
   ```bash
   gh workflow run "Deploy to VPS Contabo" -f force_docker=true
   ```

4. **Vérifier**:
   ```bash
   curl https://qadhya.tn/api/admin/operations-config
   # Ouvrir: https://qadhya.tn/super-admin/settings?tab=ai-architecture
   ```

### Tests

- ⏳ Tests E2E UI (Playwright) - 20+ scénarios
- ⏳ Tests integration API - 30+ tests
- ⏳ Tests performance (cache hit rate, API latency)

### Améliorations Optionnelles

- Auto-save (vs manuel)
- Import/Export configs JSON
- Historique audit trail UI
- Presets (Performance, Qualité, Économie)
- A/B Testing providers
- Metrics dashboard

---

## 💡 Astuces

### Astuce 1: Keyboard Shortcuts

- `Cmd/Ctrl + S` : Save all (si unsaved changes)
- `Escape` : Cancel all (reset pending changes)

### Astuce 2: Batch Operations

Pour modifier plusieurs opérations d'un coup:
1. Expand plusieurs accordions
2. Faire modifications
3. Click "Enregistrer tout" (save toutes en 1 fois)

### Astuce 3: Quick Test

Pour tester rapidement un provider sur toutes opérations:
1. Aller dans ProviderConfigTable
2. Cliquer icône "Test" (TestTube)
3. → Teste avec config de l'opération primaire

### Astuce 4: Rollback Rapide

Si mauvaise config déployée:
```bash
# Option 1: Reset une opération
curl -X DELETE https://qadhya.tn/api/admin/operations-config/assistant-ia

# Option 2: Désactiver config dynamique (fallback static)
ssh root@84.247.165.187
echo "DYNAMIC_OPERATION_CONFIG=false" >> /opt/qadhya/.env.production.local
docker compose restart nextjs
```

---

## 🎉 Félicitations!

Vous avez maintenant un système complet de gestion dynamique des providers IA par opération!

**Questions?** Consultez:
- `docs/DYNAMIC_PROVIDERS_IMPLEMENTATION.md` (détails techniques)
- Code source avec inline comments
- Tests unitaires (exemples d'usage)

**Happy configuring!** 🚀
