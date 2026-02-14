#!/bin/bash

# Script de correction automatique des classes dark mode
# Corrige les 94 issues restantes détectées par check-dark-mode.sh

echo "🔧 Correction automatique mode sombre..."

# Liste des fichiers à corriger
FILES=(
  "components/parametres/CabinetForm.tsx"
  "components/super-admin/monitoring/SystemConfigTab.tsx"
  "components/super-admin/monitoring/ConfigDriftTab.tsx"
  "components/knowledge-base/KnowledgeBaseUploadForm.tsx"
  "components/knowledge-base/KnowledgeBaseList.tsx"
  "components/knowledge-base/KnowledgeBaseStats.tsx"
  "components/dossiers/assistant/analysis/FactualAnalysisSection.tsx"
  "components/dossiers/assistant/CreateDossierModal.tsx"
  "components/dossiers/assistant/ActionsSection.tsx"
  "components/dossiers/assistant/RAGInsights.tsx"
  "components/dossiers/DossierFormAdvanced.tsx"
  "components/dossiers/DossierCommercialForm.tsx"
  "components/dossiers/InteretsCalculator.tsx"
  "components/templates/TemplatePreview.tsx"
  "components/parametres/CloudStorageConfig.tsx"
)

COUNT=0

for file in "${FILES[@]}"; do
  if [ -f "$file" ]; then
    echo "  Correction: $file"

    # Corrections groupées (sed in-place avec backup)
    sed -i.bak \
      -e 's/text-gray-900/text-foreground/g' \
      -e 's/text-gray-800/text-foreground/g' \
      -e 's/text-gray-700/text-foreground/g' \
      -e 's/text-gray-600/text-muted-foreground/g' \
      -e 's/text-gray-500/text-muted-foreground/g' \
      -e 's/text-gray-400/text-muted-foreground\/80/g' \
      -e 's/bg-white /bg-card /g' \
      -e 's/bg-gray-100 /bg-muted /g' \
      -e 's/bg-gray-50 /bg-muted /g' \
      -e 's/border-gray-300/border-border/g' \
      -e 's/border-gray-200/border-border/g' \
      "$file"

    # Supprimer le backup
    rm -f "$file.bak"

    ((COUNT++))
  else
    echo "  ⚠️  Fichier introuvable: $file"
  fi
done

echo ""
echo "✅ $COUNT fichiers corrigés"
echo ""
echo "🔍 Vérification résultat..."
bash scripts/check-dark-mode.sh | tail -5
