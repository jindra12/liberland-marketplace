import { expect, test, type Page, type TestInfo } from '@playwright/test'

import {
  captureScreenshot,
  createUniqueLabel,
  deleteDocument,
  fillRelationshipField,
  fillSelectField,
  fillTextField,
  getDocumentActionButton,
  loginToAdmin,
  logFieldValues,
  logValidationIssues,
  openCollectionCreate,
  openCollectionDocument,
  openCollectionList,
  saveCollectionDocument,
  saveNewCollectionDocument,
} from './helpers'

const createDocumentViaUI = async (
  page: Page,
  collection: string,
  fillForm: (createPage: Page) => Promise<void>,
  testInfo: TestInfo,
  screenshotPrefix: string,
): Promise<string> => {
  const createPage = await page.context().newPage()
  const browserErrors: string[] = []

  createPage.on('console', (message) => {
    if (message.type() === 'error') {
      const text = message.text()
      browserErrors.push(text)
    }
  })
  createPage.on('pageerror', (error) => {
    const text = error.stack || error.message
    browserErrors.push(text)
  })

  try {
    await openCollectionCreate(createPage, collection)
    await createPage.waitForLoadState('networkidle').catch(() => {})
    await captureScreenshot(createPage, testInfo, `${screenshotPrefix}-create-open`)
    await fillForm(createPage)
    await captureScreenshot(createPage, testInfo, `${screenshotPrefix}-before-save`)
    await logFieldValues(createPage, ['company', 'createdBy', 'description', 'inventory'])
    await logValidationIssues(createPage)
    const saveButton = await getDocumentActionButton(createPage)
    await expect(saveButton).toBeEnabled({
      timeout: 60000,
    })
    const id = await saveNewCollectionDocument(createPage, collection).catch((error: Error) => {
      throw new Error(
        `${error.message}\nBrowser errors:\n${browserErrors.join('\n') || '(none)'}`,
      )
    })
    await captureScreenshot(createPage, testInfo, `${screenshotPrefix}-created`)
    return id
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(
        `${error.message}\nBrowser errors:\n${browserErrors.join('\n') || '(none)'}`,
      )
    }

    throw error
  } finally {
    await createPage.close().catch(() => {})
  }
}

