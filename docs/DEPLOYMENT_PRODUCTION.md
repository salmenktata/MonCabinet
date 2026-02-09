# 🚀 Déploiement Production - Option C Hybride

**Date** : Février 2026
**VPS** : 84.247.165.187 (4 CPU, 8GB RAM)
**Architecture** : Mode Rapide (Ollama local) + Mode Premium (Cloud)

---

## 🎯 Vue d'ensemble

Ce guide vous accompagne pour déployer la migration Ollama Option C en production.

**Durée totale estimée** : 20-30 minutes

---

## 🚀 Méthode 1 : Script Automatique (Recommandé)

### Depuis votre machine locale

```bash
./scripts/deploy-option-c-prod.sh
```

Le script automatise :
- ✅ Installation Ollama
- ✅ Configuration systemd + UFW
- ✅ Téléchargement modèles (qwen3:8b + qwen3-embedding)
- ✅ Mise à jour code
- ✅ Rebuild Docker
- ✅ Redémarrage application
- ✅ Vérifications post-déploiement

**Durée** : ~20 minutes (dont 10-15 min pour télécharger les modèles)

---

## 🔧 Méthode 2 : Déploiement Manuel

### 1. Connexion VPS

```bash
ssh root@84.247.165.187
cd /opt/moncabinet
```

### 2. Installation Ollama

```bash
# Installation
curl -fsSL https://ollama.com/install.sh | sh

# Configuration systemd (écoute 0.0.0.0)
mkdir -p /etc/systemd/system/ollama.service.d
cat > /etc/systemd/system/ollama.service.d/override.conf << 'EOF'
[Service]
Environment=OLLAMA_HOST=0.0.0.0:11434
EOF

# Démarrage service
systemctl daemon-reload
systemctl enable ollama
systemctl start ollama
systemctl status ollama
```

### 3. Configuration Firewall

```bash
# Autoriser Docker (172.x.x.x) → Ollama (11434)
ufw allow from 172.16.0.0/12 to any port 11434 comment 'Docker to Ollama'
ufw status | grep 11434
```

### 4. Téléchargement Modèles

```bash
# Chat rapide (5.2 GB - ~5-10 min)
ollama pull qwen3:8b

# Embeddings (639 MB - ~2-5 min)
ollama pull qwen3-embedding:0.6b

# Vérification
ollama list
```

### 5. Mise à jour Code

```bash
git pull origin main
git log --oneline -3
```

### 6. Configuration .env.production

```bash
nano .env.production
```

**Variables critiques** :

```bash
# Ollama (Mode Rapide)
OLLAMA_ENABLED=true
OLLAMA_BASE_URL=http://host.docker.internal:11434
OLLAMA_CHAT_MODEL=qwen3:8b
OLLAMA_EMBEDDING_MODEL=qwen3-embedding:0.6b
OLLAMA_CHAT_TIMEOUT_DEFAULT=120000

# Cloud Providers (Mode Premium) - AU MOINS GROQ
GROQ_API_KEY=gsk_...
DEEPSEEK_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...  # Optionnel

# RETIRER (si présent)
# OPENAI_API_KEY
```

### 7. Rebuild & Redémarrage Docker

```bash
# Arrêt containers
docker-compose -f docker-compose.prod.yml down

# Rebuild image (~5-10 min)
docker-compose -f docker-compose.prod.yml build --no-cache

# Démarrage
docker-compose -f docker-compose.prod.yml up -d

# Vérification
docker ps --filter name=moncabinet
```

### 8. Vérifications Post-Déploiement

```bash
# Ollama accessible
curl http://localhost:11434/api/tags | jq .

# Containers running
docker ps

# Logs Next.js (rechercher Ollama/LLM)
docker logs --tail 100 moncabinet-nextjs | grep -i "ollama\|llm-fallback"

# Application accessible
curl -I https://moncabinet.tn
```

---

## 🧪 Tests en Production

### Test 1 : Interface Web

```
https://moncabinet.tn/chat-test
```

**Actions** :
1. Toggle désactivé (⚡ Mode Rapide)
2. Poser : "Quels sont les délais de prescription commerciale ?"
3. Attendre ~15-20s
4. **Activer** toggle (🧠 Mode Premium)
5. Poser la même question
6. Comparer qualité/temps

### Test 2 : Monitoring Logs

```bash
# Terminal 1 : Logs Next.js
docker logs -f moncabinet-nextjs | grep "LLM-Fallback"

# Terminal 2 : Logs Ollama
journalctl -u ollama -f
```

