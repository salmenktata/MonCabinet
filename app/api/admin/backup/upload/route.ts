import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import path from 'path'
import fs from 'fs/promises'

const BACKUP_DIR = process.env.BACKUP_DIR || '/opt/backups/qadhya'

const MAX_FILE_SIZE = 2 * 1024 * 1024 * 1024 // 2 GB

/**
 * POST /api/admin/backup/upload
 * Uploader un fichier .sql.gz pour restauration ultérieure
 * Réservé aux super_admin
 */
export async function POST(request: NextRequest) {
  try {
    // Auth super_admin uniquement
    const session = await getSession()
    if (!session?.user || session.user.role !== 'super_admin') {
      return NextResponse.json(
        { error: 'Réservé aux super administrateurs' },
        { status: 403 }
      )
    }

    const formData = await request.formData()
    const file = formData.get('file') as File | null

    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: 'Fichier requis' }, { status: 400 })
    }

    // Valider taille
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: 'Fichier trop volumineux (max 2 GB)' },
        { status: 400 }
      )
    }

    // Valider nom de fichier (sécurité + format attendu)
    const filename = path.basename(file.name)
    if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      return NextResponse.json({ error: 'Nom de fichier invalide' }, { status: 400 })
    }

    if (!/^db_\d{8}_\d{6}\.sql\.gz$/.test(filename)) {
      return NextResponse.json(
        { error: 'Format invalide. Attendu: db_YYYYMMDD_HHMMSS.sql.gz' },
        { status: 400 }
      )
    }

    // S'assurer que BACKUP_DIR existe
    await fs.mkdir(BACKUP_DIR, { recursive: true })

    // Écrire le fichier dans BACKUP_DIR
    const buffer = Buffer.from(await file.arrayBuffer())
    const destPath = path.join(BACKUP_DIR, filename)
    await fs.writeFile(destPath, buffer)

    return NextResponse.json({ success: true, filename })
  } catch (error) {
    console.error('Erreur upload backup:', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
