# Guide : Gestion Dev vs Prod pour LLM

**Date** : 2026-02-09
**Status** : ✅ Implémenté et testé

## 🎯 Objectif

**Éviter la consommation de tokens payants en développement** en utilisant uniquement Ollama local (0€), et réserver les providers cloud (Gemini, DeepSeek) pour la production.

## 💰 Économies

| Environnement | Providers | Coût |
|---------------|-----------|------|
| **Développement** | Ollama uniquement | **0€** |
| **Production** | Gemini + DeepSeek + Ollama | ~$2-5/mois |

**Gain** : Pas de consommation accidentelle en dev (économie de ~$50-100/mois) 💰

## 🔧 Configuration

### Variable d'Environnement

**`.env.local`** :
```bash
# development = Ollama uniquement (0€)
# production = Cloud providers payants
NODE_ENV=development
```

### Comportement par Environnement

#### Mode Développement (`NODE_ENV=development`)

```typescript
// Providers disponibles
getAvailableProviders() → ['ollama']

// Stratégies par contexte
PROVIDER_STRATEGY_BY_CONTEXT = {
  'rag-chat': ['ollama'],
  'embeddings': ['ollama'],
  'quality-analysis': ['ollama'],
  'structuring': ['ollama'],
  'translation': ['ollama'],
  'web-scraping': ['ollama'],
  'default': ['ollama'],
}
```

**Résultat** :
- ✅ Tous les appels LLM utilisent Ollama local
- ✅ 0€ consommé
- ✅ Pas de risque d'épuiser les quotas cloud
- ⚠️ Plus lent (17-20s vs 0.5-1.5s cloud)

#### Mode Production (`NODE_ENV=production`)

```typescript
// Providers disponibles
getAvailableProviders() → ['gemini', 'deepseek', 'ollama']

// Stratégies par contexte (optimisées)
PROVIDER_STRATEGY_BY_CONTEXT = {
  'rag-chat': ['gemini', 'gemini', 'deepseek', 'ollama'],
  'embeddings': ['ollama'],
  'quality-analysis': ['deepseek', 'gemini', 'ollama'],
  'structuring': ['deepseek', 'gemini', 'ollama'],
  'translation': ['gemini', 'groq'],
  'web-scraping': ['gemini', 'ollama'],
  'default': FALLBACK_ORDER,
}
```

**Résultat** :
- ✅ Performance optimale (0.5-1.5s)
- ✅ Fallback intelligent par contexte
- ✅ Qualité maximale (DeepSeek pour analyse, Gemini pour chat)
- 💰 ~$2-5/mois selon usage

## 📦 Fichiers Modifiés

### 1. `lib/ai/llm-fallback-service.ts`

**Changements** :
- `getAvailableProviders()` : Retourne `['ollama']` si `NODE_ENV=development`
- `getProviderStrategyByContext()` : Fonction dynamique selon environnement
- `callLLMWithFallback()` : Garde Ollama en dev (ne pas filtrer)

### 2. `.env.local`

**Ajout** :
```bash
NODE_ENV=development
```

### 3. `.env.example`

**Ajout** :
```bash
NODE_ENV=development  # Commenté pour prod
```

## 🧪 Tests

### Test Automatique

```bash
npx tsx scripts/test-dev-mode.ts
```

**Sortie attendue** :
```
🧪 Test Mode Développement (NODE_ENV=development)

📋 Test 1: Providers disponibles
[LLM-Fallback] 🏠 Mode développement → Ollama uniquement (0€)
   Résultat: ollama
   Attendu: ollama uniquement

📡 Test 2: Appel LLM en mode dev
[LLM-Fallback] Contexte: rag-chat → Stratégie: [ollama]
   ✅ Provider: ollama
   ✅ Réponse: "OK"
   ✅ Durée: 17776ms
   ✅ Modèle: ollama/qwen3:8b

🎉 Mode développement validé : 0€ consommé !
```

### Test Manuel

