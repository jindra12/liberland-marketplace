import path from 'node:path'

import { expect, type Locator, type Page, type TestInfo } from '@playwright/test'

type CreatedDocumentResponse = {
  doc?: {
    _id?: string
    id?: string
  }
  _id?: string
  id?: string
}

export const deployedAdminURL = 'https://devserver.207-180-231-104.nip.io/admin'
export const deployedAdminLoginURL = 'https://devserver.207-180-231-104.nip.io/admin/login'
export const deployedOrigin = new URL(deployedAdminURL).origin
export const loginEmail = 'dorian.sternvukotic@gmail.com'
export const loginPassword = 'test-password'
export const deployedAdminUserID = '699a4fb034fa2b9e6436599c'

export const generatedImagePath = path.resolve(
  process.cwd(),
  'public/test-assets/playwright-marketplace-asset.png',
)

export const createUniqueLabel = (prefix: string): string =>
  `${prefix} ${Date.now()} ${Math.random().toString(36).slice(2, 8)}`

export const toAdminUrl = (pathname: string): string => new URL(pathname, deployedOrigin).toString()

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
  await page.goto(deployedAdminLoginURL, { waitUntil: 'domcontentloaded' })
  await captureScreenshot(page, testInfo, 'admin-login-form')

  await page.locator('input[type="text"]').first().fill(loginEmail)
  await page.locator('input[type="password"]').first().fill(loginPassword)

  await Promise.all([
    page.getByRole('button', { name: /login/i }).click({ noWaitAfter: true }),
  ])

  await expect.poll(() => page.url()).toMatch(/\/admin\/?$/)
  await captureScreenshot(page, testInfo, 'admin-dashboard')

  return deployedAdminUserID
}

export const openCollectionCreate = async (page: Page, collection: string): Promise<void> => {
  await page.goto(toAdminUrl(`/admin/collections/${collection}/create`), {
    waitUntil: 'domcontentloaded',
  })
}

export const fillTextField = async (page: Page, label: string, value: string): Promise<void> => {
  await page.getByRole('textbox', { name: label }).fill(value)
}

export const fillRelationshipField = async (
  page: Page,
  label: string,
  value: string,
): Promise<void> => {
  const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const labelPattern = new RegExp(`^${escapedLabel}(\\s*\\*)?$`)
  const fieldCandidates: Locator[] = [
    page
      .locator('label')
      .filter({ hasText: labelPattern })
      .locator('xpath=ancestor::div[contains(@class,"field")][1]//div[contains(@class,"relationship__wrap")]//input')
      .first(),
    page.getByRole('combobox', { name: label }),
  ]
  const fieldMatches = await Promise.all(
    fieldCandidates.map(async (candidate) => ((await candidate.count()) > 0 ? candidate : null)),
  )
  const field = fieldMatches.find((candidate): candidate is Locator => candidate !== null)

  if (!field) {
    throw new Error(`Relationship field ${label} was not found.`)
  }

  await field.waitFor({ state: 'visible' })
  await field.evaluate((element) => {
    if (element instanceof HTMLInputElement) {
      element.focus()
    }
  })
  await page.keyboard.type(value)
  await page.getByRole('option', { name: value }).first().click()
}

export const fillSelectField = async (
  page: Page,
  label: string,
  value: string,
): Promise<void> => {
  const field = page.getByRole('combobox', { name: label })

  await field.click()
  await page.getByRole('option', { name: value }).first().click()
}

export const toggleCheckboxField = async (
  page: Page,
  label: string,
  checked: boolean,
): Promise<void> => {
  const checkbox = page.getByRole('checkbox', { name: label })

  if (checked) {
    await checkbox.check()
    return
  }

  await checkbox.uncheck()
}

export const saveNewCollectionDocument = async (
  page: Page,
  collection: string,
): Promise<string> => {
  const saveButton = page.getByRole('button', { name: /save/i }).first()
  const nextURL = new RegExp(`/admin/collections/${collection}/[^/]+$`)
  const responsePromise = page.waitForResponse((response) => {
    return (
      (response.request().method() === 'POST' || response.request().method() === 'PATCH') &&
      response.url().includes(`/api/${collection}`)
    )
  })
  const navigationPromise = page.waitForURL(nextURL, { timeout: 60000 }).catch(() => {})

  await saveButton.click()

  const response = await responsePromise
  const responseText = await response.text()

  if (!response.ok()) {
    throw new Error(`Create ${collection} failed (${response.status()}): ${responseText}`)
  }

  await navigationPromise
  await page.waitForLoadState('networkidle').catch(() => {})

  const body = JSON.parse(responseText) as CreatedDocumentResponse
  const id = body.doc?._id ?? body.doc?.id ?? body._id ?? body.id

  if (!id || id === 'create') {
    throw new Error(`Missing created document ID for ${collection}. Response: ${responseText}`)
  }

  return id
}

export const deleteDocument = async (page: Page, collection: string, id: string): Promise<void> => {
  const deleteButtons = page.getByRole('button', { name: /^delete$/i })
  const deleteButtonCount = await deleteButtons.count()

  if (!deleteButtonCount) {
    throw new Error(`Delete button not found for ${collection}/${id}.`)
  }

  const deleteButton = deleteButtons.first()
  const dialog = page.getByRole('dialog')
  page.once('dialog', async (browserDialog) => {
    await browserDialog.accept()
  })

  await deleteButton.click()

  if (await dialog.count()) {
    const confirmDeleteButton = dialog.getByRole('button', { name: /^delete$/i })

    if (await confirmDeleteButton.count()) {
      await confirmDeleteButton.first().click()
    }
  }

  await page.waitForLoadState('domcontentloaded').catch(() => {})
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
