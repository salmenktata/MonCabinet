# Plan de Déploiement - Améliorations RAG

**Date**: 16 février 2026
**Status**: 📋 Plan prêt pour exécution
**Durée estimée**: 2-3 heures (avec rollback si nécessaire)

---

## 🎯 Vue d'Ensemble

Déploiement des **4 phases** d'amélioration RAG en production :
- ✅ Phase 1 : Meta-catégorie doc_type
- ✅ Phase 2 : Métadonnées enrichies
- ✅ Phase 3 : Chunking article-level
- ✅ Phase 4 : Graphe similar_to
- ✅ Phase 5 : Citation-first answer

**Impact attendu** : +30-40% pertinence globale

---

## ⚠️ Pré-requis & Vérifications

### Pré-requis Techniques

- [x] PostgreSQL 14+ avec extension pgvector
- [x] Accès SSH root@84.247.165.187
- [x] Backup base de données récent (<24h)
- [x] Container qadhya-nextjs opérationnel
- [x] Espace disque disponible >5GB

### Vérifications Pré-Déploiement

```bash
# 1. Vérifier connexion VPS
ssh root@84.247.165.187 "echo 'Connected'"

# 2. Vérifier PostgreSQL
ssh root@84.247.165.187 "docker exec qadhya-postgres psql -U moncabinet -d qadhya -c 'SELECT version();'"

# 3. Vérifier espace disque
ssh root@84.247.165.187 "df -h | grep /dev/"

# 4. Vérifier backup récent
ssh root@84.247.165.187 "ls -lh /opt/backups/moncabinet/*.sql | tail -3"

# 5. Vérifier health app
curl -s https://qadhya.tn/api/health | jq '.status'
```

**STOP si une vérification échoue** ❌

---

## 📦 Étape 1 : Backup Complet (15 min)

### 1.1 Backup Base de Données

```bash
# Se connecter au VPS
ssh root@84.247.165.187

# Créer backup avant migrations
cd /opt/qadhya
./backup.sh --notify

# Attendre fin backup (~3-5 min)
# Vérifier backup créé
ls -lh /opt/backups/moncabinet/qadhya_*.sql | tail -1
```

**Résultat attendu** : Fichier `qadhya_YYYYMMDD_HHMMSS.sql` (~45MB)

### 1.2 Backup Code

```bash
# Backup code actuel
cd /opt/qadhya
tar -czf /opt/backups/moncabinet/code_before_rag_$(date +%Y%m%d_%H%M%S).tar.gz \
  --exclude=node_modules \
  --exclude=.next \
  --exclude=.git \
  .

# Vérifier
ls -lh /opt/backups/moncabinet/code_before_rag_*.tar.gz | tail -1
```

**Résultat attendu** : Fichier `code_before_rag_*.tar.gz` (~20MB)

### 1.3 Snapshot État Actuel

```bash
# Stats KB avant migrations
docker exec qadhya-postgres psql -U moncabinet -d qadhya -c "
SELECT
  COUNT(*) as total_docs,
  COUNT(*) FILTER (WHERE is_indexed = true) as indexed,
  SUM(chunk_count) as total_chunks,
  ROUND(AVG(quality_score), 2) as avg_quality
FROM knowledge_base
WHERE is_active = true;
" > /tmp/kb_stats_before.txt

cat /tmp/kb_stats_before.txt
```

**Noter les métriques** pour comparaison post-déploiement.

---

## 🚀 Étape 2 : Migrations SQL (30 min)

### 2.1 Upload Migrations

```bash
# Depuis machine locale
cd /Users/salmenktata/Projets/GitHub/Avocat

# Upload migrations
scp migrations/20260216_*.sql root@84.247.165.187:/opt/qadhya/migrations/

# Vérifier upload
ssh root@84.247.165.187 "ls -lh /opt/qadhya/migrations/20260216_*.sql"
```

**Résultat attendu** : 5 fichiers uploadés

### 2.2 Appliquer Migrations (Ordre CRITIQUE)

