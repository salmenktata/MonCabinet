# Dépendances à installer pour Sprint 3

## Installation des packages nécessaires

```bash
npm install react-markdown remark-gfm react-syntax-highlighter
npm install --save-dev @types/react-syntax-highlighter
```

## Packages installés

### react-markdown (^9.0.1)
- Rendu Markdown dans React
- Support complet de la syntaxe Markdown
- Personnalisation des composants

### remark-gfm (^4.0.0)
- GitHub Flavored Markdown
- Support des tables
- Support des task lists (checkboxes)
- Support du strikethrough
- Support des footnotes

### react-syntax-highlighter (^15.5.0)
- Syntax highlighting pour code blocks
- Multiples thèmes disponibles (oneDark utilisé)
- Support de nombreux langages de programmation

### @types/react-syntax-highlighter
- Types TypeScript pour react-syntax-highlighter

## Utilisation

### Dans ChatMessages.tsx

```typescript
import { MarkdownMessage } from './MarkdownMessage'

// Remplacer le simple texte par :
<MarkdownMessage content={message.content} />
```

### Exemples de Markdown supportés

#### Code blocks avec syntax highlighting
\`\`\`typescript
const exemple = "Code avec coloration syntaxique"
\`\`\`

#### Tables
| Colonne 1 | Colonne 2 |
|-----------|-----------|
| Valeur 1  | Valeur 2  |

#### Task lists
- [x] Tâche terminée
- [ ] Tâche en cours

#### Citations
> Citation en bloc

#### Listes
- Item 1
- Item 2
  - Sous-item

## Configuration dans ChatMessages.tsx

Pour activer le rendu Markdown, remplacer :

```typescript
<div className="whitespace-pre-wrap break-words">
  {message.content}
</div>
```

Par :

```typescript
<MarkdownMessage
  content={message.content}
  className="whitespace-pre-wrap"
/>
```
