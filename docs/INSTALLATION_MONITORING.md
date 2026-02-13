# Installation Dashboard Monitoring + Alertes Email - Production

**Durée** : 10 minutes
**Prérequis** : Accès SSH root sur qadhya.tn

---

## 🚀 Installation Automatique (Recommandé)

```bash
# 1. Connexion SSH
ssh root@qadhya.tn

# 2. Aller dans le répertoire
cd /opt/qadhya

# 3. Pull dernière version
git pull origin main

# 4. Exécuter script d'installation
bash scripts/install-monitoring-prod.sh
```

Le script va :
- ✅ Vérifier le déploiement du code
- ✅ Configurer Brevo API (demande clé interactivement)
- ✅ Configurer email destinataire
- ✅ Redémarrer le container Next.js
- ✅ Créer les logs
- ✅ Installer le cron horaire
- ✅ Tester le système

---

## 📋 Installation Manuelle

### Étape 1 : Déploiement Code

```bash
ssh root@qadhya.tn
cd /opt/qadhya
git pull origin main
docker restart qadhya-nextjs
```

### Étape 2 : Configuration Brevo

**2.1. Créer compte Brevo (gratuit)**

1. Aller sur [https://www.brevo.com](https://www.brevo.com)
2. S'inscrire (plan gratuit : 300 emails/jour)
3. Aller dans **Settings** → **SMTP & API** → **API Keys**
4. Créer une nouvelle clé API
5. Copier la clé (format : `xkeysib-xxxxxxxxx`)

**2.2. Configurer variables d'environnement**

```bash
# Éditer fichier .env
nano /opt/qadhya/.env.production.local

# Ajouter à la fin :
BREVO_API_KEY=xkeysib-votre-cle-ici
ALERT_EMAIL=admin@qadhya.tn

# Sauvegarder : Ctrl+O, Enter, Ctrl+X
```

**2.3. Redémarrer container**

```bash
docker restart qadhya-nextjs

# Vérifier variables
docker exec qadhya-nextjs env | grep -E 'BREVO|ALERT'
```

### Étape 3 : Installation Cron

**3.1. Créer répertoire logs**

```bash
mkdir -p /var/log/qadhya
touch /var/log/qadhya/alerts.log
chmod 644 /var/log/qadhya/alerts.log
```

**3.2. Rendre script exécutable**

```bash
chmod +x /opt/qadhya/scripts/cron-check-alerts.sh
```

**3.3. Configurer cron**

```bash
# Éditer crontab root
crontab -e

# Ajouter cette ligne (vérification horaire) :
0 * * * * /opt/qadhya/scripts/cron-check-alerts.sh >> /var/log/qadhya/alerts.log 2>&1

# Sauvegarder : Esc, :wq, Enter
```

**Alternative : Vérification toutes les 2 heures**

```cron
0 */2 * * * /opt/qadhya/scripts/cron-check-alerts.sh >> /var/log/qadhya/alerts.log 2>&1
```

### Étape 4 : Test

**4.1. Test manuel du script**

```bash
/opt/qadhya/scripts/cron-check-alerts.sh
```

**Résultat attendu** :
```
==============================================
2026-02-13 14:00:00 - Vérification Alertes
==============================================
{
  "timestamp": "2026-02-13T14:00:00.000Z",
  "success": true,
  "alertsDetected": 0,
  "alertsSent": 0,
  "alerts": []
}

✅ Aucune alerte - Système normal

✅ Vérification terminée
```

**4.2. Vérifier cron installé**

```bash
crontab -l | grep alerts
```

Devrait afficher :
```
0 * * * * /opt/qadhya/scripts/cron-check-alerts.sh >> /var/log/qadhya/alerts.log 2>&1
```

**4.3. Consulter logs**

```bash
# Voir toutes les alertes
cat /var/log/qadhya/alerts.log

# Suivre en temps réel
tail -f /var/log/qadhya/alerts.log

# Dernières lignes
tail -20 /var/log/qadhya/alerts.log
```

---

## 🎯 Vérification Installation

### Dashboard Monitoring

1. Ouvrir [https://qadhya.tn/super-admin/monitoring?tab=kb-quality](https://qadhya.tn/super-admin/monitoring?tab=kb-quality)
2. Vérifier que les métriques s'affichent :
   - Progression batch
   - Budget OpenAI
   - Score moyen
   - Échecs
3. Vérifier auto-refresh (toutes les 30s)

### Système Alertes

**Test email** :

Pour forcer un test d'email, modifier temporairement le seuil dans le code et redémarrer :

```bash
# Éditer service alertes
nano /opt/qadhya/lib/alerts/email-alert-service.ts

# Ligne 136 : Changer 90 → 0 (force alerte budget)
# if (metrics.budget.percentUsed >= 0) {

# Sauvegarder et redémarrer
docker restart qadhya-nextjs

# Tester
/opt/qadhya/scripts/cron-check-alerts.sh

# Remettre à 90 et redémarrer
```

**Vérifier email reçu** :
- Sujet : `[CRITICAL] Budget OpenAI CRITIQUE` (ou WARNING)
- Corps : HTML formaté avec métriques et recommandations
- Bouton : "Voir Dashboard Monitoring"

---

## 🔧 Configuration Avancée

### Modifier Seuils Alertes

Éditer `/opt/qadhya/lib/alerts/email-alert-service.ts` :

```typescript
// Budget OpenAI
if (metrics.budget.percentUsed >= 90) { // CRITICAL
if (metrics.budget.percentUsed >= 80) { // WARNING

// Échecs
if (metrics.failures.total >= 100) { // CRITICAL
if (metrics.failures.total >= 50) { // WARNING

// Batch stagnant
const BATCH_MIN_DAILY = 100 // Objectif minimum
const BATCH_WARNING_DAILY = 50 // Warning si < 50
```

Après modification :
```bash
docker restart qadhya-nextjs
```

### Changer Fréquence Cron

```bash
crontab -e

# Toutes les heures (défaut)
0 * * * * /opt/qadhya/scripts/cron-check-alerts.sh >> /var/log/qadhya/alerts.log 2>&1

# Toutes les 2 heures
0 */2 * * * /opt/qadhya/scripts/cron-check-alerts.sh >> /var/log/qadhya/alerts.log 2>&1

# Toutes les 30 minutes (intensif)
*/30 * * * * /opt/qadhya/scripts/cron-check-alerts.sh >> /var/log/qadhya/alerts.log 2>&1
```

### Anti-Spam : Modifier TTL Cache

Par défaut : **6 heures** (max 4 emails/jour par type d'alerte)

Éditer `/opt/qadhya/lib/alerts/email-alert-service.ts` :

```typescript
// Ligne ~290
async function markAlertSent(alertKey: string): Promise<void> {
  const cacheKey = `alert:sent:${alertKey}`
  await redis.set(cacheKey, new Date().toISOString(), { EX: 6 * 60 * 60 }) // 6h
}

// Modifier EX (en secondes) :
// 2h : 2 * 60 * 60
// 12h : 12 * 60 * 60
// 24h : 24 * 60 * 60
```

---

## 🐛 Dépannage

### Problème : Email non reçu

**1. Vérifier BREVO_API_KEY**

```bash
docker exec qadhya-nextjs env | grep BREVO_API_KEY
```

Doit afficher : `BREVO_API_KEY=xkeysib-xxxxx`

Si vide :
```bash
nano /opt/qadhya/.env.production.local
# Ajouter : BREVO_API_KEY=xkeysib-votre-cle
docker restart qadhya-nextjs
```

**2. Vérifier logs API**

```bash
docker logs qadhya-nextjs --tail 100 | grep Alert
```

Chercher erreurs Brevo :
```
[Alert] Erreur envoi email Brevo: ...
```

**3. Tester Brevo API directement**

```bash
BREVO_KEY=$(docker exec qadhya-nextjs env | grep BREVO_API_KEY | cut -d= -f2)

curl -X POST https://api.brevo.com/v3/smtp/email \
  -H "api-key: $BREVO_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "sender": {"name": "Test", "email": "noreply@qadhya.tn"},
    "to": [{"email": "admin@qadhya.tn"}],
    "subject": "Test Brevo",
    "htmlContent": "<p>Email test OK</p>"
  }'
```

Si erreur 401 → Clé API invalide
Si erreur 400 → Format email incorrect
Si 201 → Email envoyé avec succès

**4. Vérifier cache anti-spam**

```bash
# Voir alertes en cache (déjà envoyées récemment)
docker exec qadhya-redis redis-cli KEYS "alert:sent:*"

# Voir TTL (temps restant avant expiration)
docker exec qadhya-redis redis-cli TTL "alert:sent:critical:Budget OpenAI CRITIQUE"

# Forcer suppression cache (pour re-tester email)
docker exec qadhya-redis redis-cli FLUSHDB
```

### Problème : Cron ne s'exécute pas

**1. Vérifier cron daemon**

```bash
systemctl status cron
```

Si inactif :
```bash
systemctl start cron
systemctl enable cron
```

**2. Vérifier crontab**

```bash
crontab -l
```

Doit afficher la ligne :
```
0 * * * * /opt/qadhya/scripts/cron-check-alerts.sh >> /var/log/qadhya/alerts.log 2>&1
```

**3. Vérifier logs système**

```bash
grep CRON /var/log/syslog | tail -20
```

**4. Tester script manuellement**

```bash
bash /opt/qadhya/scripts/cron-check-alerts.sh
```

Si erreur, corriger puis :
```bash
chmod +x /opt/qadhya/scripts/cron-check-alerts.sh
```

### Problème : Dashboard vide

**1. Vérifier API**

```bash
curl https://qadhya.tn/api/admin/monitoring/metrics | jq .
```

Doit retourner JSON avec :
```json
{
  "timestamp": "...",
  "global": { ... },
  "budget": { ... },
  ...
}
```

Si erreur 500 → Voir logs :
```bash
docker logs qadhya-nextjs --tail 100
```

**2. Vérifier base de données**

```bash
docker exec qadhya-postgres psql -U moncabinet qadhya -c "
  SELECT COUNT(*) as total_active
  FROM knowledge_base
  WHERE is_active = true
"
```

Doit retourner un nombre > 0.

---

## 📊 Monitoring Production

### Métriques Clés

**Dashboard** : https://qadhya.tn/super-admin/monitoring?tab=kb-quality

- Progression batch : X/8735 docs (Y%)
- Budget OpenAI : $X/$10 (Y%)
- Score moyen : X/100
- Échecs : X docs

**Logs alertes** :

```bash
tail -f /var/log/qadhya/alerts.log
```

**Fréquence alertes** :

```bash
# Nombre d'alertes par jour
grep -c "Vérification Alertes" /var/log/qadhya/alerts.log

# Alertes critiques
grep "CRITICAL" /var/log/qadhya/alerts.log

# Alertes warning
grep "WARNING" /var/log/qadhya/alerts.log
```

### Health Check Quotidien

```bash
# 1. Vérifier cron
crontab -l | grep alerts

# 2. Vérifier dernière exécution
tail -20 /var/log/qadhya/alerts.log

# 3. Vérifier dashboard
curl -I https://qadhya.tn/super-admin/monitoring

# 4. Vérifier cache Redis
docker exec qadhya-redis redis-cli INFO | grep connected_clients
```

---

## 🔗 Liens Utiles

- **Dashboard** : https://qadhya.tn/super-admin/monitoring?tab=kb-quality
- **Doc complète** : `/opt/qadhya/docs/ALERTS_SYSTEM.md`
- **MEMORY.md** : `/root/.claude/projects/.../MEMORY.md`
- **Brevo Dashboard** : https://app.brevo.com
- **GitHub** : https://github.com/salmenktata/MonCabinet

---

**Dernière mise à jour** : 13 février 2026
**Auteur** : Claude Sonnet 4.5
