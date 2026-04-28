import { test, expect } from '@playwright/test'

const BASE = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3001'

/**
 * Visual regression tests using Playwright's built-in screenshot comparison.
 * Run `pnpm test:e2e --update-snapshots` to update baseline screenshots.
 */
test.describe('Visual regression', () => {
  test('home page matches snapshot', async ({ page }) => {
    await page.goto(`${BASE}/en`)
    await page.waitForLoadState('networkidle')
    await expect(page).toHaveScreenshot('home.png', { maxDiffPixelRatio: 0.02 })
  })

  test('workers listing page matches snapshot', async ({ page }) => {
    await page.goto(`${BASE}/en/workers`)
    await page.waitForLoadState('networkidle')
    await expect(page).toHaveScreenshot('workers-list.png', { maxDiffPixelRatio: 0.02 })
  })

  test('login page matches snapshot', async ({ page }) => {
    await page.goto(`${BASE}/en/auth/login`)
    await page.waitForLoadState('networkidle')
    await expect(page).toHaveScreenshot('login.png', { maxDiffPixelRatio: 0.02 })
  })

  test('register page matches snapshot', async ({ page }) => {
    await page.goto(`${BASE}/en/auth/register`)
    await page.waitForLoadState('networkidle')
    await expect(page).toHaveScreenshot('register.png', { maxDiffPixelRatio: 0.02 })
  })
})
