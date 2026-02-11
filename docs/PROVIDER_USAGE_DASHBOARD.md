# Dashboard Monitoring Providers IA

## Vue d'ensemble

Ce dashboard permet de suivre la consommation des tokens et les coûts des différents providers IA utilisés dans le système, ventilés par type d'opération.

## Accès

Le dashboard Provider Usage est accessible via :
- **Menu** : Super Admin → Monitoring → Onglet "Providers"
- **URL directe** : `/super-admin/monitoring` (puis cliquer sur l'onglet "Providers")
- **Rôle requis** : Super Admin uniquement

> ℹ️ **Note** : Depuis février 2026, le dashboard Provider Usage est intégré dans le Dashboard Monitoring unifié (Option B du plan de consolidation). Il n'existe plus de page standalone `/super-admin/provider-usage`.

## Providers Trackés

1. **Gemini** (Google) - $0.075/M input, $0.30/M output
2. **DeepSeek** - $0.27/M (input=output)
3. **Groq** - Gratuit (free tier)
4. **Anthropic** (Claude) - $3/M input, $15/M output
5. **Ollama** - Gratuit (local)

## Types d'Opération

| Type | Description | Cas d'usage |
|------|-------------|-------------|
| `embedding` | Indexation | Génération d'embeddings pour recherche sémantique (KB, web pages) |
| `chat` | Réponse Client | Génération de réponses chat via RAG |
| `generation` | Génération Documents | Création de documents juridiques (contrats, courriers) |
| `classification` | Classification | Classification automatique de contenu |
| `extraction` | Extraction Métadonnées | Extraction de métadonnées de jurisprudence |

## Composants du Dashboard

### 1. Matrice Provider × Opération

Tableau matriciel avec heatmap montrant la consommation par intersection (provider, opération).

**Lecture** :
- **Couleur** : Plus la cellule est rouge foncé, plus le coût est élevé
- **3 métriques par cellule** :
  - Ligne 1 : Coût en USD
  - Ligne 2 : Nombre total de tokens
  - Ligne 3 : Nombre de requêtes
- **Totaux** : Dernière colonne (par opération) et dernière ligne (par provider)

### 2. Tendance Tokens par Provider

Graphique en ligne montrant l'évolution quotidienne du nombre de tokens par provider.

**Utilité** :
- Identifier les pics d'utilisation
- Détecter les anomalies (ex: boucle infinie)
- Suivre les tendances d'adoption des providers

### 3. Distribution par Opération

Graphique circulaire (pie chart) montrant la répartition des coûts par type d'opération.

**Utilité** :
- Identifier les opérations les plus coûteuses
- Prioriser les optimisations

### 4. Coûts Détaillés par Provider

Graphique à barres empilées montrant les coûts par provider, décomposés par opération.

**Utilité** :
- Comparer les providers entre eux
- Voir quelle opération coûte le plus pour chaque provider

## Sélection de Période

Deux options disponibles :
- **7 jours** : Vue détaillée récente (défaut)
- **30 jours** : Vue d'ensemble mensuelle

## Interprétation et Actions

### Si Gemini > 80% des coûts
→ **Action** : Considérer basculer opérations lourdes vers DeepSeek (4x moins cher)

### Si Ollama a beaucoup d'erreurs
→ **Action** : Vérifier le circuit breaker sur `/super-admin/ai-costs`

### Si coût total > budget mensuel
→ **Action** : Activer quotas utilisateurs dans `feature_flags`

### Si un provider a un pic anormal
→ **Action** :
1. Vérifier les logs dans `/super-admin/audit-logs`
2. Filtrer par date du pic
3. Identifier l'opération responsable
4. Analyser le code correspondant

## Performance

- **Cache** : 5 minutes (SWR)
- **Temps de réponse API** : < 500ms (avec index)
- **Rafraîchissement automatique** : Toutes les 5 minutes

## Limitations Actuelles

- **Latence** : Non affichée (sera ajoutée en v2 avec colonne `response_time_ms`)
- **Temps réel** : Rafraîchissement toutes les 5 minutes (pas en temps réel)
- **Historique** : Limité à 30 jours maximum (pour la performance)

## API Endpoints

### GET `/api/admin/provider-usage-matrix?days=7`

Retourne la matrice provider × opération.

**Réponse** :
```json
{
  "matrix": {
    "gemini": {
      "embedding": { "tokens": 1500000, "cost": 0.45, "requests": 50 },
      "chat": { "tokens": 200000, "cost": 0.15, "requests": 20 }
    }
  },
  "totals": {
    "byProvider": { "gemini": 0.60, "deepseek": 0.15 },
    "byOperation": { "embedding": 0.55, "chat": 0.20 },
    "total": 0.75
  },
  "period": {
    "start": "2026-02-02T00:00:00Z",
    "end": "2026-02-09T00:00:00Z",
    "days": 7
  }
}
```

### GET `/api/admin/provider-usage-trends?days=7`

Retourne l'évolution quotidienne par provider.

**Réponse** :
```json
{
  "trends": [
    {
      "date": "2026-02-09",
      "gemini_tokens": 50000,
      "gemini_cost": 0.05,
      "gemini_requests": 10,
      "deepseek_tokens": 20000,
      "deepseek_cost": 0.005,
      "deepseek_requests": 5
    }
  ],
  "summary": {
    "gemini": { "totalTokens": 350000, "totalCost": 0.35, "totalRequests": 70 },
    "deepseek": { "totalTokens": 140000, "totalCost": 0.04, "totalRequests": 35 }
  }
}
```

## Base de Données

### Table : `ai_usage_logs`

Colonnes pertinentes :
- `provider` : Nom du provider (gemini, deepseek, groq, anthropic, ollama)
- `operation_type` : Type d'opération (embedding, chat, generation, classification, extraction)
- `input_tokens` : Nombre de tokens en entrée
- `output_tokens` : Nombre de tokens en sortie
- `cost_usd` : Coût calculé en USD
- `created_at` : Date et heure de l'opération

### Index Composite

```sql
CREATE INDEX idx_ai_usage_logs_provider_operation_date
  ON ai_usage_logs (provider, operation_type, created_at DESC)
  WHERE provider IS NOT NULL AND operation_type IS NOT NULL;
```

**Performance** :
- Query matrice : ~200ms (sans index : ~1s)
- Query trends : ~150ms (sans index : ~800ms)

## Développement Futur (v2)

- [ ] Ajouter colonne `response_time_ms` à `ai_usage_logs`
- [ ] Afficher latence moyenne par (provider, opération)
- [ ] Ajouter carte "Alertes" (quotas proches, pics anormaux)
- [ ] Export CSV des données
- [ ] Filtres avancés (date custom, opération spécifique)
- [ ] Comparaison période vs période (ex: cette semaine vs semaine dernière)

## Maintenance

### Vérifier performance

```bash
npx tsx scripts/validate-provider-usage.ts
```

### Réappliquer index si manquant

```sql
CREATE INDEX IF NOT EXISTS idx_ai_usage_logs_provider_operation_date
  ON ai_usage_logs (provider, operation_type, created_at DESC)
  WHERE provider IS NOT NULL AND operation_type IS NOT NULL;
```

### Nettoyer anciennes données (>6 mois)

```sql
DELETE FROM ai_usage_logs WHERE created_at < NOW() - INTERVAL '6 months';
VACUUM ANALYZE ai_usage_logs;
```

## Support

En cas de problème :
1. Vérifier que l'index existe : `\di idx_ai_usage_logs_provider_operation_date`
2. Vérifier que `ai_usage_logs` a des données : `SELECT COUNT(*) FROM ai_usage_logs;`
3. Vérifier les logs API : `docker logs -f moncabinet-nextjs | grep "Provider Usage"`
