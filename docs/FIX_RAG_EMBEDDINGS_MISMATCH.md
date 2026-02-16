# Fix RAG Embeddings Dimension Mismatch

**Date** : 16 février 2026
**Problème** : Assistant IA répond "لم أجد وثائق ذات صلة" malgré 165+ chunks pertinents en KB
**Root Cause** : Mismatch dimensions embeddings query (1024-dim Ollama) vs KB (1536-dim OpenAI)

---

## 🔍 Diagnostic

### État Actuel KB
```sql
-- 165 chunks sur légitime défense avec embeddings OpenAI
SELECT COUNT(*) FROM knowledge_base_chunks kbc
JOIN knowledge_base kb ON kbc.knowledge_base_id = kb.id
WHERE kb.is_active = true
  AND kbc.embedding_openai IS NOT NULL
  AND kbc.content_tsvector @@ plainto_tsquery('simple', 'الدفاع الشرعي');
-- Résultat: 165 chunks

-- Mais seulement 34 avec embeddings Ollama
SELECT COUNT(*) FROM knowledge_base_chunks kbc
JOIN knowledge_base kb ON kbc.knowledge_base_id = kb.id
WHERE kb.is_active = true
  AND kbc.embedding IS NOT NULL
  AND kbc.content_tsvector @@ plainto_tsquery('simple', 'الدفاع الشرعي');
-- Résultat: 34 chunks
```

### Configuration Actuelle
```typescript
// lib/ai/operations-config.ts - assistant-ia
embeddings: isDev
  ? { provider: 'ollama', model: 'qwen3-embedding:0.6b', dimensions: 1024 }
  : { provider: 'openai', model: 'text-embedding-3-small', dimensions: 1536 },
```

**En production** : NODE_ENV=production + OPENAI_API_KEY définie → devrait utiliser OpenAI
**Mais** : Query génère probablement embedding Ollama (1024-dim) à cause de fallback/cache

---

## ✅ Solution Définitive

### Option A : Forcer OpenAI Embeddings Partout (RECOMMANDÉ)

**Avantages** :
- Qualité supérieure (text-embedding-3-small meilleur que qwen3)
- Cohérence 100% (même dimension query + KB)
- Coût acceptable (~$2-5/mois)

**Implémentation** :

1. **Modifier configuration pour FORCER OpenAI en production** :
```typescript
// lib/ai/operations-config.ts - assistant-ia
embeddings: {
  provider: 'openai',  // Forcer OpenAI même si OLLAMA_ENABLED=true
  model: 'text-embedding-3-small',
  dimensions: 1536
},
```

2. **Ajouter validation dimension avant recherche** :
```typescript
// lib/ai/knowledge-base-service.ts - searchKnowledgeBaseHybrid
const queryEmbedding = await generateEmbedding(query, {
  operationName: operationName as any,
})

// VALIDATION CRITIQUE : Vérifier dimension avant recherche SQL
const expectedDim = useOpenAI ? 1536 : 1024
if (queryEmbedding.embedding.length !== expectedDim) {
  throw new Error(
    `Embedding dimension mismatch: got ${queryEmbedding.embedding.length}, expected ${expectedDim} for provider ${useOpenAI ? 'OpenAI' : 'Ollama'}`
  )
}
```

3. **Purger cache Redis embeddings** (une seule fois après fix) :
```bash
ssh root@84.247.165.187 "docker exec qadhya-redis redis-cli KEYS 'embedding:*' | xargs -L 100 docker exec qadhya-redis redis-cli DEL"
```

### Option B : Forcer Ollama Partout (Gratuit mais moins performant)

**Avantages** :
- Gratuit (0€/mois)
- Local, pas de dépendance externe

**Inconvénients** :
- **Nécessite réindexation COMPLÈTE de la KB** (2958 docs × 8.5 chunks = 25K chunks)
- Temps estimé : 48-72h (25K chunks × 10s/chunk)
- Qualité inférieure à OpenAI

**Implémentation** :
```typescript
// lib/ai/operations-config.ts - assistant-ia
embeddings: {
  provider: 'ollama',
  model: 'qwen3-embedding:0.6b',
  dimensions: 1024
},
```

Puis réindexer toute la KB :
```bash
npx tsx scripts/reindex-kb-full.ts --force --provider=ollama
```

---

## 🛡️ Prévention Régressions Futures

### 1. Tests E2E Automatiques

Créer un test qui vérifie la cohérence embeddings query ↔ KB :

