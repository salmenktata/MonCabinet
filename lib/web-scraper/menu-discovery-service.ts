/**
 * Service de découverte automatique de liens via interaction JavaScript
 *
 * Ce service détecte et clique intelligemment sur les menus et boutons
 * de navigation pour découvrir des URLs dynamiques cachées.
 *
 * Architecture :
 * 1. Configuration par framework (WebDev, Livewire, React, etc.)
 * 2. Scoring de pertinence des éléments cliquables
 * 3. Clics intelligents avec capture d'URLs
 * 4. Stratégies de capture adaptées au framework
 */

import type { Page } from 'playwright'
import type { LinkDiscoveryConfig } from './types'
import {
  captureDomUrls,
  captureHistoryUrls,
  captureXhrUrls,
  captureHybridUrls,
} from './url-capture-strategies'

/**
 * Configurations par framework
 *
 * Chaque framework a des patterns spécifiques pour :
 * - Les sélecteurs CSS de navigation
 * - Le nombre de clics optimaux
 * - La stratégie de capture d'URLs
 */
export const MENU_DISCOVERY_CONFIGS: Record<string, LinkDiscoveryConfig> = {
  // WebDev (framework français, utilisé par IORT.tn)
  webdev: {
    enabled: true,
    clickSelectors: [
      'a[onclick*="WD_"]',
      'a[onclick*="PAGE_"]',
      'button[onclick*="WD_ACTION_=MENU"]',
      'nav a',
      '#menu a',
      '.menu a',
      '[class*="menu"] a',
      '[class*="nav"] a',
    ],
    maxClicks: 15,
    waitAfterClickMs: 1500,
    discoveryTimeoutMs: 120000, // 2 minutes
    captureStrategy: 'hybrid',
    useRelevanceScoring: true,
    excludePatterns: ['logout', 'admin', 'login', 'cookie', 'footer', 'contact'],
  },

  // Livewire (9anoun.tn)
  livewire: {
    enabled: true,
    clickSelectors: [
      '[wire\\:click*="navigate"]',
      '[wire\\:click*="loadCategory"]',
      '[wire\\:click*="load"]',
      'a[wire\\:navigate]',
      'nav a[href^="/"]',
      '[class*="category"] a',
      '[class*="menu"] a',
    ],
    maxClicks: 20,
    waitAfterClickMs: 1200,
    discoveryTimeoutMs: 90000,
    captureStrategy: 'history',
    useRelevanceScoring: true,
    excludePatterns: ['logout', 'admin', 'login'],
  },

  // React (SPAs modernes)
  react: {
    enabled: true,
    clickSelectors: [
      'nav a',
      '[role="navigation"] a',
      'a[href^="/"]',
      'button[data-navigate]',
      '[class*="nav"] a',
    ],
    maxClicks: 25,
    waitAfterClickMs: 800,
    discoveryTimeoutMs: 60000,
    captureStrategy: 'history',
    useRelevanceScoring: true,
    excludePatterns: ['logout', 'admin', 'login'],
  },

  // Vue (SPAs modernes)
  vue: {
    enabled: true,
    clickSelectors: [
      'router-link',
      'nav a',
      'a[href^="/"]',
      '[class*="nav"] a',
    ],
    maxClicks: 25,
    waitAfterClickMs: 800,
    discoveryTimeoutMs: 60000,
    captureStrategy: 'history',
    useRelevanceScoring: true,
    excludePatterns: ['logout', 'admin', 'login'],
  },

  // Angular (SPAs modernes)
  angular: {
    enabled: true,
    clickSelectors: [
      'a[routerLink]',
      'nav a',
      'a[href^="/"]',
      '[class*="nav"] a',
    ],
    maxClicks: 25,
    waitAfterClickMs: 800,
    discoveryTimeoutMs: 60000,
    captureStrategy: 'history',
    useRelevanceScoring: true,
    excludePatterns: ['logout', 'admin', 'login'],
  },

  // SPA générique (framework inconnu mais dynamique)
  'spa-generic': {
    enabled: true,
    clickSelectors: [
      'nav a',
      'a[href^="/"]',
      '[role="navigation"] a',
      '[class*="menu"] a',
      '[class*="nav"] a',
    ],
    maxClicks: 20,
    waitAfterClickMs: 1000,
    discoveryTimeoutMs: 90000,
    captureStrategy: 'hybrid',
    useRelevanceScoring: true,
    excludePatterns: ['logout', 'admin', 'login'],
  },

  // Sites statiques (désactivé)
  static: {
    enabled: false,
    clickSelectors: [],
    maxClicks: 0,
    waitAfterClickMs: 0,
    discoveryTimeoutMs: 0,
    captureStrategy: 'dom',
  },
}

