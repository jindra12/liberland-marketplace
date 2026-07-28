import { expect, type Page, type TestInfo } from '@playwright/test'

import {
  captureScreenshot,
  captureHtmlSnapshot,
  createUniqueLabel,
  fillRelationshipField,
  fillTextField,
  getDocumentActionButton,
  logFieldValues,
  logValidationIssues,
  openCollectionCreate,
  openCollectionList,
  saveNewCollectionDocument,
} from './helpers'

export const createDocumentViaUI = async (
  page: Page,
  collection: string,
  fillForm: (createPage: Page) => Promise<void>,
  testInfo: TestInfo,
  screenshotPrefix: string,
  fieldNames: string[] = [],
): Promise<string> => {
  const createPage = await page.context().newPage()
  const browserErrors: string[] = []

  createPage.on('console', (message) => {
    if (message.type() === 'error') {
      browserErrors.push(message.text())
    }
  })

  createPage.on('pageerror', (error) => {
    browserErrors.push(error.stack || error.message)
  })

  try {
    await openCollectionCreate(createPage, collection)
    await createPage.waitForLoadState('networkidle').catch(() => {})
    await captureScreenshot(createPage, testInfo, `${screenshotPrefix}-create-open`)
    await fillForm(createPage)
    await captureScreenshot(createPage, testInfo, `${screenshotPrefix}-before-save`)
    await logFieldValues(createPage, fieldNames)
    await logValidationIssues(createPage)
    const saveButton = await getDocumentActionButton(createPage)
    await expect(saveButton).toBeEnabled({
      timeout: 60000,
    })
    const id = await saveNewCollectionDocument(createPage, collection).catch((error: Error) => {
      throw new Error(`${error.message}\nBrowser errors:\n${browserErrors.join('\n') || '(none)'}`)
    })
    await captureScreenshot(createPage, testInfo, `${screenshotPrefix}-created`)
    return id
  } catch (error) {
    await captureHtmlSnapshot(createPage, testInfo, `${screenshotPrefix}-failed`).catch(() => {})
    if (error instanceof Error) {
      throw new Error(`${error.message}\nBrowser errors:\n${browserErrors.join('\n') || '(none)'}`)
    }

    throw error
  } finally {
    await createPage.close().catch(() => {})
  }
}

export const createIdentityFixture = async (
  page: Page,
  label: string,
  testInfo: TestInfo,
): Promise<{ id: string; name: string }> => {
  const name = createUniqueLabel(label)
  const identityKey = createUniqueLabel(`${label} id`)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
  const id = await createDocumentViaUI(
    page,
    'identities',
    async (createPage) => {
      await fillTextField(createPage, 'ID', identityKey)
      await fillTextField(createPage, 'Name', name)
    },
    testInfo,
    'identity',
  )

  return { id, name }
}

export const createCompanyFixture = async (
  page: Page,
  label: string,
  testInfo: TestInfo,
): Promise<{ id: string; name: string }> => {
  const name = createUniqueLabel(label)
  const id = await createDocumentViaUI(
    page,
    'companies',
    async (createPage) => {
      await fillTextField(createPage, 'Name', name)
      await fillRelationshipField(createPage, 'Tribe')
    },
    testInfo,
    'company',
  )

  return { id, name }
}

export const selectFirstCollectionDocument = async (
  page: Page,
  collection: string,
): Promise<{ id: string; label: string }> => {
  await openCollectionList(page, collection)

  const firstRow = page.locator('tbody tr').first()
  const firstLink = firstRow.locator('a').first()
  const firstCell = firstRow.locator('td').first()

  await expect(firstRow).toBeVisible({
    timeout: 60000,
  })
  await expect(firstLink).toBeVisible({
    timeout: 60000,
  })
  await expect(firstCell).not.toBeEmpty({
    timeout: 60000,
  })

  const label = (await firstLink.textContent().catch(() => null)) ?? ''

  if (!label) {
    throw new Error(`No documents found in collection ${collection}.`)
  }

  await firstLink.click()
  await page.waitForLoadState('domcontentloaded').catch(() => {})

  const id = new URL(page.url()).pathname.split('/').filter(Boolean).pop() ?? ''

  if (!id || id === 'create') {
    throw new Error(`Could not resolve first document ID for ${collection}.`)
  }

  return { id, label }
}
