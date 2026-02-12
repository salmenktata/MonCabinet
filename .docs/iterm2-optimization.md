# Optimisation RAM iTerm2

## ⚙️ Paramètres à modifier dans iTerm2

### 1. Réduire le Scrollback Buffer (Gain : -40-60% RAM)

**Chemin** : `iTerm2 → Preferences → Profiles → Terminal → Scrollback lines`

**Réglages recommandés** :
- **Par défaut** : Unlimited (∞) → **Consomme beaucoup de RAM**
- **Recommandé pour dev** : 5,000 lignes (-80% RAM)
- **Minimal** : 1,000 lignes (-95% RAM)

```
Avant : Unlimited → 500+ MB RAM si beaucoup de logs
Après : 5,000 lignes → 80-100 MB RAM
```

### 2. Activer le Compression du Scrollback

**Chemin** : `iTerm2 → Preferences → Advanced → Search "scrollback"`

**Paramètre** : `Scrollback buffer should be compressed`
- **Valeur recommandée** : `Yes` (par défaut : No)
- **Gain** : -30-50% RAM sur le buffer

### 3. Désactiver le "Instant Replay" (optionnel)

**Chemin** : `iTerm2 → Preferences → General → Magic`
- **Décocher** : `Save copy of screen to video` (Instant Replay)
- **Gain** : -10-20 MB RAM par session

### 4. Limiter les Sessions Idle

**Chemin** : `iTerm2 → Preferences → Profiles → Session`
- **Cocher** : `Automatically log session input to files`
- **Timeout** : Close idle sessions after 2 hours

### 5. Optimiser la recherche

**Chemin** : `iTerm2 → Preferences → Advanced → Search "memory"`
- `Maximum amount of memory to use for find` : **100 MB** (par défaut : 500 MB)

## 🧹 Maintenance régulière

### Commande pour nettoyer les processus zombies

```bash
# Tuer les processus tail inutiles
pkill -f "tail -f /tmp/nextjs-dev.log"

# Vérifier les sessions iTerm2 actives
ps aux | grep iTerm2 | wc -l
```

### Redémarrer iTerm2 proprement

```bash
# Sauvegarder la session actuelle
# Puis : iTerm2 → Arrangements → Save Current Arrangement

# Quitter iTerm2 complètement
osascript -e 'quit app "iTerm2"'

# Relancer iTerm2
open -a iTerm2
```

## 📈 Résultats attendus

| Paramètre | Avant | Après | Gain |
|-----------|-------|-------|------|
| Scrollback | Unlimited | 5,000 | -80% |
| Compression | No | Yes | -40% |
| Instant Replay | On | Off | -15% |
| **TOTAL** | **~400 MB** | **~80 MB** | **-80%** |

## 🎯 Configuration optimale pour Qadhya

```json
{
  "scrollback_lines": 5000,
  "compression": true,
  "instant_replay": false,
  "find_memory_limit_mb": 100,
  "idle_timeout_hours": 2
}
```

## 📝 Script d'optimisation auto

Créer un script `~/.zshrc` pour limiter les logs :

```bash
# Limiter la taille des logs Next.js
if [[ -f /tmp/nextjs-dev.log ]]; then
  tail -n 1000 /tmp/nextjs-dev.log > /tmp/nextjs-dev.log.tmp
  mv /tmp/nextjs-dev.log.tmp /tmp/nextjs-dev.log
fi
```

## 🔗 Ressources

- [iTerm2 Performance Tips](https://iterm2.com/documentation-performance.html)
- [macOS Memory Pressure](https://apple.stackexchange.com/questions/83544)
