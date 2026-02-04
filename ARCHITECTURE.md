# Architecture Technique - Avocat SaaS

## 🏗️ Vue d'Ensemble

Avocat est construit avec une architecture moderne basée sur Next.js 14 et Supabase, privilégiant la simplicité, la maintenabilité et la scalabilité.

## 📐 Principes Architecturaux

### 1. Feature-Based Organization
Les fichiers sont organisés par fonctionnalité plutôt que par type technique.

```
app/
├── (dashboard)/
│   ├── clients/
│   ├── dossiers/
│   └── factures/
```

### 2. Server Components par Défaut
Utilisation maximale des Server Components Next.js 14 pour :
- Meilleure performance
- Moins de JavaScript côté client
- Fetch de données côté serveur

### 3. Type Safety
TypeScript strict avec Zod pour la validation runtime.

## 🔧 Stack Détaillée

### Frontend

#### Next.js 14 (App Router)
- **Server Components** : Rendu côté serveur par défaut
- **Server Actions** : Mutations de données sans API routes
- **Streaming** : Chargement progressif avec Suspense
- **Route Handlers** : API endpoints si nécessaire

#### Styling
- **TailwindCSS** : Utility-first CSS
- **shadcn/ui** : Composants accessibles et personnalisables
- **CVA (Class Variance Authority)** : Variants de composants
- **tailwind-merge** : Fusion intelligente de classes

#### State Management
- **Zustand** : État global léger
- **React Hook Form** : Gestion de formulaires
- **TanStack Query** : Cache et synchronisation données (si besoin)

#### Validation
- **Zod** : Schémas de validation TypeScript-first
- Schémas partagés frontend/backend

### Backend

#### Supabase
- **PostgreSQL** : Base de données relationnelle
- **Row-Level Security (RLS)** : Sécurité au niveau base de données
- **Storage** : Stockage de fichiers (documents)
- **Auth** : Authentification clé-en-main
- **Edge Functions** : Serverless functions si besoin

#### Avantages Supabase
- Réduction temps de développement (30%)
- Auth, BDD, Storage intégrés
- RLS natif (sécurité par défaut)
- Interface d'administration
- Migration future possible

## 🗄️ Modèle de Données

### Schéma Relationnel

```sql
-- Utilisateurs (géré par Supabase Auth)
users (
  id uuid PRIMARY KEY,
  email text UNIQUE,
  created_at timestamp
)

-- Clients
clients (
  id uuid PRIMARY KEY,
  user_id uuid REFERENCES users,
  nom text NOT NULL,
  prenom text,
  cin text,
  telephone text,
  email text,
  adresse text,
  created_at timestamp,
  updated_at timestamp
)

-- Dossiers
dossiers (
  id uuid PRIMARY KEY,
  user_id uuid REFERENCES users,
  client_id uuid REFERENCES clients,
  numero_dossier text UNIQUE NOT NULL,
  type_procedure text NOT NULL, -- 'civil' pour MVP
  objet text NOT NULL,
  tribunal text,
  statut text NOT NULL, -- 'actif', 'cloture'
  date_ouverture date,
  date_cloture date,
  created_at timestamp,
  updated_at timestamp
)

-- Actions/Tâches
actions (
  id uuid PRIMARY KEY,
  dossier_id uuid REFERENCES dossiers,
  titre text NOT NULL,
  description text,
  statut text NOT NULL, -- 'en_attente', 'en_cours', 'terminee'
  date_echeance date,
  completed_at timestamp,
  created_at timestamp,
  updated_at timestamp
)

-- Échéances
echeances (
  id uuid PRIMARY KEY,
  dossier_id uuid REFERENCES dossiers,
  type_echeance text NOT NULL, -- 'audience', 'delai_legal', 'autre'
  titre text NOT NULL,
  date_echeance date NOT NULL,
  rappel_j7 boolean DEFAULT true,
  rappel_j3 boolean DEFAULT true,
  rappel_j1 boolean DEFAULT true,
  notes text,
  created_at timestamp,
  updated_at timestamp
)

-- Documents
documents (
  id uuid PRIMARY KEY,
  dossier_id uuid REFERENCES dossiers,
  nom_fichier text NOT NULL,
  type_fichier text,
  taille_fichier integer,
  storage_path text NOT NULL, -- Chemin dans Supabase Storage
  uploaded_by uuid REFERENCES users,
  created_at timestamp
)

-- Factures
factures (
  id uuid PRIMARY KEY,
  user_id uuid REFERENCES users,
  dossier_id uuid REFERENCES dossiers,
  numero_facture text UNIQUE NOT NULL,
  montant_ht decimal(10,2) NOT NULL,
  montant_tva decimal(10,2),
  montant_ttc decimal(10,2) NOT NULL,
  date_emission date NOT NULL,
  date_echeance date,
  statut text NOT NULL, -- 'impayee', 'payee', 'annulee'
  date_paiement date,
  notes text,
  created_at timestamp,
  updated_at timestamp
)
```

