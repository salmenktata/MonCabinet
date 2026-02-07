# Guide de Contribution - Qadhya

## 🤝 Bienvenue

Merci de votre intérêt pour contribuer à Qadhya ! Ce guide vous aidera à démarrer.

## 📋 Table des Matières

- [Code de Conduite](#code-de-conduite)
- [Comment Contribuer](#comment-contribuer)
- [Standards de Code](#standards-de-code)
- [Processus de Pull Request](#processus-de-pull-request)
- [Conventions de Commit](#conventions-de-commit)
- [Structure du Projet](#structure-du-projet)

## 📜 Code de Conduite

### Nos Engagements

- Respect mutuel et bienveillance
- Ouverture aux idées différentes
- Focus sur ce qui est meilleur pour la communauté
- Empathie envers les autres contributeurs

### Comportements Inacceptables

- Langage ou images sexualisés
- Trolling, insultes ou commentaires désobligeants
- Harcèlement public ou privé
- Partage d'informations privées sans permission

## 🛠️ Comment Contribuer

### Rapporter un Bug

1. Vérifier que le bug n'a pas déjà été rapporté dans les [Issues](https://github.com/votre-org/avocat/issues)
2. Créer une nouvelle issue avec le template "Bug Report"
3. Inclure :
   - Description claire du problème
   - Étapes pour reproduire
   - Comportement attendu vs réel
   - Screenshots si applicable
   - Environnement (OS, navigateur, version)

### Suggérer une Fonctionnalité

1. Vérifier que la suggestion n'existe pas déjà
2. Créer une issue avec le template "Feature Request"
3. Décrire :
   - Le problème que ça résout
   - La solution proposée
   - Les alternatives considérées
   - L'impact sur les utilisateurs

### Contribuer du Code

1. **Fork** le repository
2. **Clone** votre fork localement
3. **Créer une branche** pour votre feature/fix
4. **Développer** en suivant les standards
5. **Tester** vos changements
6. **Commit** avec des messages clairs
7. **Push** vers votre fork
8. **Créer une Pull Request**

## 🎨 Standards de Code

### TypeScript

#### Style Général

```typescript
// ✅ BON
export function calculateDeadline(startDate: Date, days: number): Date {
  const result = new Date(startDate)
  result.setDate(result.getDate() + days)
  return result
}

// ❌ MAUVAIS
export function calc(d: any, n: any) {
  let r = new Date(d)
  r.setDate(r.getDate() + n)
  return r
}
```

#### Règles

- **Nommage** :
  - Variables/fonctions : `camelCase`
  - Types/Interfaces : `PascalCase`
  - Constantes : `UPPER_SNAKE_CASE`
  - Fichiers : `kebab-case.tsx`

- **Types** :
  - Toujours typer les paramètres de fonction
  - Toujours typer les retours de fonction
  - Éviter `any`, préférer `unknown` si nécessaire
  - Utiliser types génériques quand applicable

- **Imports** :
  ```typescript
  // 1. External libraries
  import { useState } from 'react'
  import { z } from 'zod'

  // 2. Internal absolute imports
  import { Button } from '@/components/ui/button'
  import { cn } from '@/lib/utils'

  // 3. Relative imports
  import { ClientForm } from './client-form'
  ```

### React Components

#### Server Components (par défaut)

```typescript
// app/(dashboard)/dossiers/page.tsx
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'

export default async function DossiersPage() {
  const supabase = createServerComponentClient({ cookies })

  const { data: dossiers } = await supabase
    .from('dossiers')
    .select('*')

  return (
    <div>
      <h1>Mes Dossiers</h1>
      <DossiersList dossiers={dossiers} />
    </div>
  )
}
```

#### Client Components

```typescript
'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'

interface ClientFormProps {
  onSubmit: (data: ClientFormData) => Promise<void>
}

export function ClientForm({ onSubmit }: ClientFormProps) {
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    try {
      await onSubmit(data)
    } finally {
      setLoading(false)
    }
  }

  return <form onSubmit={handleSubmit}>...</form>
}
```

#### Règles Composants

- **Un composant par fichier** (sauf composants très petits)
- **Props typées** avec interface dédiée
- **Déstructuration props** dans signature
- **Handlers nommés** : `handleClick`, `handleSubmit`
- **Use hooks en haut** de la fonction
- **Return early** pour conditions

### CSS / TailwindCSS

```typescript
// ✅ BON - Utiliser cn() pour conditions
import { cn } from '@/lib/utils'

<Button
  className={cn(
    'bg-primary text-white',
    isLoading && 'opacity-50 cursor-not-allowed',
    variant === 'outline' && 'border border-primary bg-transparent'
  )}
>
  Submit
</Button>

// ❌ MAUVAIS - String templates complexes
<Button
  className={`bg-primary ${isLoading ? 'opacity-50' : ''} ${variant === 'outline' ? 'border' : ''}`}
>
```

### Validation avec Zod

```typescript
// lib/validations/client.ts
import { z } from 'zod'

export const clientSchema = z.object({
  nom: z.string().min(2, 'Nom requis (min 2 caractères)'),
  prenom: z.string().optional(),
  cin: z.string().regex(/^\d{8}$/, 'CIN invalide (8 chiffres)'),
  telephone: z.string().regex(/^[0-9]{8}$/, 'Téléphone invalide'),
  email: z.string().email('Email invalide').optional(),
})

export type ClientFormData = z.infer<typeof clientSchema>
```

### Database Queries

```typescript
// ✅ BON - Select uniquement les champs nécessaires
const { data } = await supabase
  .from('dossiers')
  .select('id, numero_dossier, client:clients(nom, prenom)')
  .eq('statut', 'actif')

// ❌ MAUVAIS - Select *
const { data } = await supabase
  .from('dossiers')
  .select('*')
```

## 🔄 Processus de Pull Request

### Checklist Avant PR

- [ ] Code suit les standards ci-dessus
- [ ] Types TypeScript corrects (pas d'erreurs)
- [ ] Tests ajoutés/mis à jour (si applicable)
- [ ] Documentation mise à jour (si nouvelle feature)
- [ ] Pas de console.log oubliés
- [ ] Branch à jour avec `main`

### Template PR

```markdown
## Description
[Décrire les changements]

## Type de Changement
- [ ] Bug fix
- [ ] Nouvelle fonctionnalité
- [ ] Breaking change
- [ ] Documentation

## Comment Tester
1. [Étape 1]
2. [Étape 2]

## Screenshots
[Si applicable]

## Checklist
- [ ] Code testé localement
- [ ] Documentation mise à jour
- [ ] Types TypeScript valides
```

### Processus de Review

1. **Création PR** : Description claire + screenshots
2. **Review automatique** : CI/CD checks
3. **Review manuelle** : 1+ reviewers
4. **Modifications** : Si demandées
5. **Approbation** : Par mainteneur
6. **Merge** : Squash & merge (historique propre)

## 📝 Conventions de Commit

### Format

```
<type>(<scope>): <sujet>

<corps optionnel>

<footer optionnel>
```

### Types

- `feat`: Nouvelle fonctionnalité
- `fix`: Correction de bug
- `docs`: Documentation uniquement
- `style`: Formatage (pas de changement de code)
- `refactor`: Refactoring (pas de bug fix ni feature)
- `perf`: Amélioration de performance
- `test`: Ajout/modification de tests
- `chore`: Maintenance (build, config, etc.)

### Exemples

```bash
feat(dossiers): ajouter filtrage par statut

Permet de filtrer les dossiers par statut (actif, clôturé)
dans la liste des dossiers.

Closes #123
```

```bash
fix(factures): corriger calcul TVA

Le calcul de la TVA était incorrect pour les montants
avec décimales. Fix utilise toFixed(2).

Fixes #456
```

```bash
docs(readme): ajouter instructions de déploiement
```

### Règles

- **Sujet** :
  - Impératif présent ("ajouter" pas "ajouté")
  - Pas de majuscule au début
  - Pas de point final
  - Max 50 caractères

- **Corps** :
  - Saut de ligne après sujet
  - Expliquer POURQUOI, pas QUOI
  - Max 72 caractères par ligne

- **Footer** :
  - Référencer issues : `Closes #123`, `Fixes #456`
  - Breaking changes : `BREAKING CHANGE: description`

## 🏗️ Structure du Projet

### Organisation des Fichiers

```
app/
├── (auth)/              # Routes authentification
│   ├── login/
│   └── register/
├── (dashboard)/         # Routes dashboard (protégées)
│   ├── clients/
│   ├── dossiers/
│   └── factures/
└── api/                 # API routes (si besoin)

components/
├── ui/                  # shadcn components (ne pas modifier)
├── clients/             # Feature: Clients
├── dossiers/            # Feature: Dossiers
└── shared/              # Composants partagés

lib/
├── supabase/            # Client Supabase
├── utils/               # Fonctions utilitaires
├── validations/         # Schémas Zod
└── hooks/               # Custom hooks

types/
└── database.types.ts    # Types générés par Supabase
```

### Créer une Nouvelle Feature

1. **Créer dossier feature**
   ```
   components/nom-feature/
   ├── feature-list.tsx
   ├── feature-form.tsx
   ├── feature-card.tsx
   └── index.ts
   ```

2. **Créer validation**
   ```typescript
   // lib/validations/nom-feature.ts
   export const featureSchema = z.object({...})
   ```

3. **Créer route**
   ```
   app/(dashboard)/nom-feature/
   ├── page.tsx
   └── [id]/
       └── page.tsx
   ```

4. **Ajouter migration BDD** (si nécessaire)
   ```sql
   -- supabase/migrations/YYYYMMDDHHMMSS_add_feature.sql
   CREATE TABLE nom_feature (...);
   ```

## 🧪 Tests (V1.5)

### Écrire un Test

```typescript
// __tests__/lib/utils/calcul-delais.test.ts
import { describe, it, expect } from 'vitest'
import { calculerDelai } from '@/lib/utils/calcul-delais'

describe('calculerDelai', () => {
  it('calcule correctement un délai simple', () => {
    const start = new Date('2025-01-01')
    const result = calculerDelai(start, 10)
    expect(result).toEqual(new Date('2025-01-11'))
  })

  it('exclut les week-ends', () => {
    const start = new Date('2025-01-03') // Vendredi
    const result = calculerDelai(start, 3, { excludeWeekends: true })
    expect(result).toEqual(new Date('2025-01-08')) // Mercredi
  })
})
```

### Lancer les Tests

```bash
npm run test          # Tous les tests
npm run test:watch    # Mode watch
npm run test:coverage # Couverture
```

## 🐛 Debugging

### Logs

```typescript
// ✅ BON - Logs structurés (retirer avant commit)
console.log('Fetching dossiers', { userId, status })

// ❌ MAUVAIS - Logs cryptiques
console.log('test', data)
```

### DevTools

- **React DevTools** : Inspecter composants
- **Supabase Dashboard** : Vérifier données/RLS
- **Network tab** : Débugger requêtes

## 📚 Ressources

### Documentation Officielle

- [Next.js Docs](https://nextjs.org/docs)
- [React Docs](https://react.dev)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)
- [Supabase Docs](https://supabase.com/docs)
- [TailwindCSS Docs](https://tailwindcss.com/docs)

### Guides Internes

- [README.md](./README.md) - Vue d'ensemble
- [ARCHITECTURE.md](./ARCHITECTURE.md) - Architecture technique
- [WORKFLOWS_TUNISIE.md](./WORKFLOWS_TUNISIE.md) - Workflows juridiques

## ❓ Questions

### Où Demander de l'Aide ?

- **Bugs/Features** : [GitHub Issues](https://github.com/votre-org/avocat/issues)
- **Questions générales** : [Discussions](https://github.com/votre-org/avocat/discussions)
- **Contact direct** : dev@qadhya.tn

### FAQ

**Q : Puis-je utiliser une autre librairie ?**
A : Demander d'abord dans une issue pour discuter de la pertinence.

**Q : Combien de temps pour qu'une PR soit reviewée ?**
A : Généralement 48-72h en semaine.

**Q : Puis-je travailler sur plusieurs features en parallèle ?**
A : Oui, mais une PR par feature pour faciliter la review.

## 🎉 Remerciements

Merci à tous les contributeurs qui rendent ce projet possible !

### Contributeurs Actuels

<!-- Liste générée automatiquement -->

### Comment être Listé

Contribuez avec au moins 1 PR mergée et vous serez ajouté automatiquement.

---

**Dernière mise à jour** : 2026-02-04

Bon code ! 🚀
