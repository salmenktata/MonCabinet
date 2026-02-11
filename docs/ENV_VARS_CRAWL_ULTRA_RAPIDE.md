# Variables d'Environnement - Crawl Ultra-Rapide

Variables à ajouter dans `.env.production` pour activer le mode crawl ultra-rapide.

---

## 🚀 Crawling - Multi-Browser Pool

```bash
# Nombre maximum de browsers Playwright en parallèle
# Recommandation : 1 browser par CPU (VPS 4 CPUs = 4 browsers)
# Valeur par défaut : 4
BROWSER_POOL_MAX_BROWSERS=4

# Durée de vie max d'un browser avant recyclage (en ms)
# Recommandation : 3 min pour éviter memory leaks
# Valeur par défaut : 180000 (3 minutes)
BROWSER_POOL_MAX_AGE_MS=180000

# Nombre max d'utilisations d'un browser avant recyclage
# Recommandation : 100 pages par browser
# Valeur par défaut : 100
BROWSER_POOL_MAX_USE=100
```

---

## ⚡ Crawling - Concurrency Adaptative

```bash
# Concurrency pour fetch statique (articles SSR)
# Recommandation : 40 pour VPS 4 CPUs
# Valeur par défaut : 40
CRAWLER_CONCURRENCY_STATIC=40

# Concurrency pour Playwright (pages dynamiques)
# Recommandation : = BROWSER_POOL_MAX_BROWSERS
# Valeur par défaut : 4
CRAWLER_CONCURRENCY_DYNAMIC=4

# Concurrency legacy (utilisé si mode non détecté)
# Valeur par défaut : 15
CRAWLER_CONCURRENCY=15

# Rate limiting entre requêtes (en ms)
# Recommandation : 100ms pour crawl rapide, 500ms si ban détecté
# Valeur par défaut : 100
CRAWLER_RATE_LIMIT_MS=100

# Timeout global par page (en ms)
# Recommandation : 60s pour crawl rapide, 120s pour sites lents
# Valeur par défaut : 60000 (1 minute)
CRAWLER_TIMEOUT_MS=60000
```

---

## 🧠 Indexation - Mode Turbo OpenAI

```bash
# Activer le mode Turbo avec OpenAI embeddings
# Recommandation : true pour crawl 10K+ pages
# Valeur par défaut : false
EMBEDDING_TURBO_MODE=true

# API Key OpenAI (requis si EMBEDDING_TURBO_MODE=true)
# Obtenir sur https://platform.openai.com/api-keys
OPENAI_API_KEY=sk-proj-...

# Concurrency pour indexation web parallèle
# Recommandation : 5 pour OpenAI (rate limits OK)
# Valeur par défaut : 1
WEB_INDEXING_CONCURRENCY=5

# Batch size pour embeddings en mode Turbo
# Recommandation : 10 documents par batch
# Valeur par défaut : 2
KB_BATCH_SIZE_TURBO=10
```

---

## 🛡️ Sécurité & Circuit Breakers

```bash
# Seuil mémoire pour backpressure (en %)
# Recommandation : 80% pour éviter OOM
# Valeur par défaut : 80
INDEXING_MEMORY_THRESHOLD_PERCENT=80

# TTL pour jobs orphelins (en minutes)
# Recommandation : 15 min (détection crash rapide)
# Valeur par défaut : 15
INDEXING_JOB_TTL_MINUTES=15

# Activer streaming PDF (réduit RAM peak)
# Recommandation : true toujours
# Valeur par défaut : true
USE_STREAMING_PDF=true
```

---

## 📊 Monitoring & Logs

```bash
# Log progression tous les N pages
# Recommandation : 25 pour feedback fréquent
# Valeur par défaut : 25
PROGRESS_LOG_INTERVAL=25

# Max erreurs gardées en mémoire
# Recommandation : 200 (évite memory bloat)
# Valeur par défaut : 200
MAX_ERRORS_KEPT=200

# Arrêter crawl après N échecs consécutifs
# Recommandation : 20 (détection ban/crash)
# Valeur par défaut : 20
MAX_CONSECUTIVE_FAILURES=20
```

---

## 🔧 Configuration Recommandée par Scénario

### Scénario 1 : Crawl Ultra-Rapide 9anoun.tn (10K pages, 2-4h)