```typescript
// tests/rag/embeddings-consistency.test.ts
import { generateEmbedding } from '@/lib/ai/embeddings-service'
import { searchKnowledgeBaseHybrid } from '@/lib/ai/knowledge-base-service'

describe('RAG Embeddings Consistency', () => {
  it('should use same embedding dimension for query and KB search', async () => {
    const query = "الدفاع الشرعي"

    // Générer embedding query (comme assistant-ia)
    const queryEmbedding = await generateEmbedding(query, {
      operationName: 'assistant-ia'
    })

    // Vérifier dimension attendue production
    if (process.env.NODE_ENV === 'production') {
      expect(queryEmbedding.embedding.length).toBe(1536) // OpenAI
      expect(queryEmbedding.provider).toBe('openai')
    }

    // Vérifier que la recherche retourne des résultats
    const results = await searchKnowledgeBaseHybrid(query, {
      limit: 5,
      threshold: 0.30,
      operationName: 'assistant-ia'
    })

    expect(results.length).toBeGreaterThan(0) // Au moins 1 résultat
  })

  it('should match KB chunks embedding provider in production', async () => {
    // Vérifier que la majorité des chunks utilisent OpenAI en production
    const { rows } = await db.query(`
      SELECT
        COUNT(*) FILTER (WHERE embedding_openai IS NOT NULL) as openai_count,
        COUNT(*) FILTER (WHERE embedding IS NOT NULL) as ollama_count
      FROM knowledge_base_chunks kbc
      JOIN knowledge_base kb ON kbc.knowledge_base_id = kb.id
      WHERE kb.is_active = true
    `)

    if (process.env.NODE_ENV === 'production') {
      expect(rows[0].openai_count).toBeGreaterThan(rows[0].ollama_count * 10) // 90%+ OpenAI
    }
  })
})
```

Ajouter au CI/CD :
```yaml
# .github/workflows/test-rag.yml
name: Test RAG Consistency

on:
  push:
    branches: [main]
    paths:
      - 'lib/ai/**'
      - 'lib/categories/**'

jobs:
  test-rag:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Run RAG consistency tests
        run: npm run test:rag:consistency
```

### 2. Health Check Enrichi

Ajouter vérification dimension embeddings dans `/api/health` :

```typescript
// app/api/health/route.ts
export async function GET() {
  const { rows } = await db.query(`
    SELECT
      COUNT(*) FILTER (WHERE embedding_openai IS NOT NULL) as openai_chunks,
      COUNT(*) FILTER (WHERE embedding IS NOT NULL) as ollama_chunks,
      COUNT(*) as total_chunks
    FROM knowledge_base_chunks kbc
    JOIN knowledge_base kb ON kbc.knowledge_base_id = kb.id
    WHERE kb.is_active = true
  `)

  const embeddingConfig = {
    production: {
      expectedProvider: 'openai',
      expectedDimension: 1536,
      currentProvider: rows[0].openai_chunks > rows[0].ollama_chunks ? 'openai' : 'ollama',
      coverage: {
        openai: rows[0].openai_chunks,
        ollama: rows[0].ollama_chunks,
        total: rows[0].total_chunks
      }
    }
  }

  // Alerter si mismatch
  const isConsistent = process.env.NODE_ENV === 'production'
    ? rows[0].openai_chunks > rows[0].ollama_chunks * 0.9 // 90%+ OpenAI requis
    : true

  return NextResponse.json({
    ...healthData,
    rag: {
      ...ragStatus,
      embeddingsConsistency: isConsistent ? 'ok' : 'misconfigured',
      embeddingConfig,
      warning: !isConsistent ? 'KB chunks primarily use Ollama but production should use OpenAI' : undefined
    }
  })
}
```

### 3. Alertes Email Automatiques

Ajouter vérification dans le cron quotidien :

```bash
# scripts/cron-check-rag-embeddings.sh
#!/bin/bash
set -euo pipefail

echo "[$(date)] Vérification cohérence embeddings RAG..."

# Check embedding provider coverage
EMBEDDING_STATS=$(docker exec -i qadhya-postgres psql -U moncabinet -d qadhya -t -A -c "
  SELECT
    COUNT(*) FILTER (WHERE embedding_openai IS NOT NULL) as openai,
    COUNT(*) FILTER (WHERE embedding IS NOT NULL) as ollama
  FROM knowledge_base_chunks kbc
  JOIN knowledge_base kb ON kbc.knowledge_base_id = kb.id
  WHERE kb.is_active = true;
")

OPENAI_COUNT=$(echo $EMBEDDING_STATS | cut -d'|' -f1)
OLLAMA_COUNT=$(echo $EMBEDDING_STATS | cut -d'|' -f2)

# Alert si OpenAI < 90% en production
if [ "$OPENAI_COUNT" -lt $(($OLLAMA_COUNT * 9)) ]; then
  echo "⚠️  ALERTE: KB utilise principalement Ollama ($OLLAMA_COUNT) au lieu d'OpenAI ($OPENAI_COUNT)"
  # Envoyer email via /api/admin/alerts/send
  curl -X POST http://localhost:7002/api/admin/alerts/send \
    -H "X-Cron-Secret: $CRON_SECRET" \
    -H "Content-Type: application/json" \
    -d "{
      \"subject\": \"⚠️ RAG Embeddings Mismatch Détecté\",
      \"message\": \"KB utilise principalement Ollama ($OLLAMA_COUNT chunks) au lieu d'OpenAI ($OPENAI_COUNT chunks) en production. Risque de 0 résultats dans l'Assistant IA.\"
    }"
fi
```

