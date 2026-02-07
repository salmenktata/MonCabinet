# Guide de Validation - Cloud Storage & Messaging

Ce guide explique comment valider manuellement les fonctionnalités critiques de Cloud Storage (Google Drive) et Messaging (WhatsApp).

## 📋 Prérequis

### Configuration requise

**Cloud Storage:**
- Compte Google Cloud avec OAuth 2.0 configuré
- Variables d'environnement:
  - `GOOGLE_CLIENT_ID`
  - `GOOGLE_CLIENT_SECRET`
  - `GOOGLE_DRIVE_WEBHOOK_VERIFY_TOKEN`
  - `NEXT_PUBLIC_APP_URL`

**Messaging:**
- Application Meta Business avec WhatsApp Business API
- Variables d'environnement:
  - `WHATSAPP_APP_SECRET`
  - `WHATSAPP_WEBHOOK_VERIFY_TOKEN`

**Base de données:**
- Migrations appliquées:
  - `20260205000010_sync_logs_webhook_channels.sql`
  - `20260205000011_whatsapp_messages_media_cache.sql`

---

## 🔵 Cloud Storage (Google Drive) - Tests

### Test 1 : OAuth Flow (End-to-End)

#### Objectif
Vérifier que l'utilisateur peut connecter son compte Google Drive.

#### Procédure

1. **Connexion Google Drive**
   ```
   1. Aller sur /dashboard/parametres/integrations
   2. Cliquer "Connecter Google Drive"
   3. Autoriser accès Google (OAuth consent screen)
   4. Vérifier redirection vers /api/auth/google-drive/callback
   5. Vérifier message succès "Google Drive connecté"
   ```

2. **Vérification DB**
   ```sql
   SELECT
     user_id,
     provider,
     root_folder_id,
     folder_name,
     token_expires_at
   FROM cloud_providers_config
   WHERE user_id = '[USER_ID]'
     AND provider = 'google_drive';
   ```

   **Attendu:**
   - Entrée existe avec `root_folder_id` non NULL
   - `folder_name` = "Avocat - Documents"
   - `token_expires_at` = maintenant + 1 heure

3. **Vérification Google Drive**
   ```
   1. Aller sur Google Drive (drive.google.com)
   2. Vérifier qu'un dossier "Avocat - Documents" a été créé
   3. Vérifier permissions (shared with app)
   ```

#### Résultat attendu
✅ OAuth flow complet sans erreur
✅ Configuration sauvegardée dans DB
✅ Dossier racine créé sur Google Drive

---

### Test 2 : Token Refresh Automatique

#### Objectif
Vérifier que le token est automatiquement rafraîchi quand il expire.

#### Procédure

1. **Forcer expiration token**
   ```sql
   UPDATE cloud_providers_config
   SET token_expires_at = now() - INTERVAL '1 hour'
   WHERE user_id = '[USER_ID]'
     AND provider = 'google_drive';
   ```

2. **Exécuter script test OAuth**
   ```bash
   node --loader ts-node/esm scripts/test-google-drive-oauth.ts [USER_ID]
   ```

3. **Vérifier logs**
   ```
   [2/5] Validation token (refresh si expiré)...
   ⚠️  Token expiré, refresh automatique...
   ✅ Token valide (expire dans 60 minutes)
   ```

4. **Vérifier DB**
   ```sql
   SELECT
     token_expires_at,
     updated_at
   FROM cloud_providers_config
   WHERE user_id = '[USER_ID]'
     AND provider = 'google_drive';
   ```

   **Attendu:**
   - `token_expires_at` mis à jour (maintenant + 1h)
   - `updated_at` = maintenant

#### Résultat attendu
✅ Token rafraîchi automatiquement
✅ Appels API Google Drive fonctionnent après refresh
✅ Pas d'erreur 401 Unauthorized

---

### Test 3 : Upload Document vers Google Drive

#### Objectif
Vérifier qu'un document uploadé depuis l'app est bien stocké sur Google Drive avec la bonne structure.

