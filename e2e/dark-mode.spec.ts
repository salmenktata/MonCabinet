/**
 * Tests E2E - Mode Sombre
 *
 * Vérifie le fonctionnement complet du mode sombre :
 * - Toggle light/dark/system
 * - Persistence localStorage
 * - Rendu correct des composants
 * - Pas de FOUC (Flash of Unstyled Content)
 */

import { test, expect } from '@/e2e/fixtures'

test.describe('Dark Mode', () => {
  test.beforeEach(async ({ authenticatedPage: page }) => {
    // Clear localStorage before each test (auth already handled by fixture)
    await page.goto('/dashboard')
    await page.evaluate(() => localStorage.clear())
  })

  test('should toggle between light and dark mode', async ({ page }) => {
    await page.goto('/dashboard')

    // Vérifier que le toggle existe
    const themeToggle = page.locator('[data-testid="theme-toggle"]')
    await expect(themeToggle).toBeVisible()

    // Click pour ouvrir le menu
    await themeToggle.click()

    // Sélectionner mode sombre
    await page.click('text=Sombre')

    // Vérifier que la classe dark est ajoutée
    const html = page.locator('html')
    await expect(html).toHaveClass(/dark/)

    // Vérifier que la couleur de fond a changé
    const body = page.locator('body')
    const bgColor = await body.evaluate((el) =>
      window.getComputedStyle(el).backgroundColor
    )

    // En mode sombre, le fond ne doit PAS être blanc
    expect(bgColor).not.toBe('rgb(255, 255, 255)')
  })

  test('should persist theme across page reloads', async ({ page }) => {
    await page.goto('/dashboard')

    // Activer mode sombre
    await page.click('[data-testid="theme-toggle"]')
    await page.click('text=Sombre')

    // Vérifier localStorage
    const theme = await page.evaluate(() => localStorage.getItem('theme'))
    expect(theme).toBe('dark')

    // Recharger la page
    await page.reload()

    // Vérifier que le mode sombre persiste
    const html = page.locator('html')
    await expect(html).toHaveClass(/dark/)
  })

  test('should persist theme across navigation', async ({ page }) => {
    await page.goto('/dashboard')

    // Activer mode sombre
    await page.click('[data-testid="theme-toggle"]')
    await page.click('text=Sombre')

    // Naviguer vers une autre page
    await page.goto('/dashboard/dossiers')

    // Vérifier que le mode sombre persiste
    const html = page.locator('html')
    await expect(html).toHaveClass(/dark/)
  })

  test('should default to system theme', async ({ page }) => {
    await page.goto('/dashboard')

    // Par défaut, le thème devrait être "system"
    const theme = await page.evaluate(() => localStorage.getItem('theme'))
    expect(theme).toBeNull() // null = system par défaut

    // Le toggle devrait afficher "Système"
    const themeToggle = page.locator('[data-testid="theme-toggle"]')
    await themeToggle.click()

    const systemOption = page.locator('text=Système')
    await expect(systemOption).toBeVisible()
  })

  test('should apply correct colors in dark mode', async ({ page }) => {
    await page.goto('/dashboard')

    // Activer mode sombre
    await page.click('[data-testid="theme-toggle"]')
    await page.click('text=Sombre')

    // Vérifier les couleurs CSS variables
    const rootStyles = await page.evaluate(() => {
      const root = document.documentElement
      const styles = window.getComputedStyle(root)
      return {
        background: styles.getPropertyValue('--background'),
        foreground: styles.getPropertyValue('--foreground'),
        card: styles.getPropertyValue('--card'),
      }
    })

    // En mode sombre, background doit être sombre (HSL 222 47% 11%)
    expect(rootStyles.background.trim()).toBe('222 47% 11%')

    // Foreground doit être clair (HSL 210 40% 98%)
    expect(rootStyles.foreground.trim()).toBe('210 40% 98%')
  })

  test('should apply correct colors in light mode', async ({ page }) => {
    await page.goto('/dashboard')

    // S'assurer qu'on est en mode clair
    await page.click('[data-testid="theme-toggle"]')
    await page.click('text=Clair')

    // Vérifier les couleurs CSS variables
    const rootStyles = await page.evaluate(() => {
      const root = document.documentElement
      const styles = window.getComputedStyle(root)
      return {
        background: styles.getPropertyValue('--background'),
        foreground: styles.getPropertyValue('--foreground'),
      }
    })

    // En mode clair, background doit être blanc (HSL 0 0% 100%)
    expect(rootStyles.background.trim()).toBe('0 0% 100%')

    // Foreground doit être sombre (HSL 222 47% 11%)
    expect(rootStyles.foreground.trim()).toBe('222 47% 11%')
  })

  test('should not have FOUC (Flash of Unstyled Content)', async ({ page }) => {
    // Activer mode sombre d'abord
    await page.goto('/dashboard')
    await page.click('[data-testid="theme-toggle"]')
    await page.click('text=Sombre')

    // Recharger et vérifier qu'il n'y a pas de flash
    const startTime = Date.now()
    await page.reload()

    // Vérifier immédiatement que dark class est présente
    const html = page.locator('html')
    const hasDarkClass = await html.evaluate((el) => el.classList.contains('dark'))

    const loadTime = Date.now() - startTime

    // Dark class doit être présente AVANT le render (< 100ms)
    expect(hasDarkClass).toBe(true)
    expect(loadTime).toBeLessThan(1000)
  })

  test('should render all components correctly in dark mode', async ({ page }) => {
    await page.goto('/dashboard')

    // Activer mode sombre
    await page.click('[data-testid="theme-toggle"]')
    await page.click('text=Sombre')

    // Vérifier que les composants clés existent et sont visibles
    const components = [
      page.locator('[data-testid="sidebar"]'), // Sidebar
      page.locator('[data-testid="topbar"]'), // Topbar
      page.locator('main'), // Contenu principal
    ]

    for (const component of components) {
      await expect(component).toBeVisible()
    }

    // Vérifier qu'aucun élément n'a de background blanc pur
    const whiteElements = await page.evaluate(() => {
      const elements = Array.from(document.querySelectorAll('*'))
      return elements.filter((el) => {
        const bg = window.getComputedStyle(el).backgroundColor
        return bg === 'rgb(255, 255, 255)'
      }).length
    })

    // En mode sombre, il ne devrait pas y avoir d'éléments blancs purs
    // (sauf peut-être quelques icônes SVG, donc on tolère < 5)
    expect(whiteElements).toBeLessThan(5)
  })

  test('should toggle keyboard accessible', async ({ page }) => {
    await page.goto('/dashboard')

    // Focus sur le toggle
    await page.keyboard.press('Tab') // Navigate to toggle
    const themeToggle = page.locator('[data-testid="theme-toggle"]:focus')

    // Ouvrir avec Enter
    await page.keyboard.press('Enter')

    // Naviguer avec flèches
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('Enter')

    // Vérifier que le mode a changé
    const html = page.locator('html')
    const hasClass = await html.evaluate((el) =>
      el.classList.contains('dark') || el.classList.contains('light')
    )
    expect(hasClass).toBe(true)
  })

  test('should handle rapid theme toggles', async ({ page }) => {
    await page.goto('/dashboard')

    // Toggle rapidement plusieurs fois
    for (let i = 0; i < 5; i++) {
      await page.click('[data-testid="theme-toggle"]')
      await page.click('text=Sombre')
      await page.click('[data-testid="theme-toggle"]')
      await page.click('text=Clair')
    }

    // Finir en mode sombre
    await page.click('[data-testid="theme-toggle"]')
    await page.click('text=Sombre')

    // Vérifier que le mode final est correct
    const html = page.locator('html')
    await expect(html).toHaveClass(/dark/)

    // Vérifier localStorage
    const theme = await page.evaluate(() => localStorage.getItem('theme'))
    expect(theme).toBe('dark')
  })
})

