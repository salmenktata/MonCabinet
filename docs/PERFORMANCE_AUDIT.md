# 🔍 Audit de Performance - Février 2026

## 📊 Analyse du Bundle Next.js

### Pages les Plus Lourdes

| Page | Taille | First Load | Problème Identifié |
|------|--------|------------|-------------------|
| `/super-admin/classification/metrics` | **128 kB** | **243 kB** | ❌ Recharts (8 MB) chargé directement |
| `/dossiers/assistant` | 33.7 kB | 191 kB | ⚠️ Multiples gros composants |
| `/super-admin/knowledge-base/[id]` | 19.6 kB | 203 kB | ⚠️ Composants lourds |
| `/super-admin/taxonomy` | 14.5 kB | 165 kB | ⚠️ TaxonomyManager (611 lignes) |
| `/super-admin/settings` | 15.3 kB | 153 kB | ⚠️ Multiples wizards |

### Packages NPM les Plus Lourds

| Package | Taille | Utilisation | Optimisation Possible |
|---------|--------|-------------|----------------------|
| **googleapis** | **194 MB** | Google Drive API | ✅ Déjà côté serveur uniquement |
| next + @next | 279 MB | Framework | ✅ Normal, rien à faire |
| **gpt-tokenizer** | **55 MB** | Comptage tokens | ⚠️ Potentiel remplacement plus léger |
| **date-fns** | **38 MB** | Dates | ⚠️ Importer uniquement fonctions utilisées |
| **pdfjs-dist** | **36 MB** | Parsing PDF | ⚠️ Lazy load, uniquement pages admin |
| **lucide-react** | **36 MB** | Icônes | ⚠️ Tree-shaking insuffisant |
| **tesseract.js-core** | **29 MB** | OCR | ✅ Utilisé uniquement serveur |
| **recharts** | **8 MB** | Charts | ❌ Utilisé 1 seule page, lazy load |

## 🎯 Opportunités d'Optimisation Prioritaires

### 1. 🔴 CRITIQUE : Lazy Load Recharts (Gain estimé : -8 MB)

**Problème** :
- Recharts (8 MB) chargé dans `ClassificationMetricsContent`
- Page déjà utilise `dynamic()` mais charge le contenu immédiatement
- Page rarement visitée (super-admin uniquement)

**Solution** :
```tsx
// Lazy load RECHARTS, pas juste le composant
const LazyBarChart = dynamic(() => import('recharts').then(m => ({ default: m.BarChart })), {
  loading: () => <Skeleton />,
  ssr: false
})
```

**Impact** :
- Bundle initial : -8 MB
- First Load page metrics : 243 kB → ~100 kB (-60%)
- Pages non-admin : aucun impact

---

### 2. 🟠 IMPORTANT : Tree-Shaking lucide-react (Gain estimé : -20 MB)

**Problème** :
- lucide-react fait 36 MB
- Imports potentiellement non optimisés

**Solution** :
```tsx
// ❌ Mauvais (charge tout le package)
import { Icon1, Icon2 } from 'lucide-react'

// ✅ Bon (tree-shaking automatique Next.js 15)
// Vérifier que les imports sont correctement optimisés
```

**Action** : Audit des imports pour confirmer le tree-shaking

**Impact** : -15 à -20 MB si mal configuré

---

### 3. 🟠 IMPORTANT : Lazy Load Gros Composants (Gain estimé : -5 à -8 MB)

**Composants identifiés** (> 500 lignes) :
- `AddWebSourceWizard` (929 lignes)
- `RulesManager` (833 lignes)
- `PurgeRAGCard` (727 lignes)
- `DossierDivorceForm` (642 lignes)
- `TaxonomyManager` (611 lignes)

**Solution** :
```tsx
const AddWebSourceWizard = dynamic(
  () => import('@/components/super-admin/web-sources/AddWebSourceWizard'),
  {
    loading: () => <Skeleton />,
    ssr: false
  }
)
```

