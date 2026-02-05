# MonCabinet - Plateforme SaaS de Gestion de Cabinet Juridique

## 🎯 Vision

MonCabinet (moncabinet.tn) est une plateforme SaaS moderne conçue spécifiquement pour les avocats tunisiens, permettant une gestion efficace des dossiers, clients, échéances et facturation.

## 🚀 Objectif MVP (Extreme MVP - 2.5 mois)

Le MVP se concentre sur un workflow principal ultra-bien fait : **la procédure civile de première instance**.

### Fonctionnalités MVP

- ✅ Authentification (email/password)
- ✅ Gestion des clients (CRUD simple)
- ✅ Gestion des dossiers (procédure civile uniquement)
- ✅ Workflow prédéfini (civil 1ère instance)
- ✅ Actions et tâches par dossier
- ✅ Calcul des échéances et délais
- ✅ Upload et gestion de documents
- ✅ Dashboard avec indicateurs clés
- ✅ Notifications par email
- ✅ Facturation basique (création, PDF, suivi paiement)
- ✅ Recherche de dossiers

## 🛠️ Stack Technique

### Frontend
- **Next.js 14** (App Router)
- **TailwindCSS** pour le styling
- **shadcn/ui** pour les composants UI
- **Zustand** pour la gestion d'état
- **React Hook Form + Zod** pour les formulaires
- **@react-pdf/renderer** pour la génération de PDF

### Backend
- **PostgreSQL 15** (base de données)
- **NextAuth.js** (authentification JWT)
- **MinIO** (stockage S3-compatible pour documents)
- **Row-Level Security (RLS)** pour la sécurité des données

### Email
- **Resend** pour l'envoi d'emails

### Hébergement
- **Architecture**: Docker Compose (Next.js + PostgreSQL + MinIO)
- **Options**: VPS Contabo / DigitalOcean / AWS
- **Reverse Proxy**: Nginx + Let's Encrypt SSL

## 📁 Structure du Projet

```
moncabinet/
├── app/                    # Next.js App Router
│   ├── (auth)/            # Pages d'authentification
│   ├── (dashboard)/       # Pages du dashboard
│   └── api/               # API Routes
├── components/            # Composants React réutilisables
│   ├── ui/               # Composants UI (shadcn)
│   ├── clients/          # Composants clients
│   ├── dossiers/         # Composants dossiers
│   └── shared/           # Composants partagés
├── lib/                  # Utilitaires et configurations
│   ├── db/               # Client PostgreSQL
│   ├── auth/             # Helpers NextAuth
│   ├── storage/          # Client MinIO
│   ├── utils/            # Fonctions utilitaires
│   └── validations/      # Schémas Zod
├── types/                # Types TypeScript
├── data/                 # Données de référence
│   ├── calendrier-judiciaire-2025.json
│   ├── delais-legaux.json
│   └── tribunaux-tunisie.json
├── public/               # Assets statiques
│   └── templates/        # Templates de documents
└── supabase/             # Migrations PostgreSQL
    └── migrations/       # Migrations de base de données SQL
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

Voir `supabase/migrations/` pour les migrations SQL complètes.

### Tables principales
- `users` - Utilisateurs (avocats)
- `clients` - Clients
- `dossiers` - Dossiers juridiques
- `actions` - Actions et tâches
- `echeances` - Échéances et délais
- `documents` - Documents uploadés
- `factures` - Factures

## 🎨 Design System

Le projet utilise **shadcn/ui** basé sur Tailwind CSS.

### Palette de couleurs
- Primaire : Bleu marine (justice, confiance)
- Secondaire : Or (prestige, excellence)
- Neutre : Gris (professionnalisme)

## 🔐 Sécurité

- **Authentification** : NextAuth.js avec sessions JWT (30 jours)
- **Hashing mots de passe** : bcrypt (10 rounds)
- **Autorisation** : Row-Level Security (RLS) PostgreSQL + filtres user_id
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

### Phase 1 : Beta Privée (3 mois)
- 15 avocats testeurs
- Onboarding personnalisé
- Feedback bi-mensuel

### Phase 2 : Beta Publique (3 mois)
- Ouverture inscription
- 100 premiers utilisateurs : -50% pendant 1 an
- Support email

### Phase 3 : Lancement Commercial (Mois 7)
- Plans payants activés
- Support chat en direct
- Programme de parrainage

### V1.5 (Mois 10-12)
- Autres workflows (divorce, commercial, pénal)
- Time tracking intégré
- Templates de documents juridiques
- Support de la langue arabe
- Rapports clients PDF

### V2.0 (Mois 15-18)
- Module comptabilité cabinet
- Intégration email (Outlook/Gmail)
- Analytics avancées
- Mode offline (PWA)

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

Pour toute question : contact@moncabinet.tn

## 🙏 Remerciements

Merci aux avocats tunisiens qui ont participé aux interviews et aux tests beta.

---

**Fait avec ❤️ pour les avocats tunisiens**