const createIdentityFixture = async (
  page: Page,
  label: string,
  testInfo: TestInfo,
): Promise<{ id: string; name: string }> => {
  const name = createUniqueLabel(label)
  const identityKey = createUniqueLabel(`${label} id`).toLowerCase().replace(/[^a-z0-9]+/g, '-')
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

const createCompanyFixture = async (
  page: Page,
  label: string,
  identityName: string,
  testInfo: TestInfo,
): Promise<{ id: string; name: string }> => {
  const name = createUniqueLabel(label)
    const id = await createDocumentViaUI(
      page,
      'companies',
      async (createPage) => {
        await fillTextField(createPage, 'Name', name)
        await fillRelationshipField(createPage, 'Tribe', identityName)
      },
      testInfo,
      'company',
  )
  return { id, name }
}

test.describe.serial('Admin content CRUD', () => {
  test('creates, edits, and removes a product', async ({ page }, testInfo) => {
    await loginToAdmin(page, testInfo)

    const identity = await createIdentityFixture(page, 'Playwright product tribe', testInfo)

    const company = await createCompanyFixture(
      page,
      'Playwright product company',
      identity.name,
      testInfo,
    )

    const productName = createUniqueLabel('Playwright product')
    const productID = await createDocumentViaUI(
      page,
      'products',
      async (createPage) => {
        await fillTextField(createPage, 'Name', productName)
        await fillRelationshipField(createPage, 'Company', company.name)
        await fillTextField(createPage, 'Description', 'Product created by Playwright.')
      },
      testInfo,
      'product',
    )

    await openCollectionDocument(page, 'products', productID)
    await captureScreenshot(page, testInfo, 'product-before-edit')

    const editedProductName = `${productName} edited`
    await page.getByRole('textbox', { name: 'Name' }).fill(editedProductName)
    await captureScreenshot(page, testInfo, 'product-after-name-edit')
    await saveCollectionDocument(page, 'products', productID)
    await captureScreenshot(page, testInfo, 'product-after-save')

    await deleteDocument(page, 'products', productID)
    await openCollectionList(page, 'products')
    await captureScreenshot(page, testInfo, 'product-after-delete')
    await expect(page.getByText(editedProductName)).toHaveCount(0)

    await deleteDocument(page, 'companies', company.id)
    await openCollectionList(page, 'companies')
    await captureScreenshot(page, testInfo, 'company-after-product-delete')

    await deleteDocument(page, 'identities', identity.id)
    await openCollectionList(page, 'identities')
    await captureScreenshot(page, testInfo, 'identity-after-product-delete')
  })

  test('creates, edits, and removes a company', async ({ page }, testInfo) => {
    await loginToAdmin(page, testInfo)

    const identity = await createIdentityFixture(page, 'Playwright company tribe', testInfo)

    const companyName = createUniqueLabel('Playwright company')
    const companyID = await createDocumentViaUI(
      page,
      'companies',
      async (createPage) => {
        await fillTextField(createPage, 'Name', companyName)
        await fillRelationshipField(createPage, 'Tribe', identity.name)
      },
      testInfo,
      'company',
    )

    await openCollectionDocument(page, 'companies', companyID)
    await captureScreenshot(page, testInfo, 'company-before-edit')

    const editedCompanyName = `${companyName} edited`
    await page.getByRole('textbox', { name: 'Name' }).fill(editedCompanyName)
    await captureScreenshot(page, testInfo, 'company-after-name-edit')
    await saveCollectionDocument(page, 'companies', companyID)
    await captureScreenshot(page, testInfo, 'company-after-save')

    await deleteDocument(page, 'companies', companyID)
    await openCollectionList(page, 'companies')
    await captureScreenshot(page, testInfo, 'company-after-delete')
    await expect(page.getByText(editedCompanyName)).toHaveCount(0)

    await deleteDocument(page, 'identities', identity.id)
    await openCollectionList(page, 'identities')
    await captureScreenshot(page, testInfo, 'identity-after-company-delete')
  })

  test('creates, edits, and removes an identity', async ({ page }, testInfo) => {
    await loginToAdmin(page, testInfo)

    const identityName = createUniqueLabel('Playwright tribe')
    const identityID = await createDocumentViaUI(
      page,
      'identities',
      async (createPage) => {
        await fillTextField(
          createPage,
          'ID',
          createUniqueLabel('Playwright tribe id').toLowerCase().replace(/[^a-z0-9]+/g, '-'),
        )
        await fillTextField(createPage, 'Name', identityName)
      },
      testInfo,
      'identity',
    )

    await openCollectionDocument(page, 'identities', identityID)
    await captureScreenshot(page, testInfo, 'identity-before-edit')

    const editedIdentityName = `${identityName} edited`
    await page.getByRole('textbox', { name: 'Name' }).fill(editedIdentityName)
    await captureScreenshot(page, testInfo, 'identity-after-name-edit')
    await saveCollectionDocument(page, 'identities', identityID)
    await captureScreenshot(page, testInfo, 'identity-after-save')

    await deleteDocument(page, 'identities', identityID)
    await openCollectionList(page, 'identities')
    await captureScreenshot(page, testInfo, 'identity-after-delete')
    await expect(page.getByText(editedIdentityName)).toHaveCount(0)
  })

  test('creates, edits, and removes a startup', async ({ page }, testInfo) => {
    await loginToAdmin(page, testInfo)

    const identity = await createIdentityFixture(page, 'Playwright startup tribe', testInfo)

    const company = await createCompanyFixture(
      page,
      'Playwright startup company',
      identity.name,
      testInfo,
    )

    const startupTitle = createUniqueLabel('Playwright startup')
    const startupID = await createDocumentViaUI(
      page,
      'startups',
      async (createPage) => {
        await fillTextField(createPage, 'Title', startupTitle)
        await fillRelationshipField(createPage, 'Company', company.name)
        await fillTextField(createPage, 'Description', 'Startup created by Playwright.')
        await fillRelationshipField(createPage, 'Tribe', identity.name)
        await fillSelectField(createPage, 'Stage', 'Idea')
      },
      testInfo,
      'startup',
    )

    await openCollectionDocument(page, 'startups', startupID)
    await captureScreenshot(page, testInfo, 'startup-before-edit')

    const editedStartupTitle = `${startupTitle} edited`
    await page.getByRole('textbox', { name: 'Title' }).fill(editedStartupTitle)
    await captureScreenshot(page, testInfo, 'startup-after-title-edit')
    await saveCollectionDocument(page, 'startups', startupID)
    await captureScreenshot(page, testInfo, 'startup-after-save')

    await deleteDocument(page, 'startups', startupID)
    await openCollectionList(page, 'startups')
    await captureScreenshot(page, testInfo, 'startup-after-delete')
    await expect(page.getByText(editedStartupTitle)).toHaveCount(0)

    await deleteDocument(page, 'companies', company.id)
    await openCollectionList(page, 'companies')
    await captureScreenshot(page, testInfo, 'company-after-startup-delete')

    await deleteDocument(page, 'identities', identity.id)
    await openCollectionList(page, 'identities')
    await captureScreenshot(page, testInfo, 'identity-after-startup-delete')
  })

  test('creates, edits, and removes a job', async ({ page }, testInfo) => {
    await loginToAdmin(page, testInfo)

    const identity = await createIdentityFixture(page, 'Playwright job tribe', testInfo)

    const company = await createCompanyFixture(
      page,
      'Playwright job company',
      identity.name,
      testInfo,
    )

    const jobTitle = createUniqueLabel('Playwright job')
    const jobID = await createDocumentViaUI(
      page,
      'jobs',
      async (createPage) => {
        await fillTextField(createPage, 'Title', jobTitle)
        await fillRelationshipField(createPage, 'Company', company.name)
        await fillTextField(createPage, 'Location', 'Remote')
        await fillTextField(createPage, 'Positions', '1')
        await fillSelectField(createPage, 'Employment Type', 'Contract')
        await fillTextField(createPage, 'Description', 'Job created by Playwright.')
      },
      testInfo,
      'job',
    )

    await openCollectionDocument(page, 'jobs', jobID)
    await captureScreenshot(page, testInfo, 'job-before-edit')

    const editedJobTitle = `${jobTitle} edited`
    await page.getByRole('textbox', { name: 'Title' }).fill(editedJobTitle)
    await captureScreenshot(page, testInfo, 'job-after-title-edit')
    await saveCollectionDocument(page, 'jobs', jobID)
    await captureScreenshot(page, testInfo, 'job-after-save')

    await deleteDocument(page, 'jobs', jobID)
    await openCollectionList(page, 'jobs')
    await captureScreenshot(page, testInfo, 'job-after-delete')
    await expect(page.getByText(editedJobTitle)).toHaveCount(0)

    await deleteDocument(page, 'companies', company.id)
    await openCollectionList(page, 'companies')
    await captureScreenshot(page, testInfo, 'company-after-job-delete')

    await deleteDocument(page, 'identities', identity.id)
    await openCollectionList(page, 'identities')
    await captureScreenshot(page, testInfo, 'identity-after-job-delete')
  })

  test('creates, bans, and removes a user', async ({ page }, testInfo) => {
    await loginToAdmin(page, testInfo)

    const userName = createUniqueLabel('Playwright user')
    const userEmail = `${userName.toLowerCase().replace(/[^a-z0-9]+/g, '.')}@example.com`
    const userPassword = 'test-password-123'
    const userID = await createDocumentViaUI(
      page,
      'users',
      async (createPage) => {
        await fillTextField(createPage, 'Email', userEmail)
        await fillTextField(createPage, 'Name', userName)
        await fillTextField(createPage, 'Password', userPassword)
      },
      testInfo,
      'user',
    )

    await openCollectionDocument(page, 'users', userID)
    await captureScreenshot(page, testInfo, 'user-before-ban')

    const banResponse = page.waitForResponse((response) => {
      return (
        response.request().method() === 'PATCH' &&
        response.url().includes(`/api/users/${userID}`) &&
        response.ok()
      )
    })

    await page.getByRole('button', { name: 'Ban user' }).click()
    await banResponse
    await page.waitForLoadState('domcontentloaded')
    await captureScreenshot(page, testInfo, 'user-after-ban')

    await deleteDocument(page, 'users', userID)
    await openCollectionList(page, 'users')
    await captureScreenshot(page, testInfo, 'user-after-delete')
    await expect(page.getByText(userName)).toHaveCount(0)
  })
})
