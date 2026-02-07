# WhatsApp Messaging - Configuration et Maintenance

## 📋 Vue d'ensemble

Le système de messaging WhatsApp permet aux avocats de recevoir automatiquement des documents envoyés par leurs clients via WhatsApp Business API.

## 🔄 Fonctionnement

```
Client envoie document WhatsApp
       ↓
Meta envoie POST webhook avec signature
       ↓
/api/webhooks/whatsapp valide signature
       ↓
Télécharge média (expire après 30j)
       ↓
Identifie client via téléphone
       ↓
Rattache document automatiquement ou manuellement
       ↓
Notification email avocat
```

## 📊 Tables de tracking

### `whatsapp_messages`
Historique complet de tous les messages WhatsApp reçus.

```sql
SELECT * FROM whatsapp_messages
WHERE user_id = 'xxx'
ORDER BY received_at DESC
LIMIT 20;
```

**Colonnes importantes** :
- `whatsapp_message_id` : ID unique du message (fourni par Meta)
- `from_phone` : Téléphone client (format E.164)
- `client_id` : Client identifié (NULL si inconnu)
- `message_type` : text | image | video | audio | document
- `media_id` : ID média WhatsApp (pour téléchargement)
- `media_expires_at` : Date expiration URL WhatsApp (30 jours)
- `processing_status` : État traitement
  - `received` : Message reçu, parsing OK
  - `media_downloaded` : Média téléchargé depuis WhatsApp
  - `document_created` : Document créé dans système
  - `client_not_found` : Numéro inconnu
  - `error` : Erreur traitement

### `whatsapp_media_cache`
Cache des médias téléchargés pour éviter re-téléchargement après expiration URL WhatsApp.

```sql
SELECT * FROM whatsapp_media_cache
WHERE is_expired = true;
```

**Colonnes importantes** :
- `media_id` : ID média WhatsApp (unique)
- `storage_url` : URL Supabase Storage (permanent)
- `whatsapp_url_expires_at` : Date expiration URL WhatsApp (30 jours)
- `is_expired` : Calculé automatiquement (true si > 30 jours)

## 🔧 Configuration Webhook Meta

### 1. Créer application Meta Business

