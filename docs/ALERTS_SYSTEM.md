# Système d'Alertes Email - Qadhya

## Vue d'ensemble

Système d'alertes automatiques par email pour surveiller la santé de l'analyse KB et le budget OpenAI.

**Fonctionnalités :**
- 🚨 Alertes critiques (budget >90%, échecs >100)
- ⚠️ Alertes warning (budget >80%, échecs >50)
- 📧 Emails formatés HTML via Brevo
- 🔒 Anti-spam : Max 1 email/alerte/6h (cache Redis)
- ⏰ Vérification horaire automatique (cron)

---

## Architecture

```
Cron (hourly)
    ↓
scripts/cron-check-alerts.sh
    ↓
API: /api/admin/alerts/check
    ↓
lib/alerts/email-alert-service.ts
    ↓
    ├─→ PostgreSQL (métriques KB)
    ├─→ Redis (cache anti-spam)
    └─→ Brevo API (envoi email)
```

---

## Configuration

### 1. Variables d'environnement

Ajouter dans `/opt/qadhya/.env.production.local` :

```bash
# Brevo API (email transactionnel)
BREVO_API_KEY=xkeysib-xxxxxxxxxxxx

# Email destinataire des alertes
ALERT_EMAIL=admin@qadhya.tn

# Secret cron (déjà existant)
CRON_SECRET=votre_secret_cron
```

### 2. Compte Brevo

