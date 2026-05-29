import { expect, test } from '@playwright/test'

import {
  createUniqueLabel,
  deleteDocument,
  fillRelationshipField,
  fillTextField,
  loginToAdmin,
  openCollectionDocument,
  openCollectionList,
  saveCollectionDocument,
} from './helpers'
import { createDocumentViaUI } from './admin-crud.utils'

test.describe('Admin venture CRUD', () => {
  test('creates, edits, and removes a venture', async ({ page }, testInfo) => {
    await loginToAdmin(page, testInfo)

    const ventureTitle = createUniqueLabel('Playwright startup')
    const ventureID = await createDocumentViaUI(
      page,
      'startups',
      async (createPage) => {
        await fillTextField(createPage, 'Title', ventureTitle)
        await fillRelationshipField(createPage, 'Company')
        await fillTextField(createPage, 'Description', 'Startup created by Playwright.')
        await fillRelationshipField(createPage, 'Tribe')
      },
      testInfo,
      'startup',
      [],
    )

    await openCollectionDocument(page, 'startups', ventureID)
    await page.getByRole('textbox', { name: 'Title' }).fill(`${ventureTitle} edited`)
    await saveCollectionDocument(page, 'startups', ventureID)

    await deleteDocument(page, 'startups', ventureID)
    await openCollectionList(page, 'startups')
    await expect(page.getByText(`${ventureTitle} edited`)).toHaveCount(0)
  })
})
