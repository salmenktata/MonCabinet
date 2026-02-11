# Guide Administrateur - Qadhya RAG Juridique

**Version** : 1.0
**Date** : 11 Février 2026
**Public** : Administrateurs système, Super-admins Qadhya
**Durée lecture** : ~25 minutes

---

## Table des Matières

1. [Introduction](#1-introduction)
2. [Architecture Système](#2-architecture-système)
3. [Gestion Base de Connaissances](#3-gestion-base-de-connaissances)
4. [Monitoring & Métriques](#4-monitoring--métriques)
5. [Gestion Utilisateurs](#5-gestion-utilisateurs)
6. [Optimisations Performance](#6-optimisations-performance)
7. [Sauvegardes & Restauration](#7-sauvegardes--restauration)
8. [Sécurité](#8-sécurité)
9. [Troubleshooting](#9-troubleshooting)
10. [Maintenance](#10-maintenance)

---

## 1. Introduction

### 1.1 Rôle de l'Administrateur

En tant qu'administrateur Qadhya, vous êtes responsable de :

- ✅ **Qualité de la base de connaissances** (500+ docs juridiques)
- ✅ **Performance du système RAG** (latence, précision, coût)
- ✅ **Sécurité et confidentialité** (données utilisateurs, RGPD)
- ✅ **Monitoring continu** (uptime >99%, détection anomalies)
- ✅ **Support niveau 2** (escalade bugs critiques)

### 1.2 Accès Interface Admin

1. **URL** : [https://qadhya.tn/super-admin](https://qadhya.tn/super-admin)
2. **Authentification** : Compte super-admin (rôle `ADMIN`)
3. **Dashboard principal** : Vue d'ensemble métriques clés

**⚠️ Sécurité** : L'accès admin est tracé. Toute action critique génère un log d'audit.

---

## 2. Architecture Système

### 2.1 Stack Technique

```
┌─────────────────────────────────────────────────────────────┐
│                    UTILISATEURS (Avocats)                   │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│           Next.js 15 (Frontend + API Routes)                │
│   - Chat Interface (React)                                  │
│   - Admin Dashboard (React)                                  │
│   - API REST (/api/*)                                       │
└─────────────────────────────────────────────────────────────┘
                            │
            ┌───────────────┼───────────────┐
            ▼               ▼               ▼
    ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
    │  PostgreSQL  │ │    Redis     │ │    MinIO     │
    │  (Données)   │ │   (Cache)    │ │  (Storage)   │
    └──────────────┘ └──────────────┘ └──────────────┘
            │
            ▼
    ┌──────────────────────────────────────────────┐
    │         Pipeline RAG (lib/ai/)               │
    │  1. Embeddings (Ollama qwen3-embedding)      │
    │  2. Recherche Sémantique (pgvector)          │
    │  3. Multi-Chain Reasoning (4 chains)         │
    │  4. LLM Generation (Fallback chain)          │
    └──────────────────────────────────────────────┘
            │
            ▼
    ┌──────────────────────────────────────────────┐
    │         LLM Providers (Fallback)             │
    │  1. Ollama (local, gratuit)                  │
    │  2. Groq (cloud, rapide)                     │
    │  3. DeepSeek (cloud, économique)             │
    │  4. Anthropic (cloud, premium)               │
    └──────────────────────────────────────────────┘
```

### 2.2 Base de Données PostgreSQL

#### Tables Critiques

| Table | Taille Moyenne | Description |
|-------|---------------|-------------|
| `knowledge_base` | ~300-500 docs | Documents juridiques indexés |
| `kb_chunks` | ~5000-10000 chunks | Segments avec embeddings (vector 1024-dim) |
| `kb_structured_metadata` | ~300-500 lignes | Métadonnées extraites (tribunal, chambre, date) |
| `kb_legal_relations` | ~300-500 relations | Graphe citations entre documents |
| `rag_feedback` | ~100-200/mois | Feedback utilisateurs (ratings, suggestions) |
| `conversations` | ~500-1000/mois | Historique conversations chat |
| `users` | ~50-100 users | Comptes avocats + admins |
| `ai_usage_logs` | ~10000-20000/mois | Logs appels LLM (coût, latence, provider) |

#### Indexes Critiques

```sql
-- Recherche sémantique (HNSW)
CREATE INDEX idx_kb_chunks_embedding ON kb_chunks USING hnsw (embedding vector_cosine_ops);

-- Filtres juridiques
CREATE INDEX idx_kb_metadata_tribunal ON kb_structured_metadata(tribunal);
CREATE INDEX idx_kb_metadata_domain ON kb_structured_metadata(domain);
CREATE INDEX idx_kb_metadata_date ON kb_structured_metadata(date_decision);

-- Performance queries
CREATE INDEX idx_kb_chunks_doc_id ON kb_chunks(document_id);
CREATE INDEX idx_conversations_user_id ON conversations(user_id);
CREATE INDEX idx_ai_usage_logs_provider ON ai_usage_logs(provider, operation, created_at);
```

**⚠️ Maintenance** : Exécuter `VACUUM ANALYZE` hebdomadairement sur tables volumineuses.

### 2.3 Redis Cache

#### Structure Cache

| Clé | TTL | Taille | Description |
|-----|-----|--------|-------------|
| `search:query:{hash}` | 1h | ~5-10 KB | Résultats recherche sémantique |
| `embedding:{text_hash}` | 24h | ~4 KB | Embeddings calculés (1024-dim float) |
| `classification:url:{url_hash}` | 7j | ~2 KB | Classification catégorie documents |
| `rag:response:{query_hash}` | 5min | ~50-100 KB | Réponses RAG complètes (mode Rapide) |

**💡 Commande utile** :
```bash
# Statistiques cache Redis
redis-cli INFO stats

# Vider cache (ATTENTION : perte temporaire performance)
redis-cli FLUSHDB
```

### 2.4 MinIO Storage

#### Buckets

| Bucket | Taille | Description |
|--------|--------|-------------|
| `documents` | ~500 MB - 2 GB | PDFs indexés dans KB |
| `web-files` | ~100 MB | Fichiers crawlés (HTML, DOCX) |
| `avatars` | ~10 MB | Photos profil utilisateurs |
| `uploads` | ~50 MB | Documents temporaires uploadés |

**Commande vérification** :
```bash
# Lister buckets
docker exec qadhya-minio mc ls prod

# Taille bucket documents
docker exec qadhya-minio mc du prod/documents
```

---

## 3. Gestion Base de Connaissances

### 3.1 Dashboard KB Quality Review

**URL** : `/super-admin/kb-quality-review`

#### Indicateurs Clés

| Métrique | Objectif | Actuel | Action si <Objectif |
|----------|----------|--------|-------------------|
| **Health Score Moyen** | >85/100 | - | Valider métadonnées manuellement |
| **Docs Non-Indexés** | <5% | - | Lancer indexation batch |
| **Métadonnées Manquantes** | <10% | - | Re-exécuter extraction LLM |
| **Citations Validées** | >95% | - | Audit manuel citations douteuses |

#### Workflow Validation Qualité

```
1. Filtrer : Docs avec confidence <0.85 OU catégorie jurisprudence
   └─ Queue priorisée (par occurrence dans feedbacks)

2. Pour chaque doc :
   a. Vérifier métadonnées (tribunal, chambre, date)
   b. Corriger si nécessaire (formulaire éditable)
   c. Valider relations juridiques (citations extraites)
   d. Marquer "Validé" ou "Rejeter" (suppression KB)

3. Batch validation :
   - Bouton "Valider 10 suivants" → Confirmation en masse
   - Gamification : Points + leaderboard validateurs
```

**💡 Objectif** : Valider 50 docs/semaine minimum (1h/jour)

### 3.2 Ajout de Documents

#### Via Crawling Web

1. **Accéder** : `/super-admin/web-sources`
2. **Créer source** :
   - Nom : _"Cour de Cassation - Arrêts 2024"_
   - Base URL : `https://cassation.tn/arrêts/2024`
   - Catégorie : `jurisprudence`
   - Domaine : `civil` (ou `penal`, `commercial`, etc.)
   - Patterns URL : `/arrêt-(\d+)` (regex)
   - Scheduling : Hebdomadaire (lundi 2h UTC)
3. **Lancer crawl initial** : Bouton "Crawler maintenant"
4. **Monitoring** : Onglet "Jobs Crawl" → Statut en temps réel

#### Via Upload Manual

1. **Accéder** : `/super-admin/knowledge-base/upload`
2. **Upload PDF** : Drag & drop ou sélection fichier
3. **Remplir métadonnées** :
   - Titre : _"Arrêt n° 12345/2024 - Cass. Civ."_
   - Catégorie : `jurisprudence`
   - Tribunal : `TRIBUNAL_CASSATION`
   - Chambre : `civile`
   - Date décision : `2024-06-15`
4. **Indexation automatique** : Batch cron toutes les 5min

**⚠️ Limite** : Max 50 MB/fichier, formats supportés : PDF, DOCX, TXT

### 3.3 Indexation Batch

#### Configuration Cron

**Fichier** : `/opt/qadhya/index-kb-progressive.sh`

```bash
#!/bin/bash
# Indexation progressive (2 docs/appel, 240s timeout)
curl -X POST https://qadhya.tn/api/admin/index-kb \
  -H "Authorization: Bearer $CRON_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"batchSize": 2}' \
  --max-time 240

# Logs dans /var/log/kb-indexing.log
```

**Fréquence** : Toutes les 5 minutes (cron : `*/5 * * * *`)

#### Monitoring Indexation

```bash
# Voir logs temps réel
tail -f /var/log/kb-indexing.log

# Compter docs indexés aujourd'hui
grep "Successfully indexed" /var/log/kb-indexing.log | grep "$(date +%Y-%m-%d)" | wc -l

# Détecter erreurs
grep "ERROR" /var/log/kb-indexing.log | tail -20
```

### 3.4 Re-Chunking

**Problème** : Chunks trop grands (>2500 chars) → Performance dégradée

**Solution** : API Re-chunking

```bash
# Dry-run (analyser sans modifier)
curl -X POST https://qadhya.tn/api/admin/kb/rechunk \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -d '{"dryRun": true, "batchSize": 10}'

# Exécution réelle
curl -X POST https://qadhya.tn/api/admin/kb/rechunk \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -d '{"dryRun": false, "batchSize": 10, "recomputeEmbeddings": true}'
```

**Paramètres** :
- `dryRun` : Simulation sans modifications (défaut `true`)
- `batchSize` : Nombre docs traités en parallèle (défaut `10`)
- `recomputeEmbeddings` : Recalculer embeddings après re-chunking (défaut `true`)

**💡 Quand re-chunker ?** :
- Health score moyen <70/100
- Latence RAG >8s P95
- Feedbacks "Réponses trop générales"

---

## 4. Monitoring & Métriques

### 4.1 Dashboard Production Monitoring

**URL** : `/super-admin/production-monitoring`

#### Métriques Temps Réel

##### 1. Volume
- **Queries/Heure** : Objectif <100 (saturation système si >150)
- **Active Users** : Nombre utilisateurs actifs (dernière heure)
- **Peak Concurrency** : Requêtes simultanées max (objectif <10)

##### 2. Qualité
- **Average Rating** : Note moyenne feedbacks (objectif >4.2/5)
- **Hallucination Rate** : % réponses avec citations inventées (objectif <0.1%)
- **Citation Accuracy** : % citations valides (objectif >95%)

##### 3. Performance
- **Latency P50** : Médiane temps réponse (objectif <3s)
- **Latency P95** : 95e percentile (objectif <8s)
- **Error Rate** : % requêtes en erreur (objectif <0.5%)

##### 4. Coûts
- **Cost/Query** : Coût moyen par requête (objectif <0.03 TND)
- **Monthly Budget** : Projection coût mensuel (objectif <200 TND)

#### Alertes Automatiques

Configuration : `/lib/monitoring/alerts-config.ts`

```typescript
export const ALERT_THRESHOLDS = {
  latency_p95_ms: 8000, // >8s → SMS admin
  error_rate_percent: 0.5, // >0.5% → Email admin
  hallucination_rate_percent: 0.1, // >0.1% → SMS + Email urgent
  cost_per_query_tnd: 0.05, // >0.05 TND → Email quotidien
  queries_per_hour: 150, // >150 → SMS (saturation)
}
```

**Canaux notification** :
- **SMS** : Erreurs critiques (hallucinations, saturation)
- **Email** : Erreurs moyennes (coût, latence)
- **Slack** : Notifications informatives (nouveaux users, feedbacks)

### 4.2 Dashboard Legal Quality

**URL** : `/super-admin/legal-quality`

#### KPIs Juridiques

| KPI | Calcul | Objectif | Alerte si |
|-----|--------|----------|-----------|
| **Citation Accuracy** | (Citations valides / Total citations) × 100 | >95% | <90% |
| **Hallucination Rate** | (Citations inventées / Total réponses) × 100 | <0.1% | >0.5% |
| **Coverage Score** | (Réponses >10 sources / Total réponses) × 100 | >80% | <60% |
| **Multi-Perspective Rate** | (Réponses avec analyse contradictoire / Total controversées) × 100 | >80% | <60% |
| **Freshness Score** | Âge médian sources (jours) | <365j | >730j |
| **Abrogation Detection Rate** | (Abrogations détectées / Total abrogations) × 100 | >90% | <80% |
| **Actionable Rate** | (Réponses avec recommandations / Total réponses) × 100 | >70% | <50% |
| **Lawyer Satisfaction** | Rating moyen avocats (1-5) | >4.2 | <3.8 |

**Export** : Bouton "Export CSV" → Rapport hebdomadaire pour direction

### 4.3 Dashboard Provider Usage

**URL** : `/super-admin/provider-usage`

#### Matrice Coûts

| Provider | Embedding | Chat | Classification | Total (7j) | Part |
|----------|-----------|------|---------------|-----------|------|
| Ollama (local) | 0.00 TND | 0.00 TND | 0.00 TND | **0.00 TND** | 60% |
| Groq (cloud) | 0.50 TND | 2.30 TND | 0.20 TND | **3.00 TND** | 25% |
| DeepSeek (cloud) | 0.30 TND | 1.50 TND | 0.10 TND | **1.90 TND** | 10% |
| Anthropic (cloud) | 0.20 TND | 1.00 TND | 0.05 TND | **1.25 TND** | 5% |

**Objectif** : Maintenir Ollama >50% (mode Rapide gratuit)

**Action si Ollama <30%** :
1. Vérifier service Ollama : `systemctl status ollama`
2. Redémarrer si down : `systemctl restart ollama`
3. Analyser logs : `journalctl -u ollama -f`

---

## 5. Gestion Utilisateurs

### 5.1 Création Compte Avocat

**URL** : `/super-admin/users/create`

1. **Informations requises** :
   - Nom complet
   - Email professionnel (@avocat.tn recommandé)
   - Numéro inscription barreau (CNOA)
   - Cabinet juridique
   - Domaines spécialité (max 3)

2. **Rôle** : `LAWYER` (par défaut) ou `ADMIN` (super-admins uniquement)

3. **Limites quotidiennes** :
   - Mode Rapide : Illimité
   - Mode Premium : 20 requêtes/jour (plan gratuit) ou Illimité (plan payant)

4. **Email activation** : Envoi automatique avec lien validation compte

### 5.2 Gestion Plan Utilisateurs

**URL** : `/super-admin/users/{userId}/subscription`

#### Plans Disponibles

| Plan | Prix | Requêtes Premium | Support | Fonctionnalités |
|------|------|------------------|---------|-----------------|
| **Free** | 0 TND/mois | 20/jour | Email (48h) | Mode Rapide illimité + Mode Premium limité |
| **Pro** | 50 TND/mois | 200/jour | Email (24h) + Chat | Free + Analyse multi-perspectives + Timeline |
| **Entreprise** | 500 TND/mois | Illimité | Email (6h) + Tél | Pro + API + Multi-users (10 comptes) |

**💡 Upgrade manuel** :
1. Accéder fiche utilisateur
2. Section "Abonnement" → Changer plan
3. Sauvegarder → Mise à jour immédiate

### 5.3 Suspension Compte

**Raisons suspension** :
- Non-paiement (plan payant)
- Abus système (scraping, spam)
- Violation CGU (partage compte)

**Procédure** :
1. `/super-admin/users/{userId}` → Bouton "Suspendre"
2. Motif requis (texte libre)
3. Email automatique à l'utilisateur
4. Données conservées 90 jours avant suppression

**Réactivation** : Bouton "Réactiver" (même page)

---

## 6. Optimisations Performance

### 6.1 Latence RAG

#### Diagnostic

```bash
# Analyser temps réponse (P50, P95, P99)
psql -U moncabinet -d qadhya -c "
  SELECT
    PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY latency_ms) AS p50,
    PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY latency_ms) AS p95,
    PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY latency_ms) AS p99
  FROM ai_usage_logs
  WHERE operation = 'chat' AND created_at > NOW() - INTERVAL '7 days';
"
```

#### Optimisations Disponibles

| Problème | Cause | Solution |
|----------|-------|----------|
| P95 >10s | Embeddings lents | Augmenter `OLLAMA_EMBEDDING_CONCURRENCY` (2→3) |
| P95 >10s | Recherche sémantique lente | Reconstruire index HNSW : `REINDEX INDEX idx_kb_chunks_embedding` |
| P95 >10s | Trop de sources (>20) | Réduire `RAG_MAX_SOURCES` (20→15) |
| P50 >5s | Cache hit faible | Abaisser `SEARCH_CACHE_THRESHOLD` (0.75→0.70) |
| P50 >5s | Multi-chain reasoning lourd | Désactiver temporairement (mode dégradé) |

### 6.2 Throughput Indexation

#### Diagnostic

```bash
# Compter docs indexés/heure
psql -U moncabinet -d qadhya -c "
  SELECT
    DATE_TRUNC('hour', updated_at) AS hour,
    COUNT(*) AS docs_indexed
  FROM knowledge_base
  WHERE is_indexed = true AND updated_at > NOW() - INTERVAL '24 hours'
  GROUP BY hour ORDER BY hour DESC;
"
```

**Objectif** : >10 docs/heure (mode production)

#### Optimisations

1. **Parallel embeddings** : `OLLAMA_EMBEDDING_CONCURRENCY=2` (défaut)
   - VPS 4 cores → Max 3 concurrent (risque saturation CPU si >3)

2. **Batch size** : `INDEXING_BATCH_SIZE=2` (défaut)
   - Augmenter à 5 si Ollama stable + CPU usage <60%

3. **Streaming PDF** : `USE_STREAMING_PDF=true` (défaut)
   - Réduit RAM usage -60% (200 MB → 80 MB par PDF)

### 6.3 Cache Hit Rate

#### Diagnostic

```bash
# Stats Redis
redis-cli INFO stats | grep keyspace_hits
redis-cli INFO stats | grep keyspace_misses

# Calcul hit rate
redis-cli INFO stats | awk '/keyspace_hits/{hits=$2} /keyspace_misses/{misses=$2} END{print "Hit rate:", (hits/(hits+misses))*100"%"}'
```

**Objectif** : >80% (cache chaud)

#### Optimisations

1. **Augmenter TTL** :
   - Search cache : 1h → 2h (`SEARCH_CACHE_TTL_HOURS=2`)
   - Embedding cache : 24h → 48h (`EMBEDDING_CACHE_TTL_HOURS=48`)

2. **Abaisser threshold** :
   - Search similarity : 0.75 → 0.70 (`SEARCH_CACHE_THRESHOLD=0.70`)

3. **Pré-remplir cache** (queries fréquentes) :
   ```bash
   # Script : scripts/warmup-cache.sh
   curl -X POST https://qadhya.tn/api/admin/cache/warmup \
     -H "Authorization: Bearer $ADMIN_TOKEN"
   ```

---

## 7. Sauvegardes & Restauration

### 7.1 Sauvegardes Automatiques

#### PostgreSQL

**Cron daily** : 3h UTC (fichier `/opt/qadhya/backup-db.sh`)

```bash
#!/bin/bash
BACKUP_DIR="/opt/qadhya/backups/postgresql"
DATE=$(date +%Y%m%d_%H%M%S)

# Dump complet
docker exec qadhya-postgres pg_dump -U moncabinet -d qadhya -Fc > \
  "$BACKUP_DIR/qadhya_$DATE.dump"

# Compression
gzip "$BACKUP_DIR/qadhya_$DATE.dump"

# Rotation (garder 30 derniers jours)
find "$BACKUP_DIR" -name "qadhya_*.dump.gz" -mtime +30 -delete

# Upload S3 (optionnel)
# aws s3 cp "$BACKUP_DIR/qadhya_$DATE.dump.gz" s3://qadhya-backups/
```

**Vérification** :
```bash
ls -lh /opt/qadhya/backups/postgresql | tail -5
```

#### MinIO (Documents)

**Cron weekly** : Dimanche 4h UTC

```bash
#!/bin/bash
BACKUP_DIR="/opt/qadhya/backups/minio"
DATE=$(date +%Y%m%d)

# Backup bucket documents
docker exec qadhya-minio mc mirror prod/documents "$BACKUP_DIR/$DATE/documents"

# Rotation (garder 12 semaines)
find "$BACKUP_DIR" -maxdepth 1 -type d -mtime +84 -exec rm -rf {} \;
```

### 7.2 Restauration Base de Données

#### Scénario : Corruption DB

```bash
# 1. Arrêter containers
docker stop qadhya-nextjs

# 2. Identifier backup à restaurer
ls -lh /opt/qadhya/backups/postgresql

# 3. Restaurer
gunzip /opt/qadhya/backups/postgresql/qadhya_20260210_030000.dump.gz
docker exec -i qadhya-postgres pg_restore -U moncabinet -d qadhya -c \
  < /opt/qadhya/backups/postgresql/qadhya_20260210_030000.dump

# 4. Vérifier intégrité
docker exec qadhya-postgres psql -U moncabinet -d qadhya -c "
  SELECT COUNT(*) FROM knowledge_base;
  SELECT COUNT(*) FROM kb_chunks;
"

# 5. Redémarrer
docker start qadhya-nextjs
```

#### Scénario : Rollback Version Applicative

```bash
# 1. Lister images Docker disponibles
docker images | grep moncabinet

# 2. Identifier version stable précédente
docker tag ghcr.io/salmenktata/moncabinet:latest ghcr.io/salmenktata/moncabinet:rollback
docker pull ghcr.io/salmenktata/moncabinet:sha-XXXXXXX

# 3. Modifier docker-compose.prod.yml
sed -i 's/:latest/:sha-XXXXXXX/' /opt/qadhya/docker-compose.prod.yml

# 4. Redéployer
cd /opt/qadhya
docker-compose -f docker-compose.prod.yml up -d

# 5. Health check
curl https://qadhya.tn/api/health
```

---

## 8. Sécurité

### 8.1 Audit Logs

**Table** : `audit_logs`

```sql
SELECT
  action, -- 'CREATE_USER', 'DELETE_DOCUMENT', 'CHANGE_SUBSCRIPTION'
  user_id,
  resource_type, -- 'USER', 'DOCUMENT', 'CONVERSATION'
  resource_id,
  details, -- JSON
  ip_address,
  created_at
FROM audit_logs
WHERE created_at > NOW() - INTERVAL '7 days'
ORDER BY created_at DESC
LIMIT 100;
```

**Actions critiques tracées** :
- Création/suppression utilisateurs
- Modification rôles (LAWYER → ADMIN)
- Suppression documents KB
- Accès données sensibles (conversations autres users)
- Modification configuration système

### 8.2 Chiffrement Données

#### En Transit (HTTPS)

- Certificat SSL : Cloudflare mTLS (expire 2036)
- Nginx configuré : `ssl_verify_client on` (mode strict)
- **Vérification** :
  ```bash
  openssl s_client -connect qadhya.tn:443 -servername qadhya.tn
  ```

#### Au Repos

| Données | Méthode | Clé |
|---------|---------|-----|
| Clés API providers | AES-256-GCM | `ENCRYPTION_KEY` (.env) |
| Mots de passe users | bcrypt (12 rounds) | - |
| Documents MinIO | Chiffrement serveur | MinIO auto |
| Conversations | Non chiffré (PostgreSQL) | ⚠️ TODO Phase 8 |

**⚠️ CRITIQUE** : Ne jamais supprimer/modifier `ENCRYPTION_KEY` → Clés API irrécupérables

### 8.3 RGPD & Confidentialité

#### Droits Utilisateurs

1. **Droit d'accès** : Export données (bouton "Exporter mes données" dans profil)
2. **Droit de rectification** : Édition profil utilisateur
3. **Droit à l'oubli** : Suppression compte + données (délai 90j)
4. **Droit à la portabilité** : Export JSON complet (conversations, feedbacks)

#### Durées de Rétention

| Données | Durée | Base légale |
|---------|-------|-------------|
| Conversations | 2 ans | Intérêt légitime (amélioration service) |
| Feedbacks | 3 ans | Intérêt légitime (qualité) |
| Logs système | 6 mois | Obligation légale (sécurité) |
| Factures | 10 ans | Obligation légale (comptabilité) |

**Purge automatique** : Cron hebdomadaire (dimanche 5h UTC)

```bash
# Script : /opt/qadhya/gdpr-purge.sh
psql -U moncabinet -d qadhya -c "
  DELETE FROM conversations WHERE created_at < NOW() - INTERVAL '2 years';
  DELETE FROM rag_feedback WHERE created_at < NOW() - INTERVAL '3 years';
  DELETE FROM ai_usage_logs WHERE created_at < NOW() - INTERVAL '6 months';
"
```

---

## 9. Troubleshooting

### 9.1 Problèmes Fréquents

#### Erreur : "Service Ollama indisponible"

**Symptômes** :
- Mode Rapide échoue systématiquement
- Logs : `"Ollama request failed: connect ECONNREFUSED"`

**Diagnostic** :
```bash
systemctl status ollama
curl http://host.docker.internal:11434/api/version
```

**Solutions** :
1. **Ollama down** : `systemctl restart ollama`
2. **Port bloqué** : Vérifier UFW `ufw status | grep 11434`
3. **Container isolation** : Vérifier `extra_hosts` dans docker-compose.prod.yml

#### Erreur : "Database connection pool exhausted"

**Symptômes** :
- Requêtes lentes ou timeout
- Logs : `"Error: remaining connection slots are reserved"`

**Diagnostic** :
```sql
SELECT count(*) FROM pg_stat_activity;
SELECT max_connections FROM pg_settings;
```

**Solutions** :
1. **Augmenter pool** : `.env` → `DATABASE_POOL_SIZE=20` (défaut 10)
2. **Tuning PostgreSQL** : `max_connections=100` dans `postgresql.conf`
3. **Tuer connexions idle** :
   ```sql
   SELECT pg_terminate_backend(pid) FROM pg_stat_activity
   WHERE state = 'idle' AND state_change < NOW() - INTERVAL '10 minutes';
   ```

#### Erreur : "Indexation bloquée (0 docs/heure)"

**Symptômes** :
- Cron indexation runs mais 0 docs indexés
- Logs : `"No documents to index"`

**Diagnostic** :
```sql
-- Vérifier jobs orphelins
SELECT * FROM indexing_jobs WHERE status = 'running' AND started_at < NOW() - INTERVAL '10 minutes';

-- Vérifier docs en attente
SELECT COUNT(*) FROM knowledge_base WHERE is_indexed = false;
```

**Solutions** :
1. **Jobs orphelins** : Marquer failed manuellement
   ```sql
   UPDATE indexing_jobs SET status = 'failed', error = 'Timeout (orphaned)'
   WHERE status = 'running' AND started_at < NOW() - INTERVAL '10 minutes';
   ```
2. **Re-déclencher** : `curl -X POST https://qadhya.tn/api/admin/index-kb`

### 9.2 Logs Système

#### Accéder aux Logs

```bash
# Logs Next.js (app)
docker logs -f qadhya-nextjs --tail 100

# Logs PostgreSQL
docker logs -f qadhya-postgres --tail 50

# Logs Ollama
journalctl -u ollama -f

# Logs Nginx
tail -f /var/log/nginx/access.log
tail -f /var/log/nginx/error.log

# Logs indexation KB
tail -f /var/log/kb-indexing.log
```

#### Filtrer Erreurs Critiques

```bash
# Erreurs Next.js (dernières 24h)
docker logs qadhya-nextjs --since 24h | grep -i "error"

# Timeouts PostgreSQL
docker logs qadhya-postgres --since 24h | grep -i "timeout"

# Fallback LLM (échecs Ollama)
docker logs qadhya-nextjs --since 1h | grep "LLM-Fallback"
```

---

## 10. Maintenance

### 10.1 Checklist Hebdomadaire

- [ ] **Vérifier métriques dashboard** (latency, error rate, coût)
- [ ] **Valider 50 docs KB** (quality review queue)
- [ ] **Analyser feedbacks négatifs** (rating ≤2 étoiles)
- [ ] **Vérifier sauvegardes** (PostgreSQL, MinIO)
- [ ] **Purger cache Redis** si hit rate <50%
- [ ] **Reindex PostgreSQL** : `VACUUM ANALYZE VERBOSE;`
- [ ] **Vérifier espace disque** : `df -h | grep /opt/qadhya`

### 10.2 Checklist Mensuelle

- [ ] **Audit sécurité** : Vérifier `audit_logs` pour actions suspectes
- [ ] **Update packages NPM** : `npm outdated` → Upgrade mineur
- [ ] **Mise à jour Ollama** : `ollama pull qwen2.5:3b` + `qwen3-embedding:0.6b`
- [ ] **Analyse coûts LLM** : Dashboard provider usage → Optimiser fallback chain
- [ ] **Test restauration backup** : Valider 1 backup PostgreSQL au hasard
- [ ] **Nettoyage Docker** : `docker system prune -a` (images/containers inutilisés)
- [ ] **Rapport mensuel direction** : Export métriques qualité + coûts

### 10.3 Updates Production

#### Déploiement sans Downtime (Rolling Update)

**⚠️ Prérequis** : 2+ instances Next.js (load balancer Nginx)

```bash
# 1. Build nouvelle version
git pull origin main
npm run build

# 2. Tag Docker
docker build -t qadhya:v1.2.0 .
docker tag qadhya:v1.2.0 qadhya:latest

# 3. Update instance 1
docker stop qadhya-nextjs-1
docker rm qadhya-nextjs-1
docker-compose up -d qadhya-nextjs-1

# 4. Health check instance 1
curl https://qadhya.tn/api/health

# 5. Si OK, update instance 2
docker stop qadhya-nextjs-2
docker rm qadhya-nextjs-2
docker-compose up -d qadhya-nextjs-2
```

#### Maintenance Planifiée (Page Maintenance)

```bash
# Activer page maintenance
npm run maintenance:setup

# Arrêter containers
docker-compose -f docker-compose.prod.yml down

# Effectuer maintenance (migrations DB, updates, etc.)
# ...

# Redémarrer
docker-compose -f docker-compose.prod.yml up -d

# Désactiver page maintenance (automatique dès que Next.js répond)
```

**Communication** : Email 48h avant maintenance (date/heure/durée estimée)

---

## 📞 Support Niveau 3

**Escalade si** :
- Erreur non documentée dans ce guide
- Corruption base de données
- Faille sécurité détectée
- Incident majeur (>30min downtime)

**Contact** :
- **Email** : devops@qadhya.tn
- **Téléphone urgence** : +216 XX XXX XXX (disponible 24/7)
- **Slack** : #qadhya-ops (réponse <30min)

---

**Version** : 1.0
**Dernière mise à jour** : 11 Février 2026
**Auteur** : Équipe Qadhya DevOps
**Licence** : Usage interne administrateurs uniquement
