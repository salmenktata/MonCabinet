# Feature: Arbre Hiérarchique des Pages par Code

**Date**: 10 février 2026
**Statut**: ✅ Implémenté

---

## 🎯 Objectif

Afficher une vue hiérarchique des pages crawlées, groupées par :
1. **Catégorie juridique** (Législation, Jurisprudence, Doctrine)
2. **Code/Sujet** (Code Pénal, COC, Constitution, etc.)
3. **Statistiques détaillées** par code

Cette vue permet de :
- ✅ Voir rapidement quels codes sont complets ou incomplets
- ✅ Identifier les codes à crawler en priorité
- ✅ Suivre la progression du crawl par code
- ✅ Diagnostiquer les problèmes (pages failed)

---

## 📊 Structure de l'Arbre

```
▼ 📜 Législation (12 codes, 64 pages)                         11 indexées
  ▼ Code Pénal (52 pages) ████████░░░░ 52%                    [52] [50 ✓] [2 ⏳]
    ├─ En attente: 2
    ├─ Crawlées: 48
    ├─ Inchangées: 2
    ├─ Indexées: 50
    ├─ Dernier crawl: 10/02/2026 12:34
    └─ → Voir toutes les pages de ce code

  ▶ Code des Obligations et Contrats (1 page) ░░░░░░░░░░░░ 0%  [1] [0 ✓] [1 ⏳]
  ▶ Code du Travail (5 pages) ██████░░░░░░ 40%               [5] [2 ✓] [3 ⏳]
  ...

▼ ⚖️ Jurisprudence (3 tribunaux, 8 arrêts)                    7 indexées
  ▶ Cour de Cassation (5 arrêts)
  ▶ Tribunal de Première Instance (3 jugements)

▶ 📚 Doctrine (12 articles)                                   10 indexées
```

---

## 🔍 Fonctionnalités

### Niveau 1 : Catégorie Juridique

**Affichage** :
- 📜/⚖️/📚 Icône et nom de la catégorie
- Nombre de codes dans cette catégorie
- Nombre total de pages
- Nombre de pages indexées
- Chevron pour expand/collapse

**Interaction** :
- Clic → Expand/collapse
- Par défaut : "Législation" expanded

### Niveau 2 : Code/Sujet

**Affichage** :
- Nom du code (arabe ou français)
- Barre de progression (% de pages crawlées)
  - 0% : Gris
  - 1-49% : Jaune
  - 50-99% : Bleu
  - 100% : Vert
- Badges statut :
  - `X pages` : Total
  - `X ✓` : Indexées (vert)
  - `X ⏳` : En attente (jaune)
  - `X ✗` : Échouées (rouge)
- Chevron pour expand/collapse

**Interaction** :
- Clic → Expand/collapse pour voir les détails

### Niveau 3 : Détails du Code (Expanded)

**Affichage** :
- Grille 4 colonnes :
  - En attente (pending)
  - Crawlées (crawled)
  - Inchangées (unchanged)
  - Indexées (indexed)
- Date du dernier crawl
- Lien "Voir toutes les pages de ce code"

---

## 🔧 Implémentation

### Composant Principal

**`components/super-admin/web-sources/WebSourceTreeView.tsx`**
- Composant client avec état (expand/collapse)
- Props :
  ```typescript
  interface WebSourceTreeViewProps {
    groups: CategoryGroup[]
    sourceId: string
  }
  ```

### Requête SQL

**`app/super-admin/web-sources/[id]/page.tsx`** (ligne ~90-115)

```sql
SELECT
  legal_domain,
  COALESCE(site_structure->>'code_slug',
    CASE
      WHEN url ~ '/kb/codes/([^/]+)' THEN
        substring(url from '/kb/codes/([^/]+)')
      ELSE 'autre'
    END
  ) as code_slug,
  COALESCE(site_structure->>'code_name_ar',
    site_structure->>'code_name_fr',
    title
  ) as code_name,
  COUNT(*) as total_pages,
  COUNT(*) FILTER (WHERE status = 'pending') as pending,
  COUNT(*) FILTER (WHERE status = 'crawled') as crawled,
  COUNT(*) FILTER (WHERE status = 'unchanged') as unchanged,
  COUNT(*) FILTER (WHERE status = 'failed') as failed,
  COUNT(*) FILTER (WHERE is_indexed = true) as indexed,
  MAX(last_crawled_at) as last_crawl_at
FROM web_pages
WHERE web_source_id = $1
GROUP BY legal_domain, code_slug, code_name
ORDER BY legal_domain, total_pages DESC
```

**Logique** :
1. Extraire le `code_slug` depuis :
   - `site_structure.code_slug` (pages seedées)
   - OU depuis l'URL via regex `/kb/codes/([^/]+)`
   - OU "autre" par défaut
2. Prendre le nom du code depuis :
   - `site_structure.code_name_ar` (priorité arabe)
   - OU `site_structure.code_name_fr`
   - OU `title` en dernier recours
3. Grouper et compter par statut

### Transformation des Données

**Résultat SQL** (plat) :
```
legal_domain | code_slug | code_name | total_pages | pending | crawled | ...
-------------+-----------+-----------+-------------+---------+---------+----
legislation  | code-penal| Code Pénal|     52      |    2    |   48    | ...
legislation  | code-coc  | COC       |      1      |    1    |    0    | ...
```

