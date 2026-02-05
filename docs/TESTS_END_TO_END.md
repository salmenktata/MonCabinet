# Tests End-to-End - Cloud Storage + WhatsApp

Guide complet des tests à exécuter pour valider les fonctionnalités Google Drive et WhatsApp Business.

## Table des matières

1. [Tests Google Drive OAuth](#1-tests-google-drive-oauth)
2. [Tests Upload & Structure Hiérarchique](#2-tests-upload--structure-hiérarchique)
3. [Tests Synchronisation Bidirectionnelle](#3-tests-synchronisation-bidirectionnelle)
4. [Tests WhatsApp Webhook](#4-tests-whatsapp-webhook)
5. [Tests Notifications Email](#5-tests-notifications-email)
6. [Tests Sécurité](#6-tests-sécurité)

---

## 1. Tests Google Drive OAuth

### Test 1.1 : Connexion initiale Google Drive

**Objectif** : Vérifier que le flow OAuth fonctionne correctement

**Prérequis** :
- Compte Google Cloud configuré
- Variables `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` définies

**Étapes** :
1. Se connecter à l'application
2. Aller dans `Paramètres` → `Stockage Cloud`
3. Cliquer sur "Connecter Google Drive"
4. Autoriser l'application dans Google OAuth
5. Vérifier redirection vers dashboard avec message succès

**Résultat attendu** :
- ✅ OAuth réussie, tokens sauvegardés en BDD
- ✅ Badge "Connecté" affiché avec email Google
- ✅ Dossier racine "Clients MonCabinet/" créé dans Google Drive

**Validation BDD** :
```sql
SELECT * FROM cloud_providers_config WHERE user_id = 'user-id';
-- Vérifier : access_token, refresh_token, root_folder_id NOT NULL
```

---

### Test 1.2 : Refresh automatique token expiré

**Objectif** : Vérifier que le refresh automatique fonctionne

**Prérequis** :
- Connexion Google Drive active

**Étapes** :
1. Modifier `token_expires_at` en BDD pour forcer expiration :
   ```sql
   UPDATE cloud_providers_config
   SET token_expires_at = NOW() - INTERVAL '1 hour'
   WHERE user_id = 'user-id';
   ```
2. Tenter d'uploader un document
3. Observer logs console

**Résultat attendu** :
- ✅ Log "[StorageManager] Token expiré, refresh automatique"
- ✅ Nouveaux tokens sauvegardés
- ✅ Upload réussit

---

### Test 1.3 : Déconnexion Google Drive

**Objectif** : Vérifier que la déconnexion supprime les tokens

**Étapes** :
1. Aller dans `Paramètres` → `Stockage Cloud`
2. Cliquer "Déconnecter"
3. Confirmer dans la modale
4. Tenter d'uploader un document

**Résultat attendu** :
- ✅ Tokens supprimés de la BDD
- ✅ Message "Veuillez connecter Google Drive" affiché
- ✅ Upload bloqué avec erreur claire

---

## 2. Tests Upload & Structure Hiérarchique

### Test 2.1 : Premier upload pour nouveau client

**Objectif** : Vérifier création automatique de la structure

**Prérequis** :
- Google Drive connecté
- Client "DUPONT Jean" (CIN 12345678) créé
- Dossier juridique "2025-001" créé pour ce client

**Étapes** :
1. Aller dans dossier "2025-001"
2. Uploader un document PDF
3. Ouvrir Google Drive dans un onglet séparé

**Résultat attendu - Structure Google Drive** :
```
Clients MonCabinet/
└── [DUPONT Jean - CIN 12345678]/
    ├── Dossier 2025-001/
    │   └── document.pdf
    └── Documents non classés/
```

**Validation** :
- ✅ Dossier client créé avec format exact `[Nom Prénom - CIN]`
- ✅ Sous-dossier juridique créé
- ✅ Document uploadé au bon emplacement
- ✅ Dossier "Documents non classés" créé automatiquement

**Validation BDD** :
```sql
SELECT google_drive_folder_id, google_drive_folder_url
FROM clients WHERE id = 'client-id';

SELECT google_drive_folder_id, google_drive_folder_url
FROM dossiers WHERE id = 'dossier-id';

SELECT external_file_id, external_sharing_link, storage_provider
FROM documents WHERE dossier_id = 'dossier-id';
```

---

### Test 2.2 : Deuxième upload même dossier (réutilisation structure)

**Objectif** : Vérifier que la structure n'est pas dupliquée

**Étapes** :
1. Uploader un 2ème document dans le même dossier "2025-001"
2. Vérifier Google Drive

**Résultat attendu** :
- ✅ Dossier client **réutilisé** (pas de doublon)
- ✅ Dossier juridique **réutilisé**
- ✅ 2 documents dans "Dossier 2025-001/"

---

### Test 2.3 : Upload pour client différent

**Objectif** : Vérifier isolation entre clients

**Prérequis** :
- Client "MARTIN Sophie" créé
- Dossier "2025-002" créé pour MARTIN

**Étapes** :
1. Uploader document dans dossier "2025-002"
2. Vérifier Google Drive

**Résultat attendu - Structure Google Drive** :
```
Clients MonCabinet/
├── [DUPONT Jean - CIN 12345678]/
│   └── Dossier 2025-001/
│       ├── document1.pdf
│       └── document2.pdf
└── [MARTIN Sophie - CIN 98765432]/
    └── Dossier 2025-002/
        └── document.pdf
```

---

### Test 2.4 : Consultation & Téléchargement

**Objectif** : Vérifier que les liens Google Drive fonctionnent

**Étapes** :
1. Cliquer sur un document dans la liste
2. Vérifier que le lien Google Drive s'ouvre
3. Télécharger le document depuis Google Drive

**Résultat attendu** :
- ✅ Lien `external_sharing_link` s'ouvre correctement
- ✅ Document consultable sans erreur 403
- ✅ Téléchargement fonctionne

---

### Test 2.5 : Suppression document

**Objectif** : Vérifier suppression côté Google Drive ET BDD

**Étapes** :
1. Supprimer un document depuis l'application
2. Vérifier Google Drive
3. Vérifier BDD

**Résultat attendu** :
- ✅ Document supprimé de Google Drive
- ✅ Entrée supprimée de la BDD
- ✅ Lien Google Drive retourne 404

---

## 3. Tests Synchronisation Bidirectionnelle

### Test 3.1 : Ajout manuel fichier dans dossier juridique

**Objectif** : Fichier ajouté manuellement dans Drive → apparaît dans app

**Prérequis** :
- Structure "Clients MonCabinet/[Client]/Dossier 2025-001/" existe
- Synchronisation activée (toggle dans paramètres)

**Étapes** :
1. Ouvrir Google Drive directement
2. Aller dans "Clients MonCabinet/[DUPONT Jean]/Dossier 2025-001/"
3. Glisser-déposer un fichier `facture.pdf`
4. Attendre 1-2 minutes (webhook ou polling)
5. Rafraîchir dashboard application

**Résultat attendu** :
- ✅ Fichier `facture.pdf` apparaît dans la liste documents du dossier
- ✅ `needs_classification = false` (rattaché automatiquement)
- ✅ `source_type = 'google_drive_sync'`

**Validation BDD** :
```sql
SELECT nom_fichier, needs_classification, source_type, external_file_id
FROM documents
WHERE dossier_id = 'dossier-id'
AND nom_fichier = 'facture.pdf';
```

---

### Test 3.2 : Ajout fichier dans "Documents non classés"

**Objectif** : Fichier dans zone tampon → Widget "Documents à Classer"

**Étapes** :
1. Ouvrir Google Drive
2. Aller dans "Clients MonCabinet/[DUPONT Jean]/Documents non classés/"
3. Glisser-déposer `scan.jpg`
4. Attendre synchronisation
5. Aller sur dashboard

**Résultat attendu** :
- ✅ Widget "Documents à Classer" affiché
- ✅ Badge "1 document"
- ✅ Document `scan.jpg` listé avec dropdown dossiers

**Validation** :
```sql
SELECT * FROM documents
WHERE nom_fichier = 'scan.jpg'
AND needs_classification = true;
```

---

### Test 3.3 : Classification manuelle depuis widget

**Objectif** : Classer un document non classé

**Étapes** :
1. Dans widget "Documents à Classer", sélectionner dossier "2025-001"
2. Cliquer "Classer"
3. Vérifier Google Drive

**Résultat attendu** :
- ✅ Document retiré du widget
- ✅ `needs_classification = false` en BDD
- ✅ Document toujours dans "Documents non classés/" (pas déplacé physiquement dans Drive pour MVP)

---

### Test 3.4 : Google Drive Push Notification (webhook)

**Objectif** : Vérifier que le webhook Google Drive fonctionne

**Prérequis** :
- Webhook configuré (URL publique HTTPS)
- Channel créé via `watchFolder`

**Étapes** :
1. Vérifier logs serveur : `[Google Drive Webhook] Channel créé: ...`
2. Ajouter fichier dans Google Drive
3. Observer logs

**Résultat attendu - Logs** :
```
[Google Drive Webhook] POST notification reçue
[Google Drive Webhook] Resource state: update
[Sync Service] Synchronisation démarrée pour user: ...
[Sync Service] 1 nouveau(x) fichier(s) détecté(s)
```

---

### Test 3.5 : Renouvellement webhook (7 jours)

**Objectif** : Vérifier que le webhook est renouvelé automatiquement

**Prérequis** :
- Webhook actif avec `webhook_expiration` proche

**Simulation** :
```sql
UPDATE cloud_providers_config
SET webhook_expiration = NOW() + INTERVAL '1 hour'
WHERE user_id = 'user-id';
```

**Étapes** :
1. Attendre exécution cron job (ou le déclencher manuellement)
2. Vérifier logs

**Résultat attendu** :
- ✅ Log "[Sync Service] Renouvellement webhook avant expiration"
- ✅ Nouveau `webhook_expiration` (NOW + 7 jours)

---

## 4. Tests WhatsApp Webhook

### Test 4.1 : Vérification webhook (GET)

**Objectif** : Meta valide le webhook

**Prérequis** :
- Variable `WHATSAPP_WEBHOOK_VERIFY_TOKEN` définie

**Étapes** :
1. Configurer webhook dans Meta Business Manager
2. Meta envoie GET avec `hub.verify_token` et `hub.challenge`
3. Observer logs

**Résultat attendu - Logs** :
```
[WhatsApp Webhook] GET verification: { mode: 'subscribe', token: 'xxx...' }
[WhatsApp Webhook] Vérification réussie, challenge retourné
```

**Validation Meta** :
- ✅ Meta affiche "✓ Webhook vérifié"

---

### Test 4.2 : Réception document - 1 dossier actif (auto)

**Objectif** : Document rattaché automatiquement

**Prérequis** :
- Client "DUPONT Jean" avec téléphone `+21612345678`
- **1 seul dossier actif** "2025-001" pour ce client
- WhatsApp configuré

**Étapes** :
1. Envoyer un PDF depuis le téléphone `+21612345678` au numéro WhatsApp Business
2. Observer logs webhook
3. Vérifier application
4. Vérifier email avocat
5. Vérifier Google Drive

**Résultat attendu - Logs** :
```
[WhatsApp Webhook] Message entrant: { type: 'document', from: '+21612345678' }
[WhatsApp Webhook] Client identifié: { clientId: '...', nom: 'Jean DUPONT' }
[WhatsApp Webhook] Dossiers actifs trouvés: 1
[WhatsApp Webhook] Rattachement automatique au dossier: 2025-001
[WhatsApp Webhook] Document uploadé avec succès
[WhatsApp Webhook] Email notification envoyée à l'avocat
```

**Validation Application** :
- ✅ Document apparaît dans dossier 2025-001
- ✅ `source_type = 'whatsapp'`
- ✅ `source_metadata` contient `sender_phone`, `message_id`

**Validation Email** :
- ✅ Email reçu avec sujet "✅ Document reçu de Jean DUPONT - Dossier 2025-001"
- ✅ Badge vert "Rattaché automatiquement"
- ✅ Bouton "Voir le dossier" fonctionnel

**Validation Google Drive** :
```
Clients MonCabinet/
└── [DUPONT Jean - CIN 12345678]/
    └── Dossier 2025-001/
        └── document_whatsapp.pdf  ← Nouveau fichier
```

**Validation WhatsApp Client** :
- ✅ Message de confirmation reçu : "✅ Document bien reçu et rattaché au dossier 2025-001"

---

### Test 4.3 : Réception document - Plusieurs dossiers (manuel)

**Objectif** : Document en attente de rattachement

**Prérequis** :
- Client "DUPONT Jean"
- **3 dossiers actifs** : "2025-001", "2025-005", "2025-010"

**Étapes** :
1. Envoyer un document par WhatsApp
2. Observer logs
3. Vérifier dashboard
4. Vérifier email

**Résultat attendu - Logs** :
```
[WhatsApp Webhook] Dossiers actifs trouvés: 3
[WhatsApp Webhook] Plusieurs dossiers actifs, stockage en attente
[WhatsApp Webhook] Email notification "action requise" envoyée à l'avocat
```

**Validation Application** :
- ✅ Widget "Documents WhatsApp en Attente" affiché
- ✅ Badge "1 document"
- ✅ Document listé avec dropdown 3 dossiers
- ✅ Bouton "Rattacher" + "Rejeter"

**Validation Email** :
- ✅ Email reçu avec sujet "⏳ Action requise : Document de Jean DUPONT en attente"
- ✅ Badge jaune "Action requise"
- ✅ Message "Ce client a 3 dossiers actifs"
- ✅ Bouton "Classer le document" → dashboard

**Validation WhatsApp Client** :
- ✅ Message : "📥 Document bien reçu. Votre avocat va le rattacher au bon dossier sous peu."

---

### Test 4.4 : Rattachement manuel depuis widget

**Objectif** : Classer un document WhatsApp pending

**Étapes** :
1. Dans widget "Documents WhatsApp en Attente"
2. Sélectionner "Dossier 2025-001"
3. Cliquer "Rattacher"

**Résultat attendu** :
- ✅ Document retiré du widget
- ✅ Document apparaît dans dossier 2025-001
- ✅ Status pending_documents = 'attached'
- ✅ Toast "Document rattaché au dossier 2025-001 avec succès"

---

### Test 4.5 : Réception document - Numéro inconnu

**Objectif** : Notification numéro non identifié

**Prérequis** :
- Numéro `+21698765432` **non dans la BDD**

**Étapes** :
1. Envoyer document depuis `+21698765432`
2. Observer logs
3. Vérifier email

**Résultat attendu - Logs** :
```
[WhatsApp Webhook] Client non trouvé: +21698765432
```

**Validation Email** :
- ✅ Email reçu "⚠️ Document de numéro inconnu : +21698765432"
- ✅ Badge rouge "Numéro inconnu"
- ✅ Message "Ce numéro n'est associé à aucun client"
- ✅ Bouton "Créer une fiche client" → /clients

**Validation WhatsApp** :
- ✅ Message au client : "📥 Document bien reçu. Votre avocat va le traiter dans les plus brefs délais."

---

### Test 4.6 : Types de médias variés

**Objectif** : Supporter document/image/video/audio

**Étapes** :
1. Envoyer **PDF** → ✅ Upload
2. Envoyer **JPEG** → ✅ Upload
3. Envoyer **MP4 vidéo** → ✅ Upload
4. Envoyer **MP3 audio** → ✅ Upload
5. Envoyer **message texte seul** → ⚠️ Ignoré (log)

**Résultat attendu** :
- ✅ Tous les médias uploadés correctement
- ✅ Extensions détectées via MIME type
- ✅ Message texte ignoré sans erreur

---

## 5. Tests Notifications Email

### Test 5.1 : Email "Document rattaché automatiquement"

**Objectif** : Vérifier template email correct

**Validation Template** :
- ✅ Subject : "✅ Document reçu de [Client] - Dossier [Numero]"
- ✅ Badge vert "Rattaché automatiquement"
- ✅ Section Document : nom fichier, taille, date
- ✅ Section Client : nom, téléphone
- ✅ Section Dossier : numéro, objet
- ✅ Bouton "Voir le dossier" avec URL correcte
- ✅ Footer avec nom app

**Validation HTML** :
- ✅ Design responsive (max-width 600px)
- ✅ Styles inline (compatibilité email clients)
- ✅ Couleurs correctes (vert pour succès)

---

### Test 5.2 : Email "Action requise"

**Objectif** : Vérifier template alerte

**Validation Template** :
- ✅ Subject : "⏳ Action requise : Document de [Client] en attente"
- ✅ Badge jaune "Action requise"
- ✅ Alert box jaune "Ce client a X dossiers actifs"
- ✅ Bouton "Classer le document" → dashboard
- ✅ Message explicatif clair

---

### Test 5.3 : Email "Numéro inconnu"

**Objectif** : Vérifier template erreur

**Validation Template** :
- ✅ Subject : "⚠️ Document de numéro inconnu : [Phone]"
- ✅ Badge rouge "Numéro inconnu"
- ✅ Alert box rouge "Aucun client associé"
- ✅ Section Expéditeur : téléphone, nom WhatsApp (si dispo)
- ✅ Bouton "Créer une fiche client" → /clients

---

### Test 5.4 : Gestion erreurs email

**Objectif** : Vérifier que les erreurs email ne bloquent pas le workflow

**Simulation** :
- Supprimer ou invalider `RESEND_API_KEY`

**Étapes** :
1. Envoyer document par WhatsApp
2. Observer logs

**Résultat attendu** :
- ✅ Document uploadé malgré erreur email
- ✅ Log "[WhatsApp Webhook] Erreur envoi email notification: ..."
- ✅ Workflow continue (non bloquant)
- ✅ Confirmation WhatsApp envoyée au client

---

## 6. Tests Sécurité

### Test 6.1 : Signature webhook WhatsApp invalide

**Objectif** : Requêtes non signées rejetées

**Simulation** :
```bash
curl -X POST https://your-domain.com/api/webhooks/whatsapp \
  -H "Content-Type: application/json" \
  -H "x-hub-signature-256: sha256=INVALID_SIGNATURE" \
  -d '{"entry": []}'
```

**Résultat attendu** :
- ✅ Status 403 Forbidden
- ✅ Body : `{ "error": "Signature invalide" }`
- ✅ Log "[WhatsApp Webhook] Signature invalide"

---

### Test 6.2 : Validation HMAC SHA256

**Objectif** : Vérifier calcul correct de la signature

**Étapes** :
1. Envoyer requête avec signature valide (Meta)
2. Vérifier que `crypto.timingSafeEqual` accepte

**Résultat attendu** :
- ✅ Signature validée
- ✅ Pas d'attaque timing possible

---

### Test 6.3 : Token webhook vérification

**Objectif** : GET webhook avec mauvais token rejeté

**Simulation** :
```bash
curl "https://your-domain.com/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=WRONG&hub.challenge=test"
```

**Résultat attendu** :
- ✅ Status 403
- ✅ Challenge **non retourné**

---

### Test 6.4 : Isolation utilisateurs (RLS)

**Objectif** : User A ne peut pas voir documents de User B

**Prérequis** :
- 2 utilisateurs : Alice, Bob
- Alice a dossier + documents
- Bob connecté

**Étapes** :
1. Se connecter en tant que Bob
2. Tenter d'accéder aux documents d'Alice via URL directe
3. Tenter requête API avec ID document Alice

**Résultat attendu** :
- ✅ Accès refusé (RLS bloque)
- ✅ Message erreur ou page 404
- ✅ Aucune fuite de données

---

### Test 6.5 : Tokens OAuth chiffrés

**Objectif** : Vérifier que les tokens sont stockés de manière sécurisée

**Validation BDD** :
```sql
SELECT access_token, refresh_token
FROM cloud_providers_config
WHERE user_id = 'user-id';
```

**Résultat attendu** :
- ✅ Tokens stockés en clair pour MVP (pg_crypto recommandé en production)
- ✅ Jamais exposés côté client (variables serveur uniquement)

---

## Récapitulatif Tests

### Tests Critiques (MVP)

| Test | Description | Statut |
|------|-------------|--------|
| 1.1 | OAuth Google Drive | ⏳ À tester |
| 2.1 | Structure hiérarchique | ⏳ À tester |
| 3.1 | Sync bidirectionnelle | ⏳ À tester |
| 4.2 | WhatsApp 1 dossier | ⏳ À tester |
| 4.3 | WhatsApp plusieurs dossiers | ⏳ À tester |
| 5.1 | Email rattaché auto | ⏳ À tester |
| 6.1 | Sécurité webhook | ⏳ À tester |

### Tests Optionnels (Nice-to-have)

| Test | Description | Priorité |
|------|-------------|----------|
| 1.2 | Refresh token | Moyenne |
| 3.4 | Webhook Google | Basse |
| 4.6 | Types médias | Moyenne |
| 6.4 | RLS isolation | Haute |

---

## Outils de Test

### Script de test WhatsApp Webhook (local)

Créer `test-whatsapp-webhook.mjs` :

```javascript
import axios from 'axios'
import crypto from 'crypto'

const WEBHOOK_URL = 'http://localhost:7002/api/webhooks/whatsapp'
const APP_SECRET = 'your-app-secret'

// Payload WhatsApp exemple
const payload = {
  entry: [{
    changes: [{
      value: {
        messages: [{
          id: 'msg_123',
          from: '+21612345678',
          timestamp: Math.floor(Date.now() / 1000).toString(),
          type: 'document',
          document: {
            id: 'media_456',
            mime_type: 'application/pdf',
            filename: 'test.pdf'
          }
        }],
        contacts: [{
          profile: { name: 'Jean DUPONT' }
        }]
      }
    }]
  }]
}

const body = JSON.stringify(payload)

// Calculer signature
const hmac = crypto.createHmac('sha256', APP_SECRET)
hmac.update(body)
const signature = 'sha256=' + hmac.digest('hex')

// Envoyer requête
const response = await axios.post(WEBHOOK_URL, body, {
  headers: {
    'Content-Type': 'application/json',
    'x-hub-signature-256': signature
  }
})

console.log('Response:', response.data)
```

---

## Rapport de Tests

À remplir après exécution :

```markdown
## Rapport Tests - [Date]

### Environnement
- App URL: _______
- Google Drive: Connecté ✓ / Non connecté ✗
- WhatsApp: Configuré ✓ / Non configuré ✗

### Résultats

#### Google Drive OAuth
- [ ] Test 1.1 : Connexion initiale
- [ ] Test 1.2 : Refresh token
- [ ] Test 1.3 : Déconnexion

#### Upload & Structure
- [ ] Test 2.1 : Premier upload
- [ ] Test 2.2 : Deuxième upload
- [ ] Test 2.3 : Client différent
- [ ] Test 2.4 : Consultation
- [ ] Test 2.5 : Suppression

#### Synchronisation
- [ ] Test 3.1 : Ajout manuel dossier juridique
- [ ] Test 3.2 : Zone tampon
- [ ] Test 3.3 : Classification widget

#### WhatsApp
- [ ] Test 4.1 : Vérification webhook
- [ ] Test 4.2 : 1 dossier actif
- [ ] Test 4.3 : Plusieurs dossiers
- [ ] Test 4.4 : Rattachement manuel
- [ ] Test 4.5 : Numéro inconnu

#### Emails
- [ ] Test 5.1 : Email auto-attached
- [ ] Test 5.2 : Email action requise
- [ ] Test 5.3 : Email numéro inconnu

#### Sécurité
- [ ] Test 6.1 : Signature invalide
- [ ] Test 6.4 : Isolation RLS

### Bugs Détectés
1. _______
2. _______

### Recommandations
- _______
```

---

## Contact Support

Pour questions ou problèmes durant les tests :
- Email : support@moncabinet.tn
- GitHub Issues : [lien]
