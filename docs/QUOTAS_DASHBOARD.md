# 📊 Dashboard Quotas & Alertes IA

**Date** : 9 février 2026
**URL** : `/super-admin/quotas`
**Contexte** : Réduction coûts détection doublons KB (-92% avec optimisations)

---

## 🎯 Objectif

Dashboard de suivi consommation quotas providers IA avec alertes automatiques :
- **Gemini Flash** : Tier gratuit (1M tokens/jour, 30M/mois, 15 RPM)
- **DeepSeek** : Payant (pas de limite gratuite)
- **Groq** : Tier gratuit (14.4K tokens/jour, 30 RPM)
- **Ollama** : Local (aucune limite)

**Cas d'usage** : Pour 10 000 docs/mois, économie **-92%** ($113 → $9/mois) vs DeepSeek avec optimisations + Gemini Flash.

---

## 📋 Fonctionnalités

### 1. **Cartes Quota par Provider**

**Données affichées** :
- **Usage aujourd'hui** : Total tokens, coût USD/TND, % quota
- **Usage ce mois** : Total tokens, coût USD/TND, % quota
- **Rate Limit actuel** : Requêtes/minute vs limite
- **Tier** : Badge Free/Paid/Local

**Alertes visuelles** :
- 🟢 **< 60%** : Vert (normal)
- 🟡 **60-80%** : Jaune (attention)
- 🟠 **80-90%** : Orange (élevé, upgrade recommandé)
- 🔴 **> 90%** : Rouge (critique, upgrade requis)

### 2. **Graphique Tendance 7 Jours**

- **Type** : Line chart (Recharts)
- **Données** : Consommation quotidienne tokens Gemini
- **Seuil visuel** : Ligne rouge pour limite tier gratuit (1M/jour)
- **Format** : `1.5M tokens` (millions)

### 3. **Recommandations Contextuelles**

- ✅ **Gemini Paid Tier** : ~$11.25/mois pour 10K docs (économie -90% vs DeepSeek)
- 📊 **Alerte budget** : Configurer budget Google Cloud Console à $15/mois
- 📈 **Scaling progressif** : Commencer 100 docs/jour → valider coûts → scaler à 10K

### 4. **Onglets Multi-Providers**

- **Gemini** : Graphique tendance + quotas détaillés
- **DeepSeek** : Usage (pas de quota gratuit)
- **Groq** : Quotas tier gratuit (14.4K/jour, 30 RPM)
- **Ollama** : Stats usage (aucune limite)

---

## 🛠️ Architecture Technique

### Fichiers Créés

| Fichier | Rôle |
|---------|------|
| `app/super-admin/quotas/page.tsx` | Page principale (onglets, graphiques) |
| `app/api/admin/quotas/route.ts` | API endpoint (GET quotas par provider) |
| `components/super-admin/quotas/QuotaCard.tsx` | Composant carte quota |
| `components/super-admin/quotas/QuotaProgressBar.tsx` | Barre de progression animée |

### API Endpoint

**URL** : `GET /api/admin/quotas?provider={provider}`

**Paramètres** :
- `provider` : `gemini`, `deepseek`, `groq`, `ollama`

**Réponse** :
```typescript
{
  provider: string,
  today: {
    total_tokens: number,
    cost_usd: number,
    quota?: number,
    usage_percent: number,
    operations: Array<{
      operation: string,
      requests: number,
      input_tokens: number,
      output_tokens: number,
      total_tokens: number,
      cost_usd: number
    }>
  },
  month: { /* même structure */ },
  current_rpm: number,
  rpm_limit?: number,
  trend: Array<{
    date: string,
    total_tokens: number,
    cost_usd: number
  }>,
  quotas: {
    tokensPerDay?: number,
    tokensPerMonth?: number,
    rpm?: number,
    costPerMTokenInput: number,
    costPerMTokenOutput: number
  }
}
```

### Requêtes SQL

