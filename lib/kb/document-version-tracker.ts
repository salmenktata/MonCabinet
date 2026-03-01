/**
 * Service de tracking des versions de documents juridiques
 *
 * Détecte automatiquement les changements lors du re-crawl :
 * - Comparaison de contenu (hash + diff ratio)
 * - Classification du type de changement (mineur, majeur, abrogation)
 * - Création automatique de version si changement significatif
 *
 * @module lib/kb/document-version-tracker
 */

import { db } from '@/lib/db/postgres'
import crypto from 'crypto'

// =============================================================================
// TYPES
// =============================================================================

export interface ContentChangeResult {
  hasChanged: boolean
  changeType: 'none' | 'minor' | 'major' | 'abrogation' | 'new'
  changeRatio: number       // 0.0–1.0 (proportion du texte modifié)
  oldHash: string | null
  newHash: string
  summary: string
}

export interface VersionTrackingResult {
  versionCreated: boolean
  versionId: string | null
  change: ContentChangeResult
}

// =============================================================================
// HELPERS
// =============================================================================

function computeContentHash(text: string): string {
  return crypto.createHash('sha256').update(text.trim()).digest('hex')
}

/**
 * Calcule un ratio approximatif de changement entre deux textes.
 * Basé sur la comparaison de sets de lignes (rapide, pas de diff line-by-line).
 */
function computeChangeRatio(oldText: string, newText: string): number {
  const oldLines = new Set(oldText.split('\n').map(l => l.trim()).filter(Boolean))
  const newLines = new Set(newText.split('\n').map(l => l.trim()).filter(Boolean))

  if (oldLines.size === 0 && newLines.size === 0) return 0

  let unchanged = 0
  for (const line of oldLines) {
    if (newLines.has(line)) unchanged++
  }

  const totalUnique = new Set([...oldLines, ...newLines]).size
  return totalUnique > 0 ? 1 - (unchanged / totalUnique) : 0
}

/**
 * Détecte si le texte contient des marqueurs d'abrogation
 */
function detectAbrogationMarkers(text: string): boolean {
  const markers = [
    /أُلغي/,
    /ملغى/,
    /نُسخ/,
    /abrog[ée]/i,
    /annul[ée]/i,
    /remplacé par/i,
    /عُوِّض/,
    /يعوّض/,
  ]
  return markers.some(m => m.test(text))
}

/**
 * Classifie le type de changement
 */
function classifyChange(ratio: number, newText: string, oldText: string): ContentChangeResult['changeType'] {
  if (ratio === 0) return 'none'

  // Vérifier abrogation
  if (detectAbrogationMarkers(newText) && !detectAbrogationMarkers(oldText)) {
    return 'abrogation'
  }

  // Seuils de classification
  if (ratio < 0.05) return 'minor'  // <5% = correction typo, formatage
  return 'major'                     // ≥5% = modification substantielle
}

// =============================================================================
// API PUBLIQUE
// =============================================================================

/**
 * Détecte si un document a changé par rapport à sa version en base
 */
export async function detectContentChange(
  documentId: string,
  newContent: string
): Promise<ContentChangeResult> {
  const newHash = computeContentHash(newContent)

  // Récupérer le contenu actuel
  const current = await db.query(
    `SELECT full_text, metadata->>'content_hash' as content_hash FROM knowledge_base WHERE id = $1`,
    [documentId]
  )

  if (current.rows.length === 0) {
    return {
      hasChanged: true,
      changeType: 'new',
      changeRatio: 1,
      oldHash: null,
      newHash,
      summary: 'Nouveau document',
    }
  }

  const oldHash = current.rows[0].content_hash
  const oldText = current.rows[0].full_text || ''

  // Comparaison rapide par hash
  if (oldHash && oldHash === newHash) {
    return { hasChanged: false, changeType: 'none', changeRatio: 0, oldHash, newHash, summary: 'Aucun changement' }
  }

  // Comparaison détaillée
  const changeRatio = computeChangeRatio(oldText, newContent)
  const changeType = classifyChange(changeRatio, newContent, oldText)

  const summary = changeType === 'none'
    ? 'Aucun changement'
    : changeType === 'minor'
      ? `Modification mineure (${(changeRatio * 100).toFixed(1)}% changé)`
      : changeType === 'abrogation'
        ? `Abrogation détectée (${(changeRatio * 100).toFixed(1)}% changé)`
        : `Modification majeure (${(changeRatio * 100).toFixed(1)}% changé)`

  return { hasChanged: changeRatio > 0, changeType, changeRatio, oldHash, newHash, summary }
}

/**
 * Crée une version si le contenu a changé significativement (>minor)
 * et met à jour le content_hash dans les metadata
 */
export async function trackDocumentVersion(
  documentId: string,
  newContent: string,
  changedBy: string = 'system'
): Promise<VersionTrackingResult> {
  const change = await detectContentChange(documentId, newContent)

  if (!change.hasChanged || change.changeType === 'none') {
    return { versionCreated: false, versionId: null, change }
  }

  // Mettre à jour le content_hash
  await db.query(
    `UPDATE knowledge_base SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('content_hash', $1) WHERE id = $2`,
    [change.newHash, documentId]
  )

  // Créer une version seulement pour les changements majeurs ou abrogations
  if (change.changeType === 'minor') {
    return { versionCreated: false, versionId: null, change }
  }

  try {
    const versionResult = await db.query(
      `SELECT create_knowledge_base_version($1, $2, $3, $4) as version_id`,
      [documentId, changedBy, change.summary, 'content_update']
    )

    // Si abrogation détectée, mettre à jour le statut
    if (change.changeType === 'abrogation') {
      await db.query(
        `UPDATE knowledge_base SET metadata = COALESCE(metadata, '{}'::jsonb) || '{"status": "abroge"}'::jsonb WHERE id = $1`,
        [documentId]
      )
    }

    return {
      versionCreated: true,
      versionId: versionResult.rows[0]?.version_id || null,
      change,
    }
  } catch (error) {
    console.error(`[Version Tracker] Erreur création version pour ${documentId}:`, error)
    return { versionCreated: false, versionId: null, change }
  }
}

/**
 * Récupère l'historique des versions d'un document
 */
export async function getDocumentVersionHistory(
  documentId: string,
  limit: number = 10
): Promise<Array<{
  versionId: string
  version: number
  changeType: string
  changeReason: string
  changedBy: string
  changedAt: string
}>> {
  const result = await db.query(
    `SELECT id, version, change_type, change_reason, changed_by, changed_at
     FROM knowledge_base_versions
     WHERE knowledge_base_id = $1
     ORDER BY version DESC
     LIMIT $2`,
    [documentId, limit]
  )

  return result.rows.map(r => ({
    versionId: r.id,
    version: r.version,
    changeType: r.change_type,
    changeReason: r.change_reason,
    changedBy: r.changed_by,
    changedAt: r.changed_at,
  }))
}
