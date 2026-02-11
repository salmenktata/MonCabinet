# 🧪 Scripts de Test - Assistant IA

Ce dossier contient deux scripts pour tester l'Assistant IA juridique de Qadhya avec un cas complexe de légitime défense.

## 📁 Fichiers

### 1. `simulate-assistant-response.ts` (Simulation - Mode Mock)
**Génère une réponse simulée sans appel API**

- ✅ Aucune dépendance (serveur, DB, Ollama)
- ✅ Réponse instantanée (~4-5 secondes)
- ✅ Démontre la structure IRAC attendue
- ✅ Utile pour formation, démo, tests rapides

### 2. `test-assistant-prompt.ts` (Test Réel - Mode Live)
**Appelle l'API réelle `/api/chat`**

- ⚠️ Nécessite serveur démarré (`npm run dev`)
- ⚠️ Nécessite PostgreSQL + Ollama/API keys
- ✅ Teste le système complet end-to-end
- ✅ Mesure performance réelle

## 🚀 Utilisation

### Mode Simulation (Recommandé pour démo)

```bash
# Simulation mode Rapide (Ollama)
npm run simulate:assistant

# Simulation mode Premium (Cloud)
npm run simulate:assistant:premium
```

### Mode Test Réel (Production-like)

```bash
# 1. Démarrer le serveur
npm run dev

# 2. Test local mode Rapide
npm run test:assistant-prompt

# 3. Test local mode Premium
npm run test:assistant-prompt:premium

# 4. Test production (nécessite authentification)
npm run test:assistant-prompt:prod
```

## 📝 Cas Juridique Testé

**Type:** Pénal - Légitime défense (الدفاع الشرعي)

**Scénario:**
- Altercation nocturne devant un club
- Blessure grave → décès ultérieur
- Accusé invoque légitime défense vs agression collective
- Vidéos contradictoires (plusieurs angles)
- Témoin clé changeant sa déposition (allégations de menaces)

**Questions juridiques:**
- Imminence du danger (خطر حال)
- Proportionnalité de la réponse
- Validité des preuves médico-légales
- Analyse temporelle des vidéos
- Contradictions dans les témoignages
- Nullité éventuelle des procédures

## 📊 Métriques Analysées

### Performance
- ⏱️ **Temps de traitement** (objectif: <30s)
- 🔢 **Tokens utilisés** (prompt + completion)
- 📈 **Temps par étape** (détection langue, recherche, génération)

### Qualité de la Réponse
- 🎓 **Structure IRAC** (Issue-Rule-Application-Conclusion)
  - ✅ Faits (الوقائع)
  - ✅ Problématique (الإشكالية)
  - ✅ Règles juridiques (القواعد القانونية)
  - ✅ Analyse (التحليل)
  - ✅ Conclusion (الخلاصة)
  - ✅ Sources (المراجع)

- 🔍 **Concepts juridiques clés**
  - ✅ Légitime défense
  - ✅ Danger imminent
  - ✅ Proportionnalité
  - ✅ Preuves médico-légales
  - ✅ Témoignages

### Sources
- 📚 **Nombre de sources** utilisées
- 🎯 **Similarité moyenne** (objectif: >0.80)
- 📖 **Types de sources** (législation, jurisprudence, doctrine)

## 🎯 Score Global

Le script calcule un **score global de qualité** sur 100 :

- **50%** Structure IRAC (6 sections/6)
- **50%** Concepts juridiques (5 concepts/5)

### Échelle de qualité
- ⭐⭐⭐⭐⭐ **80-100** : Excellente
- ⭐⭐⭐⭐ **60-79** : Bonne
- ⭐⭐⭐ **40-59** : Moyenne
- ⭐⭐ **0-39** : Faible

## 📌 Points Forts de la Réponse Attendue

1. **Structure IRAC complète et rigoureuse**
   - Méthode classique enseignée dans les facultés de droit
   - Organisation claire et logique

2. **Analyse approfondie multi-scénarios**
   - Scénario 1: Légitime défense valide
   - Scénario 2: Dépassement des limites
   - Scénario 3: Circonstances atténuantes

3. **Citations précises**
   - Textes législatifs (Fصل 39 م.ج.)
   - Jurisprudence tunisienne (arrêts de cassation)
   - Doctrine juridique

4. **Recommandations procédurales concrètes**
   - Pour la défense
   - Pour le ministère public
   - Pistes d'investigation complémentaires

