# Migration Supabase Storage → Google Drive

**Date** : 5 février 2026
**Version** : 1.0.0
**Statut** : ✅ Complété

---

## 📋 Résumé

Migration complète du système de stockage documents de **Supabase Storage** vers **Google Drive** avec architecture hiérarchique client-first.

### Objectifs

1. ✅ **Sécurité** : Documents stockés sur le Google Drive de l'avocat (pas sur nos serveurs)
2. ✅ **Conformité RGPD** : Données sensibles jamais stockées sur la plateforme
3. ✅ **Scalabilité** : Pas de limite de stockage (utilise quota Google Drive utilisateur)
4. ✅ **Organisation** : Structure hiérarchique automatique (Client → Dossier juridique)
5. ✅ **Synchronisation** : Support bidirectionnelle (ajout manuel dans Drive = apparaît dans app)

---

## 🔄 Changements Majeurs

### 1. **Base de Données**

#### Nouvelles Tables

| Table | Description |
|-------|-------------|
| `cloud_providers_config` | Configuration OAuth Google Drive par utilisateur |
| `messaging_webhooks_config` | Configuration WhatsApp Business (future feature) |
| `pending_documents` | Documents en attente de rattachement manuel |
| `sync_logs` | Logs synchronisation bidirectionnelle |

#### Extensions Tables Existantes

**Table `documents`** :
- ✅ `storage_provider` : 'google_drive' | 'supabase' (legacy)
- ✅ `external_file_id` : ID fichier Google Drive
- ✅ `external_folder_client_id` : ID dossier client Google Drive
- ✅ `external_folder_dossier_id` : ID dossier juridique Google Drive
- ✅ `external_sharing_link` : Lien partageable Google Drive
- ✅ `external_metadata` : Métadonnées fichier (JSONB)
- ✅ `source_type` : 'manual' | 'whatsapp' | 'google_drive_sync'
- ✅ `source_metadata` : Métadonnées source (JSONB)
- ✅ `needs_classification` : Boolean (true si dans "Documents non classés/")
- ✅ `classified_at` : Timestamp classification manuelle
- ⚠️ `storage_path` : Devient NULLABLE (legacy documents uniquement)

**Table `clients`** :
- ✅ `telephone_normalized` : Format E.164 (+21612345678) pour WhatsApp
- ✅ `google_drive_folder_id` : ID dossier client Google Drive
- ✅ `google_drive_folder_url` : Lien direct dossier client

**Table `dossiers`** :
- ✅ `google_drive_folder_id` : ID dossier juridique Google Drive
- ✅ `google_drive_folder_url` : Lien direct dossier juridique

### 2. **Architecture Cloud Storage**

#### Structure Hiérarchique Google Drive

```
Google Drive de l'avocat :
├── Clients MonCabinet/                       ← Dossier racine
│   ├── [DUPONT Jean - CIN 12345678]/         ← Dossier client
│   │   ├── Dossier 2025-001 (Divorce)/       ← Dossier juridique
│   │   │   ├── Requête.pdf
│   │   │   └── Jugement.pdf
│   │   ├── Dossier 2025-015 (Succession)/
│   │   │   └── Testament.pdf
│   │   └── Documents non classés/            ← Zone tampon
│   │
│   └── [MARTIN Sophie - Société SARL]/
│       └── Dossier 2025-003 (Commercial)/
│           └── Contrat.pdf
```

#### Avantages

- ✅ **Organisation naturelle** : 1 client = 1 dossier (clarté visuelle)
- ✅ **Scalabilité** : Plusieurs dossiers juridiques par client
- ✅ **Flexibilité** : Avocat peut ajouter documents manuellement depuis Google Drive
- ✅ **Zone tampon** : Documents non classés en attente de rattachement

### 3. **Services & Intégrations**

#### Nouveaux Services

| Service | Fichier | Description |
|---------|---------|-------------|
| **GoogleDriveProvider** | `/lib/integrations/cloud-storage/google-drive.ts` | Implémentation API Google Drive (OAuth, upload, download, delete) |
| **StorageManager** | `/lib/integrations/storage-manager.ts` | Orchestrateur uploads avec structure hiérarchique automatique |

#### Fonctionnalités OAuth

