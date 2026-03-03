#!/bin/bash
# Script pour configurer tous les crontabs de monitoring
# À exécuter en tant que root sur le serveur

set -e

echo "📅 Configuration des crontabs pour monitoring Qadhya"
echo "=================================================="

# Créer le dossier de logs s'il n'existe pas
mkdir -p /var/log/qadhya
chmod 755 /var/log/qadhya

# Backup du crontab actuel
crontab -l > /tmp/crontab.backup.$(date +%Y%m%d_%H%M%S) 2>/dev/null || true

# Créer le nouveau crontab
cat > /tmp/qadhya-crontab << 'CRONTAB'
# Qadhya - Crons de monitoring automatiques
# Générés par setup-crontabs.sh

# Monitor OpenAI Budget - Quotidien à 9h
0 9 * * * /opt/qadhya/scripts/cron-monitor-openai.sh >> /var/log/qadhya/openai-monitor.log 2>&1

# Check System Alerts - Toutes les heures
0 * * * * /opt/qadhya/scripts/cron-check-alerts.sh >> /var/log/qadhya/alerts.log 2>&1

# Refresh Materialized Views - Toutes les 6 heures
0 */6 * * * /opt/qadhya/scripts/cron-refresh-mv-metadata.sh >> /var/log/qadhya/refresh-mv.log 2>&1

# Reanalyze KB Failures - Quotidien à 3h
0 3 * * * /opt/qadhya/scripts/cron-reanalyze-kb-failures.sh >> /var/log/qadhya/reanalyze-kb.log 2>&1

# Index KB Progressive - Toutes les 5 minutes
*/5 * * * * /opt/qadhya/scripts/index-kb-progressive.sh >> /var/log/qadhya/index-kb.log 2>&1

# Acquisition Weekly Report - Dimanche à 10h
0 10 * * 0 cd /opt/qadhya && npx tsx scripts/cron-acquisition-weekly.ts >> /var/log/qadhya/acquisition.log 2>&1

# Analyse massive KB week-end (Ollama gratuit) - Sam & Dim toutes les 2h (8h-22h)
0 8,10,12,14,16,18,20,22 * * 6,0 /opt/qadhya/scripts/cron-analyze-kb-weekend.sh >> /var/log/qadhya/analyze-kb-weekend.log 2>&1

# Réindexation progressive OpenAI embeddings - Quotidien à 5h
0 5 * * * /opt/qadhya/scripts/cron-reindex-kb-openai.sh >> /var/log/qadhya/reindex-kb-openai.log 2>&1

# Re-consolidation documents juridiques stale - Quotidien à 2h
0 2 * * * /opt/qadhya/scripts/cron-reconsolidate-legal-docs.sh >> /var/log/qadhya/reconsolidate-legal-docs.log 2>&1

# Cleanup old cron executions - Quotidien à 4h
0 4 * * * docker exec 275ce01791bf_qadhya-postgres psql -U moncabinet -d qadhya -c "SELECT cleanup_old_cron_executions();" >> /var/log/qadhya/cleanup.log 2>&1

# Crawl Constitution IORT - 1er du mois à 3h (OCR 42 pages, ~7min)
0 3 1 * * /opt/qadhya/scripts/cron-crawl-iort-constitution.sh >> /var/log/qadhya/iort-constitution.log 2>&1

CRONTAB

# Installer le crontab
crontab /tmp/qadhya-crontab

echo ""
echo "✅ Crontabs configurés avec succès!"
echo ""
echo "📋 Liste des crons installés:"
crontab -l | grep -v '^#' | grep -v '^$'
echo ""
echo "📊 Logs disponibles dans: /var/log/qadhya/"
echo ""
echo "🔍 Pour vérifier les exécutions:"
echo "   tail -f /var/log/qadhya/*.log"
echo ""
echo "🗄️  Pour voir l'historique en DB:"
echo "   SELECT * FROM cron_executions ORDER BY started_at DESC LIMIT 10;"
