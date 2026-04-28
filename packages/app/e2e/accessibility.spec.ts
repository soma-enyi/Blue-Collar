/**
 * Full-page accessibility tests using @axe-core/playwright.
 * Scans rendered pages for WCAG 2.1 AA violations.
 */

import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

const BASE = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3001'

const PAGES = [
  { name: 'Home', path: '/en' },
  { name: 'Workers listing', path: '/en/workers' },
  { name: 'Login', path: '/en/auth/login' },
  { name: 'Register', path: '/en/auth/register' },
  { name: 'Forgot password', path: '/en/auth/forgot-password' },
]

for (const { name, path } of PAGES) {
  test(`${name} page has no critical WCAG 2.1 AA violations`, async ({ page }) => {
    await page.goto(`${BASE}${path}`)
    await page.waitForLoadState('networkidle')

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze()

    // Filter to critical and serious violations only (skip minor/moderate in CI)
    const critical = results.violations.filter((v) =>
      ['critical', 'serious'].includes(v.impact ?? ''),
    )

    if (critical.length > 0) {
      const summary = critical
        .map(
          (v) =>
            `[${v.impact}] ${v.id}: ${v.description}\n  ${v.nodes.map((n) => n.html).join('\n  ')}`,
        )
        .join('\n\n')
      expect.fail(`Accessibility violations on "${name}":\n\n${summary}`)
    }

    expect(critical).toHaveLength(0)
  })
}