- ✅ OAuth 2.0 flow complet (authorization code grant)
- ✅ Refresh automatique tokens expirés
- ✅ Tokens chiffrés en BDD (pg_crypto)
- ✅ Scopes : `drive.file` (fichiers créés par l'app uniquement)

### 4. **Actions Serveur** (`app/actions/documents.ts`)

#### Changements

| Action | Avant | Après |
|--------|-------|-------|
| `uploadDocumentAction` | Supabase Storage bucket | StorageManager → Google Drive |
| `deleteDocumentAction` | Suppression bucket Supabase | Suppression Google Drive API |
| `getDocumentUrlAction` | Signed URL Supabase (1h) | Lien partageable Google Drive (permanent) |
| `downloadDocumentAction` | ❌ N'existait pas | ✅ Nouveau : Download depuis Google Drive |
| `ensureStorageBucketAction` | ✅ Existait | ❌ **SUPPRIMÉ** (plus nécessaire) |

#### Gestion Erreurs

```typescript
// Nouvelles erreurs spécifiques
- TOKEN_EXPIRED : Token Google Drive expiré
- QUOTA_EXCEEDED : Quota Google Drive dépassé
- CONFIG_NOT_FOUND : Configuration Google Drive manquante
- FILE_NOT_FOUND : Fichier introuvable sur Google Drive
```

### 5. **Routes API**

#### Nouvelles Routes

| Route | Méthode | Description |
|-------|---------|-------------|
| `/api/integrations/google-drive/callback` | GET | Callback OAuth Google (échange code → tokens) |
| `/api/webhooks/google-drive` | GET | Vérification webhook Google Drive |
| `/api/webhooks/google-drive` | POST | Réception notifications changements (Push Notifications) |

### 6. **UI & Paramètres**

#### Nouvelle Page

- ✅ `/app/(dashboard)/parametres/cloud-storage/page.tsx`
- ✅ Composant `/components/parametres/CloudStorageConfig.tsx`

#### Fonctionnalités UI

- ✅ Bouton "Connecter Google Drive" (redirect OAuth)
- ✅ Affichage compte connecté (email, date)
- ✅ Bouton "Déconnecter" avec confirmation
- ✅ Toggle "Synchronisation bidirectionnelle"
- ✅ Fréquence polling (15/30/60 min)
- ✅ Informations sécurité/structure dossiers

---

## 🔧 Variables Environnement

### Nouvelles Variables Requises

```bash
# Google Drive OAuth
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-your-client-secret
GOOGLE_REDIRECT_URI=http://localhost:7002/api/integrations/google-drive/callback
GOOGLE_DRIVE_WEBHOOK_VERIFY_TOKEN=generate-with-openssl-rand-hex-32
```

### Configuration Google Cloud Console

Voir documentation complète : [`docs/GOOGLE_DRIVE_SETUP.md`](./GOOGLE_DRIVE_SETUP.md)

---

## 📦 Dépendances NPM

### Nouvelles Dépendances

```json
{
  "dependencies": {
    "googleapis": "^133.0.0"
  },
  "devDependencies": {
    "@types/google-apps-script": "^1.0.76"
  }
}
```

Installation :
```bash
npm install googleapis
npm install --save-dev @types/google-apps-script
```

---

## 🧪 Tests

### Tests Unitaires

✅ **Service Google Drive** :
- OAuth flow (getAuthUrl, exchangeCodeForTokens, refreshAccessToken)
- Upload fichier avec permissions partageables
- Download fichier
- Delete fichier
- Création dossiers
- Watch folder (Push Notifications)

✅ **Storage Manager** :
- Création structure hiérarchique automatique
- Réutilisation dossiers existants (pas de doublons)
- Refresh token si expiré
- Rollback en cas d'erreur

### Tests End-to-End

⏳ **À effectuer** (Tâche #17) :
1. Upload document depuis interface → Vérifier structure Google Drive
2. Consultation document → Lien Google Drive s'ouvre
3. Suppression document → Fichier supprimé Google Drive + BDD
4. Token expiré → Refresh automatique fonctionne
5. Déconnexion → Impossible d'uploader (message clair)

---

## ⚠️ Breaking Changes

### 1. **Bucket Supabase Storage**

❌ **SUPPRIMÉ** : Bucket `dossiers-documents`
- Documents existants en Supabase Storage deviennent **inaccessibles**
- Message utilisateur : "Document legacy non accessible. Veuillez re-uploader le document."

### 2. **Obligation Google Drive**

⚠️ **Google Drive obligatoire** pour uploader documents
- Utilisateur doit connecter Google Drive dans Paramètres
- Upload impossible sans configuration Google Drive
- Message : "Google Drive non connecté. Veuillez configurer le stockage cloud dans les paramètres."

### 3. **API getDocumentUrlAction**

**Avant** :
```typescript
{ success: true, url: "https://supabase.co/storage/v1/object/sign/..." }
```

**Après** :
```typescript
{
  success: true,
  url: "https://drive.google.com/file/d/...",
  provider: "google_drive"
}
```

### 4. **Structure BDD documents**

⚠️ Nouveaux champs **OBLIGATOIRES** pour nouveaux documents :
- `storage_provider` : 'google_drive'
- `external_file_id` : ID Google Drive
- `external_sharing_link` : Lien partageable

---

## 🚀 Déploiement

### Étapes Production

1. **Prérequis** :
   - ✅ Migrations BDD appliquées (`20260205000006`, `20260205000007`, `20260205000008`)
   - ✅ Variables environnement configurées (Google OAuth)
   - ✅ Google Cloud Console configuré (OAuth Client ID)

2. **Déploiement** :
   ```bash
   # 1. Pull dernières modifications
   git pull origin main

   # 2. Installer dépendances
   npm install

   # 3. Appliquer migrations Supabase
   npx supabase db push

   # 4. Build production
   npm run build

   # 5. Démarrer serveur
   npm run start
   ```

3. **Post-déploiement** :
   - ✅ Tester OAuth flow Google Drive
   - ✅ Tester upload document
   - ✅ Vérifier structure Google Drive créée
   - ✅ Tester consultation/suppression document

---

## 📊 Métriques de Succès

### Adoption

- **Objectif** : 100% utilisateurs connectent Google Drive (obligatoire)
- **KPI** : Temps moyen connexion Google Drive < 2 minutes

### Performance

- **Upload** : < 5 secondes pour fichier 1 MB
- **Consultation** : Lien Google Drive ouvert < 1 seconde
- **Token refresh** : Transparent pour utilisateur (< 1 seconde)

### Fiabilité

- **Taux succès upload** : > 99%
- **Taux erreur TOKEN_EXPIRED** : < 1% (refresh automatique)
- **Disponibilité Google Drive API** : > 99.9% (SLA Google)

---

## 🔮 Futures Améliorations

### Phase 2 (Optionnel)

1. **Multi-providers** :
   - Support OneDrive (Microsoft 365)
   - Support Dropbox
   - Choix provider par défaut

2. **Synchronisation bidirectionnelle** :
   - ✅ Webhook Google Drive (implémenté)
   - ⏳ Service synchronisation complète (Tâche #5)
   - ⏳ Widget "Documents à classer" (Tâche #9)

3. **Fonctionnalités avancées** :
   - Versioning documents (historique Google Drive)
   - Prévisualisation intégrée (embed PDF/images)
   - Partage clients (liens temporaires Google Drive)
   - OCR automatique (Google Cloud Vision API)

---

## 📚 Documentation Complémentaire

- [Configuration Google Drive](./GOOGLE_DRIVE_SETUP.md) - Guide complet configuration Google Cloud Console
- [Architecture Cloud Storage](../lib/integrations/cloud-storage/README.md) - Documentation technique services
- [API Actions Documents](../app/actions/documents.ts) - Code source actions serveur

---

## ✅ Checklist Migration Complétée

### Backend

- [x] Migrations BDD (3 migrations)
- [x] Service Google Drive (OAuth + API)
- [x] Storage Manager (orchestrateur)
- [x] Actions documents adaptées
- [x] Routes API OAuth + Webhooks
- [x] Actions cloud storage (5 actions)

### Frontend

- [x] Page configuration cloud storage
- [x] Composant CloudStorageConfig
- [x] Messages d'erreur spécifiques
- [ ] Traductions FR/AR complètes (⏳ Tâche future)

### Documentation

- [x] Guide configuration Google Cloud Console
- [x] Documentation migration (ce fichier)
- [x] Variables environnement (.env.example)
- [x] Commentaires code (tous fichiers)

### Tests

- [x] Tests unitaires services (mocks)
- [ ] Tests end-to-end complets (⏳ Tâche #17)
- [ ] Tests charge/performance (⏳ Tâche future)

---

**Migration complétée avec succès le 5 février 2026** 🎉

Pour toute question, consulter la documentation ou contacter l'équipe technique.
