# Instructions Claude Code — Projet Qadhya

## Règles GIT CRITIQUES

### ⛔ INTERDIT : Créer des branches

**Ne JAMAIS créer de branche** autre que `main`. Toutes les modifications doivent être committées directement sur `main`.

- Ne pas utiliser `git checkout -b`
- Ne pas utiliser `git branch <nom>`
- Ne pas utiliser `git switch -c`
- Ne pas créer de worktree avec `isolation: "worktree"` dans l'outil Agent
- Ne pas passer de branche lors d'un `git push` (uniquement `git push origin main`)

Tout le travail se fait sur `main` directement.

### ✅ Workflow autorisé

```bash
git add <fichiers>
git commit -m "message"
git push origin main
```
