import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { exec } from 'child_process'
import { promisify } from 'util'
import path from 'path'
import fs from 'fs/promises'

const execAsync = promisify(exec)

const BACKUP_DIR = process.env.BACKUP_DIR || '/opt/backups/qadhya'

/**
 * GET /api/admin/backup
 * Liste les backups disponibles
 */
export async function GET(request: NextRequest) {
  try {
    // Vérifier authentification admin
    const session = await getSession()
    if (!session?.user || !['admin', 'super_admin'].includes(session.user.role || '')) {
      return NextResponse.json(
        { error: 'Non autorisé' },
        { status: 401 }
      )
    }

    // Lister les backups
    const backups = {
      database: [] as { name: string; size: string; date: string }[],
      minio: [] as { name: string; size: string; date: string; fileCount: number }[],
      code: [] as { name: string; size: string; date: string }[],
    }

    try {
      const files = await fs.readdir(BACKUP_DIR)

      for (const file of files) {
        const filePath = path.join(BACKUP_DIR, file)
        const stats = await fs.stat(filePath)

        // Extraire la date du nom de fichier (format: type_YYYYMMDD_HHMMSS)
        const dateMatch = file.match(/_(\d{8}_\d{6})/)
        const dateStr = dateMatch
          ? `${dateMatch[1].slice(0, 4)}-${dateMatch[1].slice(4, 6)}-${dateMatch[1].slice(6, 8)} ${dateMatch[1].slice(9, 11)}:${dateMatch[1].slice(11, 13)}:${dateMatch[1].slice(13, 15)}`
          : stats.mtime.toISOString()

        const sizeInMB = (stats.size / (1024 * 1024)).toFixed(2)

        if (file.startsWith('db_') && file.endsWith('.sql.gz')) {
          backups.database.push({
            name: file,
            size: `${sizeInMB} MB`,
            date: dateStr,
          })
        } else if (file.startsWith('code_') && file.endsWith('.tar.gz')) {
          backups.code.push({
            name: file,
            size: `${sizeInMB} MB`,
            date: dateStr,
          })
        } else if (file.startsWith('minio_') && stats.isDirectory()) {
          // Compter les fichiers dans le dossier MinIO
          const countFiles = async (dir: string): Promise<number> => {
            let count = 0
            const entries = await fs.readdir(dir, { withFileTypes: true })
            for (const entry of entries) {
              if (entry.isFile()) count++
              else if (entry.isDirectory()) {
                count += await countFiles(path.join(dir, entry.name))
              }
            }
            return count
          }

          const fileCount = await countFiles(filePath)

          // Calculer taille totale du dossier
          const { stdout } = await execAsync(`du -sh "${filePath}"`)
          const dirSize = stdout.split('\t')[0]

          backups.minio.push({
            name: file,
            size: dirSize,
            date: dateStr,
            fileCount,
          })
        }
      }

      // Trier par date décroissante
      backups.database.sort((a, b) => b.date.localeCompare(a.date))
      backups.minio.sort((a, b) => b.date.localeCompare(a.date))
      backups.code.sort((a, b) => b.date.localeCompare(a.date))
    } catch (err) {
      // Dossier de backup n'existe pas encore
      console.log('Dossier backup non trouvé:', BACKUP_DIR)
    }

    // Espace disque
    let diskUsage = { used: '0%', available: '0' }
    try {
      const { stdout } = await execAsync(`df -h ${BACKUP_DIR} | tail -1`)
      const parts = stdout.trim().split(/\s+/)
      diskUsage = {
        used: parts[4] || '0%',
        available: parts[3] || '0',
      }
    } catch {
      // Ignorer erreur df
    }

    return NextResponse.json({
      backups,
      diskUsage,
      backupDir: BACKUP_DIR,
    })
  } catch (error) {
    console.error('Erreur liste backups:', error)
    return NextResponse.json(
      { error: 'Erreur serveur' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/admin/backup
 * Déclencher un backup manuel
 */
export async function POST(request: NextRequest) {
  try {
    // Vérifier authentification admin
    const session = await getSession()
    if (!session?.user || !['admin', 'super_admin'].includes(session.user.role || '')) {
      return NextResponse.json(
        { error: 'Non autorisé' },
        { status: 401 }
      )
    }

    const body = await request.json().catch(() => ({}))
    const { type = 'all' } = body // 'all', 'database', 'minio', 'code'

    // Utiliser le serveur backup HTTP sur l'hôte
    const backupServerUrl = process.env.BACKUP_SERVER_URL || 'http://host.docker.internal:9999/backup'

    // Déclencher le backup via HTTP
    const startTime = Date.now()

    try {
      const response = await fetch(backupServerUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ type }),
        signal: AbortSignal.timeout(300000), // 5 minutes max
      })

      const result = await response.json()
      const duration = ((Date.now() - startTime) / 1000).toFixed(1)

      if (response.ok && result.success) {
        return NextResponse.json({
          success: true,
          message: 'Backup terminé avec succès',
          duration: result.duration || `${duration}s`,
          output: result.output || null,
        })
      } else {
        return NextResponse.json(
          {
            success: false,
            error: result.error || 'Échec du backup',
            message: result.message,
          },
          { status: response.status }
        )
      }
    } catch (error: unknown) {
      const err = error as Error
      // Si le serveur backup n'est pas accessible, donner des instructions
      if (err.message?.includes('fetch failed') || err.message?.includes('ECONNREFUSED')) {
        return NextResponse.json(
          {
            success: false,
            error: 'Script de backup non trouvé',
            message: 'Le serveur de backup n\'est pas accessible. Vérifiez que backup-server.sh est démarré sur l\'hôte.',
          },
          { status: 503 }
        )
      }

      return NextResponse.json(
        {
          success: false,
          error: 'Erreur lors du backup',
          message: err.message,
        },
        { status: 500 }
      )
    }
  } catch (error) {
    console.error('Erreur backup:', error)
    return NextResponse.json(
      { error: 'Erreur serveur' },
      { status: 500 }
    )
  }
}

/**
 * PUT /api/admin/backup
 * Restaurer la base de données depuis un backup
 */
export async function PUT(request: NextRequest) {
  try {
    // Vérifier authentification super_admin UNIQUEMENT
    const session = await getSession()
    if (!session?.user || session.user.role !== 'super_admin') {
      return NextResponse.json(
        { error: 'Réservé aux super administrateurs' },
        { status: 403 }
      )
    }

    const body = await request.json().catch(() => ({}))
    const { filename } = body

    if (!filename || typeof filename !== 'string') {
      return NextResponse.json(
        { error: 'Nom de fichier requis' },
        { status: 400 }
      )
    }

    // Valider le nom de fichier (sécurité)
    if (filename.includes('..') || filename.includes('/')) {
      return NextResponse.json(
        { error: 'Nom de fichier invalide' },
        { status: 400 }
      )
    }

    // Doit être un dump PostgreSQL
    if (!/^db_\d{8}_\d{6}\.sql\.gz$/.test(filename)) {
      return NextResponse.json(
        { error: 'Format de fichier invalide. Attendu: db_YYYYMMDD_HHMMSS.sql.gz' },
        { status: 400 }
      )
    }

    const backupFilePath = path.join(BACKUP_DIR, filename)

    // Vérifier que le fichier existe
    try {
      await fs.access(backupFilePath)
    } catch {
      return NextResponse.json(
        { error: 'Fichier backup non trouvé' },
        { status: 404 }
      )
    }

    // Détecter le container PostgreSQL (qadhya-postgres ou moncabinet-postgres)
    let containerName: string
    try {
      const { stdout } = await execAsync(
        'docker ps --filter "name=postgres" --format "{{.Names}}"',
        { timeout: 10000 }
      )
      const containers = stdout.trim().split('\n').filter(Boolean)
      if (containers.length === 0) {
        return NextResponse.json(
          { error: 'Aucun container PostgreSQL en cours d\'exécution' },
          { status: 500 }
        )
      }
      // Prioriser qadhya-postgres si disponible
      containerName = containers.find(c => c.includes('qadhya')) || containers[0]
    } catch {
      return NextResponse.json(
        { error: 'Impossible de détecter le container PostgreSQL' },
        { status: 500 }
      )
    }

    // Parser DATABASE_URL pour user et dbname
    const databaseUrl = process.env.DATABASE_URL || ''
    const dbMatch = databaseUrl.match(/postgresql:\/\/([^:]+):([^@]+)@[^/]+\/(.+?)(\?.*)?$/)
    if (!dbMatch) {
      return NextResponse.json(
        { error: 'DATABASE_URL non configurée ou invalide' },
        { status: 500 }
      )
    }
    const [, dbUser, , dbName] = dbMatch

    // Exécuter la restauration
    const startTime = Date.now()
    try {
      const cmd = `gunzip -c "${backupFilePath}" | docker exec -i ${containerName} psql -U ${dbUser} ${dbName}`
      const { stdout, stderr } = await execAsync(cmd, {
        timeout: 300000, // 5 minutes
        maxBuffer: 50 * 1024 * 1024, // 50 MB output buffer
      })

      const duration = ((Date.now() - startTime) / 1000).toFixed(1)

      return NextResponse.json({
        success: true,
        message: `Base de données restaurée depuis ${filename}`,
        duration: `${duration}s`,
        output: stdout?.slice(0, 2000) || null,
        warnings: stderr?.slice(0, 2000) || null,
      })
    } catch (execError: unknown) {
      const err = execError as { stdout?: string; stderr?: string; message?: string }
      const duration = ((Date.now() - startTime) / 1000).toFixed(1)
      return NextResponse.json(
        {
          success: false,
          error: 'Échec de la restauration',
          duration: `${duration}s`,
          output: err.stdout?.slice(0, 2000),
          stderr: err.stderr?.slice(0, 2000),
          message: err.message,
        },
        { status: 500 }
      )
    }
  } catch (error) {
    console.error('Erreur restauration backup:', error)
    return NextResponse.json(
      { error: 'Erreur serveur' },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/admin/backup
 * Supprimer un backup spécifique
 */
export async function DELETE(request: NextRequest) {
  try {
    // Vérifier authentification admin
    const session = await getSession()
    if (!session?.user || !['admin', 'super_admin'].includes(session.user.role || '')) {
      return NextResponse.json(
        { error: 'Non autorisé' },
        { status: 401 }
      )
    }

    const { searchParams } = new URL(request.url)
    const filename = searchParams.get('file')

    if (!filename) {
      return NextResponse.json(
        { error: 'Nom de fichier requis' },
        { status: 400 }
      )
    }

    // Valider le nom de fichier (sécurité)
    if (filename.includes('..') || filename.includes('/')) {
      return NextResponse.json(
        { error: 'Nom de fichier invalide' },
        { status: 400 }
      )
    }

    const filePath = path.join(BACKUP_DIR, filename)

    // Vérifier que le fichier existe
    try {
      const stats = await fs.stat(filePath)

      if (stats.isDirectory()) {
        await fs.rm(filePath, { recursive: true })
      } else {
        await fs.unlink(filePath)
      }

      return NextResponse.json({
        success: true,
        message: `Backup ${filename} supprimé`,
      })
    } catch {
      return NextResponse.json(
        { error: 'Backup non trouvé' },
        { status: 404 }
      )
    }
  } catch (error) {
    console.error('Erreur suppression backup:', error)
    return NextResponse.json(
      { error: 'Erreur serveur' },
      { status: 500 }
    )
  }
}