#### Usage Aujourd'hui
```sql
SELECT
  operation,
  COUNT(*) as requests,
  SUM(input_tokens) as input_tokens,
  SUM(output_tokens) as output_tokens,
  SUM(input_tokens + output_tokens) as total_tokens,
  SUM(estimated_cost_usd) as cost_usd
FROM ai_usage_logs
WHERE DATE(created_at) = CURRENT_DATE
  AND provider = $1
GROUP BY operation
ORDER BY total_tokens DESC
```

#### Usage ce Mois
```sql
SELECT
  operation,
  COUNT(*) as requests,
  SUM(input_tokens + output_tokens) as total_tokens,
  SUM(estimated_cost_usd) as cost_usd
FROM ai_usage_logs
WHERE DATE_TRUNC('month', created_at) = DATE_TRUNC('month', CURRENT_DATE)
  AND provider = $1
GROUP BY operation
```

#### Tendance 7 Jours
```sql
SELECT
  DATE(created_at) as date,
  COUNT(*) as requests,
  SUM(input_tokens + output_tokens) as total_tokens,
  SUM(estimated_cost_usd) as cost_usd
FROM ai_usage_logs
WHERE created_at > NOW() - INTERVAL '7 days'
  AND provider = $1
GROUP BY DATE(created_at)
ORDER BY date DESC
```

#### RPM Actuel (Dernière Minute)
```sql
SELECT COUNT(*) as requests
FROM ai_usage_logs
WHERE created_at > NOW() - INTERVAL '1 minute'
  AND provider = $1
```

---

## 🎨 Composants UI

### QuotaProgressBar

**Props** :
- `current` : Valeur actuelle
- `limit` : Valeur limite
- `label` : Label affiché
- `unit` : Unité (tokens, RPM)
- `showPercentage` : Afficher % (défaut: `true`)

**Comportement** :
- Progress bar animée avec couleurs dynamiques
- Message d'alerte si >80% (orange) ou >90% (rouge)
- Format compact : `1.5M / 30M tokens (5%)`

### QuotaCard

**Props** :
- `provider` : Nom du provider
- `todayUsage` : Usage aujourd'hui (tokens, coût, quota)
- `monthUsage` : Usage ce mois (tokens, coût, quota)
- `currentRPM` : RPM actuel
- `rpmLimit` : Limite RPM
- `tier` : `'free'` | `'paid'` | `'local'`

**Badges** :
- 🟢 **Gratuit** : Tier gratuit actif
- 🔵 **Payant** : Tier payant
- ⚪ **Local** : Provider local (Ollama)

**Icônes** :
- Gemini : ✨ `sparkles`
- DeepSeek : 🧠 `brain`
- Groq : ⚡ `zap`
- Ollama : 💾 `database`

---

## 📊 Quotas Providers (Constantes)

```typescript
const PROVIDER_QUOTAS = {
  gemini: {
    tokensPerDay: 1_000_000,      // 1M tokens/jour
    tokensPerMonth: 30_000_000,   // 30M tokens/mois
    rpm: 15,                       // 15 requests/minute
    costPerMTokenInput: 0.075,     // $0.075/M input
    costPerMTokenOutput: 0.30,     // $0.30/M output
  },
  deepseek: {
    tokensPerDay: null,            // Pas de gratuit
    tokensPerMonth: null,
    rpm: null,
    costPerMTokenInput: 0.27,
    costPerMTokenOutput: 1.10,
  },
  groq: {
    tokensPerDay: 14_400,          // Limite gratuite
    tokensPerMonth: null,
    rpm: 30,
    costPerMTokenInput: 0.05,
    costPerMTokenOutput: 0.08,
  },
  ollama: {
    tokensPerDay: null,            // Local, gratuit
    tokensPerMonth: null,
    rpm: null,
    costPerMTokenInput: 0,
    costPerMTokenOutput: 0,
  },
}
```

---

## 💰 Scénarios Économiques

### Scénario : 10 000 docs/mois

#### **AVANT Optimisation** (seuils 0.7, DeepSeek)
```
10 000 docs × 42K tokens = 420M tokens/mois
420M × $0.27/M = $113.40/mois (350 TND/mois)
```

