#!/bin/bash
##
# Installation Script: Cron Trigger Server
# Installe et démarre le service systemd qui permet de déclencher les crons via HTTP
##

set -e

echo "🚀 Installation Cron Trigger Server"
echo "===================================="

# 1. Copier le script Python
echo "📂 Copie du script Python..."
cp /opt/qadhya/scripts/cron-trigger-server.py /opt/qadhya/scripts/cron-trigger-server.py
chmod +x /opt/qadhya/scripts/cron-trigger-server.py

# 2. Créer le fichier log s'il n'existe pas
echo "📝 Création fichier log..."
touch /var/log/qadhya/cron-trigger-server.log
chmod 644 /var/log/qadhya/cron-trigger-server.log

# 3. Copier le service systemd
echo "⚙️  Installation service systemd..."
cp /opt/qadhya/scripts/cron-trigger-server.service /etc/systemd/system/
chmod 644 /etc/systemd/system/cron-trigger-server.service

# 4. Reload systemd daemon
echo "🔄 Reload systemd..."
systemctl daemon-reload

# 5. Enable et start le service
echo "▶️  Démarrage du service..."
systemctl enable cron-trigger-server
systemctl restart cron-trigger-server

# 6. Vérifier le statut
echo ""
echo "✅ Installation terminée !"
echo ""
echo "📊 Statut du service:"
systemctl status cron-trigger-server --no-pager -l

echo ""
echo "🧪 Test du service:"
curl -s http://localhost:9998/health | jq .

echo ""
echo "📋 Commandes utiles:"
echo "  • Statut        : systemctl status cron-trigger-server"
echo "  • Logs live     : journalctl -u cron-trigger-server -f"
echo "  • Restart       : systemctl restart cron-trigger-server"
echo "  • Stop          : systemctl stop cron-trigger-server"
echo "  • Health check  : curl http://localhost:9998/health"
echo ""
