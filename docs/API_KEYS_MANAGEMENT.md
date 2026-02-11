# 🔑 Gestion des Clés API - Source Unique de Vérité

> **Date de mise en place** : 11 février 2026
> **Version** : 1.0

---

## 📋 Table des matières

- [Vue d'ensemble](#vue-densemble)
- [Source de vérité unique](#source-de-vérité-unique)
- [Structure des fichiers](#structure-des-fichiers)
- [Procédures](#procédures)
- [Sécurité](#sécurité)
- [Dépannage](#dépannage)

---

## Vue d'ensemble

Le système de gestion des clés API repose sur **une source unique de vérité** :

```
📂 Source de vérité : /opt/qadhya/.env.production.local
          ⬇️  (sync)
💾 Base de données PostgreSQL (clés cryptées)
          ⬇️  (runtime)
🚀 Application Next.js
```

### Principe fondamental

**RÈGLE D'OR** : Le fichier `.env.production.local` est la **seule source de vérité**. Toute modification de clé doit passer par ce fichier.

---

## Source de vérité unique

### Fichier : `/opt/qadhya/.env.production.local`

**Emplacement** : Sur le serveur VPS (84.247.165.187)
**Permissions** : `600` (lecture/écriture root uniquement)
**Format** : Variables d'environnement en clair

```bash
# ========================================
# 🔑 CLÉS API - SOURCE DE VÉRITÉ UNIQUE
# ========================================

# Gemini - Gemini API Key
GEMINI_API_KEY=AIzaSy...

# OpenAI - OpenAI API Key
OPENAI_API_KEY=sk-proj-...

# Groq - Groq API Key
GROQ_API_KEY=gsk_...

# DeepSeek - DeepSeek API Key
DEEPSEEK_API_KEY=sk-...

# Ollama - Ollama Local
OLLAMA_API_KEY=local://ollama

# ========================================
# 🔒 CLÉ DE CHIFFREMENT
# ========================================
ENCRYPTION_KEY=9876986284a8ad01ef2ab9c10fb6111d8d80ed2225f00ab29625362328995fbb
```

---

## Structure des fichiers

### 1. Fichier .env (Source de vérité)

```
/opt/qadhya/.env.production.local
├── Permissions : 600 (root only)
├── Contenu : Clés en clair
└── Backup : Automatique dans .secrets/
```

### 2. Base de données (Copie cryptée)

```sql
Table: api_keys
├── provider (text) : gemini, openai, groq, deepseek, ollama
├── api_key_encrypted (text) : Clé cryptée AES-256-GCM
├── model_default (text) : Modèle par défaut
├── is_active (boolean) : Activé/désactivé
└── updated_at (timestamp) : Dernière mise à jour
```

### 3. Scripts de gestion

```
scripts/
├── decrypt-and-export-keys.ts   : Export DB → .env
├── sync-env-to-db.ts            : Sync .env → DB
├── update-api-keys.ts           : Mise à jour clés
└── test-decrypted-keys.sh       : Test de toutes les clés
```

---

## Procédures

### 📝 Ajouter/Modifier une clé

#### Étape 1 : Éditer le fichier .env

```bash
# Connexion SSH
ssh root@84.247.165.187

# Éditer le fichier
nano /opt/qadhya/.env.production.local

# Modifier la clé (exemple Gemini)
GEMINI_API_KEY=AIzaSy_NOUVELLE_CLÉ_ICI
```

#### Étape 2 : Synchroniser vers la DB

```bash
# Depuis votre machine locale
npx tsx scripts/sync-env-to-db.ts
```

#### Étape 3 : Redémarrer l'application

```bash
ssh root@84.247.165.187 "docker restart qadhya-nextjs"
```

#### Étape 4 : Vérifier

```bash
bash scripts/test-decrypted-keys.sh
```

---

### 🔍 Vérifier l'état des clés

```bash
# Lister toutes les clés actives
ssh root@84.247.165.187 "docker exec qadhya-postgres psql -U moncabinet -d qadhya -c 'SELECT provider, is_active, model_default FROM api_keys ORDER BY provider;'"

# Tester toutes les clés
bash scripts/test-decrypted-keys.sh
```

---

### 💾 Backup des clés

#### Backup automatique

Les backups sont créés automatiquement dans :
- **Serveur** : `/opt/qadhya/.env.production.local` (fichier principal)
- **Local** : `.secrets/.env.production.local.backup.{timestamp}`

#### Backup manuel

```bash
# Depuis votre machine locale
scp root@84.247.165.187:/opt/qadhya/.env.production.local ./.secrets/.env.production.local.backup.$(date +%Y%m%d)
```

#### Restaurer un backup

```bash
# Copier le backup vers le serveur
scp ./.secrets/.env.production.local.backup.YYYYMMDD root@84.247.165.187:/opt/qadhya/.env.production.local

# Synchroniser vers la DB
npx tsx scripts/sync-env-to-db.ts

# Redémarrer
ssh root@84.247.165.187 "docker restart qadhya-nextjs"
```

---

### 🔄 Migration depuis l'ancien système

Si vous aviez des clés uniquement dans la DB :

```bash
# 1. Exporter depuis la DB vers .env
npx tsx scripts/decrypt-and-export-keys.ts

# 2. Vérifier le fichier créé
ssh root@84.247.165.187 "cat /opt/qadhya/.env.production.local"

# 3. Les clés sont maintenant dans .env (source de vérité)
```

---

## Sécurité

### ✅ Bonnes pratiques

1. **Permissions strictes** : Le fichier `.env.production.local` a les permissions `600` (root uniquement)
2. **Cryptage en DB** : Les clés sont cryptées en AES-256-GCM dans la DB
3. **Backups sécurisés** : Les backups locaux sont dans `.secrets/` (ignoré par Git)
4. **Rotation régulière** : Changer les clés tous les 6 mois minimum
5. **Audit des accès** : Vérifier régulièrement `last_used_at` dans la DB

### ❌ À ne JAMAIS faire

- ❌ Commiter `.env.production.local` dans Git
- ❌ Partager les clés par email/chat non crypté
- ❌ Stocker les clés en clair dans la DB (toujours crypter)
- ❌ Donner les permissions 644 ou plus permissives au fichier .env
- ❌ Modifier directement la DB (toujours passer par .env)

### 🔐 Clé de chiffrement

La clé `ENCRYPTION_KEY` est critique :
- **Format** : 64 caractères hexadécimaux (256 bits)
- **Génération** : `openssl rand -hex 32`
- **Stockage** : Dans `.env.production.local` ET dans le code (pour décryptage)
- **Ne JAMAIS changer** : Sinon toutes les clés deviennent indécryptables

---

## Dépannage

### Problème : Clé ne fonctionne pas

1. **Vérifier le format de la clé**
   ```bash
   # Gemini : AIza...
   # OpenAI : sk-proj-... ou sk-...
   # Groq : gsk_...
   # DeepSeek : sk-...
   ```

2. **Tester la clé manuellement**
   ```bash
   bash scripts/test-decrypted-keys.sh
   ```

3. **Vérifier la synchronisation**
   ```bash
   npx tsx scripts/sync-env-to-db.ts
   ```

### Problème : Clé cryptée invalide en DB

```bash
# Re-synchroniser depuis .env (source de vérité)
npx tsx scripts/sync-env-to-db.ts
```

### Problème : ENCRYPTION_KEY perdue

⚠️ **CRITIQUE** : Si la clé de chiffrement est perdue, toutes les clés API en DB sont irrécupérables.

**Solution** :
1. Restaurer le backup de `.env.production.local`
2. Ou reconfigurer toutes les clés manuellement

---

## Résumé des commandes

```bash
# Ajouter/modifier une clé
nano /opt/qadhya/.env.production.local (sur le serveur)
npx tsx scripts/sync-env-to-db.ts
ssh root@84.247.165.187 "docker restart qadhya-nextjs"

# Tester les clés
bash scripts/test-decrypted-keys.sh

# Backup
scp root@84.247.165.187:/opt/qadhya/.env.production.local ./.secrets/backup.$(date +%Y%m%d)

# Restaurer
scp ./.secrets/backup.YYYYMMDD root@84.247.165.187:/opt/qadhya/.env.production.local
npx tsx scripts/sync-env-to-db.ts
```

---

## Contacts

- **Administrateur système** : Salmen KTATA
- **Serveur VPS** : 84.247.165.187
- **Documentation** : `/docs/API_KEYS_MANAGEMENT.md`

---

**Dernière mise à jour** : 11 février 2026
**Version** : 1.0
