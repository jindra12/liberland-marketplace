import path from 'node:path'

import { expect, type Locator, type Page, type TestInfo } from '@playwright/test'

const defaultAdminURL = 'https://devserver.207-180-231-104.nip.io/admin'
const adminURL = process.env.PLAYWRIGHT_ADMIN_URL ?? defaultAdminURL
const adminOrigin = new URL(adminURL).origin

export const deployedAdminURL = adminURL
export const deployedAdminLoginURL = new URL('/admin/login', adminURL).toString()
export const deployedOrigin = adminOrigin
export const loginEmail = 'dorian.sternvukotic@gmail.com'
export const loginPassword = 'test-password'
export const deployedAdminUserID = '699a4fb034fa2b9e6436599c'

export const generatedImagePath = path.resolve(
  process.cwd(),
  'public/test-assets/playwright-marketplace-asset.png',
)

export const createUniqueLabel = (prefix: string): string =>
  `${prefix} ${Date.now()} ${Math.random().toString(36).slice(2, 8)}`

export const toAdminUrl = (pathname: string): string => new URL(pathname, adminOrigin).toString()

export const captureScreenshot = async (
  page: Page,
  testInfo: TestInfo,
  name: string,
): Promise<void> => {
  const screenshotPath = testInfo.outputPath(`${name}.png`)
  try {
    await page.screenshot({ path: screenshotPath, fullPage: true, timeout: 15000 })
    await testInfo.attach(name, {
      contentType: 'image/png',
      path: screenshotPath,
    })
  } catch (error) {
    console.error(`Screenshot "${name}" failed:`, error)
  }
}

export const logValidationIssues = async (page: Page): Promise<void> => {
  const issueBadge = page.getByText(/\bIssue(s)?\b/i).first()
  const issueBadgeCount = await issueBadge.count().catch(() => 0)

  if (issueBadgeCount > 0) {
    console.log('Validation issue badge text:', await issueBadge.textContent().catch(() => null))
  }

  const invalidFields = page.locator('[aria-invalid="true"]')
  const invalidFieldCount = await invalidFields.count()
  const invalidFieldSummaries = await Promise.all(
    Array.from({ length: invalidFieldCount }, async (_, index) => {
      const field = invalidFields.nth(index)
      const label =
        (await field.getAttribute('aria-label').catch(() => null)) ??
        (await field.getAttribute('name').catch(() => null)) ??
        (await field.getAttribute('id').catch(() => null))

      return {
        label,
        value: await field.inputValue().catch(() => field.textContent().catch(() => null)),
      }
    }),
  )

  console.log('Invalid field summaries:', JSON.stringify(invalidFieldSummaries, null, 2))
}

export const logFieldValues = async (
  page: Page,
  fieldNames: string[],
): Promise<void> => {
  const summaries = await Promise.all(
    fieldNames.map(async (fieldName) => {
      const field = page.locator(`[name="${fieldName}"]`).first()
      const count = await field.count()

      if (count === 0) {
        return { fieldName, present: false, value: null }
      }

      const tagName = await field.evaluate((element) => element.tagName.toLowerCase())
      const value =
        tagName === 'input' || tagName === 'textarea' || tagName === 'select'
          ? await field.inputValue().catch(() => null)
          : await field.textContent().catch(() => null)

      return { fieldName, present: true, tagName, value }
    }),
  )

  console.log('Field value summaries:', JSON.stringify(summaries, null, 2))
}

export const getDocumentActionButton = async (page: Page): Promise<Locator> => {
  const buttonCandidates = [
    page.getByRole('button', { name: /^Save Draft$/i }),
    page.getByRole('button', { name: /^Save$/i }),
    page.getByRole('button', { name: /^Publish$/i }),
  ]

  const buttonMatches = await Promise.all(
    buttonCandidates.map(async (candidate) => ((await candidate.count()) > 0 ? candidate.first() : null)),
  )
  const button = buttonMatches.find((candidate): candidate is Locator => candidate !== null)

  if (!button) {
    throw new Error('Document action button not found.')
  }

  return button
}