Ajouter au crontab :
```cron
0 8 * * * /opt/qadhya/scripts/cron-check-rag-embeddings.sh >> /var/log/qadhya/rag-embeddings-check.log 2>&1
```

### 4. Documentation & Guidelines

Créer un guide pour l'équipe :

```markdown
# 📚 Guide RAG Embeddings - Règles Critiques

## ⚠️ RÈGLE #1 : JAMAIS changer le provider embeddings sans migration

Si vous modifiez `operations-config.ts` pour changer le provider embeddings :
1. ❌ **NE PAS** déployer directement
2. ✅ Créer un script de migration qui réindexe toute la KB
3. ✅ Tester sur un petit sous-ensemble (100 docs) avant migration complète
4. ✅ Vérifier avec `npm run test:rag:consistency`

## ⚠️ RÈGLE #2 : Production = OpenAI embeddings UNIQUEMENT

- Assistant IA en production DOIT utiliser OpenAI (1536-dim)
- Ollama réservé au dev local uniquement
- Coût acceptable : ~$2-5/mois

## ⚠️ RÈGLE #3 : Toujours valider après changement config

Après TOUT changement dans `operations-config.ts` ou `embeddings-service.ts` :
```bash
# 1. Tester cohérence embeddings
npm run test:rag:consistency

# 2. Vérifier health check
curl https://qadhya.tn/api/health | jq '.rag.embeddingsConsistency'
# Attendu: "ok"

# 3. Tester recherche réelle
curl -X POST https://qadhya.tn/api/chat \
  -H "Content-Type: application/json" \
  -d '{"question": "الدفاع الشرعي"}' \
  | jq '.sources | length'
# Attendu: > 0
```

## 🔄 Checklist Avant Déploiement

- [ ] Tests E2E RAG passent
- [ ] Health check `embeddingsConsistency: "ok"`
- [ ] Recherche test retourne résultats
- [ ] Aucune modification provider embeddings sans migration
- [ ] Documentation mise à jour si changement architecture
```

---

## 📊 Métriques de Suivi

Ajouter au dashboard monitoring (`/super-admin/monitoring?tab=rag-health`) :

- **Embedding Provider Coverage** : Graphique camembert OpenAI vs Ollama
- **Dimension Consistency** : % chunks alignés avec config production
- **Query Success Rate** : % queries retournant ≥1 résultat
- **Average Results per Query** : Nombre moyen de sources retournées

---

## 🚀 Plan d'Action Immédiat

### Phase 1 : Fix Production (Priorité 1 - Aujourd'hui)
1. ✅ Valider que OpenAI key fonctionne
2. ✅ Purger cache Redis embeddings
3. ✅ Tester query légitime défense → doit retourner résultats
4. ⏳ Surveiller logs 24h pour confirmer fix

### Phase 2 : Tests & Prévention (Priorité 2 - Cette semaine)
1. ⏳ Créer tests E2E embeddings consistency
2. ⏳ Enrichir health check avec dimension validation
3. ⏳ Ajouter cron alerte embeddings mismatch
4. ⏳ Documenter guidelines équipe

### Phase 3 : Monitoring (Priorité 3 - Semaine prochaine)
1. ⏳ Ajouter métriques dashboard RAG health
2. ⏳ Intégrer tests dans CI/CD
3. ⏳ Créer runbook intervention

---

## 🎯 Résultats Attendus

**Avant Fix** :
- Query "الدفاع الشرعي" → 0 sources (لم أجد وثائق)
- Logs : "KB Hybrid Search Provider: ollama" (mismatch)

**Après Fix** :
- Query "الدفاع الشرعي" → 5-10 sources pertinentes
- Logs : "KB Hybrid Search Provider: openai" (cohérent avec KB)
- Health check : `embeddingsConsistency: "ok"`
- Tests E2E : ✅ PASS

---

**Auteur** : Système RAG Qadhya
**Review** : À valider par équipe technique
**Deadline** : Phase 1 aujourd'hui, Phase 2-3 sous 2 semaines
