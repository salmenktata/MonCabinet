#!/bin/bash

################################################################################
# Script d'installation automatique MonCabinet sur VPS Contabo
#
# Ce script installe et configure automatiquement :
# - Docker + Docker Compose
# - Nginx (reverse proxy)
# - Certbot (SSL Let's Encrypt)
# - Configuration firewall
# - Deploiement de l'application via Docker Compose
#
# Usage: sudo bash setup-vps.sh
################################################################################

set -e  # Arreter en cas d'erreur

# Couleurs pour les messages
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Fonction pour afficher les messages
print_message() {
    echo -e "${BLUE}[MonCabinet]${NC} $1"
}

print_success() {
    echo -e "${GREEN}✓${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

print_error() {
    echo -e "${RED}✗${NC} $1"
}

# Verifier que le script est execute en tant que root
if [ "$EUID" -ne 0 ]; then
    print_error "Ce script doit etre execute en tant que root (sudo)"
    exit 1
fi

clear
echo "╔════════════════════════════════════════════════════════════╗"
echo "║                                                            ║"
echo "║     Installation MonCabinet sur VPS Contabo               ║"
echo "║     Plateforme de gestion de cabinet juridique            ║"
echo "║                                                            ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""

# ============================================================================
# ETAPE 1 : COLLECTE DES INFORMATIONS
# ============================================================================

print_message "Configuration initiale - Veuillez repondre aux questions suivantes :"
echo ""

read -p "Nom de domaine (ex: moncabinet.tn) : " DOMAIN_NAME
read -p "Email pour les certificats SSL (ex: admin@moncabinet.tn) : " SSL_EMAIL
read -p "URL du repository Git (ex: https://github.com/user/Avocat.git) : " GIT_REPO

# Creer un utilisateur non-root
read -p "Creer un utilisateur non-root ? (o/n, defaut: o) : " CREATE_USER
CREATE_USER=${CREATE_USER:-o}

if [ "$CREATE_USER" = "o" ]; then
    read -p "Nom d'utilisateur (defaut: moncabinet) : " USERNAME
    USERNAME=${USERNAME:-moncabinet}
fi

APP_PORT=3000
APP_DIR="/opt/moncabinet"

echo ""
print_message "Recapitulatif de la configuration :"
echo "  - Domaine : $DOMAIN_NAME"
echo "  - Email SSL : $SSL_EMAIL"
echo "  - Repository : $GIT_REPO"
echo "  - Port application (Nginx -> Docker) : $APP_PORT"
echo "  - Repertoire : $APP_DIR"
if [ "$CREATE_USER" = "o" ]; then
    echo "  - Utilisateur : $USERNAME"
fi
echo ""

read -p "Confirmer et continuer ? (o/n) : " CONFIRM
if [ "$CONFIRM" != "o" ]; then
    print_error "Installation annulee"
    exit 1
fi

# ============================================================================
# ETAPE 2 : MISE A JOUR DU SYSTEME
# ============================================================================

print_message "Etape 1/7 : Mise a jour du systeme..."

apt update && apt upgrade -y
apt install -y curl wget git ufw ca-certificates

print_success "Systeme mis a jour"

# ============================================================================
# ETAPE 3 : CREATION UTILISATEUR NON-ROOT
# ============================================================================

if [ "$CREATE_USER" = "o" ]; then
    print_message "Etape 2/7 : Creation de l'utilisateur $USERNAME..."

    if id "$USERNAME" &>/dev/null; then
        print_warning "L'utilisateur $USERNAME existe deja"
    else
        useradd -m -s /bin/bash "$USERNAME"
        usermod -aG sudo "$USERNAME"
        print_success "Utilisateur $USERNAME cree"
    fi
fi

# ============================================================================
# ETAPE 4 : CONFIGURATION FIREWALL
# ============================================================================

print_message "Etape 3/7 : Configuration du firewall..."

ufw --force disable
ufw --force reset

# Autoriser SSH
ufw allow 22/tcp

# Autoriser HTTP et HTTPS
ufw allow 80/tcp
ufw allow 443/tcp

# Activer le firewall
ufw --force enable

print_success "Firewall configure (SSH:22, HTTP:80, HTTPS:443)"

# ============================================================================
# ETAPE 5 : INSTALLATION DOCKER
# ============================================================================

print_message "Etape 4/7 : Installation de Docker + Compose..."

apt install -y docker.io docker-compose-plugin
systemctl enable --now docker

# Ajouter l'utilisateur au groupe docker
if [ "$CREATE_USER" = "o" ]; then
    usermod -aG docker "$USERNAME"
fi

print_success "Docker installe"

# ============================================================================
# ETAPE 6 : INSTALLATION ET CONFIGURATION NGINX
# ============================================================================

print_message "Etape 5/7 : Installation et configuration de Nginx..."

apt install -y nginx

# Creer la configuration Nginx
cat > /etc/nginx/sites-available/$DOMAIN_NAME <<NGINX_EOF
server {
    listen 80;
    listen [::]:80;
    server_name $DOMAIN_NAME www.$DOMAIN_NAME;

    # Limite de taille pour les uploads
    client_max_body_size 10M;

    location / {
        proxy_pass http://localhost:$APP_PORT;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;

        # Timeouts
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    # Optimisation pour les assets statiques Next.js
    location /_next/static/ {
        proxy_pass http://localhost:$APP_PORT;
        proxy_http_version 1.1;
        proxy_cache_bypass \$http_upgrade;

        # Cache cote navigateur pour 1 an
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # Logs
    access_log /var/log/nginx/$DOMAIN_NAME.access.log;
    error_log /var/log/nginx/$DOMAIN_NAME.error.log;
}
NGINX_EOF

# Activer le site
ln -sf /etc/nginx/sites-available/$DOMAIN_NAME /etc/nginx/sites-enabled/

# Desactiver le site par defaut
rm -f /etc/nginx/sites-enabled/default

# Tester la configuration
nginx -t

# Redemarrer Nginx
systemctl restart nginx
systemctl enable nginx

print_success "Nginx configure pour $DOMAIN_NAME"

# ============================================================================
# ETAPE 7 : INSTALLATION CERTBOT
# ============================================================================

print_message "Etape 6/7 : Installation de Certbot..."

apt install -y certbot python3-certbot-nginx

print_success "Certbot installe"

# ============================================================================
# ETAPE 8 : DEPLOIEMENT DE L'APPLICATION
# ============================================================================

print_message "Etape 7/7 : Deploiement de l'application..."

# Creer le repertoire
mkdir -p "$APP_DIR"
cd "$APP_DIR"

# Cloner le repository
print_message "Clonage du repository..."
if [ -d "$APP_DIR/.git" ]; then
    print_warning "Le repository existe deja, mise a jour..."
    git pull origin main || git pull origin master
else
    git clone "$GIT_REPO" .
fi

# Creer le fichier .env.production
print_message "Configuration des variables d'environnement..."
if [ ! -f "$APP_DIR/.env.production" ]; then
    cp "$APP_DIR/.env.production.example" "$APP_DIR/.env.production"
fi

# Mettre a jour le domaine dans .env.production
sed -i "s|^NEXT_PUBLIC_APP_URL=.*|NEXT_PUBLIC_APP_URL=https://$DOMAIN_NAME|" "$APP_DIR/.env.production"
sed -i "s|^NEXT_PUBLIC_APP_DOMAIN=.*|NEXT_PUBLIC_APP_DOMAIN=$DOMAIN_NAME|" "$APP_DIR/.env.production"
sed -i "s|^NEXTAUTH_URL=.*|NEXTAUTH_URL=https://$DOMAIN_NAME|" "$APP_DIR/.env.production"

print_warning "IMPORTANT : Editez le fichier $APP_DIR/.env.production pour ajouter vos cles API"

# S'assurer que les scripts sont executables
chmod +x "$APP_DIR/deploy.sh" "$APP_DIR/backup.sh" || true

# Demarrer les services
read -p "Utiliser docker-compose.prod.yml (image pre-build)? (o/n, defaut: n) : " USE_PREBUILT
USE_PREBUILT=${USE_PREBUILT:-n}

if [ "$USE_PREBUILT" = "o" ]; then
    docker compose -f docker-compose.prod.yml up -d
else
    docker compose up -d --build
fi

# Health check
print_message "Health check..."
MAX_RETRIES=10
RETRY_COUNT=0
HEALTH_URL="http://localhost:$APP_PORT/api/health"

while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
  if curl -f -s "$HEALTH_URL" > /dev/null 2>&1; then
    print_success "Application demarree avec succes"
    break
  else
    RETRY_COUNT=$((RETRY_COUNT + 1))
    sleep 5
  fi
done

if [ $RETRY_COUNT -eq $MAX_RETRIES ]; then
  print_warning "Health check echoue. Verifier les logs: docker compose logs -f --tail=100"
fi

# Changer les permissions
if [ "$CREATE_USER" = "o" ]; then
    chown -R "$USERNAME:$USERNAME" "$APP_DIR"
fi

# ============================================================================
# CONFIGURATION SSL (optionnel)
# ============================================================================

echo ""
print_message "Configuration SSL Let's Encrypt"
print_warning "Avant de continuer, assurez-vous que :"
print_warning "  1. Votre domaine $DOMAIN_NAME pointe vers ce serveur"
print_warning "  2. Les enregistrements DNS sont propages (peut prendre jusqu'a 48h)"
echo ""

read -p "Voulez-vous configurer SSL maintenant ? (o/n) : " CONFIGURE_SSL

if [ "$CONFIGURE_SSL" = "o" ]; then
    print_message "Generation du certificat SSL..."

    certbot --nginx -d "$DOMAIN_NAME" -d "www.$DOMAIN_NAME" \
        --non-interactive \
        --agree-tos \
        --email "$SSL_EMAIL" \
        --redirect

    if [ $? -eq 0 ]; then
        print_success "Certificat SSL configure avec succes"
        print_success "Votre site est accessible sur https://$DOMAIN_NAME"
    else
        print_error "Erreur lors de la configuration SSL"
        print_warning "Vous pouvez reessayer plus tard avec :"
        print_warning "  sudo certbot --nginx -d $DOMAIN_NAME -d www.$DOMAIN_NAME"
    fi
else
    print_warning "SSL non configure. Pour le configurer plus tard :"
    print_warning "  sudo certbot --nginx -d $DOMAIN_NAME -d www.$DOMAIN_NAME"
fi

# ============================================================================
# RECAPITULATIF FINAL
# ============================================================================

echo ""
echo "╔════════════════════════════════════════════════════════════╗"
echo "║                                                            ║"
echo "║              ✅ INSTALLATION TERMINEE !                    ║"
echo "║                                                            ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""
print_success "MonCabinet est maintenant installe sur votre VPS"
echo ""
echo "📋 INFORMATIONS IMPORTANTES :"
echo ""
echo "  🌐 Domaine : $DOMAIN_NAME"
echo "  📁 Repertoire : $APP_DIR"
echo "  🔧 Port application : $APP_PORT"
if [ "$CREATE_USER" = "o" ]; then
    echo "  👤 Utilisateur : $USERNAME"
    echo "  ⚠  Pensez a vous reconnecter pour utiliser Docker sans sudo"
fi
echo ""
echo "📝 PROCHAINES ETAPES :"
echo ""
echo "  1️⃣  Editez les variables d'environnement :"
echo "      nano $APP_DIR/.env.production"
echo ""
echo "  2️⃣  Redemarrez la stack apres modification :"
echo "      cd $APP_DIR && docker compose up -d"
echo ""
echo "  3️⃣  Dans Cloudflare, mettez a jour l'enregistrement A :"
echo "      Type: A"
echo "      Nom: @"
echo "      Contenu: $(curl -s ifconfig.me)"
echo "      Proxy: Active (☁️)"
echo ""
echo "  4️⃣  Configurez SSL/TLS dans Cloudflare :"
echo "      Mode: Full (strict)"
echo ""
echo "🔧 COMMANDES UTILES :"
echo ""
echo "  • Voir les logs : docker compose logs -f --tail=100"
echo "  • Redemarrer : docker compose restart"
echo "  • Statut : docker compose ps"
echo "  • Deployer : cd $APP_DIR && ./deploy.sh"
echo "  • Backup : cd $APP_DIR && ./backup.sh"
echo "  • Logs Nginx : tail -f /var/log/nginx/$DOMAIN_NAME.error.log"
echo ""
echo "📚 DOCUMENTATION :"
echo "  • Voir : $APP_DIR/README-DEPLOYMENT.md"
echo ""
echo "🔒 SECURITE :"
echo "  • Firewall UFW actif (SSH:22, HTTP:80, HTTPS:443)"
echo "  • SSL Let's Encrypt : $([ "$CONFIGURE_SSL" = "o" ] && echo "✅ Configure" || echo "⚠️  A configurer")"
echo ""
print_warning "N'oubliez pas de configurer vos cles API dans .env.production !"
echo ""