#### Procédure

1. **Créer dossier client**
   ```
   1. Aller sur /dashboard/dossiers
   2. Créer nouveau dossier
   3. Client: "Test Client"
   4. Numéro: "TEST-001"
   ```

2. **Upload document**
   ```
   1. Ouvrir dossier "TEST-001"
   2. Onglet "Documents"
   3. Cliquer "Ajouter document"
   4. Sélectionner fichier PDF (ex: contrat.pdf)
   5. Catégorie: "Contrat"
   6. Valider
   ```

3. **Vérifier DB**
   ```sql
   SELECT
     id,
     nom_fichier,
     external_file_id,
     external_sharing_link,
     storage_provider,
     created_at
   FROM documents
   WHERE dossier_id = '[DOSSIER_ID]'
   ORDER BY created_at DESC
   LIMIT 1;
   ```

   **Attendu:**
   - `external_file_id` non NULL (ID Google Drive)
   - `external_sharing_link` non NULL (URL de partage)
   - `storage_provider` = 'google_drive'

4. **Vérifier Google Drive**
   ```
   1. Aller sur Google Drive
   2. Naviguer: Avocat - Documents / Test Client / TEST-001 - [Objet]
   3. Vérifier présence fichier "contrat.pdf"
   4. Vérifier permissions (peut ouvrir le fichier)
   ```

#### Résultat attendu
✅ Document uploadé vers Google Drive
✅ Structure dossiers respectée (Client / Dossier)
✅ Lien de partage fonctionnel
✅ Métadonnées sauvegardées dans DB

---

### Test 4 : Webhook Push Notifications

#### Objectif
Vérifier que Google Drive envoie des notifications quand un fichier change.

#### Procédure

1. **Créer webhook**
   ```bash
   node --loader ts-node/esm scripts/test-google-drive-webhook.ts [USER_ID]
   ```

   **Attendu:**
   ```
   ✅ Webhook créé avec succès
   - Channel ID: [UUID]
   - Resource ID: [UUID]
   - Expire le: [DATE +7 jours]
   ```

2. **Vérifier DB (webhook_channels)**
   ```sql
   SELECT
     channel_id,
     resource_id,
     folder_name,
     expires_at,
     stopped_at
   FROM webhook_channels
   WHERE user_id = '[USER_ID]'
     AND stopped_at IS NULL
   ORDER BY created_at DESC
   LIMIT 1;
   ```

   **Attendu:**
   - Entrée existe avec `stopped_at` = NULL
   - `expires_at` = maintenant + 7 jours

3. **Déclencher notification (modifier fichier)**
   ```
   1. Aller sur Google Drive
   2. Ouvrir dossier "Avocat - Documents"
   3. Créer nouveau fichier ou modifier existant
   4. Sauvegarder
   ```

4. **Vérifier webhook reçu (logs serveur)**
   ```bash
   # Logs PM2 (si VPS)
   pm2 logs avocat-saas --lines 50 | grep "Google Drive Webhook"

   # Logs Next.js (si dev)
   # Voir dans terminal npm run dev
   ```

   **Attendu:**
   ```
   [Google Drive Webhook] POST reçu
   [Google Drive Webhook] Channel ID: [UUID]
   [Google Drive Webhook] Resource State: update
   [Google Drive Webhook] Sync déclenchée pour user: [USER_ID]
   ```

5. **Vérifier sync_logs**
   ```sql
   SELECT
     sync_type,
     sync_status,
     files_scanned,
     files_added,
     started_at,
     completed_at,
     duration_ms
   FROM sync_logs
   WHERE user_id = '[USER_ID]'
   ORDER BY started_at DESC
   LIMIT 1;
   ```

   **Attendu:**
   - `sync_type` = 'webhook'
   - `sync_status` = 'success'
   - `files_scanned` >= 1
   - `duration_ms` < 10000 (< 10 secondes)

