# Variables d'Environnement - Référence Complète

> 🤖 **Auto-généré** depuis `docs/env-schema.json` le 14 février 2026
>
> ⚠️ **Ne PAS éditer manuellement** - Modifier le schéma JSON à la place puis exécuter `npm run docs:env`

## Métadonnées

- **Version schéma**: 2.0.0
- **Dernière mise à jour**: 2026-02-15
- **Total variables**: 44

## Table des Matières

- [application](#application)
- [database](#database)
- [storage](#storage)
- [cache](#cache)
- [auth](#auth)
- [rag](#rag)
- [ai_providers](#ai_providers)
- [email](#email)
- [integrations](#integrations)
- [monitoring](#monitoring)
- [Règles de Validation](#règles-de-validation)
- [Historique Incidents](#historique-incidents)
- [Commandes Utiles](#commandes-utiles)

## application

Configuration application principale Next.js

| Variable | Type | Criticité | Dev | Prod | Description |
|----------|------|-----------|-----|------|-------------|
| `NODE_ENV` | enum | **CRITICAL** | `development` | `production` | Environnement d'exécution - Détermine providers IA activés |
| `PORT` | number | **MEDIUM** | `7002` | `3000` | Port HTTP du serveur Next.js |
| `NEXT_PUBLIC_APP_URL` | uri | **HIGH** | `http://localhost:7002` | `https://qadhya.tn` | URL publique de l'application (utilisée pour OAuth redirects) |
| `NEXT_PUBLIC_APP_NAME` | string | **LOW** | `Qadhya Dev` | `Qadhya` | Nom de l'application affiché dans l'UI |
| `NEXT_PUBLIC_APP_DOMAIN` | string | **MEDIUM** | `localhost` | `qadhya.tn` | Domaine principal (sans protocole) |

## database

Configuration PostgreSQL avec pgvector

| Variable | Type | Criticité | Dev | Prod | Description |
|----------|------|-----------|-----|------|-------------|
| `DATABASE_URL` | uri | **CRITICAL** | `postgresql://moncabinet:dev_password@localhost:5433/moncabinet` | `postgresql://moncabinet:STRONG_PASSWORD@postgres:5432/qadhya` | URL de connexion PostgreSQL complète |
| `DB_USER` | string | **CRITICAL** | `moncabinet` | `moncabinet` | Utilisateur PostgreSQL |
| `DB_PASSWORD` | secret | **CRITICAL** | `***` | `***` | Mot de passe PostgreSQL (32 chars minimum) |
| `DB_NAME` | string | **CRITICAL** | `moncabinet` | `qadhya` | Nom de la base de données |
| `DATABASE_SSL` | boolean | **MEDIUM** | `false` | `false` | Activer SSL pour PostgreSQL (false en Docker local) |

## storage

Configuration MinIO object storage

| Variable | Type | Criticité | Dev | Prod | Description |
|----------|------|-----------|-----|------|-------------|
| `MINIO_ENDPOINT` | string | **HIGH** | `localhost` | `minio` | Hostname MinIO (minio dans Docker, localhost sinon) |
| `MINIO_PORT` | number | **MEDIUM** | `9000` | `9000` | Port MinIO |
| `MINIO_USE_SSL` | boolean | **MEDIUM** | `false` | `false` | Utiliser SSL pour MinIO |
| `MINIO_ACCESS_KEY` | secret | **HIGH** | `***` | `***` | Access Key MinIO (16 chars minimum) |
| `MINIO_SECRET_KEY` | secret | **HIGH** | `***` | `***` | Secret Key MinIO (32 chars minimum) |
| `MINIO_BUCKET` | string | **MEDIUM** | `documents` | `documents` | Bucket par défaut pour documents |

## cache

Configuration Redis cache

| Variable | Type | Criticité | Dev | Prod | Description |
|----------|------|-----------|-----|------|-------------|
| `REDIS_URL` | uri | **HIGH** | `redis://localhost:6379` | `redis://redis:6379` | URL Redis (redis dans Docker, localhost sinon) |

## auth

Configuration NextAuth.js authentication

| Variable | Type | Criticité | Dev | Prod | Description |
|----------|------|-----------|-----|------|-------------|
| `NEXTAUTH_URL` | uri | **CRITICAL** | `http://localhost:7002` | `https://qadhya.tn` | URL de base pour NextAuth callbacks |
| `NEXTAUTH_SECRET` | secret | **CRITICAL** | `***` | `***` | Secret JWT NextAuth (généré avec openssl rand -base64 32) |

## rag

Configuration RAG et recherche sémantique

| Variable | Type | Criticité | Dev | Prod | Description |
|----------|------|-----------|-----|------|-------------|
| `RAG_ENABLED` | boolean | **CRITICAL** | `true` | `true` | Active système RAG - REQUIS pour Assistant IA fonctionnel |
| `OLLAMA_ENABLED` | boolean | **CRITICAL** | `true` | `true` | Embeddings locaux gratuits - REQUIS si RAG_ENABLED=true ET pas OPENAI_API_KEY |
| `OLLAMA_BASE_URL` | uri | **HIGH** | `http://localhost:11434` | `http://host.docker.internal:11434` | URL Ollama - ATTENTION contexte Docker (host.docker.internal, pas localhost) |
| `OLLAMA_EMBEDDING_MODEL` | string | **MEDIUM** | `qwen3-embedding:0.6b` | `qwen3-embedding:0.6b` | Modèle Ollama pour embeddings (1024 dimensions) |
| `RAG_CHUNK_SIZE` | number | **MEDIUM** | `1024` | `1024` | Taille chunks en tokens pour indexation |
| `RAG_CHUNK_OVERLAP` | number | **MEDIUM** | `100` | `100` | Overlap entre chunks pour contexte |
| `RAG_MAX_RESULTS` | number | **MEDIUM** | `5` | `5` | Nombre max de chunks retournés par recherche |
| `RAG_SIMILARITY_THRESHOLD` | number | **MEDIUM** | `0.7` | `0.7` | Seuil similarité cosine minimum (0-1) |

## ai_providers

Clés API providers IA (LLM + Embeddings)

| Variable | Type | Criticité | Dev | Prod | Description |
|----------|------|-----------|-----|------|-------------|
| `GROQ_API_KEY` | secret | **HIGH** | `***` | `***` | Groq API (LLM primaire production, ~292ms, gratuit tier) |
| `GROQ_MODEL` | string | **LOW** | `llama-3.3-70b-versatile` | `llama-3.3-70b-versatile` | Modèle Groq par défaut |
| `OPENAI_API_KEY` | secret | **HIGH** | `***` | `***` | OpenAI API (embeddings cloud, fallback si Ollama indisponible) |
| `OPENAI_EMBEDDING_MODEL` | string | **MEDIUM** | `text-embedding-3-small` | `text-embedding-3-small` | Modèle OpenAI pour embeddings (1536 dimensions) |
| `ANTHROPIC_API_KEY` | secret | **MEDIUM** | `***` | `***` | Anthropic Claude API (LLM fallback avancé) |
| `ANTHROPIC_MODEL` | string | **LOW** | `claude-sonnet-4-20250514` | `claude-sonnet-4-20250514` | Modèle Anthropic par défaut |
| `DEEPSEEK_API_KEY` | secret | **MEDIUM** | `***` | `***` | DeepSeek API (LLM fallback économique ~0.14$/M tokens) |
| `DEEPSEEK_MODEL` | string | **LOW** | `deepseek-chat` | `deepseek-chat` | Modèle DeepSeek par défaut |

## email

Configuration services email (Brevo, Resend)

| Variable | Type | Criticité | Dev | Prod | Description |
|----------|------|-----------|-----|------|-------------|
| `BREVO_API_KEY` | secret | **MEDIUM** | `***` | `***` | Brevo API (notifications quotidiennes, 300 emails/jour gratuit) |
| `BREVO_SENDER_EMAIL` | email | **LOW** | `notifications@localhost` | `notifications@qadhya.tn` | Email expéditeur Brevo |
| `BREVO_SENDER_NAME` | string | **LOW** | `Qadhya Dev` | `Qadhya` | Nom expéditeur Brevo |
| `RESEND_API_KEY` | secret | **MEDIUM** | `***` | `***` | Resend API (emails transactionnels) |
| `ADMIN_EMAIL` | email | **MEDIUM** | `admin@localhost` | `salmen.ktata@gmail.com` | Email admin pour alertes critiques |

## integrations

Intégrations tierces (Google Drive, WhatsApp)

| Variable | Type | Criticité | Dev | Prod | Description |
|----------|------|-----------|-----|------|-------------|
| `GOOGLE_CLIENT_ID` | string | **LOW** | - | `YOUR_CLIENT_ID.apps.googleusercontent.com` | Google OAuth Client ID (pour Google Drive) |
| `GOOGLE_CLIENT_SECRET` | secret | **LOW** | `***` | `***` | Google OAuth Client Secret |
| `ENCRYPTION_KEY` | secret | **HIGH** | `***` | `***` | Clé chiffrement AES-256 pour tokens Google Drive (généré avec openssl rand -hex 32) |

## monitoring

Configuration monitoring et crons

| Variable | Type | Criticité | Dev | Prod | Description |
|----------|------|-----------|-----|------|-------------|
| `CRON_SECRET` | secret | **HIGH** | `***` | `***` | Secret pour authentification crons → API (généré avec openssl rand -hex 32) |

## Règles de Validation

Ces règles sont évaluées automatiquement lors de la validation (pré-deploy, post-deploy).

### rag-embeddings-provider

**Severity**: CRITICAL

**Condition**:
```
RAG_ENABLED=true AND OLLAMA_ENABLED=false AND !OPENAI_API_KEY
```

**Message**: RAG activé mais aucun provider embeddings disponible

**Solutions**:

- Activer Ollama (gratuit): OLLAMA_ENABLED=true
- Configurer OpenAI (payant): OPENAI_API_KEY=sk-proj-...

### database-url-coherence

**Severity**: CRITICAL

**Condition**:
```
DATABASE_URL does not contain DB_NAME
```

**Message**: DATABASE_URL doit contenir la valeur de DB_NAME

**Solutions**:

- Vérifier que DATABASE_URL contient postgresql://.../${DB_NAME}

### ollama-localhost-docker

**Severity**: WARNING

**Condition**:
```
OLLAMA_BASE_URL contains 'localhost' AND NODE_ENV=production
```

**Message**: OLLAMA_BASE_URL avec localhost ne fonctionne pas dans Docker

**Solutions**:

- Utiliser http://host.docker.internal:11434 en production

### nextauth-url-match

**Severity**: HIGH

**Condition**:
```
NEXTAUTH_URL != NEXT_PUBLIC_APP_URL
```

**Message**: NEXTAUTH_URL doit correspondre à NEXT_PUBLIC_APP_URL

**Solutions**:

- Synchroniser les deux variables

## Historique Incidents

Historique des problèmes de configuration rencontrés en production.

### 2026-02-14: `OLLAMA_ENABLED` (CRITICAL)

- **Problème**: Divergence .env.production (false) vs template (true)
- **Impact**: Risque régression
- **Résolution**: Phase 1 de ce plan

### 2026-02-12: `RAG_ENABLED` (CRITICAL)

- **Problème**: RAG désactivé par erreur
- **Impact**: Assistant IA non-fonctionnel
- **Résolution**: Commit 2e3d2dc

### 2026-02-12: `OLLAMA_ENABLED` (CRITICAL)

- **Problème**: OLLAMA_ENABLED=false en prod sans OPENAI_API_KEY
- **Impact**: Recherche KB retourne [] vide, Assistant répond 'لم أجد وثائق ذات صلة'
- **Résolution**: Fix manuel VPS + commit 2e3d2dc

## Commandes Utiles

### Validation Configuration

```bash
# Auditer divergences .env.production vs template
npm run audit:env

# Valider contre schéma JSON (bloque si CRITICAL)
npm run validate:env

# Mode strict (warnings bloquent aussi)
npm run validate:env:strict

# Avec test connectivity API keys
npm run validate:env:connectivity
```

### Synchronisation Dev ↔ Prod

```bash
# Comparer dev vs prod
npm run diff-env

# Mode verbose (affiche toutes variables)
npm run diff-env:verbose

# Avec test connectivity
npm run diff-env:check

# Synchroniser (wizard interactif)
npm run sync-env-interactive
```

### Fix Production Directement

```bash
# Fix variable production (SSH + restart + health check)
bash scripts/fix-prod-config.sh VARIABLE_NAME NEW_VALUE

# Exemples
bash scripts/fix-prod-config.sh OLLAMA_ENABLED true
bash scripts/fix-prod-config.sh RAG_MAX_RESULTS 10
```

### Génération Documentation

```bash
# Régénérer ce fichier depuis env-schema.json
npm run docs:env
```

---

**Documentation générée le**: 14/02/2026 23:01:04

**Schéma source**: `docs/env-schema.json` (version 2.0.0)

**Outils**:
- Validation: `scripts/validate-env-schema.ts`
- Audit: `scripts/audit-env-divergences.ts`
- Diff: `scripts/diff-env.ts`
- Fix: `scripts/fix-prod-config.sh`
