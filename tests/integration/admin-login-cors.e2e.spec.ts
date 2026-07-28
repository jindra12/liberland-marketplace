import { expect, test } from '@playwright/test'

import {
  captureScreenshot,
  deployedAdminURL,
  deployedAdminLoginURL,
  loginEmail,
  loginPassword,
} from './helpers'

test.describe('Deployed admin login', () => {
  test('posts login to the configured admin origin and reaches admin', async ({ page }, testInfo) => {
    const expectedAuthOrigin = new URL(deployedAdminURL).origin
    const consoleErrors: string[] = []
    const authRequests: string[] = []

    page.on('console', (message) => {
      if (message.type() !== 'error') {
        return
      }

      consoleErrors.push(message.text())
    })

    page.on('request', (request) => {
      if (request.method() !== 'POST') {
        return
      }

      const postData = request.postData()
      if (!postData || !postData.includes(loginEmail)) {
        return
      }

      authRequests.push(request.url())
    })

    await page.goto(deployedAdminLoginURL, { waitUntil: 'domcontentloaded' })
    await captureScreenshot(page, testInfo, 'admin-login-form')

    await expect(page.locator('input').first()).toBeVisible()
    await expect(page.locator('input').nth(1)).toBeVisible()

    await page.locator('input').first().fill(loginEmail)
    await page.locator('input').nth(1).fill(loginPassword)

    const requestPromise = page.waitForRequest((request) => {
      return request.method() === 'POST' && (request.postData() || '').includes(loginEmail)
    })

    await page.getByRole('button', { name: /login/i }).click({ noWaitAfter: true })
    const request = await requestPromise

    await captureScreenshot(page, testInfo, 'admin-login-submitted')
    await expect.poll(() => page.url()).toMatch(/\/admin\/?$/)

    expect(request.url(), [
      `Expected login to stay on ${expectedAuthOrigin} but it was sent elsewhere.`,
      `Observed auth requests: ${authRequests.join(', ') || '(none)'}`,
      `Console errors: ${consoleErrors.join(' | ') || '(none)'}`,
    ].join('\n')).toContain(expectedAuthOrigin)
  })
})
