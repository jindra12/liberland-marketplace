import path from 'node:path'
import { createHmac } from 'node:crypto'
import { readFileSync } from 'node:fs'

import { expect, type Page, type TestInfo } from '@playwright/test'
import { parse } from 'dotenv'

type JsonPrimitive = string | number | boolean | null
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue }

type CreatedDocumentResponse = {
  doc?: {
    _id?: string
    id?: string
  }
  _id?: string
  id?: string
}

export const deployedAdminURL = 'https://devserver.207-180-231-104.nip.io/admin'
export const deployedOrigin = new URL(deployedAdminURL).origin
export const deployedApiOrigin = new URL('/api', deployedOrigin).origin
export const loginEmail = 'dorian.sternvukotic@gmail.com'
export const loginPassword = 'test-password'
export const deployedAdminUserID = '699a4fb034fa2b9e6436599c'
const deployedSessionToken = 'playwright-session-devserver'
const deployedSessionCookieName = '__Secure-better-auth.session_token'
const deployedAuthSecret = parse(readFileSync(path.resolve(process.cwd(), 'dev.env'), 'utf8'))
  .BETTER_AUTH_SECRET

if (!deployedAuthSecret) {
  throw new Error('Missing BETTER_AUTH_SECRET in dev.env.')
}

export const generatedImagePath = path.resolve(
  process.cwd(),
  'public/test-assets/playwright-marketplace-asset.png',
)

export const createUniqueLabel = (prefix: string): string =>
  `${prefix} ${Date.now()} ${Math.random().toString(36).slice(2, 8)}`

export const toAdminUrl = (pathname: string): string => new URL(pathname, deployedOrigin).toString()
export const toApiUrl = (pathname: string): string => new URL(pathname, deployedOrigin).toString()

const signSessionCookieValue = (token: string): string => {
  const signature = createHmac('sha256', deployedAuthSecret).update(token).digest('base64')
  return encodeURIComponent(`${token}.${signature}`)
}

export const captureScreenshot = async (
  page: Page,
  testInfo: TestInfo,
  name: string,
): Promise<void> => {
  const screenshotPath = testInfo.outputPath(`${name}.png`)
  await page.screenshot({ path: screenshotPath, fullPage: true })
  await testInfo.attach(name, {
    contentType: 'image/png',
    path: screenshotPath,
  })
}

export const loginToAdmin = async (page: Page, testInfo: TestInfo): Promise<string> => {
  await page.context().addCookies([
    {
      name: deployedSessionCookieName,
      secure: true,
      url: deployedOrigin,
      value: signSessionCookieValue(deployedSessionToken),
    },
  ])

  await page.goto(deployedAdminURL, { waitUntil: 'domcontentloaded' })
  await captureScreenshot(page, testInfo, 'admin-authenticated-page')
  await captureScreenshot(page, testInfo, 'admin-dashboard')

  return deployedAdminUserID
}

export const createDocument = async (
  page: Page,
  collection: string,
  data: Record<string, JsonValue>,
): Promise<string> => {
  const response = await page.evaluate(
    async ({
      collection: nextCollection,
      data: nextData,
      origin,
    }: {
      collection: string
      data: Record<string, JsonValue>
      origin: string
    }) => {
      const response = await fetch(`${origin}/api/${nextCollection}`, {
        body: JSON.stringify(nextData),
        credentials: 'include',
        headers: {
          'content-type': 'application/json',
        },
        method: 'POST',
      })

      return {
        ok: response.ok,
        status: response.status,
        text: await response.text(),
      }
    },
    {
      collection,
      data,
      origin: deployedOrigin,
    },
  )

  if (!response.ok) {
    throw new Error(`Create ${collection} failed (${response.status}): ${response.text}`)
  }

  const body = JSON.parse(response.text) as CreatedDocumentResponse
  const id = body.doc?._id ?? body.doc?.id ?? body._id ?? body.id

  if (!id) {
    throw new Error(`Missing created document ID for ${collection}.`)
  }

  return id
}

export const deleteDocument = async (page: Page, collection: string, id: string): Promise<void> => {
  const response = await page.evaluate(
    async ({
      collection: nextCollection,
      id: nextID,
      origin,
    }: {
      collection: string
      id: string
      origin: string
    }) => {
      const response = await fetch(`${origin}/api/${nextCollection}/${nextID}`, {
        credentials: 'include',
        method: 'DELETE',
      })

      return {
        ok: response.ok,
        status: response.status,
        text: await response.text(),
      }
    },
    {
      collection,
      id,
      origin: deployedOrigin,
    },
  )

  expect(response.status).toBeGreaterThanOrEqual(200)
  expect(response.status).toBeLessThan(500)
}

export const openCollectionDocument = async (
  page: Page,
  collection: string,
  id: string,
): Promise<void> => {
  await page.goto(toAdminUrl(`/admin/collections/${collection}/${id}`), {
    waitUntil: 'domcontentloaded',
  })
}

export const openCollectionList = async (page: Page, collection: string): Promise<void> => {
  await page.goto(toAdminUrl(`/admin/collections/${collection}`), {
    waitUntil: 'domcontentloaded',
  })
}

export const saveCollectionDocument = async (
  page: Page,
  collection: string,
  id: string,
): Promise<void> => {
  const responsePromise = page.waitForResponse((response) => {
    return (
      response.request().method() === 'PATCH' &&
      response.url().includes(`/api/${collection}/${id}`) &&
      response.ok()
    )
  })

  const saveDraftButton = page.getByRole('button', { name: 'Save Draft' })

  if (await saveDraftButton.count()) {
    await saveDraftButton.click()
  } else {
    await page.getByRole('button', { name: 'Save' }).click()
  }

  await responsePromise
}

export const uploadImage = async (page: Page): Promise<void> => {
  const imageResponse = page.waitForResponse((response) => {
    return response.request().method() === 'POST' && response.url().includes('/api/media')
  })

  await page.locator('input[type="file"]').first().setInputFiles(generatedImagePath)
  await imageResponse
}
