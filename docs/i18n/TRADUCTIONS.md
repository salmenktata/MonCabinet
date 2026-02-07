# Guide de gestion des traductions (FR/AR)

## 📚 Vue d'ensemble

L'application MonCabinet est entièrement bilingue (Français/Arabe). Ce document explique comment ajouter et maintenir les traductions.

## 🎯 Principes fondamentaux

### 1. Aucun texte en dur
❌ **JAMAIS faire :**
```tsx
<button>Enregistrer</button>
<p>Aucun résultat trouvé</p>
```

✅ **TOUJOURS faire :**
```tsx
const t = useTranslations('namespace')
<button>{t('save')}</button>
<p>{t('noResults')}</p>
```

### 2. Synchronisation FR/AR obligatoire
Chaque clé française DOIT avoir sa traduction arabe correspondante.

### 3. Traductions naturelles et contextuelles
Les traductions arabes doivent être naturelles, pas littérales. Adapter au contexte juridique tunisien.

---

## 📁 Structure des fichiers

```
messages/
├── fr.json  (517 lignes)
└── ar.json  (517 lignes)
```

### Namespaces disponibles

| Namespace | Usage | Exemples |
|-----------|-------|----------|
| `common` | Textes communs réutilisables | appName, logout, save, cancel |
| `nav` | Navigation | dashboard, clients, dossiers |
| `auth` | Authentification | loginTitle, email, password |
| `forms` | Formulaires | labels, placeholders, options, buttons |
| `cards` | Composants de cartes | viewDetails, confirmDelete |
| `actions` | Actions dossiers | addAction, types, priorities |
| `documents` | Gestion documents | upload, categories |
| `errors` | Messages d'erreur | generic, saveFailed |
| `messages` | Confirmations/Alertes | confirmDelete, saveSuccess |
| `ui` | Composants UI génériques | noResults, retry |

---

## ✅ Processus d'ajout de nouvelles traductions

### Étape 1 : Identifier le namespace approprié

```tsx
// Composant de formulaire → namespace 'forms'
const t = useTranslations('forms')

// Composant de carte → namespace 'cards'
const t = useTranslations('cards')

// Message d'erreur → namespace 'errors'
const tErrors = useTranslations('errors')
```

### Étape 2 : Ajouter la clé en français (messages/fr.json)

```json
{
  "forms": {
    "labels": {
      "nouveauChamp": "Nouveau champ"
    }
  }
}
```

### Étape 3 : Ajouter la traduction arabe (messages/ar.json)

```json
{
  "forms": {
    "labels": {
      "nouveauChamp": "حقل جديد"
    }
  }
}
```

⚠️ **CRITIQUE** : Ne jamais commit sans ajouter la traduction arabe !

### Étape 4 : Utiliser dans le composant

```tsx
'use client'
import { useTranslations } from 'next-intl'

export default function MonComposant() {
  const t = useTranslations('forms')

  return (
    <label>{t('labels.nouveauChamp')}</label>
  )
}
```

---

## 🔍 Validation automatique

### Script de vérification

Exécuter avant chaque commit :

```bash
npm run check:translations
```

Ce script vérifie :
- ✅ Toutes les clés FR ont leur équivalent AR
- ✅ Pas de textes en dur dans les composants
- ✅ Cohérence de la structure JSON

---

## 🌍 Bonnes pratiques de traduction arabe

### 1. Contexte juridique tunisien

| Terme | ❌ Traduction littérale | ✅ Traduction contextuelle |
|-------|------------------------|---------------------------|
| Dossier | مجلد | ملف (terme juridique tunisien) |
| Avocat | محامي | محامي (correct) |
| Tribunal | محكمة | محكمة (correct) |
| Échéance | الموعد النهائي | الموعد / المهلة |
| Facture | فاتورة | فاتورة (correct) |

### 2. Formalité appropriée

Utiliser un ton professionnel :
- ✅ "يرجى إدخال" (Veuillez entrer)
- ❌ "أدخل" (Entrez - trop direct)

### 3. Longueur du texte

