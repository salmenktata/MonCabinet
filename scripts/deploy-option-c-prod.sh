#!/bin/bash
#
# Script de déploiement Production - Option C Hybride
# Migration Ollama : Mode Rapide + Premium
#
# Usage: ./scripts/deploy-option-c-prod.sh
#

set -e  # Exit on error

VPS_HOST="root@84.247.165.187"
APP_DIR="/opt/moncabinet"

echo "╔══════════════════════════════════════════════════════════════╗"
echo "║     Déploiement Production - Option C Hybride Ollama        ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

# Fonction pour exécuter une commande sur le VPS
vps_exec() {
  ssh $VPS_HOST "$@"
}

# Fonction pour vérifier le statut
check_status() {
  if [ $? -eq 0 ]; then
    echo "✅ $1"
  else
    echo "❌ $1 - ÉCHEC"
    exit 1
  fi
}

# ============================================================================
# 1. VÉRIFICATIONS PRÉALABLES
# ============================================================================

echo "📋 1. Vérifications préalables..."
echo ""

echo "→ Vérification connexion VPS..."
vps_exec "echo 'Connexion OK'" > /dev/null
check_status "Connexion VPS"

echo "→ Vérification répertoire app..."
vps_exec "test -d $APP_DIR"
check_status "Répertoire $APP_DIR existe"

# ============================================================================
# 2. INSTALLATION/VÉRIFICATION OLLAMA
# ============================================================================

echo ""
echo "🤖 2. Configuration Ollama..."
echo ""

echo "→ Vérification installation Ollama..."
if vps_exec "which ollama" > /dev/null 2>&1; then
  echo "✅ Ollama déjà installé"
else
  echo "📥 Installation Ollama..."
  vps_exec "curl -fsSL https://ollama.com/install.sh | sh"
  check_status "Installation Ollama"
fi

echo "→ Configuration systemd override..."
vps_exec "mkdir -p /etc/systemd/system/ollama.service.d"
vps_exec "cat > /etc/systemd/system/ollama.service.d/override.conf << 'EOF'
[Service]
Environment=OLLAMA_HOST=0.0.0.0:11434
EOF"
check_status "Systemd override créé"

echo "→ Démarrage service Ollama..."
vps_exec "systemctl daemon-reload"
vps_exec "systemctl enable ollama"
vps_exec "systemctl restart ollama"
sleep 5
check_status "Service Ollama démarré"

echo "→ Configuration UFW..."
if vps_exec "ufw status | grep -q 11434"; then
  echo "✅ Règle UFW déjà existante"
else
  vps_exec "ufw allow from 172.16.0.0/12 to any port 11434 comment 'Docker to Ollama'"
  check_status "Règle UFW ajoutée"
fi

echo "→ Téléchargement modèles Ollama..."
echo "   • qwen3:8b (chat) - peut prendre 5-10 min..."
vps_exec "ollama pull qwen3:8b" > /dev/null
check_status "Modèle qwen3:8b téléchargé"

echo "   • qwen3-embedding:0.6b (embeddings) - peut prendre 2-5 min..."
vps_exec "ollama pull qwen3-embedding:0.6b" > /dev/null
check_status "Modèle qwen3-embedding téléchargé"

echo "→ Vérification modèles installés..."
vps_exec "ollama list"

# ============================================================================
# 3. MISE À JOUR CODE
# ============================================================================

echo ""
echo "📦 3. Mise à jour du code..."
echo ""

echo "→ Git pull..."
vps_exec "cd $APP_DIR && git pull origin main"
check_status "Code mis à jour"

echo "→ Vérification variables .env.production..."
echo ""
echo "⚠️  IMPORTANT : Vérifiez que votre .env.production contient :"
echo ""
cat << 'EOF'
# Ollama (Mode Rapide)
OLLAMA_ENABLED=true
OLLAMA_BASE_URL=http://host.docker.internal:11434
OLLAMA_CHAT_MODEL=qwen3:8b
OLLAMA_EMBEDDING_MODEL=qwen3-embedding:0.6b
OLLAMA_CHAT_TIMEOUT_DEFAULT=120000

# Cloud Providers (Mode Premium)
GROQ_API_KEY=gsk_...
DEEPSEEK_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...  # Optionnel

