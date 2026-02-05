# Prochaines Étapes - MonCabinet

## ✅ Ce qui a été fait

### Documentation
- ✅ README.md complet avec vue d'ensemble du projet
- ✅ ARCHITECTURE.md détaillant la stack technique
- ✅ WORKFLOWS_TUNISIE.md avec les procédures légales tunisiennes
- ✅ CONTRIBUTING.md pour les guidelines de contribution

### Configuration
- ✅ package.json avec toutes les dépendances
- ✅ tsconfig.json configuré
- ✅ next.config.js
- ✅ tailwind.config.ts
- ✅ .eslintrc.json et .prettierrc
- ✅ .env.example
- ✅ .gitignore

### Données de Référence
- ✅ data/calendrier-judiciaire-2025.json (jours fériés tunisiens)
- ✅ data/delais-legaux.json (délais légaux complets)
- ✅ data/tribunaux-tunisie.json (24 tribunaux + cours d'appel)

### Base de Données
- ✅ Schema SQL complet (supabase/migrations/20250204000001_init_schema.sql)
- ✅ Tables : profiles, clients, dossiers, actions, echeances, documents, factures
- ✅ Row-Level Security (RLS) configuré
- ✅ Indexes pour performance
- ✅ Triggers pour updated_at automatique
- ✅ Vue dashboard_stats pour les statistiques

### Structure du Projet
- ✅ Structure de dossiers créée (app, components, lib, types)
- ✅ Fichiers de base Next.js (layout.tsx, page.tsx, globals.css)
- ✅ Clients Supabase (client.ts, server.ts)
- ✅ Utilitaires (utils.ts, database.types.ts)
- ✅ Middleware d'authentification

## 🚀 Prochaines Étapes (Semaine 1-2)

### 1. Setup Initial

```bash
# Installer les dépendances
npm install

# Créer un projet Supabase
# Aller sur https://supabase.com et créer un nouveau projet
# Récupérer NEXT_PUBLIC_SUPABASE_URL et NEXT_PUBLIC_SUPABASE_ANON_KEY

# Configurer .env.local
cp .env.example .env.local
# Remplir les variables Supabase et Resend

# Appliquer les migrations
# Dans le dashboard Supabase > SQL Editor, exécuter le fichier:
# supabase/migrations/20250204000001_init_schema.sql
```

### 2. Composants UI (shadcn/ui)

```bash
# Installer shadcn/ui CLI
npx shadcn-ui@latest init

# Ajouter les composants de base
npx shadcn-ui@latest add button
npx shadcn-ui@latest add input
npx shadcn-ui@latest add label
npx shadcn-ui@latest add form
npx shadcn-ui@latest add select
npx shadcn-ui@latest add dialog
npx shadcn-ui@latest add dropdown-menu
npx shadcn-ui@latest add toast
npx shadcn-ui@latest add table
npx shadcn-ui@latest add card
npx shadcn-ui@latest add tabs
npx shadcn-ui@latest add separator
npx shadcn-ui@latest add avatar
npx shadcn-ui@latest add badge
```

### 3. Authentification (Priority 0)

Créer les fichiers suivants :

**app/(auth)/login/page.tsx**
```typescript
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
// ... Formulaire de connexion
```

**app/(auth)/register/page.tsx**
```typescript
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'
// ... Formulaire d'inscription
```

**app/(auth)/layout.tsx**
```typescript
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      {children}
    </div>
  )
}
```

### 4. Dashboard Layout (Priority 0)

**app/(dashboard)/layout.tsx**
```typescript
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Sidebar from '@/components/shared/sidebar'
import Navbar from '@/components/shared/navbar'

export default async function DashboardLayout({ children }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  return (
    <div className="flex h-screen">
      <Sidebar />
      <div className="flex-1 flex flex-col">
        <Navbar />
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  )
}
```

**components/shared/sidebar.tsx**
```typescript
import Link from 'next/link'
import { Home, Users, Briefcase, FileText, Receipt } from 'lucide-react'

export default function Sidebar() {
  return (
    <aside className="w-64 bg-blue-900 text-white">
      <div className="p-6">
        <h1 className="text-2xl font-bold">Avocat</h1>
      </div>
      <nav className="space-y-2 px-4">
        <Link href="/dashboard" className="flex items-center gap-3 p-3 rounded hover:bg-blue-800">
          <Home size={20} />
          <span>Tableau de bord</span>
        </Link>
        <Link href="/dashboard/clients" className="flex items-center gap-3 p-3 rounded hover:bg-blue-800">
          <Users size={20} />
          <span>Clients</span>
        </Link>
        <Link href="/dashboard/dossiers" className="flex items-center gap-3 p-3 rounded hover:bg-blue-800">
          <Briefcase size={20} />
          <span>Dossiers</span>
        </Link>
        <Link href="/dashboard/factures" className="flex items-center gap-3 p-3 rounded hover:bg-blue-800">
          <Receipt size={20} />
          <span>Factures</span>
        </Link>
      </nav>
    </aside>
  )
}
```

### 5. Validation Schemas (Priority 0)

**lib/validations/client.ts**
```typescript
import { z } from 'zod'

export const clientSchema = z.object({
  nom: z.string().min(2, 'Le nom doit contenir au moins 2 caractères'),
  prenom: z.string().optional(),
  cin: z.string().regex(/^\d{8}$/, 'CIN invalide (8 chiffres)').optional().or(z.literal('')),
  telephone: z.string().regex(/^[0-9]{8}$/, 'Téléphone invalide (8 chiffres)').optional().or(z.literal('')),
  email: z.string().email('Email invalide').optional().or(z.literal('')),
  adresse: z.string().optional(),
  ville: z.string().optional(),
  profession: z.string().optional(),
  notes: z.string().optional(),
})

export type ClientFormData = z.infer<typeof clientSchema>
```

**lib/validations/dossier.ts**
```typescript
import { z } from 'zod'

export const dossierSchema = z.object({
  client_id: z.string().uuid('Client invalide'),
  numero_dossier: z.string().min(1, 'Numéro de dossier requis'),
  type_procedure: z.enum(['civil'], {
    required_error: 'Type de procédure requis'
  }),
  objet: z.string().min(10, 'L\'objet doit contenir au moins 10 caractères'),
  tribunal: z.string().min(1, 'Tribunal requis'),
  partie_adverse: z.string().optional(),
  date_ouverture: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date invalide'),
  montant_demande: z.number().optional(),
})

export type DossierFormData = z.infer<typeof dossierSchema>
```

### 6. Page Dashboard (Priority 0)

**app/(dashboard)/page.tsx**
```typescript
import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export default async function DashboardPage() {
  const supabase = createClient()

  const { data: stats } = await supabase
    .from('dashboard_stats')
    .select('*')
    .single()

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Tableau de bord</h1>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader>
            <CardTitle>Dossiers actifs</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{stats?.dossiers_actifs || 0}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Clients</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{stats?.total_clients || 0}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Actions urgentes</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-red-600">{stats?.actions_urgentes || 0}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Factures impayées</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-orange-600">{stats?.montant_impaye || 0} TND</p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
```

## 📅 Timeline de Développement (10 semaines)

### Semaines 1-2 : Setup + Auth + Clients
- [ ] Setup projet Supabase
- [ ] Authentification (login/register)
- [ ] CRUD Clients complet
- [ ] Dashboard de base

### Semaines 3-5 : Dossiers + Workflow
- [ ] CRUD Dossiers
- [ ] Workflow civil (étapes prédéfinies)
- [ ] Vue détaillée dossier
- [ ] Liste et filtres

### Semaines 6-7 : Actions + Échéances + Documents
- [ ] Actions/Tâches par dossier
- [ ] Système d'échéances
- [ ] Calcul délais simples
- [ ] Upload documents

### Semaine 8 : Dashboard + Notifications
- [ ] Dashboard avec statistiques
- [ ] Notifications email quotidiennes
- [ ] Actions urgentes

### Semaine 9 : Facturation
- [ ] Créer facture
- [ ] Génération PDF
- [ ] Suivi paiement
- [ ] Liste factures

### Semaine 10 : Polish + Tests + Déploiement
- [ ] UI/UX polish
- [ ] Tests manuels
- [ ] Déploiement Vercel
- [ ] Documentation utilisateur

## 🧪 Tests Avant Beta

### Checklist de Test
- [ ] Créer compte
- [ ] Créer client
- [ ] Créer dossier civil
- [ ] Ajouter actions
- [ ] Ajouter échéances
- [ ] Upload document
- [ ] Créer facture
- [ ] Générer PDF facture
- [ ] Recevoir notification email
- [ ] Rechercher dossier

## 📚 Ressources Utiles

### Documentation
- [Next.js 14 Docs](https://nextjs.org/docs)
- [Supabase Docs](https://supabase.com/docs)
- [shadcn/ui](https://ui.shadcn.com)
- [React Hook Form](https://react-hook-form.com)
- [Zod](https://zod.dev)

### Design
- [TailwindCSS Docs](https://tailwindcss.com/docs)
- [Lucide Icons](https://lucide.dev)
- [Radix UI](https://www.radix-ui.com)

### Outils
- [Supabase Studio](https://supabase.com/dashboard)
- [Vercel Dashboard](https://vercel.com/dashboard)
- [Resend Dashboard](https://resend.com/dashboard)

## 🐛 Debugging Tips

### Problèmes Courants

**Erreur Supabase RLS**
```sql
-- Vérifier les policies dans Supabase Dashboard > Authentication > Policies
```

**Erreur Hydration Next.js**
```typescript
// Ajouter suppressHydrationWarning sur <html>
<html lang="fr" suppressHydrationWarning>
```

**Erreur TypeScript Types**
```bash
# Regénérer les types
npx supabase gen types typescript --project-id YOUR_PROJECT_ID > types/database.types.ts
```

## 📞 Support

### Questions ?
- Créer une issue sur GitHub
- Consulter la documentation
- Rejoindre le Discord (si disponible)

---

**Bon développement ! 🚀**
