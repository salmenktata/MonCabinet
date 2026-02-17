/**
 * Setup Authentication - Utilisateur Normal
 *
 * Phase 4.5 - E2E Auth Fixtures
 *
 * Exécuté une seule fois avant les tests pour sauvegarder l'état d'auth.
 * Réutilisé par tous les tests via storageState.
 *
 * Variables d'environnement requises:
 * - TEST_USER_EMAIL: email du compte test (défaut: test@qadhya.tn)
 * - TEST_USER_PASSWORD: mot de passe (défaut: testpassword123)
 *
 * Pour exécuter:
 *   npm run test:e2e -- --project=setup:user
 */

import { test as setup, expect } from '@playwright/test'
import path from 'path'

const authFile = path.join(__dirname, '../../.playwright/user.json')

setup('Authenticate as regular user', async ({ page }) => {
  const email = process.env.TEST_USER_EMAIL || 'test@qadhya.tn'
  const password = process.env.TEST_USER_PASSWORD || 'testpassword123'

  console.log(`[Auth Setup] Login as user: ${email}`)

  // Navigate to login page
  await page.goto('/login')

  // Wait for form to be visible
  await page.waitForSelector('input[name="email"], input[type="email"]', { timeout: 10000 })

  // Fill login form
  await page.fill('input[name="email"], input[type="email"]', email)
  await page.fill('input[name="password"], input[type="password"]', password)

  // Submit form
  await page.click('button[type="submit"]')

  // Wait for redirect to dashboard
  await page.waitForURL(/dashboard|\//, { timeout: 15000 })

  // Verify we're logged in (not on login page)
  await expect(page).not.toHaveURL(/\/login/)

  console.log(`[Auth Setup] ✅ User authenticated: ${email}`)

  // Save authentication state
  await page.context().storageState({ path: authFile })
  console.log(`[Auth Setup] ✅ State saved: ${authFile}`)
})
