#!/bin/bash
#
# Script de test rapide pour l'interopérabilité Consultation/Assistant
# Usage: ./scripts/test-interop-consultation-assistant.sh
#

set -e

echo "🧪 Test Interopérabilité Consultation/Assistant"
echo "=============================================="
echo ""

# Couleurs
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test 1: Vérifier que les fichiers partagés existent
echo "📁 Test 1: Vérification des fichiers partagés..."
if [ -f "lib/ai/shared/rag-search.ts" ] && [ -f "lib/ai/shared/bilingual-labels.ts" ]; then
  echo -e "${GREEN}✅ Fichiers partagés présents${NC}"
else
  echo -e "${RED}❌ Fichiers partagés manquants${NC}"
  exit 1
fi

# Test 2: Vérifier que consultation.ts importe depuis shared
echo ""
echo "📦 Test 2: Vérification des imports dans consultation.ts..."
if grep -q "from '@/lib/ai/shared/rag-search'" app/actions/consultation.ts && \
   grep -q "from '@/lib/ai/shared/bilingual-labels'" app/actions/consultation.ts; then
  echo -e "${GREEN}✅ Imports corrects dans consultation.ts${NC}"
else
  echo -e "${RED}❌ Imports manquants dans consultation.ts${NC}"
  exit 1
fi

# Test 3: Vérifier que AssistantPage.tsx utilise useSearchParams
echo ""
echo "🔗 Test 3: Vérification support query params dans AssistantPage..."
if grep -q "useSearchParams" app/\(dashboard\)/dossiers/assistant/AssistantPage.tsx && \
   grep -q "searchParams.get('seed')" app/\(dashboard\)/dossiers/assistant/AssistantPage.tsx; then
  echo -e "${GREEN}✅ Support query params présent dans AssistantPage${NC}"
else
  echo -e "${RED}❌ Support query params manquant dans AssistantPage${NC}"
  exit 1
fi

# Test 4: Vérifier que ConsultationPage.tsx utilise useSearchParams
echo ""
echo "🔗 Test 4: Vérification support query params dans ConsultationPage..."
if grep -q "useSearchParams" app/\(dashboard\)/dossiers/consultation/ConsultationPage.tsx && \
   grep -q "searchParams.get('question')" app/\(dashboard\)/dossiers/consultation/ConsultationPage.tsx; then
  echo -e "${GREEN}✅ Support query params présent dans ConsultationPage${NC}"
else
  echo -e "${RED}❌ Support query params manquant dans ConsultationPage${NC}"
  exit 1
fi

# Test 5: Vérifier les traductions
echo ""
echo "🌐 Test 5: Vérification des traductions..."
if grep -q '"deepAnalysis"' messages/fr.json && \
   grep -q '"quickAdvice"' messages/fr.json && \
   grep -q '"fromConsultation"' messages/fr.json && \
   grep -q '"fromAssistant"' messages/fr.json; then
  echo -e "${GREEN}✅ Traductions françaises présentes${NC}"
else
  echo -e "${RED}❌ Traductions françaises manquantes${NC}"
  exit 1
fi

if grep -q '"deepAnalysis"' messages/ar.json && \
   grep -q '"quickAdvice"' messages/ar.json && \
   grep -q '"fromConsultation"' messages/ar.json && \
   grep -q '"fromAssistant"' messages/ar.json; then
  echo -e "${GREEN}✅ Traductions arabes présentes${NC}"
else
  echo -e "${RED}❌ Traductions arabes manquantes${NC}"
  exit 1
fi

# Test 6: Vérifier les boutons dans les composants
echo ""
echo "🔘 Test 6: Vérification des nouveaux boutons..."
if grep -q "handleDeepAnalysis" components/dossiers/consultation/ConsultationResult.tsx; then
  echo -e "${GREEN}✅ Bouton 'Analyse approfondie' présent dans ConsultationResult${NC}"
else
  echo -e "${RED}❌ Bouton 'Analyse approfondie' manquant${NC}"
  exit 1
fi

if grep -q "handleQuickAdvice" components/dossiers/assistant/StructuredResult.tsx; then
  echo -e "${GREEN}✅ Bouton 'Conseil rapide' présent dans StructuredResult${NC}"
else
  echo -e "${RED}❌ Bouton 'Conseil rapide' manquant${NC}"
  exit 1
fi

# Test 7: Vérifier le build TypeScript
echo ""
echo "🔨 Test 7: Compilation TypeScript..."
if npm run build > /tmp/build.log 2>&1; then
  echo -e "${GREEN}✅ Build réussi${NC}"
else
  echo -e "${RED}❌ Build échoué${NC}"
  echo -e "${YELLOW}Voir /tmp/build.log pour les détails${NC}"
  exit 1
fi

# Résumé
echo ""
echo "=============================================="
echo -e "${GREEN}✅ Tous les tests sont passés !${NC}"
echo ""
echo "📊 Résumé des changements:"
echo "  - 2 fichiers partagés créés (rag-search.ts, bilingual-labels.ts)"
echo "  - 6 composants modifiés (Consultation + Assistant)"
echo "  - 4 traductions ajoutées (FR + AR)"
echo "  - 2 nouveaux boutons de navigation"
echo "  - ~150 lignes de code dupliqué éliminées"
echo ""
echo "📖 Documentation: docs/INTEROP_CONSULTATION_ASSISTANT.md"
echo ""
echo "🚀 Prêt pour les tests end-to-end !"
