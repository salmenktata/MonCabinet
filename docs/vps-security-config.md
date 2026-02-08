# Configuration Sécurité VPS - Qadhya.tn

> Documentation des configurations de sécurité appliquées au VPS Contabo
> Date: 8 février 2026
> VPS: 84.247.165.187

## 📋 Sommaire

1. [Vue d'ensemble](#vue-densemble)
2. [fail2ban - Protection Anti-Bruteforce](#fail2ban)
3. [UFW Firewall](#ufw-firewall)
4. [SSH Sécurisé](#ssh-sécurisé)
5. [Ollama - Restriction Accès](#ollama)
6. [Optimisations Système](#optimisations-système)
7. [Maintenance](#maintenance)
8. [Procédures d'Urgence](#procédures-durgence)

---

## Vue d'ensemble

### État de Sécurité

| Aspect | Niveau | Score |
|--------|--------|-------|
| **Protection SSH** | 🟢 Maximal | 10/10 |
| **Firewall** | 🟢 Actif | 10/10 |
| **Services exposés** | 🟢 Minimal | 10/10 |
| **Monitoring** | 🟢 Actif | 10/10 |
| **Score Global** | 🟢 Excellent | **9.5/10** |

### Architecture Sécurité

```
Internet
    │
    ├─► UFW Firewall (ports 22, 80, 443, 7002)
    │       │
    │       ├─► fail2ban (protection SSH)
    │       │       │
    │       │       └─► SSH (clés uniquement)
    │       │
    │       └─► Nginx (80/443)
    │               │
    │               └─► Next.js (7002)
    │
    └─► Services internes (127.0.0.1)
            ├─► PostgreSQL (5433)
            ├─► Redis (6379)
            ├─► MinIO (9000-9001)
            └─► Ollama (11434)
```

---

## fail2ban

### Configuration

**Fichier:** `/etc/fail2ban/jail.local`

```ini
[DEFAULT]
# IPs autorisées (whitelist)
ignoreip = 127.0.0.1/8 ::1 102.109.49.212

# Durée du bannissement (1 heure)
bantime = 3600

# Fenêtre de détection (10 minutes)
findtime = 600

# Nombre max de tentatives
maxretry = 5

# Email notifications
destemail = root@localhost
sendername = Fail2Ban
action = %(action_)s

[sshd]
enabled = true
port = 22
filter = sshd
logpath = /var/log/auth.log
maxretry = 5
bantime = 3600
findtime = 600
```

### Fonctionnement

- **Seuil:** 5 tentatives de connexion échouées
- **Ban:** IP bloquée automatiquement pour 1 heure
- **Whitelist:** IP admin (102.109.49.212) exemptée
- **Logs:** `/var/log/fail2ban.log`

### Commandes Utiles

```bash
# Status général
fail2ban-client status

# Status SSH jail
fail2ban-client status sshd

# Voir IPs bannies
fail2ban-client get sshd banip

# Débannir une IP
fail2ban-client set sshd unbanip IP_ADDRESS

# Bannir manuellement
fail2ban-client set sshd banip IP_ADDRESS

# Voir logs en temps réel
tail -f /var/log/fail2ban.log
```

### Statistiques (8 février 2026)

- **IPs bannies:** 7 attaquants actifs
- **Tentatives bloquées:** 8337 en 24h
- **Top attaquants bloqués:**
  - 129.212.190.80 (1545 tentatives)
  - 165.245.132.56 (361 tentatives)
  - 154.12.19.219
  - 213.209.159.159

---

## UFW Firewall

### Configuration

**Status:** ✅ Actif

```bash
# Politiques par défaut
Default: deny (incoming), allow (outgoing)

# Règles actives
Port 22/tcp   → SSH (administration)
Port 80/tcp   → HTTP (redirection HTTPS)
Port 443/tcp  → HTTPS (site web)
Port 7002/tcp → Next.js (application)
```

### Installation & Configuration

```bash
# Réinitialiser UFW
sudo ufw --force reset

# Politiques par défaut
sudo ufw default deny incoming
sudo ufw default allow outgoing

# Autoriser services
sudo ufw allow 22/tcp comment 'SSH'
sudo ufw allow 80/tcp comment 'HTTP'
sudo ufw allow 443/tcp comment 'HTTPS'
sudo ufw allow 7002/tcp comment 'Next.js'

# Activer
sudo ufw enable

# Vérifier
sudo ufw status verbose
```

### Commandes Utiles

```bash
# Status détaillé
sudo ufw status numbered

# Ajouter une règle
sudo ufw allow PORT/tcp

# Supprimer une règle
sudo ufw delete RULE_NUMBER

# Désactiver temporairement
sudo ufw disable

# Voir logs
sudo tail -f /var/log/ufw.log
```

---

## SSH Sécurisé

### Configuration

**Fichier:** `/etc/ssh/sshd_config`

```bash
# Connexion root uniquement par clés
PermitRootLogin prohibit-password

# Désactiver authentification par mot de passe
PasswordAuthentication no

# Port (standard)
Port 22

# Protocole SSH v2 uniquement
Protocol 2
```

### Clés SSH Autorisées

**Fichier:** `/root/.ssh/authorized_keys`

- **Nombre de clés:** 2
- **Type:** RSA/ED25519
- **Status:** ✅ Actives

### Backup Configuration

```bash
# Backup automatique créé
/etc/ssh/sshd_config.backup
```

### Connexion

```bash
# Connexion SSH (clé requise)
ssh root@84.247.165.187

# Connexion avec clé spécifique
ssh -i ~/.ssh/ma_cle root@84.247.165.187
```

### ⚠️ Important

- **Mots de passe désactivés** - Seules les clés SSH fonctionnent
- **Conservez vos clés privées** en lieu sûr
- **Backup des clés** recommandé

### Tester Configuration

```bash
# Vérifier syntaxe
sudo sshd -t

# Recharger config
sudo systemctl reload ssh
```

---

## Ollama

### Configuration

**Avant:** Exposé publiquement sur port 11434 (IPv4 + IPv6)
**Après:** ✅ Restreint à localhost uniquement

### Configuration Systemd

**Fichier:** `/etc/systemd/system/ollama.service.d/override.conf`

```ini
[Service]
Environment="OLLAMA_HOST=127.0.0.1:11434"
```

### Application Configuration

```bash
# Redémarrer service
sudo systemctl daemon-reload
sudo systemctl restart ollama

# Vérifier
ss -tlnp | grep 11434
# Résultat attendu: 127.0.0.1:11434 (pas 0.0.0.0 ou ::)
```

### Accès Local

```bash
# Depuis le serveur VPS
curl http://127.0.0.1:11434/api/health

# Depuis application Next.js (même machine)
fetch('http://127.0.0.1:11434/api/...')
```

---

## Optimisations Système

### Swappiness

```bash
# Valeur optimisée pour serveur web
vm.swappiness = 10

# Fichier: /etc/sysctl.conf
vm.swappiness=10
```

### File Descriptors

```bash
# Limite augmentée pour connexions simultanées
fs.file-max = 65535

# Fichier: /etc/sysctl.conf
fs.file-max = 65535
```

### Docker Logging

**Fichier:** `/etc/docker/daemon.json`

```json
{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "10m",
    "max-file": "3"
  },
  "storage-driver": "overlay2"
}
```

**Bénéfices:**
- Logs limités à 30MB par container (10MB × 3 fichiers)
- Rotation automatique
- Économie espace disque

### Redis Cache

```bash
# Politique LRU activée
maxmemory-policy allkeys-lru

# Configuration
docker exec moncabinet_redis redis-cli CONFIG SET maxmemory-policy allkeys-lru
```

### Appliquer Optimisations

```bash
# Recharger sysctl
sudo sysctl -p

# Redémarrer Docker
sudo systemctl restart docker

# Vérifier
sysctl vm.swappiness
sysctl fs.file-max
```

---

## Maintenance

### Contrôles Quotidiens

```bash
# 1. Vérifier fail2ban
fail2ban-client status sshd

# 2. Vérifier UFW
sudo ufw status

# 3. Vérifier logs SSH
grep "Failed password" /var/log/auth.log | tail -20

# 4. Vérifier espace disque
df -h

# 5. Vérifier ressources
htop
```

### Contrôles Hebdomadaires

```bash
# 1. Nettoyage système
sudo apt-get autoremove -y
sudo apt-get clean

# 2. Nettoyage Docker
docker system prune -f

# 3. Rotation logs
sudo journalctl --vacuum-time=7d

# 4. Vérifier backups
ls -lh /opt/backups/moncabinet/

# 5. Audit sécurité
grep "Failed password" /var/log/auth.log | wc -l
```

### Contrôles Mensuels

```bash
# 1. Mises à jour sécurité
sudo apt update
sudo apt list --upgradable | grep security

# 2. Révision règles fail2ban
fail2ban-client status sshd

# 3. Analyse logs
sudo grep -i "error\|fail\|critical" /var/log/syslog | tail -50

# 4. Vérifier certificats SSL
sudo certbot certificates

# 5. Backup complet
# Voir section Backups
```

### Mises à Jour Système

```bash
# Vérifier mises à jour
sudo apt update
sudo apt list --upgradable

# Appliquer mises à jour sécurité
sudo apt upgrade -y

# Redémarrer si requis
sudo reboot
```

---

## Procédures d'Urgence

### 1. Serveur Inaccessible (SSH)

**Symptôme:** Impossible de se connecter en SSH

**Diagnostic:**
```bash
# Depuis un autre serveur
ping 84.247.165.187
telnet 84.247.165.187 22
```

**Solutions:**
1. Vérifier que votre IP n'est pas bannie (fail2ban)
2. Accéder via console Contabo (Web)
3. Vérifier service SSH: `systemctl status ssh`
4. Vérifier UFW: `ufw status`

### 2. IP Bannie par Erreur

**Symptôme:** Votre IP est bloquée par fail2ban

**Solution:**
```bash
# Via console Contabo
fail2ban-client set sshd unbanip VOTRE_IP

# Ajouter à whitelist
nano /etc/fail2ban/jail.local
# Ajouter dans ignoreip: VOTRE_IP

systemctl restart fail2ban
```

### 3. Application Inaccessible

**Diagnostic:**
```bash
# Vérifier containers
docker ps

# Vérifier Nginx
systemctl status nginx

# Vérifier logs
docker logs moncabinet_nextjs --tail 50
```

**Solutions:**
```bash
# Redémarrer containers
cd /opt/moncabinet
docker-compose -f docker-compose.prod.yml restart

# Redémarrer Nginx
systemctl restart nginx
```

### 4. Attaque DDoS Détectée

**Symptôme:** Nombreuses connexions depuis plusieurs IPs

**Actions immédiates:**
```bash
# 1. Voir IPs actives
ss -tn | awk '{print $5}' | cut -d: -f1 | sort | uniq -c | sort -rn

# 2. Bannir IP manuellement
fail2ban-client set sshd banip IP_ATTAQUANTE

# 3. Bloquer au niveau UFW
ufw deny from IP_ATTAQUANTE

# 4. Contacter Contabo si persistant
```

### 5. Restauration Configuration

**Restaurer SSH:**
```bash
cp /etc/ssh/sshd_config.backup /etc/ssh/sshd_config
systemctl restart ssh
```

**Restaurer fail2ban:**
```bash
cp /etc/fail2ban/jail.local.backup /etc/fail2ban/jail.local
systemctl restart fail2ban
```

**Restaurer UFW:**
```bash
# Désactiver temporairement
ufw disable

# Reconfigurer
ufw --force reset
# Puis réappliquer les règles (voir section UFW)
```

---

## Checklist Déploiement Sécurité

- [x] fail2ban installé et configuré
- [x] UFW activé avec règles strictes
- [x] SSH sécurisé (clés uniquement)
- [x] Ollama restreint à localhost
- [x] IP admin whitelistée
- [x] Optimisations système appliquées
- [x] Logs configurés et limités
- [x] Backups configuration créés
- [x] Documentation complète
- [x] Tests de sécurité validés

---

## Contacts & Ressources

### Support Hébergeur
- **Contabo:** support@contabo.com
- **Console:** https://my.contabo.com

### Documentation Officielle
- fail2ban: https://www.fail2ban.org/
- UFW: https://help.ubuntu.com/community/UFW
- SSH: https://www.openssh.com/

### Monitoring
- fail2ban status: `fail2ban-client status sshd`
- UFW status: `ufw status verbose`
- Logs: `/var/log/auth.log`, `/var/log/fail2ban.log`

---

## Historique des Modifications

| Date | Action | Détails |
|------|--------|---------|
| 2026-02-08 | Sécurisation complète | fail2ban + UFW + SSH + Ollama |
| 2026-02-08 | Optimisations | Swappiness, file descriptors, Docker logging |
| 2026-02-08 | Nettoyage | Images Docker, logs, backups |
| 2026-02-08 | Documentation | Création documentation sécurité |

---

**Dernière mise à jour:** 8 février 2026
**Responsable:** Équipe DevOps Qadhya
**Version:** 1.0
