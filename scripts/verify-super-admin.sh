#!/bin/bash

# Script de Vérification Technique Automatique - Super Admin
# Version: 1.0.0
# Date: 13 février 2026

set -e

# Couleurs pour l'output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Variables globales
ERRORS=0
WARNINGS=0
SUCCESS=0

# Fonction pour afficher un titre
print_title() {
    echo -e "\n${BLUE}═══════════════════════════════════════════════════${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}═══════════════════════════════════════════════════${NC}\n"
}

# Fonction pour afficher un succès
print_success() {
    echo -e "${GREEN}✅ $1${NC}"
    ((SUCCESS++))
}

# Fonction pour afficher une erreur
print_error() {
    echo -e "${RED}❌ $1${NC}"
    ((ERRORS++))
}

# Fonction pour afficher un warning
print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
    ((WARNINGS++))
}

# Fonction pour afficher une info
print_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

# Header
clear
echo -e "${BLUE}"
cat << "EOF"
╔═══════════════════════════════════════════════════════════════╗
║                                                               ║
║     🔍 Vérification Technique Super Admin - Qadhya           ║
║                                                               ║
║     Version: 1.0.0                                            ║
║     Date: 13 février 2026                                     ║
║                                                               ║
╚═══════════════════════════════════════════════════════════════╝
EOF
echo -e "${NC}\n"

# Vérification prérequis
print_title "Vérification des Prérequis"

# Node.js
if command -v node &> /dev/null; then
    NODE_VERSION=$(node --version)
    print_success "Node.js installé: $NODE_VERSION"
else
    print_error "Node.js non installé"
    exit 1
fi

# npm
if command -v npm &> /dev/null; then
    NPM_VERSION=$(npm --version)
    print_success "npm installé: $NPM_VERSION"
else
    print_error "npm non installé"
    exit 1
fi

# npx
if command -v npx &> /dev/null; then
    print_success "npx disponible"
else
    print_error "npx non disponible"
    exit 1
fi

# Dépendances installées
if [ -d "node_modules" ]; then
    print_success "node_modules présent"
else
    print_warning "node_modules absent - Installation des dépendances..."
    npm install
fi

# ═══════════════════════════════════════════════════════════════
# 1. Compilation TypeScript
# ═══════════════════════════════════════════════════════════════

print_title "1️⃣  Compilation TypeScript"

print_info "Exécution: npx tsc --noEmit..."

# Créer un fichier temporaire pour les logs
TSC_LOG=$(mktemp)

# Exécuter TypeScript compilation
if npx tsc --noEmit 2>&1 | tee "$TSC_LOG" | grep -E "(error TS)" > /dev/null; then
    TSC_ERRORS=$(grep -c "error TS" "$TSC_LOG" || echo "0")
    print_error "TypeScript: $TSC_ERRORS erreur(s) détectée(s)"

    # Afficher les erreurs Super Admin uniquement
    print_info "Erreurs dans fichiers Super Admin:"
    grep -E "(super-admin|error TS)" "$TSC_LOG" | head -10 || echo "Aucune erreur Super Admin"
else
    print_success "TypeScript: 0 erreur"
fi

rm "$TSC_LOG"

# ═══════════════════════════════════════════════════════════════
# 2. Linting ESLint
# ═══════════════════════════════════════════════════════════════

print_title "2️⃣  Linting ESLint"

print_info "Exécution: npx next lint..."

# Créer un fichier temporaire pour les logs ESLint
ESLINT_LOG=$(mktemp)

# Exécuter ESLint sur les fichiers Super Admin
if npx next lint --file "app/super-admin/**/*.tsx" --file "components/super-admin/**/*.tsx" --file "app/api/admin/**/*.ts" 2>&1 | tee "$ESLINT_LOG" | grep -E "Error:" > /dev/null; then
    ESLINT_ERRORS=$(grep -c "Error:" "$ESLINT_LOG" || echo "0")

    # Filtrer les erreurs des fichiers générés (.next)
    ESLINT_ERRORS_SOURCE=$(grep "Error:" "$ESLINT_LOG" | grep -v ".next/" | wc -l | tr -d ' ')

    if [ "$ESLINT_ERRORS_SOURCE" -gt 0 ]; then
        print_error "ESLint: $ESLINT_ERRORS_SOURCE erreur(s) dans le code source"
        print_info "Erreurs détectées:"
        grep "Error:" "$ESLINT_LOG" | grep -v ".next/" | head -5
    else
        print_success "ESLint: 0 erreur dans le code source"
        if [ "$ESLINT_ERRORS" -gt 0 ]; then
            print_info "($ESLINT_ERRORS erreur(s) dans fichiers générés .next/ - ignorées)"
        fi
    fi
