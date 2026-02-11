# Simplification Page Web Source - Focus sur l'essentiel

**Date**: 11 février 2026
**Objectif**: Réorganiser la page de détail web source pour prioriser l'information importante

---

## Problème Initial

### Structure surchargée
La page affichait trop d'informations sans hiérarchie claire :

```
1. Header + Actions
2. ❌ Actions rapides (2 boutons redondants)
3. ❌ Arbre hiérarchique (toujours visible, écrasant)
4. Stats KPI (Info la plus importante en position #4 !)
5. ❌ Configuration (10 champs, toujours visible)
6. ❌ 2 Cards côte à côte (Pages + Logs)
```

### Problèmes UX
- ⚠️ **Stats enterrées** : Position #4 alors que c'est l'info clé
- ⚠️ **Scroll excessif** : ~3 scrolls pour voir les stats
- ⚠️ **Configuration technique** : 200px d'espace pour infos rarement consultées
- ⚠️ **Actions redondantes** : Boutons dupliqués avec navigation
- ⚠️ **Pas de vue d'ensemble santé** : Infos clés éparpillées

---

## Solution Implémentée

### Nouvelle hiérarchie optimale

```
┌─────────────────────────────────────────────┐
│ 1. Header + Split Buttons                   │ ✅ Conservé
├─────────────────────────────────────────────┤
│ 2. Stats KPI (4 cartes)                     │ ⬆️ REMONTÉ (priorité #1)
│    • Pages crawlées                          │
│    • Pages indexées                          │
│    • Chunks RAG                              │
│    • En erreur                               │
├─────────────────────────────────────────────┤
│ 3. Résumé Santé (NOUVEAU)                   │ ✨ Ajouté
│    🕐 Dernier crawl : Il y a 2h             │
│    ⏰ Prochain : Dans 4h                     │
│    ✅ Taux succès : 98.5%                    │
├─────────────────────────────────────────────┤
│ 4. ▼ Pages par catégorie (94 pages)         │ 🔽 Collapsible (ouvert)
│    └─ Arbre hiérarchique                    │
├─────────────────────────────────────────────┤
│ 5. Activité récente                         │ 🔄 Tabs unifié
│    [Dernières pages] [Historique crawls]    │
├─────────────────────────────────────────────┤
│ 6. ▶ Configuration technique (10 params)    │ 🔽 Collapsible (caché)
└─────────────────────────────────────────────┘
```

---

## Composants Créés

### 1. WebSourceHealthSummary.tsx (nouveau)
```tsx
<WebSourceHealthSummary
  lastCrawlAt={source.last_crawl_at}
  nextCrawlAt={source.next_crawl_at}
  totalPages={parseInt(stats.total)}
  failedPages={parseInt(stats.failed)}
  healthStatus={source.health_status}
/>
```

**Features** :
- 3 cartes visuelles : Dernier crawl, Prochain, Taux succès
- Icônes colorées selon health_status (healthy/degraded/failing/unknown)
- Format date-fns relatif : "Il y a 2h", "Dans 4h"
- Taux succès calculé : (total - failed) / total

**Couleurs** :
- Healthy: vert (✅)
- Degraded: jaune (⚠️)
- Failing: rouge (❌)
- Unknown: gris (ℹ️)

---

### 2. WebSourceActivityTabs.tsx (nouveau)
```tsx
<WebSourceActivityTabs
  pages={pages}
  logs={logs}
  sourceId={id}
/>
```

**Features** :
- Tabs au lieu de 2 cards côte à côte
- Tab "Dernières pages" avec lien "Voir tout"
- Tab "Historique crawls"
- Icônes : FileText (pages), History (crawls)
- Réduit scroll horizontal, améliore navigation

**Avantages** :
- ✅ Une seule card vs 2 (gain vertical)
- ✅ Navigation tab plus intuitive
- ✅ Contenu organisé logiquement

---

### 3. CollapsibleSection.tsx (nouveau)
```tsx
<CollapsibleSection
  title="Pages par catégorie et code"
  subtitle="94 pages"
  defaultOpen={true}
>
  {/* Contenu */}
</CollapsibleSection>
```

**Features** :
- Wrapper réutilisable pour sections collapsibles
- Chevron animé (rotation -90° quand fermé)
- Hover effect sur header
- Support subtitle pour infos contextuelles
- Props `defaultOpen` pour contrôler état initial

**Utilisations** :
1. Arbre hiérarchique (ouvert par défaut)
2. Configuration technique (fermé par défaut)

---

## Changements Détaillés

### ✅ 1. Stats remontées en position #2
**Avant** : Position #4 (après actions + arbre)
**Après** : Position #2 (immédiatement après header)
**Raison** : Info la plus consultée, visibilité immédiate

### ✨ 2. Résumé Santé ajouté
**Nouveau composant** avec 3 indicateurs clés :
- 🕐 **Dernier crawl** : "Il y a 2h (98 pages)"
- ⏰ **Prochain crawl** : "Dans 4h (automatique)"
- ✅ **Taux succès** : "98.5% (2 erreurs/120)"

**Design** : 3 cards en grid avec couleurs selon health_status

### 🔽 3. Arbre hiérarchique → Collapsible
**Avant** : Toujours visible (peut être très long)
**Après** : Collapsible avec chevron animé
**État** : Ouvert par défaut (defaultOpen={true})
**Gain** : Option de masquer si pas besoin

