#!/bin/bash
#
# Script pour créer un tunnel SSH vers la base de données de production
# Usage: ./scripts/tunnel-prod-db.sh [start|stop|status]
#

REMOTE_HOST="root@84.247.165.187"
LOCAL_PORT=5434
REMOTE_PORT=5433
TUNNEL_NAME="postgres-prod-tunnel"

case "$1" in
  start)
    echo "🔌 Démarrage du tunnel SSH vers PostgreSQL prod..."
    echo "   Local:  localhost:$LOCAL_PORT"
    echo "   Remote: $REMOTE_HOST:$REMOTE_PORT"

    # Vérifier si le tunnel existe déjà
    if pgrep -f "ssh.*$LOCAL_PORT:localhost:$REMOTE_PORT.*$REMOTE_HOST" > /dev/null; then
      echo "⚠️  Le tunnel existe déjà"
      exit 0
    fi

    # Créer le tunnel
    ssh -o StrictHostKeyChecking=no -f -N -L $LOCAL_PORT:localhost:$REMOTE_PORT $REMOTE_HOST

    if [ $? -eq 0 ]; then
      echo "✅ Tunnel SSH créé avec succès"
      echo ""
      echo "📝 Connection string pour prod:"
      echo "   DATABASE_URL=postgresql://moncabinet:password@localhost:$LOCAL_PORT/qadhya"
    else
      echo "❌ Erreur lors de la création du tunnel"
      exit 1
    fi
    ;;

  stop)
    echo "🛑 Arrêt du tunnel SSH..."
    PID=$(pgrep -f "ssh.*$LOCAL_PORT:localhost:$REMOTE_PORT.*$REMOTE_HOST")

    if [ -z "$PID" ]; then
      echo "⚠️  Aucun tunnel actif trouvé"
      exit 0
    fi

    kill $PID
    echo "✅ Tunnel SSH arrêté (PID: $PID)"
    ;;

  status)
    PID=$(pgrep -f "ssh.*$LOCAL_PORT:localhost:$REMOTE_PORT.*$REMOTE_HOST")

    if [ -z "$PID" ]; then
      echo "❌ Tunnel SSH inactif"
      exit 1
    else
      echo "✅ Tunnel SSH actif (PID: $PID)"
      echo "   localhost:$LOCAL_PORT → $REMOTE_HOST:$REMOTE_PORT"

      # Tester la connexion
      if command -v psql &> /dev/null; then
        echo ""
        echo "🧪 Test de connexion..."
        PGPASSWORD=password psql -h localhost -p $LOCAL_PORT -U moncabinet -d moncabinet -c "SELECT 1 as test;" 2>/dev/null
        if [ $? -eq 0 ]; then
          echo "✅ Connexion PostgreSQL OK"
        else
          echo "❌ Connexion PostgreSQL échouée"
        fi
      fi
    fi
    ;;

  *)
    echo "Usage: $0 {start|stop|status}"
    echo ""
    echo "Commandes:"
    echo "  start  - Démarre le tunnel SSH vers PostgreSQL prod (port $LOCAL_PORT)"
    echo "  stop   - Arrête le tunnel SSH"
    echo "  status - Vérifie l'état du tunnel"
    exit 1
    ;;
esac
