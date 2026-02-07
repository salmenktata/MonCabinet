# Qadhya - Plateforme SaaS de Gestion de Cabinet Juridique

## 🎯 Vision

Qadhya (qadhya.tn) est une plateforme SaaS moderne conçue spécifiquement pour les avocats tunisiens, permettant une gestion efficace des dossiers, clients, échéances et facturation, avec un assistant IA juridique intégré.

## 🚀 Fonctionnalités Implémentées

### Core - Gestion Cabinet

- ✅ Authentification (email/password, JWT HttpOnly)
- ✅ Vérification email, réinitialisation mot de passe
- ✅ Gestion des clients (CRUD complet)
- ✅ Gestion des dossiers (tous workflows juridiques tunisiens)
- ✅ Workflows prédéfinis (civil, pénal, famille, commercial, etc.)
- ✅ Actions et tâches par dossier avec suivi
- ✅ Calcul des échéances et délais légaux tunisiens
- ✅ Upload et gestion de documents (MinIO S3)
- ✅ Dashboard avec indicateurs clés
- ✅ Facturation (création, PDF, notes d'honoraires)
- ✅ Paiement en ligne (Flouci)
- ✅ Recherche full-text et sémantique

### IA & RAG

- ✅ Chat IA juridique avec RAG (Retrieval-Augmented Generation)
- ✅ Base de connaissances juridique (lois, jurisprudence, procédures)
- ✅ Embeddings vectoriels (OpenAI/Ollama avec pgvector)
- ✅ Re-ranking cross-encoder pour pertinence optimale
- ✅ Cache Redis pour traductions et embeddings
- ✅ Support bilingue arabe/français avec traduction automatique
- ✅ Feedback utilisateur pour amélioration continue
- ✅ Clustering sémantique des documents liés

### Intégrations

- ✅ WhatsApp Business API (messagerie clients)
- ✅ Google Drive (sync documents)
- ✅ Flouci (paiements tunisiens)
- ✅ Resend/Brevo (emails transactionnels)

### Administration

- ✅ Interface super-admin complète
- ✅ Gestion de la base de connaissances (CRUD, indexation)
- ✅ Monitoring des coûts IA
- ✅ Backups automatisés
- ✅ Migrations de base de données

## 🛠️ Stack Technique

### Frontend
- **Next.js 15** (App Router, Server Components)
- **TailwindCSS** pour le styling
- **shadcn/ui** pour les composants UI
- **Zustand** pour la gestion d'état
- **React Hook Form + Zod** pour les formulaires
- **@react-pdf/renderer** pour la génération de PDF
- **i18n** : Support FR/AR (RTL natif)

### Backend
- **PostgreSQL 15** avec **pgvector** (embeddings vectoriels)
- **JWT HttpOnly (jose)** pour l'authentification
- **MinIO** (stockage S3-compatible pour documents)
- **Redis** (cache embeddings, traductions, recherche)
- **Isolation multi-tenant** via filtres `user_id` côté requêtes

### IA / RAG Pipeline
- **Embeddings** : OpenAI text-embedding-3-large / Ollama (nomic-embed-text)
- **LLM** : Groq (prioritaire), Anthropic Claude, OpenAI
- **Re-ranking** : Cross-encoder Xenova/ms-marco-MiniLM-L-6-v2
- **Clustering** : UMAP + HDBSCAN pour documents similaires
- **Traduction** : Groq avec cache 30 jours

### Intégrations
- **Email** : Resend / Brevo (transactionnel)
- **WhatsApp** : Meta Business API
- **Paiement** : Flouci
- **Cloud Storage** : Google Drive (optionnel)

### Hébergement
- **Architecture** : Docker Compose (Next.js + PostgreSQL + MinIO + Redis)
- **Serveur** : VPS Contabo / DigitalOcean / AWS
- **Reverse Proxy** : Nginx + Let's Encrypt SSL
- **Backup** : Script automatisé pg_dump + MinIO

## 📁 Structure du Projet

```
qadhya/
├── app/                    # Next.js App Router
│   ├── (auth)/            # Pages d'authentification
│   ├── (dashboard)/       # Pages du dashboard avocat
│   ├── (super-admin)/     # Interface super-admin
│   └── api/               # 42+ API Routes
│       ├── auth/          # Auth (login, register, password reset)
│       ├── admin/         # Admin (knowledge-base, backups, migrations)
│       ├── chat/          # Chat IA avec feedback
│       ├── search/        # Recherche full-text et sémantique
│       ├── webhooks/      # WhatsApp, Flouci, Google Drive
│       └── cron/          # Jobs planifiés
├── components/            # Composants React réutilisables
│   ├── ui/               # shadcn/ui (50+ composants)
│   ├── clients/          # Composants clients
│   ├── dossiers/         # Composants dossiers
│   ├── chat/             # Interface chat IA
│   └── super-admin/      # Interface administration
├── lib/                  # Services et utilitaires
│   ├── db/               # Client PostgreSQL
│   ├── auth/             # Auth JWT (HttpOnly)
│   ├── storage/          # Client MinIO
│   ├── cache/            # Redis (embeddings, traductions)
│   ├── ai/               # 20 services IA/RAG
│   │   ├── rag-chat-service.ts
│   │   ├── embeddings-service.ts
│   │   ├── knowledge-base-service.ts
│   │   ├── reranker-service.ts
│   │   └── ...
│   └── validations/      # Schémas Zod
├── locales/              # Traductions FR/AR
├── data/                 # Données de référence tunisiennes
│   ├── calendrier-judiciaire.json
│   ├── delais-legaux.json
│   └── tribunaux-tunisie.json
├── docs/                 # Documentation technique
│   ├── architecture/     # Architecture technique
│   ├── deployment/       # Guides déploiement VPS
│   ├── features/         # Documentation fonctionnalités
│   └── guides/           # Guides d'utilisation
└── db/migrations/        # 40+ migrations SQL
```

## 🚦 Prérequis

- Node.js 18+
- npm ou yarn
- Docker + Docker Compose (pour PostgreSQL + MinIO)
- Compte Resend (pour les emails)
- Serveur VPS (optionnel, pour déploiement production)

## 💻 Installation

1. Cloner le repository
```bash
git clone https://github.com/votre-username/moncabinet.git
cd moncabinet
```

2. Installer les dépendances
```bash
npm install
```

3. Configurer les variables d'environnement
```bash
cp .env.example .env.local
```

Remplir les variables dans `.env.local` :
- `DATABASE_URL` (PostgreSQL)
- `NEXTAUTH_SECRET` (générer avec `openssl rand -base64 32`)
- `NEXTAUTH_URL` (http://localhost:7002)
- `MINIO_ROOT_USER` et `MINIO_ROOT_PASSWORD`
- `RESEND_API_KEY`

4. Démarrer l'infrastructure Docker
```bash
docker-compose up -d postgres minio
```

5. Lancer le serveur de développement
```bash
npm run dev
```

Ouvrir [http://localhost:7002](http://localhost:7002) dans votre navigateur.

## 🐳 Docker & Infrastructure

Le projet utilise Docker Compose pour l'infrastructure locale :

```yaml
Services:
- postgres:5433    # PostgreSQL 15
- redis:6379       # Cache Redis
- minio:9000       # MinIO (API S3)
- minio:9001       # MinIO Console
- nextjs:3000      # Application Next.js
```

Commandes utiles :
```bash
# Démarrer tous les services
docker-compose up -d

# Voir les logs
docker-compose logs -f

# Arrêter tous les services
docker-compose down

# Backup base de données
docker exec moncabinet-postgres pg_dump -U moncabinet moncabinet > backup.sql
```

## 📊 Schéma de Base de Données

Voir `db/migrations/` pour les 40+ migrations SQL.

### Tables principales (50+)

**Core**
- `users` - Utilisateurs (avocats, admins)
- `profiles` - Profils cabinet
- `clients` - Clients
- `dossiers` - Dossiers juridiques
- `actions` - Actions et tâches
- `echeances` - Échéances et délais
- `documents` - Documents uploadés
- `factures` - Factures

**IA / RAG**
- `knowledge_base` - Documents base de connaissances
- `knowledge_base_chunks` - Chunks pour RAG
- `knowledge_base_embeddings` - Embeddings vectoriels (pgvector)
- `chat_messages` - Historique conversations IA
- `chat_message_feedback` - Feedback utilisateurs
- `document_embeddings` - Embeddings documents utilisateur

**Intégrations**
- `whatsapp_conversations` - Conversations WhatsApp
- `whatsapp_messages` - Messages WhatsApp
- `payment_transactions` - Paiements Flouci

## 🎨 Design System

Le projet utilise **shadcn/ui** basé sur Tailwind CSS.

### Palette de couleurs
- Primaire : Bleu marine (justice, confiance)
- Secondaire : Or (prestige, excellence)
- Neutre : Gris (professionnalisme)

## 🔐 Sécurité

- **Authentification** : JWT HttpOnly (30 jours)
- **Hashing mots de passe** : bcrypt (10 rounds)
- **Autorisation** : filtres `user_id` côté requêtes + contrôles rôle
- **Encryption** : TLS 1.3 pour les communications (Let's Encrypt)
- **Stockage** : MinIO avec buckets privés
- **Conformité** : INPDP (Instance Nationale de Protection des Données Personnelles - Tunisie)

## 🇹🇳 Spécificités Tunisiennes

- Calcul des délais selon le code de procédure civile tunisien
- Prise en compte des vacances judiciaires (août)
- Jours fériés tunisiens (nationaux + religieux)
- Liste complète des tribunaux tunisiens
- Templates de documents conformes aux pratiques tunisiennes

## 📈 Roadmap

### ✅ Phase 1 : MVP Complet (Terminé)
- Gestion cabinet complète (clients, dossiers, actions, échéances)
- Facturation avec paiement Flouci
- Chat IA juridique avec RAG
- Base de connaissances juridique tunisienne
- Support bilingue FR/AR
- Intégration WhatsApp
- Interface super-admin

### 🚧 Phase 2 : Beta Privée (En cours)
- 15 avocats testeurs
- Onboarding personnalisé
- Amélioration continue du RAG

### 📋 Phase 3 : Améliorations Prévues
- Time tracking intégré
- Templates de documents juridiques enrichis
- Mode offline (PWA)
- Analytics avancées cabinet
- Intégration email (Outlook/Gmail)

## 💰 Pricing

| Plan | Prix | Limites |
|------|------|---------|
| Gratuit | 0 TND | 10 dossiers actifs |
| Solo | 49 TND/mois | 50 dossiers, 5 Go |
| Pro | 99 TND/mois | Illimité, 50 Go, Time tracking, Templates |
| Cabinet | 199 TND/mois | 3 utilisateurs, 100 Go |
| Cabinet+ | Sur devis | Illimité |

## 🤝 Contribution

Voir [CONTRIBUTING.md](./CONTRIBUTING.md) pour les guidelines de contribution.

## 📄 Licence

Ce projet est sous licence propriétaire. Tous droits réservés.

## 📞 Contact

Pour toute question : contact@qadhya.tn

## 🙏 Remerciements

Merci aux avocats tunisiens qui ont participé aux interviews et aux tests beta.

---

**Fait avec ❤️ pour les avocats tunisiens**