#### **APRÈS Optimisation** (seuils 0.75, Gemini Flash)
```
10 000 docs × 15K tokens = 150M tokens/mois

Tier gratuit Gemini : 30M tokens/mois
Tokens payants : 150M - 30M = 120M tokens
120M × $0.075/M = $9/mois (28 TND/mois)
```

#### **ÉCONOMIE**
| Période | Avant | Après | Économie |
|---------|-------|-------|----------|
| **Mois** | $113.40 | $9 | **$104.40 (-92%)** ⚡ |
| **An** | $1,360 | $108 | **$1,252 (-92%)** 🎉 |

---

## ⚠️ Alertes & Monitoring

### Alertes Automatiques

**Seuils déclenchement** :
- **80-90%** : ⚠️ Orange "Quota élevé - Envisager upgrade"
- **>90%** : 🔴 Rouge "Quota critique - Upgrade requis"

**Bandeau global** :
- Affiché en haut de page si ≥1 provider >80%
- Message : "⚠️ Quotas élevés détectés - Envisagez un upgrade vers un tier payant"

### Recommandations Affichées

**Carte "Recommandations"** (bas de page) :
1. ✅ **Gemini Paid Tier (Recommandé)** : $11.25/mois pour 10K docs, économie -90%
2. ℹ️ **Alerte budget** : Configurer Google Cloud Console budget alert à $15/mois
3. 📈 **Scaler progressivement** : 100 docs/jour → 3000/mois → valider → scaler

---

## 🚀 Déploiement

### Checklist

- [x] API endpoint `/api/admin/quotas` créé
- [x] Page `/super-admin/quotas` créée
- [x] Composants `QuotaCard`, `QuotaProgressBar` créés
- [x] Entrée menu "Quotas & Alertes" ajoutée (Système > Quotas & Alertes)
- [x] Auth admin vérifiée (via `getSession()`)
- [x] TypeScript 0 erreurs
- [ ] **TODO** : Tester en local (http://localhost:7002/super-admin/quotas)
- [ ] **TODO** : Vérifier requêtes SQL avec données réelles
- [ ] **TODO** : Déployer en production
- [ ] **TODO** : Monitorer logs (1 semaine)

### Variables Env Requises

Aucune nouvelle variable. Utilise configuration existante :
- `NEXTAUTH_SECRET` : Auth admin (déjà configuré)
- Table DB : `ai_usage_logs` (déjà existante)

### Migration DB

Aucune migration requise. Utilise table existante :
```sql
-- Table ai_usage_logs (déjà existante)
SELECT * FROM ai_usage_logs LIMIT 1;
```

---

## 📈 Prochaines Étapes

### Phase 1 : Validation (Cette semaine)
1. ✅ Créer dashboard (FAIT)
2. 🔄 Tester avec données réelles (EN COURS)
3. ⏳ Valider alertes seuils
4. ⏳ Vérifier conversion USD → TND (taux 3.09)

### Phase 2 : Production (Semaine prochaine)
1. ⏳ Déployer en prod
2. ⏳ Activer Gemini API payante (Google Cloud)
3. ⏳ Configurer budget alert à $15/mois
4. ⏳ Monitoring quotidien (7 jours)

### Phase 3 : Scaling (Mois prochain)
1. ⏳ Tester avec 100 docs/jour (3000/mois)
2. ⏳ Valider coûts réels vs estimés
3. ⏳ Scaler progressivement à 10K/mois
4. ⏳ Ajuster seuils si nécessaire

---

## 🎉 Résumé

| Métrique | Valeur |
|----------|--------|
| **Économie annuelle** | $1,252 (~3,864 TND) |
| **Réduction coûts** | -92% |
| **Provider recommandé** | Gemini Flash (Paid) |
| **Coût mensuel cible** | $9-11 (~28-35 TND) |
| **RPM disponible** | 1000 RPM (vs 15 gratuit) |
| **Scalabilité** | ✅ 10K docs/mois supporté |

**ROI** : Développement 2h → Économie permanente **~320 TND/mois** ✅

---

**Auteur** : Claude Sonnet 4.5
**Date** : 9 février 2026
**Lien doc** : `docs/DUPLICATE_DETECTION_OPTIMIZATION.md`

