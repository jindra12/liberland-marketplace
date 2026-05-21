import { describe, expect, test, type Page, type TestInfo } from '@playwright/test'

import {
  captureScreenshot,
  createDocument,
  createUniqueLabel,
  deleteDocument,
  loginToAdmin,
  openCollectionDocument,
  openCollectionList,
  saveCollectionDocument,
  toApiUrl,
  uploadImage,
} from './helpers'

type CleanupRecord = {
  collection: string
  id: string
}

const cleanupRecords = async (page: Page, records: CleanupRecord[]): Promise<void> => {
  await Promise.all(records.map((record) => deleteDocument(page, record.collection, record.id)))
}

const createIdentityFixture = async (page: Page, label: string): Promise<{ id: string; name: string }> => {
  const name = createUniqueLabel(label)
  const id = await createDocument(page, 'identities', { name })
  return { id, name }
}

const createCompanyFixture = async (
  page: Page,
  label: string,
  identityID: string,
  ownerID: string,
): Promise<{ id: string; name: string }> => {
  const name = createUniqueLabel(label)
  const id = await createDocument(page, 'companies', {
    createdBy: ownerID,
    identity: identityID,
    name,
  })
  return { id, name }
}

const addImageAndSave = async (
  page: Page,
  collection: string,
  id: string,
  testInfo: TestInfo,
  capturePrefix: string,
): Promise<void> => {
  await uploadImage(page)
  await captureScreenshot(page, testInfo, `${capturePrefix}-after-image`)
  await saveCollectionDocument(page, collection, id)
  await captureScreenshot(page, testInfo, `${capturePrefix}-after-save`)
}