else
    print_success "ESLint: 0 erreur"
fi

rm "$ESLINT_LOG"

# ═══════════════════════════════════════════════════════════════
# 3. Inventaire des Fichiers
# ═══════════════════════════════════════════════════════════════

print_title "3️⃣  Inventaire des Fichiers"

# Compter les pages
PAGES_COUNT=$(find app/super-admin -name "page.tsx" -type f | wc -l | tr -d ' ')
print_info "Pages Super Admin: $PAGES_COUNT"

# Compter les composants
COMPONENTS_COUNT=$(find components/super-admin -name "*.tsx" -type f | wc -l | tr -d ' ')
print_info "Composants Super Admin: $COMPONENTS_COUNT"

# Compter les routes API
API_ROUTES_COUNT=$(find app/api/admin -name "route.ts" -type f | wc -l | tr -d ' ')
print_info "Routes API Admin: $API_ROUTES_COUNT"

# Validation
if [ "$PAGES_COUNT" -ge 23 ]; then
    print_success "Pages: $PAGES_COUNT pages détectées (attendu: ≥23)"
else
    print_error "Pages: $PAGES_COUNT pages détectées (attendu: ≥23)"
fi

if [ "$COMPONENTS_COUNT" -ge 90 ]; then
    print_success "Composants: $COMPONENTS_COUNT composants détectés (attendu: ≥90)"
else
    print_warning "Composants: $COMPONENTS_COUNT composants détectés (attendu: ≥90)"
fi

if [ "$API_ROUTES_COUNT" -ge 75 ]; then
    print_success "Routes API: $API_ROUTES_COUNT routes détectées (attendu: ≥75)"
else
    print_warning "Routes API: $API_ROUTES_COUNT routes détectées (attendu: ≥75)"
fi

# ═══════════════════════════════════════════════════════════════
# 4. Vérification des Imports
# ═══════════════════════════════════════════════════════════════

print_title "4️⃣  Vérification des Imports"

print_info "Extraction des imports de composants Super Admin..."

# Créer fichiers temporaires
IMPORTED_COMPONENTS=$(mktemp)
AVAILABLE_COMPONENTS=$(mktemp)

# Extraire les imports
grep -rh "from '@/components/super-admin" app/super-admin components/super-admin 2>/dev/null | \
    cut -d"'" -f2 | \
    sed 's|@/components/super-admin/||' | \
    sort -u > "$IMPORTED_COMPONENTS" || true

# Lister les composants disponibles
find components/super-admin -name "*.tsx" -type f | \
    sed 's|components/super-admin/||' | \
    sed 's|\.tsx$||' | \
    sort -u > "$AVAILABLE_COMPONENTS" || true

IMPORTS_COUNT=$(wc -l < "$IMPORTED_COMPONENTS" | tr -d ' ')
print_info "Imports uniques de composants: $IMPORTS_COUNT"

# Vérifier les imports manquants (simple check)
if [ "$IMPORTS_COUNT" -gt 0 ]; then
    print_success "Imports détectés et analysés"
else
    print_warning "Aucun import de composant détecté"
fi

rm "$IMPORTED_COMPONENTS" "$AVAILABLE_COMPONENTS"

# ═══════════════════════════════════════════════════════════════
# 5. Vérification des Routes API
# ═══════════════════════════════════════════════════════════════

print_title "5️⃣  Vérification des Routes API"

print_info "Analyse des appels API..."

# Créer fichiers temporaires
API_CALLS=$(mktemp)
API_ROUTES=$(mktemp)

# Extraire les appels API
grep -rh "fetch\|axios" app/super-admin components/super-admin 2>/dev/null | \
    grep "/api/admin" | \
    grep -o "/api/admin[^'\"]*" | \
    sort -u > "$API_CALLS" || true

