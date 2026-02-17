/**
 * Tests E2E - Dashboard Monitoring Admin
 *
 * Phase 4.5 - Tests E2E Auth
 *
 * Vérifie l'accès et le fonctionnement du dashboard monitoring
 * nécessitant une authentification super-admin.
 */

import { test, expect } from '@/e2e/fixtures'

test.describe('Monitoring Dashboard (Admin)', () => {
  test('accède au dashboard monitoring', async ({ adminPage: page }) => {
    await page.goto('/super-admin/monitoring')

    // Vérifier URL correcte
    await expect(page).toHaveURL(/super-admin\/monitoring/)

    // Vérifier titre page
    await expect(page.locator('h1, h2').first()).toBeVisible()
  })

  test('affiche les onglets monitoring', async ({ adminPage: page }) => {
    await page.goto('/super-admin/monitoring')

    // Vérifier présence des onglets principaux
    const tabs = page.locator('[role="tab"]')
    await expect(tabs.first()).toBeVisible()

    // Vérifier au moins 4 onglets
    const tabCount = await tabs.count()
    expect(tabCount).toBeGreaterThanOrEqual(4)
  })

  test('charge les métriques KB Quality', async ({ adminPage: page }) => {
    await page.goto('/super-admin/monitoring?tab=kb-quality')

    // Attendre chargement (auto-refresh 30s, premier load ~3s)
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {})

    // Vérifier KPIs visibles (au moins un badge/chiffre)
    const metrics = page.locator('[class*="card"], [class*="metric"], [class*="stat"]')
    await expect(metrics.first()).toBeVisible({ timeout: 10000 })
  })

  test('charge le tableau de bord des crons', async ({ adminPage: page }) => {
    await page.goto('/super-admin/monitoring?tab=crons')

    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {})

    // Vérifier section crons visible
    const cronSection = page.locator('text=/cron|Cron|schedule|Schedule/i').first()
    await expect(cronSection).toBeVisible({ timeout: 10000 })
  })
})

test.describe('Pages Super-Admin (Admin)', () => {
  test('accède à la liste des utilisateurs', async ({ adminPage: page }) => {
    await page.goto('/super-admin/users')
    await expect(page).toHaveURL(/super-admin\/users/)

    // Vérifier tableau utilisateurs visible
    await expect(page.locator('table, [role="table"], [class*="table"]').first())
      .toBeVisible({ timeout: 10000 })
  })

  test('accède à la Knowledge Base admin', async ({ adminPage: page }) => {
    await page.goto('/super-admin/knowledge-base')
    await expect(page).toHaveURL(/super-admin\/knowledge-base/)

    // Vérifier contenu visible
    await expect(page.locator('main').first()).toBeVisible()
  })

  test('redirige si non admin', async ({ publicPage: page }) => {
    // Une page non authentifiée devrait être redirigée vers /login
    await page.goto('/super-admin/monitoring')

    await page.waitForURL(/login|super-admin/, { timeout: 10000 })

    // Soit redirigé vers login, soit accès refusé
    const currentUrl = page.url()
    const isRedirected = currentUrl.includes('/login') || currentUrl.includes('/404')
    expect(isRedirected).toBe(true)
  })
})
