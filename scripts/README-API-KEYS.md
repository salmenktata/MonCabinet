# 🔑 Scripts de Gestion des Clés API

> **Source unique de vérité** : `/opt/qadhya/.env.production.local`

---

## 📋 Scripts disponibles

### 1. `sync-env-to-db.ts` ⭐ (Principal)

**Usage** : Synchroniser les clés depuis `.env.production.local` vers la base de données

```bash
npx tsx scripts/sync-env-to-db.ts
```

**Quand l'utiliser** :
- ✅ Après avoir modifié une clé dans `.env.production.local`
- ✅ Après avoir ajouté une nouvelle clé
- ✅ Pour s'assurer que la DB est à jour

**Ce qu'il fait** :
1. Lit les clés depuis `/opt/qadhya/.env.production.local`
2. Crypte les clés avec AES-256-GCM
3. Met à jour la table `api_keys` dans PostgreSQL
4. Active automatiquement toutes les clés

---

### 2. `decrypt-and-export-keys.ts`

**Usage** : Exporter les clés depuis la DB vers `.env.production.local`

```bash
npx tsx scripts/decrypt-and-export-keys.ts
```

**Quand l'utiliser** :
- ✅ Migration initiale (DB → .env)
- ✅ Restauration après perte du fichier .env
- ✅ Backup des clés actuelles

**Ce qu'il fait** :
1. Lit les clés cryptées depuis la DB
2. Décrypte les clés avec AES-256-GCM
3. Génère un fichier `.env.production.local`
4. Crée un backup local dans `.secrets/`

---

### 3. `update-api-keys.ts`

**Usage** : Mettre à jour des clés spécifiques (Gemini, OpenAI, etc.)

```bash
npx tsx scripts/update-api-keys.ts
```

**Quand l'utiliser** :
- ✅ Mise à jour d'une clé spécifique
- ✅ Changement de modèle par défaut

**Ce qu'il fait** :
1. Met à jour `.env.production.local`
2. Crypte et met à jour la DB
3. Crée un backup automatique

---

### 4. `test-decrypted-keys.sh`

**Usage** : Tester toutes les clés API

```bash
bash scripts/test-decrypted-keys.sh
```

**Quand l'utiliser** :
- ✅ Après avoir mis à jour une clé
- ✅ Pour vérifier l'état de toutes les clés
- ✅ Diagnostic d'un problème de clé

**Ce qu'il fait** :
1. Lit `.env.production.local` sur le serveur
2. Teste chaque clé avec un appel API réel
3. Affiche le statut de chaque provider (✅/❌)

**Exemple de sortie** :
```
============================================================
🔑 1/5 - Test OLLAMA
============================================================
✅ SUCCÈS (2830ms)
📊 Ollama local est opérationnel

============================================================
🔑 2/5 - Test GEMINI
============================================================
✅ SUCCÈS (1200ms)
📊 Réponse: Hello.
```

---

### 5. `test-new-keys.sh`

**Usage** : Tester des nouvelles clés avant de les configurer

```bash
bash scripts/test-new-keys.sh
```

**Quand l'utiliser** :
- ✅ Avant de configurer une nouvelle clé
- ✅ Pour vérifier qu'une clé est valide

---

## 🔄 Workflow typique

### Ajouter/Modifier une clé

```bash
# 1. Éditer le fichier source
ssh root@84.247.165.187
nano /opt/qadhya/.env.production.local

# 2. Synchroniser vers la DB
npx tsx scripts/sync-env-to-db.ts

# 3. Redémarrer l'application
ssh root@84.247.165.187 "docker restart qadhya-nextjs"

# 4. Tester
bash scripts/test-decrypted-keys.sh
```

---

## 📊 État actuel (11 février 2026)

```
Provider  | Statut | Modèle
----------|--------|------------------------
Gemini    | ✅     | gemini-2.5-flash
OpenAI    | ✅     | text-embedding-3-small
Groq      | ✅     | llama-3.3-70b-versatile
DeepSeek  | ✅     | deepseek-chat
Ollama    | ✅     | qwen2.5:3b (local)
```

---

## 🔒 Sécurité

- **Fichier .env** : Permissions `600` (root uniquement)
- **Cryptage** : AES-256-GCM avec `ENCRYPTION_KEY`
- **Backups** : Automatiques dans `.secrets/` (ignoré par Git)
- **Audit** : Vérifier `last_used_at` régulièrement

---

## 🆘 Dépannage

### Erreur : "ENCRYPTION_KEY manquante"

```bash
# Vérifier que ENCRYPTION_KEY est dans .env.production.local
ssh root@84.247.165.187 "grep ENCRYPTION_KEY /opt/qadhya/.env.production.local"
```

### Erreur : "Clé invalide" ou "HTTP 401/403"

```bash
# Tester la clé directement
bash scripts/test-decrypted-keys.sh
```

### Clé perdue / Fichier .env supprimé

```bash
# Exporter depuis la DB (si les clés y sont encore)
npx tsx scripts/decrypt-and-export-keys.ts
```

---

## 📚 Documentation complète

Voir : `docs/API_KEYS_MANAGEMENT.md`

---

**Dernière mise à jour** : 11 février 2026