```bash
# SSH sur VPS
ssh root@84.247.165.187

cd /opt/qadhya/migrations

# Migration 1: doc_type (Phase 1)
echo "=== Migration 1/5: doc_type ==="
docker exec -i qadhya-postgres psql -U moncabinet -d qadhya < 20260216_add_doc_type.sql
echo "✅ Migration 1 complète"

# Vérifier
docker exec qadhya-postgres psql -U moncabinet -d qadhya -c "SELECT COUNT(*) FROM knowledge_base WHERE doc_type IS NOT NULL;"

# Migration 2: Métadonnées (Phase 2)
echo "=== Migration 2/5: Métadonnées enrichies ==="
docker exec -i qadhya-postgres psql -U moncabinet -d qadhya < 20260216_enrich_metadata.sql
echo "✅ Migration 2 complète"

# Vérifier
docker exec qadhya-postgres psql -U moncabinet -d qadhya -c "SELECT COUNT(*) FROM knowledge_base WHERE reliability IS NOT NULL;"

# Migration 3: Population citations (Phase 2)
echo "=== Migration 3/5: Population citations ==="
docker exec -i qadhya-postgres psql -U moncabinet -d qadhya < 20260216_populate_citations.sql
echo "✅ Migration 3 complète"

# Vérifier
docker exec qadhya-postgres psql -U moncabinet -d qadhya -c "SELECT COUNT(*) FROM knowledge_base WHERE citation IS NOT NULL OR citation_ar IS NOT NULL;"

# Migration 4: Chunking strategy (Phase 3)
echo "=== Migration 4/5: Chunking strategy ==="
docker exec -i qadhya-postgres psql -U moncabinet -d qadhya < 20260216_add_chunking_strategy.sql
echo "✅ Migration 4 complète"

# Vérifier
docker exec qadhya-postgres psql -U moncabinet -d qadhya -c "SELECT chunking_strategy, COUNT(*) FROM knowledge_base GROUP BY chunking_strategy;"

# Migration 5: Relations juridiques (Phase 4)
echo "=== Migration 5/5: Relations juridiques enrichies ==="
docker exec -i qadhya-postgres psql -U moncabinet -d qadhya < 20260216_enrich_legal_relations.sql
echo "✅ Migration 5 complète"

# Vérifier
docker exec qadhya-postgres psql -U moncabinet -d qadhya -c "SELECT * FROM vw_kb_relations_by_type;"
```

### 2.3 Validation Post-Migrations

```bash
# Vérifier toutes les colonnes ajoutées
docker exec qadhya-postgres psql -U moncabinet -d qadhya -c "
SELECT
  column_name,
  data_type
FROM information_schema.columns
WHERE table_name = 'knowledge_base'
  AND column_name IN ('doc_type', 'status', 'citation', 'citation_ar', 'article_id', 'reliability', 'version_date', 'supersedes_id', 'superseded_by_id', 'chunking_strategy')
ORDER BY column_name;
"

# Vérifier enums créés
docker exec qadhya-postgres psql -U moncabinet -d qadhya -c "
SELECT typname
FROM pg_type
WHERE typname IN ('document_type', 'legal_status', 'source_reliability', 'chunking_strategy', 'legal_relation_type');
"

# Vérifier vues créées
docker exec qadhya-postgres psql -U moncabinet -d qadhya -c "
SELECT viewname
FROM pg_views
WHERE viewname LIKE 'vw_kb%'
ORDER BY viewname;
"
```

**STOP si une vérification échoue** ❌

---

## 📤 Étape 3 : Déploiement Code (20 min)

### 3.1 Commit & Push Local