**Logs attendus Mode Rapide** :
```
[LLM-Fallback] Mode Rapide → Ollama (qwen3:8b)
[RAG] Sources trouvées: 5
```

**Logs attendus Mode Premium** :
```
[LLM-Fallback] Mode Premium activé → utilisation cloud providers
[LLM-Fallback] ✓ Fallback réussi: ollama → groq
```

### Test 3 : Test Fallback

```bash
# Stopper Ollama temporairement
systemctl stop ollama

# Poser une question en mode rapide
# → Devrait fallback vers Groq

# Redémarrer
systemctl start ollama
```

---

## 🐛 Troubleshooting

### Problème : "Ollama n'est pas accessible"

```bash
# Vérifier service
systemctl status ollama

# Vérifier logs
journalctl -u ollama -n 50

# Vérifier override
cat /etc/systemd/system/ollama.service.d/override.conf

# Redémarrer
systemctl restart ollama
```

### Problème : "Modèle qwen3:8b non trouvé"

```bash
ollama list
ollama pull qwen3:8b
```

### Problème : Docker ne peut pas atteindre Ollama

```bash
# Vérifier UFW
ufw status | grep 11434

# Vérifier que Ollama écoute 0.0.0.0
netstat -tlnp | grep 11434

# Test depuis container
docker exec moncabinet-nextjs curl http://host.docker.internal:11434/api/tags
```

### Problème : Timeout embeddings

```bash
# Dans .env.production
OLLAMA_CHAT_TIMEOUT_DEFAULT=180000  # 3 min au lieu de 2

# Rebuild
docker-compose -f docker-compose.prod.yml up -d --build
```

### Problème : RAM saturée

```bash
# Vérifier usage
free -h
htop

# Ollama prend ~4-6GB avec qwen3:8b chargé
# Si problème, augmenter swap ou upgrade RAM
```

---

## 📊 Métriques à Surveiller

### Premières 24 heures

| Métrique | Objectif | Comment vérifier |
|----------|----------|------------------|
| Taux succès Ollama | >95% | Logs LLM-Fallback |
| Temps mode rapide | 15-25s | Interface /chat-test |
| Temps mode premium | 10-30s | Interface /chat-test |
| Erreurs critiques | 0 | `docker logs moncabinet-nextjs \| grep ERROR` |

### Première semaine

| Métrique | Objectif | Comment vérifier |
|----------|----------|------------------|
| Usage mode premium | <20% | Analytics / Logs |
| Coûts API cloud | <5€ | Dashboards Groq/DeepSeek |
| CPU usage | <80% pic | `htop` |
| RAM usage Ollama | Stable ~6GB | `htop` |

---

## 🔄 Rollback (si problème)

### Rollback code

```bash
cd /opt/moncabinet

# Voir commits récents
git log --oneline -5

# Rollback au commit précédent
git revert HEAD
# ou
git reset --hard <commit-id>

# Rebuild
docker-compose -f docker-compose.prod.yml up -d --build
```

### Rollback vers configuration précédente

```bash
# Restaurer .env.production depuis backup
cp .env.production.backup .env.production

# Ou désactiver Ollama temporairement
# .env.production
OLLAMA_ENABLED=false
# Le système utilisera cloud providers seulement
```

---

## 💰 Économies Attendues

| Avant (OpenAI) | Après (Option C) | Économie |
|----------------|------------------|----------|
| Chat : ~60€/mois | Mode rapide : 0€ | -60€/mois |
| Embeddings : ~40€/mois | Ollama : 0€ | -40€/mois |
| **Total** : ~100€/mois | **Total** : 0-15€/mois | **~1200€/an** 🎉 |

---

## 📚 Ressources

- **Guide complet** : `docs/MIGRATION_OLLAMA_OPTION_C.md`
- **Tests Phase 2** : `docs/PHASE2_INTEGRATION_COMPLETE.md`
- **Script auto** : `scripts/deploy-option-c-prod.sh`
- **Logs Ollama** : `journalctl -u ollama -f`
- **Logs Next.js** : `docker logs -f moncabinet-nextjs`

---

## ✅ Checklist Finale

- [ ] Ollama installé et démarré
- [ ] Systemd override configuré
- [ ] UFW rule ajoutée
- [ ] Modèles téléchargés (qwen3:8b + qwen3-embedding)
- [ ] .env.production mis à jour
- [ ] Code git pull
- [ ] Docker rebuild
- [ ] Containers redémarrés
- [ ] Test mode rapide OK
- [ ] Test mode premium OK
- [ ] Logs sans erreur

**Déploiement réussi si tous les tests passent !** ✨
