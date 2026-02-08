# 🔧 Guide de Dépannage Qadhya

Guide rapide pour résoudre les problèmes courants en production.

---

## 🚨 Problèmes Fréquents

### 1. Container Next.js Unhealthy

**Symptômes**:
```bash
docker ps
# moncabinet-nextjs: Up X minutes (unhealthy)
```

**Diagnostic**:
```bash
docker logs moncabinet-nextjs --tail 50
docker inspect moncabinet-nextjs | grep -A 10 Health
```

**Solutions**:
```bash
# Redémarrage simple
docker restart moncabinet-nextjs

# Redémarrage complet
cd /opt/moncabinet
docker-compose -f docker-compose.prod.yml restart nextjs

# Rebuild si nécessaire
docker-compose -f docker-compose.prod.yml up -d --build nextjs
```

---

### 2. Erreur PostgreSQL "column does not exist"

**Symptômes**:
```
ERROR: column "needs_classification" does not exist
ERROR: column "indexed" does not exist (devrait être "is_indexed")
```

**Solutions**:
```sql
-- Se connecter à la DB
docker exec -it moncabinet-postgres psql -U moncabinet -d moncabinet

-- Vérifier colonnes manquantes
SELECT column_name
FROM information_schema.columns
WHERE table_name = 'documents'
  AND column_name LIKE '%classif%';

-- Ajouter colonne manquante
ALTER TABLE documents
ADD COLUMN IF NOT EXISTS needs_classification BOOLEAN DEFAULT false NOT NULL;

-- Créer index
CREATE INDEX IF NOT EXISTS idx_documents_needs_classification
ON documents(needs_classification)
WHERE needs_classification = true;
```

---

### 3. Contrainte CHECK Violée (indexing_jobs)

**Symptômes**:
```
ERROR: new row violates check constraint "indexing_jobs_job_type_check"
```

**Diagnostic**:
```sql
-- Voir contrainte actuelle
SELECT conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conname LIKE '%indexing_jobs%check%';

-- Voir types de jobs utilisés
SELECT DISTINCT job_type, COUNT(*)
FROM indexing_jobs
GROUP BY job_type;
```

**Solution**:
```sql
-- Supprimer ancienne contrainte
ALTER TABLE indexing_jobs
DROP CONSTRAINT IF EXISTS indexing_jobs_job_type_check;

-- Recréer avec tous les types nécessaires
ALTER TABLE indexing_jobs
ADD CONSTRAINT indexing_jobs_job_type_check
CHECK (job_type IN (
  'document',
  'knowledge_base',
  'reindex',
  'kb_quality_analysis',
  'kb_duplicate_check',
  'web_page_indexing'  -- Ajouter si nécessaire
));
```

---

### 4. Ollama Ne Répond Pas

**Symptômes**:
```
Connection refused localhost:11434
Timeout after 120s
Circuit breaker OPEN
```

**Diagnostic**:
```bash
# Vérifier status
systemctl status ollama

# Vérifier port
curl http://localhost:11434/api/tags

# Logs
journalctl -u ollama -n 50
```

**Solutions**:
```bash
# Redémarrer Ollama
sudo systemctl restart ollama

# Vérifier modèles chargés
ollama list

# Recharger modèle si nécessaire
ollama pull qwen2.5:3b
ollama pull qwen3-embedding:0.6b

# Vérifier config
cat /etc/systemd/system/ollama.service.d/override.conf
# Doit contenir: OLLAMA_HOST=0.0.0.0:11434
```

---

### 5. Nginx 502 Bad Gateway

**Symptômes**:
```
502 Bad Gateway
nginx error log: connect() failed
```

**Diagnostic**:
```bash
# Vérifier Next.js
docker ps | grep nextjs
curl http://localhost:3000/api/health

# Logs Nginx
sudo tail -f /var/log/nginx/qadhya_error.log
```

**Solutions**:
```bash
# Vérifier upstream
sudo nginx -t
sudo systemctl reload nginx

# Redémarrer Next.js
docker restart moncabinet-nextjs

# Vérifier connectivité
telnet localhost 3000
```

---

### 6. mTLS Cloudflare Bloque les Requêtes

**Symptômes**:
```
400 Bad Request
No required SSL certificate was sent
```

**Diagnostic**:
```bash
# Vérifier config Nginx
sudo nginx -T | grep ssl_verify_client

# Vérifier certificat
openssl x509 -in /opt/moncabinet/ssl/cloudflare/client.crt -noout -dates
```

**Solutions**:
```bash
# Mode temporaire "optional" (pour debug)
sudo sed -i 's/ssl_verify_client on/ssl_verify_client optional/' \
  /etc/nginx/sites-available/moncabinet
sudo systemctl reload nginx

# Remettre en mode strict après debug
sudo sed -i 's/ssl_verify_client optional/ssl_verify_client on/' \
  /etc/nginx/sites-available/moncabinet
sudo systemctl reload nginx
```

