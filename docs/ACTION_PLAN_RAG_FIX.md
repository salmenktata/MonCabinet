# Plan d'Action RAG - Résolution "لم أجد وثائق ذات صلة"

**Date** : 16 février 2026
**Priorité** : 🔴 CRITIQUE
**Status** : En cours

---

## 🎯 Problème

L'Assistant IA répond systématiquement "لم أجد وثائق ذات صلة" (pas de documents) pour des questions juridiques complexes en arabe, malgré :
- ✅ 25,110 chunks indexés avec embeddings OpenAI (99.8%)
- ✅ 165 chunks contenant les mots-clés pertinents (BM25)
- ✅ Configuration production correcte (NODE_ENV, OPENAI_API_KEY)

---

## 🔍 Diagnostic (Hypothèses Testées)

### ❌ Hypothèse 1 : Mismatch dimensions embeddings
**INFIRMÉE** : KB a 99.8% embeddings OpenAI (1536-dim), configuration correcte

### ⏳ Hypothèse 2 : Seuil similarité trop élevé
**À TESTER** : Seuils actuels :
- `RAG_THRESHOLD_KB=0.65` (par défaut)
- Code adapte à 0.30 pour l'arabe (ligne 704 `rag-chat-service.ts`)
- **Mais** requête complexe 600+ chars → condensation → perte sémantique ?

### ⏳ Hypothèse 3 : Classification query incorrecte
**À TESTER** : Query classifier pourrait :
- Retourner catégories incorrectes (ex: "autre" au lieu de "codes")
- Filtrer par catégorie vide → 0 résultats
- Fallback recherche globale ne déclenche pas si `isConfident=true`

### ⏳ Hypothèse 4 : Query condensation dégrade qualité
**À TESTER** : Requête utilisateur = 600+ caractères
- `condenseQuery()` extrait concepts clés (ligne 479 `rag-chat-service.ts`)
- Risque : perd contexte "دفاع شرعي" → embedding générique → faible similarité

---

## ✅ Actions Immédiates (Aujourd'hui)

### 1. Activer Logs Détaillés RAG (15 min)

**Objectif** : Capturer les vraies métriques de recherche pour identifier le blocage

**Commandes** :
```bash
# Sur le serveur, augmenter verbosité logs temporairement
ssh root@84.247.165.187
docker logs -f qadhya-nextjs 2>&1 | grep -E "(RAG|KB Hybrid|Search|similarity|threshold)"

# En parallèle, tester manuellement depuis l'interface web
# https://qadhya.tn/assistant-ia
# Question: الدفاع الشرعي (simple)
# Question: <requête longue 600 chars> (complexe)
```

**Logs à vérifier** :
- `[KB Hybrid Search] Provider: openai` ✅ ou `ollama` ❌
- `[RAG Search] Query condensée: ...` (si query longue)
- `[RAG Search] Filtrage KB par catégories: ...` (catégories détectées)
- `[RAG Search] 0 résultats filtrés → fallback` (si classification échoue)
- `[RAG Diagnostic] 🔍 Aucune source trouvée` (si 0 résultats finaux)

### 2. Test Requête Simple vs Complexe (10 min)

**Objectif** : Isoler si le problème vient de la condensation query

**Test A - Query simple** :
```
الدفاع الشرعي
```
**Attendu** : ≥5 sources retournées (165 chunks BM25 matchent)