L'arabe peut être plus long que le français. Tester l'UI en arabe pour vérifier :
- Pas de débordement de texte
- Boutons pas trop larges
- Labels lisibles

### 4. RTL (Right-to-Left)

L'application gère automatiquement le RTL via Tailwind CSS.

---

## 🧪 Tests de traduction

### Test 1 : Vérifier la synchronisation

```bash
node scripts/check-translations.js
```

### Test 2 : Rechercher les textes en dur

```bash
# Rechercher les textes français non traduits
grep -r "className.*>.*[A-Za-zÀ-ÿ]" components/ --include="*.tsx" --exclude-dir=node_modules
```

### Test 3 : Test visuel

1. Ouvrir http://localhost:7002
2. Cliquer sur le sélecteur de langue (FR/AR)
3. Vérifier chaque page en arabe
4. S'assurer qu'aucun texte français ne reste

---

## 🚨 Erreurs courantes à éviter

### ❌ Erreur 1 : Clé manquante en arabe

```json
// fr.json
{
  "forms": {
    "newField": "Nouveau champ"
  }
}

// ar.json
{
  "forms": {
    // ❌ Clé manquante !
  }
}
```

**Résultat** : `MISSING_MESSAGE` error dans la console

### ❌ Erreur 2 : Texte en dur

```tsx
// ❌ MAUVAIS
<button>Enregistrer</button>

// ✅ BON
<button>{t('buttons.save')}</button>
```

### ❌ Erreur 3 : Mauvais namespace

```tsx
// ❌ MAUVAIS - namespace trop spécifique
const t = useTranslations('clientFormLabelsSection')

// ✅ BON - namespace réutilisable
const t = useTranslations('forms')
```

### ❌ Erreur 4 : Traduction trop littérale

```json
// ❌ Traduction littérale
"createNewFile": "خلق ملف جديد" (littéral = "créer")

// ✅ Traduction naturelle
"createNewFile": "إنشاء ملف جديد" (naturel = "établir/créer")
```

---

## 📋 Checklist avant commit

Avant chaque commit contenant des modifications de texte :

- [ ] Tous les textes utilisent `t('key')` (pas de texte en dur)
- [ ] Toutes les clés FR ont leur équivalent AR
- [ ] Les traductions arabes sont naturelles et contextuelles
- [ ] Le script `npm run check:translations` passe ✅
- [ ] Testé visuellement en français ET en arabe
- [ ] Pas de débordement UI en arabe (RTL)
- [ ] Les messages d'erreur sont clairs dans les 2 langues

---

## 🔧 Outils et commandes

### Vérifier la synchronisation des traductions
```bash
npm run check:translations
```

### Trouver les textes non traduits
```bash
npm run find:hardcoded-text
```

### Compter les clés de traduction
```bash
npm run count:translations
```

### Formater les fichiers JSON
```bash
npm run format:translations
```

---

## 🆘 Ressources

### Dictionnaire juridique FR-AR
- [Dictionnaire juridique tunisien](https://www.legifrance.gouv.tn)
- Termes juridiques tunisiens officiels

### Outils de traduction
- **Google Translate** : Première ébauche (à réviser)
- **DeepL** : Meilleure qualité (réviser quand même)
- **Révision humaine** : TOUJOURS nécessaire pour le juridique

### Aide
- En cas de doute sur une traduction → consulter un avocat arabophone
- Pour les termes techniques → utiliser les termes du Code tunisien

---

## 📞 Contact

Pour toute question sur les traductions :
- Créer une issue GitHub avec le label `traduction`
- Demander une revue des traductions arabes avant de merger

---

## 🔄 Maintenance continue

### Revue mensuelle
- Vérifier la cohérence des traductions
- Mettre à jour les traductions obsolètes
- Ajouter les nouveaux termes juridiques

### Feedback utilisateur
- Collecter les retours des utilisateurs arabophones
- Corriger les traductions problématiques
- Améliorer les formulations

---

**Dernière mise à jour** : 2026-02-05
**Version** : 1.0
**Statut** : ✅ Application 100% traduite (517 lignes FR/AR)
