# Guide de Configuration - Avocat SaaS

Ce guide explique comment configurer toutes les variables d'environnement nécessaires pour faire fonctionner l'application Avocat SaaS.

## Table des matières

1. [Configuration Supabase](#1-configuration-supabase)
2. [Configuration Google Drive OAuth](#2-configuration-google-drive-oauth)
3. [Configuration WhatsApp Business API](#3-configuration-whatsapp-business-api)
4. [Configuration Resend (Email)](#4-configuration-resend-email)
5. [Configuration Application](#5-configuration-application)
6. [Déploiement](#6-déploiement)

---

## 1. Configuration Supabase

### Créer un projet Supabase

1. Allez sur [https://supabase.com](https://supabase.com)
2. Créez un nouveau projet
3. Notez les informations suivantes :

### Variables d'environnement

```bash
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Où trouver ces valeurs :**
- Aller dans `Settings` → `API`
- `URL` : Project URL
- `ANON_KEY` : anon/public key
- `SERVICE_ROLE_KEY` : service_role key (⚠️ Secret, ne jamais exposer côté client)

### Exécuter les migrations

```bash
cd supabase
npx supabase db push
```

Ou via l'interface Supabase :
1. Aller dans `SQL Editor`
2. Copier-coller le contenu de chaque migration dans `supabase/migrations/`
3. Exécuter dans l'ordre

---

## 2. Configuration Google Drive OAuth

### Créer un projet Google Cloud

1. Allez sur [Google Cloud Console](https://console.cloud.google.com/)
2. Créez un nouveau projet : **"Avocat SaaS"**

### Activer Google Drive API

1. Menu → `APIs & Services` → `Library`
2. Rechercher **"Google Drive API"**
3. Cliquer `Enable`

### Créer OAuth 2.0 Client ID

1. Menu → `APIs & Services` → `Credentials`
2. Cliquer `Create Credentials` → `OAuth 2.0 Client ID`
3. Type : **Web application**
4. Name : **"Avocat SaaS - Production"** (ou Dev)
5. **Authorized redirect URIs** :
   - Dev : `http://localhost:7002/api/integrations/google-drive/callback`
   - Prod : `https://your-domain.com/api/integrations/google-drive/callback`
6. Cliquer `Create`
7. Copier **Client ID** et **Client Secret**

### Configurer OAuth Consent Screen

1. Menu → `APIs & Services` → `OAuth consent screen`
2. Type : **External** (ou Internal si Google Workspace)
3. App name : **"Avocat SaaS"**
4. User support email : votre email
5. Developer contact email : votre email
6. **Scopes** :
   - Ajouter `https://www.googleapis.com/auth/drive.file`
   - Ajouter `https://www.googleapis.com/auth/userinfo.email`
7. **Test users** : Ajouter votre email (si mode Test)
8. Cliquer `Save and Continue`

### Variables d'environnement

```bash
GOOGLE_CLIENT_ID=123456789012-abcdefghijklmnopqrstuvwxyz.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-abcdefghijklmnopqrstuvwx
GOOGLE_REDIRECT_URI=http://localhost:7002/api/integrations/google-drive/callback
```

**Note importante :**
- Le `GOOGLE_REDIRECT_URI` doit correspondre EXACTEMENT à celui configuré dans Google Cloud Console
- En production, changez `http://localhost:7002` par votre domaine réel

---

## 3. Configuration WhatsApp Business API

### Prérequis

1. Un compte [Meta Business Manager](https://business.facebook.com/)
2. Un numéro de téléphone WhatsApp Business

### Créer une application Facebook

1. Allez sur [Facebook Developers](https://developers.facebook.com/)
2. Cliquer `My Apps` → `Create App`
3. Type : **Business**
4. App name : **"Avocat SaaS WhatsApp"**
5. Contact email : votre email
6. Business account : Sélectionner votre compte Business

### Activer WhatsApp

1. Dans votre application, aller dans `Dashboard`
2. Cliquer `Add Product` → **WhatsApp**
3. Configurer un numéro WhatsApp Business

### Obtenir les identifiants

#### Phone Number ID

1. Produits → `WhatsApp` → `API Setup`
2. Section **"From"**
3. Copier le **Phone Number ID** (ex: `123456789012345`)

#### Business Account ID

1. Produits → `WhatsApp` → `Getting Started`
2. Section **"Business Account ID"**
3. Copier l'ID (ex: `987654321098765`)

#### Access Token

1. Produits → `WhatsApp` → `API Setup`
2. Section **"Temporary access token"** (pour tests)
3. ⚠️ **En production** : Créer un token permanent :
   - Aller dans `Settings` → `Basic`
   - Section **"Business Manager System User"**
   - Créer un System User
   - Générer un token avec permissions `whatsapp_business_messaging`

#### App Secret

1. Aller dans `Settings` → `Basic`
2. Copier **"App Secret"** (cliquer `Show` si masqué)

### Générer Webhook Verify Token

Générez un token aléatoire sécurisé (minimum 20 caractères) :

```bash
openssl rand -base64 32
```

Exemple : `gKx7Wq3Lm9Zt5Pv8Rn2Jh4Xf6Yb1Dc0As`

### Configurer le Webhook

1. Produits → `WhatsApp` → `Configuration`
2. Section **"Webhooks"**
3. Cliquer `Configure webhooks`
4. **Callback URL** : `https://your-domain.com/api/webhooks/whatsapp`
   - ⚠️ Dev local : Utiliser [ngrok](https://ngrok.com/) : `ngrok http 7002`
5. **Verify Token** : Collez le token généré ci-dessus
6. Cliquer `Verify and save`
7. Cocher **"messages"** dans les champs

### Variables d'environnement

```bash
WHATSAPP_WEBHOOK_VERIFY_TOKEN=gKx7Wq3Lm9Zt5Pv8Rn2Jh4Xf6Yb1Dc0As
WHATSAPP_APP_SECRET=your-meta-app-secret-from-settings
```

**Important :**
- `WHATSAPP_WEBHOOK_VERIFY_TOKEN` : Le token que **vous** avez généré (pas fourni par Meta)
- `WHATSAPP_APP_SECRET` : Le secret de l'application Meta (trouvé dans Settings → Basic)

### Tester le Webhook

1. Produits → `WhatsApp` → `API Setup`
2. Section **"Send and receive messages"**
3. Envoyer un message test à votre numéro
4. Vérifier les logs de votre application (console Next.js)

---

## 4. Configuration Resend (Email)

### Créer un compte Resend

1. Allez sur [https://resend.com](https://resend.com)
2. Créez un compte gratuit (3000 emails/mois)

### Obtenir la clé API

1. Aller dans `API Keys`
2. Cliquer `Create API Key`
3. Name : **"Avocat SaaS Production"**
4. Permission : **Full access** (ou **Sending access** seulement)
5. Copier la clé (commence par `re_`)

### Configurer le domaine (Production)

1. Aller dans `Domains`
2. Cliquer `Add Domain`
3. Entrer votre domaine : **"moncabinet.tn"**
4. Suivre les instructions pour configurer les DNS records (SPF, DKIM)

### Variables d'environnement

```bash
RESEND_API_KEY=re_123456789abcdefghijklmnopqrstuvwxyz
```

**Note :**
- En développement, utilisez `onboarding@resend.dev` comme expéditeur
- En production, utilisez votre domaine : `notifications@moncabinet.tn`

---

## 5. Configuration Application

### Variables générales

```bash
NEXT_PUBLIC_APP_URL=http://localhost:7002
NEXT_PUBLIC_APP_NAME=MonCabinet
NEXT_PUBLIC_APP_DOMAIN=moncabinet.tn
NODE_ENV=development
```

**Descriptions :**

- `NEXT_PUBLIC_APP_URL` : URL publique de l'application
  - Dev : `http://localhost:7002`
  - Prod : `https://moncabinet.tn` (votre domaine)

- `NEXT_PUBLIC_APP_NAME` : Nom affiché dans l'application

- `NEXT_PUBLIC_APP_DOMAIN` : Domaine principal (pour emails)

- `NODE_ENV` : Environnement
  - `development` : Mode développement
  - `production` : Mode production

---

## 6. Déploiement

### Checklist Production

#### 1. Variables d'environnement

✅ Vérifier que toutes les variables sont configurées
✅ Changer `NEXT_PUBLIC_APP_URL` vers domaine production
✅ Changer `GOOGLE_REDIRECT_URI` vers domaine production
✅ Vérifier que `NODE_ENV=production`

#### 2. Google Cloud Console

✅ Ajouter URL production dans **Authorized redirect URIs**
✅ Publier l'application OAuth (sortir du mode Test)
✅ Configurer quotas API (si nécessaire)

#### 3. WhatsApp Business

✅ Configurer webhook avec URL production
✅ Remplacer Access Token temporaire par token permanent
✅ Tester réception messages

#### 4. Resend

✅ Configurer domaine personnalisé
✅ Vérifier DNS records (SPF, DKIM, DMARC)
✅ Tester envoi emails

#### 5. Supabase

✅ Vérifier Row Level Security (RLS) activé sur toutes les tables
✅ Vérifier politiques RLS correctes
✅ Sauvegarder base de données
✅ Configurer backups automatiques

#### 6. Sécurité

✅ Tokens/secrets jamais exposés côté client
✅ HTTPS activé (certificat SSL)
✅ Rate limiting configuré (Supabase, Google Drive, WhatsApp)
✅ Logs sensibles masqués en production

---

## Exemple .env Complet

```bash
# ============================================
# SUPABASE CONFIGURATION
# ============================================
NEXT_PUBLIC_SUPABASE_URL=https://abcdefghijklmno.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# ============================================
# GOOGLE DRIVE OAUTH (CLOUD STORAGE)
# ============================================
GOOGLE_CLIENT_ID=123456789012-abcdefghijklmnopqrstuvwxyz.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-abcdefghijklmnopqrstuvwx
GOOGLE_REDIRECT_URI=https://moncabinet.tn/api/integrations/google-drive/callback

# ============================================
# WHATSAPP BUSINESS API (MESSAGING)
# ============================================
WHATSAPP_WEBHOOK_VERIFY_TOKEN=gKx7Wq3Lm9Zt5Pv8Rn2Jh4Xf6Yb1Dc0As
WHATSAPP_APP_SECRET=your-meta-app-secret-from-settings

# ============================================
# RESEND (EMAIL SERVICE)
# ============================================
RESEND_API_KEY=re_123456789abcdefghijklmnopqrstuvwxyz

# ============================================
# APPLICATION
# ============================================
NEXT_PUBLIC_APP_URL=https://moncabinet.tn
NEXT_PUBLIC_APP_NAME=MonCabinet
NEXT_PUBLIC_APP_DOMAIN=moncabinet.tn
NODE_ENV=production
```

---

## Aide et Support

### Problèmes courants

#### Google Drive OAuth ne fonctionne pas

- Vérifier que `GOOGLE_REDIRECT_URI` correspond EXACTEMENT à celui configuré dans Google Cloud Console
- Vérifier que Google Drive API est activée
- Vérifier que les scopes sont corrects (`drive.file`, `userinfo.email`)

#### WhatsApp Webhook ne reçoit pas de messages

- Vérifier que l'URL webhook est accessible publiquement (HTTPS obligatoire en prod)
- Vérifier que `WHATSAPP_WEBHOOK_VERIFY_TOKEN` correspond à celui configuré dans Meta
- Vérifier les logs webhook dans Meta Business Manager → Webhooks

#### Emails ne sont pas envoyés

- Vérifier que `RESEND_API_KEY` est valide
- Vérifier que le domaine est configuré et vérifié (production)
- Vérifier les logs Resend : [https://resend.com/emails](https://resend.com/emails)

#### Erreurs de permissions Supabase

- Vérifier que Row Level Security (RLS) est activé
- Vérifier que les politiques RLS sont correctes (voir migrations)
- Tester avec Supabase SQL Editor

### Ressources

- [Documentation Supabase](https://supabase.com/docs)
- [Documentation Google Drive API](https://developers.google.com/drive/api/guides/about-sdk)
- [Documentation WhatsApp Business API](https://developers.facebook.com/docs/whatsapp/cloud-api)
- [Documentation Resend](https://resend.com/docs)
- [Documentation Next.js](https://nextjs.org/docs)

---

## Contact

Pour toute question ou problème :
- Ouvrir une issue sur GitHub
- Email : support@moncabinet.tn
