#!/usr/bin/env python3
"""
Cron Trigger Server
HTTP server qui permet de déclencher les crons manuellement
Écoute sur localhost:9998 (accessible uniquement depuis le host et les conteneurs)
"""

import subprocess
import json
import os
from http.server import HTTPServer, BaseHTTPRequestHandler
from datetime import datetime

# Configuration
PORT = 9998
SCRIPTS_DIR = "/opt/qadhya/scripts"
LOG_FILE = "/var/log/qadhya/cron-trigger-server.log"

# Map des crons disponibles
CRON_SCRIPTS = {
    "monitor-openai": {
        "script": f"{SCRIPTS_DIR}/cron-monitor-openai.sh",
        "description": "Monitoring Budget OpenAI",
    },
    "check-alerts": {
        "script": f"{SCRIPTS_DIR}/cron-check-alerts.sh",
        "description": "Vérification Alertes Système",
    },
    "refresh-mv-metadata": {
        "script": f"{SCRIPTS_DIR}/cron-refresh-mv-metadata.sh",
        "description": "Rafraîchissement Vues Matérialisées",
    },
    "reanalyze-kb-failures": {
        "script": f"{SCRIPTS_DIR}/cron-reanalyze-kb-failures.sh",
        "description": "Réanalyse Échecs KB",
    },
    "index-kb-progressive": {
        "script": f"{SCRIPTS_DIR}/index-kb-progressive.sh",
        "description": "Indexation KB Progressive",
    },
    "acquisition-weekly": {
        "script": f"cd {SCRIPTS_DIR}/.. && npx tsx scripts/cron-acquisition-weekly.ts",
        "description": "Acquisition Hebdomadaire",
    },
    "cleanup-executions": {
        "script": f"{SCRIPTS_DIR}/cron-cleanup-executions.sh",
        "description": "Nettoyage Anciennes Exécutions",
    },
}


def log_message(message):
    """Log avec timestamp"""
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    log_line = f"[{timestamp}] {message}\n"
    print(log_line, end="")
    try:
        with open(LOG_FILE, "a") as f:
            f.write(log_line)
    except Exception as e:
        print(f"Failed to write to log file: {e}")


class CronTriggerHandler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        """Override to use custom logging"""
        log_message(f"{self.address_string()} - {format % args}")

    def do_GET(self):
        """Health check endpoint"""
        if self.path == "/health":
            self.send_response(200)
            self.send_header("Content-type", "application/json")
            self.end_headers()
            response = {
                "status": "healthy",
                "service": "cron-trigger-server",
                "port": PORT,
                "available_crons": len(CRON_SCRIPTS),
            }
            self.wfile.write(json.dumps(response).encode())
        else:
            self.send_error(404, "Not Found")

    def do_POST(self):
        """Trigger cron execution"""
        if self.path != "/trigger":
            self.send_error(404, "Not Found")
            return

        try:
            # Parse request body
            content_length = int(self.headers["Content-Length"])
            body = self.rfile.read(content_length)
            data = json.loads(body.decode())

            cron_name = data.get("cronName")
            if not cron_name:
                self.send_error(400, "cronName is required")
                return

            # Validate cron exists
            if cron_name not in CRON_SCRIPTS:
                self.send_error(400, f"Unknown cron: {cron_name}")
                return

            cron_config = CRON_SCRIPTS[cron_name]
            script = cron_config["script"]

            # Phase 6.2: Récupérer variables d'environnement optionnelles
            env_vars = data.get("envVars", {})

            # Verify script exists (for bash scripts)
            if script.endswith(".sh") and not os.path.exists(script):
                log_message(f"❌ Script not found: {script}")
                self.send_error(500, f"Script not found: {script}")
                return

            # Execute script in background (fire and forget)
            log_message(f"▶️  Triggering cron: {cron_name} ({cron_config['description']})")
            if env_vars:
                log_message(f"   📊 Parameters: {json.dumps(env_vars)}")

            # Phase 6.2: Préparer environnement avec variables personnalisées
            env = os.environ.copy()
            for key, value in env_vars.items():
                env[key] = str(value)
                log_message(f"   🔧 {key}={value}")

            # Use subprocess.Popen for true background execution
            log_dir = "/var/log/qadhya"
            log_file_path = f"{log_dir}/{cron_name}.log"

            with open(log_file_path, "a") as log_file:
                subprocess.Popen(
                    script,
                    shell=True,
                    stdout=log_file,
                    stderr=subprocess.STDOUT,
                    start_new_session=True,  # Detach from parent
                    env=env,  # Phase 6.2: Passer environnement personnalisé
                )

            log_message(f"✅ Cron started: {cron_name}")

            # Return success immediately
            self.send_response(200)
            self.send_header("Content-type", "application/json")
            self.end_headers()
            response = {
                "success": True,
                "cronName": cron_name,
                "description": cron_config["description"],
                "message": "Cron execution started in background",
                "logFile": log_file_path,
            }
            self.wfile.write(json.dumps(response).encode())

        except json.JSONDecodeError:
            self.send_error(400, "Invalid JSON")
        except Exception as e:
            log_message(f"❌ Error triggering cron: {str(e)}")
            self.send_error(500, f"Internal server error: {str(e)}")


def run_server():
    """Start HTTP server"""
    server_address = ("", PORT)
    httpd = HTTPServer(server_address, CronTriggerHandler)
    log_message(f"🚀 Cron Trigger Server starting on port {PORT}")
    log_message(f"📂 Scripts directory: {SCRIPTS_DIR}")
    log_message(f"📝 Log file: {LOG_FILE}")
    log_message(f"✅ {len(CRON_SCRIPTS)} crons configured")

    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        log_message("🛑 Server stopped by user")
        httpd.server_close()


if __name__ == "__main__":
    run_server()