#### Résultat attendu
✅ Webhook créé et enregistré
✅ Google Drive envoie POST sur changement fichier
✅ Synchronisation déclenchée automatiquement
✅ Sync logs enregistrés

---

### Test 5 : Renouvellement Webhook (Avant Expiration)

#### Objectif
Vérifier que les webhooks sont renouvelés automatiquement avant expiration (7 jours).

#### Procédure

1. **Simuler webhook expirant bientôt**
   ```sql
   UPDATE webhook_channels
   SET expires_at = now() + INTERVAL '12 hours'
   WHERE user_id = '[USER_ID]'
     AND stopped_at IS NULL;
   ```

2. **Vérifier vue webhook_channels_expiring_soon**
   ```sql
   SELECT
     user_id,
     channel_id,
     hours_until_expiration,
     expires_at,
     has_valid_config
   FROM webhook_channels_expiring_soon
   WHERE user_id = '[USER_ID]';
   ```

   **Attendu:**
   - Webhook apparaît dans la vue (< 24h)
   - `hours_until_expiration` = 12
   - `has_valid_config` = true

3. **Exécuter script renouvellement**
   ```bash
   node --loader ts-node/esm scripts/renew-google-drive-webhooks.ts
   ```

   **Attendu:**
   ```
   [Webhook Renewal] 1 webhook(s) à renouveler
   [Webhook Renewal] Ancien webhook arrêté: [OLD_CHANNEL_ID]
   [Webhook Renewal] Nouveau webhook créé: [NEW_CHANNEL_ID]
   [Webhook Renewal] ✅ Webhook renouvelé avec succès pour user [USER_ID]
   [Webhook Renewal] Terminé: 1 renouvelés, 0 échecs
   ```

