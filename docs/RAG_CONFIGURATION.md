# Configuration RAG - Guide Complet

> **Auteur** : Équipe Développement Qadhya  
> **Date** : 14 février 2026  
> **Version** : 2.0 (avec protection multicouche)

## 📋 Table des Matières

1. [Vue d'ensemble](#vue-densemble)
2. [Variables Critiques](#variables-critiques)
3. [Validation Configuration](#validation-configuration)
4. [Monitoring & Alertes](#monitoring--alertes)
5. [Dépannage](#dépannage)
6. [FAQ](#faq)

---

## Vue d'ensemble

Le système RAG (Retrieval-Augmented Generation) permet à l'assistant IA de répondre aux questions en s'appuyant sur la base de connaissances juridique.

### Architecture Simplifiée

```
Assistant IA → RAG System → Knowledge Base (8787 docs)
                  ↓
          Provider Embeddings
          (Ollama OU OpenAI)
```

### Composants Requis

1. **RAG_ENABLED=true** : Active le système
2. **Provider Embeddings** : AU MOINS UN requis
   - Ollama (gratuit, local) OU
   - OpenAI (payant, cloud)

---

## Variables Critiques

### Configuration Minimale Requise

Fichier : `/opt/moncabinet/.env`

```bash
# CONFIGURATION RAG - NON-NÉGOCIABLE
RAG_ENABLED=true
OLLAMA_ENABLED=true  # OU avoir OPENAI_API_KEY configuré

OLLAMA_BASE_URL=http://host.docker.internal:11434
OLLAMA_EMBEDDING_MODEL=qwen3-embedding:0.6b
```

### ⚠️ Configuration INVALIDE (bloque déploiement)

```bash
RAG_ENABLED=true
OLLAMA_ENABLED=false
# ET pas d'OPENAI_API_KEY
# → Assistant IA NON-FONCTIONNEL ❌
```

### ✅ Configurations VALIDES

**Option 1 : Ollama seul (recommandé)**
```bash
RAG_ENABLED=true
OLLAMA_ENABLED=true
```

**Option 2 : OpenAI seul**
```bash
RAG_ENABLED=true
OPENAI_API_KEY=sk-proj-...
```

**Option 3 : Les deux (optimal)**
```bash
RAG_ENABLED=true
OLLAMA_ENABLED=true
OPENAI_API_KEY=sk-proj-...  # Fallback
```

---

## Validation Configuration

### 1. Pre-Deploy (Automatique)

```bash
bash scripts/validate-rag-config.sh .env.production
```

**Résultat attendu :**
```
✅ Configuration RAG valide
```

### 2. Production Runtime

```bash
curl -s https://qadhya.tn/api/health | jq '.rag'
```

**Réponse attendue :**
```json
{
  "enabled": true,
  "semanticSearchEnabled": true,
  "status": "ok",
  "kbDocsIndexed": 8787
}
```

### 3. Test Recherche KB

```bash
bash scripts/test-kb-search-prod.sh
```

---

## Monitoring & Alertes

### Dashboard Temps Réel

**URL** : https://qadhya.tn/super-admin/monitoring?tab=system-config

- 🟢 Badge vert : Configuration OK
- 🔴 Badge rouge : Problème détecté

**Auto-refresh** : 30 secondes

### Alertes Email

- **Déclencheur** : Cron quotidien 8h + monitoring continu
- **Condition** : Configuration RAG invalide détectée
- **Anti-spam** : Max 1 email/6h

### Logs Cron

```bash
tail -f /var/log/qadhya/rag-config-check.log
```

---

## Dépannage

### Problème : Assistant IA répond "لم أجد وثائق ذات صلة"

#### Diagnostic

```bash
# 1. Vérifier health check
curl -s https://qadhya.tn/api/health | jq '.rag.status'
# Si "misconfigured" → Problème confirmé

# 2. Vérifier variables container
ssh root@84.247.165.187 "docker exec qadhya-nextjs env | grep OLLAMA_ENABLED"
```

#### Solution A : Activer Ollama (gratuit)

```bash
ssh root@84.247.165.187

# 1. Modifier .env
nano /opt/moncabinet/.env
# Changer : OLLAMA_ENABLED=false → true

# 2. Redémarrer
cd /opt/moncabinet
docker-compose up -d --no-deps nextjs

# 3. Attendre 45s
sleep 45

# 4. Vérifier
curl -s https://qadhya.tn/api/health | jq '.rag.status'
# Attendu: "ok"
```

#### Solution B : Configurer OpenAI

```bash
# 1. Ajouter clé
nano /opt/moncabinet/.env.production.local
# Ajouter : OPENAI_API_KEY=sk-proj-...

# 2. Redémarrer container
docker-compose up -d --no-deps nextjs
```

#### Validation

```bash
# Test recherche
bash scripts/test-kb-search-prod.sh

# Test manuel
# → https://qadhya.tn/assistant-ia
# → Poser question en arabe
# → Vérifier sources [KB-1], [KB-2]...
```

---

## FAQ

### Q : Ollama vs OpenAI ?

| Critère | Ollama | OpenAI |
|---------|--------|--------|
| Coût | 0€/mois | ~2-5€/mois |
| Vitesse | 500-1000ms | 200-400ms |
| Qualité | Très bon | Excellent |
| **Recommandation** | ✅ Défaut | Fallback |

### Q : Comment tester en local ?

```bash
# 1. Configurer .env.local
RAG_ENABLED=true
OLLAMA_ENABLED=true
OLLAMA_BASE_URL=http://localhost:11434

# 2. Démarrer Ollama
ollama pull qwen3-embedding:0.6b

# 3. Lancer app
npm run dev

# 4. Tester
curl http://localhost:7002/api/health | jq '.rag'
```

### Q : Budget OpenAI épuisé ?

**Solution** : Basculer sur Ollama (gratuit)

```bash
OLLAMA_ENABLED=true
# Ollama prendra automatiquement le relais
```

---

## Protection Multicouche

✅ **Layer 1** : Validation pre-deploy (bloque si invalide)  
✅ **Layer 2** : Health check runtime (détection)  
✅ **Layer 3** : Alertes email automatiques  
✅ **Layer 4** : Dashboard monitoring temps réel

---

**Ressources** :
- Dashboard : https://qadhya.tn/super-admin/monitoring?tab=system-config
- Code : `lib/ai/config.ts`, `scripts/validate-rag-config.sh`
- Logs : `/var/log/qadhya/rag-config-check.log`

---

*Dernière mise à jour : 14 février 2026 - v2.0*
