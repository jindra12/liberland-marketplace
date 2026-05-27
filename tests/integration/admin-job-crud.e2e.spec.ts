import { expect, test } from '@playwright/test'

import {
  createUniqueLabel,
  deleteDocument,
  fillRelationshipField,
  fillSelectField,
  fillTextField,
  loginToAdmin,
  openCollectionDocument,
  openCollectionList,
  saveCollectionDocument,
} from './helpers'
import { createDocumentViaUI } from './admin-crud.utils'

test.describe('Admin job CRUD', () => {
  test('creates, edits, and removes a job', async ({ page }, testInfo) => {
    await loginToAdmin(page, testInfo)

    const jobTitle = createUniqueLabel('Playwright job')
    const jobID = await createDocumentViaUI(
      page,
      'jobs',
      async (createPage) => {
        await fillTextField(createPage, 'Title', jobTitle)
        await fillRelationshipField(createPage, 'company')
        await fillTextField(createPage, 'Location', 'Remote')
        await fillTextField(createPage, 'Positions', '1')
        await fillSelectField(createPage, 'Employment Type', 'Contract')
        await fillTextField(createPage, 'Description', 'Job created by Playwright.')
      },
      testInfo,
      'job',
      [],
    )

    await openCollectionDocument(page, 'jobs', jobID)
    await page.getByRole('textbox', { name: 'Title' }).fill(`${jobTitle} edited`)
    await saveCollectionDocument(page, 'jobs', jobID)

    await deleteDocument(page, 'jobs', jobID)
    await openCollectionList(page, 'jobs')
    await expect(page.getByText(`${jobTitle} edited`)).toHaveCount(0)
  })
})
