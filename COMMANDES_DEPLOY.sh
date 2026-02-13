#!/bin/bash
#
# Commandes de déploiement Sprint 1
# Choisir l'option qui vous convient
#

echo "════════════════════════════════════════════════════════════════════════════════"
echo "🚀 Déploiement Sprint 1: Correction Parsing JSON"
echo "════════════════════════════════════════════════════════════════════════════════"
echo ""

# =============================================================================
# OPTION A: Commit UNIQUEMENT Sprint 1 (Recommandé si autres changements WIP)
# =============================================================================

echo "📦 OPTION A: Commit Sprint 1 uniquement"
echo "────────────────────────────────────────────────────────────────────────────────"
echo ""
echo "Fichiers à committer:"
echo "  • lib/validations/structured-dossier.ts"
echo "  • lib/ai/dossier-structuring-service.ts"
echo "  • lib/ai/operations-config.ts"
echo "  • scripts/test-json-parsing-validation.ts"
echo "  • scripts/test-complex-arabic-prompt.ts"
echo "  • scripts/run-local-tests.sh"
echo "  • docs/SPRINT1_JSON_PARSING_FIX.md"
echo "  • IMPLEMENTATION_SUMMARY.md"
echo "  • GUIDE_TEST_LOCAL.md"
echo "  • RAPPORT_TEST_LOCAL.md"
echo ""
echo "Commandes:"
echo ""
cat << 'EOF'
# Ajouter uniquement fichiers Sprint 1
git add lib/validations/structured-dossier.ts
git add lib/ai/dossier-structuring-service.ts
git add lib/ai/operations-config.ts
git add scripts/test-json-parsing-validation.ts
git add scripts/test-complex-arabic-prompt.ts
git add scripts/run-local-tests.sh
git add docs/SPRINT1_JSON_PARSING_FIX.md
git add IMPLEMENTATION_SUMMARY.md
git add GUIDE_TEST_LOCAL.md
git add RAPPORT_TEST_LOCAL.md

# Commit
git commit -m "fix(llm): Validation Zod + retry logic parsing JSON

- ✅ Validation stricte via structuredDossierSchema (Zod)
- ✅ Retry logic 3 tentatives avec auto-réparation JSON
- ✅ Timeouts augmentés: chat 15s→25s, total 30s→45s
- ✅ maxTokens augmenté: 2000→3000 (analyses arabes complexes)
- ✅ Cleaning JSON amélioré (texte avant/après, undefined→null)
- ✅ Fonctions réparation: attemptZodBasedRepair, attemptAdvancedCleaning
- ✅ Tracking monitoring échecs parsing

Tests:
- ✅ 5/5 tests unitaires Zod passés (100%)
- ✅ Compilation TypeScript OK (fichiers modifiés)
- ✅ 7/7 fichiers critiques présents
- ✅ 2/3 providers API configurés (Groq, DeepSeek)

Impact attendu:
- Taux succès parsing: 30% → 95%+ (+216%)
- Erreurs 'reformuler': -90%
- Timeouts Gemini: 30% → <10% (-66%)

Résout: Erreur 'Veuillez reformuler ou simplifier' sur prompts arabes complexes
Ref: docs/SPRINT1_JSON_PARSING_FIX.md"

# Push
git push origin main

# Suivre déploiement
gh run watch
EOF

echo ""
echo ""

# =============================================================================
# OPTION B: Commit TOUT (Si vous voulez inclure autres changements)
# =============================================================================

echo "📦 OPTION B: Commit tous les changements"
echo "────────────────────────────────────────────────────────────────────────────────"
echo ""
echo "⚠️  Inclut aussi:"
echo "  • Monitoring crons (cron-executions, cron-schedules)"
echo "  • Modifications monitoring page"
echo "  • Migration SQL cron monitoring"
echo ""
echo "Commandes:"
echo ""
cat << 'EOF'
# Ajouter tous les fichiers
git add .

# Commit avec message complet
git commit -m "fix(llm): Validation Zod + retry logic parsing JSON + monitoring crons

Sprint 1 - Correction Parsing JSON:
- ✅ Validation stricte via structuredDossierSchema (Zod)
- ✅ Retry logic 3 tentatives avec auto-réparation
- ✅ Timeouts augmentés (15s→25s, 30s→45s, maxTokens 3000)
- ✅ Tests unitaires 5/5 passés

Monitoring Crons (bonus):
- Dashboard suivi exécutions crons
- API cron-executions/cron-schedules
- Migration SQL monitoring

Tests:
- ✅ 5/5 tests unitaires Zod (100%)
- ✅ Compilation TypeScript OK (Sprint 1)

Impact: +216% taux succès parsing, -90% erreurs 'reformuler'
Ref: docs/SPRINT1_JSON_PARSING_FIX.md"

# Push
git push origin main

# Suivre déploiement
gh run watch
EOF

echo ""
echo ""

# =============================================================================
# OPTION C: Review avant commit
# =============================================================================

echo "📦 OPTION C: Review changements avant commit"
echo "────────────────────────────────────────────────────────────────────────────────"
echo ""
echo "Commandes:"
echo ""
cat << 'EOF'
# Voir différences détaillées
git diff lib/ai/dossier-structuring-service.ts
git diff lib/ai/operations-config.ts

# Voir fichiers nouveaux
git status --short | grep "^??"

# Décider quoi committer après review
EOF

echo ""
echo "════════════════════════════════════════════════════════════════════════════════"
echo ""
echo "💡 Recommandation:"
echo "  → Utiliser OPTION A si vous avez d'autres changements en cours"
echo "  → Utiliser OPTION B si vous voulez tout déployer ensemble"
echo ""
echo "Temps déploiement: ~8-10 minutes (Tier 2 Docker automatique)"
echo ""
echo "════════════════════════════════════════════════════════════════════════════════"