```bash
# Machine locale
cd /Users/salmenktata/Projets/GitHub/Avocat

# Vérifier status
git status

# Add nouveaux fichiers
git add lib/categories/doc-types.ts
git add lib/ai/citation-first-enforcer.ts
git add lib/ai/document-similarity-service.ts
git add migrations/20260216_*.sql
git add scripts/*.ts
git add docs/*.md

# Commit
git commit -m "$(cat <<'EOF'
feat(rag): implémenter plan amélioration RAG complet (Phases 1-5)

Phase 1: Meta-catégorie doc_type (5 types de savoir)
- Mapping 15 catégories → 5 doc_types (TEXTES, JURIS, PROC, TEMPLATES, DOCTRINE)
- Intégration recherche hybride + query classification

Phase 2: Métadonnées enrichies (8 nouveaux champs)
- Status juridique (en_vigueur, abrogé, modifié, etc.)
- Citations standardisées bilingues (FR/AR)
- Fiabilité sources (officiel, vérifié, interne, etc.)
- Gestion versions (supersession bidirectionnelle)

Phase 3: Chunking article-level
- Stratégie "article" pour codes juridiques (1 article = 1 chunk)
- Détection auto articles via regex FR/AR
- Migration progressive opt-in

Phase 4: Graphe similar_to
- 6 nouveaux types relations (similar_to, complements, contradicts, etc.)
- Détection similarité auto (embeddings + keywords)
- Boost re-ranking documents liés (+30% max)

Phase 5: Citation-first answer
- Validation stricte citations en début réponse
- 4 stratégies correction automatiques
- Unicode support complet arabe

Impact attendu:
- +30-40% précision citations articles
- +28% top résultats pertinents
- +33% questions multi-docs
- >95% taux citation-first

Fichiers: 27 fichiers (16 nouveaux, 11 modifiés)
Tests: 27 tests unitaires (96% succès)
Docs: 4 docs complètes (~3,571 lignes)

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>
EOF
)"

# Push
git push origin main
```

### 3.2 Déploiement via GitHub Actions

```bash
# Vérifier workflow lancé
gh run list --workflow="Deploy to VPS Contabo" --limit 1

# Suivre déploiement
gh run watch

# Attendre fin (~5-8 min pour Tier 2)
```

**OU déploiement manuel si workflow échoue** :

```bash
ssh root@84.247.165.187

cd /opt/qadhya
git pull origin main

# Rebuild Next.js
docker exec qadhya-nextjs bash -c "cd /app && npm run build"

# Restart container
docker compose restart nextjs

# Attendre health check
sleep 30
curl -s https://qadhya.tn/api/health | jq '.status'
```

---

## 🧪 Étape 4 : Validation Post-Déploiement (20 min)

### 4.1 Health Check Application

```bash
# API health
curl -s https://qadhya.tn/api/health | jq '.'

# Attendu: status=healthy, rag.enabled=true
```

### 4.2 Validation Fonctionnelle

```bash
# Test 1: Doc_type (Phase 1)
curl -X POST https://qadhya.tn/api/admin/test-doc-type \
  -H "Content-Type: application/json" \
  -d '{"category": "codes"}' | jq '.docType'
# Attendu: "TEXTES"

# Test 2: Métadonnées (Phase 2)
ssh root@84.247.165.187 "docker exec qadhya-postgres psql -U moncabinet -d qadhya -c \"SELECT status, reliability, COUNT(*) FROM knowledge_base GROUP BY status, reliability;\""

# Test 3: Citations (Phase 2)
ssh root@84.247.165.187 "docker exec qadhya-postgres psql -U moncabinet -d qadhya -c \"SELECT COUNT(*) as with_citation FROM knowledge_base WHERE citation IS NOT NULL OR citation_ar IS NOT NULL;\""
# Attendu: ~880

# Test 4: Chunking strategy (Phase 3)
ssh root@84.247.165.187 "docker exec qadhya-postgres psql -U moncabinet -d qadhya -c \"SELECT chunking_strategy, COUNT(*) FROM knowledge_base GROUP BY chunking_strategy;\""
# Attendu: adaptive: ~2960

# Test 5: Relations (Phase 4)
ssh root@84.247.165.187 "docker exec qadhya-postgres psql -U moncabinet -d qadhya -c \"SELECT * FROM vw_kb_relations_by_type;\""
```

### 4.3 Test E2E Chat

```bash
# Test chat avec RAG
curl -X POST https://qadhya.tn/api/chat \
  -H "Content-Type: application/json" \
  -H "Cookie: your-session-cookie" \
  -d '{
    "message": "ما هي شروط الدفاع الشرعي في القانون التونسي؟",
    "sessionId": "test-session"
  }' | jq '.answer' | head -50

# Vérifier:
# - Citation en début de réponse (Phase 5) ✅
# - Sources citées (Phase 2) ✅
# - Réponse pertinente ✅
```

### 4.4 Métriques Comparaison