**Impact** :
- Pages admin : First Load -3 à -5 MB
- Pages user : First Load -5 à -8 MB (ne charge jamais ces composants)

---

### 4. 🟡 MOYEN : Optimiser date-fns (Gain estimé : -10 à -15 MB)

**Problème** :
- date-fns fait 38 MB
- Possiblement mal importé

**Solution** :
```tsx
// ❌ Mauvais
import * as dateFns from 'date-fns'

// ✅ Bon
import { format, addDays } from 'date-fns'
```

**Action** : Audit des imports date-fns

**Impact** : -10 à -15 MB si mal importé

---

### 5. 🟡 MOYEN : Remplacer gpt-tokenizer (Gain estimé : -50 MB)

**Problème** :
- gpt-tokenizer fait 55 MB (énorme)
- Utilisé uniquement pour estimer tokens OpenAI

**Solutions alternatives** :
- Estimation approximative : `text.split(/\s+/).length * 1.3`
- API OpenAI retourne token count dans réponse
- Package plus léger : `@anthropic-ai/tokenizer` (< 5 MB)

**Impact** : -50 MB si supprimé, -45 MB si remplacé

---

## 🗄️ Optimisations Base de Données

### Requêtes à Optimiser

#### 1. Query N+1 dans `app/(dashboard)/dossiers/assistant/page.tsx`

```tsx
// AVANT (server component - OK)
const clientsResult = await query(
  `SELECT id, nom, prenom, type_client
   FROM clients
   WHERE user_id = $1
   ORDER BY nom, prenom`,
  [session.user.id]
)
```

**Status** : ✅ Optimisé (1 requête, index sur user_id)

#### 2. Index Manquants à Vérifier

```sql
-- Vérifier ces index
CREATE INDEX IF NOT EXISTS idx_clients_user_id ON clients(user_id);
CREATE INDEX IF NOT EXISTS idx_dossiers_user_id ON dossiers(user_id);
CREATE INDEX IF NOT EXISTS idx_dossiers_client_id ON dossiers(client_id);
CREATE INDEX IF NOT EXISTS idx_web_pages_source_id ON web_pages(source_id);
CREATE INDEX IF NOT EXISTS idx_web_pages_status ON web_pages(status);
CREATE INDEX IF NOT EXISTS idx_knowledge_base_category ON knowledge_base(category);
```

**Action** : Script pour vérifier/créer les index manquants

---

## 🌐 Optimisations API

### 1. Compression Gzip/Brotli

**Status** : ⚠️ À vérifier (Next.js 15 devrait activer automatiquement)

**Vérification** :
```bash
curl -H "Accept-Encoding: gzip" http://localhost:7002/api/chat -v
```

**Si manquant, ajouter** :
```typescript
// next.config.js
module.exports = {
  compress: true, // Activer compression
}
```

---

### 2. Cache-Control Headers

**Problème** : Potentiellement manquant sur routes API

**Solution** :
```typescript
// lib/api/cache-headers.ts
export function setCacheHeaders(response: Response, maxAge: number = 60) {
  response.headers.set('Cache-Control', `public, s-maxage=${maxAge}, stale-while-revalidate`)
  return response
}

// Usage dans API routes
export async function GET() {
  const data = await fetchData()
  return setCacheHeaders(Response.json(data), 300) // 5 minutes
}
```

---

### 3. Compression Payloads JSON Volumineux

**Routes concernées** :
- `/api/super-admin/knowledge-base` (liste KB)
- `/api/super-admin/web-sources` (liste sources)
- `/api/dossiers/structure` (structure dossier)

**Solution** : Compression côté client pour payloads > 10 KB

---

## 📦 Optimisations Next.js

### 1. Configuration Build

```javascript
// next.config.js - Déjà configuré ✅
module.exports = {
  compress: true,
  swcMinify: true,
  reactStrictMode: true,
  compiler: {
    removeConsole: false, // ✅ Désactivé (logging prod important)
  },
}
```

