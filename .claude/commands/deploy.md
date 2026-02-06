# Skill: Deploy to VPS

Déploiement manuel rapide, fiable et optimisé sur le VPS Contabo.

## Configuration requise

Variables d'environnement (dans `~/.zshrc` ou `~/.bashrc`) :
```bash
export VPS_HOST="84.247.165.187"
export VPS_USER="root"
export VPS_PASSWORD="IeRfA8Z46gsYSNh7"
```

## Instructions

### Étape 1 : Vérifications pré-déploiement

Toujours exécuter ces vérifications AVANT de déployer :

```bash
# Vérifier TypeScript
npm run type-check
```

Si TypeScript échoue, **NE PAS déployer**. Corriger les erreurs d'abord.

### Étape 2 : Vérifier l'état Git

```bash
git status --short
git log -1 --oneline
```

### Étape 3 : Gestion des changements locaux

Si des changements non commités existent :
1. Demander à l'utilisateur s'il veut commiter
2. Si oui, créer un commit avec message descriptif :

```bash
git add -A && git commit -m "deploy: Description des changements"
```

### Étape 4 : Push vers GitHub

```bash
git push origin main
```

### Étape 5 : Choix du mode de déploiement

**Mode CI/CD (par défaut)** : Le push déclenche GitHub Actions automatiquement.

```bash
# Afficher le workflow en cours
gh run list --limit 1 --json status,conclusion,name,createdAt
```

**Mode Manuel (--manual ou --quick)** : Déploiement direct sans CI/CD.

### Étape 6 : Déploiement manuel (si --manual ou --quick)

Exécuter sur le VPS :

```bash
sshpass -p "$VPS_PASSWORD" ssh -o StrictHostKeyChecking=no "$VPS_USER@$VPS_HOST" << 'DEPLOY_SCRIPT'
set -e

cd /opt/moncabinet

echo "=== Git Pull ==="
git pull origin main

echo "=== Docker Build (avec cache) ==="
docker compose build nextjs

echo "=== Redémarrage container ==="
docker compose up -d nextjs

echo "=== Health Check ==="
sleep 10
for i in {1..6}; do
  if curl -sf http://localhost:3000/api/health > /dev/null; then
    echo "OK - Application accessible"
    curl -s http://localhost:3000/api/health
    exit 0
  fi
  echo "Attente... ($i/6)"
  sleep 5
done

echo "ERREUR - Health check échoué"
docker compose logs --tail=50 nextjs
exit 1
DEPLOY_SCRIPT
```

### Étape 7 : Vérification finale

```bash
curl -s https://moncabinet.tn/api/health
```

## Arguments

| Argument | Description |
|----------|-------------|
| `--manual` | Déploiement direct sur VPS (git pull + docker build) |
| `--quick` | Alias de --manual, déploiement rapide |
| `--status` | Vérifier l'état du VPS sans déployer |
| `--logs` | Afficher les logs du container nextjs |
| `--rollback` | Revenir à l'image Docker précédente |

## Commandes par argument

### --status : Vérifier l'état du VPS

```bash
sshpass -p "$VPS_PASSWORD" ssh -o StrictHostKeyChecking=no "$VPS_USER@$VPS_HOST" << 'STATUS_SCRIPT'
echo "=== Containers ==="
docker compose -f /opt/moncabinet/docker-compose.prod.yml ps

echo ""
echo "=== Ressources ==="
docker stats --no-stream --format "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}"

echo ""
echo "=== Health Check ==="
curl -s http://localhost:3000/api/health

echo ""
echo "=== Espace disque ==="
df -h /opt /var
STATUS_SCRIPT
```

### --logs : Afficher les logs

```bash
sshpass -p "$VPS_PASSWORD" ssh -o StrictHostKeyChecking=no "$VPS_USER@$VPS_HOST" \
  "docker compose -f /opt/moncabinet/docker-compose.prod.yml logs --tail=100 nextjs"
```

### --rollback : Revenir à la version précédente

```bash
sshpass -p "$VPS_PASSWORD" ssh -o StrictHostKeyChecking=no "$VPS_USER@$VPS_HOST" << 'ROLLBACK_SCRIPT'
cd /opt/moncabinet

echo "=== Rollback en cours ==="

# Récupérer l'image précédente
PREVIOUS_IMAGE=$(docker images --format "{{.Repository}}:{{.Tag}}" | grep moncabinet | head -2 | tail -1)

if [ -z "$PREVIOUS_IMAGE" ]; then
  echo "ERREUR - Aucune image précédente trouvée"
  exit 1
fi

echo "Rollback vers: $PREVIOUS_IMAGE"

# Arrêter container actuel
docker compose -f docker-compose.prod.yml down nextjs

# Tag l'image précédente comme latest
docker tag "$PREVIOUS_IMAGE" ghcr.io/salmenktata/moncabinet:latest

# Redémarrer
docker compose -f docker-compose.prod.yml up -d nextjs

echo "=== Vérification ==="
sleep 10
curl -s http://localhost:3000/api/health
ROLLBACK_SCRIPT
```

## Gestion des erreurs

### Si le déploiement échoue

1. Vérifier les logs : `/deploy --logs`
2. Vérifier l'état : `/deploy --status`
3. Rollback si nécessaire : `/deploy --rollback`

### Erreurs courantes

| Erreur | Solution |
|--------|----------|
| TypeScript errors | Corriger avant de déployer |
| Docker build failed | Vérifier Dockerfile et dépendances |
| Health check failed | Vérifier logs, variables env |
| Connexion SSH refusée | Vérifier VPS_HOST/VPS_PASSWORD |

## Informations VPS

- **IP** : 84.247.165.187
- **User** : root
- **Domaine** : moncabinet.tn
- **App path** : /opt/moncabinet
- **Compose file** : docker-compose.prod.yml
- **Registry** : ghcr.io/salmenktata/moncabinet

## Workflow recommandé

1. `npm run type-check` - Vérifier TypeScript
2. Commiter les changements
3. `/deploy` - Déploiement via CI/CD (recommandé)
4. OU `/deploy --quick` - Déploiement manuel rapide
5. `/deploy --status` - Vérifier le résultat
