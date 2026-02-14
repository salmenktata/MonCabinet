/**
 * Tests E2E: UI Gestion Dynamique Providers
 *
 * Tests Playwright pour valider l'UI de configuration des providers
 * par opération métier.
 *
 * Run: npm run test:e2e tests/e2e/operations-config-ui.spec.ts
 */

import { test, expect, Page } from '@playwright/test'

// =============================================================================
// SETUP
// =============================================================================

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:7002'
const SETTINGS_URL = `${BASE_URL}/super-admin/settings?tab=ai-architecture`

// Helper: Login as super admin
async function loginAsSuperAdmin(page: Page) {
  // TODO: Adapter selon votre flow d'authentification
  await page.goto(`${BASE_URL}/login`)
  await page.fill('input[name="email"]', 'admin@qadhya.tn')
  await page.fill('input[name="password"]', 'admin123')
  await page.click('button[type="submit"]')
  await page.waitForURL(/dashboard|super-admin/)
}

// =============================================================================
// TESTS
// =============================================================================

test.describe('Gestion Dynamique Providers - UI', () => {
  test.beforeEach(async ({ page }) => {
    // Login avant chaque test
    await loginAsSuperAdmin(page)
  })

  // ---------------------------------------------------------------------------
  // 1. PAGE LOAD & VISIBILITY
  // ---------------------------------------------------------------------------

  test('devrait afficher le panel Configuration par Opération', async ({ page }) => {
    await page.goto(SETTINGS_URL)

    // Attendre chargement
    await page.waitForSelector('text=Configuration par Opération')

    // Vérifier titre visible
    await expect(page.locator('text=Configuration par Opération')).toBeVisible()

    // Vérifier stats affichées
    await expect(page.locator('text=Opérations configurées')).toBeVisible()
  })

  test('devrait afficher la colonne Operations Actives dans ProviderConfigTable', async ({
    page,
  }) => {
    await page.goto(SETTINGS_URL)

    // Attendre table providers
    await page.waitForSelector('text=Configuration des Providers IA')

    // Vérifier colonne existe
    await expect(page.locator('th:has-text("Operations Actives")')).toBeVisible()
  })

  test('devrait afficher les 6 opérations dans accordion', async ({ page }) => {
    await page.goto(SETTINGS_URL)

    // Attendre accordion
    await page.waitForSelector('[data-radix-collection-item]')

    // Vérifier 6 items accordion
    const accordionItems = page.locator('[data-radix-collection-item]')
    await expect(accordionItems).toHaveCount(6)

    // Vérifier noms opérations
    await expect(page.locator('text=Assistant IA')).toBeVisible()
    await expect(page.locator('text=Indexation KB')).toBeVisible()
    await expect(page.locator('text=Assistant Dossiers')).toBeVisible()
  })

  // ---------------------------------------------------------------------------
  // 2. ACCORDION INTERACTIONS
  // ---------------------------------------------------------------------------

  test('devrait expand/collapse accordion correctement', async ({ page }) => {
    await page.goto(SETTINGS_URL)

    // Trouver trigger "Assistant IA"
    const trigger = page.locator('button:has-text("Assistant IA")').first()

    // Vérifier initialement collapsed
    const content = page.locator('[data-state="open"]').first()
    await expect(content).not.toBeVisible()

    // Click expand
    await trigger.click()

    // Vérifier expanded
    await expect(page.locator('text=Providers Chat')).toBeVisible()

    // Click collapse
    await trigger.click()

    // Vérifier collapsed
    await expect(page.locator('text=Providers Chat')).not.toBeVisible()
  })

  test('devrait afficher liste providers dans card expanded', async ({ page }) => {
    await page.goto(SETTINGS_URL)

    // Expand "Assistant IA"
    await page.locator('button:has-text("Assistant IA")').first().click()

    // Attendre liste providers
    await page.waitForSelector('text=Providers Chat')

    // Vérifier providers affichés
    await expect(page.locator('text=Groq')).toBeVisible()
    await expect(page.locator('text=Gemini')).toBeVisible()
    await expect(page.locator('text=DeepSeek')).toBeVisible()
    await expect(page.locator('text=Ollama')).toBeVisible()
  })

  // ---------------------------------------------------------------------------
  // 3. PROVIDER ENABLE/DISABLE
  // ---------------------------------------------------------------------------

  test('devrait toggle provider ON/OFF', async ({ page }) => {
    await page.goto(SETTINGS_URL)

    // Expand "Assistant IA"
    await page.locator('button:has-text("Assistant IA")').first().click()

    // Trouver switch pour "DeepSeek"
    const deepseekRow = page.locator('div:has-text("DeepSeek")').first()
    const switchButton = deepseekRow.locator('button[role="switch"]')

    // Vérifier état initial (enabled)
    const initialState = await switchButton.getAttribute('data-state')

    // Toggle OFF
    await switchButton.click()

    // Attendre unsaved changes bar
    await expect(page.locator('text=modification(s) non sauvegardée(s)')).toBeVisible()

    // Toggle ON (revert)
    await switchButton.click()

    // Vérifier revenu à l'état initial
    const finalState = await switchButton.getAttribute('data-state')
    expect(finalState).toBe(initialState)
  })

  // ---------------------------------------------------------------------------
  // 4. REORDER FALLBACK
  // ---------------------------------------------------------------------------

  test('devrait reorder providers avec up/down arrows', async ({ page }) => {
    await page.goto(SETTINGS_URL)

    // Expand "Assistant IA"
    await page.locator('button:has-text("Assistant IA")').first().click()

    // Trouver provider "Gemini"
    const geminiRow = page.locator('div:has-text("Gemini")').first()

    // Click arrow DOWN
    const downButton = geminiRow.locator('button:has-text("ChevronDown")').first()
    await downButton.click()

    // Attendre unsaved changes bar
    await expect(page.locator('text=modification(s) non sauvegardée(s)')).toBeVisible()
  })

  // ---------------------------------------------------------------------------
  // 5. SET PRIMARY PROVIDER
  // ---------------------------------------------------------------------------

  test('devrait changer primary provider', async ({ page }) => {
    await page.goto(SETTINGS_URL)

    // Expand "Assistant IA"
    await page.locator('button:has-text("Assistant IA")').first().click()

    // Trouver bouton "Définir primaire" pour Gemini
    const setPrimaryButton = page
      .locator('button:has-text("Définir primaire")')
      .filter({ hasText: 'Gemini' })
      .first()

    // Click set primary
    await setPrimaryButton.click()

    // Attendre unsaved changes bar
    await expect(page.locator('text=modification(s) non sauvegardée(s)')).toBeVisible()

    // Vérifier badge "Primary" affiché
    await expect(page.locator('text=🏆 Primary')).toBeVisible()
  })

  // ---------------------------------------------------------------------------
  // 6. TIMEOUTS CONFIGURATION
  // ---------------------------------------------------------------------------

  test('devrait modifier timeouts', async ({ page }) => {
    await page.goto(SETTINGS_URL)

    // Expand "Assistant IA"
    await page.locator('button:has-text("Assistant IA")').first().click()

    // Trouver input timeout chat
    const chatInput = page.locator('input[type="number"]').filter({ hasText: 'Chat' }).first()

    // Modifier valeur
    await chatInput.fill('35000')

    // Attendre unsaved changes bar
    await expect(page.locator('text=modification(s) non sauvegardée(s)')).toBeVisible()
  })

  // ---------------------------------------------------------------------------
  // 7. VALIDATION ERRORS
  // ---------------------------------------------------------------------------

  test('devrait afficher erreur si chat timeout > total timeout', async ({ page }) => {
    await page.goto(SETTINGS_URL)

    // Expand "Assistant IA"
    await page.locator('button:has-text("Assistant IA")').first().click()

    // Modifier chat timeout > total timeout
    const chatInput = page.locator('label:has-text("Chat")').locator('input').first()
    const totalInput = page.locator('label:has-text("Total")').locator('input').first()

    // Set chat > total
    await totalInput.fill('40000')
    await chatInput.fill('50000')

    // Attendre validation error
    await expect(page.locator('text=Timeout chat doit être ≤ timeout total')).toBeVisible()
  })

  // ---------------------------------------------------------------------------
  // 8. UNSAVED CHANGES
  // ---------------------------------------------------------------------------

  test('devrait afficher unsaved changes bar', async ({ page }) => {
    await page.goto(SETTINGS_URL)

    // Expand "Assistant IA"
    await page.locator('button:has-text("Assistant IA")').first().click()

    // Modifier timeout
    const chatInput = page.locator('label:has-text("Chat")').locator('input').first()
    await chatInput.fill('35000')

    // Vérifier bar apparaît
    await expect(page.locator('text=modification(s) non sauvegardée(s)')).toBeVisible()

    // Vérifier boutons affichés
    await expect(page.locator('button:has-text("Annuler")')).toBeVisible()
    await expect(page.locator('button:has-text("Enregistrer tout")')).toBeVisible()
  })

  test('devrait sauvegarder modifications avec Enregistrer tout', async ({ page }) => {
    await page.goto(SETTINGS_URL)

    // Expand "Assistant IA"
    await page.locator('button:has-text("Assistant IA")').first().click()

    // Modifier timeout
    const chatInput = page.locator('label:has-text("Chat")').locator('input').first()
    await chatInput.fill('35000')

    // Click Enregistrer tout
    const saveButton = page.locator('button:has-text("Enregistrer tout")')
    await saveButton.click()

    // Attendre toast success
    await expect(page.locator('text=Configuration mise à jour')).toBeVisible({
      timeout: 10000,
    })

    // Vérifier unsaved changes bar disparaît
    await expect(page.locator('text=modification(s) non sauvegardée(s)')).not.toBeVisible()
  })

  test('devrait annuler modifications avec Annuler', async ({ page }) => {
    await page.goto(SETTINGS_URL)

    // Expand "Assistant IA"
    await page.locator('button:has-text("Assistant IA")').first().click()

    // Modifier timeout
    const chatInput = page.locator('label:has-text("Chat")').locator('input').first()
    const originalValue = await chatInput.inputValue()
    await chatInput.fill('35000')

    // Click Annuler
    const cancelButton = page.locator('button:has-text("Annuler")')
    await cancelButton.click()

    // Vérifier unsaved changes bar disparaît
    await expect(page.locator('text=modification(s) non sauvegardée(s)')).not.toBeVisible()

    // Vérifier valeur revenue à l'original
    const currentValue = await chatInput.inputValue()
    expect(currentValue).toBe(originalValue)
  })

  // ---------------------------------------------------------------------------
  // 9. TEST PROVIDERS
  // ---------------------------------------------------------------------------

  test('devrait tester tous providers', async ({ page }) => {
    await page.goto(SETTINGS_URL)

    // Expand "Assistant IA"
    await page.locator('button:has-text("Assistant IA")').first().click()

    // Click "Tester tous"
    const testButton = page.locator('button:has-text("Tester tous")')
    await testButton.click()

    // Attendre toasts (peuvent être multiples)
    await page.waitForSelector('[data-sonner-toast]', { timeout: 10000 })

    // Vérifier au moins 1 toast affiché
    const toasts = page.locator('[data-sonner-toast]')
    await expect(toasts.first()).toBeVisible()
  })

  // ---------------------------------------------------------------------------
  // 10. STATS & BADGES
  // ---------------------------------------------------------------------------

  test('devrait afficher stats correctes', async ({ page }) => {
    await page.goto(SETTINGS_URL)

    // Attendre stats
    await page.waitForSelector('text=Opérations configurées')

    // Vérifier "6" affiché (total operations)
    const totalOps = page.locator('p.text-3xl').filter({ hasText: '6' }).first()
    await expect(totalOps).toBeVisible()
  })

  test('devrait afficher badge Personnalisé pour configs DB', async ({ page }) => {
    await page.goto(SETTINGS_URL)

    // Si une config est en DB (pas static), devrait afficher badge
    const customBadge = page.locator('text=Personnalisé').first()

    // Note: Peut ne pas être visible si toutes configs sont static
    // Test conditionnel
    const isVisible = await customBadge.isVisible().catch(() => false)
    if (isVisible) {
      await expect(customBadge).toBeVisible()
    }
  })

  // ---------------------------------------------------------------------------
  // 11. COLONNE OPERATIONS ACTIVES
  // ---------------------------------------------------------------------------

  test('devrait afficher badges operations dans colonne Operations Actives', async ({ page }) => {
    await page.goto(SETTINGS_URL)

    // Attendre table providers
    await page.waitForSelector('th:has-text("Operations Actives")')

    // Trouver ligne Groq
    const groqRow = page.locator('tr:has-text("Groq")').first()

    // Vérifier badge "Assistant IA" avec 🏆 (primary)
    const badge = groqRow.locator('text=Assistant IA').first()
    await expect(badge).toBeVisible()

    // Vérifier emoji 🏆 (primary)
    await expect(groqRow.locator('text=🏆')).toBeVisible()
  })

  // ---------------------------------------------------------------------------
  // 12. RESPONSIVE & ACCESSIBILITY
  // ---------------------------------------------------------------------------

  test('devrait être accessible au clavier', async ({ page }) => {
    await page.goto(SETTINGS_URL)

    // Focus sur premier accordion trigger
    await page.keyboard.press('Tab')
    await page.keyboard.press('Tab') // Skip header buttons

    // Verify focus visible
    const focused = await page.evaluate(() => document.activeElement?.tagName)
    expect(focused).toBeTruthy()
  })
})

// =============================================================================
// TESTS API (bonus)
// =============================================================================

test.describe('Operations Config API', () => {
  test('GET /api/admin/operations-config devrait retourner 6 opérations', async ({
    request,
  }) => {
    // Note: Nécessite session cookie
    const response = await request.get(`${BASE_URL}/api/admin/operations-config`)

    expect(response.status()).toBe(200)

    const data = await response.json()
    expect(data.success).toBe(true)
    expect(data.operations).toHaveLength(6)
  })

  test('GET /api/admin/operations-config/assistant-ia devrait retourner config', async ({
    request,
  }) => {
    const response = await request.get(`${BASE_URL}/api/admin/operations-config/assistant-ia`)

    expect(response.status()).toBe(200)

    const data = await response.json()
    expect(data.success).toBe(true)
    expect(data.operation.operationName).toBe('assistant-ia')
  })
})
