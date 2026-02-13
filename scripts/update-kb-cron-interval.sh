#!/bin/bash
#
# Script pour accélérer l'indexation KB en production (Phase 2.2)
#
# 🎯 Objectif : Coverage 100% en 5-7j (au lieu de 16j)
# 📊 Gain combiné : 6.25× plus rapide
#   - KB_BATCH_SIZE: 2 → 5 (gain 2.5×)
#   - Intervalle cron: 5min → 2min (gain 2.5×)
#
# ⚠️ IMPORTANT : À exécuter MANUELLEMENT sur le VPS après déploiement
#

set -e

echo "======================================================================"
echo "🚀 Phase 2.2 : Accélération Batch KB - Modification Cron VPS"
echo "======================================================================"
echo ""

# Couleurs
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Vérifier si on est sur le VPS
if [ ! -d "/opt/qadhya" ]; then
  echo -e "${RED}❌ Erreur : Ce script doit être exécuté sur le VPS Contabo${NC}"
  echo ""
  echo "Pour exécuter sur le VPS :"
  echo "  ssh root@84.247.165.187"
  echo "  bash /opt/qadhya/scripts/update-kb-cron-interval.sh"
  exit 1
fi

echo -e "${YELLOW}📋 Configuration actuelle du cron...${NC}"
crontab -l | grep "index-kb" || echo "Aucun cron index-kb trouvé"
echo ""

echo -e "${YELLOW}🔧 Modification de l'intervalle...${NC}"
echo "  Avant : */5 * * * * (toutes les 5 minutes)"
echo "  Après : */2 * * * * (toutes les 2 minutes)"
echo ""

# Backup crontab actuel
BACKUP_FILE="/opt/qadhya/backups/crontab-$(date +%Y%m%d-%H%M%S).bak"
mkdir -p /opt/qadhya/backups
crontab -l > "$BACKUP_FILE"
echo -e "${GREEN}✅ Backup crontab : $BACKUP_FILE${NC}"
echo ""

# Modifier l'intervalle
crontab -l | sed 's#\*/5 \* \* \* \* /opt/qadhya/scripts/cron-index-kb.sh#*/2 * * * * /opt/qadhya/scripts/cron-index-kb.sh#g' | crontab -

echo -e "${GREEN}✅ Intervalle cron modifié : 5min → 2min${NC}"
echo ""

echo -e "${YELLOW}📋 Configuration finale...${NC}"
crontab -l | grep "index-kb"
echo ""

echo "======================================================================"
echo -e "${GREEN}✅ Phase 2.2 : Cron KB accéléré avec succès${NC}"
echo "======================================================================"
echo ""
echo "📊 Impact attendu :"
echo "  - Batch size : 2 → 5 docs (gain 2.5×)"
echo "  - Intervalle : 5min → 2min (gain 2.5×)"
echo "  - Gain combiné : 6.25× plus rapide"
echo "  - Coverage 100% : 16 jours → 2.5 jours"
echo ""
echo "📈 Monitoring :"
echo "  - Dashboard : https://qadhya.tn/super-admin/monitoring?tab=kb-quality"
echo "  - Métriques : curl http://localhost:7003/api/admin/monitoring/metrics | jq '.kbStats'"
echo "  - Logs cron : tail -f /var/log/qadhya/cron-index-kb.log"
echo ""
echo "🔄 Pour restaurer l'ancien intervalle :"
echo "  crontab $BACKUP_FILE"
echo ""
