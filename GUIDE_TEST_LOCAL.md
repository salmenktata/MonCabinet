# 🧪 Guide de Test Local - Sprint 1

**Date:** 13 février 2026
**Objectif:** Valider les corrections parsing JSON en environnement local

---

## ✅ Tests Déjà Réalisés

### 1. Tests Unitaires Validation Zod
```bash
npx tsx scripts/test-json-parsing-validation.ts
```

**Résultat:** ✅ **5/5 tests passés (100%)**
- ✅ Validation JSON valide
- ✅ Détection champs manquants
- ✅ Détection mauvais types
- ✅ Détection mauvais enums
- ✅ Valeurs par défaut

### 2. Compilation TypeScript
```bash
npx tsc --noEmit
```

**Résultat:** ✅ **Aucune erreur**

---

## 🚀 Tests à Réaliser

### Test 1: Serveur de Développement

#### Démarrer le serveur
```bash
npm run dev
```

**Attendu:** Serveur démarre sur `http://localhost:7002`

#### Naviguer vers la page
1. Ouvrir navigateur: `http://localhost:7002`
2. Se connecter (si nécessaire)
3. Aller sur `/dossiers/assistant`

#### Tester avec un prompt simple
**Prompt de test (français simple):**
```
Je souhaite divorcer. Mon mari refuse de payer la pension alimentaire pour nos 2 enfants (5 ans et 8 ans). Je gagne 1200 TND par mois comme employée. Mon mari est médecin et gagne environ 4000 TND par mois. Nous sommes mariés depuis 10 ans.
```

**Résultat attendu:**
- ✅ Pas d'erreur "Veuillez reformuler ou simplifier"
- ✅ Dossier structuré avec:
  - Type: `divorce`
  - Client et partie adverse identifiés
  - 2 enfants détectés
  - Calculs pension alimentaire
  - Timeline proposée
  - Actions suggérées

#### Tester avec un prompt arabe complexe
**Prompt de test (arabe complexe - légitime défense):**

Copier le contenu de `scripts/test-complex-arabic-prompt.ts` (lignes 14-69, le prompt `COMPLEX_ARABIC_PROMPT`).

**Résultat attendu:**
- ✅ Analyse complète sans erreur
- ✅ Détection type procédure
- ✅ Analyse juridique présente
- ✅ Faits extraits pertinents
- ✅ Références juridiques

---

### Test 2: Vérifier les Logs

#### Pendant l'analyse, observer les logs dans le terminal
Vous devriez voir des logs comme:

```
[Structuration] Appel LLM avec fallback automatique
[Structuration] JSON nettoyé, longueur: XXXX
[Structuration] JSON parsé avec succès (tentative 1/3)
[Structuration] ✅ Validation Zod réussie (tentative 1)
```

**Si erreur de parsing (retry):**
```
[Structuration] ⚠️ Validation Zod échouée (tentative 1): champs XXX
[Réparation Zod] Tentative de correction basée sur: { ... }
[Structuration] Réparation Zod effectuée (XXXX → YYYY chars)
[Structuration] ✅ Validation Zod réussie (tentative 2)
```

**Si échec total (après 3 tentatives):**
```
[Structuration] ❌ JSON parsing échec (tentative 3/3)
[ALERT] Parsing failure tracked: parsing_failures:dossiers-assistant:gemini
```

---

### Test 3: Test E2E avec API (Optionnel)

**Prérequis:** Variables d'environnement configurées

#### Vérifier les clés API
```bash
# Vérifier quelles clés sont configurées
grep -E "GEMINI_API_KEY|GROQ_API_KEY|DEEPSEEK_API_KEY" .env.local | sed 's/=.*/=***/'
```

#### Lancer le test E2E
```bash
npx tsx scripts/test-complex-arabic-prompt.ts
```

**Résultat attendu:**
```
🧪 Test Prompt Complexe Arabe - Légitime Défense
════════════════════════════════════════════════════════════════════════════════
📝 Prompt (longueur): 1500+ caractères

⏳ Appel structurerDossier...

✅ SUCCÈS - Dossier structuré
════════════════════════════════════════════════════════════════════════════════
📊 Résultats:
  Type procédure: [type détecté]
  Langue détectée: ar
  Confiance: 85%+
  Titre proposé: [titre proposé]

📈 Métriques:
  Faits extraits: 5+
  Actions suggérées: 3+
  Timeline étapes: 5+

🤖 IA:
  Tokens utilisés: 2000+
  Temps total: <30000 ms

✅ Test réussi! Le parsing JSON avec retry logic fonctionne.
```

**Si échec:**
- Vérifier que les clés API sont valides
- Vérifier la connectivité internet
- Consulter les logs détaillés dans le terminal

---

## 🔍 Cas de Test Spécifiques

### Cas 1: JSON Malformé (Simulation)
**Objectif:** Tester que le retry logic fonctionne

Ce test est automatique dans le code. Observez les logs pour voir:
1. Première tentative parsing
2. Cleaning automatique si échec
3. Retry avec JSON réparé
4. Validation Zod finale