5. **Prise en compte des nuances**
   - Analyse temporelle des vidéos
   - Crédibilité des témoignages contradictoires
   - Rôle des preuves médico-légales
   - Nullités procédurales potentielles

6. **Ton professionnel adapté**
   - Avocat chevronné tunisien (20 ans d'expérience)
   - Bilingue AR/FR selon contexte
   - Pas de ton IA générique

## 🔧 Options de Configuration

### Variables d'environnement

```bash
# Environnement de test
TEST_ENV=production    # Tester sur prod au lieu de local
TEST_ENV=local         # Tester en local (défaut)

# Mode IA
USE_PREMIUM=true       # Mode Premium (Cloud providers)
USE_PREMIUM=false      # Mode Rapide (Ollama local) - défaut
```

### Exemples

```bash
# Test production avec mode Premium
TEST_ENV=production USE_PREMIUM=true npm run test:assistant-prompt

# Simulation mode Rapide
npm run simulate:assistant

# Test local avec Ollama
npm run test:assistant-prompt
```

## 📖 Aide et Documentation

```bash
# Afficher l'aide
npx tsx scripts/test-assistant-prompt.ts --help
npx tsx scripts/simulate-assistant-response.ts --help
```

## 🐛 Dépannage

### Erreur "Cannot connect to API"
**Cause:** Serveur dev non démarré
**Solution:** `npm run dev`

### Erreur "Ollama not responding"
**Cause:** Service Ollama non actif
**Solution (Mac):** `ollama serve`
**Solution (Linux):** `systemctl start ollama`

### Erreur "Database connection failed"
**Cause:** PostgreSQL non accessible
**Solution:** Vérifier `docker ps | grep postgres`

### Timeout après 120 secondes
**Cause:** Ollama très lent (première exécution)
**Solution:** Attendre ou utiliser mode Premium

## 📚 Ressources

### Documentation liée
- `docs/LEGAL_REASONING_PROMPTS.md` - Prompts juridiques IRAC
- `lib/ai/legal-reasoning-prompts.ts` - Implémentation prompts
- `lib/ai/rag-chat-service.ts` - Service RAG chat

### Fichiers clés
- `app/api/chat/route.ts` - Endpoint API
- `lib/hooks/useConversations.ts` - Hooks React Query
- `components/assistant-ia/ChatPage.tsx` - UI principale

## 🎓 Cas d'usage

### 1. Formation interne
Démontrer les capacités de l'Assistant IA sans nécessiter accès production

### 2. Démo client/prospect
Montrer la qualité des réponses sur un cas réel complexe

### 3. Tests de régression
Vérifier que les modifications n'ont pas dégradé la qualité

### 4. Benchmarking
Comparer performance Ollama local vs Cloud providers

### 5. Développement
Tester rapidement sans attendre déploiement

## ⚠️ Limitations

### Mode Simulation
- ❌ Ne teste **PAS** le système réel
- ❌ Réponse hardcodée (pas d'IA réelle)
- ✅ Utile uniquement pour démo structure

### Mode Test Réel
- ⚠️ Consomme des tokens (si mode Premium)
- ⚠️ Nécessite KB indexée (documents disponibles)
- ⚠️ Performance dépend du hardware (Ollama local)

## 📊 Résultats Attendus

### Simulation
- **Temps:** 4-5 secondes
- **Score:** 100/100 (réponse parfaite hardcodée)
- **Sources:** 5 sources simulées

### Test Réel (Local - Ollama)
- **Temps:** 15-25 secondes
- **Score:** 80-95/100 (dépend de la KB)
- **Sources:** 3-8 sources réelles

### Test Réel (Production - Cloud)
- **Temps:** 10-20 secondes
- **Score:** 85-100/100 (meilleure qualité)
- **Sources:** 5-12 sources réelles

## 🚀 Prochaines Étapes

1. **Ajouter plus de cas de test**
   - Droit commercial
   - Droit immobilier
   - Droit du travail

2. **Automatiser les tests**
   - Intégration CI/CD
   - Tests de régression automatiques

3. **Comparer les modes**
   - Benchmark Rapide vs Premium
   - Analyse coût/qualité

4. **Export des résultats**
   - Rapports JSON/CSV
   - Dashboard de suivi

---

**Créé par:** Qadhya Team
**Date:** 11 février 2026
**Version:** 1.0.0
