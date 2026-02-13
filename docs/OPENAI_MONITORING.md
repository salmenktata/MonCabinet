# Monitoring Budget OpenAI

## 📋 Vue d'ensemble

Système de monitoring quotidien de la consommation OpenAI pour éviter les dépassements de budget.

**Seuils configurés :**
- ⚠️ Alerte si budget restant < **$5**
- 💰 Budget mensuel max : **$10**

**Fallback automatique :**
Si OpenAI échoue (solde épuisé, quota, erreur), le système bascule automatiquement sur **Ollama** (local, gratuit).

## 🔧 Installation Production

### 1. Déployer les scripts

Les scripts sont déjà dans le repo et seront déployés automatiquement :
- `scripts/monitor-openai-usage.ts` - Script de vérification
- `scripts/cron-monitor-openai.sh` - Wrapper cron

### 2. Configurer le cron quotidien

SSH sur le serveur et éditer le crontab root :

```bash
ssh root@84.247.165.187
crontab -e
```

Ajouter la ligne suivante (monitoring quotidien à 9h) :

```cron
# Monitoring quotidien OpenAI (9h)
0 9 * * * /opt/qadhya/scripts/cron-monitor-openai.sh >> /var/log/qadhya/openai-monitor.log 2>&1
```

### 3. Créer le fichier de log

```bash
mkdir -p /var/log/qadhya
touch /var/log/qadhya/openai-monitor.log
chmod 644 /var/log/qadhya/openai-monitor.log
```

### 4. Tester manuellement

```bash
cd /opt/qadhya
bash scripts/cron-monitor-openai.sh
```

**Sortie attendue :**
```
==============================================
2026-02-12 09:00:00 - Monitoring OpenAI
==============================================
🔍 Vérification usage OpenAI...

✅ OpenAI accessible
   Modèle: gpt-4o-mini
   Tokens: 5

📊 Usage OpenAI ce mois:
   Appels: 126
   Tokens: 45,230
   Coût estimé: $0.18
   Période: 01/02/2026 - aujourd'hui

💰 Budget mensuel:
   Budget total: $10.00
   Consommé: $0.18
   Restant: $9.82

✅ Monitoring OK
```

## 📊 Commandes Utiles

### Vérification manuelle

```bash
# Local (dev)
npm run monitor:openai

# Production
ssh root@84.247.165.187 "cd /opt/qadhya && npx tsx scripts/monitor-openai-usage.ts"
```

### Consulter les logs

```bash
# Dernières exécutions
tail -100 /var/log/qadhya/openai-monitor.log

# Suivre en temps réel
tail -f /var/log/qadhya/openai-monitor.log

# Chercher les alertes
grep "ALERTE" /var/log/qadhya/openai-monitor.log
```

### Statistiques consommation

```bash
ssh root@84.247.165.187 "docker exec qadhya-postgres psql -U moncabinet -d qadhya -c \"
  SELECT
    operation_name,
    COUNT(*) as calls,
    SUM(input_tokens + output_tokens) as total_tokens,
    ROUND(SUM(
      (input_tokens * 0.0025 / 1000) +
      (output_tokens * 0.01 / 1000)
    )::numeric, 2) as cost_usd
  FROM llm_operations
  WHERE provider = 'openai'
    AND created_at >= DATE_TRUNC('month', CURRENT_DATE)
  GROUP BY operation_name
  ORDER BY cost_usd DESC;
\""
```

## 🚨 Que faire si l'alerte se déclenche ?

### Option 1 : Recharger le compte OpenAI

1. Aller sur https://platform.openai.com/account/billing
2. Ajouter des crédits ($10-20)
3. Attendre 5-10 min pour la propagation
4. Relancer le monitoring : `npm run monitor:openai`

### Option 2 : Basculer temporairement sur Ollama

Si besoin de temps pour recharger, le système utilise déjà Ollama en fallback automatique. Aucune action requise.

### Option 3 : Augmenter le budget mensuel

Éditer `scripts/monitor-openai-usage.ts` :

```typescript
const MONTHLY_BUDGET_USD = 20.0  // Augmenter de 10$ → 20$
```

Puis redéployer :

```bash
git add scripts/monitor-openai-usage.ts
git commit -m "feat: Augmenter budget OpenAI à $20/mois"
git push
```

## 🔍 Détails Techniques

### Fallback configuré (textes courts)

**Fichier :** `lib/ai/operations-config.ts`

```typescript
'kb-quality-analysis-short': {
  providers: {
    primary: 'openai',
    fallback: ['ollama', 'gemini'],  // Ollama prioritaire si OpenAI échoue
  }
}
```

**Ordre de fallback :**
1. **OpenAI** (primaire) - Format JSON strict
2. **Ollama** (local) - Gratuit, plus lent mais fiable
3. **Gemini** (cloud) - Dernier recours (peut échouer sur textes courts AR)

### Estimation des coûts

**Modèle utilisé :** `gpt-4o` (mini pour tests, standard pour production)

**Tarifs (Feb 2026) :**
- Input : $0.0025 / 1K tokens
- Output : $0.01 / 1K tokens

**Exemple (100 docs courts analysés) :**
- Tokens moyens : ~500 input + 200 output par doc
- Coût : (500 × 0.0025 + 200 × 0.01) / 1000 × 100 = **$0.33**

**Budget $10/mois** → ~3,000 docs courts analysables

## 📝 Changelog

### v1.0.0 - 2026-02-12

- ✅ Création script monitoring OpenAI
- ✅ Configuration fallback Ollama prioritaire
- ✅ Cron quotidien 9h
- ✅ Alertes si budget < $5
- ✅ Documentation complète

---

**Auteur :** Qadhya Team
**Date :** 12 février 2026
**Version :** 1.0.0