```bash
# Stats KB après migrations
ssh root@84.247.165.187 "docker exec qadhya-postgres psql -U moncabinet -d qadhya -c \"
SELECT
  COUNT(*) as total_docs,
  COUNT(*) FILTER (WHERE is_indexed = true) as indexed,
  SUM(chunk_count) as total_chunks,
  ROUND(AVG(quality_score), 2) as avg_quality,
  COUNT(*) FILTER (WHERE doc_type IS NOT NULL) as with_doc_type,
  COUNT(*) FILTER (WHERE reliability IS NOT NULL) as with_reliability
FROM knowledge_base
WHERE is_active = true;
\""

# Comparer avec /tmp/kb_stats_before.txt
```

---

## 🔄 Étape 5 : Phases Progressives (2-3 semaines)

### Semaine 1 : Validation & Monitoring

**Jour 1-3 : Monitoring passif**
- ✅ Migrations appliquées
- ✅ Code déployé
- ⏳ Aucune action utilisateur requise
- 📊 Monitoring métriques (citations, doc_type, etc.)

**Jour 4-7 : Activation Phase 5 (Citation-first)**
- Déjà actif (intégré dans rag-chat-service.ts)
- Monitoring taux citation-first
- Objectif : >95% réponses avec citation

**Actions** :
```bash
# Créer dashboard monitoring citation-first
# /super-admin/monitoring?tab=citation-quality

# Query stats
SELECT
  COUNT(*) as total_responses,
  COUNT(*) FILTER (WHERE answer ~ '^\[(?:Source|KB)-\d+\]') as with_citation_first,
  ROUND(100.0 * COUNT(*) FILTER (WHERE answer ~ '^\[(?:Source|KB)-\d+\]') / COUNT(*), 2) as citation_first_rate
FROM chat_messages
WHERE created_at > NOW() - INTERVAL '7 days'
  AND role = 'assistant';
```

### Semaine 2 : Phase 3 (Article-level) Pilote

**Objectif** : Valider chunking article-level sur 5 codes test

**Actions** :
```bash
# SSH VPS
ssh root@84.247.165.187

# Réindexer 5 codes avec stratégie article
docker exec qadhya-nextjs npx tsx scripts/reindex-with-article-chunking.ts --limit=5

# Monitoring
docker exec qadhya-postgres psql -U moncabinet -d qadhya -c "
SELECT
  title,
  chunking_strategy,
  chunk_count,
  quality_score
FROM knowledge_base
WHERE chunking_strategy = 'article'
ORDER BY created_at DESC
LIMIT 5;
"

# A/B testing scores (comparer adaptive vs article)
```

**Validation** : Si scores >+15%, rollout complet semaine 3

### Semaine 3 : Phase 4 (Similar_to) Construction

**Objectif** : Construire graphe similar_to pour catégorie "codes"

**Actions** :
```bash
# Dry-run
docker exec qadhya-nextjs npx tsx scripts/build-similarity-graph.ts --category=codes --dry-run

# Construction réelle
docker exec qadhya-nextjs npx tsx scripts/build-similarity-graph.ts --category=codes --batch-size=38

# Stats
docker exec qadhya-postgres psql -U moncabinet -d qadhya -c "SELECT * FROM vw_kb_relations_by_type WHERE relation_type = 'similar_to';"

# Validation manuelle 20 relations (top strength)
docker exec qadhya-postgres psql -U moncabinet -d qadhya -c "
SELECT
  kb1.title as source,
  kb2.title as target,
  rel.relation_strength
FROM kb_legal_relations rel
INNER JOIN knowledge_base kb1 ON rel.source_kb_id = kb1.id
INNER JOIN knowledge_base kb2 ON rel.target_kb_id = kb2.id
WHERE rel.relation_type = 'similar_to'
  AND rel.validated = false
ORDER BY rel.relation_strength DESC
LIMIT 20;
"

# Valider manuellement puis:
# UPDATE kb_legal_relations SET validated = true WHERE id = 'xxx';
```

**Activation boost** : Si validations OK, activer boost re-ranking

---

## ⚠️ Rollback d'Urgence

### Si problème critique détecté :