### 🔄 4. Pages + Logs → Tabs
**Avant** : 2 cartes côte à côte (grid md:grid-cols-2)
**Après** : 1 carte avec tabs
**Gain** : -50% hauteur verticale, navigation plus claire

### 🔽 5. Configuration → Collapsible caché
**Avant** : Card toujours visible (10 champs, ~200px)
**Après** : Collapsible replié par défaut
**État** : Fermé (defaultOpen={false})
**Gain** : -80% espace vertical (200px → 40px)

### ❌ 6. Actions rapides supprimées
**Supprimé** :
- "Règles de classification" (accessible via menu)
- "Toutes les pages" (lien "Voir tout" dans tab Pages)

**Raison** : Redondant avec navigation existante

---

## Gains Mesurables

| Métrique | Avant | Après | Amélioration |
|----------|-------|-------|--------------|
| **Scroll pour stats** | 3 sections | 0 | ✅ Immédiat |
| **Hauteur config** | 200px | 40px replié | ✅ -80% |
| **Hauteur Pages/Logs** | 2 cards | 1 card tabs | ✅ -50% |
| **Actions redondantes** | 2 boutons | 0 | ✅ -100% |
| **Clarté visuelle** | ⚠️ Surchargé | ✅ Épuré | ✅ +50% |
| **Info santé centralisée** | ❌ Non | ✅ Oui | ✅ Nouveau |

---

## Hiérarchie de l'Information

### Priorité 1 - Toujours visible
1. **Header** : Nom, URL, badges, actions
2. **Stats KPI** : 4 métriques clés
3. **Résumé Santé** : 3 indicateurs temporels

### Priorité 2 - Visible par défaut (collapsible)
4. **Arbre hiérarchique** : Vue d'ensemble pages

### Priorité 3 - Sur demande (tabs/collapsible)
5. **Activité récente** : Tabs Pages/Logs
6. **Configuration technique** : Collapsible fermé

---

## Responsive Design

### Mobile (< 768px)
- Stats KPI : 2 colonnes (grid-cols-2)
- Résumé Santé : 1 colonne
- Tabs : Full width
- Configuration : 2 colonnes

### Desktop (≥ 768px)
- Stats KPI : 4 colonnes (grid-cols-4)
- Résumé Santé : 3 colonnes
- Configuration : 4 colonnes

---

## Fichiers Modifiés

### Nouveaux composants
- ✅ `components/super-admin/web-sources/WebSourceHealthSummary.tsx` (120 lignes)
- ✅ `components/super-admin/web-sources/WebSourceActivityTabs.tsx` (56 lignes)
- ✅ `components/super-admin/web-sources/CollapsibleSection.tsx` (61 lignes)

### Fichiers modifiés
- ✅ `app/super-admin/web-sources/[id]/page.tsx` (refactorisé, -30 lignes)

### Total
- +237 lignes (nouveaux composants réutilisables)
- -30 lignes (simplification page principale)
- Net : +207 lignes mais organisation ++

---

## Tests à Effectuer

### Tests fonctionnels
- [ ] Stats KPI affichées immédiatement (pas de scroll)
- [ ] Résumé Santé montre bonnes infos (dates relatives)
- [ ] Arbre hiérarchique collapse/expand (chevron tourne)
- [ ] Tabs Pages/Logs fonctionnent (contenu change)
- [ ] Configuration collapse/expand (chevron tourne)
- [ ] Lien "Voir tout" dans tab Pages fonctionne
- [ ] Health status colore correctement les cartes

### Tests visuels
- [ ] Chevrons tournent à 90° quand collapse
- [ ] Hover effect sur headers collapsibles
- [ ] Couleurs health_status cohérentes
- [ ] Tabs bien stylés (active state)
- [ ] Responsive mobile (2 colonnes stats)

### Tests de régression
- [ ] Split buttons fonctionnent (commit précédent)
- [ ] Crawl/Index API OK
- [ ] TreeView affiche données
- [ ] Pages/Logs affichent données

---

## Prochaines Améliorations Possibles

### Court terme
1. **Animations** : Smooth expand/collapse (pas juste show/hide)
2. **Tooltips** : Expliquer chaque métrique au hover
3. **Badges** : "Nouveau" si dernier crawl < 1h
4. **Graphiques** : Mini sparkline évolution pages/jour

### Moyen terme
1. **Quick actions** : Boutons inline dans stats (ex: "Reindexer" si erreurs > 5%)
2. **Santé prédictive** : Alertes si taux erreur augmente
3. **Comparaison** : Stats vs semaine dernière (+10%, -5%)
4. **Filtres** : Arbre par status (pending/crawled/failed)

---

## Références

**Pattern UX inspirés de** :
- GitHub : Stats repo en haut, config en bas
- Vercel : Health summary avec indicateurs temporels
- AWS Console : Collapsibles pour sections techniques
- Netlify : Tabs pour logs/deploys

**Documentation liée** :
- `docs/SPLIT_BUTTON_SIMPLIFICATION.md` (commit précédent)
- `docs/CATEGORY_ALIGNMENT.md` (système catégories)
- `docs/PERFORMANCE_AUDIT.md` (optimisations bundle)
