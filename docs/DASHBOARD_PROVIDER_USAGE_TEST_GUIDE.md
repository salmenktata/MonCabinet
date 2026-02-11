# Guide de Test - Dashboard Provider Usage

**Date** : 11 février 2026
**URL** : https://qadhya.tn/super-admin/monitoring
**Statut** : ✅ Opérationnel avec données de test

---

## ✅ Vérifications Préliminaires Complétées

### 1. Base de Données ✅
```sql
-- Base unique consolidée
DB_NAME: qadhya

-- Données disponibles:
knowledge_base: 580 documents
users: 2 utilisateurs
ai_usage_logs: 6 logs de test

-- Migration appliquée:
user_validation_stats: ✅ Table créée
```

### 2. Contrainte Provider Étendue ✅
```sql
-- Ancienne contrainte (PROBLÈME):
CHECK (provider IN ('openai', 'anthropic'))

-- Nouvelle contrainte (CORRIGÉE):
CHECK (provider IN ('openai', 'anthropic', 'gemini', 'deepseek', 'groq', 'ollama'))
```

### 3. Données de Test Créées ✅
```
Provider      | Logs | Tokens | Coût USD
--------------+------+--------+----------
anthropic     |   1  |  1700  | $0.15
deepseek      |   1  |  1400  | $0.03
gemini        |   1  |   750  | $0.02
groq          |   1  |  1350  | $0.05
ollama (chat) |   1  |  1700  | $0.00
ollama (emb)  |   1  |   800  | $0.00
--------------+------+--------+----------
TOTAL         |   6  |  7700  | $0.25
```

---

## 📋 Guide de Test Utilisateur

### Étape 1 : Connexion Super Admin

1. Ouvrir https://qadhya.tn
2. Se connecter avec compte **super-admin**
3. Vérifier que le menu "Super Admin" est accessible

### Étape 2 : Accéder au Dashboard Monitoring

**URL directe** : https://qadhya.tn/super-admin/monitoring

**Navigation** :
```
Menu → Super Admin → Monitoring
```

**Ce que vous devriez voir** :
- ✅ 3 onglets : "Overview", "Providers", "Coûts IA"
- ✅ Onglet "Providers" cliquable

### Étape 3 : Tester Onglet "Providers"

**Actions** :
1. Cliquer sur l'onglet **"Providers"**
2. Attendre chargement (1-2 secondes)

**Ce qui devrait s'afficher** :

#### A. Header avec Sélection Période
```
┌─────────────────────────────────────────┐
│ Usage par Provider                      │
│ Consommation détaillée par provider...  │
│                           [7j]  [30j]   │
└─────────────────────────────────────────┘
```

#### B. Matrice Provider × Opération (Heatmap)
```
┌─────────────────────────────────────────────────────────┐
│ Matrice Provider × Opération (7 derniers jours)        │
│ Coût total : $0.25 (0.80 TND)                          │
├─────────────────────────────────────────────────────────┤
│ Opération     │ Gemini │ DeepSeek │ Groq │ Anthropic │ Ollama │
├───────────────┼────────┼──────────┼──────┼───────────┼────────┤
│ Indexation    │   $0.02│     -    │   -  │     -     │  $0.00 │
│               │ 750 tok│          │      │           │ 800 tok│
│               │   1 req│          │      │           │   1 req│
├───────────────┼────────┼──────────┼──────┼───────────┼────────┤
│ Chat          │    -   │   $0.03  │ $0.05│   $0.15   │  $0.00 │
│               │        │ 1400 tok │1350 t│  1700 tok │1700 tok│
│               │        │    1 req │ 1 req│    1 req  │  1 req │
└───────────────┴────────┴──────────┴──────┴───────────┴────────┘
```

**Points à vérifier** :
- [ ] Cellules avec couleur heatmap (fond rouge léger pour coûts > 0)
- [ ] Cellules "-" pour combinaisons sans données
- [ ] 3 lignes de métriques par cellule (Coût, Tokens, Requêtes)
- [ ] Totaux à droite et en bas

#### C. Tendance Tokens par Provider (LineChart)
```
┌─────────────────────────────────────────┐
│ Tendance Tokens par Provider            │
│ Évolution quotidienne du nombre...      │
├─────────────────────────────────────────┤
│                                          │
│  Tokens                                  │
│   2000┤      ╭─ Ollama                  │
│   1500┤    ╭─┴─ Groq                    │
│   1000┤  ╭─┴─── DeepSeek                │
│    500┤╭─┴───── Gemini                  │
│      0└┴─────┴─────┴─────┴──────        │
│        J-5   J-4   J-3   J-2   J-1      │
└─────────────────────────────────────────┘
```

**Points à vérifier** :
- [ ] 5 lignes de couleurs différentes (Gemini bleu, DeepSeek violet, Groq orange, Anthropic rouge, Ollama vert)
- [ ] Légende en bas du graphique
- [ ] Tooltip au survol (date + tokens)
- [ ] Axe X = dates (derniers 7 jours)
- [ ] Axe Y = nombre de tokens

