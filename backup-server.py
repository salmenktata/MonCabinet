#!/usr/bin/env python3
"""
Serveur HTTP minimal pour déclencher backups Qadhya
Écoute sur localhost:9999 (accessible uniquement depuis l'hôte et conteneurs)

Usage: python3 backup-server.py
"""

import json
import subprocess
import time
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

PORT = 9999
BACKUP_SCRIPT = "/opt/qadhya/backup.sh"


class BackupHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        """Health check"""
        if self.path == "/health":
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            response = {"status": "healthy", "service": "backup-server"}
            self.wfile.write(json.dumps(response).encode())
        else:
            self.send_error(404, "Not found")

    def do_POST(self):
        """Déclencher backup"""
        if self.path == "/backup":
            print(f"📦 Backup déclenché à {time.strftime('%Y-%m-%d %H:%M:%S')}")

            start_time = time.time()
            try:
                # Exécuter le script backup
                result = subprocess.run(
                    ["bash", BACKUP_SCRIPT],
                    capture_output=True,
                    text=True,
                    timeout=300,  # 5 minutes max
                )

                duration = time.time() - start_time

                if result.returncode == 0:
                    # Succès
                    self.send_response(200)
                    self.send_header("Content-Type", "application/json")
                    self.end_headers()
                    response = {
                        "success": True,
                        "duration": f"{duration:.1f}s",
                        "message": "Backup terminé avec succès",
                        "output": result.stdout[:500] if result.stdout else None,
                    }
                    self.wfile.write(json.dumps(response).encode())
                    print(f"✅ Backup réussi en {duration:.1f}s")
                else:
                    # Échec
                    self.send_response(500)
                    self.send_header("Content-Type", "application/json")
                    self.end_headers()
                    response = {
                        "success": False,
                        "error": "Échec du backup",
                        "exitCode": result.returncode,
                        "stderr": result.stderr[:500] if result.stderr else None,
                    }
                    self.wfile.write(json.dumps(response).encode())
                    print(f"❌ Backup échoué (code {result.returncode})")

            except subprocess.TimeoutExpired:
                self.send_response(504)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                response = {
                    "success": False,
                    "error": "Timeout lors du backup (>5min)",
                }
                self.wfile.write(json.dumps(response).encode())
                print("⏱️  Backup timeout")

            except Exception as e:
                self.send_response(500)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                response = {
                    "success": False,
                    "error": "Erreur serveur",
                    "message": str(e),
                }
                self.wfile.write(json.dumps(response).encode())
                print(f"💥 Erreur: {e}")
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
