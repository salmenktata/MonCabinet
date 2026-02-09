# Guide : Gestion des Clés API en Base de Données

**Date** : 2026-02-09  
**Status** : Phase 1 complète, migration en attente

## 🎯 Objectif

Stocker les clés API de manière sécurisée (chiffrées AES-256-GCM) en PostgreSQL pour :
- ✅ Ne plus les perdre
- ✅ Gestion centralisée
- ✅ Audit et monitoring
- ✅ Rotation facile

## 📁 Fichiers Créés

### 1. Migration SQL
**Fichier** : `migrations/20260209_create_api_keys_table.sql`

Crée :
- Table `api_keys` avec chiffrement
- Index pour performance
- Contraintes de validation

### 2. Service de Chiffrement
**Fichier** : `lib/api-keys/encryption.ts`

Fonctions :
- `encryptApiKey(apiKey: string): string` - Chiffre avec AES-256-GCM
- `decryptApiKey(encrypted: string): string` - Déchiffre
- `maskApiKey(apiKey: string): string` - Masque pour affichage
- `validateApiKeyFormat(provider, apiKey): boolean` - Valide format

### 3. Service de Gestion
**Fichier** : `lib/api-keys/api-keys-service.ts`

Fonctions :
- `upsertApiKey(data: ApiKeyData)` - Créer/Mettre à jour
- `getApiKey(provider: string)` - Récupérer déchiffrée
- `listApiKeys()` - Lister (masquées)
- `deleteApiKey(provider: string)` - Supprimer
- `markApiKeyUsed(provider)` - Marquer comme utilisée
- `recordApiKeyError(provider, error)` - Enregistrer erreur

### 4. Scripts

**`scripts/apply-migration-api-keys.ts`** : Applique la migration  
**`scripts/import-api-keys-to-db.ts`** : Importe clés depuis .env.local  
**`scripts/test-gemini-integration.ts`** : Test intégration Gemini

## 🚀 Installation (3 étapes)

### Étape 1 : Démarrer PostgreSQL

