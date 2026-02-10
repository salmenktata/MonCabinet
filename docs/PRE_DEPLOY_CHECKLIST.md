# Checklist Pré-Déploiement Qadhya

## 🎯 Objectif

Éviter les erreurs courantes de déploiement comme :
- ❌ Base de données inexistante
- ❌ Variables d'environnement manquantes
- ❌ Configurations incohérentes
- ❌ Secrets non configurés

## 🚀 Utilisation Rapide

### Script Automatique

```bash
# Vérification environnement production
./scripts/pre-deploy-check.sh production

# Vérification environnement local
./scripts/pre-deploy-check.sh local
```

**Résultat attendu** :
- ✅ Exit code 0 = Prêt pour le déploiement
- ⚠️ Exit code 0 avec warnings = Déploiement possible (vérifier warnings)
- ❌ Exit code 1 = Déploiement BLOQUÉ (corriger erreurs)

### Exemple Output

```
╔══════════════════════════════════════════════════════════════╗
║         VÉRIFICATION PRÉ-DÉPLOIEMENT (production)         ║
╚══════════════════════════════════════════════════════════════╝

▓▓▓ VÉRIFICATIONS CRITIQUES ▓▓▓

→ Configuration Base de Données
✓ DB_NAME: configuré
✓ DB_USER: configuré
✓ DB_PASSWORD: configuré
✓ DATABASE_URL: configuré

→ Configuration MinIO
✓ MINIO_ROOT_USER: configuré
✓ MINIO_ROOT_PASSWORD: configuré
✓ MINIO_ENDPOINT: configuré

▓▓▓ VÉRIFICATION COHÉRENCE DATABASE_URL ▓▓▓
✓ DATABASE_URL cohérent avec DB_NAME

▓▓▓ VÉRIFICATION DOCKER-COMPOSE ▓▓▓
✓ docker-compose.prod.yml: POSTGRES_DB utilise variable
✓ docker-compose.prod.yml: DATABASE_URL utilise variable
✓ docker-compose.prod.yml: healthcheck utilise variable

╔══════════════════════════════════════════════════════════════╗
║                        RÉSUMÉ                                ║
╚══════════════════════════════════════════════════════════════╝

✓ Aucun problème détecté

→ Prêt pour le déploiement !
```

## 📋 Checklist Manuelle (Complément)

### 1. Configuration Base de Données

```bash
# ✅ Vérifier que DB_NAME est défini
grep DB_NAME .env.production

# ✅ Vérifier que DATABASE_URL utilise ${DB_NAME}
grep DATABASE_URL .env.production

# ✅ Vérifier cohérence docker-compose.prod.yml
grep -E "POSTGRES_DB|DATABASE_URL" docker-compose.prod.yml
```

**Attendu** :
```bash
# .env.production
DB_NAME=qadhya
DATABASE_URL=postgresql://moncabinet:***@postgres:5432/${DB_NAME}

# docker-compose.prod.yml
POSTGRES_DB: ${DB_NAME:-qadhya}
DATABASE_URL: postgresql://${DB_USER}:${DB_PASSWORD}@postgres:5432/${DB_NAME:-qadhya}
```

### 2. Vérification VPS (avant déploiement)

```bash
# Se connecter au VPS
ssh root@84.247.165.187

# Vérifier que la base existe
docker exec qadhya-postgres psql -U moncabinet -c "\l" | grep qadhya

# Si la base n'existe pas, la créer
docker exec qadhya-postgres psql -U moncabinet -c "CREATE DATABASE qadhya OWNER moncabinet;"
docker exec qadhya-postgres psql -U moncabinet -d qadhya -c "CREATE EXTENSION IF NOT EXISTS vector;"
```

### 3. Vérification Post-Déploiement

```bash
# Health check
curl -s https://qadhya.tn/api/health | jq .

# Vérifier DATABASE_URL dans le container
docker exec qadhya-nextjs printenv DATABASE_URL

# Vérifier que l'app se connecte à la bonne base
docker compose -f /opt/moncabinet/docker-compose.prod.yml logs nextjs | grep -i "database"
```

