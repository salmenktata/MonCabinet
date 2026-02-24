#!/usr/bin/env python3
"""
Serveur HTTP minimal pour déclencher backups Qadhya
Écoute sur localhost:9999 (accessible uniquement depuis l'hôte et conteneurs)

Usage: python3 backup-server.py
"""

import json
import subprocess
import threading
import time
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

PORT = 9999
BACKUP_SCRIPT = "/opt/qadhya/backup.sh"


# État global du backup (thread-safe via GIL Python pour les booleans)
_backup_running = False
_backup_last_result = None


def _run_backup_thread():
    """Exécute le backup en arrière-plan (thread dédié)"""
    global _backup_running, _backup_last_result
    start_time = time.time()
    try:
        result = subprocess.run(
            ["bash", BACKUP_SCRIPT],
            capture_output=True,
            text=True,
            timeout=600,  # 10 minutes max
        )
        duration = time.time() - start_time
        if result.returncode == 0:
            _backup_last_result = {"success": True, "duration": f"{duration:.1f}s", "returncode": 0}
            print(f"✅ Backup réussi en {duration:.1f}s")
        else:
            _backup_last_result = {"success": False, "returncode": result.returncode, "stderr": result.stderr[:500]}
            print(f"❌ Backup échoué (code {result.returncode}): {result.stderr[:200]}")
    except subprocess.TimeoutExpired:
        _backup_last_result = {"success": False, "error": "Timeout (>10min)"}
        print("⏱️  Backup timeout")
    except Exception as e:
        _backup_last_result = {"success": False, "error": str(e)}
        print(f"💥 Erreur backup: {e}")
    finally:
        _backup_running = False


class BackupHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        """Health check + statut dernier backup"""
        if self.path == "/health":
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            response = {
                "status": "healthy",
                "service": "backup-server",
                "backup_running": _backup_running,
                "last_result": _backup_last_result,
            }
            self.wfile.write(json.dumps(response).encode())
        else:
            self.send_error(404, "Not found")

    def do_POST(self):
        """Déclencher backup (async — réponse immédiate)"""
        global _backup_running
        if self.path == "/backup":
            if _backup_running:
                self.send_response(409)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(json.dumps({"success": False, "error": "Backup déjà en cours"}).encode())
                return

            print(f"📦 Backup déclenché à {time.strftime('%Y-%m-%d %H:%M:%S')}")
            _backup_running = True
            thread = threading.Thread(target=_run_backup_thread, daemon=True)
            thread.start()

            # Répondre immédiatement — pas d'attente de fin de script
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            response = {
                "success": True,
                "message": "Backup lancé en arrière-plan",
                "duration": "en cours...",
            }
            self.wfile.write(json.dumps(response).encode())
        else:
            self.send_error(404, "Not found")

    def log_message(self, format, *args):
        """Silencieux (logs gérés par systemd)"""
        pass


def run_server():
    """Démarrer le serveur HTTP"""
    server_address = ("0.0.0.0", PORT)
    httpd = HTTPServer(server_address, BackupHandler)

    print(f"🚀 Backup API Server démarré sur port {PORT}")
    print(f"   Endpoint: http://localhost:{PORT}/backup")
    print(f"   Health:   http://localhost:{PORT}/health")
    print(f"   Script:   {BACKUP_SCRIPT}")
    print("   Arrêt:    Ctrl+C ou systemctl stop backup-server")
    print()

    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n🛑 Arrêt du serveur...")
        httpd.server_close()


if __name__ == "__main__":
    # Vérifier que le script backup existe
    if not Path(BACKUP_SCRIPT).is_file():
        print(f"❌ Script backup non trouvé: {BACKUP_SCRIPT}")
        exit(1)

    run_server()