1. Créer un compte sur [https://www.brevo.com](https://www.brevo.com)
2. Plan gratuit : **300 emails/jour** (largement suffisant pour les alertes)
3. Récupérer la clé API : **Settings** → **SMTP & API** → **API Keys**
4. Ajouter `BREVO_API_KEY` dans `.env.production.local`

### 3. Installation Cron

**Sur le serveur de production** (en tant que root) :

```bash
# 1. Copier le script
sudo cp /opt/qadhya/scripts/cron-check-alerts.sh /opt/qadhya/scripts/
sudo chmod +x /opt/qadhya/scripts/cron-check-alerts.sh

# 2. Créer le fichier de log
sudo mkdir -p /var/log/qadhya
sudo touch /var/log/qadhya/alerts.log

# 3. Configurer le cron (vérification toutes les heures)
sudo crontab -e

# Ajouter cette ligne :
0 * * * * /opt/qadhya/scripts/cron-check-alerts.sh >> /var/log/qadhya/alerts.log 2>&1
```

**Alternative : Vérification toutes les 2 heures**

```cron
0 */2 * * * /opt/qadhya/scripts/cron-check-alerts.sh >> /var/log/qadhya/alerts.log 2>&1
```

---

## Types d'Alertes

### 🚨 CRITICAL - Budget OpenAI

**Déclenchement :**
- Budget utilisé ≥ 90%
- **OU** Budget restant < $2

**Contenu email :**
- Pourcentage utilisé exact
- Montant restant en USD
- Nombre de documents OpenAI ce mois

**Actions recommandées :**
- Basculer immédiatement sur Ollama
- Vérifier consommation avec `npm run monitor:openai`
- Réduire batch size overnight

---

### 🚨 CRITICAL - Échecs Importants

**Déclenchement :**
- Échecs totaux ≥ 100 documents (score=50)

**Contenu email :**
- Nombre total d'échecs
- Répartition courts/longs

**Actions recommandées :**
- Investiguer avec `npm run audit:rag`
- Vérifier logs providers (Gemini, Ollama)
- Réinitialiser échecs courts si Gemini problématique

---

### ⚠️ WARNING - Budget OpenAI Élevé

**Déclenchement :**
- Budget utilisé ≥ 80%
- **OU** Budget restant < $2

**Contenu email :**
- Pourcentage utilisé
- Montant restant

**Actions recommandées :**
- Surveiller consommation quotidienne
- Envisager Ollama pour docs non critiques
- Vérifier script `cron-monitor-openai.sh`

---

### ⚠️ WARNING - Échecs Analyse

**Déclenchement :**
- Échecs totaux ≥ 50 documents

**Contenu email :**
- Nombre total d'échecs

**Actions recommandées :**
- Analyser dans dashboard `/super-admin/monitoring?tab=kb-quality`
- Vérifier si échecs concentrés sur un provider

---

## Anti-Spam

**Problème :** Éviter 24 emails identiques par jour si une alerte persiste.

**Solution :**
- Cache Redis : `alert:sent:{level}:{title}` → TTL 6h
- Exemple : `alert:sent:critical:Budget OpenAI CRITIQUE` → expiré après 6h
- Si alerte déjà envoyée < 6h → skip

**Résultat :** Max 4 emails/jour par type d'alerte (1 toutes les 6h)

---

## Format Email

```html
┌─────────────────────────────────────┐
│ 🚨 Budget OpenAI CRITIQUE          │  ← Header (rouge si critical)
├─────────────────────────────────────┤
│ Budget OpenAI à 92.3% ($0.77 restant)
│
│ 📊 Métriques
│  • Budget utilisé : 92.3%
│  • Budget restant : $0.77
│
│ 💡 Actions Recommandées
│  • Basculer sur Ollama immédiatement
│  • Vérifier npm run monitor:openai
│  • Réduire batch size
│
│  [📈 Voir Dashboard Monitoring] ← Bouton CTA
│
│ Email envoyé par Qadhya Monitoring
│ Timestamp : 13/02/2026 13:45:23
└─────────────────────────────────────┘
```

---

## Commandes Utiles

### Test manuel (local)

```bash
# Test avec données local (si DB configurée)
curl -H "X-Cron-Secret: $CRON_SECRET" \
  http://localhost:7002/api/admin/alerts/check | jq .
```

### Test en production

```bash
# SSH sur le serveur
ssh root@qadhya.tn

# Déclencher manuellement
/opt/qadhya/scripts/cron-check-alerts.sh

# Voir logs
tail -f /var/log/qadhya/alerts.log

# Vérifier dernière exécution cron
grep -A 5 "Vérification Alertes" /var/log/qadhya/alerts.log | tail -20
```

### Vérifier cache Redis

```bash
# Voir toutes les alertes envoyées récemment
docker exec qadhya-redis redis-cli KEYS "alert:sent:*"

# Voir TTL d'une alerte
docker exec qadhya-redis redis-cli TTL "alert:sent:critical:Budget OpenAI CRITIQUE"

# Forcer suppression cache (pour re-tester email)
docker exec qadhya-redis redis-cli DEL "alert:sent:critical:Budget OpenAI CRITIQUE"
```

---

## Monitoring

### Vérifier que le cron tourne

```bash
# Liste des crons actifs
sudo crontab -l

# Logs cron system
sudo grep CRON /var/log/syslog | tail -20
```

### Statistiques Brevo

1. Se connecter sur [https://app.brevo.com](https://app.brevo.com)
2. **Statistics** → **Email**
3. Voir emails envoyés, ouverts, cliqués

---

## Dépannage

### ❌ Email non reçu

**1. Vérifier BREVO_API_KEY**

```bash
docker exec qadhya-nextjs env | grep BREVO_API_KEY
```

**2. Vérifier logs API**

```bash
docker logs qadhya-nextjs --tail 100 | grep Alert
```

**3. Tester manuellement**

```bash
curl -X POST https://api.brevo.com/v3/smtp/email \
  -H "api-key: $BREVO_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "sender": {"name": "Test", "email": "noreply@qadhya.tn"},
    "to": [{"email": "admin@qadhya.tn"}],
    "subject": "Test",
    "htmlContent": "<p>Test email</p>"
  }'
```

---

### ❌ Cache anti-spam bloque tout

**Symptôme :** Aucun email envoyé alors qu'alertes détectées.

**Solution :** Vider cache Redis

```bash
docker exec qadhya-redis redis-cli FLUSHDB
```

---

### ❌ Cron ne s'exécute pas

**1. Vérifier que cron daemon tourne**

```bash
sudo systemctl status cron
```

**2. Vérifier permissions script**

```bash
ls -la /opt/qadhya/scripts/cron-check-alerts.sh
# Doit être : -rwxr-xr-x
```

**3. Tester script manuellement**

```bash
sudo /opt/qadhya/scripts/cron-check-alerts.sh
```

---

## Ajouter de Nouvelles Alertes

### Exemple : Alerte "Batch Stagnant"

**1. Modifier `lib/alerts/email-alert-service.ts`**

Dans la fonction `detectAlerts()` :

```typescript
// Alerte 4 : Batch stagnant (< 100 docs/jour)
const last24hResult = await db.query(`
  SELECT COUNT(*) as analyzed_24h
  FROM knowledge_base
  WHERE quality_score IS NOT NULL
    AND quality_analyzed_at >= NOW() - INTERVAL '24 hours'
`)

const analyzed24h = last24hResult.rows[0].analyzed_24h || 0

if (analyzed24h < 100) {
  alerts.push({
    level: 'warning',
    title: 'Batch Overnight Stagnant',
    message: `Seulement ${analyzed24h} docs analysés en 24h (attendu: >100)`,
    metrics: {
      analyzed24h,
    },
    recommendations: [
      'Vérifier si le batch overnight tourne',
      'Consulter les logs : /tmp/batch-overnight-live.log',
      'Vérifier quota Ollama/Gemini',
    ],
  })
}
```

**2. Déployer et tester**

```bash
git add lib/alerts/email-alert-service.ts
git commit -m "feat(alerts): Add batch stagnation alert"
git push

# Sur prod : redémarrer container
ssh root@qadhya.tn
cd /opt/qadhya
docker restart qadhya-nextjs
```

---

## Métriques

**Objectifs :**
- Budget OpenAI : < 80% mensuel
- Échecs : < 50 documents
- Emails alertes : < 10/mois (signe de stabilité)

**Tracking :**
- Dashboard Brevo : Stats envois
- Logs : `/var/log/qadhya/alerts.log`
- Dashboard Qadhya : `/super-admin/monitoring?tab=kb-quality`

---

## Roadmap Future

**Phase 2 (optionnel) :**
- ✅ Alertes email (Feb 13, 2026)
- ⏳ Webhook Slack (optionnel)
- ⏳ SMS critiques uniquement (via Twilio)
- ⏳ Dashboard alertes historique
- ⏳ Config seuils via UI admin

---

**Dernière mise à jour :** 13 février 2026
**Auteur :** Claude Sonnet 4.5