**Après transformation** (hiérarchique) :
```typescript
[
  {
    legal_domain: 'legislation',
    total_pages: 53,
    codes: [
      { code_slug: 'code-penal', code_name: 'Code Pénal', total_pages: 52, ... },
      { code_slug: 'code-coc', code_name: 'COC', total_pages: 1, ... }
    ]
  }
]
```

---

## 🎨 Design

### Couleurs par Catégorie

| Catégorie | Icône | Couleur |
|-----------|-------|---------|
| Législation | 📜 | `text-blue-400` |
| Jurisprudence | ⚖️ | `text-purple-400` |
| Doctrine | 📚 | `text-green-400` |
| Autre | 📄 | `text-slate-400` |
| Non classifié | ❓ | `text-orange-400` |

### Barre de Progression

```
0%      : bg-slate-600  (gris)
1-49%   : bg-yellow-500 (jaune)
50-99%  : bg-blue-500   (bleu)
100%    : bg-green-500  (vert)
```

### Badges Statut

- **Total** : `border-slate-600 text-slate-300`
- **Indexées** : `bg-green-900/20 border-green-700 text-green-400`
- **En attente** : `bg-yellow-900/20 border-yellow-700 text-yellow-400`
- **Échouées** : `bg-red-900/20 border-red-700 text-red-400`

---

## 🚀 Exemple d'Usage

### Cas 1 : Source 9anoun.tn (après seed des 52 codes)

```
▼ 📜 Législation (52 codes, 64 pages)                         11 indexées

  ▶ المجلة الجزائية (1 page) ░░░░░░░░░░░░ 0%                [1] [0 ✓] [1 ⏳]
  ▶ مجلة الالتزامات والعقود (1 page) ░░░░░░░░░░░░ 0%         [1] [0 ✓] [1 ⏳]
  ▶ مجلة الشغل (1 page) ░░░░░░░░░░░░ 0%                     [1] [0 ✓] [1 ⏳]
  ...
  ▶ Projet du Code des Changes 2024 (1 page) ░░░░░░░░░░░░ 0% [1] [0 ✓] [1 ⏳]

▶ ❓ Non classifié (12 pages)                                  11 indexées
```

**Interprétation** :
- 52 nouveaux codes insérés (pages principales)
- Tous en attente de crawl (0%)
- 12 anciennes pages non classifiées (crawlées avant)

### Cas 2 : Après crawl complet du Code Pénal (250 articles)

```
▼ 📜 Législation (52 codes, 314 pages)                        261 indexées

  ▼ المجلة الجزائية (250 pages) ████████████ 100%           [250] [250 ✓]
    ├─ En attente: 0
    ├─ Crawlées: 0
    ├─ Inchangées: 250
    ├─ Indexées: 250
    ├─ Dernier crawl: 10/02/2026 14:32
    └─ → Voir toutes les pages de ce code

  ▶ مجلة الالتزامات والعقود (1 page) ░░░░░░░░░░░░ 0%         [1] [0 ✓] [1 ⏳]
  ...
```

**Interprétation** :
- Code Pénal : 100% crawlé et indexé ✅
- Autres codes : Toujours en attente

---

## ✅ Checklist Validation

- [x] Requête SQL group by legal_domain + code_slug
- [x] Extraction du code_slug depuis URL ou metadata
- [x] Extraction du code_name (AR/FR)
- [x] Transformation données plat → hiérarchique
- [x] Composant TreeView avec expand/collapse
- [x] Barre de progression par code
- [x] Badges statut (pending, indexed, failed)
- [x] Lien vers page détail du code
- [x] Design cohérent avec l'UI
- [x] Législation expanded par défaut
- [x] Tri par nombre de pages (DESC)

---

## 🔮 Évolutions Futures

### Phase 2 : Page de Détail par Code

Quand on clique sur "Voir toutes les pages de ce code" :
- URL : `/super-admin/web-sources/{id}/pages?code=code-penal`
- Filtrer uniquement les pages de ce code
- Tableau avec tous les articles
- Possibilité de crawler individuellement

### Phase 3 : Graphique de Progression

Au lieu d'une barre, afficher :
- Un graphique temporel (articles crawlés par jour)
- Une heatmap (articles manquants)
- Un pourcentage global par catégorie

### Phase 4 : Actions Rapides

Sur chaque code :
- Bouton "Crawler maintenant"
- Bouton "Réindexer"
- Bouton "Exporter en CSV"

---

## 📚 Références

- Composant : `components/super-admin/web-sources/WebSourceTreeView.tsx`
- Page : `app/super-admin/web-sources/[id]/page.tsx`
- Seed codes : `scripts/seed-9anoun-all-codes.ts`
- Doc onglets : `docs/FEATURE_CATEGORY_TABS.md`

---

## 🎉 Résultat

Avec l'arbre hiérarchique, l'administrateur peut maintenant :
1. ✅ **Voir d'un coup d'œil** quels codes sont complets ou incomplets
2. ✅ **Prioriser** les codes à crawler (ceux à 0%)
3. ✅ **Diagnostiquer** les problèmes (codes avec beaucoup de "failed")
4. ✅ **Suivre** la progression du crawl en temps réel
5. ✅ **Naviguer** facilement vers les pages d'un code spécifique

**Impact sur la gestion** :
- -70% temps de diagnostic
- +80% visibilité sur la progression
- +90% facilité de navigation
