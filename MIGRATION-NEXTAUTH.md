# Migration Supabase → NextAuth + PostgreSQL

**Date**: 5 février 2026
**Statut**: ✅ Migration principale terminée

## 📋 Résumé

MonCabinet a migré de Supabase Cloud vers une infrastructure auto-hébergée complète :

| Avant (Supabase) | Après (Auto-hébergé) |
|-----------------|---------------------|
| Supabase Auth | NextAuth.js + JWT |
| Supabase PostgreSQL | PostgreSQL 15 (Docker) |
| Supabase Storage | MinIO S3-compatible |
| Edge Functions | API Routes Next.js |

## ✅ Composants Migrés

### Authentification
- ✅ **NextAuth.js** installé et configuré
- ✅ Routes `/api/auth/[...nextauth]` créées
- ✅ Middleware simplifié (114 → 34 lignes)
- ✅ SessionProvider intégré
- ✅ Types TypeScript étendus
- ✅ Helpers session créés (`lib/auth/session.ts`)

### Base de Données
- ✅ PostgreSQL 15 sur Docker (port 5433)
- ✅ Pool de connexions configuré (`lib/db/postgres.ts`)
- ✅ Table `users` créée avec password_hash
- ✅ Utilisateur test : `test@moncabinet.tn` / `Test123!`

### Infrastructure
- ✅ `docker-compose.yml` complet (PostgreSQL + MinIO + Next.js)
- ✅ Scripts de déploiement VPS (`scripts/deploy.sh`, `scripts/setup-vps.sh`)
- ✅ Documentation déploiement créée

### Nettoyage
- ✅ Packages `@supabase/ssr` et `@supabase/supabase-js` désinstallés
- ✅ Dossier `lib/supabase/` supprimé
- ✅ Variables `NEXT_PUBLIC_SUPABASE_*` retirées de `.env.local`
- ✅ Fichiers `test-supabase.js` et `scripts/migrate-from-supabase.ts` supprimés

## ⚠️ Fichiers Restants à Migrer

**125 fichiers** contiennent encore des imports `@/lib/supabase` :

### Critiques (à migrer en priorité)
```
app/actions/
├── clients.ts
├── dossiers.ts
├── documents.ts
├── echeances.ts
├── factures.ts
├── templates.ts
├── time-entries.ts
├── cabinet.ts
├── notifications.ts
├── cloud-storage.ts
└── messaging.ts
```

### Pages Dashboard
```
app/(dashboard)/
├── layout.tsx
├── dashboard/page.tsx
├── clients/page.tsx
├── clients/[id]/page.tsx
├── dossiers/page.tsx
├── dossiers/[id]/page.tsx
├── dossiers/new/page.tsx
├── factures/page.tsx
├── factures/[id]/page.tsx
├── echeances/page.tsx
├── templates/page.tsx
├── documents/page.tsx
└── parametres/
    ├── cabinet/page.tsx
    ├── cloud-storage/page.tsx
    ├── notifications/page.tsx
    └── messagerie/page.tsx
```

### Routes API
```
app/api/
├── factures/[id]/pdf/route.ts
├── factures/[id]/note-honoraires/route.ts
├── dossiers/[id]/convention/route.ts
├── webhooks/whatsapp/route.ts
├── webhooks/google-drive/route.ts
└── integrations/google-drive/callback/route.ts
```

### Composants
```
components/
├── dashboard/WhatsAppStatusWidget.tsx
├── profile/ProfileForm.tsx
├── parametres/NotificationPreferencesForm.tsx
├── echeances/EcheancesWidget.tsx
├── factures/FlouciPaymentButton.tsx
└── shared/GlobalSearch.tsx
```

## 🔄 Pattern de Migration

Pour chaque fichier, remplacer :

### 1. Imports
```typescript
// ❌ AVANT
import { createClient } from '@/lib/supabase/server'

// ✅ APRÈS
import { query } from '@/lib/db/postgres'
import { getSession } from '@/lib/auth/session'
```

### 2. Obtenir l'utilisateur
```typescript
// ❌ AVANT
const supabase = createClient()
const { data: { user } } = await supabase.auth.getUser()

// ✅ APRÈS
const session = await getSession()
const userId = session?.user?.id
```

