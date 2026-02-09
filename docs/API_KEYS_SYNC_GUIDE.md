# Guide de Synchronisation des Clés API

Ce guide explique comment maintenir les clés API synchronisées entre tous les environnements.

## 🎯 Objectif

Éviter les **dérives** entre :
- Variables d'environnement (`.env.local`, `.env` VPS)
- Base de données (table `api_keys`)
- GitHub Secrets (pour déploiements automatiques)

---

## 📊 Architecture de Synchronisation

```
Source de Vérité → .env.local (développement local)
                   ↓
        ┌──────────┴──────────┐
        ↓                     ↓
   Base de Données      GitHub Secrets
        ↓                     ↓
   (Backup/Alternatif)   .env VPS (production)
                             ↓
                     Variables Container
```

---

## 🛠️ Outils Disponibles

### 1. Script Bash (Multi-environnements)

**Fichier** : `scripts/sync-api-keys.sh`

**Fonctionnalités** :
- ✅ Compare `.env.local` vs `.env` VPS
- ✅ Compare `.env.local` vs Base de données locale
- ✅ Synchronise automatiquement si demandé
- ✅ Crée des backups avant modification

**Usage** :

```bash
# Vérifier uniquement (aucune modification)
./scripts/sync-api-keys.sh --check-only

# Synchroniser tout
./scripts/sync-api-keys.sh

# Synchroniser uniquement VPS (skip DB)
./scripts/sync-api-keys.sh --no-db

# Synchroniser uniquement DB (skip VPS)
./scripts/sync-api-keys.sh --no-vps
```

### 2. Script TypeScript (Base de données)

**Fichier** : `scripts/check-keys-sync.ts`

**Fonctionnalités** :
- ✅ Compare variables d'environnement vs Base de données
- ✅ Affiche rapport détaillé avec couleurs
- ✅ Mode `--fix` pour synchronisation automatique

**Usage** :

```bash
# Vérifier synchronisation
npx tsx scripts/check-keys-sync.ts

# Corriger automatiquement
npx tsx scripts/check-keys-sync.ts --fix
```

---

## 📋 Workflow de Synchronisation Recommandé

### Scénario 1 : Changement de Clé API

**Exemple** : Gemini API key expire, nouvelle clé générée

```bash
# 1. Mettre à jour .env.local (source de vérité)
vim .env.local
# GOOGLE_API_KEY=nouvelle_clé

# 2. Synchroniser base de données locale
npx tsx scripts/check-keys-sync.ts --fix

# 3. Synchroniser VPS production
./scripts/sync-api-keys.sh

# 4. Mettre à jour GitHub Secret
# Aller sur : https://github.com/.../settings/secrets/actions
# Modifier : GOOGLE_API_KEY

# 5. Vérifier production
curl https://qadhya.tn/api/health
```

### Scénario 2 : Audit de Sécurité Mensuel

```bash
# 1. Vérifier toutes les dérives
./scripts/sync-api-keys.sh --check-only

# 2. Vérifier base de données
npx tsx scripts/check-keys-sync.ts

# 3. Si dérives détectées, synchroniser
./scripts/sync-api-keys.sh
npx tsx scripts/check-keys-sync.ts --fix
```

### Scénario 3 : Nouveau Déploiement

```bash
# 1. S'assurer que .env.local est à jour
git pull origin main

# 2. Synchroniser DB locale
npx tsx scripts/check-keys-sync.ts --fix

# 3. Déployer (GitHub Actions synchronise automatiquement)
git push origin main

# 4. Vérifier après déploiement
./scripts/sync-api-keys.sh --check-only
```

---

## ⚠️ Règles de Sécurité

### ❌ Ne JAMAIS

1. **Commiter les clés API** dans Git
   ```bash
   # .env.local DOIT être dans .gitignore
   git check-ignore .env.local  # Doit retourner .env.local
   ```

2. **Changer ENCRYPTION_KEY en production**
   ```bash
   # ⚠️ DANGER : Rend les clés DB irrécupérables !
   # Si vraiment nécessaire : migration manuelle requise
   ```

3. **Utiliser des clés différentes entre environnements**
   ```bash
   # ✅ BIEN : Même clé partout (sauf si test/staging)
   # ❌ MAL : Clé A en local, clé B en prod → confusion
   ```

### ✅ Toujours

1. **Tester après synchronisation**
   ```bash
   # Local
   npm run dev
   # Tester sur http://localhost:3000

   # Production
   curl https://qadhya.tn/api/health
   ```

2. **Vérifier les backups**
   ```bash
   # Sur VPS
   ssh root@84.247.165.187
   ls -la /opt/moncabinet/.env.backup-*
   ```

3. **Documenter les changements**
   ```bash
   git commit -m "chore: Rotate Gemini API key (expired)"
   ```

---

## 🔍 Diagnostic des Problèmes

### Problème : "Clé API invalide en production"

```bash
# 1. Vérifier quelle clé est utilisée
ssh root@84.247.165.187 'docker exec moncabinet-nextjs printenv | grep API_KEY'

# 2. Comparer avec .env.local
cat .env.local | grep API_KEY

# 3. Synchroniser si différent
./scripts/sync-api-keys.sh
```

### Problème : "Déchiffrement échoue en DB"

```bash
# Vérifier ENCRYPTION_KEY
echo $ENCRYPTION_KEY  # Local
ssh root@84.247.165.187 'docker exec moncabinet-nextjs printenv | grep ENCRYPTION_KEY'

# Si différent → PROBLÈME CRITIQUE
# Les clés en DB sont irrécupérables avec mauvaise ENCRYPTION_KEY
```

### Problème : "GitHub Actions déploie anciennes clés"

```bash
# Vérifier les secrets GitHub
gh secret list  # Nécessite GitHub CLI

# Mettre à jour si obsolètes
# Aller sur : https://github.com/.../settings/secrets/actions
```

---

## 📚 Référence des Clés

| Clé | Provider | Usage | Rotation |
|-----|----------|-------|----------|
| `GOOGLE_API_KEY` | Gemini | Chat/RAG (prioritaire) | Jamais (tier gratuit) |
| `GROQ_API_KEY` | Groq | Fallback rapide | Si 401 |
| `DEEPSEEK_API_KEY` | DeepSeek | Fallback qualité | Si 401 ou solde épuisé |
| `ANTHROPIC_API_KEY` | Claude | Fallback premium | Si 401 |
| `OPENAI_API_KEY` | OpenAI | Embeddings fallback | Si 401 |
| `ENCRYPTION_KEY` | N/A | Chiffrement DB | **JAMAIS** |

---

## 🔗 Liens Utiles

- [Script Bash Sync](../scripts/sync-api-keys.sh)
- [Script TypeScript Check](../scripts/check-keys-sync.ts)
- [GitHub Secrets Setup](./GITHUB_SECRETS_SETUP.md)
- [Workflow GitHub Actions](../.github/workflows/deploy-vps.yml)

---

## 📞 Support

En cas de problème de synchronisation :

1. **Logs locaux** : Vérifier `docker logs qadhya-postgres`
2. **Logs production** : `ssh root@84.247.165.187 'docker logs moncabinet-nextjs'`
3. **Documentation** : Consulter `docs/GITHUB_SECRETS_SETUP.md`

---

**Dernière mise à jour** : 9 février 2026
