/**
 * Script Phase 4.4 - Type Safety
 *
 * Remplace `catch (error: any)` par `catch (error)` + validation instanceof Error
 * Pattern: error.message → error instanceof Error ? error.message : 'Unknown error'
 *
 * Effort estimé: 6h manuel → 1h automatisé
 */

import * as fs from 'fs'
import * as path from 'path'
import { glob } from 'glob'

// =============================================================================
// CONFIGURATION
// =============================================================================

const DIRECTORIES = ['lib', 'app']
const EXTENSIONS = ['ts', 'tsx']
const DRY_RUN = process.argv.includes('--dry-run')

// =============================================================================
// PATTERNS DE REMPLACEMENT
// =============================================================================

interface Fix {
  pattern: RegExp
  replacement: string
  description: string
}

// Phase 4.4: Approche simple et safe
// 1. Supprimer `: any` dans catch
// 2. Ajouter helper getErrorMessage() (manuel si besoin)
const FIXES: Fix[] = [
  {
    pattern: /catch\s*\(\s*error\s*:\s*any\s*\)/g,
    replacement: 'catch (error)',
    description: 'Supprimer type any dans catch',
  },
]

// =============================================================================
// FONCTIONS
// =============================================================================

async function findFiles(): Promise<string[]> {
  const patterns = DIRECTORIES.flatMap((dir) =>
    EXTENSIONS.map((ext) => `${dir}/**/*.${ext}`)
  )

  const allFiles: string[] = []
  for (const pattern of patterns) {
    const files = await glob(pattern, { ignore: ['**/node_modules/**', '**/*.d.ts'] })
    allFiles.push(...files)
  }

  return allFiles
}

function applyFixes(content: string, filePath: string): { content: string; changes: number } {
  let newContent = content
  let totalChanges = 0

  for (const fix of FIXES) {
    const matches = content.match(fix.pattern)
    if (matches) {
      console.log(`  [${path.basename(filePath)}] ${fix.description}: ${matches.length} occurrences`)
      newContent = newContent.replace(fix.pattern, fix.replacement)
      totalChanges += matches.length
    }
  }

  return { content: newContent, changes: totalChanges }
}

async function processFile(filePath: string): Promise<boolean> {
  try {
    const content = fs.readFileSync(filePath, 'utf-8')

    // Vérifier si le fichier contient des patterns à corriger
    const needsFix = FIXES.some((fix) => fix.pattern.test(content))
    if (!needsFix) {
      return false
    }

    const { content: newContent, changes } = applyFixes(content, filePath)

    if (changes === 0) {
      return false
    }

    console.log(`✓ ${filePath}: ${changes} corrections`)

    if (!DRY_RUN) {
      fs.writeFileSync(filePath, newContent, 'utf-8')
    }

    return true
  } catch (error) {
    console.error(`✗ Erreur ${filePath}:`, error instanceof Error ? error.message : String(error))
    return false
  }
}

// =============================================================================
// MAIN
// =============================================================================

async function main() {
  console.log('╔══════════════════════════════════════════════════════════════╗')
  console.log('║   PHASE 4.4 - TYPE SAFETY FIX (error: any)                  ║')
  console.log('╚══════════════════════════════════════════════════════════════╝')
  console.log()

  if (DRY_RUN) {
    console.log('⚠️  MODE DRY-RUN: Aucune modification ne sera appliquée')
    console.log()
  }

  console.log('🔍 Recherche fichiers...')
  const files = await findFiles()
  console.log(`✓ ${files.length} fichiers TypeScript trouvés`)
  console.log()

  console.log('🔧 Application des corrections...')
  let fixedFiles = 0
  let totalChanges = 0

  for (const file of files) {
    const fixed = await processFile(file)
    if (fixed) {
      fixedFiles++
    }
  }

  console.log()
  console.log('════════════════════════════════════════════════════════════════')
  console.log('RÉSUMÉ')
  console.log('════════════════════════════════════════════════════════════════')
  console.log(`Fichiers analysés: ${files.length}`)
  console.log(`Fichiers corrigés: ${fixedFiles}`)
  console.log()

  if (DRY_RUN) {
    console.log('Pour appliquer les corrections, exécutez:')
    console.log('  npx tsx scripts/fix-error-type-safety.ts')
  } else {
    console.log('✅ Corrections appliquées!')
    console.log()
    console.log('Prochaines étapes:')
    console.log('  1. Vérifier build: npm run type-check')
    console.log('  2. Tester app: npm run dev')
    console.log('  3. Commit: git add . && git commit -m "fix(type-safety): remplacer error: any - Phase 4.4"')
  }
}

main().catch((error) => {
  console.error('❌ Erreur script:', error instanceof Error ? error.message : String(error))
  process.exit(1)
})
