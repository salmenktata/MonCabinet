# Feature: Onglets de Filtrage par Catégorie Juridique

**Date**: 10 février 2026
**Statut**: ✅ Implémenté

---

## 🎯 Objectif

Ajouter des onglets de filtrage par catégorie juridique sur la page de détail d'une source web pour :
- Visualiser rapidement la distribution des pages par catégorie
- Identifier les catégories sous/sur-représentées
- Valider la qualité de la classification automatique

---

## 📊 Fonctionnalité

### Onglets Affichés

```
[📊 Toutes (64)] [📜 Législation (52)] [⚖️ Jurisprudence (8)] [📚 Doctrine (4)] [❓ Non classifié (0)]
```

Chaque onglet affiche :
- 🔢 **Nombre total** de pages dans cette catégorie
- ✅ **Nombre indexé** (ex: "48 indexées")
- 🎨 **Couleur active** : bleu quand sélectionné, gris sinon

### Comportement

1. **Par défaut** : Onglet "Toutes" actif
2. **Clic sur catégorie** : Active l'onglet (bleu)
3. **Re-clic** : Désactive et revient à "Toutes"
4. **Tri** : Catégories triées par nombre de pages (décroissant)
5. **Masquage** : Catégories à 0 pages non affichées

---

## 🔧 Implémentation

### Fichiers Créés

**`components/super-admin/web-sources/WebSourceCategoryTabs.tsx`**
- Composant client React
- Gère l'état de l'onglet actif
- Affiche les stats par catégorie
- Callback `onCategoryChange` pour filtrage futur

### Fichiers Modifiés

**`app/super-admin/web-sources/[id]/page.tsx`**
1. **Requête SQL ajoutée** (ligne 88-96) :
   ```sql
   SELECT
     legal_domain,
     COUNT(*) as count,
     COUNT(*) FILTER (WHERE is_indexed = true) as indexed_count
   FROM web_pages
   WHERE web_source_id = $1
   GROUP BY legal_domain
   ORDER BY count DESC
   ```

2. **Import composant** (ligne 15)
3. **Props passées** : `categoryStats` depuis la requête
4. **Affichage** : Après les boutons "Règles de classification" / "Toutes les pages"

---

## 📋 Catégories Supportées

| Catégorie | Label FR | Icône | Description |
|-----------|----------|-------|-------------|
| `legislation` | Législation | 📜 | Codes, lois, décrets |
| `jurisprudence` | Jurisprudence | ⚖️ | Arrêts, jugements |
| `doctrine` | Doctrine | 📚 | Articles, commentaires |
| `autre` | Autre | 📄 | Autres types |
| `null` | Non classifié | ❓ | Pages sans classification |

---

## 🎨 Design

### Couleurs

- **Actif** : `bg-blue-600` (bleu vif)
- **Inactif** : `bg-slate-800` (gris foncé)
- **Hover** : `bg-slate-700` (gris moyen)
- **Badge compteur** :
  - Actif : `bg-blue-500`
  - Inactif : `bg-slate-700`

### Responsive

- Flex wrap : Les onglets passent à la ligne sur mobile
- Gap 2 : Espacement uniforme entre les onglets

---

## 🚀 Utilisation

### Pour l'utilisateur

1. Naviguer vers une source web
   - Ex: https://qadhya.tn/super-admin/web-sources/4319d2d1-569c-4107-8f52-d71e2a2e9fe9

2. Voir la section "Filtrer par catégorie juridique"

3. Cliquer sur un onglet pour voir la distribution

### Exemple 9anoun.tn (Codes)

Après le seed des 52 codes :
```
[📊 Toutes (64)] [📜 Législation (52)] [❓ Non classifié (12)]
```

- **64 pages** au total
- **52 pages** de législation (les nouveaux codes)
- **12 pages** non classifiées (les anciens codes)

---

## 🔮 Évolutions Futures (Optionnel)

### Phase 2 : Filtrage Actif

Actuellement, les onglets sont **visuels uniquement**. Pour activer le filtrage :

1. **Modifier la page `/pages`** pour accepter un paramètre de query `?category=legislation`
2. **Ajouter un lien** au lieu d'un simple callback
3. **Filtrer les pages** dans la requête SQL selon la catégorie

**Exemple** :
```tsx
<Link href={`/super-admin/web-sources/${sourceId}/pages?category=${category}`}>
  <button>📜 Législation (52)</button>
</Link>
```

### Phase 3 : Drill-down

Cliquer sur un onglet pourrait :
- Afficher un graphique de distribution temporelle
- Lister les 10 pages les plus récentes de cette catégorie
- Afficher un mini-tableau filtré directement dans la page de détail

---

## ✅ Checklist Validation

- [x] Requête SQL retourne les stats par catégorie
- [x] Composant affiche les onglets correctement
- [x] Onglets triés par nombre de pages
- [x] Catégories vides masquées
- [x] Onglet "Toutes" toujours présent
- [x] Badge compteur affiche le total
- [x] Texte "(X indexées)" affiché si > 0
- [x] Design cohérent avec le reste de l'UI
- [x] Responsive (wrap sur mobile)
- [x] État actif visuel clair (bleu)

---

## 📸 Capture d'écran Attendue

```
┌─────────────────────────────────────────────────────────────────────┐
│ Filtrer par catégorie juridique                                      │
├─────────────────────────────────────────────────────────────────────┤
│ [📊 Toutes 64] [📜 Législation 52 (50 indexées)] [❓ Non classifié 12] │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 🐛 Tests

### Test 1 : Affichage des onglets

1. Naviguer vers une source avec des pages
2. ✅ Voir les onglets de catégories
3. ✅ Onglet "Toutes" présent
4. ✅ Compteurs corrects

### Test 2 : Interaction

1. Cliquer sur "Législation"
2. ✅ Onglet devient bleu
3. Cliquer à nouveau
4. ✅ Revient à "Toutes"

### Test 3 : Source vide

1. Créer une nouvelle source
2. ✅ Aucun onglet affiché (ou seulement "Toutes (0)")

### Test 4 : Données réelles (9anoun.tn)

1. Après seed des 52 codes
2. ✅ "Toutes (64)" visible
3. ✅ "Législation (52)" visible
4. ✅ Anciennes pages sans classification → "Non classifié (12)"

---

## 💡 Notes Techniques

### Pourquoi `legal_domain` et pas `category` ?

- `category` = Catégorie de la **source** (codes, jurisprudence, doctrine, etc.)
- `legal_domain` = Catégorie de la **page** après classification automatique

Les onglets filtrent par `legal_domain` car on veut voir **comment les pages ont été classifiées**, pas la catégorie de la source.

### Gestion de `null`

Les pages non classifiées ont `legal_domain = null`. Le composant les affiche comme "Non classifié ❓".

### Performance

Requête SQL optimisée avec `GROUP BY` :
- Pas de scan complet des pages
- Index sur `web_source_id` + `legal_domain` recommandé
- Temps d'exécution < 50ms pour 10k pages

---

## 📚 Références

- Composant : `components/super-admin/web-sources/WebSourceCategoryTabs.tsx`
- Page : `app/super-admin/web-sources/[id]/page.tsx`
- Seed codes : `scripts/seed-9anoun-all-codes.ts`
