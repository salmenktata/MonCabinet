# Google Drive Webhooks - Configuration et Maintenance

## 📋 Vue d'ensemble

Les webhooks Google Drive permettent de recevoir des notifications en temps réel quand un fichier change dans Google Drive, déclenchant automatiquement une synchronisation.

**⚠️ Important** : Les webhooks Google Drive expirent automatiquement après **7 jours maximum**. Il faut les renouveler régulièrement.

## 🔄 Fonctionnement

```
Google Drive Change
       ↓
Google envoie POST webhook
       ↓
/api/webhooks/google-drive
       ↓
Déclenche sync-service
       ↓
Documents mis à jour dans DB
```

## 📊 Tables de tracking

### `webhook_channels`
Stocke les informations des webhooks actifs avec leur date d'expiration.

```sql
SELECT * FROM webhook_channels WHERE stopped_at IS NULL;
```

### `sync_logs`
Historique de toutes les synchronisations déclenchées.

```sql
SELECT * FROM sync_logs ORDER BY started_at DESC LIMIT 10;
```

## ⏰ Renouvellement automatique

### Configuration Cron (VPS)

```bash
# Ajouter au crontab
crontab -e

# Renouveler webhooks tous les jours à 2h00
0 2 * * * cd /var/www/avocat-saas && node --loader ts-node/esm scripts/renew-google-drive-webhooks.ts >> /var/log/webhook-renewal.log 2>&1
```

### Configuration PM2 (recommandé)

```javascript
// ecosystem.config.js
module.exports = {
  apps: [
    // ... app principale
    {
      name: 'webhook-renewal',
      script: 'scripts/renew-google-drive-webhooks.ts',
      interpreter: 'node',
      interpreter_args: '--loader ts-node/esm',
      cron_restart: '0 2 * * *',  // 2h00 tous les jours
      autorestart: false,
      watch: false
    }
  ]
};
```

### Vérification webhooks expirant bientôt

```sql
-- Vue des webhooks expirant dans < 24h
SELECT 
  user_id,
  channel_id,
  hours_until_expiration,
  expires_at
FROM webhook_channels_expiring_soon;
```

## 🛠️ Maintenance manuelle

### Renouveler un webhook spécifique

```typescript
import { createGoogleDriveProvider } from '@/lib/integrations/cloud-storage'

const provider = createGoogleDriveProvider({ ... })

// Arrêter ancien
await provider.stopFileWatch(oldChannelId, oldResourceId)

// Créer nouveau
const newWatch = await provider.watchFolder(
  folderId,
  'https://avocat.tn/api/webhooks/google-drive',
  process.env.GOOGLE_DRIVE_WEBHOOK_VERIFY_TOKEN
)

// Sauvegarder en DB
await supabase.from('webhook_channels').insert({
  user_id: userId,
  provider: 'google_drive',
  channel_id: newWatch.channelId,
  resource_id: newWatch.resourceId,
  folder_id: folderId,
  expires_at: newWatch.expiresAt
})
```

### Arrêter tous les webhooks d'un utilisateur

```typescript
const { data: channels } = await supabase
  .from('webhook_channels')
  .select('*')
  .eq('user_id', userId)
  .is('stopped_at', null)

for (const channel of channels) {
  await provider.stopFileWatch(channel.channel_id, channel.resource_id)
  
  await supabase
    .from('webhook_channels')
    .update({ stopped_at: new Date().toISOString() })
    .eq('id', channel.id)
}
```

## 📈 Monitoring

### Statistiques synchronisation (30 jours)

```sql
SELECT * FROM sync_stats_30d WHERE user_id = 'xxx';
```

### Logs synchronisation récents

```sql
SELECT 
  sync_type,
  sync_status,
  started_at,
  duration_ms,
  files_scanned,
  files_added,
  error_message
FROM sync_logs
WHERE user_id = 'xxx'
ORDER BY started_at DESC
LIMIT 20;
```

### Webhooks actifs

```sql
SELECT 
  user_id,
  channel_id,
  folder_name,
  expires_at,
  EXTRACT(DAY FROM (expires_at - now())) as days_until_expiration
FROM webhook_channels
WHERE stopped_at IS NULL
ORDER BY expires_at ASC;
```

## 🐛 Troubleshooting

### Webhook ne se déclenche pas

**1. Vérifier que le webhook est actif**
```sql
SELECT * FROM webhook_channels 
WHERE user_id = 'xxx' AND stopped_at IS NULL;
```

**2. Vérifier logs Nginx**
```bash
tail -f /var/log/nginx/access.log | grep webhook
```

**3. Tester manuellement**
```bash
curl -X POST https://avocat.tn/api/webhooks/google-drive \
  -H "X-Goog-Channel-Id: test-channel" \
  -H "X-Goog-Resource-State: update" \
  -H "X-Goog-Channel-Token: $WEBHOOK_TOKEN"
```

### Webhook expiré

```sql
-- Identifier webhooks expirés
SELECT * FROM webhook_channels
WHERE expires_at < now() AND stopped_at IS NULL;
```

**Solution** : Exécuter script de renouvellement manuellement :
```bash
node --loader ts-node/esm scripts/renew-google-drive-webhooks.ts
```

### Trop de synchronisations

**Problème** : Google envoie beaucoup de notifications pour un seul changement.

**Solution** : Implémenter debouncing dans le webhook handler (à faire si nécessaire).

## 🔐 Sécurité

### Token de vérification

Le webhook vérifie `X-Goog-Channel-Token` pour chaque requête :

```typescript
const channelToken = headers.get('x-goog-channel-token')
if (channelToken !== WEBHOOK_VERIFY_TOKEN) {
  return NextResponse.json({ error: 'Token invalide' }, { status: 403 })
}
```

**Générer token sécurisé** :
```bash
openssl rand -base64 32
```

**Configurer** :
```bash
# .env.production
GOOGLE_DRIVE_WEBHOOK_VERIFY_TOKEN=votre-token-genere
```

### Rate limiting

Google peut envoyer beaucoup de webhooks. Considérer rate limiting au niveau Nginx :

```nginx
limit_req_zone $binary_remote_addr zone=webhook:10m rate=10r/s;

location /api/webhooks/google-drive {
    limit_req zone=webhook burst=20;
    proxy_pass http://avocat_backend;
}
```

## 📝 Checklist déploiement

- [ ] Variable `GOOGLE_DRIVE_WEBHOOK_VERIFY_TOKEN` configurée
- [ ] Variable `GOOGLE_CLIENT_ID` et `GOOGLE_CLIENT_SECRET` configurées
- [ ] Webhook URL publique accessible (https)
- [ ] Migration `20260205000010_sync_logs_webhook_channels.sql` appliquée
- [ ] Script renouvellement configuré en cron
- [ ] Logs monitored régulièrement
- [ ] Test création webhook fonctionnel
- [ ] Test réception notification fonctionnel

## 🔗 Ressources

- [Google Drive API - Push Notifications](https://developers.google.com/drive/api/guides/push)
- [Webhook Verification](https://developers.google.com/drive/api/guides/push#making-watch-requests)
- [Expiration et renouvellement](https://developers.google.com/drive/api/guides/push#renewing-channel)

---

**Support** : En cas de problème, vérifier les logs dans `/var/log/webhook-renewal.log`