```bash
# Multi-browser pool
BROWSER_POOL_MAX_BROWSERS=4
BROWSER_POOL_MAX_AGE_MS=180000
BROWSER_POOL_MAX_USE=100

# Concurrency adaptative
CRAWLER_CONCURRENCY_STATIC=40
CRAWLER_CONCURRENCY_DYNAMIC=4
CRAWLER_RATE_LIMIT_MS=100
CRAWLER_TIMEOUT_MS=60000

# Indexation Turbo OpenAI
EMBEDDING_TURBO_MODE=true
OPENAI_API_KEY=sk-proj-...
WEB_INDEXING_CONCURRENCY=5
KB_BATCH_SIZE_TURBO=10

# Circuit breakers
INDEXING_MEMORY_THRESHOLD_PERCENT=80
USE_STREAMING_PDF=true
```

**Résultat attendu** : 10K pages en 2-4h

---

### Scénario 2 : Crawl Conservateur (Éviter Ban)

```bash
# Mono-browser
BROWSER_POOL_MAX_BROWSERS=1
BROWSER_POOL_MAX_AGE_MS=300000
BROWSER_POOL_MAX_USE=50

# Concurrency réduite
CRAWLER_CONCURRENCY_STATIC=10
CRAWLER_CONCURRENCY_DYNAMIC=1
CRAWLER_RATE_LIMIT_MS=1000
CRAWLER_TIMEOUT_MS=120000

# Indexation Ollama local
EMBEDDING_TURBO_MODE=false
WEB_INDEXING_CONCURRENCY=1

# Circuit breakers stricts
INDEXING_MEMORY_THRESHOLD_PERCENT=70
MAX_CONSECUTIVE_FAILURES=10
```

**Résultat attendu** : Pas de ban, mais crawl lent (~40h pour 10K pages)

---

### Scénario 3 : Crawl Hybride (Balance Vitesse/Sécurité)

```bash
# Multi-browser modéré
BROWSER_POOL_MAX_BROWSERS=2
BROWSER_POOL_MAX_AGE_MS=240000
BROWSER_POOL_MAX_USE=75

# Concurrency moyenne
CRAWLER_CONCURRENCY_STATIC=20
CRAWLER_CONCURRENCY_DYNAMIC=2
CRAWLER_RATE_LIMIT_MS=500
CRAWLER_TIMEOUT_MS=90000

# Indexation Turbo
EMBEDDING_TURBO_MODE=true
OPENAI_API_KEY=sk-proj-...
WEB_INDEXING_CONCURRENCY=3
KB_BATCH_SIZE_TURBO=5

# Circuit breakers standard
INDEXING_MEMORY_THRESHOLD_PERCENT=80
MAX_CONSECUTIVE_FAILURES=15
```

**Résultat attendu** : ~6-8h pour 10K pages, risque ban faible

---

## 🧪 Tests de Configuration

### Test 1 : Vérifier Variables Chargées

```bash
# Lancer Next.js et vérifier logs au démarrage
npm run dev

# Chercher dans logs :
# [Crawler] Mode: static (fetch ultra-rapide), Concurrency: 40
# [BrowserPool] Nouveau browser créé (slot 0)
```

### Test 2 : Monitorer RAM/CPU en Temps Réel

```bash
# Pendant crawl actif
docker stats qadhya-nextjs

# Vérifier :
# - RAM < 6GB (avec 4 browsers)
# - CPU < 400% (4 CPUs × 100%)
```

### Test 3 : Vérifier Throughput

```bash
# Logs crawler en live
tail -f /var/log/crawler.log | grep "pages/min"

# Objectif :
# - Mode static : >100 pages/min
# - Mode dynamic : >15 pages/min
# - Mixte : >40 pages/min
```

---

## ⚠️ Avertissements

### 1. OpenAI API Costs

**Mode Turbo OpenAI** :
- Coût : ~$0.001 par page (embeddings)
- 10K pages = ~$10 USD
- Vérifier quotas avant de lancer : https://platform.openai.com/usage

### 2. Memory Limits

**4 browsers en parallèle** :
- RAM peak : ~4-6 GB
- Si VPS < 8GB RAM → Réduire à 2 browsers

### 3. Cloudflare Ban

**Rate limiting 100ms** :
- ~10 req/s par IP
- Si ban détecté → Augmenter à 500ms automatiquement
- Pause forcée 2h (circuit breaker)

### 4. Playwright Chrome

**Chromium RAM per browser** :
- ~800 MB - 1.5 GB par instance
- 4 browsers = ~4-6 GB total
- Recyclage automatique après 100 pages (BROWSER_POOL_MAX_USE)

---

## 📚 Références

- [Documentation Crawl Ultra-Rapide](./CRAWL_ULTRA_RAPIDE_9ANOUN.md)
- [Architecture Multi-Browser Pool](./MULTI_BROWSER_POOL.md)
- [OpenAI Embeddings API](https://platform.openai.com/docs/guides/embeddings)
- [Playwright Best Practices](https://playwright.dev/docs/best-practices)

---

**Date** : Février 11, 2026
**Version** : 1.0.0
