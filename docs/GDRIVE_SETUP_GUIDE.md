# Guide de Configuration Google Drive - Production

**Objectif :** Configurer l'accès Google Drive pour permettre le crawl de dossiers partagés.

---

## 🚀 Configuration Rapide (20 minutes)

### Étape 1 : Créer le Service Account sur Google Cloud

1. **Ouvrir Google Cloud Console**
   → [https://console.cloud.google.com/iam-admin/serviceaccounts?project=qadhya](https://console.cloud.google.com/iam-admin/serviceaccounts?project=qadhya)

2. **Créer un compte de service**
   - Cliquer sur **"Créer un compte de service"**
   - **Nom** : `qadhya-gdrive-crawler`
   - **Description** : `Service account pour crawl automatique des dossiers Google Drive`
   - Cliquer sur **"Créer et continuer"**

3. **Rôle** (optionnel)
   - Laisser vide (aucun rôle nécessaire)
   - Cliquer sur **"Continuer"** puis **"OK"**

4. **Générer une clé JSON**
   - Dans la liste des service accounts, cliquer sur `qadhya-gdrive-crawler`
   - Onglet **"Clés"** → **"Ajouter une clé"** → **"Créer une clé"**
   - Format : **JSON**
   - Cliquer sur **"Créer"**
   - **Télécharger le fichier** (ex: `qadhya-xxxxxx.json`)

5. **Noter l'email du service account**
   ```
   qadhya-gdrive-crawler@qadhya.iam.gserviceaccount.com
   ```

---

### Étape 2 : Partager le Dossier Google Drive

1. **Ouvrir le dossier Google Drive**
   → [https://drive.google.com/drive/folders/1-7j08Uivjn5XSNckuSwSxQcBkvZJvCtl](https://drive.google.com/drive/folders/1-7j08Uivjn5XSNckuSwSxQcBkvZJvCtl)

2. **Partager avec le service account**
   - Clic droit → **"Partager"**
   - Ajouter l'email : `qadhya-gdrive-crawler@qadhya.iam.gserviceaccount.com`
   - Permission : **Lecteur** (lecture seule)
   - **Désactiver** "Informer les utilisateurs" (c'est un robot)
   - Cliquer sur **"Partager"**

---

### Étape 3 : Déployer la Configuration sur le Serveur

**Méthode automatique (recommandée) :**

```bash
# Depuis votre machine locale (répertoire du projet)
./scripts/deploy-gdrive-config.sh ~/Downloads/qadhya-xxxxxx.json
```

**Le script va :**
- ✅ Valider le fichier JSON
- ✅ Copier le fichier sur le serveur
- ✅ Insérer les credentials dans PostgreSQL
- ✅ Tester la connexion au dossier Google Drive
- ✅ Nettoyer les fichiers temporaires

**Méthode manuelle (si le script échoue) :**

```bash
# 1. Copier le fichier JSON sur le serveur
scp ~/Downloads/qadhya-*.json root@84.247.165.187:/tmp/service-account.json

# 2. Se connecter au serveur
ssh root@84.247.165.187

# 3. Insérer dans PostgreSQL
cd /opt/moncabinet
cat /tmp/service-account.json | docker compose exec -T postgres psql -U moncabinet -d moncabinet <<'EOSQL'
\set json_content `cat /tmp/service-account.json`
INSERT INTO system_settings (key, value)
VALUES ('google_drive_service_account', :'json_content'::jsonb)
ON CONFLICT (key) DO UPDATE
SET value = EXCLUDED.value, updated_at = NOW();
EOSQL

# 4. Nettoyer
rm /tmp/service-account.json
```

---

### Étape 4 : Vérifier la Configuration

```bash
# Sur le serveur de production
ssh root@84.247.165.187

cd /opt/moncabinet

# Vérifier que la clé existe
docker compose exec -T postgres psql -U moncabinet -d moncabinet -c \
  "SELECT key, created_at FROM system_settings WHERE key = 'google_drive_service_account';"

# Tester la connexion au dossier
docker compose exec nextjs npx tsx scripts/test-gdrive-connection.ts \
  "1-7j08Uivjn5XSNckuSwSxQcBkvZJvCtl"
```

**Résultat attendu :**
```
✅ Variables d'environnement configurées
✅ Connexion réussie
✅ 10 fichier(s) découvert(s)
```

---

### Étape 5 : Créer une Source depuis l'Interface Web

1. **Ouvrir l'interface admin**
   → [https://qadhya.tn/super-admin/web-sources/new](https://qadhya.tn/super-admin/web-sources/new)

2. **Remplir le formulaire**
   - **Nom** : Documents juridiques Google Drive
   - **Catégorie** : Google Drive
   - **URL** : `https://drive.google.com/drive/folders/1-7j08Uivjn5XSNckuSwSxQcBkvZJvCtl`
   - **Types de fichiers** : PDF, DOCX
   - **Récursif** : Oui (pour crawler les sous-dossiers)

3. **Tester et sauvegarder**

4. **Lancer le crawl**
   - Aller dans les détails de la source
   - Cliquer sur "Synchroniser maintenant"

---

## 🔍 Vérification du Crawl

```bash
# Voir les logs du crawler
docker compose logs -f --tail=100 nextjs | grep "GDrive"

# Vérifier les pages crawlées
docker compose exec -T postgres psql -U moncabinet -d moncabinet -c \
  "SELECT COUNT(*) FROM web_pages WHERE source_id = (
    SELECT id FROM web_sources WHERE category = 'google_drive' LIMIT 1
  );"

# Vérifier l'indexation
docker compose exec -T postgres psql -U moncabinet -d moncabinet -c \
  "SELECT COUNT(*) FROM kb_documents WHERE metadata->>'source' = 'Google Drive';"
```

---

## 🆘 Dépannage

### Erreur : "Access denied" (403)

**Cause** : Le dossier n'est pas partagé avec le service account

**Solution** :
1. Vérifier que l'email du service account est bien dans les partages du dossier
2. Vérifier que la permission est "Lecteur"
3. Attendre quelques minutes (propagation)

### Erreur : "Folder not found" (404)

**Cause** : Le folderId est incorrect

**Solution** :
1. Vérifier l'URL du dossier (format : `/folders/FOLDER_ID`)
2. Vérifier que le dossier n'a pas été supprimé

### Erreur : "Invalid credentials"

**Cause** : Le fichier JSON est invalide ou corrompu

**Solution** :
1. Re-télécharger le fichier JSON depuis Google Cloud Console
2. Vérifier le format JSON avec : `jq . fichier.json`
3. Re-déployer avec le nouveau fichier

### Le message d'erreur persiste sur la page web

**Cause** : Le cache Next.js n'est pas rafraîchi

**Solution** :
```bash
# Redémarrer Next.js
docker compose restart nextjs

# Vider le cache
docker compose exec nextjs rm -rf .next/cache
docker compose restart nextjs
```

---

## 🔐 Sécurité

### ✅ Bonnes Pratiques Appliquées

1. **Permissions minimales** : Le service account n'a accès qu'aux dossiers explicitement partagés
2. **Lecture seule** : Permission "Lecteur" uniquement
3. **Stockage sécurisé** : Credentials dans PostgreSQL (pas dans le code)
4. **Audit logs** : Tous les accès sont tracés dans Google Cloud Console

### 🔄 Rotation des Clés

Si la clé est compromise :

1. **Révoquer la clé compromise**
   - Google Cloud Console → Service Account → Clés → Supprimer

2. **Créer une nouvelle clé**
   - Suivre l'Étape 1 de ce guide

3. **Redéployer**
   ```bash
   ./scripts/deploy-gdrive-config.sh ~/Downloads/nouvelle-cle.json
   ```

---

## 📊 Monitoring

### Vérifier les Quotas Google Drive API

- Dashboard : [https://console.cloud.google.com/apis/api/drive.googleapis.com/quotas?project=qadhya](https://console.cloud.google.com/apis/api/drive.googleapis.com/quotas?project=qadhya)
- Limite par défaut : **1M requêtes/jour**
- Coût : **Gratuit**

### Alertes à Configurer

- Quota Google Drive > 80%
- Erreurs de crawl > 10 par jour
- Service account révoqué

---

## 📚 Ressources

- [Google Drive API](https://developers.google.com/drive/api/guides/about-sdk)
- [Service Accounts](https://cloud.google.com/iam/docs/service-accounts)
- [GDRIVE_IMPLEMENTATION.md](../GDRIVE_IMPLEMENTATION.md) - Documentation technique
- [GOOGLE_DRIVE_PRODUCTION_SETUP.md](./GOOGLE_DRIVE_PRODUCTION_SETUP.md) - Guide détaillé

---

## ✅ Checklist Finale

- [ ] Service account créé sur Google Cloud Console
- [ ] Clé JSON téléchargée
- [ ] Dossier Google Drive partagé avec le service account
- [ ] Configuration déployée sur le serveur
- [ ] Test de connexion réussi
- [ ] Source créée dans l'interface web
- [ ] Premier crawl lancé
- [ ] Documents indexés dans la base de connaissances
- [ ] Test de recherche RAG fonctionnel

---

**Temps total estimé** : 20-30 minutes

**Support** : Si vous rencontrez un problème, consultez la section Dépannage ou les logs du serveur.