### Cas 2: Timeout Gemini
**Objectif:** Tester cascade fallback

Si Gemini timeout (>25s), observez:
```
[Structuration] Fallback utilisé: gemini → groq
```

### Cas 3: Champs Manquants
**Objectif:** Tester valeurs par défaut Zod

Le schéma Zod ajoute automatiquement:
- `confidence: 50` si manquant
- `langue: 'ar'` si manquant
- `faitsExtraits: []` si manquant
- etc.

---

## 📊 Checklist de Validation

Avant de déployer, vérifier:

### Tests Automatisés
- [x] ✅ Tests unitaires Zod (5/5 passés)
- [x] ✅ Compilation TypeScript (aucune erreur)
- [ ] Test E2E prompt arabe complexe (si API keys disponibles)

### Tests Manuels Interface
- [ ] Serveur dev démarre sans erreur
- [ ] Page `/dossiers/assistant` accessible
- [ ] Prompt simple français fonctionne
- [ ] Prompt complexe arabe fonctionne
- [ ] Logs montrent retry logic si nécessaire
- [ ] Aucune erreur "Veuillez reformuler"

### Vérifications Fonctionnelles
- [ ] Tous les champs dossier sont remplis
- [ ] Timeline générée correctement
- [ ] Calculs présents (si applicable)
- [ ] Actions suggérées pertinentes
- [ ] Références juridiques chargées (si KB activée)

---

## ⚠️ Problèmes Potentiels

### Erreur: "GEMINI_API_KEY non configuré"
**Solution:**
```bash
# Copier .env.example vers .env.local
cp .env.example .env.local

# Éditer et ajouter vos clés API
nano .env.local
```

### Erreur: "Database connection failed"
**Solution:**
```bash
# Vérifier que PostgreSQL est démarré
npm run db:status

# Ou démarrer les services Docker
docker-compose up -d postgres
```

### Erreur: "Port 7002 already in use"
**Solution:**
```bash
# Tuer le processus sur le port
lsof -ti:7002 | xargs kill -9

# Ou utiliser un autre port
PORT=7003 npm run dev
```

### Logs montrent "Validation Zod échouée" répété
**Attendu si:**
- LLM retourne JSON vraiment malformé
- Retry logic tentera 3 fois avant d'échouer
- Observer si réparation fonctionne (tentative 2 ou 3 réussit)

**Problème si:**
- Échec après 3 tentatives systématiquement
- Vérifier le provider utilisé (Gemini/Groq)
- Tester avec un prompt plus simple

---

## 🎯 Résultats Attendus

### Scénario Optimal (90% des cas)
1. Prompt envoyé → Gemini répond
2. JSON parsé → Validation Zod réussit (tentative 1)
3. Dossier structuré retourné
4. **Temps total:** 3-8 secondes

### Scénario Retry (8% des cas)
1. Prompt envoyé → Gemini répond
2. JSON parsé → Validation Zod échoue (tentative 1)
3. Réparation Zod appliquée
4. JSON re-parsé → Validation réussit (tentative 2)
5. Dossier structuré retourné
6. **Temps total:** 4-10 secondes

### Scénario Timeout/Fallback (2% des cas)
1. Prompt envoyé → Gemini timeout
2. Fallback vers Groq
3. JSON parsé → Validation réussit
4. Dossier structuré retourné
5. **Temps total:** 8-15 secondes

### Scénario Échec (<0.1% attendu)
1. Prompt envoyé → Tous providers timeout ou JSON invalide
2. 3 tentatives de réparation échouent
3. Erreur retournée avec message détaillé
4. Tracking monitoring activé
5. **Message:** "Le modèle IA n'a pas retourné un JSON valide après 3 tentatives..."

---

## 📝 Rapport de Test

Après avoir testé, noter:

**Tests Réussis:**
- [ ] Tests unitaires: 5/5
- [ ] Compilation TS: OK
- [ ] Serveur dev: OK
- [ ] Prompt simple: OK
- [ ] Prompt arabe complexe: OK
- [ ] Test E2E API: OK (si applicable)

**Problèmes Rencontrés:**
```
[Noter ici tout problème observé]
```

**Temps de Réponse Moyens:**
- Prompt simple: ___ secondes
- Prompt complexe: ___ secondes

**Décision:**
- [ ] ✅ Prêt pour déploiement production
- [ ] ⚠️ Corrections nécessaires avant déploiement
- [ ] 🔄 Tests supplémentaires requis

---

## 🚀 Étape Suivante

Si tous les tests passent:

```bash
# Commit et push
git add .
git commit -m "fix(llm): Validation Zod + retry logic parsing JSON"
git push origin main

# Suivre déploiement
gh run watch
```

Le déploiement automatique prendra ~8-10 minutes.

---

**Besoin d'aide ?**
- Consulter `docs/SPRINT1_JSON_PARSING_FIX.md` pour détails techniques
- Vérifier logs: `docker logs qadhya-nextjs`
- Tests unitaires: `npx tsx scripts/test-json-parsing-validation.ts`

---

**Créé par:** Claude Sonnet 4.5
**Date:** 13 février 2026