# NE PLUS UTILISER
# OPENAI_API_KEY (supprimé avec Option C)
EOF
echo ""

read -p "Voulez-vous éditer .env.production maintenant ? (y/N) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
  ssh -t $VPS_HOST "nano $APP_DIR/.env.production"
fi

# ============================================================================
# 4. REBUILD & REDÉPLOIEMENT DOCKER
# ============================================================================

echo ""
echo "🐳 4. Rebuild Docker..."
echo ""

echo "→ Arrêt des containers..."
vps_exec "cd $APP_DIR && docker-compose -f docker-compose.prod.yml down"
check_status "Containers arrêtés"

echo "→ Rebuild de l'image (peut prendre 5-10 min)..."
vps_exec "cd $APP_DIR && docker-compose -f docker-compose.prod.yml build --no-cache"
check_status "Image rebuilded"

echo "→ Démarrage des containers..."
vps_exec "cd $APP_DIR && docker-compose -f docker-compose.prod.yml up -d"
check_status "Containers démarrés"

# ============================================================================
# 5. VÉRIFICATIONS POST-DÉPLOIEMENT
# ============================================================================

echo ""
echo "🔍 5. Vérifications post-déploiement..."
echo ""

echo "→ Attente démarrage app (30s)..."
sleep 30

echo "→ Vérification containers..."
vps_exec "docker ps --filter name=moncabinet"

echo "→ Vérification santé Ollama..."
if vps_exec "curl -s http://localhost:11434/api/tags" > /dev/null; then
  echo "✅ Ollama accessible"
else
  echo "❌ Ollama non accessible"
fi

echo "→ Vérification logs Next.js (dernières 20 lignes)..."
vps_exec "docker logs --tail 20 moncabinet-nextjs"

echo ""
echo "→ Vérification mode hybride dans les logs..."
vps_exec "docker logs --tail 100 moncabinet-nextjs | grep -i 'ollama\|groq\|deepseek' | tail -10" || echo "Aucun log LLM pour l'instant"

# ============================================================================
# 6. TESTS DE SMOKE
# ============================================================================

echo ""
echo "🧪 6. Tests de fumée..."
echo ""

echo "→ Test endpoint health..."
if vps_exec "curl -s https://moncabinet.tn/api/health | grep -q 'ok'" 2>/dev/null; then
  echo "✅ API health OK"
else
  echo "⚠️  API health non accessible (peut être normal si route n'existe pas)"
fi

# ============================================================================
# 7. RÉSUMÉ FINAL
# ============================================================================

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║                    ✅ DÉPLOIEMENT TERMINÉ                    ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""
echo "📊 État du système :"
echo ""
echo "   • Ollama service     : systemctl status ollama"
echo "   • Modèles installés  : ollama list"
echo "   • Containers Docker  : docker ps"
echo "   • Logs Next.js       : docker logs -f moncabinet-nextjs"
echo ""
echo "🧪 Pour tester :"
echo ""
echo "   1. Mode Rapide (Ollama) :"
echo "      → Accéder à https://moncabinet.tn/chat-test"
echo "      → Toggle désactivé (⚡)"
echo "      → Poser une question juridique"
echo ""
echo "   2. Mode Premium (Cloud) :"
echo "      → Activer le toggle (🧠)"
echo "      → Poser la même question"
echo "      → Comparer la qualité"
echo ""
echo "📈 Monitoring :"
echo ""
echo "   • Logs LLM : docker logs -f moncabinet-nextjs | grep LLM-Fallback"
echo "   • Logs RAG : docker logs -f moncabinet-nextjs | grep RAG"
echo ""
echo "💰 Économies attendues :"
echo ""
echo "   • Avant : ~100-120€/mois (OpenAI)"
echo "   • Après : 0-15€/mois (Ollama + cloud premium)"
echo "   • Économie : ~1200€/an 🎉"
echo ""
echo "📚 Documentation :"
echo ""
echo "   • Guide complet : docs/MIGRATION_OLLAMA_OPTION_C.md"
echo "   • Troubleshooting : docs/PHASE2_INTEGRATION_COMPLETE.md"
echo ""
echo "✅ Migration Option C déployée avec succès !"
echo ""