### Indexes Recommandés

```sql
-- Performance queries
CREATE INDEX idx_dossiers_user_id ON dossiers(user_id);
CREATE INDEX idx_dossiers_client_id ON dossiers(client_id);
CREATE INDEX idx_dossiers_statut ON dossiers(statut);
CREATE INDEX idx_actions_dossier_id ON actions(dossier_id);
CREATE INDEX idx_actions_date_echeance ON actions(date_echeance);
CREATE INDEX idx_echeances_date ON echeances(date_echeance);
CREATE INDEX idx_documents_dossier_id ON documents(dossier_id);
CREATE INDEX idx_factures_user_id ON factures(user_id);
CREATE INDEX idx_factures_statut ON factures(statut);
```

## 🔐 Sécurité

### Row-Level Security (RLS)

Chaque table a des politiques RLS pour garantir l'isolation des données :

```sql
-- Exemple : Clients
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own clients"
  ON clients FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own clients"
  ON clients FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own clients"
  ON clients FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own clients"
  ON clients FOR DELETE
  USING (auth.uid() = user_id);
```

### Authentification

```typescript
// lib/supabase/client.ts
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'

export const supabase = createClientComponentClient()

// Usage
const { data: { user } } = await supabase.auth.getUser()
```

### Storage Security

```sql
-- Politique de stockage documents
CREATE POLICY "Users can upload their own documents"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'documents' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users can view their own documents"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'documents' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );
```

## 📂 Organisation du Code

### Structure des Composants

```
components/
├── ui/                    # shadcn components
│   ├── button.tsx
│   ├── input.tsx
│   └── ...
├── clients/              # Feature: Clients
│   ├── client-form.tsx
│   ├── client-list.tsx
│   └── client-card.tsx
├── dossiers/             # Feature: Dossiers
│   ├── dossier-form.tsx
│   ├── dossier-detail.tsx
│   └── workflow-view.tsx
├── shared/               # Composants partagés
│   ├── navbar.tsx
│   ├── sidebar.tsx
│   └── page-header.tsx
└── providers/            # Context providers
    ├── auth-provider.tsx
    └── theme-provider.tsx
```

### Patterns de Composants

#### Server Component (par défaut)
```typescript
// app/(dashboard)/dossiers/page.tsx
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'

export default async function DossiersPage() {
  const supabase = createServerComponentClient({ cookies })

  const { data: dossiers } = await supabase
    .from('dossiers')
    .select('*')
    .order('created_at', { ascending: false })

  return <DossiersList dossiers={dossiers} />
}
```

#### Client Component (interactif)
```typescript
'use client'

import { useState } from 'react'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'

export function DossierForm() {
  const [loading, setLoading] = useState(false)
  const supabase = createClientComponentClient()

  async function handleSubmit(data: FormData) {
    setLoading(true)
    const { error } = await supabase.from('dossiers').insert(data)
    setLoading(false)
  }

  return (
    <form onSubmit={handleSubmit}>
      {/* Form fields */}
    </form>
  )
}
```

#### Server Action
```typescript
// app/actions/dossiers.ts
'use server'

import { createServerActionClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'

export async function createDossier(formData: FormData) {
  const supabase = createServerActionClient({ cookies })

  const { data, error } = await supabase
    .from('dossiers')
    .insert({
      // ... données du formulaire
    })
    .select()
    .single()

  if (error) throw error

  revalidatePath('/dossiers')
  return data
}
```

## 🎯 Validation avec Zod

### Schémas Partagés

```typescript
// lib/validations/dossier.ts
import { z } from 'zod'

export const dossierSchema = z.object({
  client_id: z.string().uuid('Client invalide'),
  numero_dossier: z.string().min(1, 'Numéro requis'),
  type_procedure: z.enum(['civil'], {
    required_error: 'Type de procédure requis'
  }),
  objet: z.string().min(10, 'L\'objet doit contenir au moins 10 caractères'),
  tribunal: z.string().min(1, 'Tribunal requis'),
  date_ouverture: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date invalide'),
})

export type DossierFormData = z.infer<typeof dossierSchema>
```

### Usage dans Formulaires

