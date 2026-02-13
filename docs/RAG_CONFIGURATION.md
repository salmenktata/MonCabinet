# Configuration RAG - Qadhya

Guide complet pour configurer et activer le système RAG (Retrieval-Augmented Generation) de l'assistant juridique Qadhya.

---

## ⚙️ Variables d'Environnement Principales

### RAG_ENABLED vs OLLAMA_ENABLED

**Distinction critique** :

| Variable | Rôle | Impact |
|----------|------|--------|
| `RAG_ENABLED` | **Feature flag RAG** | Active/désactive les features RAG avancées (chunking, metadata, classification) |
| `OLLAMA_ENABLED` | **Moteur de recherche** | Active/désactive la recherche sémantique (embeddings + vectoriel) |

### Configuration Recommandée

#### Production (Qualité Maximale)
```bash
RAG_ENABLED=true          # ✅ Toutes les features RAG activées
OLLAMA_ENABLED=true       # ✅ Recherche sémantique activée
OPENAI_API_KEY=sk-...     # ✅ Embeddings OpenAI (1536-dim, qualité optimale)
```

**Résultat** : RAG complet avec embeddings OpenAI (scores 75-85%).

---

#### Développement Local (Économique)
```bash
RAG_ENABLED=true          # ✅ Features RAG activées
OLLAMA_ENABLED=true       # ✅ Ollama local (0€)
# OPENAI_API_KEY non défini → fallback Ollama embeddings (1024-dim)
```

**Résultat** : RAG complet avec Ollama (scores 65-70%, 0€).

---

#### Mode Dégradé (Sans Recherche Sémantique)
```bash
RAG_ENABLED=false         # ❌ Features RAG désactivées
OLLAMA_ENABLED=false      # ❌ Recherche sémantique désactivée
```

**Résultat** : Pas de RAG, assistant IA sans contexte documentaire (hallucinations possibles).

---

## 📊 Matrice de Comportement

| `RAG_ENABLED` | `OLLAMA_ENABLED` | `OPENAI_API_KEY` | Comportement |
|---------------|------------------|------------------|--------------|
| ✅ `true` | ✅ `true` | ✅ Défini | **OPTIMAL** : RAG complet + OpenAI embeddings (75-85% scores) |
| ✅ `true` | ✅ `true` | ❌ Non défini | **BON** : RAG complet + Ollama embeddings (65-70% scores, 0€) |
| ❌ `false` | ✅ `true` | ✅ Défini | **SIMPLE** : Recherche sémantique basique sans features avancées |
| ❌ `false` | ❌ `false` | N/A | **DÉSACTIVÉ** : Pas de RAG, assistant sans contexte |

---

## 🔧 Variables de Configuration RAG

### Chunking (Découpage Documents)

```bash
RAG_CHUNK_SIZE=1024       # Taille chunks (caractères)
RAG_CHUNK_OVERLAP=100     # Chevauchement entre chunks
```

**Recommendations** :
- **Jurisprudence** : 1800 chars (décisions longues)
- **Codes** : 600 chars (articles courts)
- **Doctrine** : 1500 chars (analyses moyennes)

### Recherche Sémantique

```bash
RAG_MAX_RESULTS=15                # Nombre max résultats retournés (5 → 15 Sprint 1)
RAG_SIMILARITY_THRESHOLD=0.7      # Seuil similarité global
RAG_THRESHOLD_KB=0.50             # Seuil KB spécifique (0.65 → 0.50 Sprint 1)
RAG_MAX_CONTEXT_TOKENS=6000       # Tokens max contexte (2000 → 6000 Sprint 1)
```

**Seuils adaptatifs par type** :
- `RAG_THRESHOLD_DOCUMENTS=0.7`
- `RAG_THRESHOLD_JURISPRUDENCE=0.6`
- `RAG_THRESHOLD_KB=0.50`

### Diversité Sources

```bash
RAG_MAX_CHUNKS_PER_SOURCE=2  # Max chunks par document source
RAG_MIN_SOURCES=2            # Minimum sources différentes requises
```

Évite concentration sur un seul document.

---

## 🚀 Activation Étape par Étape

### 1. Activer Features RAG

```bash
# .env.local ou .env.production.local
RAG_ENABLED=true
```

**Active** :
- Chunking documents intelligent
- Classification juridique automatique
- Extraction métadonnées enrichies
- Analyse qualité documents

### 2. Activer Recherche Sémantique

#### Option A : Ollama (Local, Gratuit)

```bash
OLLAMA_ENABLED=true
OLLAMA_BASE_URL=http://localhost:11434

# Modèles requis (à télécharger) :
# ollama pull qwen3-embedding:0.6b  # Embeddings (1024-dim)
# ollama pull qwen2.5:3b            # Chat (optionnel)
```

**Commandes Docker** :
```bash
docker-compose up -d ollama
docker exec qadhya-ollama ollama pull qwen3-embedding:0.6b
```

