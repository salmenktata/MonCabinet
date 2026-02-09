# APIs Classification - Documentation

Documentation des APIs backend pour l'interface de correction de classification (Sprint 3 - Phase 4.1-4.2)

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Frontend (Phase 4.3)                      │
│  /super-admin/classification                                 │
│  - ReviewQueue.tsx                                          │
│  - ReviewModal.tsx                                          │
│  - CorrectionsHistory.tsx                                   │
│  - ClassificationAnalytics.tsx                              │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    Backend APIs (Phase 4.1-4.2)              │
│  1. GET /api/super-admin/classification/queue               │
│  2. GET/POST /api/super-admin/classification/corrections    │
│  3. GET /api/super-admin/classification/analytics/top-errors│
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                   Database (PostgreSQL)                      │
│  - legal_classifications (review_priority, review_effort)   │
│  - classification_corrections                                │
│  - classification_feedback (NEW)                            │
│  - Fonction: get_classification_review_queue()              │
└─────────────────────────────────────────────────────────────┘
```

---

## 1. API Queue de Review

### Endpoint
```
GET /api/super-admin/classification/queue
```

### Description
Récupère la liste des pages nécessitant revue humaine, triées par priorité (urgent > high > medium > low) puis date (FIFO)

### Query Parameters

| Param | Type | Requis | Description | Exemple |
|-------|------|--------|-------------|---------|
| `priority[]` | string[] | Non | Filtrer par priorité | `?priority[]=urgent&priority[]=high` |
| `effort[]` | string[] | Non | Filtrer par effort | `?effort[]=quick&effort[]=moderate` |
| `sourceId` | UUID | Non | Filtrer par source | `?sourceId=xxx-xxx-xxx` |
| `limit` | number | Non | Nb résultats (max 200) | `?limit=50` (défaut) |
| `offset` | number | Non | Pagination | `?offset=0` (défaut) |

### Valeurs Priority
- `low` : Faible priorité (< 2min effort, catégorie probable > 60%)
- `medium` : Priorité moyenne (2-5min effort, ou confiance < 60%)
- `high` : Priorité haute (hésitation entre 2 catégories fortes)
- `urgent` : Priorité urgente (3+ catégories suggérées, contradictions)

### Valeurs Effort
- `quick` : < 2 minutes (vérification simple)
- `moderate` : 2-5 minutes (analyse standard)
- `complex` : > 5 minutes (expertise requise)

### Response

```typescript
{
  items: ReviewQueueItem[], // Pages triées par priorité puis date
  total: number,            // Total pages (sans filtres)
  stats: {
    total: number,
    urgent: number,
    high: number,
    medium: number,
    low: number,
    noPriority: number
  }
}
```

#### ReviewQueueItem

```typescript
interface ReviewQueueItem {
  webPageId: string
  url: string
  title: string | null
  primaryCategory: string          // Catégorie actuelle
  domain: string                   // Domaine actuel
  confidenceScore: number          // Score confiance (0-1)
  reviewPriority: 'low' | 'medium' | 'high' | 'urgent' | null
  reviewEstimatedEffort: 'quick' | 'moderate' | 'complex' | null
  validationReason: string | null  // Raison détaillée
  sourceName: string
  createdAt: string                // ISO 8601
}
```

### Exemples

**1. Récupérer pages urgentes et high priority**
```bash
curl "http://localhost:3000/api/super-admin/classification/queue?priority[]=urgent&priority[]=high&limit=20"
```

**2. Récupérer pages quick à revoir (revue rapide)**
```bash
curl "http://localhost:3000/api/super-admin/classification/queue?effort[]=quick&limit=100"
```

**3. Récupérer pages d'une source spécifique**
```bash
curl "http://localhost:3000/api/super-admin/classification/queue?sourceId=xxx-xxx-xxx"
```

---

## 2. API Corrections

### Endpoint
```
GET  /api/super-admin/classification/corrections
POST /api/super-admin/classification/corrections
```

### GET - Historique Corrections

#### Query Parameters

| Param | Type | Requis | Description |
|-------|------|--------|-------------|
| `limit` | number | Non | Nb résultats (max 200), défaut 50 |
| `offset` | number | Non | Pagination, défaut 0 |
| `sourceId` | UUID | Non | Filtrer par source |
| `hasRule` | boolean | Non | Filtrer si règle générée (`true`/`false`) |

#### Response

```typescript
{
  items: CorrectionHistoryItem[],
  total: number
}
```

#### CorrectionHistoryItem

```typescript
interface CorrectionHistoryItem {
  id: string
  pageId: string
  pageUrl: string
  pageTitle: string | null
  sourceName: string
  originalCategory: string
  originalDomain: string
  correctedCategory: string
  correctedDomain: string | null
  correctedDocumentType: string | null
  correctedBy: string
  createdAt: string
  hasGeneratedRule: boolean        // True si correction → règle auto
  ruleId: string | null
  ruleName: string | null
  pagesAffected: number | null     // Nb pages affectées par règle
}
```

#### Exemple GET

```bash
# Récupérer toutes corrections ayant généré une règle
curl "http://localhost:3000/api/super-admin/classification/corrections?hasRule=true&limit=50"
```

### POST - Enregistrer Correction

#### Request Body

```typescript
interface CorrectionRequest {
  pageId: string                   // REQUIS
  correctedCategory: string        // REQUIS
  correctedDomain?: string | null
  correctedDocumentType?: string | null
  correctedBy: string              // REQUIS - user ID/email
  feedback?: {
    isUseful: boolean
    notes?: string
  }
}
```

#### Response

```typescript
{
  success: true,
  correctionId: string,
  hasGeneratedRule: boolean,
  message: string
}
```

#### Exemple POST

```bash
curl -X POST http://localhost:3000/api/super-admin/classification/corrections \
  -H "Content-Type: application/json" \
  -d '{
    "pageId": "xxx-xxx-xxx",
    "correctedCategory": "jurisprudence",
    "correctedDomain": "civil",
    "correctedDocumentType": "arret",
    "correctedBy": "admin@example.com",
    "feedback": {
      "isUseful": true,
      "notes": "Évident après lecture titre"
    }
  }'