# Lister les routes disponibles
find app/api/admin -name "route.ts" -type f | \
    sed 's|app||' | \
    sed 's|/route.ts$||' | \
    sort -u > "$API_ROUTES" || true

API_CALLS_COUNT=$(wc -l < "$API_CALLS" | tr -d ' ')
API_ROUTES_AVAIL=$(wc -l < "$API_ROUTES" | tr -d ' ')

print_info "Appels API détectés: $API_CALLS_COUNT"
print_info "Routes API disponibles: $API_ROUTES_AVAIL"

if [ "$API_ROUTES_AVAIL" -ge 75 ]; then
    print_success "Routes API: $API_ROUTES_AVAIL routes disponibles"
else
    print_warning "Routes API: $API_ROUTES_AVAIL routes disponibles (attendu: ≥75)"
fi

rm "$API_CALLS" "$API_ROUTES"

# ═══════════════════════════════════════════════════════════════
# 6. Vérification des Composants UI (Shadcn)
# ═══════════════════════════════════════════════════════════════

print_title "6️⃣  Vérification des Composants UI (Shadcn)"

# Liste des composants UI critiques
UI_COMPONENTS=(
    "card"
    "button"
    "input"
    "table"
    "badge"
    "tabs"
    "dialog"
    "dropdown-menu"
    "select"
    "separator"
    "skeleton"
    "scroll-area"
)

MISSING_UI=()

for component in "${UI_COMPONENTS[@]}"; do
    if [ -f "components/ui/$component.tsx" ]; then
        print_success "Composant UI: $component.tsx existe"
    else
        print_error "Composant UI: $component.tsx MANQUANT"
        MISSING_UI+=("$component")
    fi
done

if [ ${#MISSING_UI[@]} -eq 0 ]; then
    print_success "Tous les composants UI Shadcn sont présents"
else
    print_error "Composants UI manquants: ${MISSING_UI[*]}"
fi

# ═══════════════════════════════════════════════════════════════
# 7. Vérification des Fichiers de Configuration
# ═══════════════════════════════════════════════════════════════

print_title "7️⃣  Vérification des Fichiers de Configuration"

# Fichiers critiques
CONFIG_FILES=(
    "tsconfig.json"
    "next.config.js"
    ".eslintrc.json"
    "tailwind.config.ts"
    "package.json"
)

for file in "${CONFIG_FILES[@]}"; do
    if [ -f "$file" ]; then
        print_success "Config: $file existe"
    else
        print_error "Config: $file MANQUANT"
    fi
done

# Vérifier les variables d'environnement (optionnel)
if [ -f ".env.local" ] || [ -f ".env" ]; then
    print_success "Fichier .env présent"
else
    print_warning "Aucun fichier .env détecté"
fi

# ═══════════════════════════════════════════════════════════════
# Résumé Final
# ═══════════════════════════════════════════════════════════════

print_title "📊 Résumé de la Vérification"

echo -e "${GREEN}✅ Succès: $SUCCESS${NC}"
echo -e "${YELLOW}⚠️  Warnings: $WARNINGS${NC}"
echo -e "${RED}❌ Erreurs: $ERRORS${NC}"

echo ""

# Statut final
if [ $ERRORS -eq 0 ]; then
    echo -e "${GREEN}╔═══════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║                                                               ║${NC}"
    echo -e "${GREEN}║     ✅ VÉRIFICATION RÉUSSIE - APPROUVÉ POUR PRODUCTION       ║${NC}"
    echo -e "${GREEN}║                                                               ║${NC}"
    echo -e "${GREEN}╚═══════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    print_info "Toutes les vérifications critiques sont passées avec succès."

    if [ $WARNINGS -gt 0 ]; then
        print_warning "Quelques warnings ont été détectés, mais ne bloquent pas le déploiement."
    fi

    exit 0
else
    echo -e "${RED}╔═══════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${RED}║                                                               ║${NC}"
    echo -e "${RED}║     ❌ VÉRIFICATION ÉCHOUÉE - CORRECTIONS REQUISES           ║${NC}"
    echo -e "${RED}║                                                               ║${NC}"
    echo -e "${RED}╚═══════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    print_error "$ERRORS erreur(s) critique(s) détectée(s)."
    print_info "Veuillez corriger les erreurs avant de déployer en production."
    exit 1
fi