### 2. Route Handlers vs API Routes

**Status** : ✅ Utilise déjà Route Handlers (Next.js 13+)

---

## 🎨 Optimisations Frontend

### 1. Composants React à Lazy Load

| Composant | Taille | Lazy Load | Gain Estimé |
|-----------|--------|-----------|-------------|
| `GlobalSearch` | 522 lignes | ✅ Recommandé | -2 MB |
| `GenerateDocumentForm` | 438 lignes | ✅ Recommandé | -1.5 MB |
| `StructuredResult` | 443 lignes | ✅ Recommandé | -1.5 MB |

### 2. Images et Assets

**Action** : Audit des images non optimisées
```bash
find public -type f \( -name "*.jpg" -o -name "*.png" \) -size +100k
```

---

## 📊 Résumé des Gains Estimés

| Optimisation | Effort | Gain Estimé | Priorité |
|--------------|--------|-------------|----------|
| Lazy load Recharts | Faible | **-8 MB** | 🔴 Critique |
| Lazy load gros composants | Moyen | **-5 à -8 MB** | 🟠 Haute |
| Remplacer gpt-tokenizer | Moyen | **-50 MB** | 🟠 Haute |
| Tree-shaking lucide-react | Faible | **-15 à -20 MB** | 🟠 Haute |
| Optimiser date-fns | Faible | **-10 à -15 MB** | 🟡 Moyenne |
| Compression API | Faible | **-30% taille responses** | 🟡 Moyenne |
| Cache headers | Faible | **Requêtes réduites** | 🟡 Moyenne |
| Index DB | Moyen | **Queries 2x-10x plus rapides** | 🟠 Haute |

### Gain Total Estimé
- **Bundle initial** : -78 à -101 MB (-40% à -50%)
- **First Load pages** : -10 à -15 MB (-30% à -40%)
- **API responses** : -30% à -50% (avec compression)
- **DB queries** : 2x à 10x plus rapides (avec index)

---

## 🚀 Plan d'Action Recommandé

### Phase 1 : Quick Wins (1-2 jours)
1. ✅ Lazy load Recharts
2. ✅ Lazy load 5 gros composants
3. ✅ Vérifier/ajouter index DB manquants
4. ✅ Activer compression API

**Gain attendu** : -15 à -20 MB bundle, queries 2x-5x plus rapides

### Phase 2 : Optimisations Moyennes (2-3 jours)
1. ✅ Audit tree-shaking lucide-react
2. ✅ Optimiser imports date-fns
3. ✅ Ajouter Cache-Control headers
4. ✅ Lazy load composants modals/dialogs

**Gain attendu** : -25 à -35 MB bundle, -30% taille responses API

### Phase 3 : Refactoring (3-5 jours)
1. ✅ Remplacer gpt-tokenizer
2. ✅ Compression payloads JSON > 10 KB
3. ✅ Optimisation images/assets
4. ✅ Service Worker pour cache agressif

**Gain attendu** : -50 à -55 MB bundle, cache agressif

---

## 📈 Métriques à Suivre

### Avant Optimisations
- Bundle size: ~200 MB total
- Page metrics First Load: 243 kB
- Requête moyenne DB: ~50-100 ms
- Taille moyenne response API: ~50-200 KB

### Cibles Après Optimisations
- Bundle size: < 120 MB (-40%)
- Page metrics First Load: < 150 kB (-40%)
- Requête moyenne DB: < 20 ms (2x-5x)
- Taille moyenne response API: < 30 KB (-40% avec compression)

---

## ✅ Actions Immédiates (à faire aujourd'hui)

1. **Lazy load Recharts** (gain immédiat -8 MB)
2. **Lazy load 3 gros composants** (gain -3 MB)
3. **Vérifier index DB critiques** (gain queries 2x)

**Temps estimé** : 2-3 heures
**Gain total** : -11 MB bundle, queries 2x plus rapides

---

*Audit réalisé le 9 février 2026*