**Test B - Query complexe (celle de l'utilisateur)** :
```
وقع شجار ليلي أمام نادٍ، انتهى بإصابة خطيرة ثم وفاة لاحقًا...
(600+ caractères)
```
**Attendu** : Si 0 sources → **problème confirmé = condensation query**

### 3. Vérifier Classification Query (10 min)

**Script SQL direct** :
```sql
-- Vérifier répartition catégories KB
SELECT category, COUNT(*) as chunks
FROM knowledge_base kb
JOIN knowledge_base_chunks kbc ON kb.id = kbc.knowledge_base_id
WHERE kb.is_active = true
  AND kbc.content_tsvector @@ plainto_tsquery('simple', 'الدفاع الشرعي')
GROUP BY category
ORDER BY chunks DESC;
```

**Attendu** :
- Si tout dans "autre" → catégorie "autre" non filtrée par classifier
- Si dans "codes" → vérifier que classifier détecte bien "codes"

---

## 🔧 Fixes Selon Diagnostic

### Fix A : Seuil Trop Élevé

**Si** requête simple retourne 0 sources **ET** logs montrent scores <0.30

**Solution** :
```typescript
// lib/ai/config.ts
export const RAG_THRESHOLDS = {
  ...
  knowledgeBase: parseFloat(process.env.RAG_THRESHOLD_KB || '0.50'), // 0.65 → 0.50
}
```

**Ou** variables env (sans rebuild) :
```bash
# /opt/qadhya/.env.production.local
RAG_THRESHOLD_KB=0.50
```

Restart container : `docker compose restart nextjs`

### Fix B : Classification Query Incorrecte

**Si** logs montrent catégories incorrectes (ex: "autre" détecté pour question pénal)

**Solution** :
```typescript
// lib/ai/rag-chat-service.ts - ligne 688
if (isClassificationConfident(classification) && classification.categories.length > 0) {
  // DÉSACTIVER TEMPORAIREMENT le filtrage par catégorie
  console.log(`[RAG Search] ⚠️  Classification disabled temporarily`)
  // ... passer directement à recherche globale (ligne 734)
}
```

**Alternative** : Améliorer DOMAIN_CATEGORY_BOOST (ligne 664) :
```typescript
const DOMAIN_CATEGORY_BOOST: Record<string, string[]> = {
  penal: ['codes', 'legislation', 'jurisprudence', 'procedures', 'doctrine'], // Ajouter 'doctrine'
  ...
}
```

### Fix C : Condensation Query Dégrade Qualité

**Si** requête complexe retourne 0 sources **ET** logs montrent condensation agressive

**Solution** :
```typescript
// lib/ai/rag-chat-service.ts - ligne 475
} else if (question.length > 200) {
  // AUGMENTER LE SEUIL : 200 → 800 (permettre queries plus longues sans condensation)
} else if (question.length > 800) {
  ...
}
```

**Ou** désactiver condensation temporairement :
```typescript
// Ligne 475-487 : Commenter tout le bloc condensation
// embeddingQuestion = await condenseQuery(question)
```

### Fix D : Fallback Recherche Globale Ne Déclenche Pas

**Si** logs montrent "0 résultats filtrés" MAIS pas de fallback

**Solution** :
```typescript
// lib/ai/rag-chat-service.ts - ligne 719
// Fallback: recherche globale HYBRIDE si la recherche filtrée retourne 0 résultats
if (kbResults.length === 0) {
  console.log(`[RAG Search] ⚠️  0 résultats filtrés → fallback recherche globale hybride (seuil abaissé)`)
  const fallbackThreshold = queryLangForSearch === 'ar'
    ? 0.20 // 0.25 → 0.20 (encore plus permissif)
    : Math.max(RAG_THRESHOLDS.knowledgeBase - 0.15, 0.20)
  ...
}
```

---

## 🛡️ Prévention Régressions (Cette Semaine)

### 1. Tests E2E Automatiques ✅ CRÉÉ

**Fichier** : `tests/rag/embeddings-consistency.test.ts`

**Exécution** :
```bash
npm install --save-dev @jest/globals
npm run test:rag:consistency
```

**CI/CD** : Intégrer dans `.github/workflows/test-rag.yml`

### 2. Health Check Enrichi

**Ajouter dans `/api/health`** :
```typescript
const { rows } = await db.query(`
  SELECT
    COUNT(*) FILTER (WHERE kbc.embedding_openai IS NOT NULL) as openai_chunks,
    COUNT(*) FILTER (WHERE kbc.embedding IS NOT NULL) as ollama_chunks,
    AVG((
      SELECT (1 - (embedding_openai <=> $1::vector))
      FROM knowledge_base_chunks
      WHERE embedding_openai IS NOT NULL
      LIMIT 1
    )) as avg_test_similarity
  FROM knowledge_base_chunks kbc
  JOIN knowledge_base kb ON kbc.knowledge_base_id = kb.id
  WHERE kb.is_active = true
`, [testEmbedding]) // embedding test pour "الدفاع الشرعي"

return {
  ...healthData,
  rag: {
    embeddingsConsistency: rows[0].openai_chunks > rows[0].ollama_chunks * 0.9 ? 'ok' : 'degraded',
    coverage: {
      openai: rows[0].openai_chunks,
      ollama: rows[0].ollama_chunks
    },
    testSimilarity: rows[0].avg_test_similarity // NOUVEAU : score test constant
  }
}
```

### 3. Alertes Email Automatiques

**Cron quotidien** : `scripts/cron-check-rag-embeddings.sh` (déjà créé)

**Installation** :
```bash
scp scripts/cron-check-rag-embeddings.sh root@84.247.165.187:/opt/qadhya/scripts/
ssh root@84.247.165.187 "chmod +x /opt/qadhya/scripts/cron-check-rag-embeddings.sh"
ssh root@84.247.165.187 'echo "0 8 * * * /opt/qadhya/scripts/cron-check-rag-embeddings.sh" | crontab -'
```

### 4. Dashboard Monitoring RAG

**Ajouter onglet** : `/super-admin/monitoring?tab=rag-health`

**Métriques à afficher** :
- Query Success Rate (% queries avec ≥1 source)
- Average Sources per Query (médiane)
- Embedding Provider Coverage (camembert OpenAI vs Ollama)
- Query Classification Accuracy (% correct)
- Threshold Violations (% queries bloquées par seuil)

---

## 📊 Checklist Validation

Avant de clore ce ticket, valider :

- [ ] **Test A (query simple)** : "الدفاع الشرعي" retourne ≥5 sources
- [ ] **Test B (query complexe)** : Requête 600 chars retourne ≥3 sources
- [ ] **Logs détaillés** : Provider=openai, catégories correctes, pas de condensation agressive
- [ ] **Health check** : `embeddingsConsistency: "ok"`, `testSimilarity > 0.50`
- [ ] **Tests E2E** : `npm run test:rag:consistency` passe
- [ ] **Alertes email** : Cron configuré et testé (envoi email test)
- [ ] **Dashboard** : Onglet RAG Health accessible et peuplé
- [ ] **Documentation** : Guide équipe créé (`FIX_RAG_EMBEDDINGS_MISMATCH.md`)

---

## 🚀 Timeline

| Phase | Tâches | Durée | Deadline |
|-------|--------|-------|----------|
| **Phase 1 : Diagnostic** | Activer logs, tester queries, identifier root cause | 1h | Aujourd'hui 20h |
| **Phase 2 : Fix Immédiat** | Appliquer fix selon diagnostic | 30min | Aujourd'hui 21h |
| **Phase 3 : Validation** | Tests E2E, vérifier production | 30min | Aujourd'hui 22h |
| **Phase 4 : Prévention** | Intégrer tests CI/CD, alertes, dashboard | 4h | Demain 18h |
| **Phase 5 : Documentation** | Runbook, guidelines équipe | 2h | Après-demain |

---

## 📝 Notes

- **Priorité absolue** : Phase 1-2 aujourd'hui (fix production)
- **Ne pas** modifier `operations-config.ts` sans migration complète KB
- **Ne pas** désactiver `ENABLE_QUERY_EXPANSION` (améliore scores +15%)
- **Toujours** tester sur query simple ET complexe après tout changement

---

**Auteur** : Claude Sonnet 4.5
**Review** : À valider par équipe dev
**Suivi** : Updates dans ce doc au fur et à mesure
