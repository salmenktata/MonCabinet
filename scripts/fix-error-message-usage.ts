/**
 * Script Phase 4.4.2 - Migration error.message vers getErrorMessage()
 *
 * Après suppression de `error: any`, TypeScript détecte les usages non-safe.
 * Ce script migre automatiquement vers getErrorMessage() helper.
 */

import * as fs from 'fs'
import * as path from 'path'
import { glob } from 'glob'

const DRY_RUN = process.argv.includes('--dry-run')

async function findFilesWithErrors(): Promise<string[]> {
  const patterns = ['app/**/*.ts', 'app/**/*.tsx', 'lib/**/*.ts']
  const allFiles: string[] = []

  for (const pattern of patterns) {
    const files = await glob(pattern, { ignore: ['**/node_modules/**', '**/*.d.ts'] })
    allFiles.push(...files)
  }

  return allFiles
}

function processFile(filePath: string): boolean {
  const content = fs.readFileSync(filePath, 'utf-8')

  // Pattern: catch blocks avec error.message
  const catchBlockPattern = /catch\s*\(\s*error\s*\)\s*\{[^}]*error\.message[^}]*\}/gs

  if (!catchBlockPattern.test(content)) {
    return false
  }

  let newContent = content

  // 1. Ajouter import getErrorMessage si pas présent
  if (!newContent.includes('getErrorMessage')) {
    const hasImports = newContent.includes('import')
    if (hasImports) {
      // Ajouter après les derniers imports
      const lastImportMatch = newContent.match(/^import.*$/gm)
      if (lastImportMatch) {
        const lastImport = lastImportMatch[lastImportMatch.length - 1]
        newContent = newContent.replace(
          lastImport,
          `${lastImport}\nimport { getErrorMessage } from '@/lib/utils/error-utils'`
        )
      }
    } else {
      // Ajouter au début
      newContent = `import { getErrorMessage } from '@/lib/utils/error-utils'\n\n` + newContent
    }
  }

  // 2. Remplacer error.message par getErrorMessage(error)
  newContent = newContent.replace(/error\.message/g, 'getErrorMessage(error)')

  if (newContent === content) {
    return false
  }

  console.log(`✓ ${filePath}`)

  if (!DRY_RUN) {
    fs.writeFileSync(filePath, newContent, 'utf-8')
  }

  return true
}

async function main() {
  console.log('╔══════════════════════════════════════════════════════════════╗')
  console.log('║   PHASE 4.4.2 - MIGRATION error.message → getErrorMessage() ║')
  console.log('╚══════════════════════════════════════════════════════════════╝')
  console.log()

  if (DRY_RUN) {
    console.log('⚠️  MODE DRY-RUN')
    console.log()
  }

  const files = await findFilesWithErrors()
  let fixed = 0

  for (const file of files) {
    if (processFile(file)) {
      fixed++
    }
  }

  console.log()
  console.log(`✅ ${fixed} fichiers migrés`)

  if (DRY_RUN) {
    console.log('\nPour appliquer: npx tsx scripts/fix-error-message-usage.ts')
  }
}

main().catch((error) => {
  console.error('❌ Erreur:', error instanceof Error ? error.message : String(error))
  process.exit(1)
})
