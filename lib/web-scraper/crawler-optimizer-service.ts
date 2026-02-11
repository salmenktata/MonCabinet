/**
 * Service d'optimisation automatique des crawlers
 * Analyse une source et applique la configuration optimale
 */

import { db } from '@/lib/db/postgres'
import type { WebSource } from './types'
import {
  getRecommendedProfile,
  optimizeSourceConfig,
  type CrawlerProfile,
  type SiteType,
  DETECTION_PATTERNS,
} from './crawler-profiles'
import { fetchHtml } from './scraper-service'

interface OptimizationResult {
  success: boolean
  detectedType: SiteType
  appliedProfile: string
  changes: Record<string, { before: any; after: any }>
  warnings?: string[]
  recommendations?: string[]
}

/**
 * Analyser une URL et détecter le type de site
 */
export async function detectSiteType(url: string): Promise<{
  type: SiteType
  confidence: number
  evidence: string[]
}> {
  const evidence: string[] = []
  let detectedType: SiteType = 'unknown'
  let confidence = 0

  try {
    // 1. Détection par URL (rapide)
    for (const [type, patterns] of Object.entries(DETECTION_PATTERNS)) {
      if (patterns.urlPatterns.some(pattern => pattern.test(url))) {
        evidence.push(`URL matches ${type} pattern`)
        detectedType = type as SiteType
        confidence = 60
        break
      }
    }

    // 2. Détection par HTML (précise)
    const htmlResult = await fetchHtml(url, { timeout: 30000 })
    if (htmlResult.success && htmlResult.html) {
      const lowerHtml = htmlResult.html.toLowerCase()

      for (const [type, patterns] of Object.entries(DETECTION_PATTERNS)) {
        const matchedSignatures = patterns.htmlSignatures.filter(sig =>
          lowerHtml.includes(sig.toLowerCase())
        )

        if (matchedSignatures.length > 0) {
          evidence.push(`HTML contains ${type} signatures: ${matchedSignatures.join(', ')}`)
          detectedType = type as SiteType
          confidence = 80 + Math.min(matchedSignatures.length * 5, 20)
          break
        }
      }

      // 3. Détection de sitemap
      const hasSitemap =
        lowerHtml.includes('sitemap.xml') ||
        lowerHtml.includes('<loc>') ||
        lowerHtml.includes('application/xml')

      if (hasSitemap) {
        evidence.push('Sitemap detected')
      }

      // 4. Détection de JavaScript requis
      const hasReact = lowerHtml.includes('react') || lowerHtml.includes('__next_data__')
      const hasVue = lowerHtml.includes('vue') || lowerHtml.includes('v-app')
      const hasLivewire = lowerHtml.includes('livewire') || lowerHtml.includes('wire:')

      if (hasReact || hasVue || hasLivewire) {
        evidence.push(`JavaScript framework detected: ${hasReact ? 'React' : hasVue ? 'Vue' : 'Livewire'}`)
        if (detectedType === 'unknown') {
          detectedType = 'spa'
          confidence = 70
        }
      }
    }

    // 4. Détection par domaine connu
    if (url.includes('blogspot.com') || url.includes('blogger.com')) {
      detectedType = 'blogger'
      confidence = 95
      evidence.push('Blogger domain detected')
    }

    return {
      type: detectedType,
      confidence,
      evidence,
    }
  } catch (error) {
    console.error('[CrawlerOptimizer] Error detecting site type:', error)
    return {
      type: 'unknown',
      confidence: 0,
      evidence: ['Detection failed'],
    }
  }
}

/**
 * Optimiser automatiquement une source
 */
