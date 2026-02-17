/**
 * Fixtures E2E Réutilisables
 *
 * Phase 4.5 - E2E Auth Fixtures
 *
 * Fournit des fixtures Playwright avec authentification intégrée.
 *
 * Usage:
 * ```typescript
 * import { test, expect } from '@/e2e/fixtures'
 *
 * test('dashboard accessible', async ({ authenticatedPage }) => {
 *   await authenticatedPage.goto('/dashboard')
 *   await expect(authenticatedPage).toHaveURL(/dashboard/)
 * })
 * ```
 */

import { test as base, Page, BrowserContext, expect } from '@playwright/test'
import path from 'path'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Options de navigation avec helpers
 */
export interface QadhyaPage extends Page {
  waitForSuccess(): Promise<void>
  waitForError(): Promise<void>
  dismissToast(): Promise<void>
}

/**
 * Extensions fixtures
 */
type QadhyaFixtures = {
  /** Page authentifiée (user normal) */
  authenticatedPage: Page
  /** Page authentifiée en tant qu'admin */
  adminPage: Page
  /** Page non authentifiée */
  publicPage: Page
  /** Helpers auth */
  loginAs: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Effectue une connexion sur la page
 */
async function performLogin(page: Page, email: string, password: string): Promise<void> {
  await page.goto('/login')
  await page.waitForSelector('input[name="email"], input[type="email"]', { timeout: 10000 })

  await page.fill('input[name="email"], input[type="email"]', email)
  await page.fill('input[name="password"], input[type="password"]', password)
  await page.click('button[type="submit"]')

  await page.waitForURL(/dashboard|\//, { timeout: 15000 })
  await expect(page).not.toHaveURL(/\/login/)
}

/**
 * Effectue une déconnexion
 */
async function performLogout(page: Page): Promise<void> {
  // Essayer le bouton déconnexion (peut varier selon l'UI)
  try {
    await page.click('[data-testid="logout-button"], button:has-text("Déconnexion"), a:has-text("Déconnexion")', { timeout: 3000 })
    await page.waitForURL(/login/, { timeout: 5000 })
  } catch {
    // Fallback: effacer les cookies/storage
    await page.context().clearCookies()
    await page.evaluate(() => {
      localStorage.clear()
      sessionStorage.clear()
    })
    await page.goto('/login')
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Test avec fixtures d'authentification Qadhya
 */
export const test = base.extend<QadhyaFixtures>({
  /**
   * Page authentifiée en tant qu'utilisateur normal
   * Réutilise l'état de session sauvegardé par setup:user
   */
  authenticatedPage: async ({ page, context }, use) => {
    // L'état auth est déjà chargé via storageState dans playwright.config.ts
    // Si pas de state, login manuellement
    const userEmail = process.env.TEST_USER_EMAIL || 'test@qadhya.tn'
    const userPassword = process.env.TEST_USER_PASSWORD || 'testpassword123'

    // Vérifier si déjà authentifié
    await page.goto('/dashboard')
    const isOnDashboard = page.url().includes('dashboard')

    if (!isOnDashboard) {
      // Pas authentifié, login manuel
      await performLogin(page, userEmail, userPassword)
    }

    await use(page)
  },

  /**
   * Page authentifiée en tant que super admin
   * Réutilise l'état de session sauvegardé par setup:admin
   */
  adminPage: async ({ page, context }, use) => {
    const adminEmail = process.env.TEST_ADMIN_EMAIL || 'admin@qadhya.tn'
    const adminPassword = process.env.TEST_ADMIN_PASSWORD || 'adminpassword123'

    // Vérifier si déjà authentifié en tant qu'admin
    await page.goto('/super-admin')
    const isOnAdmin = page.url().includes('super-admin')

    if (!isOnAdmin) {
      // Login admin manuel
      await performLogin(page, adminEmail, adminPassword)
      await page.goto('/super-admin')
    }

    await use(page)
  },

  /**
   * Page non authentifiée (pour tests pages publiques)
   */
  publicPage: async ({ page }, use) => {
    // Effacer l'état auth
    await page.context().clearCookies()
    await use(page)
  },

  /**
   * Helper pour login manuel
   */
  loginAs: async ({ page }, use) => {
    const loginFn = async (email: string, password: string) => {
      await performLogin(page, email, password)
    }
    await use(loginFn)
  },

  /**
   * Helper pour logout
   */
  logout: async ({ page }, use) => {
    const logoutFn = async () => {
      await performLogout(page)
    }
    await use(logoutFn)
  },
})

// Re-exporter expect
export { expect }

// ─────────────────────────────────────────────────────────────────────────────
// Helper UI
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Attendre un toast de succès
 */
export async function expectSuccessToast(page: Page, message?: string): Promise<void> {
  const toastSelector = '[role="status"], .toast, [data-sonner-toast]'

  if (message) {
    const toast = page.locator(toastSelector).filter({ hasText: message })
    await expect(toast).toBeVisible({ timeout: 5000 })
  } else {
    const toast = page.locator(toastSelector).first()
    await expect(toast).toBeVisible({ timeout: 5000 })
  }
}

/**
 * Attendre une erreur (toast ou message d'erreur)
 */
export async function expectErrorMessage(page: Page, message?: string): Promise<void> {
  const errorSelector = '[role="alert"], .error-message, [data-error="true"]'

  if (message) {
    const error = page.locator(errorSelector).filter({ hasText: message })
    await expect(error).toBeVisible({ timeout: 5000 })
  } else {
    const error = page.locator(errorSelector).first()
    await expect(error).toBeVisible({ timeout: 5000 })
  }
}

/**
 * Attendre que le chargement soit terminé
 */
export async function waitForLoading(page: Page): Promise<void> {
  // Attendre la disparition des skeletons de chargement
  await page.waitForFunction(() => {
    const skeletons = document.querySelectorAll('[class*="skeleton"], [class*="loading"], [aria-busy="true"]')
    return skeletons.length === 0
  }, { timeout: 10000 }).catch(() => {
    // Timeout acceptable, la page peut être déjà chargée
  })
}

/**
 * Naviguer et attendre le chargement complet
 */
export async function navigateAndWait(page: Page, path: string): Promise<void> {
  await page.goto(path)
  await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {})
  await waitForLoading(page)
}
