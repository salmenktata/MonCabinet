import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { exec } from 'child_process'
import { promisify } from 'util'
import path from 'path'
import fs from 'fs/promises'

const execAsync = promisify(exec)

const BACKUP_DIR = process.env.BACKUP_DIR || '/opt/backups/moncabinet'

/**
 * GET /api/admin/backup
 * Liste les backups disponibles
 */
export async function GET(request: NextRequest) {
  try {
    // Vérifier authentification admin
    const session = await getSession()
    if (!session?.user || session.user.role !== 'admin') {
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
    if (!session?.user || session.user.role !== 'admin') {
      return NextResponse.json(
        { error: 'Non autorisé' },
        { status: 401 }
      )
    }

    const body = await request.json().catch(() => ({}))
    const { type = 'all' } = body // 'all', 'database', 'minio', 'code'

    // Chemin du script backup
    const scriptPath = process.env.BACKUP_SCRIPT || '/opt/moncabinet/backup.sh'

    // Vérifier que le script existe
    try {
      await fs.access(scriptPath)
    } catch {
      return NextResponse.json(
        { error: 'Script de backup non trouvé', path: scriptPath },
        { status: 500 }
      )
    }

    // Exécuter le backup en arrière-plan
    const startTime = Date.now()

    try {
      const { stdout, stderr } = await execAsync(`bash ${scriptPath}`, {
        timeout: 300000, // 5 minutes max
        env: {
          ...process.env,
          PATH: process.env.PATH,
        },
      })

      const duration = ((Date.now() - startTime) / 1000).toFixed(1)

      return NextResponse.json({
        success: true,
        message: 'Backup terminé avec succès',
        duration: `${duration}s`,
        output: stdout,
        errors: stderr || null,
      })
    } catch (execError: unknown) {
      const err = execError as { stdout?: string; stderr?: string; message?: string }
      return NextResponse.json(
        {
          success: false,
          error: 'Échec du backup',
          output: err.stdout,
          stderr: err.stderr,
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
 * DELETE /api/admin/backup
 * Supprimer un backup spécifique
 */
export async function DELETE(request: NextRequest) {
  try {
    // Vérifier authentification admin
    const session = await getSession()
    if (!session?.user || session.user.role !== 'admin') {
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