\`\`\`bash
# Démarrer Docker Desktop
open -a Docker

# Attendre que Docker démarre (~10s)
# Puis démarrer PostgreSQL
docker-compose up -d postgres

# Vérifier
docker ps | grep postgres
# Doit afficher: moncabinet-postgres ... Up ...
\`\`\`

### Étape 2 : Appliquer la Migration

\`\`\`bash
npx tsx scripts/apply-migration-api-keys.ts
\`\`\`

**Sortie attendue** :
\`\`\`
📦 Application migration api_keys...
✅ Migration appliquée avec succès
\`\`\`

### Étape 3 : Importer les Clés

\`\`\`bash
npx tsx scripts/import-api-keys-to-db.ts
\`\`\`

**Sortie attendue** :
\`\`\`
🔐 Import des clés API vers la base de données

✅ gemini: Gemini API Key - Projet Qadhya
✅ deepseek: DeepSeek API Key

📋 Clés stockées:

┌─────────┬──────────┬────────────────────┬──────┬────────┬─────────┐
│ Provider│  Label   │      API Key       │ Tier │ Active │ Primary │
├─────────┼──────────┼────────────────────┼──────┼────────┼─────────┤
│ gemini  │ Gemini...│ AIzaSy...2btl8     │ free │   ✅   │   🏆    │
│ deepseek│ DeepSe...│ sk-557...7e46      │ paid │   ✅   │         │
└─────────┴──────────┴────────────────────┴──────┴────────┴─────────┘

✅ Import terminé!
\`\`\`

## 🔐 Sécurité

### Chiffrement

- **Algorithme** : AES-256-GCM
- **Clé** : \`ENCRYPTION_KEY\` de .env (64 caractères hex)
- **IV** : Aléatoire par clé (16 bytes)
- **Tag** : Authentification intégrée (16 bytes)

### Variables d'Environnement

**Gestion Hybride** : Les clés sont définies dans `.env.local` ET sauvegardées en DB.

**Pourquoi les deux ?**
- **`.env.local`** : Source primaire (lecture synchrone par `getAvailableProviders()`)
- **Base de données** : Backup sécurisé + audit + monitoring + rotation facile

**`.env.local`** :
\`\`\`bash
# Clé de chiffrement (CONSERVER ABSOLUMENT)
ENCRYPTION_KEY=your-64-char-hex-key-here

# Clés API (gardées ici ET en DB)
GOOGLE_API_KEY=AIza...
DEEPSEEK_API_KEY=sk-...
\`\`\`

⚠️ **IMPORTANT** :
- Ne JAMAIS supprimer \`ENCRYPTION_KEY\` sinon les clés DB deviennent inaccessibles !
- Garder les clés API dans .env.local (source primaire) + DB (backup/audit)

## 🔄 Usage

### Récupérer une Clé API

\`\`\`typescript
import { getApiKey } from '@/lib/api-keys/api-keys-service'

// Récupérer clé Gemini (déchiffrée)
const geminiKey = await getApiKey('gemini')

// Utiliser
import { GoogleGenerativeAI } from '@google/generative-ai'
const genAI = new GoogleGenerativeAI(geminiKey!)
\`\`\`

### Lister les Clés (Masquées)

\`\`\`typescript
import { listApiKeys } from '@/lib/api-keys/api-keys-service'

const keys = await listApiKeys()
// Affiche: apiKeyMasked = "AIzaSy...2btl8" (sécurisé)
\`\`\`

### Ajouter/Mettre à Jour

\`\`\`typescript
import { upsertApiKey } from '@/lib/api-keys/api-keys-service'

await upsertApiKey({
  provider: 'anthropic',
  label: 'Anthropic Claude API',
  apiKey: 'sk-ant-api03-...',
  baseUrl: 'https://api.anthropic.com',
  modelDefault: 'claude-sonnet-4',
  tier: 'paid',
  isActive: true,
  isPrimary: false,
})
\`\`\`

## 📊 Monitoring

### Erreurs et Usage

La table enregistre automatiquement :
- \`last_used_at\` : Dernière utilisation
- \`last_error\` : Dernière erreur
- \`error_count\` : Compteur d'erreurs consécutives

Utiliser :
\`\`\`typescript
import { markApiKeyUsed, recordApiKeyError } from '@/lib/api-keys/api-keys-service'

// Après appel réussi
await markApiKeyUsed('gemini')

// Après erreur
await recordApiKeyError('gemini', error.message)
\`\`\`

## 🎯 Prochaines Étapes

1. ✅ Démarrer Docker et appliquer migration
2. ✅ Importer clés existantes
3. ✅ Tester avec \`npx tsx scripts/test-gemini-integration.ts\`
4. ⏳ Créer API admin pour gérer les clés (interface UI)
5. ⏳ Intégrer \`getApiKey()\` dans llm-fallback-service
6. ⏳ Nettoyer .env.local (supprimer clés après import)
7. ⏳ Déployer en production

## 🐛 Troubleshooting

### Erreur : "ENCRYPTION_KEY manquante"

\`\`\`bash
# Générer une nouvelle clé (si perdue, toutes les clés seront inaccessibles!)
openssl rand -hex 32

# Ajouter à .env.local
echo "ENCRYPTION_KEY=<clé_générée>" >> .env.local
\`\`\`

### Erreur : "ECONNREFUSED ::1:5432"

Docker PostgreSQL non démarré :
\`\`\`bash
docker-compose up -d postgres
\`\`\`

### Erreur : "Format de clé API invalide"

Vérifier le format de la clé selon le provider :
- Gemini : \`AIza...\` (39 caractères)
- DeepSeek : \`sk-...\` (36+ caractères)
- Groq : \`gsk_...\` (44+ caractères)

## 📚 Références

- [AES-256-GCM](https://en.wikipedia.org/wiki/Galois/Counter_Mode)
- [Node.js Crypto](https://nodejs.org/api/crypto.html)
- [PostgreSQL Encryption](https://www.postgresql.org/docs/current/pgcrypto.html)