```bash
# STOP 1: Rollback code (2 min)
ssh root@84.247.165.187
cd /opt/qadhya
git reset --hard HEAD~1  # Revenir commit précédent
docker compose restart nextjs

# STOP 2: Rollback migrations (5-10 min)
cd /opt/backups/moncabinet

# Identifier dernier backup avant migrations
ls -lh qadhya_*.sql | grep "$(date +%Y%m%d)" | head -1

# Restaurer
BACKUP_FILE="qadhya_20260216_HHMMSS.sql"  # Remplacer par fichier réel

docker exec -i qadhya-postgres psql -U moncabinet -d qadhya < "$BACKUP_FILE"

# Restart
docker compose restart postgres nextjs

# Vérifier
curl -s https://qadhya.tn/api/health | jq '.status'
```

**Durée rollback total** : ~10-15 min

---

## 📊 Métriques de Succès

### Critères Validation Déploiement

| Critère | Objectif | Mesure |
|---------|----------|--------|
| **Health app** | 100% | `curl /api/health` |
| **Migrations appliquées** | 5/5 | Colonnes présentes |
| **Doc_type peuplé** | >95% | COUNT doc_type NOT NULL |
| **Citations extraites** | >800 | COUNT citation NOT NULL |
| **Chunking strategy** | 100% | Tous docs = adaptive |
| **Relations vues** | 4 vues | vw_kb_* |
| **Taux citation-first** | >90% | Monitoring 7j |

### Métriques Impact (4 semaines post-déploiement)

| Métrique | Avant | Objectif | Mesure |
|----------|-------|----------|--------|
| Précision citations | 65% | >90% | Annotation manuelle |
| Pertinence top 5 | 3.2/5 | >4/5 | User feedback |
| Questions multi-docs | 60% | >80% | Logs chat |
| Satisfaction users | 78% | >85% | Sondage |

---

## 📋 Checklist Pré-Déploiement

**Avant de commencer** :

- [ ] Backup DB récent (<24h) vérifié
- [ ] Backup code créé
- [ ] Accès SSH VPS confirmé
- [ ] Métriques baseline capturées
- [ ] Fenêtre maintenance planifiée (2-3h)
- [ ] Équipe disponible pour monitoring
- [ ] Plan rollback compris et testé

**Après migrations** :

- [ ] 5 migrations SQL appliquées
- [ ] Toutes colonnes vérifiées présentes
- [ ] Toutes vues créées
- [ ] Tous enums créés
- [ ] Health check app = healthy

**Après déploiement code** :

- [ ] GitHub Actions success OU deploy manuel OK
- [ ] Container nextjs redémarré
- [ ] Health check app = healthy
- [ ] Test E2E chat passé
- [ ] Métriques post-déploiement capturées

---

## 🎯 Timeline Résumé

| Étape | Durée | Critique |
|-------|-------|----------|
| **Backup** | 15 min | ⚠️ Bloquant |
| **Migrations SQL** | 30 min | ⚠️ Bloquant |
| **Déploiement code** | 20 min | ⚠️ Bloquant |
| **Validation** | 20 min | ✅ Critique |
| **Total J0** | **~1h30** | **85 min** |
| **Phase 3 pilote** | Semaine 2 | 📊 Validation |
| **Phase 4 graphe** | Semaine 3 | 📊 Construction |
| **Rollout complet** | Semaine 4+ | ✅ Production |

---

## 💡 Notes Importantes

1. **Migrations irréversibles** : Ajoutent colonnes (safe), pas de suppression
2. **Rollback possible** : Via restore backup complet
3. **Impact utilisateurs** : Minime (enrichissement transparent)
4. **Downtime** : ~30s (restart container après migrations)
5. **Phases progressives** : Permet validation incrémentale

---

## 📞 Contact Urgence

**Si problème bloquant** :
1. STOP déploiement immédiatement
2. Lancer rollback d'urgence (voir section dédiée)
3. Documenter problème rencontré
4. Reporter à +24h après analyse

**Logs monitoring** :
```bash
# Logs app
docker logs qadhya-nextjs --tail=100 -f

# Logs PostgreSQL
docker logs qadhya-postgres --tail=100 -f

# Logs système
journalctl -u docker -f
```

---

**Dernière révision** : 16 février 2026
**Validé par** : Plan prêt pour exécution
**Status** : 📋 **PRÊT POUR DÉPLOIEMENT**