```

#### Comportement Auto-Learning

Après enregistrement, le système :
1. Enregistre la correction dans `classification_corrections`
2. Analyse les patterns (3+ corrections similaires → génère règle auto)
3. Enregistre feedback dans `classification_feedback` si fourni
4. Retourne si règle générée (`hasGeneratedRule: true`)

---

## 3. API Top Erreurs

### Endpoint
```
GET /api/super-admin/classification/analytics/top-errors
```

### Description
Retourne top erreurs classification groupées par domaine, source, ou raison

### Query Parameters

| Param | Type | Requis | Description | Défaut |
|-------|------|--------|-------------|--------|
| `groupBy` | string | Non | Groupement (`domain`, `source`, `reason`) | `domain` |
| `limit` | number | Non | Nb résultats (max 100) | 20 |

### Response

```typescript
{
  errors: TopError[],
  totalPagesRequiringReview: number,
  byDomain: Record<string, number>,   // Stats par domaine
  bySource: Record<string, number>,   // Stats par source
  byPriority: Record<string, number>  // Stats par priorité
}
```

#### TopError

```typescript
interface TopError {
  key: string                      // domain, source, ou reason
  count: number                    // Nb pages
  percentage: number               // % du total
  avgConfidence: number            // Moyenne confiance (0-1)
  examples: {
    url: string
    title: string | null
    priority: string | null
  }[]                              // 3 exemples
}
```

### Exemples

**1. Top domaines avec erreurs**
```bash
curl "http://localhost:3000/api/super-admin/classification/analytics/top-errors?groupBy=domain&limit=20"
```

**2. Top sources avec erreurs**
```bash
curl "http://localhost:3000/api/super-admin/classification/analytics/top-errors?groupBy=source&limit=10"
```

**3. Top raisons validation**
```bash
curl "http://localhost:3000/api/super-admin/classification/analytics/top-errors?groupBy=reason&limit=30"
```

---

## Migration DB

### Fichier
`migrations/20260210_classification_ux.sql`

### Changements

1. **Colonnes ajoutées à `legal_classifications`**
   - `review_priority` : TEXT CHECK (low, medium, high, urgent)
   - `review_estimated_effort` : TEXT CHECK (quick, moderate, complex)
   - `validation_reason` : TEXT (description détaillée)

2. **Table `classification_feedback` créée**
   ```sql
   CREATE TABLE classification_feedback (
     id UUID PRIMARY KEY,
     correction_id UUID REFERENCES classification_corrections(id),
     is_useful BOOLEAN NOT NULL,
     notes TEXT,
     created_by TEXT NOT NULL,
     created_at TIMESTAMP DEFAULT NOW()
   )
   ```

3. **Fonction SQL `get_classification_review_queue()`**
   - Paramètres : priority[], effort[], sourceId, limit, offset
   - Retourne : Pages triées par priorité puis date FIFO
   - Index optimisé : `idx_legal_classifications_review_queue`

### Application

```bash
# Local (Docker)
docker exec -i -e PGUSER=moncabinet qadhya-postgres psql -d moncabinet < migrations/20260210_classification_ux.sql

