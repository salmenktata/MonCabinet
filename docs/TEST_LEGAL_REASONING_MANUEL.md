# Guide de Test Manuel - Legal Reasoning API

**Date** : 11 février 2026
**URL Production** : https://qadhya.tn/client/legal-reasoning
**API Endpoint** : `POST /api/client/legal-reasoning`

---

## ✅ Tests Automatisés Réussis

```bash
./scripts/test-legal-reasoning-api.sh

✅ Test 1 : Auth requise (401)
✅ Test 2 : Structure JSON correcte
✅ Test 3 : Validation question vide
✅ Test 4 : Validation longueur max
✅ Test 5 : Application healthy (22ms response time)
```

---

## 📋 Tests Manuels à Effectuer

### Prérequis

1. Compte utilisateur actif sur https://qadhya.tn
2. Session authentifiée
3. Accès à `/client/legal-reasoning`

### Test Case 1 : Question Simple en Droit du Travail

**Question** :
```
Un employeur peut-il licencier un salarié sans indemnité en cas de faute grave ?
```

**Paramètres** :
- Domaine : Droit du travail
- Langue : Français
- Inclure alternatives : ✅ Oui

**Résultat Attendu** :

1. **Traitement** :
   - Durée : 15-60s (selon charge serveur)
   - Indicateur de chargement visible
   - Pas d'erreur 500/timeout

2. **Arbre IRAC** :
   - Nœud racine : Question formulée
   - 3-5 règles (Rules) extraites du Code du Travail
   - Pour chaque règle :
     - Thèse (arguments pour)
     - Antithèse (arguments contre)
     - Synthèse (position équilibrée)
   - Conclusion claire

3. **Sources** :
   - 5-10 sources juridiques pertinentes
   - Catégorie "codes" majoritaire
   - Relevance > 0.6
   - Articles du Code du Travail cités (ex: Art. 14-6)

4. **Métadonnées** :
   - Processing time : 15-60s
   - Nodes generated : 8-15
   - Sources used : 5-10

**Actions à Tester** :

- [ ] Développer tous les nœuds → Arbre complet visible
- [ ] Réduire tous les nœuds → Seule la racine visible
- [ ] Cliquer sur badge source → Modal s'ouvre
- [ ] Exporter JSON → Fichier téléchargé `irac-un-employeur-peut-il-2026-02-11.json`
- [ ] Exporter PDF → Alert "Bientôt disponible" (temporairement)

**Vérifications Qualité** :

- [ ] Confiance moyenne ≥ 70%
- [ ] Aucun nœud avec confiance < 50%
- [ ] Sources pertinentes (pas de hors-sujet)
- [ ] Conclusion cohérente avec thèse/antithèse

---

### Test Case 2 : Question en Arabe (Droit Civil)

**Question** (arabe) :
```
هل يمكن فسخ عقد البيع بسبب الغلط في الثمن؟
```

**Traduction** : "Peut-on résilier un contrat de vente en raison d'une erreur sur le prix ?"

**Paramètres** :
- Domaine : Civil
- Langue : العربية (Arabe)
- Inclure alternatives : ❌ Non

**Résultat Attendu** :

1. **Arbre IRAC en Arabe** :
   - Tous les nœuds en arabe
   - Direction RTL correcte
   - Police Arabic compatible

2. **Sources** :
   - Code des Obligations et Contrats (COC)
   - Articles en arabe si disponibles
   - Fallback français OK si pas d'arabe

**Actions à Tester** :

- [ ] Arbre s'affiche correctement en RTL
- [ ] Export Markdown en arabe → Fichier lisible
- [ ] Modal sources affiche métadonnées en arabe

---

### Test Case 3 : Question Complexe (Droit de la Famille)

**Question** :
```
Dans le cadre d'une succession, les héritiers peuvent-ils exiger le partage de la masse successorale avant la fin du délai de viduité de la veuve ?
```

**Paramètres** :
- Domaine : Famille
- Langue : Français
- Inclure alternatives : ✅ Oui