describe.serial('Admin content CRUD', () => {
  test('creates, edits, and removes a product', async ({ page }, testInfo) => {
    const authUserID = await loginToAdmin(page, testInfo)

    const cleanup: CleanupRecord[] = []
    const identity = await createIdentityFixture(page, 'Playwright product tribe')
    cleanup.push({ collection: 'identities', id: identity.id })

    const company = await createCompanyFixture(
      page,
      'Playwright product company',
      identity.id,
      authUserID,
    )
    cleanup.push({ collection: 'companies', id: company.id })

    const productName = createUniqueLabel('Playwright product')
    const productID = await createDocument(page, 'products', {
      createdBy: authUserID,
      company: company.id,
      description: 'Product created by Playwright.',
      name: productName,
    })
    cleanup.push({ collection: 'products', id: productID })

    await openCollectionDocument(page, 'products', productID)
    await captureScreenshot(page, testInfo, 'product-before-edit')

    const editedProductName = `${productName} edited`
    await page.getByRole('textbox', { name: 'Name' }).fill(editedProductName)
    await captureScreenshot(page, testInfo, 'product-after-name-edit')

    await addImageAndSave(page, 'products', productID, testInfo, 'product')

    await deleteDocument(page, 'products', productID)
    await openCollectionList(page, 'products')
    await captureScreenshot(page, testInfo, 'product-after-delete')
    await expect(page.getByText(editedProductName)).toHaveCount(0)

    await cleanupRecords(page, cleanup)
  })

  test('creates, edits, and removes a company', async ({ page }, testInfo) => {
    const authUserID = await loginToAdmin(page, testInfo)

    const cleanup: CleanupRecord[] = []
    const identity = await createIdentityFixture(page, 'Playwright company tribe')
    cleanup.push({ collection: 'identities', id: identity.id })

    const companyName = createUniqueLabel('Playwright company')
    const companyID = await createDocument(page, 'companies', {
      createdBy: authUserID,
      identity: identity.id,
      name: companyName,
    })
    cleanup.push({ collection: 'companies', id: companyID })

    await openCollectionDocument(page, 'companies', companyID)
    await captureScreenshot(page, testInfo, 'company-before-edit')

    const editedCompanyName = `${companyName} edited`
    await page.getByRole('textbox', { name: 'Name' }).fill(editedCompanyName)
    await captureScreenshot(page, testInfo, 'company-after-name-edit')

    await addImageAndSave(page, 'companies', companyID, testInfo, 'company')

    await deleteDocument(page, 'companies', companyID)
    await openCollectionList(page, 'companies')
    await captureScreenshot(page, testInfo, 'company-after-delete')
    await expect(page.getByText(editedCompanyName)).toHaveCount(0)

    await cleanupRecords(page, cleanup)
  })

  test('creates, edits, and removes an identity', async ({ page }, testInfo) => {
    await loginToAdmin(page, testInfo)

    const cleanup: CleanupRecord[] = []
    const identityName = createUniqueLabel('Playwright tribe')
    const identityID = await createDocument(page, 'identities', {
      name: identityName,
    })
    cleanup.push({ collection: 'identities', id: identityID })

    await openCollectionDocument(page, 'identities', identityID)
    await captureScreenshot(page, testInfo, 'identity-before-edit')

    const editedIdentityName = `${identityName} edited`
    await page.getByRole('textbox', { name: 'Name' }).fill(editedIdentityName)
    await captureScreenshot(page, testInfo, 'identity-after-name-edit')

    await addImageAndSave(page, 'identities', identityID, testInfo, 'identity')

    await deleteDocument(page, 'identities', identityID)
    await openCollectionList(page, 'identities')
    await captureScreenshot(page, testInfo, 'identity-after-delete')
    await expect(page.getByText(editedIdentityName)).toHaveCount(0)

    await cleanupRecords(page, cleanup)
  })

  test('creates, edits, and removes a startup', async ({ page }, testInfo) => {
    const authUserID = await loginToAdmin(page, testInfo)

    const cleanup: CleanupRecord[] = []
    const identity = await createIdentityFixture(page, 'Playwright startup tribe')
    cleanup.push({ collection: 'identities', id: identity.id })

    const company = await createCompanyFixture(
      page,
      'Playwright startup company',
      identity.id,
      authUserID,
    )
    cleanup.push({ collection: 'companies', id: company.id })

    const startupTitle = createUniqueLabel('Playwright startup')
    const startupID = await createDocument(page, 'startups', {
      createdBy: authUserID,
      company: company.id,
      description: 'Startup created by Playwright.',
      fundsNeeded: {
        amount: 1000,
        currency: 'USD',
      },
      identity: identity.id,
      stage: 'idea',
      title: startupTitle,
    })
    cleanup.push({ collection: 'startups', id: startupID })

    await openCollectionDocument(page, 'startups', startupID)
    await captureScreenshot(page, testInfo, 'startup-before-edit')

    const editedStartupTitle = `${startupTitle} edited`
    await page.getByRole('textbox', { name: 'Title' }).fill(editedStartupTitle)
    await captureScreenshot(page, testInfo, 'startup-after-title-edit')

    await addImageAndSave(page, 'startups', startupID, testInfo, 'startup')

    await deleteDocument(page, 'startups', startupID)
    await openCollectionList(page, 'startups')
    await captureScreenshot(page, testInfo, 'startup-after-delete')
    await expect(page.getByText(editedStartupTitle)).toHaveCount(0)

    await cleanupRecords(page, cleanup)
  })

  test('creates, edits, and removes a job', async ({ page }, testInfo) => {
    const authUserID = await loginToAdmin(page, testInfo)

    const cleanup: CleanupRecord[] = []
    const identity = await createIdentityFixture(page, 'Playwright job tribe')
    cleanup.push({ collection: 'identities', id: identity.id })

    const company = await createCompanyFixture(
      page,
      'Playwright job company',
      identity.id,
      authUserID,
    )
    cleanup.push({ collection: 'companies', id: company.id })

    const jobTitle = createUniqueLabel('Playwright job')
    const jobID = await createDocument(page, 'jobs', {
      createdBy: authUserID,
      company: company.id,
      description: 'Job created by Playwright.',
      employmentType: 'contract',
      location: 'Remote',
      positions: 1,
      title: jobTitle,
    })
    cleanup.push({ collection: 'jobs', id: jobID })

    await openCollectionDocument(page, 'jobs', jobID)
    await captureScreenshot(page, testInfo, 'job-before-edit')

    const editedJobTitle = `${jobTitle} edited`
    await page.getByRole('textbox', { name: 'Title' }).fill(editedJobTitle)
    await captureScreenshot(page, testInfo, 'job-after-title-edit')

    await addImageAndSave(page, 'jobs', jobID, testInfo, 'job')

    await deleteDocument(page, 'jobs', jobID)
    await openCollectionList(page, 'jobs')
    await captureScreenshot(page, testInfo, 'job-after-delete')
    await expect(page.getByText(editedJobTitle)).toHaveCount(0)

    await cleanupRecords(page, cleanup)
  })

  test('creates, bans, and removes a user', async ({ page }, testInfo) => {
    await loginToAdmin(page, testInfo)

    const cleanup: CleanupRecord[] = []
    const userName = createUniqueLabel('Playwright user')
    const userEmail = `${userName.toLowerCase().replace(/[^a-z0-9]+/g, '.')}@example.com`
    const userPassword = 'test-password-123'
    const userID = await createDocument(page, 'users', {
      email: userEmail,
      name: userName,
      password: userPassword,
    })
    cleanup.push({ collection: 'users', id: userID })

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

    const banCheckResponse = await page.request.get(toApiUrl(`/api/users/${userID}`))
    expect(banCheckResponse.ok()).toBe(true)
    const banCheckBody = (await banCheckResponse.json()) as { banned?: boolean }
    expect(banCheckBody.banned).toBe(true)

    await deleteDocument(page, 'users', userID)
    await openCollectionList(page, 'users')
    await captureScreenshot(page, testInfo, 'user-after-delete')
    await expect(page.getByText(userName)).toHaveCount(0)

    await cleanupRecords(page, cleanup)
  })
})
