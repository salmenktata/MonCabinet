# 📊 Analyse Utilisation Index DB - Production

**Date** : 9 février 2026
**Base de données** : moncabinet (PostgreSQL)
**Total index** : 209 index
**Index jamais utilisés** : 141 index (67%)

---

## 🎯 Résumé Exécutif

Sur 209 index en production, **141 index (67%) n'ont jamais été utilisés** (scans = 0).

**Recommandation** : ⚠️ **NE PAS supprimer immédiatement**

La majorité de ces index sont :
1. **Critiques mais non activés** (RAG, recherche full-text)
2. **Conditionnels** (WHERE clauses pour cas spécifiques)
3. **Nouveaux** (créés aujourd'hui, pas encore sollicités)

**Action** : Surveiller pendant **1 mois** puis réévaluer.

---

## 📈 Index Fortement Utilisés (Top 10)

| Table | Index | Scans | Usage |
|-------|-------|-------|-------|
| `web_pages` | `web_pages_pkey` | 6,128 | Lookups par ID |
| `knowledge_base` | `knowledge_base_pkey` | 3,861 | Lookups par ID |
| `web_pages` | `unique_source_url` | 3,174 | Détection doublons |
| `web_pages` | `idx_web_pages_source` | 1,208 | Filtrage par source |
| `legal_classifications` | `unique_legal_classification` | 872 | Contrainte unicité |
| `knowledge_base_chunks` | `idx_knowledge_base_chunks_kb_id` | 641 | Relation chunks → KB |
| `crawler_health_metrics` | `unique_metrics_period` | 575 | Monitoring crawler |
| `knowledge_base_chunks` | `knowledge_base_chunks_pkey` | 463 | Lookups chunks |
| `web_sources` | `web_sources_pkey` | 426 | Lookups sources |
| `web_pages` | `idx_web_pages_freshness` | 392 | Tri par fraîcheur |

**Conclusion** : Les index critiques pour le web scraping et la KB sont **très utilisés** ✅

---

## 🔍 Index Non Utilisés - Analyse Détaillée

### Catégorie 1 : Index Critiques RAG (À CONSERVER)

**Taille totale** : 6.2 MB

| Table | Index | Taille | Raison |
|-------|-------|--------|--------|
| `knowledge_base_chunks` | `idx_knowledge_base_chunks_vector` | 4.4 MB | ✅ RAG chunks (HNSW) |
| `knowledge_base` | `idx_knowledge_base_vector` | 1.7 MB | ✅ RAG documents (HNSW) |
| `document_embeddings` | `idx_document_embeddings_vector` | 16 KB | ✅ Embeddings utilisateur (HNSW) |

**Statut** : 🔒 **CONSERVER ABSOLUMENT**

**Explication** :
- Index HNSW pour recherche vectorielle (RAG, similarité sémantique)
- Non utilisés car système RAG pas encore sollicité en production
- **Critiques** pour performance recherche (10x plus rapide avec index)
- Utilisés par : `searchRAG()`, `findSimilarDocuments()`, `semanticSearch()`

**Action** : ✅ Aucune - Index critiques

---

### Catégorie 2 : Index Full-Text (À CONSERVER)

**Taille totale** : 3.8 MB

| Table | Index | Taille | Usage Prévu |
|-------|-------|--------|-------------|
| `web_pages` | `idx_web_pages_fts` | 3.5 MB | Recherche pages web |
| `knowledge_base` | `idx_knowledge_base_fulltext` | 200 KB | Recherche KB |
| `clients` | `idx_clients_fulltext` | 16 KB | Recherche clients |
| `dossiers` | `idx_dossiers_fulltext` | 16 KB | Recherche dossiers |
| `factures` | `idx_factures_fulltext` | 16 KB | Recherche factures |
| `jurisprudence` | `idx_jurisprudence_fulltext` | 16 KB | Recherche jurisprudence |

**Statut** : 🔒 **CONSERVER**

**Explication** :
- Index GIN pour recherche full-text PostgreSQL (tsvector)
- Utilisés quand fonctionnalités de recherche activées
- Performance critique : 6x à 10x plus rapide avec index
- Alternative sans index : LIKE '%...%' (lent, sequential scan)

**Action** : ✅ Activer fonctionnalités de recherche pour tester

---

### Catégorie 3 : Index Conditionnels (WHERE clauses)

**Taille totale** : ~300 KB (nombreux index 8KB)

Exemples :
```sql
-- Index utilisés seulement si condition vraie
idx_dossiers_date_mariage WHERE date_mariage IS NOT NULL
idx_dossiers_google_drive_folder_id WHERE google_drive_folder_id IS NOT NULL
idx_web_pages_is_indexed WHERE is_indexed = false
idx_kb_quality_requires_review WHERE quality_requires_review = true
```

**Statut** : ⏳ **SURVEILLER 1 MOIS**

**Explication** :
- Index partiels pour cas spécifiques
- Activés seulement quand condition WHERE est vraie
- Taille faible (8 KB chacun), coût maintenance minimal

**Action** :
- ✅ Conserver 1 mois
- ❌ Supprimer si scans = 0 après 1 mois

---

### Catégorie 4 : Index Nouveaux Métiers (Pas Encore Utilisés)

Tables métier avec 0 scans :

**Chat & Feedback** :
- `chat_conversations` (4 index, 64 KB total)
- `chat_messages` (2 index, 32 KB)
- `chat_message_feedback` (2 index, 16 KB)

**Utilisateurs & Auth** :
- `users` (6 index, 96 KB)
- `password_reset_tokens` (3 index, 48 KB)

**Notifications & Audit** :
- `admin_notifications` (7 index, 112 KB)
- `admin_audit_logs` (3 index, 48 KB)
- `user_activity_logs` (9 index, 144 KB)

**Jurisprudence** :
- `jurisprudence` (7 index, 112 KB)

**Statut** : ⏳ **SURVEILLER 1 MOIS**

**Explication** :
- Fonctionnalités métier pas encore activées en production
- Index corrects pour usage futur
- Taille totale faible : ~600 KB

**Action** :
- ✅ Conserver pendant déploiement progressif
- ❌ Supprimer si feature désactivée définitivement

---

### Catégorie 5 : Index Potentiellement Inutiles (Candidats Suppression)

**Après 1 mois**, si toujours 0 scans :

| Table | Index | Taille | Raison Potentielle |
|-------|-------|--------|-------------------|
| `web_pages` | `idx_web_pages_site_structure` | 1.9 MB | Feature désactivée ? |
| `web_pages` | `idx_web_pages_content_hash` | 144 KB | Doublonné par autre index ? |
| `templates` | `idx_templates_*` (4 index) | 64 KB | Feature non utilisée ? |

**Action** :
1. ✅ Vérifier après 1 mois
2. ✅ Analyser code : index utilisé dans requêtes ?
3. ❌ Supprimer si confirmé inutile

---

## 📊 Statistiques Globales

```sql
-- Total index
SELECT count(*) FROM pg_indexes WHERE schemaname = 'public';
-- Résultat : 209 index

-- Index jamais utilisés
SELECT count(*) FROM pg_stat_user_indexes
WHERE schemaname = 'public' AND idx_scan = 0;
-- Résultat : 141 index (67%)

-- Taille totale index
SELECT pg_size_pretty(sum(pg_relation_size(indexrelid)))
FROM pg_stat_user_indexes WHERE schemaname = 'public';
-- Résultat : ~50 MB

-- Taille index non utilisés
SELECT pg_size_pretty(sum(pg_relation_size(indexrelid)))
FROM pg_stat_user_indexes
WHERE schemaname = 'public' AND idx_scan = 0;
-- Résultat : ~15 MB (30% total)
```

---

## 🚀 Plan d'Action Recommandé

### Jour 1 (Aujourd'hui) ✅
1. ✅ Analyse initiale effectuée
2. ✅ Documentation créée
3. ✅ Aucune suppression (trop tôt)

### Semaine 1-4 (Monitoring)
1. ✅ Activer fonctionnalités de recherche (full-text)
2. ✅ Activer système RAG en production
3. ✅ Surveiller utilisation index HNSW + GIN
4. ✅ Noter évolution scans dans tableau de bord

### Mois 1 (Réévaluation)
```bash
# Réévaluer index non utilisés après 1 mois
ssh root@84.247.165.187 "docker exec -i moncabinet-postgres psql -U moncabinet -d moncabinet -c \"
SELECT
  relname,
  indexrelname,
  idx_scan,
  pg_size_pretty(pg_relation_size(indexrelid)) as size
FROM pg_stat_user_indexes
WHERE schemaname = 'public' AND idx_scan = 0
ORDER BY pg_relation_size(indexrelid) DESC;
\""
```

**Critères suppression** :
- ✅ scans = 0 après 1 mois
- ✅ Feature confirmée désactivée
- ✅ Index NON critique (pas RAG, pas full-text)
- ✅ Doublonné par autre index

### Suppression Prudente

```sql
-- Template suppression index
BEGIN;
DROP INDEX CONCURRENTLY idx_name; -- CONCURRENTLY évite lock table
COMMIT;

-- Vérifier impact
EXPLAIN ANALYZE SELECT ... -- Requête censée utiliser l'index
```

**Important** :
- Utiliser `DROP INDEX CONCURRENTLY` (pas de lock)
- Tester requêtes après suppression
- Conserver backup avant suppression massive

---

## 📋 Checklist Maintenance Index

### Mensuel
- [ ] Exécuter `ANALYZE;` pour statistiques à jour
- [ ] Vérifier scans des index créés il y a 1 mois
- [ ] Identifier index candidats suppression (scans = 0)

### Trimestriel
- [ ] Analyser fragmentation index (rare avec PostgreSQL 15+)
- [ ] Vérifier taille index vs taille table
- [ ] Optimiser index peu utilisés (scans faibles)

### Annuel
- [ ] Audit complet index (utilisés vs inutilisés)
- [ ] Supprimer index obsolètes confirmés
- [ ] Créer nouveaux index si besoin détecté

---

## 🔧 Commandes Utiles

### Vérifier Utilisation d'un Index Spécifique
```sql
SELECT
  schemaname,
  relname,
  indexrelname,
  idx_scan,
  idx_tup_read,
  idx_tup_fetch
FROM pg_stat_user_indexes
WHERE indexrelname = 'idx_knowledge_base_chunks_vector';
```

### Vérifier Plan d'Exécution (Utilise l'Index ?)
```sql
EXPLAIN ANALYZE
SELECT * FROM knowledge_base_chunks
ORDER BY embedding <=> '[0.1, 0.2, ...]'::vector
LIMIT 10;

-- Chercher "Index Scan using idx_knowledge_base_chunks_vector"
```

### Réinitialiser Statistiques (Pour Test)
```sql
-- Réinitialiser compteurs (PostgreSQL 14+)
SELECT pg_stat_reset_single_table_counters('knowledge_base_chunks'::regclass);
```

### Forcer Utilisation Index (Test)
```sql
SET enable_seqscan = off; -- Forcer index scan
SELECT ...
SET enable_seqscan = on;  -- Remettre par défaut
```

---

## 📊 Dashboard Monitoring (SQL)

```sql
-- Top 20 index les plus utilisés
SELECT
  relname as table_name,
  indexrelname as index_name,
  idx_scan as scans,
  pg_size_pretty(pg_relation_size(indexrelid)) as size
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
ORDER BY idx_scan DESC
LIMIT 20;

-- Index jamais utilisés (taille > 100 KB)
SELECT
  relname,
  indexrelname,
  pg_size_pretty(pg_relation_size(indexrelid)) as size
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
  AND idx_scan = 0
  AND pg_relation_size(indexrelid) > 100 * 1024
ORDER BY pg_relation_size(indexrelid) DESC;

-- Ratio index utilisés vs inutilisés
SELECT
  count(*) FILTER (WHERE idx_scan > 0) as used_indexes,
  count(*) FILTER (WHERE idx_scan = 0) as unused_indexes,
  count(*) as total_indexes,
  round(100.0 * count(*) FILTER (WHERE idx_scan = 0) / count(*), 1) as unused_pct
FROM pg_stat_user_indexes
WHERE schemaname = 'public';
```

---

## ✅ Conclusion

**État actuel** : 141 index non utilisés (67%) — **NORMAL** pour nouvelle base

**Explication** :
1. ✅ Index RAG/full-text critiques mais features pas activées
2. ✅ Index conditionnels pour cas spécifiques futurs
3. ✅ Index métier (chat, jurisprudence) en attente déploiement
4. ✅ Index créés aujourd'hui (pas encore sollicités)

**Recommandation finale** :
- 🔒 **CONSERVER tous les index** pendant 1 mois
- 🔍 **ACTIVER** recherche full-text + RAG pour tester
- 📊 **MONITORER** scans hebdomadairement
- ❌ **SUPPRIMER** seulement après 1 mois si scans = 0 confirmé

**ROI** : Conserver index inutilisés coûte ~15 MB disque (négligeable) vs risque de supprimer index critique.

---

*Analyse effectuée le 9 février 2026*