**Résultat Attendu** :

1. **Détection Contradictions** :
   - Multi-chain détecte positions divergentes
   - metadata.controversialNodes ≥ 1
   - Antithèse présente avec arguments solides

2. **Profondeur Arbre** :
   - Max depth ≥ 3
   - Total nodes ≥ 10
   - Structure hiérarchique claire

3. **Durée Traitement** :
   - 30-60s (question complexe)
   - Pas de timeout

**Vérifications Spécifiques** :

- [ ] Détection contradiction effective
- [ ] Thèse vs Antithèse argumentées
- [ ] Synthèse propose résolution équilibrée
- [ ] Sources mixtes : Code Statut Personnel + Jurisprudence

---

### Test Case 4 : Question Hors Domaine (Test Négatif)

**Question** :
```
Comment réparer une voiture en panne ?
```

**Paramètres** :
- Domaine : (aucun)
- Langue : Français

**Résultat Attendu** :

1. **Erreur 404** :
   - Message : "Aucune source juridique trouvée pour cette question"
   - Pas de crash
   - Suggestion de reformuler

**Vérification** :

- [ ] Erreur affichée proprement
- [ ] Pas de génération d'arbre vide
- [ ] Bouton "Nouvelle question" fonctionne

---

### Test Case 5 : Modal Détails Sources

**Prérequis** : Avoir généré un arbre IRAC (Test Case 1)

**Actions** :

1. **Ouvrir Modal** :
   - Cliquer sur badge source (ex: [Code-1])
   - Modal s'ouvre instantanément
   - Overlay backdrop visible

2. **Vérifier Contenu** :
   - [ ] Titre source correct
   - [ ] Badge catégorie coloré (Code = bleu)
   - [ ] Score pertinence affiché (ex: 92%)
   - [ ] Barre de progression cohérente
   - [ ] Métadonnées présentes :
     - Date publication
     - Article/Référence
     - Base légale (si applicable)
   - [ ] Extrait pertinent visible (si disponible)

3. **Tester Actions** :
   - [ ] **Copier référence** :
     - Bouton cliqué
     - Toast "Référence copiée !"
     - Clipboard contient : "Code du Travail, Article X"
   - [ ] **Voir document complet** :
     - Nouvel onglet s'ouvre
     - URL : `/client/knowledge-base?doc={id}`
     - Document affiché correctement

4. **Fermer Modal** :
   - [ ] Clic sur backdrop → Modal se ferme
   - [ ] Touche ESC → Modal se ferme
   - [ ] Bouton X (si présent) → Modal se ferme

---

### Test Case 6 : Export Fonctionnalités

**Prérequis** : Avoir généré un arbre IRAC

#### Export JSON

**Actions** :
- [ ] Cliquer bouton "Exporter JSON"
- [ ] Fichier téléchargé automatiquement
- [ ] Nom fichier format : `irac-{slug}-2026-02-11.json`

**Vérifier Contenu JSON** :
```json
{
  "root": { ... },
  "metadata": {
    "question": "...",
    "language": "fr",
    "totalNodes": 12,
    "maxDepth": 3,
    "sourcesUsed": 8,
    "averageConfidence": 78
  },
  "summary": { ... },
  "exportFormats": { ... }
}
```

- [ ] JSON parsable sans erreur
- [ ] Tous les champs présents
- [ ] Arbre complet (root + children récursifs)

#### Export Markdown

**Actions** :
- [ ] Cliquer bouton "Exporter PDF" (temporairement Markdown)
- [ ] Alert affichée : "Utilisez JSON ou Markdown"
- [ ] Ou bien fichier MD téléchargé si implémenté

**Vérifier Contenu Markdown** :
```markdown
# Analyse Juridique IRAC

**Question** : ...

**Date** : 11/02/2026

## Conclusion

...

## Règles Applicables

1. Article 123...
2. Article 456...
```

- [ ] Markdown lisible en viewer
- [ ] Structure hiérarchique claire
- [ ] Règles numérotées

---