#### D. Distribution par Opération (PieChart)
```
┌─────────────────────────────────────────┐
│ Distribution par Opération              │
├─────────────────────────────────────────┤
│          ╭─────╮                         │
│        ╱   Chat  ╲     Chat: 80%        │
│       │    80%    │    Embedding: 20%   │
│        ╲         ╱                       │
│          ╰─────╯                         │
│            20%                           │
│         Embedding                        │
└─────────────────────────────────────────┘
```

**Points à vérifier** :
- [ ] Camembert avec 2+ segments (selon opérations présentes)
- [ ] Couleurs distinctes par opération
- [ ] Labels avec pourcentages
- [ ] Légende à côté ou en bas

#### E. Coûts Détaillés par Provider (BarChart)
```
┌─────────────────────────────────────────┐
│ Coûts Détaillés par Provider            │
├─────────────────────────────────────────┤
│                                          │
│ Anthropic ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ $0.15        │
│ Groq      ▓▓▓▓▓ $0.05                   │
│ DeepSeek  ▓▓▓ $0.03                     │
│ Gemini    ▓▓ $0.02                      │
│ Ollama    ▓ $0.00                       │
└─────────────────────────────────────────┘
```

**Points à vérifier** :
- [ ] Barres empilées si plusieurs opérations par provider
- [ ] Couleurs par opération (cohérentes avec distribution)
- [ ] Tooltip détaillé au survol

### Étape 4 : Tester Toggle Période (7j vs 30j)

**Actions** :
1. Cliquer sur bouton **"30 jours"**
2. Attendre rechargement (1-2 secondes)
3. Vérifier que données changent (ou restent identiques si < 30j)
4. Recliquer sur **"7 jours"**

**Ce qui devrait se passer** :
- [ ] Bouton actif change de style (fond bleu)
- [ ] Tous les composants se rechargent
- [ ] En-tête matrice affiche "30 derniers jours" au lieu de "7 derniers jours"

---

## 🧪 Tests Avancés

### Test 1 : Vérifier Données API Directement

**Prérequis** : Cookie de session super-admin

**Commandes** (avec cookie auth) :
```bash
# API Matrix
curl -s "https://qadhya.tn/api/admin/provider-usage-matrix?days=7" \
  -H "Cookie: your-session-cookie" | jq '.'

# API Trends
curl -s "https://qadhya.tn/api/admin/provider-usage-trends?days=7" \
  -H "Cookie: your-session-cookie" | jq '.'
```

**Résultat attendu** :
```json
{
  "matrix": {
    "ollama": {
      "embedding": { "tokens": 800, "cost": 0, "requests": 1 },
      "chat": { "tokens": 1700, "cost": 0, "requests": 1 }
    },
    "groq": {
      "chat": { "tokens": 1350, "cost": 0.05, "requests": 1 }
    },
    ...
  },
  "totals": {
    "byProvider": { "ollama": 0, "groq": 0.05, ... },
    "byOperation": { "embedding": 0.02, "chat": 0.23 },
    "total": 0.25
  }
}
```

### Test 2 : Vérifier Performance API

**Critères** :
- [ ] Temps réponse Matrix < 500ms
- [ ] Temps réponse Trends < 500ms
- [ ] Header `Cache-Control: public, s-maxage=300` présent

**Vérification** :
```bash
time curl -s "https://qadhya.tn/api/admin/provider-usage-matrix?days=7" -I
# Vérifier: < 0.5s
```

### Test 3 : Tester Cas Limites

#### Cas 1 : Aucune Donnée (ai_usage_logs vide)

**Simulation** :
```sql
DELETE FROM ai_usage_logs;
```

**Résultat attendu** :
- [ ] Matrice affiche "-" partout
- [ ] Message "Aucune donnée disponible" sur charts
- [ ] Totaux = $0.00

#### Cas 2 : Un Seul Provider

**Simulation** :
```sql
DELETE FROM ai_usage_logs WHERE provider != 'ollama';
```

**Résultat attendu** :
- [ ] Matrice affiche Ollama uniquement (autres colonnes vides)
- [ ] PieChart affiche 100% pour opérations Ollama
- [ ] LineChart affiche 1 seule ligne (verte)

#### Cas 3 : 30 Jours vs 7 Jours

**Simulation** :
```sql
-- Ajouter logs anciens (> 7j, < 30j)
INSERT INTO ai_usage_logs (...)
VALUES (..., NOW() - interval '15 days');
```

**Résultat attendu** :
- [ ] Toggle 7j affiche 6 logs
- [ ] Toggle 30j affiche 7 logs (6 + 1 ancien)

---

## 🐛 Debugging

### Problème 1 : "Impossible de charger les métriques"

**Causes possibles** :
1. Base de données déconnectée
2. Table `ai_usage_logs` manquante
3. Contrainte CHECK provider trop stricte

**Vérifications** :
```bash
# 1. Check DB connexion
docker exec qadhya-postgres psql -U moncabinet -d qadhya -c "SELECT 1;"

# 2. Check table exists
docker exec qadhya-postgres psql -U moncabinet -d qadhya -c "\dt ai_usage_logs"

# 3. Check constraint
docker exec qadhya-postgres psql -U moncabinet -d qadhya -c "\d ai_usage_logs" | grep CHECK
```

