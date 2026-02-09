# Configuration Google Drive pour MonCabinet

## Problème Identifié (Fév 2026)

**618 fichiers juridiques Google Drive** découverts mais **non téléchargeables** car les credentials sont manquants en production.

### État Actuel

```sql
-- Pages Drive dans la base
SELECT COUNT(*) FROM web_pages
WHERE web_source_id = '546d11c8-b3fd-4559-977b-c3572aede0e4';
-- Résultat : 618 pages

-- Contenu téléchargé
SELECT COUNT(*) FROM web_pages
WHERE web_source_id = '546d11c8-b3fd-4559-977b-c3572aede0e4'
  AND extracted_text IS NOT NULL;
-- Résultat : 0 pages (0% téléchargé)
```

### Cause

Variables d'environnement manquantes sur le VPS de production :
- `GOOGLE_DRIVE_ENABLED`
- `GOOGLE_SERVICE_ACCOUNT_KEY`
- `GOOGLE_CLIENT_EMAIL`

## Solution : Configuration des Credentials

### Étape 1 : Créer un Service Account Google

1. Accéder à [Google Cloud Console](https://console.cloud.google.com/)
2. Créer un nouveau projet ou sélectionner un projet existant
3. Activer l'API Google Drive :
   - Navigation : **APIs & Services** > **Library**
   - Rechercher **Google Drive API**
   - Cliquer sur **Enable**

4. Créer un Service Account :
   - Navigation : **IAM & Admin** > **Service Accounts**
   - Cliquer sur **Create Service Account**
   - Nom : `moncabinet-drive-reader`
   - Description : `Service account pour lecture Drive MonCabinet`
   - Rôle : **Viewer** (lecture seule)

5. Créer une clé JSON :
   - Cliquer sur le service account créé
   - Onglet **Keys** > **Add Key** > **Create new key**
   - Type : **JSON**
   - Télécharger le fichier `service-account-key.json`

### Étape 2 : Partager le Dossier Drive

1. Ouvrir Google Drive
2. Localiser le dossier "Qadhya KB" (ID: `1y1lh3G4Dwvg7QobpcyiOfQ2YZsNYDitS`)
3. Clic droit > **Partager**
4. Ajouter l'email du service account (format: `xxx@xxx.iam.gserviceaccount.com`)
5. Permissions : **Lecteur** (Reader)

### Étape 3 : Configurer les Variables d'Environnement (Production)

#### Option A : Docker Compose (Recommandé)

Éditer `/opt/moncabinet/docker-compose.prod.yml` :

```yaml
services:
  nextjs:
    environment:
      # ... autres variables ...

      # Google Drive Configuration
      GOOGLE_DRIVE_ENABLED: "true"
      GOOGLE_CLIENT_EMAIL: "moncabinet-drive-reader@project-id.iam.gserviceaccount.com"
      GOOGLE_SERVICE_ACCOUNT_KEY: |
        {
          "type": "service_account",
          "project_id": "your-project-id",
          "private_key_id": "xxx",
          "private_key": "-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n",
          "client_email": "xxx@xxx.iam.gserviceaccount.com",
          "client_id": "xxx",
          "auth_uri": "https://accounts.google.com/o/oauth2/auth",
          "token_uri": "https://oauth2.googleapis.com/token",
          "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
          "client_x509_cert_url": "xxx"
        }
```

**Relancer le container** :
```bash
cd /opt/moncabinet
docker compose -f docker-compose.prod.yml up -d nextjs
```

#### Option B : Fichier .env

Si utilisation d'un fichier .env, créer `/opt/moncabinet/.env.local` :

```bash
GOOGLE_DRIVE_ENABLED=true
GOOGLE_CLIENT_EMAIL=moncabinet-drive-reader@project-id.iam.gserviceaccount.com
GOOGLE_SERVICE_ACCOUNT_KEY='{"type":"service_account",...}'
```

### Étape 4 : Vérifier la Configuration

```bash
# Test de connexion
curl -X POST http://localhost:3000/api/admin/gdrive/test-connection \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -d '{"folderId": "1y1lh3G4Dwvg7QobpcyiOfQ2YZsNYDitS"}'

# Résultat attendu
{
  "success": true,
  "accessible": true,
  "filesCount": 618
}
```

### Étape 5 : Relancer le Crawl avec Téléchargement

Une fois les credentials configurés, relancer le crawl :

```sql
-- Créer un nouveau job de crawl avec téléchargement
INSERT INTO web_crawl_jobs (web_source_id, job_type, status, priority, params)
VALUES (
  '546d11c8-b3fd-4559-977b-c3572aede0e4',
  'full_crawl',
  'pending',
  9,
  '{"downloadFiles": true, "indexAfterCrawl": true}'::jsonb
);
```

Ou via API :

```bash
CRON_SECRET=$(docker exec moncabinet-nextjs env | grep CRON_SECRET | cut -d= -f2)

# Déclencher le crawler
curl -X GET "http://localhost:3000/api/cron/web-crawler" \
  -H "Authorization: Bearer $CRON_SECRET"
```

### Étape 6 : Surveiller la Progression

```sql
-- Vérifier le téléchargement des fichiers
SELECT
  COUNT(*) as total,
  COUNT(*) FILTER (WHERE (linked_files->0->>'downloaded')::boolean = true) as downloaded,
  COUNT(*) FILTER (WHERE extracted_text IS NOT NULL) as parsed
FROM web_pages
WHERE web_source_id = '546d11c8-b3fd-4559-977b-c3572aede0e4';
```

## Sécurité

⚠️ **IMPORTANT** :
- Ne JAMAIS commiter les credentials dans Git
- Utiliser des secrets GitHub Actions pour CI/CD
- Restreindre les permissions du service account (lecture seule)
- Monitorer l'utilisation via Google Cloud Console

## Dépannage

### Erreur : "403 Forbidden"
→ Le service account n'a pas accès au dossier Drive. Vérifier le partage.

### Erreur : "Invalid credentials"
→ Vérifier le format du JSON et les quotes. Utiliser `|` pour multilignes en YAML.

### Fichiers non téléchargés
→ Vérifier que `GOOGLE_DRIVE_ENABLED=true` et que le container a redémarré.

### Performance lente
→ Normal. 618 fichiers × ~2-3s = ~30-40 minutes de téléchargement.

## Références

- [Google Drive API Documentation](https://developers.google.com/drive/api/v3/about-sdk)
- [Service Account Authentication](https://cloud.google.com/iam/docs/service-accounts)
- Code source : `lib/web-scraper/gdrive-crawler-service.ts`