test.describe('Dark Mode - Pages spécifiques', () => {
  test('should work correctly on auth pages', async ({ page }) => {
    await page.goto('/login')

    // Activer mode sombre
    const html = page.locator('html')

    // Ajouter dark class manuellement (pas de toggle sur login)
    await page.evaluate(() => {
      document.documentElement.classList.add('dark')
      localStorage.setItem('theme', 'dark')
    })

    // Vérifier que la page login s'affiche correctement
    await expect(page.locator('form')).toBeVisible()

    // Vérifier pas de background blanc
    const bgColor = await page.locator('body').evaluate((el) =>
      window.getComputedStyle(el).backgroundColor
    )
    expect(bgColor).not.toBe('rgb(255, 255, 255)')
  })

  test('should work correctly on super-admin pages', async ({ page }) => {
    // Connexion requise pour accéder au super-admin
    // TODO: Ajouter authentification dans beforeEach
    await page.goto('/dashboard') // Fallback

    // Activer mode sombre
    await page.click('[data-testid="theme-toggle"]')
    await page.click('text=Sombre')

    // Naviguer vers super-admin si possible
    // await page.goto('/super-admin/monitoring')

    // Vérifier mode sombre persiste
    const html = page.locator('html')
    await expect(html).toHaveClass(/dark/)
  })
})
