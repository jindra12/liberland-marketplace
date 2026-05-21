import { expect, test } from '@playwright/test'

import {
  captureScreenshot,
  deployedAdminURL,
  loginEmail,
  loginPassword,
} from './helpers'

const expectedAuthOrigin = 'https://devserver.207-180-231-104.nip.io'
const wrongAuthOrigin = 'https://devserver1.207-180-231-104.nip.io'

test.describe('Deployed admin login', () => {
  test('posts login to the devserver origin', async ({ page }, testInfo) => {
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

    await page.goto(deployedAdminURL, { waitUntil: 'domcontentloaded' })
    await captureScreenshot(page, testInfo, 'admin-login-form')
    await expect(page.getByRole('textbox').first()).toBeVisible()

    await page.getByRole('textbox').first().fill(loginEmail)
    await page.getByRole('textbox').nth(1).fill(loginPassword)

    const requestPromise = page.waitForRequest((request) => {
      return request.method() === 'POST' && (request.postData() || '').includes(loginEmail)
    })

    await page.getByRole('button', { name: 'Login' }).click()
    const request = await requestPromise

    await captureScreenshot(page, testInfo, 'admin-login-submitted')

    expect(request.url(), [
      `Expected login to stay on ${expectedAuthOrigin} but it was sent elsewhere.`,
      `Observed auth requests: ${authRequests.join(', ') || '(none)'}`,
      `Console errors: ${consoleErrors.join(' | ') || '(none)'}`,
    ].join('\n')).toContain(expectedAuthOrigin)

    expect(request.url()).not.toContain(wrongAuthOrigin)
  })
})