### Problème 2 : Matrice Vide (tout affiche "-")

**Causes possibles** :
1. Aucune donnée dans `ai_usage_logs`
2. Période sélectionnée sans logs
3. Erreur API (500)

**Vérifications** :
```bash
# Check logs count
docker exec qadhya-postgres psql -U moncabinet -d qadhya -c "SELECT COUNT(*) FROM ai_usage_logs WHERE created_at >= NOW() - interval '7 days';"

# Check API logs
docker logs qadhya-nextjs --tail 50 | grep provider-usage

# Check browser console (F12)
# Vérifier erreurs réseau ou 500
```

### Problème 3 : Charts Ne S'Affichent Pas

**Causes possibles** :
1. Recharts non chargé (lazy loading)
2. Erreur JavaScript
3. Données mal formatées

**Vérifications** :
```bash
# Check browser console (F12)
# Rechercher erreurs:
# - "Cannot read property 'map' of undefined"
# - "Recharts is not defined"
# - "Unexpected token"

# Check logs Next.js
docker logs qadhya-nextjs --tail 100 | grep -i error
```

---

## 📊 Métriques Attendues (Données de Test)

### Matrice Provider × Opération

| Opération     | Gemini  | DeepSeek | Groq   | Anthropic | Ollama |
|---------------|---------|----------|--------|-----------|--------|
| **embedding** | $0.02   | -        | -      | -         | $0.00  |
|               | 750 tok | -        | -      | -         | 800 tok|
|               | 1 req   | -        | -      | -         | 1 req  |
| **chat**      | -       | $0.03    | $0.05  | $0.15     | $0.00  |
|               | -       | 1400 tok | 1350 t | 1700 tok  | 1700 t |
|               | -       | 1 req    | 1 req  | 1 req     | 1 req  |
| **TOTAL**     | $0.02   | $0.03    | $0.05  | $0.15     | $0.00  |

**Total général** : $0.25 USD = 0.80 TND (taux 3.2)

### Distribution Opérations

- **Chat** : 80% ($0.20)
- **Embedding** : 20% ($0.05)

### Providers par Coût

1. **Anthropic** : $0.15 (60%)
2. **Groq** : $0.05 (20%)
3. **DeepSeek** : $0.03 (12%)
4. **Gemini** : $0.02 (8%)
5. **Ollama** : $0.00 (0%)

---

## ✅ Checklist Validation Dashboard

### Fonctionnalités UI
- [ ] Onglet "Providers" accessible
- [ ] Toggle 7j/30j fonctionne
- [ ] Matrice heatmap affiche données
- [ ] LineChart tendances affiché
- [ ] PieChart distribution affiché
- [ ] BarChart coûts affiché
- [ ] Couleurs cohérentes entre composants
- [ ] Totaux corrects (ligne + colonne)

### Performance
- [ ] Chargement initial < 2s
- [ ] Rechargement toggle < 1s
- [ ] Aucune erreur console
- [ ] Responsive design OK (mobile/desktop)

### Données
- [ ] 6 logs de test présents
- [ ] 5 providers affichés
- [ ] 2 opérations (embedding, chat)
- [ ] Coût total = $0.25
- [ ] Ollama = $0.00 (gratuit)

### APIs
- [ ] `/api/admin/provider-usage-matrix` retourne 200
- [ ] `/api/admin/provider-usage-trends` retourne 200
- [ ] Cache 5min actif (header Cache-Control)
- [ ] Performance < 500ms

---

## 🚀 Après Validation

### Supprimer Données de Test (Optionnel)

```sql
-- Si vous voulez repartir à zéro
DELETE FROM ai_usage_logs WHERE user_id = 'eb6a4d5c-9684-4868-826f-1d7e00534b94';
```

### Attendre Données Réelles

Le dashboard se remplira automatiquement quand :
- ✅ Utilisateurs font des requêtes chat
- ✅ Système indexe des documents
- ✅ Génération de documents juridiques
- ✅ Classification automatique

**Délai attendu** : 1-7 jours selon utilisation

---

## 📞 Support

En cas de problème :

1. **Vérifier logs** :
   ```bash
   docker logs qadhya-nextjs --tail 100 | grep -i "provider\|error"
   ```

2. **Vérifier DB** :
   ```bash
   docker exec qadhya-postgres psql -U moncabinet -d qadhya -c "SELECT COUNT(*) FROM ai_usage_logs;"
   ```

3. **Redémarrer container** :
   ```bash
   docker restart qadhya-nextjs
   ```

4. **Consulter documentation** :
   - `docs/PROVIDER_USAGE_DASHBOARD.md`
   - `docs/GUIDE_ADMINISTRATEUR.md` (section 4.3)
   - `docs/DATABASE_CONSOLIDATION_FEB11_2026.md`

---

**Document créé le** : 11 février 2026
**Auteur** : Claude Code (Sonnet 4.5)
**Version** : 1.0
**Statut** : ✅ Dashboard opérationnel avec données de test
