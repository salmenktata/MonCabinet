# Configuration Base de Données PostgreSQL

## ⚠️ Problème Résolu : Confusion Nom Base de Données (Feb 10, 2026)

### Symptôme
L'application tentait de se connecter à une base de données inexistante, causant une erreur :
```
FATAL: database "qadhya" does not exist
```

### Cause Racine
Le nom de la base de données était hardcodé dans `docker-compose.prod.yml` :
- Variable `POSTGRES_DB: qadhya` (ligne 10)
- DATABASE_URL avec `/qadhya` hardcodé (ligne 122)
- Health check avec `-d qadhya` hardcodé (ligne 20)

### Solution Implémentée

#### 1. Variable d'Environnement `DB_NAME`
Ajout d'une variable configurable avec valeur par défaut :

```yaml
# docker-compose.prod.yml
environment:
  POSTGRES_DB: ${DB_NAME:-qadhya}
  DATABASE_URL: postgresql://${DB_USER}:${DB_PASSWORD}@postgres:5432/${DB_NAME:-qadhya}
```

**Syntaxe** : `${DB_NAME:-qadhya}` signifie "utiliser `DB_NAME` si défini, sinon utiliser `qadhya`"

#### 2. Configuration .env.production
```bash
# .env.production
DB_NAME=qadhya
DB_USER=moncabinet
DB_PASSWORD=prod_secure_password_2026
DATABASE_URL=postgresql://moncabinet:prod_secure_password_2026@postgres:5432/${DB_NAME}
```

### Vérification Post-Fix

#### Vérifier le nom de la base active
```bash
# Sur le VPS
docker exec qadhya-postgres psql -U moncabinet -c "\l"
```

Doit afficher :
- `moncabinet` (ancienne base, conservée pour référence)
- `qadhya` (base active pour production)

#### Vérifier DATABASE_URL dans le container
```bash
docker exec qadhya-nextjs printenv DATABASE_URL
```

Doit afficher :
```
postgresql://moncabinet:prod_secure_password_2026@postgres:5432/qadhya
```

### Migration des Données (Si Nécessaire)

Si vous devez copier les données de `moncabinet` vers `qadhya` :

```bash
# 1. Dump de la base source
docker exec qadhya-postgres pg_dump -U moncabinet -d moncabinet > /tmp/moncabinet_dump.sql

# 2. Création base cible (si n'existe pas)
docker exec qadhya-postgres psql -U moncabinet -c "CREATE DATABASE qadhya OWNER moncabinet;"
docker exec qadhya-postgres psql -U moncabinet -d qadhya -c "CREATE EXTENSION IF NOT EXISTS vector;"

# 3. Restore vers la base cible
docker exec -i qadhya-postgres psql -U moncabinet -d qadhya < /tmp/moncabinet_dump.sql

# 4. Redémarrer Next.js
docker compose -f docker-compose.prod.yml restart nextjs
```

### Statistiques Post-Migration (Feb 10, 2026)

| Élément | Valeur |
|---------|--------|
| Tables | 76 |
| Users | 2 |
| Knowledge Base | 580 documents |
| Chunks avec embeddings | ~463 |
| Taille dump SQL | 67 MB |

### Prévention Future

#### ✅ À FAIRE
1. **Toujours utiliser `DB_NAME`** dans les configurations
2. **Vérifier la variable** avant le déploiement :
   ```bash
   grep DB_NAME .env.production
   ```
3. **Documenter les changements** de nom de base

#### ❌ À NE PAS FAIRE
- Hardcoder le nom de la base dans `docker-compose.yml`
- Oublier de créer la base avant le premier démarrage
- Mélanger les noms `moncabinet` et `qadhya` sans documentation

### Checklist Déploiement

Avant chaque déploiement, vérifier :

- [ ] Variable `DB_NAME` définie dans `.env.production`
- [ ] `DATABASE_URL` utilise `${DB_NAME}` (pas hardcodé)
- [ ] Base de données existe sur le serveur cible
- [ ] Extension `vector` activée dans la base
- [ ] Migrations appliquées si nécessaire

### Commandes Utiles

```bash
# Lister les bases
docker exec qadhya-postgres psql -U moncabinet -c "\l"

# Lister les tables dans une base
docker exec qadhya-postgres psql -U moncabinet -d qadhya -c "\dt"

# Compter les enregistrements
docker exec qadhya-postgres psql -U moncabinet -d qadhya -c "SELECT COUNT(*) FROM knowledge_base;"

# Vérifier les extensions
docker exec qadhya-postgres psql -U moncabinet -d qadhya -c "SELECT * FROM pg_extension;"

# Backup complet
docker exec qadhya-postgres pg_dump -U moncabinet -d qadhya > backup_$(date +%Y%m%d_%H%M%S).sql
```

### Références

- Issue résolue : Feb 10, 2026 12:11 CET
- Commits : à venir (ajout variable `DB_NAME`)
- Documentation mise à jour : `docs/DATABASE_CONFIG.md`
- Mémoire projet : `.claude/projects/memory/MEMORY.md`

---

**Note** : Cette documentation doit être maintenue à jour à chaque modification de la configuration base de données.