/**
 * Élément cliquable avec score de pertinence
 */
interface ScoredElement {
  selector: string
  text: string
  score: number
  index: number
}

/**
 * Score un élément cliquable selon sa pertinence
 *
 * Critères de scoring :
 * - Position dans le DOM (nav/header = +20, footer = -10)
 * - Position visuelle (haut de page = +15)
 * - Texte pertinent (patterns = +25)
 * - Texte exclu (patterns = null)
 * - Href valide et interne (+10)
 */
async function scoreElement(
  page: Page,
  selector: string,
  index: number,
  excludePatterns: string[]
): Promise<ScoredElement | null> {
  try {
    const elementInfo = await page.evaluate(
      ({ sel, idx }) => {
        const elements = document.querySelectorAll(sel)
        const element = elements[idx] as HTMLElement
        if (!element) return null

        const rect = element.getBoundingClientRect()
        const text = element.textContent?.trim() || ''
        const href = element.getAttribute('href') || ''

        // Détecter la section parent
        let section = 'unknown'
        if (element.closest('nav, header, [role="navigation"]')) {
          section = 'nav'
        } else if (element.closest('footer')) {
          section = 'footer'
        } else if (element.closest('aside, [role="complementary"]')) {
          section = 'aside'
        } else if (element.closest('main, [role="main"]')) {
          section = 'main'
        }

        return {
          text,
          href,
          section,
          top: rect.top,
          visible: rect.width > 0 && rect.height > 0,
        }
      },
      { sel: selector, idx: index }
    )

    if (!elementInfo || !elementInfo.visible) return null

    let score = 50 // Score de base

    // Bonus/malus selon la section
    if (elementInfo.section === 'nav') score += 20
    else if (elementInfo.section === 'footer') score -= 10
    else if (elementInfo.section === 'main') score += 10

    // Bonus si en haut de page
    if (elementInfo.top < 500) score += 15

    // Patterns de texte pertinent
    const relevantPatterns = [
      /menu/i,
      /navigation/i,
      /categ/i,
      /section/i,
      /page/i,
      /voir/i,
      /consulter/i,
      /plus/i,
      /\d+/, // Nombres (pagination, années)
    ]

    const hasRelevantText = relevantPatterns.some((pattern) =>
      pattern.test(elementInfo.text)
    )
    if (hasRelevantText) score += 25

    // Patterns à exclure
    const textLower = elementInfo.text.toLowerCase()
    const isExcluded = excludePatterns.some((pattern) =>
      textLower.includes(pattern.toLowerCase())
    )
    if (isExcluded) return null

    // Bonus si href interne
    if (elementInfo.href && !elementInfo.href.startsWith('http')) {
      score += 10
    } else if (
      elementInfo.href &&
      elementInfo.href.includes(window.location.hostname)
    ) {
      score += 10
    }

    return {
      selector: `${selector}:nth-of-type(${index + 1})`,
      text: elementInfo.text,
      score,
      index,
    }
  } catch {
    return null
  }
}

/**
 * Détecte et score tous les éléments cliquables
 */
async function detectClickableElements(
  page: Page,
  config: LinkDiscoveryConfig
): Promise<ScoredElement[]> {
  const scoredElements: ScoredElement[] = []

  for (const selector of config.clickSelectors) {
    try {
      const count = await page.locator(selector).count()

      for (let i = 0; i < count; i++) {
        const scored = await scoreElement(
          page,
          selector,
          i,
          config.excludePatterns || []
        )
        if (scored) {
          scoredElements.push(scored)
        }
      }
    } catch (error) {
      // Sélecteur invalide ou élément disparu → ignorer
      continue
    }
  }

  return scoredElements
}

/**
 * Capture les URLs selon la stratégie configurée
 */
async function captureUrlsByStrategy(
  page: Page,
  strategy: LinkDiscoveryConfig['captureStrategy'],
  baseUrl: string,
  durationMs: number
): Promise<string[]> {
  switch (strategy) {
    case 'dom':
      return captureDomUrls(page, baseUrl)
    case 'history':
      return captureHistoryUrls(page, durationMs)
    case 'xhr':
      return captureXhrUrls(page, durationMs)
    case 'hybrid':
      return captureHybridUrls(page, baseUrl, durationMs)
    default:
      return captureDomUrls(page, baseUrl)
  }
}

