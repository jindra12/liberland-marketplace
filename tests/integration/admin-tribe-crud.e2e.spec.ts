import { expect, test } from '@playwright/test'

import {
  createUniqueLabel,
  deleteDocument,
  fillTextField,
  loginToAdmin,
  openCollectionDocument,
  openCollectionList,
  saveCollectionDocument,
} from './helpers'
import { createDocumentViaUI } from './admin-crud.utils'

test.describe('Admin tribe CRUD', () => {
  test('creates, edits, and removes a tribe', async ({ page }, testInfo) => {
    await loginToAdmin(page, testInfo)

    const identityName = createUniqueLabel('Playwright tribe')
    const identityID = await createDocumentViaUI(
      page,
      'identities',
      async (createPage) => {
        await fillTextField(createPage, 'Name', identityName)
      },
      testInfo,
      'identity',
      [],
    )

    await openCollectionDocument(page, 'identities', identityID)
    await page.getByRole('textbox', { name: 'Name' }).fill(`${identityName} edited`)
    await saveCollectionDocument(page, 'identities', identityID)

    await deleteDocument(page, 'identities', identityID)
    await openCollectionList(page, 'identities')
    await expect(page.getByText(`${identityName} edited`)).toHaveCount(0)
  })
})