---

### 7. Indexation Bloquée (Cron)

**Symptômes**:
```
indexed: 0 en boucle
Timeout après 240s
Aucun nouveau chunk créé
```

**Diagnostic**:
```bash
# Logs cron
tail -f /var/log/kb-indexing.log

# Vérifier documents en attente
docker exec moncabinet-postgres psql -U moncabinet -d moncabinet -c \
  "SELECT COUNT(*) FROM knowledge_base WHERE is_indexed = false;"

# Vérifier Ollama load
top | grep ollama
```

**Solutions**:
```bash
# Indexation manuelle test
CRON_SECRET=$(docker exec moncabinet-nextjs env | grep CRON_SECRET | cut -d= -f2)
curl -X GET "http://localhost:3000/api/admin/index-kb" \
  -H "Authorization: Bearer $CRON_SECRET"

# Réduire batch size si timeout
# Éditer: /opt/moncabinet/index-kb-progressive.sh
# Changer timeout de 240 à 300

# Redémarrer Ollama si saturé
sudo systemctl restart ollama
```

---

### 8. Disque Plein

**Symptômes**:
```
No space left on device
df -h: 95%+ utilisé
```

**Diagnostic**:
```bash
# Vérifier usage
df -h
du -sh /var/lib/docker/*
du -sh /opt/moncabinet/*

# Trouver gros fichiers
find / -type f -size +500M 2>/dev/null | head -20
```

**Solutions**:
```bash
# Nettoyer Docker
docker system prune -a --volumes
docker image prune -a

# Nettoyer logs
sudo journalctl --vacuum-time=7d
sudo find /var/log -type f -name "*.log" -mtime +30 -delete

# Nettoyer anciennes images
docker images | grep '<none>' | awk '{print $3}' | xargs docker rmi
```

---

### 9. Mémoire Saturée

**Symptômes**:
```
OOM (Out of Memory)
free -h: 0 available
Container killed
```

**Diagnostic**:
```bash
# Vérifier usage RAM
free -h
docker stats --no-stream

# Process les plus gourmands
ps aux --sort=-%mem | head -10
```

**Solutions**:
```bash
# Redémarrer services gourmands
docker restart moncabinet-nextjs
sudo systemctl restart ollama

# Activer swap si désactivé
sudo fallocate -l 4G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile

# Limiter Docker
docker update --memory="4g" moncabinet-nextjs
```

---

### 10. Erreur Build GitHub Actions

**Symptômes**:
```
GitHub Actions failed
Build error
Push declined (secrets detected)
```

**Solutions**:
```bash
# Secrets détectés
# → Utiliser process.env au lieu de hardcoder

# Build fail
# → Vérifier logs GitHub Actions
# → Tester build local: docker build -t test .

# Push fail (mTLS)
# → Attendre déploiement (~5 min)
# → Vérifier: docker ps sur VPS
```

---

## 🔍 Commandes de Diagnostic Rapides

```bash
# Santé globale
bash /tmp/monitor-qadhya.sh

# Services Docker
docker ps --format "table {{.Names}}\t{{.Status}}"

# Logs temps réel
docker logs -f moncabinet-nextjs

# DB connexion
docker exec -it moncabinet-postgres psql -U moncabinet -d moncabinet

# Nginx test
sudo nginx -t && sudo systemctl reload nginx

# Ressources
htop
docker stats
df -h && free -h
```

---

## 📞 Escalade

Si aucune solution ne fonctionne :

1. **Sauvegarder les logs**
```bash
docker logs moncabinet-nextjs > /tmp/nextjs.log
sudo journalctl -u ollama > /tmp/ollama.log
sudo tail -100 /var/log/nginx/qadhya_error.log > /tmp/nginx.log
```

2. **État système**
```bash
bash /tmp/monitor-qadhya.sh > /tmp/system-state.log
docker ps -a >> /tmp/system-state.log
```

3. **Redémarrage complet** (dernier recours)
```bash
cd /opt/moncabinet
docker-compose -f docker-compose.prod.yml down
sudo systemctl stop ollama nginx
sudo systemctl start ollama nginx
docker-compose -f docker-compose.prod.yml up -d
```

---

## 📚 Ressources

- [Production Deployment Report](./PRODUCTION_DEPLOYMENT_REPORT.md)
- [MEMORY.md](../.claude/projects/-Users-salmenktata-Projets-GitHub-Avocat/memory/MEMORY.md)
- [GitHub Actions](https://github.com/salmenktata/MonCabinet/actions)
- Logs: `/var/log/kb-indexing.log`, `/var/log/nginx/`

---

**Dernière mise à jour**: 8 Février 2026
