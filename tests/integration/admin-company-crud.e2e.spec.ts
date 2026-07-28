import { expect, test } from '@playwright/test'

import {
  deleteDocument,
  loginToAdmin,
  openCollectionDocument,
  openCollectionList,
  saveCollectionDocument,
} from './helpers'
import { createCompanyFixture } from './admin-crud.utils'

test.describe('Admin company CRUD', () => {
  test('creates, edits, and removes a company', async ({ page }, testInfo) => {
    await loginToAdmin(page, testInfo)

    const company = await createCompanyFixture(page, 'Playwright company', testInfo)

    const editedCompanyName = `${company.name} edited`

    await openCollectionDocument(page, 'companies', company.id)
    await page.getByRole('textbox', { name: 'Name' }).fill(editedCompanyName)
    await saveCollectionDocument(page, 'companies', company.id)

    await deleteDocument(page, 'companies', company.id)
    await openCollectionList(page, 'companies')
    await expect(page.getByText(editedCompanyName)).toHaveCount(0)
  })
})
