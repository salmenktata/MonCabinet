# Configuration Cron Job Supabase - Notifications Quotidiennes

## 📋 Vue d'ensemble

Ce guide explique comment configurer le Cron job Supabase qui envoie automatiquement des emails de notifications quotidiennes à 6h00 (heure Tunisie).

## 🚀 Installation rapide

### 1. Appliquer la migration SQL

**Option A : Via Supabase CLI** (recommandé)
```bash
cd /Users/salmenktata/Projets/GitHub/Avocat
supabase db push
```

**Option B : Via Dashboard Supabase**
1. Aller dans **SQL Editor**
2. Copier-coller le contenu de `supabase/migrations/20260205000009_configure_cron_notifications.sql`
3. Exécuter

### 2. Générer et configurer le secret Cron

```bash
# Générer un secret sécurisé
export CRON_SECRET=$(openssl rand -base64 32)
echo "Secret généré: $CRON_SECRET"
```

### 3. Configurer les secrets Supabase

**Via Dashboard Supabase** (recommandé) :
1. Aller dans **Project Settings** > **Vault**
2. Créer 2 nouveaux secrets :
   - `app.settings.cron_secret` = `<votre-secret-généré>`
   - `app.settings.supabase_url` = `https://vgaofkucdpydyblrykbh.supabase.co`

**Via CLI** :
```bash
# Configurer le secret dans l'Edge Function
supabase secrets set CRON_SECRET=$CRON_SECRET

# Note: Les secrets Vault doivent être configurés via le Dashboard
```

### 4. Vérifier la configuration

```sql
-- Vérifier que le job existe
SELECT * FROM cron.job WHERE jobname = 'daily-notifications-6am';

-- Vérifier les exécutions récentes
SELECT * FROM cron_job_status;

-- Tester manuellement la fonction
SELECT trigger_daily_notifications();
```

## ⏰ Horaire et fuseau horaire

### Configuration actuelle
- **Horaire** : `0 5 * * *` (05:00 UTC)
- **Équivalent Tunisie** : 06:00 (hiver, UTC+1)
- **Fréquence** : Quotidien

### Ajustement heure d'été

La Tunisie utilise UTC+1 en hiver. Si besoin d'ajuster pour l'heure d'été (UTC+2) :

```sql
-- Pour 06:00 en été (UTC+2), utiliser 04:00 UTC
SELECT cron.unschedule('daily-notifications-6am');
SELECT cron.schedule(
  'daily-notifications-6am',
  '0 4 * * *',  -- 04:00 UTC = 06:00 Tunisie (été)
  'SELECT trigger_daily_notifications();'
);
```

### Autres horaires courants

```sql
-- 07:00 Tunisie (hiver)
'0 6 * * *'

-- 08:00 Tunisie (hiver)
'0 7 * * *'

-- 18:00 Tunisie (hiver) - envoi en soirée
'0 17 * * *'
```

## 🔍 Monitoring

### Vérifier les exécutions

```sql
-- Vue simplifiée des dernières exécutions
SELECT * FROM cron_job_status;

-- Détails complets
SELECT 
  jobname,
  start_time,
  end_time,
  status,
  return_message,
  duration_seconds
FROM cron.job_run_details
WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'daily-notifications-6am')
ORDER BY start_time DESC
LIMIT 10;
```

### Logs Edge Function

1. Aller dans **Supabase Dashboard** > **Edge Functions** > **send-notifications**
2. Cliquer sur **Logs**
3. Vérifier les logs d'exécution quotidienne

Logs attendus :
```json
{
  "success": true,
  "message": "Notifications envoyées",
  "stats": {
    "total_users": 10,
    "emails_sent": 8,
    "emails_failed": 0
  }
}
```

## 🛠️ Maintenance

### Désactiver temporairement

```sql
-- Désactiver le job
SELECT cron.unschedule('daily-notifications-6am');

-- Vérifier qu'il est bien supprimé
SELECT * FROM cron.job WHERE jobname = 'daily-notifications-6am';
-- Doit retourner 0 lignes
```

### Réactiver

```sql
-- Recréer le job
SELECT cron.schedule(
  'daily-notifications-6am',
  '0 5 * * *',
  'SELECT trigger_daily_notifications();'
);
```

### Tester manuellement

```sql
-- Exécuter immédiatement (sans attendre 6h00)
SELECT trigger_daily_notifications();

-- Vérifier la dernière exécution
SELECT * FROM cron_job_status LIMIT 1;
```

### Changer l'horaire

```sql
-- Supprimer l'ancien job
SELECT cron.unschedule('daily-notifications-6am');

-- Créer avec nouvel horaire (ex: 8h00)
SELECT cron.schedule(
  'daily-notifications-8am',
  '0 7 * * *',  -- 07:00 UTC = 08:00 Tunisie
  'SELECT trigger_daily_notifications();'
);
```

## 🐛 Troubleshooting

### Le job ne s'exécute pas

**1. Vérifier que le job existe**
```sql
SELECT * FROM cron.job WHERE jobname = 'daily-notifications-6am';
```

**2. Vérifier que pg_cron est actif**
```sql
SELECT * FROM pg_extension WHERE extname = 'pg_cron';
-- Doit retourner 1 ligne
```

**3. Vérifier les permissions**
```sql
SELECT * FROM cron.job_run_details 
WHERE status = 'failed' 
ORDER BY start_time DESC 
LIMIT 5;
```

### Erreur "Extension pg_cron does not exist"

```sql
-- Activer l'extension manuellement
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;
```

