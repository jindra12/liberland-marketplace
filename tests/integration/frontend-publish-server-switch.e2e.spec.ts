import { expect, test, type Page } from '@playwright/test'

import { captureHtmlSnapshot, captureScreenshot } from './helpers'

const frontendURL = 'https://nswap-test.vercel.app/'
const authClientId = 'frontend-app'
const mainServerURL = 'https://devserver.207-180-231-104.nip.io'

const buildOidcUserRecord = (authority: string, accessToken: string, sub: string): string => {
  const now = Math.floor(Date.now() / 1000)
  return JSON.stringify({
    access_token: accessToken,
    expires_at: now + 3600,
    profile: {
      aud: authClientId,
      email: `${sub}@example.test`,
      email_verified: true,
      exp: now + 3600,
      iat: now,
      iss: `${authority}/api/auth`,
      name: sub,
      picture: 'https://example.test/avatar.png',
      sub,
    },
    scope: 'openid profile email',
    token_type: 'Bearer',
  })
}

const buildAuthKeys = (authority: string) => {
  return {
    authKey: `user:${authority}/api/auth:${authClientId}`,
    accessKey: `oidc.user:${authority}/api/auth:${authClientId}`,
  }
}

const seedAuthState = async (
  page: Page,
  authority: string,
  accessToken: string,
  sub: string,
): Promise<void> => {
  const { authKey, accessKey } = buildAuthKeys(authority)
  const serialized = buildOidcUserRecord(authority, accessToken, sub)

  await page.evaluate(
    ({ authKey: nextAuthKey, accessKey: nextAccessKey, nextSerialized }) => {
      window.localStorage.setItem(nextAuthKey, nextSerialized)
      window.localStorage.setItem(nextAccessKey, nextSerialized)
    },
    { authKey, accessKey, nextSerialized: serialized },
  )
}

const waitForMenuItems = async (page: Page, minimumCount: number): Promise<void> => {
  await expect
    .poll(
      async () =>
        page.evaluate(() => {
          const raw = window.localStorage.getItem('endpoints.urls')
          if (!raw) {
            return 0
          }

          try {
            const urls = JSON.parse(raw) as Array<{ value?: string }>
            return urls.length
          } catch {
            return 0
          }
        }),
      {
        timeout: 60000,
      },
    )
    .toBeGreaterThanOrEqual(minimumCount)
}

const readStoredEndpoints = async (
  page: Page,
): Promise<Array<{ value: string; name?: string }>> => {
  return page.evaluate(() => {
    const raw = window.localStorage.getItem('endpoints.urls')

    if (!raw) {
      return []
    }

    try {
      return JSON.parse(raw) as Array<{ value: string; name?: string }>
    } catch {
      return []
    }
  })
}

const clickEndpointItem = async (page: Page, index: number): Promise<void> => {
  const item = page
    .locator('.ant-dropdown:not(.ant-dropdown-hidden) .ant-dropdown-menu-item')
    .nth(index)
  await expect(item).toBeVisible({ timeout: 60000 })
  await item.click()
}

const clickMenuItemInGroup = async (page: Page, itemText: string, fallbackText?: string): Promise<void> => {
  const dropdown = page.locator('.ant-dropdown:not(.ant-dropdown-hidden)').last()
  await expect(dropdown).toBeVisible({ timeout: 60000 })

  const items = dropdown.getByRole('menuitem')
  const itemTexts = await items.allInnerTexts()
  const matchedIndex = itemTexts.findIndex((text) => {
    return text.includes(itemText) || (fallbackText ? text.includes(fallbackText) : false)
  })

  expect(matchedIndex, `expected to find a menu item for ${itemText}`).toBeGreaterThanOrEqual(0)

  const item = items.nth(matchedIndex)
  await expect(item).toBeVisible({ timeout: 60000 })
  await item.click()
}

const dismissNsfwGateIfPresent = async (page: Page): Promise<void> => {
  const modal = page.locator('.SyndicationNsfwModal')

  if ((await modal.count()) === 0) {
    return
  }

  const continueButton = page.getByRole('button', { name: /^Continue to site$/i })
  await expect(continueButton).toBeVisible({ timeout: 60000 })
  await continueButton.click()
  await expect(modal).toBeHidden({ timeout: 60000 })
}

test.describe('Frontend publish server switching', () => {
  test('logs into Main, logs out, switches servers from Create, and lands on Publish', async ({
    page,
  }, testInfo) => {
    await page.addInitScript(
      ({ authority, accessToken, sub }) => {
        const now = Math.floor(Date.now() / 1000)
        const record = {
          access_token: accessToken,
          expires_at: now + 3600,
          profile: {
            aud: 'frontend-app',
            email: `${sub}@example.test`,
            email_verified: true,
            exp: now + 3600,
            iat: now,
            iss: `${authority}/api/auth`,
            name: sub,
            picture: 'https://example.test/avatar.png',
            sub,
          },
          scope: 'openid profile email',
          token_type: 'Bearer',
        }

        const serialized = JSON.stringify(record)
        window.localStorage.setItem(`user:${authority}/api/auth:frontend-app`, serialized)
        window.localStorage.setItem(`oidc.user:${authority}/api/auth:frontend-app`, serialized)
      },
      {
        authority: mainServerURL,
        accessToken: 'main-server-access-token',
        sub: 'main-user',
      },
    )

    await page.goto(frontendURL, { waitUntil: 'domcontentloaded' })
    await captureScreenshot(page, testInfo, 'frontend-home')
    await captureHtmlSnapshot(page, testInfo, 'frontend-home')
    await dismissNsfwGateIfPresent(page)

    await page.locator('.AppHeader__authBtn').click()
    await clickMenuItemInGroup(page, 'Main', mainServerURL)
    await expect(page.locator('.AppHeader__authBtn')).toHaveText(/log in/i, {
      timeout: 60000,
    })

    await waitForMenuItems(page, 2)
    const discoveredServers = await readStoredEndpoints(page)

    const secondServer = discoveredServers[1]
    expect(
      secondServer,
      'expected a second server to be available in the publish dropdown',
    ).toBeDefined()

    if (!secondServer) {
      throw new Error('Second server was not discovered.')
    }

    await seedAuthState(page, secondServer.value, 'second-server-access-token', 'second-user')
    await captureHtmlSnapshot(page, testInfo, 'frontend-before-create')

    await page.locator('.AppHeader__publishBtn').click()
    await clickEndpointItem(page, 1)

    await expect(page).toHaveURL(/\/publish(?:[?#].*)?$/)
    await expect(page.locator('.Publish')).toBeVisible({ timeout: 60000 })

    await captureScreenshot(page, testInfo, 'frontend-final-state')
    await captureHtmlSnapshot(page, testInfo, 'frontend-final-state')
  })
})