## 🔧 Correction Erreurs Courantes

### Erreur: "database does not exist"

**Symptôme** :
```
FATAL: database "qadhya" does not exist
```

**Solution** :
```bash
# 1. Vérifier DB_NAME dans .env
grep DB_NAME /opt/moncabinet/.env

# 2. Créer la base si manquante
docker exec qadhya-postgres psql -U moncabinet -c "CREATE DATABASE qadhya OWNER moncabinet;"

# 3. Activer extension vector
docker exec qadhya-postgres psql -U moncabinet -d qadhya -c "CREATE EXTENSION IF NOT EXISTS vector;"

# 4. Redémarrer Next.js
docker compose -f /opt/moncabinet/docker-compose.prod.yml restart nextjs
```

### Erreur: DATABASE_URL incohérent

**Symptôme** :
```
✗ DATABASE_URL incohérent avec DB_NAME
   DB_NAME=qadhya
   DATABASE_URL=postgresql://...@postgres:5432/moncabinet
```

**Solution** :
```bash
# Corriger DATABASE_URL pour utiliser ${DB_NAME}
# Dans .env.production
DATABASE_URL=postgresql://moncabinet:PASSWORD@postgres:5432/${DB_NAME}
```

### Erreur: docker-compose.prod.yml hardcodé

**Symptôme** :
```
✗ docker-compose.prod.yml: POSTGRES_DB hardcodé
```

**Solution** :
```yaml
# Remplacer dans docker-compose.prod.yml
# AVANT
POSTGRES_DB: qadhya

# APRÈS
POSTGRES_DB: ${DB_NAME:-qadhya}
```

## 📝 Workflow Complet Déploiement

```bash
# 1. Vérification pré-déploiement
./scripts/pre-deploy-check.sh production

# 2. Commit et push si modifications
git add .
git commit -m "fix: Configuration DB_NAME pour éviter confusion"
git push origin main

# 3. Déployer (GitHub Actions ou manuel)
# GitHub Actions: automatique sur push main
# Manuel: ssh root@84.247.165.187 puis cd /opt/moncabinet && docker compose pull && docker compose up -d

# 4. Vérification post-déploiement
curl -s https://qadhya.tn/api/health | jq .
```

## 🛡️ Prévention Future

### Git Hooks (Recommandé)

Créer `.git/hooks/pre-commit` :
```bash
#!/bin/bash
./scripts/pre-deploy-check.sh local
if [ $? -ne 0 ]; then
  echo "❌ Vérification échouée - Commit annulé"
  exit 1
fi
```

Rendre exécutable :
```bash
chmod +x .git/hooks/pre-commit
```

### CI/CD Pipeline

Ajouter dans `.github/workflows/deploy.yml` :
```yaml
- name: Pre-deploy check
  run: |
    chmod +x scripts/pre-deploy-check.sh
    ./scripts/pre-deploy-check.sh production
```

## 📚 Références

- **Documentation complète** : [docs/DATABASE_CONFIG.md](./DATABASE_CONFIG.md)
- **Script** : [scripts/pre-deploy-check.sh](../scripts/pre-deploy-check.sh)
- **Mémoire projet** : `.claude/projects/memory/MEMORY.md`
- **Issue résolue** : Feb 10, 2026 - Confusion DB Name

## ⚠️ Notes Importantes

1. **Ne JAMAIS hardcoder** le nom de la base dans `docker-compose.yml`
2. **Toujours utiliser** `${DB_NAME}` avec valeur par défaut : `${DB_NAME:-qadhya}`
3. **Vérifier la cohérence** entre `.env` et `docker-compose.yml`
4. **Créer la base** sur le VPS AVANT le premier déploiement
5. **Tester localement** avant chaque déploiement production

---

**Dernière mise à jour** : 10 février 2026
**Mainteneur** : Équipe Qadhya