### Erreur "Permission denied"

```sql
-- Accorder les permissions
GRANT USAGE ON SCHEMA cron TO postgres;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA cron TO postgres;
```

### L'Edge Function retourne 401 Unauthorized

**Cause** : CRON_SECRET non configuré ou incorrect

**Solution** :
1. Vérifier le secret dans l'Edge Function :
   ```bash
   supabase secrets list
   ```

2. Vérifier le secret dans Vault :
   - Dashboard > Project Settings > Vault
   - Chercher `app.settings.cron_secret`

3. S'assurer qu'ils correspondent :
   ```sql
   -- Afficher le secret Vault (masqué)
   SELECT current_setting('app.settings.cron_secret', true);
   ```

### Aucun email reçu

**1. Vérifier que des utilisateurs ont les notifications activées**
```sql
SELECT COUNT(*) 
FROM notification_preferences 
WHERE enabled = true 
  AND daily_digest_enabled = true;
```

**2. Vérifier les logs Resend**
- Aller sur https://resend.com/emails
- Vérifier les emails envoyés aujourd'hui

**3. Vérifier la clé Resend dans l'Edge Function**
```bash
supabase secrets list | grep RESEND_API_KEY
```

## 📊 Métriques de performance

### Temps d'exécution attendu
- **10 utilisateurs** : ~2-5 secondes
- **50 utilisateurs** : ~10-20 secondes  
- **100 utilisateurs** : ~30-45 secondes

### Limites
- **Supabase pg_cron** : 500 jobs maximum
- **Edge Function timeout** : 60 secondes par défaut
- **Resend gratuit** : 3,000 emails/mois

## 🔐 Sécurité

### Bonnes pratiques

1. **Secret fort** : Utiliser `openssl rand -base64 32`
2. **Rotation** : Changer le secret tous les 90 jours
3. **Logs** : Monitorer les échecs d'authentification
4. **Rate limiting** : Le Cron job appelle 1 fois/jour uniquement

### Rotation du secret

```bash
# 1. Générer nouveau secret
NEW_SECRET=$(openssl rand -base64 32)

# 2. Mettre à jour Edge Function
supabase secrets set CRON_SECRET=$NEW_SECRET

# 3. Mettre à jour Vault
# Via Dashboard > Project Settings > Vault
# Modifier app.settings.cron_secret

# 4. Tester
psql -c "SELECT trigger_daily_notifications();"
```

## 📝 Commandes utiles

```sql
-- Liste tous les jobs Cron
SELECT * FROM cron.job;

-- Historique complet des exécutions
SELECT * FROM cron.job_run_details ORDER BY start_time DESC;

-- Jobs actifs uniquement
SELECT * FROM cron.job WHERE active = true;

-- Dernière exécution de chaque job
SELECT DISTINCT ON (jobid) *
FROM cron.job_run_details
ORDER BY jobid, start_time DESC;

-- Statistiques par job
SELECT 
  j.jobname,
  COUNT(r.runid) as total_runs,
  COUNT(CASE WHEN r.status = 'succeeded' THEN 1 END) as successes,
  COUNT(CASE WHEN r.status = 'failed' THEN 1 END) as failures,
  AVG(EXTRACT(EPOCH FROM (r.end_time - r.start_time))) as avg_duration_sec
FROM cron.job j
LEFT JOIN cron.job_run_details r ON j.jobid = r.jobid
GROUP BY j.jobname;
```

## 🎯 Checklist de déploiement

- [ ] Migration SQL appliquée
- [ ] Extension pg_cron activée
- [ ] Extension pg_net activée
- [ ] Secret CRON_SECRET généré
- [ ] Secret configuré dans Edge Function
- [ ] Secret configuré dans Vault
- [ ] Edge Function déployée
- [ ] Job Cron créé
- [ ] Test manuel réussi
- [ ] Première exécution automatique validée
- [ ] Logs monitored pendant 7 jours
- [ ] Documentation partagée avec l'équipe

## 📚 Ressources

- [Supabase pg_cron Documentation](https://supabase.com/docs/guides/database/extensions/pg_cron)
- [Supabase Edge Functions](https://supabase.com/docs/guides/functions)
- [Cron Expression Generator](https://crontab.guru)
- [Resend Documentation](https://resend.com/docs)

## 💡 Astuces

### Tester sans attendre 6h00

```sql
-- Exécuter immédiatement
SELECT trigger_daily_notifications();
```

### Créer un job de test (toutes les 5 minutes)

```sql
SELECT cron.schedule(
  'test-notifications-5min',
  '*/5 * * * *',  -- Toutes les 5 minutes
  'SELECT trigger_daily_notifications();'
);

-- Ne pas oublier de supprimer après tests !
SELECT cron.unschedule('test-notifications-5min');
```

### Voir les prochaines exécutions

pg_cron n'expose pas directement les prochaines exécutions, mais vous pouvez calculer :

```sql
-- Pour un job quotidien à 05:00 UTC
SELECT 
  jobname,
  schedule,
  CASE 
    WHEN EXTRACT(HOUR FROM NOW() AT TIME ZONE 'UTC') < 5 
    THEN CURRENT_DATE + INTERVAL '5 hours'
    ELSE CURRENT_DATE + INTERVAL '1 day' + INTERVAL '5 hours'
  END as next_execution
FROM cron.job
WHERE jobname = 'daily-notifications-6am';
```

---

**Support** : En cas de problème, vérifier les logs dans `/supabase/functions/send-notifications/README.md`
