# Architecture Technique - Qadhya

## 🏗️ Vue d'Ensemble

Qadhya est une plateforme SaaS juridique construite autour de **Next.js 15 (App Router)**, d'une base **PostgreSQL 15 + pgvector** pour les embeddings, d'un stockage **MinIO (S3)** et d'un cache **Redis**. L'authentification est gérée via **JWT HttpOnly** (lib `jose`).

L'architecture intègre un pipeline RAG complet pour un assistant IA juridique bilingue (FR/AR).

## 📐 Principes Architecturaux

### 1. Feature-Based Organization
```
app/
├── (auth)/          # Authentification
├── (dashboard)/     # Interface avocat
├── (super-admin)/   # Administration
└── api/             # 42+ routes API
```

### 2. Server Components par Défaut
Utilisation maximale des Server Components Next.js 15 pour performance optimale.

### 3. Type Safety
TypeScript strict avec Zod pour la validation runtime.

## 🔧 Stack Technique

### Frontend
- **Next.js 15** (App Router, Server Components)
- **TailwindCSS** + **shadcn/ui** (50+ composants)
- **Zustand** pour l'état global
- **React Hook Form + Zod** pour les formulaires
- **@react-pdf/renderer** pour PDF
- **i18n** : Support FR/AR avec RTL

### Backend
- **PostgreSQL 15** + **pgvector** (`lib/db/postgres.ts`)
- **JWT HttpOnly** pour l'auth (`lib/auth/session.ts`)
- **MinIO** pour le stockage (`lib/storage/minio.ts`)
- **Redis** pour le cache (`lib/cache/redis.ts`)

### IA / Pipeline RAG (20 services)
- **Embeddings** : OpenAI text-embedding-3-large / Ollama nomic-embed-text
- **LLM** : Groq (prioritaire) / Anthropic Claude / OpenAI
- **Re-ranking** : Cross-encoder Xenova/ms-marco-MiniLM-L-6-v2
- **Clustering** : UMAP + HDBSCAN pour documents similaires
- **Traduction** : Groq avec cache Redis 30 jours
- **Token counting** : gpt-tokenizer pour budget précis

Services clés (`lib/ai/`) :
- `rag-chat-service.ts` : Orchestrateur RAG principal
- `embeddings-service.ts` : Génération et cache embeddings
- `knowledge-base-service.ts` : Gestion base de connaissances
- `reranker-service.ts` : Re-ranking cross-encoder
- `translation-service.ts` : Traduction AR↔FR
- `feedback-service.ts` : Boost dynamique basé feedback
- `clustering-service.ts` : Clustering sémantique HDBSCAN
- `related-documents-service.ts` : Documents similaires

### Intégrations
- **WhatsApp Business API** : Messagerie clients
- **Google Drive** : Sync documents (optionnel)
- **Flouci** : Paiements tunisiens
- **Email** : Resend / Brevo

## 🗄️ Modèle de Données (50+ tables)

Les migrations sont versionnées dans `db/migrations/` (40+ fichiers).

### Tables Core
- `users` : comptes et rôles
- `profiles` : informations cabinet
- `clients` : clients du cabinet
- `dossiers` : dossiers juridiques
- `actions` : tâches par dossier
- `echeances` : délais et audiences
- `documents` : pièces et documents
- `factures` : facturation

### Tables IA / RAG
- `knowledge_base` : documents base de connaissances
- `knowledge_base_chunks` : chunks pour RAG
- `knowledge_base_embeddings` : embeddings vectoriels
- `chat_messages` : historique conversations
- `chat_message_feedback` : feedback utilisateurs
- `document_embeddings` : embeddings documents utilisateur

### Tables Intégrations
- `whatsapp_conversations` : conversations WhatsApp
- `whatsapp_messages` : messages WhatsApp
- `payment_transactions` : paiements Flouci

## 🔐 Sécurité & Auth

- **JWT HttpOnly** avec signature `HS256` (30 jours)
- Cookies sécurisés (HTTPS en prod)
- **Hashing mots de passe** : bcrypt (10 rounds)
- **Contrôles d'accès** via `user_id` et vérifications rôle
- **Rate limiting** : en mémoire / Redis
- Vérification HMAC pour webhooks (WhatsApp, Flouci)

Points clés :
- `middleware.ts` protège les routes UI
- Les API/Actions valident la session avec `getSession()`

## 🧠 Pipeline RAG

```
1. Question utilisateur (AR/FR)
         ↓
2. Détection langue + traduction si AR
         ↓
3. Query expansion (synonymes juridiques)
         ↓
4. Recherche multi-sources :
   - knowledge_base (lois, jurisprudence)
   - document_embeddings (docs utilisateur)
   - Full-text search
         ↓
5. Re-ranking cross-encoder
         ↓
6. Boost dynamique (feedback utilisateurs)
         ↓
7. Assemblage contexte (budget tokens)
         ↓
8. Génération LLM (Groq/Claude)
         ↓
9. Réponse avec sources citées
```

## 🐳 Déploiement

- Docker Compose : Next.js + Postgres + MinIO + Redis
- Build Next.js en `output: 'standalone'`
- Healthcheck applicatif : `app/api/health/route.ts`
- Backup : Script pg_dump + MinIO sync

## 🧾 Observabilité

- Logger centralisé : `lib/logger.ts`
- Tracking coûts IA : `lib/ai/usage-tracker.ts`
- Audit d'activité côté auth/administration

## 🧭 Historique

Supabase a été retiré au profit d'une stack auto‑hébergée. Les détails historiques sont documentés dans `docs/migration/MIGRATION_SUPABASE.md`.
