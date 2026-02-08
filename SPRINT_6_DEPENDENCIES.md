# Dépendances à installer pour Sprint 6

## Installation des packages nécessaires

```bash
npm install @tanstack/react-virtual
```

## Packages installés

### @tanstack/react-virtual (^3.0.0)
- Virtualisation haute performance pour listes et grilles
- Support du scroll horizontal et vertical
- Estimation dynamique de taille
- Compatible React 18+

## Utilisation

### Dans ConversationsList.tsx

```typescript
import { useVirtualizer } from '@tanstack/react-virtual'

// Dans le composant
const rowVirtualizer = useVirtualizer({
  count: conversations.length,
  getScrollElement: () => parentRef.current,
  estimateSize: () => 72, // hauteur estimée d'une ligne
  overscan: 5,
})
```

### Dans ChatMessages.tsx

```typescript
import { useVirtualizer } from '@tanstack/react-virtual'

// Virtualiser les messages si plus de 50
const shouldVirtualize = messages.length > 50

const rowVirtualizer = useVirtualizer({
  count: messages.length,
  getScrollElement: () => containerRef.current,
  estimateSize: (index) => estimateMessageHeight(messages[index]),
  overscan: 3,
})
```

## Avantages

- **Performance** : Seuls les éléments visibles sont rendus
- **Mémoire** : Réduction significative de l'utilisation mémoire
- **Scroll fluide** : 60 fps même avec des milliers d'éléments

## Configuration recommandée

- Activer la virtualisation si > 50 conversations/messages
- Overscan de 3-5 éléments pour un scroll fluide
- Estimer la hauteur des éléments pour de meilleures performances
