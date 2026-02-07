# Edge Function: Notifications Email Quotidiennes

## Description

Edge Function Supabase qui envoie un email récapitulatif quotidien à tous les avocats ayant activé les notifications.

## Contenu de l'email

- **Échéances** : J-15, J-7, J-3, J-1 selon préférences
- **Actions urgentes** : Priorité URGENTE ou HAUTE
- **Audiences** : Audiences de la semaine
- **Factures impayées** : Factures > délai configuré (défaut 30j)

## Planification

**Cron** : Tous les jours à **06:00** (heure Tunisie)
- Hiver (UTC+1) : `0 5 * * *`
- Été (UTC+2) : `0 4 * * *`

## Variables d'environnement requises

```bash
SUPABASE_URL=https://vgaofkucdpydyblrykbh.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
RESEND_API_KEY=re_xxxxxxxxxxxxxxxxxxxxxxxxxxxx
BASE_URL=https://avocat.tn
CRON_SECRET=your-secure-random-string
```

## Configuration Supabase

### 1. Déployer la fonction

```bash
supabase functions deploy send-notifications
```

### 2. Configurer les variables d'environnement

```bash
# Via Dashboard Supabase > Edge Functions > Settings
# Ou via CLI:
supabase secrets set RESEND_API_KEY=re_xxx
supabase secrets set BASE_URL=https://avocat.tn
supabase secrets set CRON_SECRET=$(openssl rand -base64 32)
```

### 3. Configurer le Cron

Via Dashboard Supabase :
1. Aller dans **Database** > **Cron Jobs** (extension pg_cron)
2. Créer un nouveau job :

```sql
-- Activer extension pg_cron
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Créer job notifications quotidiennes (6h00 Tunisie = 4h00 UTC en été)
SELECT cron.schedule(
  'daily-notifications',
  '0 4 * * *',
  $$
  SELECT
    net.http_post(
        url:='https://vgaofkucdpydyblrykbh.supabase.co/functions/v1/send-notifications',
        headers:=jsonb_build_object(
          'Content-Type','application/json',
          'Authorization','Bearer ' || current_setting('app.cron_secret')
        ),
        body:='{}'::jsonb
    ) as request_id;
  $$
);

-- Vérifier jobs actifs
SELECT * FROM cron.job;

-- Voir historique exécutions
SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 10;
```

### Alternative : Trigger HTTP externe

Si pg_cron non disponible, utiliser un service externe (GitHub Actions, Vercel Cron, etc.) :

```yaml
# .github/workflows/daily-notifications.yml
name: Daily Notifications
on:
  schedule:
    - cron: '0 4 * * *'  # 06:00 Tunisie

jobs:
  send:
    runs-on: ubuntu-latest
    steps:
      - name: Trigger Edge Function
        run: |
          curl -X POST \
            https://vgaofkucdpydyblrykbh.supabase.co/functions/v1/send-notifications \
            -H "Authorization: Bearer ${{ secrets.CRON_SECRET }}" \
            -H "Content-Type: application/json"
```

## Test manuel

```bash
# Tester localement
supabase functions serve send-notifications

# Appeler la fonction
curl -X POST http://localhost:54321/functions/v1/send-notifications \
  -H "Authorization: Bearer your-cron-secret" \
  -H "Content-Type: application/json"
```

## Monitoring

- **Logs** : Dashboard Supabase > Edge Functions > Logs
- **Métriques** : Nombre d'emails envoyés/échoués dans la réponse
- **Alertes** : Configurer alertes si `emails_failed > 0`

## Format email

- **HTML** : Template responsive avec design professionnel
- **Texte** : Fallback texte brut pour clients email anciens
- **Bilingue** : FR/AR selon préférence utilisateur

## Préférences utilisateur

Les avocats peuvent configurer leurs préférences dans :
`/parametres/notifications`

Options :
- Activer/désactiver notifications globales
- Choisir alertes échéances (J-15, J-7, J-3, J-1)
- Alertes actions urgentes
- Alertes audiences
- Seuil factures impayées
- Format email (HTML/texte)
- Langue (FR/AR)

## Sécurité

- ✅ Authentification par `CRON_SECRET`
- ✅ Service Role Key pour accès base de données
- ✅ RLS (Row Level Security) respecté via user_id
- ✅ Pas d'exposition de données sensibles dans logs

## Maintenance

### Ajuster horaire été/hiver

Tunisie change d'heure :
- **Hiver** (oct-mars) : UTC+1 → Cron `0 5 * * *`
- **Été** (avril-sept) : UTC+2 → Cron `0 4 * * *`

### Désactiver temporairement

```sql
-- Désactiver job
SELECT cron.unschedule('daily-notifications');

-- Réactiver
SELECT cron.schedule(...);  -- Voir commande ci-dessus
```

## Troubleshooting

### Aucun email reçu
- Vérifier `notification_preferences.enabled = true`
- Vérifier `notification_preferences.daily_digest_enabled = true`
- Vérifier logs Edge Function pour erreurs

### Erreur Resend API
- Vérifier `RESEND_API_KEY` valide
- Vérifier domaine `avocat.tn` vérifié dans Resend
- Vérifier quota Resend (100 emails/jour en free)

### Erreur base de données
- Vérifier migrations appliquées (notification_preferences, view)
- Vérifier RLS policies actives
- Vérifier service role key valide

## Performance

- **Durée exécution** : ~2-5s pour 10 utilisateurs
- **Coût Supabase** : Inclus dans plan gratuit (500k appels/mois)
- **Coût Resend** : Gratuit jusqu'à 3000 emails/mois

## Roadmap

- [ ] Template email React-PDF pour meilleur design
- [ ] Tracking ouverture emails (pixel tracking)
- [ ] A/B testing subject lines
- [ ] Préférences granulaires par type alerte
- [ ] Digest hebdomadaire optionnel
- [ ] Notifications SMS (TopNet Tunisia)