# Production
psql -U moncabinet -d moncabinet -f migrations/20260210_classification_ux.sql
```

---

## Tests

### Script Test Complet

TODO : Créer `scripts/test-classification-apis.ts`

### Tests Manuels

```bash
# 1. Vérifier queue fonctionne
curl http://localhost:3000/api/super-admin/classification/queue

# 2. Vérifier top erreurs
curl "http://localhost:3000/api/super-admin/classification/analytics/top-errors?groupBy=domain"

# 3. Vérifier historique corrections
curl "http://localhost:3000/api/super-admin/classification/corrections?limit=10"

# 4. Enregistrer correction de test
curl -X POST http://localhost:3000/api/super-admin/classification/corrections \
  -H "Content-Type: application/json" \
  -d '{
    "pageId": "xxx",
    "correctedCategory": "legislation",
    "correctedBy": "test@example.com"
  }'
```

---

## Sécurité

⚠️ **IMPORTANT** : Ces APIs sont sous `/super-admin/*` et nécessitent :

1. Authentification admin via middleware Next.js
2. Rate limiting recommandé (100 req/min)
3. Validation inputs (UUID format, enum values)
4. Pas d'exposition données sensibles dans erreurs

TODO : Ajouter middleware auth dans `app/api/super-admin/middleware.ts`

---

## Performance

### Optimisations DB

1. **Index review queue** (créé par migration)
   ```sql
   idx_legal_classifications_review_queue
   ON (requires_validation, review_priority, created_at)
   WHERE requires_validation = true
   ```

2. **Index feedback** (créé par migration)
   ```sql
   idx_classification_feedback_correction
   idx_classification_feedback_created_at
   ```

3. **Fonction SQL** : Utilise requête optimisée avec filtres en DB (pas en app)

### Limites

- Queue : max 200 items/requête (pagination requise)
- Corrections : max 200 items/requête (pagination requise)
- Top errors : max 100 items/requête

### Cache Recommandé

- Queue stats : cache 5min (données changent peu)
- Top errors : cache 15min (analytics)
- Historique corrections : cache 2min

TODO : Ajouter cache Redis dans Phase 5

---

## Prochaines Étapes

- [ ] Phase 4.3 : Créer interface UI React
  - ReviewQueue.tsx
  - ReviewModal.tsx
  - CorrectionsHistory.tsx
  - ClassificationAnalytics.tsx
- [ ] Phase 4.4 : Tests E2E
- [ ] Phase 5 : Middleware auth
- [ ] Phase 5 : Cache Redis
- [ ] Phase 5 : Rate limiting