```typescript
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { dossierSchema } from '@/lib/validations/dossier'

function DossierForm() {
  const form = useForm<DossierFormData>({
    resolver: zodResolver(dossierSchema),
    defaultValues: {
      type_procedure: 'civil',
    }
  })

  const onSubmit = async (data: DossierFormData) => {
    // Data is type-safe and validated
  }
}
```

## 📡 Gestion des Données

### Fetch avec Supabase

```typescript
// Lecture
const { data, error } = await supabase
  .from('dossiers')
  .select(`
    *,
    client:clients(*),
    actions:actions(count)
  `)
  .eq('statut', 'actif')
  .order('created_at', { ascending: false })
  .limit(10)

// Création
const { data, error } = await supabase
  .from('dossiers')
  .insert({ ... })
  .select()
  .single()

// Mise à jour
const { data, error } = await supabase
  .from('dossiers')
  .update({ statut: 'cloture' })
  .eq('id', dossierId)
  .select()

// Suppression
const { error } = await supabase
  .from('dossiers')
  .delete()
  .eq('id', dossierId)
```

### Real-time (optionnel V2.0)

```typescript
useEffect(() => {
  const channel = supabase
    .channel('dossiers_changes')
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'dossiers',
      filter: `user_id=eq.${userId}`
    }, (payload) => {
      console.log('Change received!', payload)
      // Mettre à jour l'UI
    })
    .subscribe()

  return () => {
    supabase.removeChannel(channel)
  }
}, [])
```

## 📧 Système de Notifications

### Architecture Email

```
Trigger (Cron Job / Database Trigger)
    ↓
Edge Function (Supabase)
    ↓
Resend API
    ↓
Email Client
```

### Implémentation

```typescript
// supabase/functions/send-daily-reminders/index.ts
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { Resend } from 'npm:resend@2.0.0'

const resend = new Resend(Deno.env.get('RESEND_API_KEY'))

serve(async (req) => {
  // Récupérer échéances du jour
  const { data: echeances } = await supabase
    .from('echeances')
    .select('*, dossier:dossiers(*), user:users(*)')
    .lte('date_echeance', tomorrow)
    .eq('rappel_j1', true)

  // Envoyer emails
  for (const echeance of echeances) {
    await resend.emails.send({
      from: 'notifications@avocat-saas.tn',
      to: echeance.user.email,
      subject: `Rappel : ${echeance.titre}`,
      html: renderEmailTemplate(echeance)
    })
  }

  return new Response('OK')
})
```

## 🚀 Performance

### Optimisations

1. **Server Components** : Réduire JavaScript client
2. **Static Generation** : Pages statiques quand possible
3. **Image Optimization** : `next/image` automatique
4. **Code Splitting** : Lazy loading des composants
5. **Database Indexing** : Indexes sur colonnes fréquemment requêtées

### Monitoring

```typescript
// lib/monitoring.ts
export function trackEvent(event: string, properties?: Record<string, any>) {
  // Posthog / Mixpanel / Simple Analytics
  if (typeof window !== 'undefined') {
    console.log('Event:', event, properties)
  }
}
```

## 🧪 Tests (V1.5)

### Structure Tests

```
__tests__/
├── unit/
│   ├── lib/
│   └── components/
├── integration/
│   └── api/
└── e2e/
    └── flows/
```

### Outils
- **Vitest** : Unit tests
- **Testing Library** : Component tests
- **Playwright** : E2E tests

## 📦 Déploiement

### Pipeline CI/CD

```yaml
# .github/workflows/deploy.yml
name: Deploy
on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: npm ci
      - run: npm run build
      - uses: amondnet/vercel-action@v20
```

### Environnements

- **Production** : `app.avocat-saas.tn`
- **Staging** : `staging.avocat-saas.tn`
- **Development** : `localhost:3000`

## 🔄 Migrations Future

### Quand migrer de Supabase ?

Signaux :
- \>10,000 utilisateurs
- Besoins complexes non couverts
- Coûts Supabase trop élevés

### Options Migration
1. **Self-hosted PostgreSQL** (AWS RDS, Railway)
2. **Auth custom** (Lucia, NextAuth)
3. **Storage custom** (S3, Cloudinary)

### Coût Migration : 4-6 semaines

## 📚 Ressources

- [Next.js Docs](https://nextjs.org/docs)
- [Supabase Docs](https://supabase.com/docs)
- [shadcn/ui](https://ui.shadcn.com)
- [TailwindCSS](https://tailwindcss.com)

---

**Dernière mise à jour** : 2026-02-04