1. Aller sur [Meta for Developers](https://developers.facebook.com/)
2. Créer application "Business"
3. Ajouter produit "WhatsApp Business"
4. Configurer webhook :
   - URL : `https://avocat.tn/api/webhooks/whatsapp`
   - Token de vérification : `WHATSAPP_WEBHOOK_VERIFY_TOKEN` (générer aléatoire)
   - Champs à souscrire : `messages`

### 2. Variables d'environnement

```bash
# .env.production
WHATSAPP_APP_SECRET=ton_app_secret_meta
WHATSAPP_WEBHOOK_VERIFY_TOKEN=ton_token_verification_webhook
```

**Générer token sécurisé** :
```bash
openssl rand -base64 32
```

### 3. Configuration par utilisateur

Chaque avocat doit configurer sa propre connexion WhatsApp Business :

```sql
INSERT INTO messaging_webhooks_config (
  user_id,
  platform,
  phone_number,
  phone_number_id,
  access_token,
  enabled
) VALUES (
  'user-uuid',
  'whatsapp',
  '+21612345678',
  'whatsapp-phone-number-id',
  'token-acces-meta',
  true
);
```

## 📥 Flux de traitement des messages

### Cas 1 : Client trouvé + 1 seul dossier actif
✅ **Rattachement automatique**

1. Message reçu → Status `received`
2. Média téléchargé → Status `media_downloaded`
3. Client identifié via téléphone normalisé
4. Upload Google Drive automatique → Status `document_created`
5. Email notification avocat "Document rattaché automatiquement"
6. Confirmation WhatsApp client : "✅ Document bien reçu et rattaché au dossier XXX"

### Cas 2 : Client trouvé + Plusieurs dossiers actifs
⏳ **Rattachement manuel requis**

1. Message reçu → Status `received`
2. Média téléchargé → Status `media_downloaded`
3. Client identifié
4. Document stocké dans `pending_documents` → Status `document_created` (avec `pending_document_id`)
5. Email notification avocat "Action requise : Rattacher document au bon dossier"
6. Message WhatsApp client : "📥 Document bien reçu. Votre avocat va le rattacher au bon dossier sous peu."

### Cas 3 : Client trouvé + 0 dossier actif
⚠️ **Création dossier requise**

1. Message reçu → Status `received`
2. Média téléchargé → Status `media_downloaded`
3. Client identifié
4. Document stocké dans `pending_documents` → Status `document_created`
5. Email notification avocat "Aucun dossier actif pour ce client"
6. Message WhatsApp client : "📥 Document bien reçu. Votre avocat va le traiter dans les plus brefs délais."

### Cas 4 : Numéro inconnu
❌ **Client non trouvé**

1. Message reçu → Status `received`
2. Média téléchargé → Status `media_downloaded`
3. Client NON identifié → Status `client_not_found`
4. Document stocké dans `pending_documents` (sans `client_id`)
5. Email notification avocat "Document reçu d'un numéro inconnu"
6. Message WhatsApp : "📥 Document bien reçu. Votre avocat va le traiter dans les plus brefs délais."

## ⚠️ Expiration médias WhatsApp

**Important** : Les URL de médias WhatsApp expirent après **30 jours**.

Le système télécharge les médias **immédiatement** lors de la réception (avant même d'identifier le client) pour éviter la perte des fichiers.

### Cache média

La table `whatsapp_media_cache` stocke :
- L'ID média WhatsApp
- L'URL Supabase Storage (permanent)
- La date d'expiration URL WhatsApp

Si un média est demandé après expiration (> 30 jours), le système utilise l'URL Supabase Storage au lieu de re-télécharger depuis WhatsApp.

## 🧹 Nettoyage automatique

### Nettoyer vieux messages (90 jours)

```sql
SELECT cleanup_old_whatsapp_messages(90);
```

**Configurer Cron** :
```sql
-- Exécuter toutes les semaines (dimanche 3h00)
SELECT cron.schedule(
  'cleanup-whatsapp-messages',
  '0 3 * * 0',
  $$SELECT cleanup_old_whatsapp_messages(90)$$
);
```

### Nettoyer médias expirés

Les médias expirés (> 30 jours) restent en cache mais ne sont plus accessibles via URL WhatsApp. Ils sont automatiquement marqués comme `is_expired = true` (colonne générée).

Pour supprimer complètement les médias très anciens (> 1 an) :

```sql
DELETE FROM whatsapp_media_cache
WHERE whatsapp_url_expires_at < (now() - INTERVAL '1 year');
```

## 📈 Monitoring

### Statistiques messages (30 jours)

```sql
SELECT * FROM whatsapp_stats_30d WHERE user_id = 'xxx';
```

Retourne :
- `total_messages` : Nombre total messages reçus
- `media_messages` : Nombre messages avec média
- `documents_created` : Nombre documents créés
- `unknown_clients` : Nombre numéros inconnus
- `errors` : Nombre erreurs
- `unique_senders` : Nombre expéditeurs uniques
- `last_message_at` : Date dernier message

### Messages récents par statut

```sql
SELECT
  processing_status,
  COUNT(*) as count,
  MAX(received_at) as last_received
FROM whatsapp_messages
WHERE user_id = 'xxx'
  AND received_at > (now() - INTERVAL '7 days')
GROUP BY processing_status;
```

### Médias expirés nécessitant action

```sql
SELECT * FROM whatsapp_media_expired
WHERE days_since_expired > 30
ORDER BY whatsapp_url_expires_at ASC;
```

## 🐛 Troubleshooting

### Message reçu mais pas traité

**1. Vérifier que le webhook est configuré**
```bash
# Logs Nginx
tail -f /var/log/nginx/access.log | grep whatsapp
```

**2. Vérifier configuration WhatsApp utilisateur**
```sql
SELECT * FROM messaging_webhooks_config
WHERE user_id = 'xxx' AND platform = 'whatsapp';
```

**3. Vérifier historique messages**
```sql
SELECT * FROM whatsapp_messages
WHERE from_phone = '+21612345678'
ORDER BY received_at DESC
LIMIT 10;
```

**4. Vérifier erreurs récentes**
```sql
SELECT * FROM whatsapp_messages
WHERE processing_status = 'error'
ORDER BY received_at DESC
LIMIT 10;
```

### Signature invalide

**Erreur** : "Signature invalide" (403)

**Solution** : Vérifier que `WHATSAPP_APP_SECRET` correspond à l'App Secret de l'application Meta.

```bash
# Tester signature manuellement
curl -X POST https://avocat.tn/api/webhooks/whatsapp \
  -H "x-hub-signature-256: sha256=..." \
  -d '{"entry": [...]}'
```

### Média non téléchargé

**Erreur** : "Erreur téléchargement média"

**Causes possibles** :
1. `access_token` expiré ou invalide
2. URL média expirée (> 30 jours)
3. Permissions insuffisantes

**Solution** :
```sql
-- Vérifier token
SELECT
  user_id,
  phone_number,
  LENGTH(access_token) as token_length,
  updated_at
FROM messaging_webhooks_config
WHERE platform = 'whatsapp'
  AND enabled = true;
```

### Client non identifié à tort

**Erreur** : Client existe mais marqué comme "non trouvé"

**Cause** : Le téléphone client n'est pas normalisé au format E.164.

**Solution** :
```sql
-- Normaliser téléphone client
UPDATE clients
SET telephone_normalized = '+21612345678'
WHERE id = 'client-uuid';
```

**Format attendu** : `+[code pays][numéro sans espaces]`
- ✅ Correct : `+21612345678`
- ❌ Incorrect : `12345678`, `+216 12 345 678`, `0021612345678`

## 🔐 Sécurité

### Validation signature HMAC SHA256

Chaque requête Meta contient un header `x-hub-signature-256` :

```
x-hub-signature-256: sha256=hash_du_body
```

Le webhook valide cette signature avec `WHATSAPP_APP_SECRET` avant tout traitement.

### Rate limiting

Meta peut envoyer beaucoup de webhooks. Configurer rate limiting au niveau Nginx :

```nginx
limit_req_zone $binary_remote_addr zone=whatsapp:10m rate=10r/s;

location /api/webhooks/whatsapp {
    limit_req zone=whatsapp burst=20;
    proxy_pass http://avocat_backend;
}
```

### Permissions requises

L'application Meta doit avoir les permissions :
- `whatsapp_business_messaging` : Envoyer/recevoir messages
- `whatsapp_business_management` : Gérer configuration

## 📝 Checklist déploiement

- [ ] Application Meta Business créée
- [ ] Produit WhatsApp Business activé
- [ ] Webhook configuré avec URL publique (HTTPS)
- [ ] Variables `WHATSAPP_APP_SECRET` et `WHATSAPP_WEBHOOK_VERIFY_TOKEN` configurées
- [ ] Migration `20260205000011_whatsapp_messages_media_cache.sql` appliquée
- [ ] Configuration utilisateur (`messaging_webhooks_config`) créée
- [ ] Test vérification webhook (GET) réussi
- [ ] Test réception message (POST) réussi
- [ ] Email notifications fonctionnels
- [ ] Cron cleanup configuré

## 🔗 Ressources

- [WhatsApp Business API - Webhooks](https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks)
- [Webhook Signature Validation](https://developers.facebook.com/docs/graph-api/webhooks/getting-started#verification-requests)
- [Media URLs Expiration](https://developers.facebook.com/docs/whatsapp/cloud-api/reference/media)

---

**Support** : En cas de problème, vérifier les logs dans :
- `/var/log/nginx/avocat-saas-access.log`
- `/var/log/pm2/avocat-saas-error.log`
- Table `whatsapp_messages` pour historique complet
