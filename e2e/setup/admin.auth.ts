/**
 * Setup Authentication - Super Admin
 *
 * Phase 4.5 - E2E Auth Fixtures
 *
 * Authentification super-admin pour les tests d'administration.
 * Vérifie l'accès à /super-admin/*.
 *
 * Variables d'environnement requises:
 * - TEST_ADMIN_EMAIL: email admin (défaut: admin@qadhya.tn)
 * - TEST_ADMIN_PASSWORD: mot de passe (défaut: adminpassword123)
 *
 * Pour exécuter:
 *   npm run test:e2e -- --project=setup:admin
 */

import { test as setup, expect } from '@playwright/test'
import path from 'path'

const authFile = path.join(__dirname, '../../.playwright/admin.json')

setup('Authenticate as super admin', async ({ page }) => {
  const email = process.env.TEST_ADMIN_EMAIL || 'admin@qadhya.tn'
  const password = process.env.TEST_ADMIN_PASSWORD || 'adminpassword123'

  console.log(`[Auth Setup] Login as admin: ${email}`)

  // Navigate to login page
  await page.goto('/login')

  // Wait for form to be visible
  await page.waitForSelector('input[name="email"], input[type="email"]', { timeout: 10000 })

  // Fill login form
  await page.fill('input[name="email"], input[type="email"]', email)
  await page.fill('input[name="password"], input[type="password"]', password)

  // Submit form
  await page.click('button[type="submit"]')

  // Wait for redirect
  await page.waitForURL(/dashboard|\//, { timeout: 15000 })

  // Verify we're NOT on login page
  await expect(page).not.toHaveURL(/\/login/)

  // Verify admin access (optional - navigate to super-admin)
  try {
    await page.goto('/super-admin')
    await page.waitForLoadState('networkidle', { timeout: 5000 })

    // Should not be redirected away from super-admin
    const url = page.url()
    if (!url.includes('super-admin')) {
      throw new Error(`Admin not redirected to super-admin: ${url}`)
    }

    console.log(`[Auth Setup] ✅ Admin access verified`)
  } catch {
    console.warn('[Auth Setup] ⚠️ Could not verify super-admin access (non-blocking)')
  }

  console.log(`[Auth Setup] ✅ Admin authenticated: ${email}`)

  // Save authentication state
  await page.context().storageState({ path: authFile })
  console.log(`[Auth Setup] ✅ Admin state saved: ${authFile}`)
})