### 3. Requêtes SELECT
```typescript
// ❌ AVANT
const { data, error } = await supabase
  .from('clients')
  .select('*')
  .eq('user_id', user.id)

// ✅ APRÈS
const result = await query(
  'SELECT * FROM clients WHERE user_id = $1',
  [userId]
)
const data = result.rows
```

### 4. Requêtes INSERT
```typescript
// ❌ AVANT
const { data, error } = await supabase
  .from('clients')
  .insert({ nom, prenom, user_id: user.id })
  .select()
  .single()

// ✅ APRÈS
const result = await query(
  'INSERT INTO clients (nom, prenom, user_id) VALUES ($1, $2, $3) RETURNING *',
  [nom, prenom, userId]
)
const data = result.rows[0]
```

### 5. Requêtes UPDATE
```typescript
// ❌ AVANT
const { error } = await supabase
  .from('clients')
  .update({ nom, prenom })
  .eq('id', clientId)
  .eq('user_id', user.id)

// ✅ APRÈS
await query(
  'UPDATE clients SET nom = $1, prenom = $2 WHERE id = $3 AND user_id = $4',
  [nom, prenom, clientId, userId]
)
```

### 6. Requêtes DELETE
```typescript
// ❌ AVANT
const { error } = await supabase
  .from('clients')
  .delete()
  .eq('id', clientId)
  .eq('user_id', user.id)

// ✅ APRÈS
await query(
  'DELETE FROM clients WHERE id = $1 AND user_id = $2',
  [clientId, userId]
)
```

### 7. Gestion d'erreurs
```typescript
// ❌ AVANT
if (error) throw error

// ✅ APRÈS
try {
  await query(...)
} catch (error) {
  console.error('Erreur PostgreSQL:', error)
  throw new Error('Échec de l\'opération')
}
```

## 📚 Ressources

### Fichiers de Référence
- `app/api/auth/[...nextauth]/route.ts` - Configuration NextAuth
- `lib/db/postgres.ts` - Client PostgreSQL
- `lib/auth/session.ts` - Helpers session
- `middleware.ts` - Protection routes
- `types/next-auth.d.ts` - Types NextAuth

### Documentation
- [README-DEPLOYMENT.md](./README-DEPLOYMENT.md) - Guide déploiement VPS
- [ARCHITECTURE-DEPLOIEMENT.md](./ARCHITECTURE-DEPLOIEMENT.md) - Architecture technique
- [QUICK-START-VPS.md](./QUICK-START-VPS.md) - Quick start VPS
- [CHECKLIST-DEPLOIEMENT.md](./CHECKLIST-DEPLOIEMENT.md) - Checklist déploiement

### Commandes Utiles
```bash
# Vérifier fichiers restants avec imports Supabase
grep -r "from '@/lib/supabase" --include="*.ts" --include="*.tsx" app/ components/ lib/

# Compter fichiers restants
grep -rl "from '@/lib/supabase" --include="*.ts" --include="*.tsx" app/ components/ lib/ | wc -l

# Tester connexion PostgreSQL
docker exec moncabinet-postgres psql -U moncabinet -d moncabinet -c "SELECT COUNT(*) FROM users;"

# Tester NextAuth
curl http://localhost:7002/api/auth/providers

# Créer backup
docker exec moncabinet-postgres pg_dump -U moncabinet moncabinet > backup_$(date +%Y%m%d).sql
```

## 🎯 Prochaines Étapes

1. **Migrer actions critiques** (`app/actions/*.ts`) → Permet fonctionnement de base
2. **Migrer pages dashboard** → Restaure interface utilisateur
3. **Migrer API routes** → Restaure génération PDF et webhooks
4. **Tests end-to-end** → Valider tout le workflow
5. **Nettoyage final** → Supprimer backups dark-mode et fichiers obsolètes

## ⚠️ Notes Importantes

- Les fichiers avec imports `@/lib/supabase` retourneront des erreurs claires si utilisés
- Migration progressive recommandée (par fonctionnalité)
- Toujours tester localement avant commit
- Garder backups PostgreSQL réguliers
- Ne PAS réinstaller packages Supabase

## 📞 Support

Pour questions sur la migration :
- Voir exemples dans `app/api/auth/[...nextauth]/route.ts`
- Consulter documentation PostgreSQL : https://www.postgresql.org/docs/15/
- Documentation NextAuth.js : https://next-auth.js.org/

---

**Migration effectuée par**: Claude Code
**Date**: 5 février 2026
**Durée totale**: ~8 heures sur 2 jours