4. **Vérifier DB après renouvellement**
   ```sql
   SELECT
     channel_id,
     resource_id,
     expires_at,
     renewed_at
   FROM webhook_channels
   WHERE user_id = '[USER_ID]'
     AND stopped_at IS NULL;
   ```

   **Attendu:**
   - Nouveau `channel_id` (différent de l'ancien)
   - `expires_at` = maintenant + 7 jours
   - `renewed_at` = maintenant

#### Résultat attendu
✅ Webhook expirant détecté automatiquement
✅ Ancien webhook arrêté
✅ Nouveau webhook créé
✅ Base de données mise à jour

---

## 🟢 Messaging (WhatsApp) - Tests

### Test 6 : Vérification Webhook Meta

#### Objectif
Vérifier que Meta peut valider le webhook URL lors de la configuration.

#### Procédure

1. **Configuration webhook Meta**
   ```
   1. Aller sur Meta for Developers
   2. App > WhatsApp > Configuration
   3. Webhook URL: https://avocat.tn/api/webhooks/whatsapp
   4. Token de vérification: [WHATSAPP_WEBHOOK_VERIFY_TOKEN]
   5. Cliquer "Vérifier et enregistrer"
   ```

2. **Vérifier logs serveur (GET reçu)**
   ```
   [WhatsApp Webhook] GET verification: { mode: 'subscribe', token: '...' }
   [WhatsApp Webhook] Vérification réussie, challenge retourné
   ```

3. **Vérifier Meta Dashboard**
   ```
   ✅ Webhook vérifié avec succès
   Champs à souscrire: messages
   ```

#### Résultat attendu
✅ Meta valide le webhook URL
✅ Token de vérification accepté
✅ Webhook activé

---

### Test 7 : Réception Message WhatsApp (Client Connu + 1 Dossier)

#### Objectif
Vérifier rattachement automatique document quand client a 1 seul dossier actif.

#### Procédure

1. **Créer client et dossier**
   ```
   1. Créer client "Test WhatsApp"
   2. Téléphone: +21612345678 (normaliser format E.164)
   3. Créer 1 dossier actif pour ce client
   ```

2. **Configurer WhatsApp utilisateur**
   ```sql
   INSERT INTO messaging_webhooks_config (
     user_id,
     platform,
     phone_number,
     phone_number_id,
     access_token,
     enabled,
     send_confirmation
   ) VALUES (
     '[USER_ID]',
     'whatsapp',
     '+21698765432',
     '[WHATSAPP_PHONE_NUMBER_ID]',
     '[ACCESS_TOKEN]',
     true,
     true
   );
   ```

3. **Envoyer message depuis WhatsApp client**
   ```
   - Envoyer PDF/image depuis +21612345678 vers +21698765432
   - Attendre réponse automatique
   ```

4. **Vérifier logs webhook**
   ```
   [WhatsApp Webhook] Message entrant: { type: 'document', from: '+21612345678' }
   [WhatsApp Webhook] Média téléchargé: { fileName: 'document.pdf', size: 45678 }
   [WhatsApp Webhook] Client identifié: { clientId: '...' }
   [WhatsApp Webhook] Rattachement automatique au dossier: TEST-001
   [WhatsApp Webhook] Document uploadé avec succès
   ```

5. **Vérifier DB (whatsapp_messages)**
   ```sql
   SELECT
     whatsapp_message_id,
     from_phone,
     client_id,
     message_type,
     processing_status,
     document_id,
     received_at,
     processed_at
   FROM whatsapp_messages
   WHERE from_phone = '+21612345678'
   ORDER BY received_at DESC
   LIMIT 1;
   ```

   **Attendu:**
   - `client_id` non NULL (client identifié)
   - `processing_status` = 'document_created'
   - `document_id` non NULL (document créé)
   - `processed_at` non NULL

6. **Vérifier DB (documents)**
   ```sql
   SELECT
     id,
     nom_fichier,
     dossier_id,
     source_type,
     source_metadata
   FROM documents
   WHERE source_metadata->>'sender_phone' = '+21612345678'
   ORDER BY created_at DESC
   LIMIT 1;
   ```

   **Attendu:**
   - Document créé
   - `source_type` = 'whatsapp'
   - `source_metadata` contient `sender_phone`, `message_id`

7. **Vérifier message confirmation WhatsApp**
   ```
   Client reçoit:
   "✅ Document bien reçu et rattaché au dossier TEST-001."
   ```

8. **Vérifier email avocat**
   ```
   Sujet: "Document WhatsApp rattaché automatiquement"
   Contenu:
   - Nom client: Test WhatsApp
   - Téléphone: +21612345678
   - Document: document.pdf (45 KB)
   - Dossier: TEST-001
   - Bouton: "Voir le dossier"
   ```

#### Résultat attendu
✅ Message reçu et traité
✅ Média téléchargé
✅ Client identifié
✅ Document rattaché automatiquement
✅ Confirmation WhatsApp envoyée
✅ Email notification avocat envoyé
✅ Historique complet dans whatsapp_messages

---

### Test 8 : Réception Message (Client Connu + Plusieurs Dossiers)

#### Objectif
Vérifier que le document est mis en attente si le client a plusieurs dossiers actifs.

#### Procédure

1. **Créer client avec 2+ dossiers actifs**
   ```
   Client "Test Multi-Dossiers"
   Téléphone: +21611111111
   Dossiers actifs: TEST-002, TEST-003
   ```

2. **Envoyer message WhatsApp**
   ```
   Envoyer PDF depuis +21611111111
   ```

3. **Vérifier logs**
   ```
   [WhatsApp Webhook] Plusieurs dossiers actifs, stockage en attente
   ```

4. **Vérifier DB (whatsapp_messages)**
   ```sql
   SELECT processing_status, pending_document_id
   FROM whatsapp_messages
   WHERE from_phone = '+21611111111'
   ORDER BY received_at DESC
   LIMIT 1;
   ```

   **Attendu:**
   - `processing_status` = 'document_created'
   - `pending_document_id` non NULL (pas de `document_id`)

5. **Vérifier DB (pending_documents)**
   ```sql
   SELECT *
   FROM pending_documents
   WHERE sender_phone = '+21611111111'
   ORDER BY created_at DESC
   LIMIT 1;
   ```

   **Attendu:**
   - Document en attente de rattachement
   - `status` = 'pending'
   - `client_id` non NULL

6. **Vérifier message WhatsApp**
   ```
   "📥 Document bien reçu. Votre avocat va le rattacher au bon dossier sous peu."
   ```

7. **Vérifier email avocat**
   ```
   Sujet: "Action requise : Document WhatsApp à rattacher"
   Contenu:
   - Nom client: Test Multi-Dossiers
   - Nombre dossiers actifs: 2
   - Bouton: "Classer le document"
   ```

#### Résultat attendu
✅ Document stocké dans pending_documents
✅ Status 'document_created' avec pending_document_id
✅ Email "action requise" envoyé
✅ Avocat peut rattacher manuellement depuis dashboard

---

### Test 9 : Réception Message (Numéro Inconnu)

#### Objectif
Vérifier gestion des messages depuis numéros non enregistrés.

#### Procédure

1. **Envoyer message depuis numéro inconnu**
   ```
   Envoyer PDF depuis +21699999999 (non dans clients)
   ```

2. **Vérifier logs**
   ```
   [WhatsApp Webhook] Client non trouvé: +21699999999
   ```

3. **Vérifier DB (whatsapp_messages)**
   ```sql
   SELECT
     from_phone,
     client_id,
     user_id,
     processing_status,
     pending_document_id
   FROM whatsapp_messages
   WHERE from_phone = '+21699999999'
   ORDER BY received_at DESC
   LIMIT 1;
   ```

   **Attendu:**
   - `client_id` = NULL (non identifié)
   - `user_id` = NULL
   - `processing_status` = 'client_not_found'
   - `pending_document_id` non NULL

4. **Vérifier DB (pending_documents)**
   ```sql
   SELECT *
   FROM pending_documents
   WHERE sender_phone = '+21699999999';
   ```

   **Attendu:**
   - `client_id` = NULL
   - `user_id` = NULL (ou attribué manuellement plus tard)

5. **Vérifier message WhatsApp**
   ```
   "📥 Document bien reçu. Votre avocat va le traiter dans les plus brefs délais."
   ```

#### Résultat attendu
✅ Message reçu malgré numéro inconnu
✅ Status 'client_not_found'
✅ Document stocké pour traitement ultérieur

---

### Test 10 : Expiration Média WhatsApp (30 jours)

#### Objectif
Vérifier que les médias téléchargés sont bien cachés et que les URLs expirées sont gérées.

#### Procédure

1. **Vérifier cache après réception message**
   ```sql
   SELECT
     media_id,
     storage_url,
     whatsapp_url_expires_at,
     is_expired
   FROM whatsapp_media_cache
   WHERE whatsapp_message_id = '[MESSAGE_ID]';
   ```

   **Attendu:**
   - Entrée existe
   - `is_expired` = false (< 30 jours)
   - `storage_url` non NULL

2. **Simuler expiration (forcer date)**
   ```sql
   UPDATE whatsapp_media_cache
   SET whatsapp_url_expires_at = now() - INTERVAL '1 day'
   WHERE media_id = '[MEDIA_ID]';
   ```

3. **Vérifier vue whatsapp_media_expired**
   ```sql
   SELECT *
   FROM whatsapp_media_expired
   WHERE media_id = '[MEDIA_ID]';
   ```

   **Attendu:**
   - Média apparaît dans vue
   - `is_expired` = true
   - `days_since_expired` = 1

4. **Tester accès média après expiration**
   ```
   - Tenter télécharger média via storage_url (Supabase)
   - Vérifier que ça fonctionne (permanent)
   ```

#### Résultat attendu
✅ Média caché après téléchargement
✅ Expiration détectée automatiquement
✅ Accès via Supabase Storage fonctionne après expiration

---

## 📊 Monitoring Dashboard (Bonus Phase 2)

### Widget Cloud Storage (Google Drive)

**Affichage:**
- Espace utilisé Google Drive
- Dernier sync: Date + statut
- Webhook actif: Oui/Non + expiration dans X jours
- Nombre documents synchronisés (30 jours)

**Requête:**
```sql
SELECT
  (SELECT COUNT(*) FROM sync_logs WHERE user_id = '[USER_ID]' AND created_at > now() - INTERVAL '30 days') as total_syncs,
  (SELECT sync_status FROM sync_logs WHERE user_id = '[USER_ID]' ORDER BY started_at DESC LIMIT 1) as last_sync_status,
  (SELECT started_at FROM sync_logs WHERE user_id = '[USER_ID]' ORDER BY started_at DESC LIMIT 1) as last_sync_at,
  (SELECT expires_at FROM webhook_channels WHERE user_id = '[USER_ID]' AND stopped_at IS NULL LIMIT 1) as webhook_expires_at;
```

### Widget Messaging (WhatsApp)

**Affichage:**
- Messages reçus (7 jours)
- Documents en attente de rattachement
- Taux rattachement automatique
- Derniers messages

**Requête:**
```sql
SELECT * FROM whatsapp_stats_30d WHERE user_id = '[USER_ID]';
```

---

## ✅ Checklist Validation Complète

### Cloud Storage
- [ ] OAuth flow fonctionnel
- [ ] Token refresh automatique
- [ ] Upload document vers Google Drive
- [ ] Structure dossiers correcte
- [ ] Webhook push notifications
- [ ] Synchronisation déclenchée automatiquement
- [ ] Renouvellement webhook avant expiration
- [ ] Logs complets dans sync_logs et webhook_channels

### Messaging WhatsApp
- [ ] Webhook Meta validé
- [ ] Message reçu et traité
- [ ] Média téléchargé immédiatement
- [ ] Rattachement automatique (1 dossier)
- [ ] Pending documents (plusieurs dossiers)
- [ ] Gestion numéros inconnus
- [ ] Cache média fonctionnel
- [ ] Expiration média gérée (30 jours)
- [ ] Emails notifications envoyés
- [ ] Logs complets dans whatsapp_messages

---

## 🐛 Problèmes Fréquents

### Cloud Storage

**Erreur: "Token expired"**
- Cause: Token OAuth expiré et refresh échoué
- Solution: Reconnecter Google Drive depuis /parametres/integrations

**Erreur: "Webhook not received"**
- Cause: Webhook expiré (> 7 jours)
- Solution: Exécuter script renouvellement ou reconnecter

**Erreur: "Folder not found"**
- Cause: Dossier racine supprimé manuellement sur Google Drive
- Solution: Reconnecter Google Drive (recrée structure)

### Messaging WhatsApp

**Erreur: "Signature invalide"**
- Cause: WHATSAPP_APP_SECRET incorrect
- Solution: Vérifier variable d'environnement

**Erreur: "Client not found" (mais existe)**
- Cause: Téléphone non normalisé format E.164
- Solution: Normaliser téléphone: +[code pays][numéro sans espaces]

**Erreur: "Media download failed"**
- Cause: access_token WhatsApp expiré ou URL média expirée (> 30 jours)
- Solution: Renouveler token ou utiliser cache média

---

## 📝 Rapports de Test

Après validation, documenter les résultats:

```markdown
# Rapport Validation - [Date]

## Cloud Storage
- OAuth: ✅ / ❌
- Upload: ✅ / ❌
- Webhook: ✅ / ❌
- Renouvellement: ✅ / ❌

## Messaging WhatsApp
- Webhook Meta: ✅ / ❌
- Rattachement auto: ✅ / ❌
- Pending docs: ✅ / ❌
- Numéro inconnu: ✅ / ❌

## Problèmes rencontrés
[Décrire problèmes]

## Actions correctives
[Décrire corrections]
```

---

**Contact Support:** Si problème persistant, vérifier logs dans:
- `/var/log/pm2/avocat-saas-error.log`
- Tables `sync_logs`, `webhook_channels`, `whatsapp_messages`
