# Skill: Ship — Commit & Push vers main

Commit propre et push vers `main` en une seule commande.

## Instructions

### Étape 1 : Vérifier TypeScript

```bash
npx tsc --noEmit --pretty 2>&1 | head -40
```

Si des erreurs TypeScript existent, **STOP** — ne pas commiter. Afficher les erreurs et demander à l'utilisateur de les corriger d'abord.

### Étape 2 : Inspecter l'état Git

```bash
git status --short
git diff --stat
```

Si aucun changement (`nothing to commit`) → informer l'utilisateur et s'arrêter.

### Étape 3 : Lire le diff pour générer le message de commit

```bash
git diff HEAD
git log --oneline -5
```

Analyser le diff pour comprendre la nature des changements et générer un message de commit conventionnel (`feat`, `fix`, `chore`, `refactor`, etc.).

### Étape 4 : Bump de version patch dans package.json

Lire la version actuelle dans `package.json` :

```bash
node -e "const p=require('./package.json'); const [maj,min,pat]=p.version.split('.').map(Number); console.log(maj+'.'+min+'.'+(pat+1));"
```

Puis mettre à jour `package.json` avec la nouvelle version (patch +1), **sauf si** :
- La version a déjà été bumpée dans les fichiers modifiés
- L'argument `--no-bump` est passé

### Étape 5 : Staging et commit

Stager tous les fichiers modifiés et non-trackés pertinents :

```bash
git add <fichiers pertinents>
```

Ne jamais inclure : `.env`, `.env.*`, `*.secret`, fichiers de credentials.

Créer le commit avec un message concis basé sur le diff analysé :

```bash
git commit -m "$(cat <<'EOF'
<type>(<scope>): <résumé en français>

<description optionnelle si changements complexes>

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

### Étape 6 : Push vers main

```bash
git push origin main
```

Afficher le résultat du push.

### Étape 7 : Confirmation finale

Afficher un résumé :
- Fichiers commités
- Message de commit
- Résultat du push (succès / erreur)

## Arguments

| Argument | Description |
|----------|-------------|
| `--no-bump` | Ne pas incrémenter la version dans `package.json` |
| `--message "msg"` ou `-m "msg"` | Utiliser ce message de commit au lieu de le générer |
| `--dry-run` | Simuler sans commiter ni pusher (affiche ce qui serait fait) |

## Règles importantes

- **JAMAIS** créer de branche — tout commit va directement sur `main`
- **JAMAIS** utiliser `git add -A` sans vérifier que des fichiers sensibles ne sont pas inclus
- **JAMAIS** pusher si TypeScript a des erreurs
- Si le push est rejeté (non-fast-forward), afficher l'erreur et demander à l'utilisateur comment procéder — ne pas force-push automatiquement
