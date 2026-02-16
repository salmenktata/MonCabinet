# Nettoyage des Contenus Corrompus dans la Base de Connaissances

## 📋 Table des Matières

1. [Vue d'ensemble](#vue-densemble)
2. [Problème identifié](#problème-identifié)
3. [Solution](#solution)
4. [Scripts disponibles](#scripts-disponibles)
5. [Guide d'utilisation](#guide-dutilisation)
6. [Configuration du cron](#configuration-du-cron)
7. [Monitoring et alertes](#monitoring-et-alertes)

---

## Vue d'ensemble

### Contexte

La Base de Connaissances (KB) Qadhya contient actuellement **~25,000 chunks** provenant de **~2,958 documents** actifs. L'analyse a révélé que **63 chunks** contiennent des caractères invalides ou du texte corrompu, affectant la qualité du RAG (Retrieval-Augmented Generation).

### Impact

Les contenus corrompus ont plusieurs effets négatifs :

- ❌ **Pollution du RAG** : Résultats de recherche non pertinents
- ❌ **Dégradation de la qualité** : Scores de similarité faussés
- ❌ **Réponses erronées** : L'assistant IA retourne des textes illisibles
- ❌ **Gaspillage de ressources** : Embeddings générés pour du contenu inutilisable

### Objectif

Mettre en place un système automatisé de :

1. **Détection** des contenus corrompus
2. **Nettoyage** des documents affectés
3. **Réindexation** avec extraction améliorée
4. **Monitoring** continu pour prévenir les régressions

---

## Problème identifié

### Types de corruption détectés

#### 1. PDFs mal encodés (principale cause)

**Exemple** : Constitution tunisienne (`دستور الجمهورية التونسية.pdf`)

```
]D- P@V ([B 75 Imprimerie Officielle de la République Tunisienne…çj‰\u0081 < < íéŠÞçjÖ]<íè…çãÛ¢]
```

**Cause** : Extraction de texte depuis PDFs scannés sans OCR, ou encodage UTF-8 mal géré.

#### 2. Documents Word corrompus

**Exemple** : Fichiers `.doc` avec caractères de contrôle

```
علي الوضعية محل النزاع. \x00\x00من ناحية ثانية فالقاضي...
```

**Cause** : Format `.doc` (ancien) mal converti, métadonnées binaires incluses.

#### 3. Fichiers hors sujet

**Exemple** : Fichier MSI installer

```
cuting op: RegAddValue(Name=RuntimeVersion,Value=v4.0.30319,) MSI (s) (DC:68)...
```

**Cause** : Upload manuel de fichiers non juridiques.

### Statistiques actuelles

```sql
-- Résultats de l'analyse (Feb 16, 2026)
Total chunks:              25,249
Chunks corrompus:              63  (0.25%)
Documents affectés:           ~30  (1.0%)

Répartition par type :
- invalid_chars:              63  (caractères invalides)
- too_short:                   2  (< 50 caractères)
- empty:                       0  (vides)
```

### Exemples de documents corrompus

| Document | Catégorie | Chunks corrompus | Ratio |
|----------|-----------|------------------|-------|
| `دستور الجمهورية التونسية.pdf` | constitution | 8/12 | 67% |
| `decret pdf.pdf` | legislation | 3/5 | 60% |
| `memoire.doc` | autre | 2/8 | 25% |
| `ali.doc` | autre | 1/10 | 10% |

---

## Solution

### Architecture de la solution

```
┌─────────────────────────────────────────────────────────────┐
│                    Cron Quotidien (2h)                      │
│         scripts/cron-cleanup-corrupted-kb.sh                │
└────────────────────┬────────────────────────────────────────┘
                     │
         ┌───────────┴───────────┐
         │                       │
         ▼                       ▼
┌─────────────────┐     ┌─────────────────┐
│  1. Détection   │     │  2. Nettoyage   │
│  cleanup-       │────>│  Suppression    │
│  corrupted-kb   │     │  chunks + flag  │
└─────────────────┘     └────────┬────────┘
                                 │
                                 ▼
                        ┌─────────────────┐
                        │ 3. Réindexation │
                        │  reindex-kb-    │
                        │  improved       │
                        └────────┬────────┘
                                 │
                                 ▼
                        ┌─────────────────┐
                        │  4. Alertes     │
                        │  Email si >10   │
                        │  docs nettoyés  │
                        └─────────────────┘
```

### Workflow détaillé

#### Phase 1 : Détection

1. **Scan des chunks** : Regex pour détecter caractères invalides
2. **Calcul du ratio** : `chunks_corrompus / total_chunks` par document
3. **Classification** : Documents avec ratio ≥ 50% marqués pour nettoyage

#### Phase 2 : Nettoyage

1. **Suppression chunks** : DELETE CASCADE dans `knowledge_base_chunks`
2. **Flag document** : `is_indexed = false`, `chunk_count = 0`
3. **Traçabilité** : Ajout note dans `pipeline_notes` avec timestamp

#### Phase 3 : Réindexation

1. **Nettoyage texte** : Suppression caractères de contrôle, normalisation espaces
2. **Validation** : Score qualité calculé (longueur, ratio caractères invalides, mots)
3. **Génération chunks** : 1000 chars, overlap 200
4. **Embeddings** : Ollama pour indexation gratuite
5. **Insertion DB** : Nouveaux chunks propres avec embeddings

#### Phase 4 : Monitoring

1. **Rapport** : Statistiques par catégorie, documents nettoyés
2. **Alerte email** : Si ≥10 documents nettoyés (détection problème systémique)
3. **Logs** : `/var/log/qadhya/kb-cleanup.log` pour audit

---

## Scripts disponibles

### 1. `cleanup-corrupted-kb.ts`

**But** : Identifier et nettoyer les documents corrompus

**Usage** :

```bash
# Mode dry-run (simulation, aucune modification)
npx tsx scripts/cleanup-corrupted-kb.ts --dry-run

# Nettoyage réel (ratio corruption ≥ 50%)
npx tsx scripts/cleanup-corrupted-kb.ts

# Nettoyage avec ratio personnalisé (≥ 30%)
npx tsx scripts/cleanup-corrupted-kb.ts --min-ratio=0.3

# Nettoyage d'une catégorie spécifique
npx tsx scripts/cleanup-corrupted-kb.ts --category=constitution
```

**Options** :

- `--dry-run` : Simulation, aucune modification
- `--min-ratio=<0.0-1.0>` : Ratio minimum de corruption (défaut: 0.5)
- `--category=<category>` : Filtrer par catégorie

**Sortie** :

```
🚀 Nettoyage des contenus corrompus de la Base de Connaissances

Configuration:
   - Mode: PRODUCTION (nettoyage réel)
   - Ratio minimum de corruption: 50%
   - Catégorie filtrée: toutes

🔍 Identification des chunks corrompus...
✅ 63 chunks corrompus identifiés

📊 Analyse des documents corrompus...
✅ 30 documents avec corruption identifiés

🧹 Nettoyage des documents corrompus...
📋 15 documents à nettoyer (ratio >= 50%)

================================================================================
📄 دستور الجمهورية التونسية.pdf
   Catégorie: constitution
   Fichier: documents/constitution/دستور.pdf
   Chunks corrompus: 8/12 (66.7%)
   Problèmes: invalid_chars
   ✅ Nettoyé avec succès

[... autres documents ...]

📊 RAPPORT DE NETTOYAGE
================================================================================

📈 Statistiques globales:
   - Total documents analysés avec corruption: 30
   - Documents nettoyés: 15
   - Documents restants avec corruption mineure: 15

📁 Répartition par catégorie des documents nettoyés:
   - constitution: 8 documents
   - legislation: 4 documents
   - autre: 3 documents

🔄 Prochaines étapes recommandées:
   1. Vérifier les sources des documents nettoyés
   2. Améliorer l'extraction de texte (OCR pour PDFs scannés)
   3. Réindexer les documents avec de meilleurs extracteurs
   4. Exécuter: npx tsx scripts/reindex-kb-improved.ts

✅ Nettoyage terminé avec succès
```

---

### 2. `reindex-kb-improved.ts`

**But** : Réindexer les documents avec extraction améliorée

**Usage** :

```bash
# Réindexer tous les documents non indexés
npx tsx scripts/reindex-kb-improved.ts

# Réindexer par batch de 5 documents
npx tsx scripts/reindex-kb-improved.ts --batch-size=5

# Réindexer une catégorie spécifique
npx tsx scripts/reindex-kb-improved.ts --category=constitution
```

**Options** :

- `--batch-size=<N>` : Nombre de documents par batch (défaut: 10)
- `--category=<category>` : Filtrer par catégorie

**Améliorations implémentées** :

1. **Nettoyage intelligent** :
   - Suppression caractères de contrôle (`\x00-\x1F`)
   - Remplacement caractères de remplacement Unicode (`\uFFFD`)
   - Normalisation espaces multiples
   - Trim lignes individuelles

2. **Validation qualité** :
   - Longueur minimum : 100 caractères
   - Ratio caractères invalides : < 10%
   - Nombre mots significatifs : ≥ 10
   - Score qualité : 0-100 (seuil validation: 50)

3. **Traçabilité** :
   - Note ajoutée dans `pipeline_notes` avec timestamp et score qualité
   - Logs détaillés pour chaque document

**Sortie** :

```
🚀 Réindexation améliorée de la Base de Connaissances

Configuration:
   - Taille de batch: 5
   - Catégorie: toutes

🔍 Récupération des documents à réindexer...
📋 15 documents à réindexer

================================================================================
📦 Batch 1/3 (5 documents)
================================================================================

📄 دستور الجمهورية التونسية.pdf (constitution)
   Fichier: documents/constitution/دستور.pdf
   Taille texte: 25847 caractères
   ✅ Succès - 26 chunks créés (qualité: 85/100)

[... autres documents ...]

📊 RAPPORT DE RÉINDEXATION
================================================================================

✅ Succès: 14/15 (93.3%)
❌ Échecs: 1/15 (6.7%)
📦 Total chunks créés: 342
📈 Moyenne chunks/doc: 24.4
```

---

### 3. `cron-cleanup-corrupted-kb.sh`

**But** : Cron quotidien automatisé (orchestrateur)

**Fonctionnalités** :

1. Exécute `cleanup-corrupted-kb.ts` avec ratio 50%
2. Si documents nettoyés > 0, lance `reindex-kb-improved.ts`
3. Si documents nettoyés ≥ 10, envoie alerte email
4. Logs centralisés dans `/var/log/qadhya/kb-cleanup.log`
5. Intégration avec le système de monitoring crons

**Variables d'environnement** :

```bash
# Configuration
MIN_CORRUPTION_RATIO=0.5      # Ratio minimum (défaut: 50%)
ALERT_THRESHOLD=10            # Seuil alerte email (défaut: 10 docs)
LOG_FILE=/var/log/qadhya/kb-cleanup.log

# API (pour alertes email)
CRON_API_BASE=https://qadhya.tn
CRON_SECRET=<secret>
```

**Exécution manuelle** :

```bash
# Sur le serveur de production
bash /opt/qadhya/scripts/cron-cleanup-corrupted-kb.sh

# Avec configuration personnalisée
MIN_CORRUPTION_RATIO=0.3 bash /opt/qadhya/scripts/cron-cleanup-corrupted-kb.sh
```

---

## Guide d'utilisation

### Scénario 1 : Nettoyage ponctuel (première fois)

```bash
# 1. Analyser la situation (mode dry-run)
npx tsx scripts/cleanup-corrupted-kb.ts --dry-run

# 2. Si OK, lancer le nettoyage réel
npx tsx scripts/cleanup-corrupted-kb.ts

# 3. Réindexer immédiatement
npx tsx scripts/reindex-kb-improved.ts --batch-size=5

# 4. Vérifier les résultats
psql -U moncabinet -d qadhya -c "
  SELECT
    COUNT(*) FILTER (WHERE is_indexed = true) as indexed,
    COUNT(*) FILTER (WHERE is_indexed = false) as not_indexed,
    SUM(chunk_count) as total_chunks
  FROM knowledge_base
  WHERE is_active = true;
"
```

### Scénario 2 : Nettoyage ciblé par catégorie

```bash
# Problème identifié dans la catégorie "constitution"
npx tsx scripts/cleanup-corrupted-kb.ts \
  --category=constitution \
  --min-ratio=0.3

# Réindexer uniquement cette catégorie
npx tsx scripts/reindex-kb-improved.ts --category=constitution
```

### Scénario 3 : Diagnostic avant nettoyage

```bash
# Identifier les documents problématiques sans nettoyer
npx tsx scripts/cleanup-corrupted-kb.ts --dry-run > rapport.txt

# Analyser le rapport
cat rapport.txt | grep "📄" | head -20

# Décider du ratio approprié
# Exemple : si beaucoup de docs avec 30-49% corruption
npx tsx scripts/cleanup-corrupted-kb.ts --min-ratio=0.3
```

### Scénario 4 : Production - Déploiement du cron

```bash
# 1. Installer le cron sur le serveur
ssh root@84.247.165.187 << 'EOF'
  cd /opt/qadhya
  bash scripts/setup-kb-cleanup-cron.sh
EOF

# 2. Vérifier l'installation
ssh root@84.247.165.187 "crontab -l | grep cleanup-corrupted-kb"

# 3. Tester manuellement
ssh root@84.247.165.187 "bash /opt/qadhya/scripts/cron-cleanup-corrupted-kb.sh"

# 4. Suivre les logs
ssh root@84.247.165.187 "tail -f /var/log/qadhya/kb-cleanup.log"
```

---

## Configuration du cron

### Installation automatique

```bash
# Depuis le repository local
bash scripts/setup-kb-cleanup-cron.sh

# Ou depuis SSH
ssh root@84.247.165.187 'bash -s' < scripts/setup-kb-cleanup-cron.sh
```

### Installation manuelle

```bash
# 1. Se connecter au serveur
ssh root@84.247.165.187

# 2. Éditer la crontab
crontab -e

# 3. Ajouter la ligne suivante (2h du matin quotidien)
0 2 * * * /opt/qadhya/scripts/cron-cleanup-corrupted-kb.sh

# 4. Vérifier
crontab -l | grep cleanup
```

### Planification recommandée

| Environnement | Fréquence | Horaire | Raison |
|---------------|-----------|---------|--------|
| **Production** | Quotidien | 2h | Faible charge serveur |
| **Staging** | Hebdomadaire | Dimanche 3h | Tests avant prod |
| **Dev** | Manuel | N/A | À la demande |

### Ajustement de la fréquence

```bash
# Quotidien à 2h (recommandé)
0 2 * * * /opt/qadhya/scripts/cron-cleanup-corrupted-kb.sh

# Hebdomadaire (dimanche à 3h)
0 3 * * 0 /opt/qadhya/scripts/cron-cleanup-corrupted-kb.sh

# Bi-quotidien (2h et 14h)
0 2,14 * * * /opt/qadhya/scripts/cron-cleanup-corrupted-kb.sh

# Mensuel (1er du mois à 2h)
0 2 1 * * /opt/qadhya/scripts/cron-cleanup-corrupted-kb.sh
```

---

## Monitoring et alertes

### Dashboard KB

**URL** : https://qadhya.tn/super-admin/knowledge-base

**Indicateurs clés** :

- Total documents actifs
- Documents indexés vs non indexés
- Chunks totaux
- Documents avec qualité `quality_score < 60`

### Logs cron

**Localisation** : `/var/log/qadhya/kb-cleanup.log`

**Commandes utiles** :

```bash
# Suivre en temps réel
tail -f /var/log/qadhya/kb-cleanup.log

# Dernières 50 lignes
tail -50 /var/log/qadhya/kb-cleanup.log

# Filtrer les erreurs
grep "❌" /var/log/qadhya/kb-cleanup.log

# Rechercher une date spécifique
grep "2026-02-16" /var/log/qadhya/kb-cleanup.log

# Compter les documents nettoyés cette semaine
grep "Documents nettoyés:" /var/log/qadhya/kb-cleanup.log | tail -7
```

### Alertes email

**Configuration** : Variables d'environnement

```bash
# Dans /opt/qadhya/.env.production.local
ALERT_EMAIL=admin@qadhya.tn
CRON_API_BASE=https://qadhya.tn
CRON_SECRET=<secret>
```

**Déclenchement** :

- ✅ **Seuil atteint** : ≥10 documents nettoyés en une exécution
- ✅ **Échec du script** : Erreur lors du nettoyage ou réindexation
- ✅ **Cooldown** : 6h entre deux emails (anti-spam)

**Format email** :

```
Sujet : ⚠️ KB Cleanup Alert: 15 documents nettoyés

Le nettoyage quotidien de la KB a détecté et nettoyé 15 documents corrompus.

Configuration :
- Ratio minimum de corruption : 0.5
- Seuil d'alerte : 10

Action recommandée :
Vérifier les sources de données et améliorer l'extraction de texte.

Logs complets : /var/log/qadhya/kb-cleanup.log

Dashboard : https://qadhya.tn/super-admin/knowledge-base
```

### Monitoring crons (Dashboard)

**URL** : https://qadhya.tn/super-admin/monitoring?tab=crons

**Métriques trackées** :

- Dernière exécution : `cleanup-corrupted-kb`
- Durée moyenne
- Taux de succès / échec
- Nombre de documents nettoyés (timeline 7 jours)

### Requêtes SQL utiles

```sql
-- Statistiques corruption actuelles
SELECT
  COUNT(*) FILTER (WHERE is_indexed = false) as non_indexed,
  COUNT(*) FILTER (WHERE chunk_count = 0) as no_chunks,
  COUNT(*) FILTER (WHERE quality_score < 60) as low_quality
FROM knowledge_base
WHERE is_active = true;

-- Documents nettoyés aujourd'hui
SELECT id, title, category, pipeline_notes
FROM knowledge_base
WHERE pipeline_notes LIKE '%Marqué comme non indexé le%'
AND updated_at::date = CURRENT_DATE;

-- Top 10 catégories avec plus de corruption
SELECT
  category,
  COUNT(*) as total_docs,
  COUNT(*) FILTER (WHERE is_indexed = false) as not_indexed,
  ROUND(100.0 * COUNT(*) FILTER (WHERE is_indexed = false) / COUNT(*), 1) as pct_not_indexed
FROM knowledge_base
WHERE is_active = true
GROUP BY category
ORDER BY pct_not_indexed DESC
LIMIT 10;

-- Historique nettoyages (via pipeline_notes)
SELECT
  DATE(updated_at) as date,
  COUNT(*) as docs_cleaned
FROM knowledge_base
WHERE pipeline_notes LIKE '%Marqué comme non indexé le%'
GROUP BY DATE(updated_at)
ORDER BY date DESC
LIMIT 30;
```

---

## Améliorations futures

### Court terme (Sprint actuel)

- [ ] Ajouter support OCR pour PDFs scannés (Tesseract.js)
- [ ] Améliorer détection encodage documents arabes
- [ ] Créer un endpoint API pour déclencher nettoyage manuellement
- [ ] Ajouter métriques Prometheus pour monitoring temps réel

### Moyen terme (1-2 mois)

- [ ] Implémenter validation pré-upload (rejeter fichiers corrompus)
- [ ] Créer un workflow de review pour documents avec score qualité 50-70
- [ ] Développer des extracteurs spécialisés par type de document
- [ ] Ajouter un système de quarantaine pour documents suspects

### Long terme (3-6 mois)

- [ ] Machine Learning pour détecter patterns de corruption
- [ ] Auto-healing : tentatives multiples d'extraction avec différents outils
- [ ] Intégration avec services OCR cloud (Google Vision, AWS Textract)
- [ ] Dashboard analytique dédié à la qualité KB

---

## FAQ

### Q1 : Que se passe-t-il si un document est mal nettoyé ?

**R** : Le document est marqué `is_indexed = false` avec une note dans `pipeline_notes`. Il peut être réindexé à tout moment avec :

```bash
# Forcer réindexation d'un document spécifique
psql -U moncabinet -d qadhya -c "
  UPDATE knowledge_base
  SET is_indexed = false
  WHERE id = '<uuid-du-document>';
"

npx tsx scripts/reindex-kb-improved.ts
```

### Q2 : Le nettoyage supprime-t-il les fichiers sources ?

**R** : **Non**, seuls les chunks en base de données sont supprimés. Les fichiers dans MinIO (`source_file`) sont **préservés** pour permettre la réindexation.

### Q3 : Comment ajuster le seuil de corruption ?

**R** : Modifier la variable `MIN_CORRUPTION_RATIO` dans le cron :

```bash
# Éditer le cron
crontab -e

# Modifier la ligne
0 2 * * * MIN_CORRUPTION_RATIO=0.3 /opt/qadhya/scripts/cron-cleanup-corrupted-kb.sh
```

Ou dans le script directement :

```bash
# /opt/qadhya/scripts/cron-cleanup-corrupted-kb.sh
MIN_CORRUPTION_RATIO="${MIN_CORRUPTION_RATIO:-0.3}"  # Défaut 30% au lieu de 50%
```

### Q4 : Comment désactiver les alertes email ?

**R** : Deux options :

1. **Augmenter le seuil** : `ALERT_THRESHOLD=999`
2. **Supprimer la variable** : `unset ALERT_EMAIL` dans le cron

### Q5 : Le cron ralentit-il le serveur ?

**R** : Non, le cron est optimisé :

- **Batch processing** : 5-10 documents à la fois
- **Délais entre batches** : 2 secondes
- **Exécution nocturne** : 2h (charge minimale)
- **Timeout global** : 30 minutes max

### Q6 : Comment vérifier l'impact du nettoyage sur le RAG ?

**R** : Tester avant/après avec l'endpoint de benchmark :

```bash
# Avant nettoyage
curl -X POST https://qadhya.tn/api/admin/rag-eval \
  -H "Authorization: Bearer <token>" \
  > before.json

# Après nettoyage + réindexation
curl -X POST https://qadhya.tn/api/admin/rag-eval \
  -H "Authorization: Bearer <token>" \
  > after.json

# Comparer hit@5 et avgTopScore
diff <(jq '.hit_at_5, .avg_top_score' before.json) \
     <(jq '.hit_at_5, .avg_top_score' after.json)
```

---

## Ressources

### Scripts

- `scripts/cleanup-corrupted-kb.ts` - Détection et nettoyage
- `scripts/reindex-kb-improved.ts` - Réindexation améliorée
- `scripts/cron-cleanup-corrupted-kb.sh` - Cron quotidien
- `scripts/setup-kb-cleanup-cron.sh` - Installation cron

### Documentation

- `docs/KB_CLEANUP_CORRUPTED_CONTENT.md` - Ce document
- `docs/RAG_QUALITY_IMPROVEMENTS.md` - Améliorations RAG globales
- `docs/CRON_MONITORING.md` - Système monitoring crons

### APIs

- `POST /api/admin/alerts/send` - Envoyer une alerte email
- `GET /api/admin/monitoring/metrics` - Métriques KB en temps réel
- `POST /api/admin/rag-eval` - Benchmark qualité RAG

### Dashboards

- https://qadhya.tn/super-admin/knowledge-base - Gestion KB
- https://qadhya.tn/super-admin/monitoring?tab=crons - Monitoring crons
- https://qadhya.tn/super-admin/monitoring?tab=kb-quality - Qualité KB

---

**Dernière mise à jour** : 16 février 2026
**Version** : 1.0
**Auteur** : Équipe Qadhya