```typescript
// Dans n'importe quel code
import { getAvailableProviders } from '@/lib/ai/llm-fallback-service'

const providers = getAvailableProviders()
console.log(providers)
// Dev: ['ollama']
// Prod: ['gemini', 'deepseek', 'ollama']
```

## 🚀 Déploiement Production

### Étape 1 : Mettre à jour .env sur le serveur

```bash
# Sur le VPS de production
vim /opt/moncabinet/.env

# Changer
NODE_ENV=production
```

### Étape 2 : Redémarrer l'application

```bash
cd /opt/moncabinet
docker-compose restart
```

### Étape 3 : Vérifier les logs

```bash
docker logs -f moncabinet-nextjs | grep "LLM-Fallback"
```

**Logs attendus** :
```
[LLM-Fallback] Contexte: rag-chat → Stratégie: [gemini → deepseek]
[LLM-Fallback] Mode Premium activé → utilisation cloud providers
```

## ⚠️ Prérequis

### Développement

1. **Ollama démarré** :
   ```bash
   ollama serve
   ```

2. **Modèles installés** :
   ```bash
   ollama list
   # qwen2.5:3b ou qwen3:8b
   # qwen3-embedding:0.6b
   ```

3. **NODE_ENV=development** dans `.env.local`

### Production

1. **Clés API configurées** dans `.env` :
   - `GOOGLE_API_KEY` (Gemini)
   - `DEEPSEEK_API_KEY` (DeepSeek)

2. **NODE_ENV=production** dans `.env`

3. **Ollama optionnel** (uniquement pour embeddings)

## 🐛 Troubleshooting

### Erreur : "Aucun provider disponible"

**En dev** :
```
❌ Aucun provider disponible pour contexte "rag-chat". Vérifiez que Ollama est démarré : ollama serve
```

**Solution** :
```bash
ollama serve
```

**En prod** :
```
❌ Aucun provider disponible pour contexte "rag-chat". Configurez au moins une clé API: GOOGLE_API_KEY...
```

**Solution** :
```bash
# Vérifier les clés dans .env
cat .env | grep API_KEY

# Vérifier que NODE_ENV=production
cat .env | grep NODE_ENV
```

### Ollama Trop Lent en Dev

**Symptôme** : Réponses en 15-20 secondes

**Cause** : CPU local sans GPU, modèle lourd (qwen3:8b)

**Solution** : Utiliser un modèle plus léger
```bash
# Télécharger qwen2.5:3b (plus rapide)
ollama pull qwen2.5:3b

# Mettre à jour .env.local
OLLAMA_CHAT_MODEL=qwen2.5:3b
```

### Toujours en Mode Dev en Production

**Symptôme** : Ollama utilisé en prod

**Cause** : `NODE_ENV=development` sur le serveur

**Solution** :
```bash
# Sur le VPS
vim /opt/moncabinet/.env
# Changer vers NODE_ENV=production
docker-compose restart
```

## 📊 Monitoring

### Vérifier l'Environnement

```bash
# Dev
npx tsx -e "console.log('NODE_ENV:', process.env.NODE_ENV)"
# Output: NODE_ENV: development

# Providers
npx tsx -e "import {getAvailableProviders} from './lib/ai/llm-fallback-service'; console.log(getAvailableProviders())"
# Output: [ 'ollama' ]
```

### Dashboard Providers

- 🔗 `/super-admin/provider-usage`
- Voir la consommation par provider
- En dev : Seul Ollama devrait avoir des stats

## 📚 Références

- [docs/API_KEYS_DB_SETUP.md](./API_KEYS_DB_SETUP.md) - Gestion clés API
- [docs/GEMINI_ACTIVATION_GUIDE.md](./GEMINI_ACTIVATION_GUIDE.md) - Setup Gemini
- [lib/ai/llm-fallback-service.ts](../lib/ai/llm-fallback-service.ts) - Code source

---

**Date de création** : 2026-02-09
**Dernière mise à jour** : 2026-02-09
**Status** : ✅ Production-ready