#### Option B : OpenAI (Cloud, ~$2-5/mois)

```bash
OLLAMA_ENABLED=true  # ⚠️ Requis même avec OpenAI
OPENAI_API_KEY=sk-...

# Embeddings automatiques : text-embedding-3-small (1536-dim)
```

**Avantages OpenAI** :
- Scores +10-15% (65-70% → 75-85%)
- Embeddings 1536-dim (vs 1024-dim Ollama)
- Pas de dépendance infrastructure locale

### 3. Vérifier Activation

```bash
# Vérifier variables
env | grep -E "(RAG|OLLAMA|OPENAI)"

# Tester recherche sémantique
curl http://localhost:7002/api/test/kb-debug
```

**Réponse attendue** :
```json
{
  "RAG_ENABLED": "true",
  "OLLAMA_ENABLED": "true",
  "semanticSearchActive": true,
  "embeddingProvider": "openai" | "ollama"
}
```

---

## 🔍 Debugging Configuration

### Symptôme : "Recherche sémantique désactivée"

**Causes possibles** :

1. `OLLAMA_ENABLED=false` ou non défini
   ```bash
   # Fix :
   OLLAMA_ENABLED=true
   ```

2. Ollama non démarré (si mode local)
   ```bash
   # Vérifier :
   curl http://localhost:11434/api/tags

   # Fix :
   docker-compose up -d ollama
   ```

3. Modèle embeddings manquant
   ```bash
   # Vérifier :
   ollama list | grep embedding

   # Fix :
   ollama pull qwen3-embedding:0.6b
   ```

### Symptôme : "Pas de résultats KB trouvés"

**Causes possibles** :

1. KB non indexée
   ```bash
   # Vérifier :
   curl http://localhost:7002/api/admin/monitoring/metrics | jq '.kbStats'

   # Fix : Déclencher indexation
   curl -X POST http://localhost:7002/api/admin/index-kb
   ```

2. Seuil trop élevé
   ```bash
   # Temporairement baisser :
   RAG_THRESHOLD_KB=0.40  # 0.50 → 0.40
   ```

3. Embeddings incompatibles (mixing Ollama + OpenAI)
   ```bash
   # Réindexer avec provider uniforme :
   npx tsx scripts/reindex-all-kb-openai.ts
   ```

---

## 📈 Optimisation Performance

### Latence

```bash
# Timeout recherche bilingue
BILINGUAL_SEARCH_TIMEOUT_MS=60000  # 90s → 60s (parallélisation Sprint 2)

# Cache Redis
SEARCH_CACHE_THRESHOLD=0.75        # Hit si similarité ≥ 75%
```

### Qualité

```bash
# Sprint 1 : OpenAI embeddings
OPENAI_API_KEY=sk-...

# Sprint 2 : Query expansion
ENABLE_QUERY_EXPANSION=true

# Sprint 3 : Hybrid search
# (Auto-activé si PostgreSQL 12+ avec pg_trgm)
```

---

## 🎯 Cas d'Usage

### Assistant IA Conversationnel

```bash
RAG_ENABLED=true
OLLAMA_ENABLED=true
RAG_MAX_RESULTS=10
RAG_THRESHOLD_KB=0.50
```

### Consultation Juridique Formelle

```bash
RAG_ENABLED=true
OLLAMA_ENABLED=true
OPENAI_API_KEY=sk-...       # Précision maximale
RAG_MAX_RESULTS=15
RAG_THRESHOLD_KB=0.60       # Seuil plus strict
RAG_MAX_CONTEXT_TOKENS=8000  # Contexte enrichi
```

### Indexation Batch (Économique)

```bash
RAG_ENABLED=true
OLLAMA_ENABLED=true
# OPENAI_API_KEY non défini → Ollama 0€

# Batch progressif
KB_BATCH_SIZE=5
```

---

## 📚 Ressources

- **Audit RAG** : `docs/RAG_DEPLOYMENT_FINAL_REPORT.md`
- **Optimisations** : `docs/RAG_QUALITY_IMPROVEMENTS.md`
- **Monitoring** : Dashboard `/super-admin/monitoring?tab=kb-quality`
- **Tests** : `npx tsx scripts/test-rag-complete-e2e.ts`

---

## ⚠️ Points de Vigilance

1. **JAMAIS** sync KB locale → prod (KB prod = crawl uniquement)
2. **TOUJOURS** vérifier `OLLAMA_ENABLED=true` après déploiement
3. **Préférer** OpenAI embeddings en production (qualité +10-15%)
4. **Surveiller** budget OpenAI (seuil alerte $5 restant)
5. **Réindexer** avec même provider (pas de mixing Ollama/OpenAI)

---

**Dernière mise à jour** : 13 février 2026
**Version** : Phase 1 Plan Optimisation RAG