## 📊 Grille de Validation Complète

### Fonctionnalités Core

| Fonctionnalité | Status | Notes |
|----------------|--------|-------|
| Authentification | ⬜ | Erreur 401 si non connecté |
| Validation question | ⬜ | Max 1000 chars |
| Filtrage domaine | ⬜ | 7 domaines disponibles |
| Langue FR | ⬜ | Arbre en français |
| Langue AR | ⬜ | Arbre en arabe (RTL) |
| RAG sources | ⬜ | 5-10 sources pertinentes |
| Multi-chain | ⬜ | 4 chains exécutées |
| Arbre IRAC | ⬜ | Structure hiérarchique |
| Thèse/Antithèse | ⬜ | Si includeAlternatives=true |

### UI/UX

| Élément | Status | Notes |
|---------|--------|-------|
| Loading state | ⬜ | Spinner + message |
| Error handling | ⬜ | Messages clairs |
| Arbre collapsible | ⬜ | Develop/Collapse |
| Badges confiance | ⬜ | 🟢🟡🔴 selon score |
| Sources cliquables | ⬜ | Modal s'ouvre |
| Export JSON | ⬜ | Téléchargement OK |
| Export Markdown | ⬜ | Téléchargement OK |
| Responsive | ⬜ | Mobile/Desktop |

### Modal Sources

| Élément | Status | Notes |
|---------|--------|-------|
| Badge catégorie | ⬜ | Couleur correcte |
| Score pertinence | ⬜ | Barre 0-100% |
| Métadonnées | ⬜ | Tribunal, date, etc. |
| Extrait | ⬜ | Si disponible |
| Copier référence | ⬜ | Clipboard + toast |
| Voir document | ⬜ | Ouvre KB Explorer |
| Fermeture | ⬜ | ESC + backdrop |

### Performance

| Métrique | Cible | Mesuré | Status |
|----------|-------|--------|--------|
| Temps traitement | < 60s | ⬜ | ⬜ |
| Nodes générés | 8-15 | ⬜ | ⬜ |
| Sources utilisées | 5-10 | ⬜ | ⬜ |
| Confiance moyenne | ≥ 70% | ⬜ | ⬜ |
| Taille JSON export | < 500KB | ⬜ | ⬜ |

---

## 🐛 Bugs Potentiels à Surveiller

### Bugs Connus

- Aucun bug connu à ce jour

### Zones à Risque

1. **Timeout Multi-Chain** :
   - Question très complexe → Timeout > 60s
   - Mitigation : Augmenter timeout API si nécessaire

2. **Sources Insuffisantes** :
   - Domaine spécifique avec peu de docs KB
   - Erreur 404 "Aucune source trouvée"
   - Mitigation : Enrichir KB ou afficher message suggestif

3. **Arbre Trop Profond** :
   - maxDepth > 5 → Problème d'affichage UI
   - Mitigation : Limiter maxDepth côté API

4. **Export Markdown AR** :
   - Direction RTL peut causer problèmes formatting
   - Mitigation : Tester avec vraies questions AR

---

## 📝 Rapport de Test

**Testeur** : _______________
**Date** : _______________
**Environnement** : Production (https://qadhya.tn)

### Résumé

- Tests réussis : __ / 6
- Bugs trouvés : __
- Sévérité moyenne : ⬜ Bloquant ⬜ Majeur ⬜ Mineur

### Notes

```
[Ajouter observations, screenshots, logs d'erreur]
```

---

## 🚀 Prochaines Actions

### Si Tous Tests OK
- ✅ Marquer Sprint 9-10 comme validés
- ✅ Commencer Sprint 10.2 (Export PDF)
- ✅ Planifier Sprint 11 (Optimisations)

### Si Bugs Trouvés
1. Logger dans GitHub Issues
2. Prioriser selon sévérité
3. Fixer bugs bloquants avant Sprint 10.2
4. Retester après fix

---

**Auteur** : Claude Sonnet 4.5
**Version** : 1.0
**Dernière MAJ** : 11 février 2026
