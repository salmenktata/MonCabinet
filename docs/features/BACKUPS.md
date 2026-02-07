# Système de Backup MonCabinet

## Vue d'ensemble

MonCabinet inclut un système de backup automatisé pour :
- **PostgreSQL** : Base de données (dump SQL compressé)
- **MinIO** : Documents stockés (mirror S3)
- **Code source** : Archive tar.gz

## Scripts

### backup.sh

Script principal de backup automatique.

```bash
# Usage
./backup.sh [--notify]

# Options
--notify    Envoyer notification Brevo en cas d'échec
```

**Fonctionnalités :**
- Dump PostgreSQL compressé (.sql.gz)
- Mirror MinIO via mc client
- Archive code source (exclut node_modules, .next, .git)
- Rotation automatique (garde 14 derniers)
- Alerte si disque > 80%
- Notification Brevo en cas d'échec

### restore.sh

Script de restauration.

```bash
# Lister les backups disponibles
./restore.sh --list

# Restaurer PostgreSQL
./restore.sh --db /opt/backups/moncabinet/db_20260206_030000.sql.gz

# Restaurer MinIO
./restore.sh --minio /opt/backups/moncabinet/minio_20260206_030000

# Restaurer tout depuis les derniers backups
./restore.sh --latest
```

## Configuration Cron

Pour automatiser les backups quotidiens à 3h du matin :

```bash
# Éditer crontab
crontab -e

# Ajouter la ligne
0 3 * * * /opt/moncabinet/backup.sh --notify >> /var/log/moncabinet-backup.log 2>&1
```

## API Admin

L'API `/api/admin/backup` permet de gérer les backups depuis l'interface.

### GET /api/admin/backup

Liste les backups disponibles.

**Réponse :**
```json
{
  "backups": {
    "database": [
      { "name": "db_20260206_030000.sql.gz", "size": "15.2 MB", "date": "2026-02-06 03:00:00" }
    ],
    "minio": [
      { "name": "minio_20260206_030000", "size": "250 MB", "date": "2026-02-06 03:00:00", "fileCount": 145 }
    ],
    "code": [
      { "name": "code_20260206_030000.tar.gz", "size": "8.5 MB", "date": "2026-02-06 03:00:00" }
    ]
  },
  "diskUsage": { "used": "45%", "available": "55G" },
  "backupDir": "/opt/backups/moncabinet"
}
```

### POST /api/admin/backup

Déclencher un backup manuel.

**Requête :**
```json
{ "type": "all" }
```

### DELETE /api/admin/backup?file=db_20260206_030000.sql.gz

Supprimer un backup spécifique.

## Variables d'environnement

```env
# Répertoire des backups
BACKUP_DIR=/opt/backups/moncabinet

# Script de backup
BACKUP_SCRIPT=/opt/moncabinet/backup.sh

# Email admin pour alertes
ADMIN_EMAIL=admin@moncabinet.tn

# Brevo (pour notifications échec)
BREVO_API_KEY=xkeysib-...
BREVO_SENDER_EMAIL=notifications@moncabinet.tn
```

## Structure des backups

```
/opt/backups/moncabinet/
├── db_20260206_030000.sql.gz      # Dump PostgreSQL
├── db_20260205_030000.sql.gz
├── code_20260206_030000.tar.gz    # Archive code
├── code_20260205_030000.tar.gz
├── minio_20260206_030000/         # Documents MinIO
│   └── documents/
│       ├── client1/
│       └── client2/
└── minio_20260205_030000/
```

## Rotation

Les backups de plus de 14 jours sont automatiquement supprimés.

## Restauration d'urgence

En cas de perte de données :

```bash
# 1. Arrêter l'application
docker stop moncabinet-nextjs

# 2. Restaurer depuis les derniers backups
./restore.sh --latest

# 3. L'application redémarre automatiquement
```

## Bonnes pratiques

1. **Vérifier les logs** : `/var/log/moncabinet-backup.log`
2. **Tester la restauration** mensuellement
3. **Copier les backups** vers un stockage externe (S3, Google Drive)
4. **Monitorer l'espace disque** (alerte à 80%)