/**
 * Fonction principale : Découvrir les liens via interaction
 *
 * @param page - Instance Playwright de la page
 * @param framework - Framework détecté (webdev, livewire, react, etc.)
 * @param baseUrl - URL de base pour filtrer les liens
 * @returns Liste d'URLs découvertes et nombre de clics effectués
 */
export async function discoverLinksViaInteraction(
  page: Page,
  framework: string,
  baseUrl: string
): Promise<{ urls: string[]; clicksPerformed: number }> {
  // Récupérer la config pour ce framework
  const config = MENU_DISCOVERY_CONFIGS[framework] || MENU_DISCOVERY_CONFIGS['spa-generic']

  // Si désactivé, retourner vide
  if (!config.enabled) {
    return { urls: [], clicksPerformed: 0 }
  }

  console.log(`[MenuDiscovery] Framework: ${framework}, Strategy: ${config.captureStrategy}`)

  const discoveredUrls = new Set<string>()
  let clicksPerformed = 0
  const startTime = Date.now()

  try {
    // 1. Capturer les URLs initiales (DOM)
    const initialUrls = await captureDomUrls(page, baseUrl)
    initialUrls.forEach((url) => discoveredUrls.add(url))

    console.log(`[MenuDiscovery] URLs initiales: ${initialUrls.length}`)

    // 2. Détecter les éléments cliquables
    let clickableElements = await detectClickableElements(page, config)

    // 3. Trier par score si scoring activé
    if (config.useRelevanceScoring) {
      clickableElements.sort((a, b) => b.score - a.score)
    }

    console.log(
      `[MenuDiscovery] ${clickableElements.length} éléments cliquables détectés`
    )

    // 4. Boucle de clics
    for (const element of clickableElements) {
      // Vérifier timeout global
      if (Date.now() - startTime > config.discoveryTimeoutMs) {
        console.log('[MenuDiscovery] Timeout global atteint')
        break
      }

      // Vérifier limite de clics
      if (clicksPerformed >= config.maxClicks) {
        console.log('[MenuDiscovery] Limite de clics atteinte')
        break
      }

      try {
        // Capturer taille avant clic
        const urlsBeforeClick = discoveredUrls.size

        console.log(
          `[MenuDiscovery] Clic ${clicksPerformed + 1}/${config.maxClicks} sur "${element.text}" (score: ${element.score})`
        )

        // Attendre que l'élément soit cliquable et cliquer
        try {
          await page.waitForSelector(element.selector, {
            state: 'visible',
            timeout: 5000,
          })
          await page.click(element.selector, { timeout: 15000 })
        } catch (firstError) {
          // Fallback: clic forcé sans attendre l'état
          console.log(
            `[MenuDiscovery] Tentative clic forcé sur "${element.text}"`
          )
          await page.click(element.selector, { force: true, timeout: 15000 })
        }
        clicksPerformed++

        // Attendre stabilisation
        await page.waitForTimeout(config.waitAfterClickMs)

        // Capturer nouvelles URLs
        const newUrls = await captureUrlsByStrategy(
          page,
          config.captureStrategy,
          baseUrl,
          config.waitAfterClickMs
        )

        newUrls.forEach((url) => discoveredUrls.add(url))

        const urlsAfterClick = discoveredUrls.size
        const newDiscovered = urlsAfterClick - urlsBeforeClick

        if (newDiscovered > 0) {
          console.log(`[MenuDiscovery] ✓ ${newDiscovered} nouvelles URLs découvertes`)
        }

        // Arrêt anticipé si aucune découverte pendant 5 clics consécutifs
        if (clicksPerformed >= 5 && urlsAfterClick === urlsBeforeClick) {
          const recentClicks = clickableElements.slice(
            clicksPerformed - 5,
            clicksPerformed
          )
          const recentDiscoveries = recentClicks.some(() => newDiscovered > 0)
          if (!recentDiscoveries) {
            console.log('[MenuDiscovery] Aucune découverte récente, arrêt anticipé')
            break
          }
        }
      } catch (error) {
        // Erreur de clic (élément disparu, timeout, etc.) → continuer
        console.warn(`[MenuDiscovery] Erreur clic sur "${element.text}":`, error)
        continue
      }
    }

    const finalUrls = Array.from(discoveredUrls)
    console.log(
      `[MenuDiscovery] Découverte terminée: ${finalUrls.length} URLs (${clicksPerformed} clics)`
    )

    return {
      urls: finalUrls,
      clicksPerformed,
    }
  } catch (error) {
    console.error('[MenuDiscovery] Erreur générale:', error)
    return {
      urls: Array.from(discoveredUrls),
      clicksPerformed,
    }
  }
}
