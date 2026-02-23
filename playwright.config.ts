import { defineConfig, devices } from '@playwright/test'
import path from 'path'

/**
 * Playwright Configuration for Qadhya E2E Tests
 * Phase 4.5 - E2E Auth Fixtures
 *
 * Architecture auth:
 * - setup/user.auth.ts : Login user normal → .playwright/user.json
 * - setup/admin.auth.ts : Login super-admin → .playwright/admin.json
 * - Tests utilisent storageState pour skip login
 */

// Chemins auth state
export const USER_AUTH_FILE = path.join(__dirname, '.playwright/user.json')
export const ADMIN_AUTH_FILE = path.join(__dirname, '.playwright/admin.json')

export default defineConfig({
  testDir: './e2e',

  /* Run tests in files in parallel */
  fullyParallel: true,

  /* Timeout global par test */
  timeout: 60 * 1000, // 60 secondes

  /* Expect timeout pour assertions */
  expect: {
    timeout: 10 * 1000, // 10 secondes
  },

  /* Fail the build on CI if you accidentally left test.only in the source code */
  forbidOnly: !!process.env.CI,

  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,

  /* Opt out of parallel tests on CI */
  workers: process.env.CI ? 1 : undefined,

  /* Reporter to use */
  reporter: [
    ['html', { outputFolder: 'playwright-report' }],
    ['json', { outputFile: 'playwright-report/results.json' }],
    ['list'],
  ],

  /* Shared settings for all the projects below */
  use: {
    /* Base URL to use in actions like `await page.goto('/')` */
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:7002',

    /* Collect trace when retrying the failed test */
    trace: 'on-first-retry',

    /* Screenshot on failure */
    screenshot: 'only-on-failure',

    /* Video on failure */
    video: 'retain-on-failure',

    /* Headless mode */
    headless: process.env.CI === 'true',

    /* Viewport */
    viewport: { width: 1280, height: 720 },

    /* Ignore HTTPS errors (dev only) */
    ignoreHTTPSErrors: true,

    /* Locale FR */
    locale: 'fr-FR',
    timezoneId: 'Africa/Tunis',
  },

  /* Configure projects for major browsers */
  projects: [
    // ─────────────────────────────────────────────────────────────────
    // SETUP : Authentification (exécuté AVANT les tests)
    // ─────────────────────────────────────────────────────────────────

    // Setup auth utilisateur normal
    {
      name: 'setup:user',
      testMatch: /setup\/user\.auth\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },

    // Setup auth super-admin
    {
      name: 'setup:admin',
      testMatch: /setup\/admin\.auth\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },

    // ─────────────────────────────────────────────────────────────────
    // TESTS : Avec authentification
    // ─────────────────────────────────────────────────────────────────

    // Tests authentifiés en tant qu'utilisateur
    {
      name: 'chromium:user',
      use: {
        ...devices['Desktop Chrome'],
        storageState: USER_AUTH_FILE,
      },
      dependencies: ['setup:user'],
      testIgnore: [/setup\/.*\.auth\.ts/, /admin\/.*\.spec\.ts/],
    },

    // Tests authentifiés en tant qu'admin
    {
      name: 'chromium:admin',
      use: {
        ...devices['Desktop Chrome'],
        storageState: ADMIN_AUTH_FILE,
      },
      dependencies: ['setup:admin'],
      testMatch: /admin\/.+\.spec\.ts/,
    },

    // ─────────────────────────────────────────────────────────────────
    // TESTS : Sans authentification
    // ─────────────────────────────────────────────────────────────────

    // Tests publics (pas d'auth)
    {
      name: 'chromium:public',
      use: { ...devices['Desktop Chrome'] },
      testMatch: /public\/.+\.spec\.ts/,
    },

    // Desktop Firefox (tests user)
    {
      name: 'firefox',
      use: {
        ...devices['Desktop Firefox'],
        storageState: USER_AUTH_FILE,
      },
      dependencies: ['setup:user'],
      testIgnore: /setup\/.*\.auth\.ts/,
    },

    // ─────────────────────────────────────────────────────────────────
    // RAG API TESTS : Tests API directs, pas d'auth browser
    // ─────────────────────────────────────────────────────────────────

    // Tests RAG pipeline (API-first, auth via cookie, pas de storageState)
    {
      name: 'rag:api',
      testMatch: /workflows\/rag-.*\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
      // Pas de dépendance sur setup:user (auth gérée par les tests eux-mêmes via POST /api/auth/login)
    },
  ],

  /* Run your local dev server before starting the tests */
  webServer: process.env.CI ? undefined : {
    command: 'npm run dev',
    url: 'http://localhost:7002',
    reuseExistingServer: true,
    timeout: 120 * 1000,
  },
})
