# Configuration Google Drive OAuth

Ce guide explique comment configurer l'intégration Google Drive pour le stockage des documents.

## Prérequis

- Compte Google (Gmail)
- Accès à Google Cloud Console

---

## Étape 1 : Créer un Projet Google Cloud

1. Accéder à [Google Cloud Console](https://console.cloud.google.com/)
2. Cliquer sur **"Sélectionner un projet"** → **"Nouveau projet"**
3. Renseigner :
   - **Nom du projet** : `MonCabinet` (ou nom de votre choix)
   - **Organisation** : Laisser vide si compte personnel
4. Cliquer sur **"Créer"**
5. Attendre quelques secondes que le projet soit créé
6. Vérifier que le projet est bien sélectionné (barre du haut)

---

## Étape 2 : Activer Google Drive API

1. Dans le menu latéral, aller sur **"API et services"** → **"Bibliothèque"**
2. Rechercher **"Google Drive API"**
3. Cliquer sur **"Google Drive API"** dans les résultats
4. Cliquer sur **"Activer"**
5. Attendre l'activation (quelques secondes)

---

## Étape 3 : Configurer l'Écran de Consentement OAuth

1. Aller sur **"API et services"** → **"Écran de consentement OAuth"**
2. Sélectionner **"Externe"** (si vous n'avez pas de Google Workspace)
3. Cliquer sur **"Créer"**

### Configuration de l'écran de consentement

**Page 1 : Informations sur l'application**
- **Nom de l'application** : `Avocat - Gestion Cabinet`
- **E-mail d'assistance utilisateur** : Votre email professionnel
- **Logo de l'application** : (Optionnel) Ajouter logo de votre cabinet
- **Domaine de l'application** : Laisser vide pour dev
- **Liens** : Laisser vides pour l'instant
- **E-mail du développeur** : Votre email

Cliquer sur **"Enregistrer et continuer"**

**Page 2 : Champs d'application (Scopes)**
- Cliquer sur **"Ajouter ou supprimer des champs d'application"**
- Rechercher et cocher :
  - `https://www.googleapis.com/auth/drive.file` (Accès fichiers créés par l'app)
  - `https://www.googleapis.com/auth/userinfo.email` (Email utilisateur)
- Cliquer sur **"Mettre à jour"**
- Cliquer sur **"Enregistrer et continuer"**

**Page 3 : Utilisateurs de test** (Mode développement)
- Cliquer sur **"Ajouter des utilisateurs"**
- Ajouter votre email Google (celui que vous utiliserez pour tester)
- Cliquer sur **"Ajouter"**
- Cliquer sur **"Enregistrer et continuer"**

**Page 4 : Résumé**
- Vérifier les informations
- Cliquer sur **"Retour au tableau de bord"**

---

## Étape 4 : Créer les Identifiants OAuth 2.0

1. Aller sur **"API et services"** → **"Identifiants"**
2. Cliquer sur **"+ Créer des identifiants"** → **"ID client OAuth"**
3. Configurer :
   - **Type d'application** : `Application Web`
   - **Nom** : `Avocat Web Client`

### Origines JavaScript autorisées

Ajouter les URLs suivantes :
```
http://localhost:7002
https://votre-domaine-production.com
```

### URI de redirection autorisés

Ajouter les URLs suivantes :
```
http://localhost:7002/api/integrations/google-drive/callback
https://votre-domaine-production.com/api/integrations/google-drive/callback
```

4. Cliquer sur **"Créer"**

### Récupérer les Identifiants

Une popup s'affiche avec :
- **ID client** : `1234567890-abcdefghijklmnop.apps.googleusercontent.com`
- **Code secret du client** : `GOCSPX-xxxxxxxxxxxxxxxxxxxx`

⚠️ **Important** : Copier ces identifiants immédiatement et les stocker de manière sécurisée.

---

## Étape 5 : Configurer les Variables d'Environnement

Créer un fichier `.env.local` à la racine du projet (si pas déjà fait) :

```bash
# Google Drive OAuth
GOOGLE_CLIENT_ID=votre-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-votre-client-secret
GOOGLE_REDIRECT_URI=http://localhost:7002/api/integrations/google-drive/callback
GOOGLE_DRIVE_WEBHOOK_VERIFY_TOKEN=un-token-aleatoire-min-32-caracteres
```

### Générer le Webhook Verify Token

```bash
# Commande pour générer un token aléatoire sécurisé
openssl rand -hex 32
```

Exemple de résultat : `a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6`

---

## Étape 6 : Tester l'Intégration

1. Démarrer le serveur de développement :
```bash
npm run dev
```

2. Accéder à l'application : `http://localhost:7002`

3. Se connecter avec un compte utilisateur

4. Aller dans **Paramètres** → **Stockage Cloud**

5. Cliquer sur **"Connecter Google Drive"**

6. Autoriser l'application à accéder à votre Google Drive

7. Vérifier que le message de succès s'affiche avec votre email Google

---

## Étape 7 : Passer en Production (Optionnel)

### Mode Développement vs Production

Par défaut, votre application OAuth est en **mode développement** :
- ⚠️ Limite : 100 utilisateurs maximum
- ⚠️ Message d'avertissement "Application non vérifiée" affiché aux utilisateurs
- ✅ Parfait pour tests et petits déploiements

### Publier l'Application (Pour plus de 100 utilisateurs)

1. Aller sur **"Écran de consentement OAuth"**
2. Cliquer sur **"Publier l'application"**
3. Confirmer la publication

⚠️ **Important** : Google peut demander une vérification si vous utilisez des scopes sensibles (ce n'est pas le cas ici avec `drive.file`).

### Supprimer le Message "Application non vérifiée" (Optionnel)

Si vous souhaitez supprimer le message d'avertissement Google :
1. Aller sur **"Écran de consentement OAuth"**
2. Cliquer sur **"Préparer pour la vérification"**
3. Remplir le formulaire de vérification Google (peut prendre plusieurs semaines)

**Recommandation** : Pas nécessaire pour un usage interne cabinet d'avocat (< 100 utilisateurs).

---

## URLs de Production

Lorsque vous déployez en production, mettre à jour les URLs :

### Dans Google Cloud Console
1. **Origines JavaScript autorisées** :
   ```
   https://votre-domaine.com
   ```

2. **URI de redirection autorisés** :
   ```
   https://votre-domaine.com/api/integrations/google-drive/callback
   ```

### Dans les Variables d'Environnement Production
```bash
GOOGLE_REDIRECT_URI=https://votre-domaine.com/api/integrations/google-drive/callback
NEXT_PUBLIC_APP_URL=https://votre-domaine.com
```

---

## Dépannage

### Erreur "redirect_uri_mismatch"
- Vérifier que l'URI de redirection est exactement identique entre :
  - Variable `GOOGLE_REDIRECT_URI` dans `.env.local`
  - URI configurée dans Google Cloud Console
- Vérifier qu'il n'y a pas de `/` final dans l'URL

### Erreur "invalid_client"
- Vérifier que `GOOGLE_CLIENT_ID` et `GOOGLE_CLIENT_SECRET` sont corrects
- Vérifier qu'ils correspondent bien au projet Google Cloud actif

### Erreur "access_denied"
- L'utilisateur a refusé l'autorisation
- Vérifier que l'email utilisateur est dans la liste des utilisateurs de test (mode développement)

### Application bloquée "Cette application n'est pas vérifiée"
- Mode développement : Ajouter l'email dans "Utilisateurs de test"
- Mode production : Publier l'application ou la faire vérifier par Google

---

## Structure des Dossiers Google Drive

L'application crée automatiquement la structure suivante :

```
Google Drive de l'avocat :
├── Clients MonCabinet/                           ← Dossier racine
│   ├── [DUPONT Jean - CIN 12345678]/         ← Dossier client
│   │   ├── Dossier 2025-001 (Divorce)/       ← Dossier juridique
│   │   │   ├── Requête divorce.pdf
│   │   │   └── Acte mariage.pdf
│   │   ├── Dossier 2025-015 (Succession)/
│   │   │   └── Testament.pdf
│   │   └── Documents non classés/            ← Zone tampon
│   │
│   ├── [MARTIN Sophie - Société SARL]/
│   │   └── Dossier 2025-003 (Commercial)/
│   │       └── Contrat.pdf
```

### Avantages de cette structure :
- ✅ Organisation claire par client
- ✅ Plusieurs dossiers juridiques par client
- ✅ Synchronisation bidirectionnelle (si fichier ajouté manuellement dans Google Drive, il apparaît dans l'app)
- ✅ Zone tampon pour documents non classés

---

## Sécurité et Confidentialité

### Permissions Google Drive
- L'application utilise le scope `drive.file` qui donne accès **uniquement aux fichiers créés par l'application**
- L'application **ne peut pas voir** vos autres fichiers Google Drive personnels
- Les documents sont stockés sur **votre propre Google Drive**, pas sur nos serveurs

### Tokens OAuth
- Les tokens sont stockés de manière chiffrée dans la base de données Supabase
- Le refresh token permet de renouveler automatiquement l'accès sans redemander l'autorisation
- Vous pouvez révoquer l'accès à tout moment depuis :
  - Paramètres de l'application → Stockage Cloud → Déconnecter
  - Compte Google → Sécurité → Applications tierces → Avocat

---

## Support

Pour toute question ou problème, consulter :
- Documentation officielle Google : https://developers.google.com/drive/api/guides/about-auth
- Support technique : contact@votre-cabinet.com