export async function optimizeWebSource(sourceId: string): Promise<OptimizationResult> {
  try {
    // 1. Récupérer la source
    const result = await db.query<WebSource>(
      `SELECT * FROM web_sources WHERE id = $1`,
      [sourceId]
    )

    if (result.rows.length === 0) {
      throw new Error(`Source ${sourceId} not found`)
    }

    const source = result.rows[0] as any
    const changes: Record<string, { before: any; after: any }> = {}
    const warnings: string[] = []
    const recommendations: string[] = []

    // 2. Détecter le type de site
    const detection = await detectSiteType(source.base_url)
    console.log(`[CrawlerOptimizer] Detected ${detection.type} with ${detection.confidence}% confidence`)

    // 3. Obtenir le profil recommandé
    const recommendedProfile = getRecommendedProfile(source.base_url)

    // 4. Comparer et appliquer les changements
    const updates: string[] = []
    const params: any[] = []
    let paramIndex = 1

    // use_sitemap
    if (source.use_sitemap !== recommendedProfile.useSitemap) {
      changes.use_sitemap = {
        before: source.use_sitemap,
        after: recommendedProfile.useSitemap,
      }
      updates.push(`use_sitemap = $${paramIndex++}`)
      params.push(recommendedProfile.useSitemap)
    }

    // requires_javascript
    if (source.requires_javascript !== recommendedProfile.requiresJavascript) {
      changes.requires_javascript = {
        before: source.requires_javascript,
        after: recommendedProfile.requiresJavascript,
      }
      updates.push(`requires_javascript = $${paramIndex++}`)
      params.push(recommendedProfile.requiresJavascript)
    }

    // timeout_ms
    if (source.timeout_ms !== recommendedProfile.timeoutMs) {
      changes.timeout_ms = {
        before: source.timeout_ms,
        after: recommendedProfile.timeoutMs,
      }
      updates.push(`timeout_ms = $${paramIndex++}`)
      params.push(recommendedProfile.timeoutMs)
    }

    // max_pages
    if (source.max_pages !== recommendedProfile.maxPages) {
      changes.max_pages = {
        before: source.max_pages,
        after: recommendedProfile.maxPages,
      }
      updates.push(`max_pages = $${paramIndex++}`)
      params.push(recommendedProfile.maxPages)
    }

    // follow_links
    if (source.follow_links !== recommendedProfile.followLinks) {
      changes.follow_links = {
        before: source.follow_links,
        after: recommendedProfile.followLinks,
      }
      updates.push(`follow_links = $${paramIndex++}`)
      params.push(recommendedProfile.followLinks)
    }

    // url_patterns
    const currentPatterns = source.url_patterns || []
    if (
      recommendedProfile.urlPatterns.length > 0 &&
      JSON.stringify(currentPatterns) !== JSON.stringify(recommendedProfile.urlPatterns)
    ) {
      changes.url_patterns = {
        before: currentPatterns,
        after: recommendedProfile.urlPatterns,
      }
      updates.push(`url_patterns = $${paramIndex++}`)
      params.push(recommendedProfile.urlPatterns)
    }

    // excluded_patterns
    const currentExcluded = source.excluded_patterns || []
    if (
      recommendedProfile.excludedPatterns.length > 0 &&
      JSON.stringify(currentExcluded) !== JSON.stringify(recommendedProfile.excludedPatterns)
    ) {
      changes.excluded_patterns = {
        before: currentExcluded,
        after: recommendedProfile.excludedPatterns,
      }
      updates.push(`excluded_patterns = $${paramIndex++}`)
      params.push(recommendedProfile.excludedPatterns)
    }

    // 5. Appliquer les changements si nécessaire
    if (updates.length > 0) {
      params.push(sourceId)
      const query = `
        UPDATE web_sources
        SET ${updates.join(', ')}, updated_at = NOW()
        WHERE id = $${paramIndex}
      `
      await db.query(query, params)

      console.log(`[CrawlerOptimizer] Applied ${updates.length} optimizations to source ${sourceId}`)
    }

    // 6. Générer des recommandations
    if (detection.confidence < 70) {
      warnings.push(
        `Low confidence (${detection.confidence}%) in site type detection. Manual review recommended.`
      )
    }

    if (recommendedProfile.name === 'Default') {
      recommendations.push(
        'Using default profile. Consider manual configuration for better results.'
      )
    }

    if (recommendedProfile.requiresJavascript) {
      recommendations.push(
        'JavaScript rendering enabled. This will be slower but more accurate.'
      )
    }

    if (recommendedProfile.useSitemap) {
      recommendations.push(
        'Sitemap discovery enabled. Ensure sitemap.xml exists at the domain root.'
      )
    }

    return {
      success: true,
      detectedType: detection.type,
      appliedProfile: recommendedProfile.name,
      changes,
      warnings: warnings.length > 0 ? warnings : undefined,
      recommendations: recommendations.length > 0 ? recommendations : undefined,
    }
  } catch (error) {
    console.error('[CrawlerOptimizer] Error optimizing source:', error)
    return {
      success: false,
      detectedType: 'unknown',
      appliedProfile: 'None',
      changes: {},
      warnings: [error instanceof Error ? error.message : 'Unknown error'],
    }
  }
}

/**
 * Optimiser toutes les sources non optimisées
 */
export async function optimizeAllSources(dryRun = false): Promise<{
  total: number
  optimized: number
  skipped: number
  failed: number
  results: Array<{ sourceId: string; name: string; result: OptimizationResult }>
}> {
  const sources = await db.query<WebSource>(
    `SELECT id, name, base_url FROM web_sources WHERE is_active = true ORDER BY created_at DESC`
  )

  const results: Array<{ sourceId: string; name: string; result: OptimizationResult }> = []
  let optimized = 0
  let skipped = 0
  let failed = 0

  for (const source of sources.rows) {
    const sourceData = source as any
    console.log(`\n[CrawlerOptimizer] Processing: ${sourceData.name}`)

    if (dryRun) {
      console.log('[CrawlerOptimizer] DRY RUN - No changes will be applied')
    }

    const result = await optimizeWebSource(sourceData.id)
    results.push({
      sourceId: sourceData.id,
      name: sourceData.name,
      result,
    })

    if (result.success) {
      const changeCount = Object.keys(result.changes).length
      if (changeCount > 0) {
        optimized++
        console.log(`[CrawlerOptimizer] ✅ Applied ${changeCount} changes`)
      } else {
        skipped++
        console.log('[CrawlerOptimizer] ⏭️ Already optimized')
      }
    } else {
      failed++
      console.log('[CrawlerOptimizer] ❌ Optimization failed')
    }
  }

  return {
    total: sources.rows.length,
    optimized,
    skipped,
    failed,
    results,
  }
}