export const loginToAdmin = async (page: Page, testInfo: TestInfo): Promise<string> => {
  await page.goto(deployedAdminLoginURL, { waitUntil: 'commit' })
  await page.waitForLoadState('networkidle').catch(() => {})
  await captureScreenshot(page, testInfo, 'admin-login-form')

  const loginRequestPromise = page.waitForResponse((response) => {
    return (
      response.request().method() === 'POST' &&
      response.url().includes('/api/auth/sign-in/email')
    )
  })

  const emailField = page.locator('input').first()
  const passwordField = page.locator('input').nth(1)

  await emailField.fill(loginEmail)
  await passwordField.fill(loginPassword)

  await page.getByRole('button', { name: /^login$/i }).click()

  const loginResponse = await loginRequestPromise
  if (!loginResponse.ok()) {
    throw new Error(`Admin login failed (${loginResponse.status()}).`)
  }

  await page.waitForLoadState('domcontentloaded').catch(() => {})
  await captureScreenshot(page, testInfo, 'admin-dashboard')

  return deployedAdminUserID
}

export const openCollectionCreate = async (page: Page, collection: string): Promise<void> => {
  await page.goto(toAdminUrl(`/admin/collections/${collection}/create`), {
    waitUntil: 'commit',
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
  const fieldContainer = page
    .locator('label')
    .filter({ hasText: new RegExp(`^${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\s*\\*)?$`) })
    .locator('xpath=ancestor::div[contains(@class,"field")][1]')
  const fieldCandidates: Locator[] = [
    page.getByRole('combobox', { name: label }),
    fieldContainer.locator('xpath=.//div[contains(@class,"relationship__wrap")]//input').first(),
  ]
  const fieldMatches = await Promise.all(
    fieldCandidates.map(async (candidate) => ((await candidate.count()) > 0 ? candidate : null)),
  )
  const field = fieldMatches.find((candidate): candidate is Locator => candidate !== null)

  if (!field) {
    throw new Error(`Relationship field ${label} was not found.`)
  }

  await field.waitFor({ state: 'visible' })
  await field.click()

  const matchingOption = page.getByRole('option', { name: value }).first()
  const firstOption = page.getByRole('option').first()
  const option = label === 'Tribe' ? firstOption : matchingOption

  await field.fill(value)
  await expect(option).toBeVisible()
  await option.click()
  await expect(fieldContainer.getByText(value, { exact: true })).toBeVisible()
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
  const saveButton = await getDocumentActionButton(page)
  const nextURL = new RegExp(`/admin/collections/${collection}/(?!create$)[^/]+$`)

  await saveButton.click()

  await page.waitForURL(nextURL, { timeout: 60000 })
  await page.waitForLoadState('networkidle').catch(() => {})

  const pathname = new URL(page.url()).pathname
  const id = pathname.split('/').filter(Boolean).pop()

  if (!id || id === 'create') {
    throw new Error(`Missing created document ID for ${collection}. URL: ${page.url()}`)
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
    waitUntil: 'commit',
  })
}

export const openCollectionList = async (page: Page, collection: string): Promise<void> => {
  await page.goto(toAdminUrl(`/admin/collections/${collection}`), {
    waitUntil: 'commit',
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

  const saveButton = await getDocumentActionButton(page)

  await saveButton.click()
  await responsePromise
}

export const uploadImage = async (page: Page): Promise<void> => {
  const imageResponse = page.waitForResponse((response) => {
    return response.request().method() === 'POST' && response.url().includes('/api/media')
  })

  const fileInput = page.locator('input[type="file"]').first()
  const imageField = page
    .locator('label')
    .filter({ hasText: /^Image$/ })
    .locator('xpath=ancestor::div[contains(@class,"field")][1]')
  const createNewButton = imageField.getByRole('button', { name: /^Create New$/i }).first()

  if ((await fileInput.count()) === 0) {
    await createNewButton.click()
  }

  await fileInput.waitFor({ state: 'attached' })
  await fileInput.setInputFiles(generatedImagePath)
  await imageResponse
}
