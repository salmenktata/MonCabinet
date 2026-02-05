# Guide d'Ergonomie - MonCabinet

## 🎨 Composants UI Améliorés

### 1. Toast / Notifications

Système de notifications non-intrusives pour feedback utilisateur.

**Utilisation :**
```tsx
import { useToast } from '@/components/ui'

const { showToast } = useToast()

// Success
showToast('Dossier créé avec succès !', 'success')

// Error
showToast('Erreur lors de l\'enregistrement', 'error')

// Warning
showToast('Attention : données non sauvegardées', 'warning')

// Info
showToast('Nouvelle version disponible', 'info')
```

**Features :**
- Auto-dismiss après 5 secondes (configurable)
- Animation d'entrée/sortie fluide
- Empilable (plusieurs toasts simultanés)
- Fermeture manuelle possible

---

### 2. Breadcrumbs (Fil d'Ariane)

Navigation contextuelle automatique basée sur l'URL.

**Features :**
- Génération automatique depuis le pathname
- Mapping intelligent des URLs vers labels lisibles
- Gestion des IDs (UUIDs) affichés comme "Détails"
- Cliquable sauf dernière étape
- Masqué sur page d'accueil

**Affichage :**
```
Accueil > Dossiers > Détails > Modifier
```

---

### 3. Loading States (États de Chargement)

**LoadingSpinner :**
```tsx
<LoadingSpinner size="sm" /> // Petit
<LoadingSpinner size="md" /> // Moyen (défaut)
<LoadingSpinner size="lg" /> // Grand
```

**LoadingOverlay :**
```tsx
<LoadingOverlay message="Enregistrement en cours..." />
```

**LoadingPage :**
```tsx
if (loading) return <LoadingPage />
```

**SavingIndicator :**
```tsx
<SavingIndicator isSaving={isSaving} />
```

---

### 4. Confirm Dialog (Confirmations)

Modales de confirmation visuelles et accessibles.

**Utilisation :**
```tsx
import { useConfirm } from '@/components/ui'

const { confirm } = useConfirm()

const handleDelete = async () => {
  const confirmed = await confirm({
    title: 'Supprimer ce dossier ?',
    message: 'Cette action est irréversible. Toutes les données seront perdues.',
    confirmText: 'Supprimer',
    cancelText: 'Annuler',
    type: 'danger' // 'danger' | 'warning' | 'info'
  })

  if (confirmed) {
    // Supprimer
  }
}
```

**Types :**
- `danger` : Rouge (suppressions, actions destructives)
- `warning` : Jaune (avertissements)
- `info` : Bleu (informations)

---

### 5. Empty States (États Vides)

Interfaces visuelles quand aucune donnée n'est disponible.

**EmptyState générique :**
```tsx
<EmptyState
  icon={<CustomIcon />}
  title="Aucune facture"
  description="Créez votre première facture pour commencer."
  actionLabel="Créer une facture"
  actionHref="/factures/new"
/>
```

**NoDataState (simplifié) :**
```tsx
<NoDataState entity="client" />
```

**SearchEmptyState :**
```tsx
<SearchEmptyState />
```

**ErrorState :**
```tsx
<ErrorState onRetry={() => refetch()} />
```

---

### 6. Tooltips (Info-bulles)

Aide contextuelle au survol.

**Tooltip standard :**
```tsx
<Tooltip content="Cliquez pour modifier" position="top">
  <button>Modifier</button>
</Tooltip>
```

**Positions :** `top`, `bottom`, `left`, `right`

**HelpTooltip (avec icône) :**
```tsx
<HelpTooltip content="Format : JJ/MM/AAAA" />
```

---

### 7. Pagination

**Pagination complète :**
```tsx
<Pagination
  currentPage={currentPage}
  totalPages={totalPages}
  onPageChange={setCurrentPage}
  showFirstLast={true}
/>
```

**SimplePagination (mobile-friendly) :**
```tsx
<SimplePagination
  currentPage={currentPage}
  totalPages={totalPages}
  onPageChange={setCurrentPage}
/>
```

---

### 8. Raccourcis Clavier

**Raccourcis globaux disponibles :**

