# Guide Multilingue - MonCabinet

## 🌍 Langues Supportées

L'application supporte actuellement :
- **Français (FR)** - Langue par défaut
- **Arabe (AR)** - Support RTL complet

## 📚 Architecture

### Fichiers de Traduction

Les traductions sont stockées dans `/messages/` :
- `fr.json` - Traductions françaises
- `ar.json` - Traductions arabes

### Configuration

- `i18n.config.ts` - Configuration des locales
- `lib/i18n/request.ts` - Configuration next-intl
- `lib/i18n/locale.ts` - Gestion des cookies de locale

## 🔧 Utilisation dans les Composants

### Composants Client

```tsx
'use client'

import { useTranslations } from 'next-intl'

export default function MyComponent() {
  const t = useTranslations('common')

  return (
    <div>
      <h1>{t('appName')}</h1>
      <button>{t('save')}</button>
    </div>
  )
}
```

### Composants Serveur

```tsx
import { getTranslations } from 'next-intl/server'

export default async function MyPage() {
  const t = await getTranslations('dashboard')

  return (
    <div>
      <h1>{t('title')}</h1>
      <p>{t('welcome')}</p>
    </div>
  )
}
```

### Variables dans les Traductions

```json
{
  "echeances": {
    "daysRemaining": "{count} jours restants"
  }
}
```

```tsx
const t = useTranslations('echeances')
// Utilisation
t('daysRemaining', { count: 5 }) // "5 jours restants"
```

## 🎨 Support RTL

### Détection Automatique

Le layout racine détecte automatiquement la langue et applique `dir="rtl"` pour l'arabe :

```tsx
<html lang={locale} dir={locale === 'ar' ? 'rtl' : 'ltr'}>
```

### Classes CSS RTL

Des classes utilitaires sont disponibles dans `globals.css` :

```css
[dir="rtl"] .text-left {
  text-align: right;
}
```

### Tailwind RTL

Utilisez les classes logiques de Tailwind pour un meilleur support RTL :

```tsx
// ❌ Éviter
className="ml-4 mr-2"

// ✅ Préférer
className="ms-4 me-2"  // ms = margin-start, me = margin-end
```

## 🔄 Changement de Langue

### Composant LanguageSwitcher

Le composant `LanguageSwitcher` permet de changer de langue :

```tsx
import LanguageSwitcher from '@/components/ui/LanguageSwitcher'

<LanguageSwitcher />
```

### Programmatique

```tsx
import { setUserLocale } from '@/lib/i18n/locale'

// Changer la langue
await setUserLocale('ar')
```

## 📝 Ajouter de Nouvelles Traductions

### 1. Ajouter au fichier FR

`messages/fr.json` :
```json
{
  "mySection": {
    "title": "Mon Titre",
    "description": "Ma description"
  }
}
```

### 2. Ajouter la Traduction AR

`messages/ar.json` :
```json
{
  "mySection": {
    "title": "عنواني",
    "description": "وصفي"
  }
}
```

### 3. Utiliser dans le Code

```tsx
const t = useTranslations('mySection')
<h1>{t('title')}</h1>
```

## 🎯 Namespaces Disponibles

| Namespace | Description |
|-----------|-------------|
| `common` | Textes communs (boutons, actions) |
| `nav` | Navigation |
| `auth` | Authentification |
| `dashboard` | Tableau de bord |
| `clients` | Gestion clients |
| `dossiers` | Gestion dossiers |
| `factures` | Facturation |
| `echeances` | Échéances |
| `timeTracking` | Suivi du temps |
| `documents` | Documents |
| `templates` | Templates |
| `home` | Page d'accueil |

## 🌐 Bonnes Pratiques

### 1. Organiser par Namespace

Groupez les traductions logiquement :
```json
{
  "clients": {
    "title": "Clients",
    "newClient": "Nouveau client",
    "form": {
      "name": "Nom",
      "email": "Email"
    }
  }
}
```

### 2. Utiliser des Clés Descriptives

```json
// ❌ Éviter
{ "btn1": "Enregistrer" }

// ✅ Préférer
{ "saveButton": "Enregistrer" }
```

### 3. Textes Pluriels

```json
{
  "itemCount": "{count, plural, =0 {Aucun élément} =1 {1 élément} other {# éléments}}"
}
```

### 4. Support RTL dans Tailwind

Utilisez les classes logiques :
- `ms-*` au lieu de `ml-*`
- `me-*` au lieu de `mr-*`
- `ps-*` au lieu de `pl-*`
- `pe-*` au lieu de `pr-*`

## 🔍 Debugging

### Vérifier la Locale Actuelle

```tsx
import { useLocale } from 'next-intl'

const locale = useLocale()
console.log('Current locale:', locale)
```

### Afficher toutes les Traductions

```tsx
const t = useTranslations()
console.log(t.raw(''))
```

## 📱 Responsive & RTL

Le layout s'adapte automatiquement à la direction du texte :

```tsx
<div className="flex gap-4">
  {/* En FR: éléments alignés à gauche */}
  {/* En AR: éléments alignés à droite */}
</div>
```

## 🚀 Ajout d'une Nouvelle Langue

Pour ajouter une nouvelle langue (ex: anglais) :

### 1. Mettre à jour la config

`i18n.config.ts` :
```tsx
export const locales = ['fr', 'ar', 'en'] as const

export const localeNames: Record<Locale, string> = {
  fr: 'Français',
  ar: 'العربية',
  en: 'English',
}
```

### 2. Créer le fichier de messages

Créer `messages/en.json` avec toutes les traductions.

### 3. C'est tout !

Le système détectera automatiquement la nouvelle langue.

## ⚠️ Notes Importantes

- Les traductions sont chargées côté serveur pour de meilleures performances
- Le choix de langue est stocké dans un cookie (`NEXT_LOCALE`)
- La durée de vie du cookie est de 1 an
- Le support RTL est automatique pour l'arabe
- Utilisez toujours `useTranslations` plutôt que des chaînes hardcodées

---

**Date de mise à jour :** 2026-02-05
**Version :** 1.0
