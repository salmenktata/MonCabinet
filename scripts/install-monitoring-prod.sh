#!/bin/bash
# Script d'installation Dashboard Monitoring + Alertes Email - Production
# Usage: bash scripts/install-monitoring-prod.sh

set -e

echo "═══════════════════════════════════════════════════════════"
echo "  🚀 Installation Monitoring KB + Alertes Email - Production"
echo "═══════════════════════════════════════════════════════════"
echo ""

# Vérifier qu'on est en SSH sur le serveur
if [ "$HOSTNAME" != "vmi2317395.contaboserver.net" ]; then
  echo "⚠️  Ce script doit être exécuté sur le serveur de production"
  echo "   Connectez-vous d'abord : ssh root@qadhya.tn"
  exit 1
fi

# Variables
ENV_FILE="/opt/qadhya/.env.production.local"
CRON_SCRIPT="/opt/qadhya/scripts/cron-check-alerts.sh"
LOG_DIR="/var/log/qadhya"
LOG_FILE="$LOG_DIR/alerts.log"

echo "📋 Vérification prérequis..."
echo ""

# Étape 1 : Vérifier déploiement code
echo "1️⃣  Vérification déploiement code..."
if [ ! -f "$CRON_SCRIPT" ]; then
  echo "   ❌ Script cron non trouvé : $CRON_SCRIPT"
  echo "   → Redéployez le code : git pull && docker restart qadhya-nextjs"
  exit 1
fi
echo "   ✅ Code déployé"
echo ""

# Étape 2 : Configuration Brevo
echo "2️⃣  Configuration Brevo API..."

if grep -q "BREVO_API_KEY" "$ENV_FILE" 2>/dev/null; then
  echo "   ✅ BREVO_API_KEY déjà configuré"
else
  echo ""
  echo "   ⚠️  BREVO_API_KEY non configuré"
  echo ""
  echo "   Pour obtenir une clé Brevo (gratuit, 300 emails/jour) :"
  echo "   1. Créer un compte : https://www.brevo.com"
  echo "   2. Settings → SMTP & API → API Keys"
  echo "   3. Copier la clé"
  echo ""
  read -p "   Entrez votre clé Brevo (ou Enter pour skip) : " BREVO_KEY

  if [ -n "$BREVO_KEY" ]; then
    echo "BREVO_API_KEY=$BREVO_KEY" >> "$ENV_FILE"
    echo "   ✅ BREVO_API_KEY ajouté"
  else
    echo "   ⚠️  BREVO_API_KEY non configuré - Alertes email désactivées"
  fi
fi

if grep -q "ALERT_EMAIL" "$ENV_FILE" 2>/dev/null; then
  echo "   ✅ ALERT_EMAIL déjà configuré"
else
  echo ""
  read -p "   Email destinataire alertes (défaut: admin@qadhya.tn) : " ALERT_EMAIL
  ALERT_EMAIL=${ALERT_EMAIL:-admin@qadhya.tn}
  echo "ALERT_EMAIL=$ALERT_EMAIL" >> "$ENV_FILE"
  echo "   ✅ ALERT_EMAIL = $ALERT_EMAIL"
fi
echo ""

# Étape 3 : Redémarrage container
echo "3️⃣  Redémarrage container Next.js..."
docker restart qadhya-nextjs > /dev/null 2>&1
sleep 5
echo "   ✅ Container redémarré"
echo ""

# Étape 4 : Préparation cron
echo "4️⃣  Préparation cron..."

# Créer répertoire logs
mkdir -p "$LOG_DIR"
touch "$LOG_FILE"
chmod 644 "$LOG_FILE"
echo "   ✅ Logs créés : $LOG_FILE"

# Rendre script exécutable
chmod +x "$CRON_SCRIPT"
echo "   ✅ Script exécutable : $CRON_SCRIPT"
echo ""

# Étape 5 : Installation cron
echo "5️⃣  Installation cron..."

# Vérifier si cron déjà installé
if crontab -l 2>/dev/null | grep -q "cron-check-alerts.sh"; then
  echo "   ✅ Cron déjà installé"
else
  echo ""
  echo "   Ajout de la ligne cron suivante :"
  echo "   0 * * * * $CRON_SCRIPT >> $LOG_FILE 2>&1"
  echo ""
  read -p "   Installer le cron ? (y/N) : " INSTALL_CRON

  if [ "$INSTALL_CRON" = "y" ] || [ "$INSTALL_CRON" = "Y" ]; then
    # Sauvegarder crontab actuel et ajouter nouvelle ligne
    (crontab -l 2>/dev/null; echo "0 * * * * $CRON_SCRIPT >> $LOG_FILE 2>&1") | crontab -
    echo "   ✅ Cron installé (vérification horaire)"
  else
    echo "   ⚠️  Cron non installé - À faire manuellement :"
    echo "      crontab -e"
    echo "      Ajouter : 0 * * * * $CRON_SCRIPT >> $LOG_FILE 2>&1"
  fi
fi
echo ""

# Étape 6 : Test
echo "6️⃣  Test système alertes..."
echo ""

# Tester script manuellement
echo "   Exécution test..."
$CRON_SCRIPT

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "  ✅ Installation Terminée !"
echo "═══════════════════════════════════════════════════════════"
echo ""
echo "📊 Dashboard Monitoring :"
echo "   https://qadhya.tn/super-admin/monitoring?tab=kb-quality"
echo ""
echo "🚨 Système Alertes :"
echo "   • Cron : Vérification horaire (ou 2h selon config)"
echo "   • Logs : tail -f $LOG_FILE"
echo "   • Test manuel : $CRON_SCRIPT"
echo ""
echo "📧 Configuration Email :"
CURRENT_EMAIL=$(grep ALERT_EMAIL "$ENV_FILE" 2>/dev/null | cut -d= -f2 || echo "Non configuré")
echo "   • Destinataire : $CURRENT_EMAIL"
echo "   • Provider : Brevo (300 emails/jour gratuit)"
echo ""
echo "🔍 Vérifications :"
echo "   • Cron installé : crontab -l | grep alerts"
echo "   • Variables env : docker exec qadhya-nextjs env | grep -E 'BREVO|ALERT'"
echo "   • Health check : curl https://qadhya.tn/api/health"
echo ""
echo "📚 Documentation :"
echo "   docs/ALERTS_SYSTEM.md"
echo ""