| Raccourci | Action |
|-----------|--------|
| `Ctrl/⌘ + H` | Retour au tableau de bord |
| `Ctrl/⌘ + K` | Recherche globale |
| `Ctrl + Alt + C` | Nouveau client |
| `Ctrl + Alt + D` | Nouveau dossier |
| `Ctrl + Alt + F` | Nouvelle facture |
| `Shift + ?` | Afficher l'aide |
| `Escape` | Fermer les modales |

**Ajout de raccourcis personnalisés :**
```tsx
import { useKeyboardShortcuts } from '@/components/ui'

useKeyboardShortcuts([
  {
    key: 's',
    ctrl: true,
    description: 'Sauvegarder',
    action: () => save()
  }
])
```

---

## 🎯 Bonnes Pratiques UX

### 1. Feedback Visuel

✅ **Toujours donner un feedback après une action :**
```tsx
const handleSubmit = async () => {
  setLoading(true)
  const result = await createClient(data)

  if (result.error) {
    showToast(result.error, 'error')
  } else {
    showToast('Client créé avec succès !', 'success')
    router.push('/clients')
  }

  setLoading(false)
}
```

### 2. États de Chargement

✅ **Afficher un état de chargement pendant les opérations :**
```tsx
{loading ? (
  <LoadingSpinner />
) : (
  <DataTable data={data} />
)}
```

### 3. Confirmations Destructives

✅ **Toujours demander confirmation avant suppressions :**
```tsx
const handleDelete = async () => {
  const confirmed = await confirm({
    title: 'Supprimer ?',
    message: 'Action irréversible.',
    type: 'danger'
  })

  if (!confirmed) return

  await deleteItem(id)
}
```

### 4. Gestion des Erreurs

✅ **Afficher des messages d'erreur clairs :**
```tsx
if (error) {
  return <ErrorState onRetry={refetch} />
}
```

### 5. États Vides

✅ **Guider l'utilisateur quand aucune donnée :**
```tsx
{items.length === 0 ? (
  <EmptyState
    title="Aucun dossier"
    description="Créez votre premier dossier."
    actionLabel="Créer un dossier"
    actionHref="/dossiers/new"
  />
) : (
  <DataList items={items} />
)}
```

---

## 📱 Responsive Design

Tous les composants sont optimisés pour :
- **Desktop** : Expérience complète
- **Tablet** : Adaptation des layouts
- **Mobile** : SimplePagination, menus condensés

---

## ♿ Accessibilité

### Clavier
- Navigation complète au clavier
- Focus visible
- Raccourcis configurables

### Screen Readers
- Labels ARIA
- Rôles sémantiques
- Messages d'erreur associés

### Contraste
- Ratio WCAG AA minimum
- Textes lisibles
- États distincts

---

## 🚀 Performance

### Optimisations
- Lazy loading des modales
- Debounce sur recherches
- Virtualisation des longues listes
- Code splitting automatique

### Animations
- GPU-accelerated (transform, opacity)
- 60 FPS garanti
- Respecte `prefers-reduced-motion`

---

## 📊 Métriques UX

**Objectifs :**
- **Time to Interactive** : < 3s
- **First Contentful Paint** : < 1.5s
- **Lighthouse Score** : > 90

**Monitoring :**
- Erreurs utilisateur trackées
- Temps de chargement moyens
- Taux d'abandon des formulaires

---

## 🔧 Configuration

### Provider Setup

Wrapper l'app avec les providers nécessaires :

```tsx
// app/layout.tsx
import { ToastProvider } from '@/components/ui/Toast'
import { ConfirmDialogProvider } from '@/components/ui/ConfirmDialog'

export default function RootLayout({ children }) {
  return (
    <html>
      <body>
        <ToastProvider>
          <ConfirmDialogProvider>
            {children}
          </ConfirmDialogProvider>
        </ToastProvider>
      </body>
    </html>
  )
}
```

---

## 📝 Checklist UX pour Nouvelles Features

- [ ] Feedback visuel après chaque action
- [ ] États de chargement affichés
- [ ] Confirmations pour actions destructives
- [ ] Empty states si pas de données
- [ ] Messages d'erreur clairs
- [ ] Tooltips sur éléments complexes
- [ ] Responsive (mobile + desktop)
- [ ] Accessible (clavier + screen reader)
- [ ] Performance optimisée
- [ ] Raccourcis clavier documentés

---

**Date de mise à jour :** 2026-02-05
**Version :** 1.0
