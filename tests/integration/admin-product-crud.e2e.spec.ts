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

test.describe('Admin product CRUD', () => {
  test('creates, edits, and removes a product', async ({ page }, testInfo) => {
    await loginToAdmin(page, testInfo)

    const productName = createUniqueLabel('Playwright product')
    const productID = await createDocumentViaUI(
      page,
      'products',
      async (createPage) => {
        await fillTextField(createPage, 'Name', productName)
        await fillRelationshipField(createPage, 'Company')
        await fillTextField(createPage, 'Description', 'Product created by Playwright.')
      },
      testInfo,
      'product',
      ['company', 'createdBy', 'description', 'inventory'],
    )

    await openCollectionDocument(page, 'products', productID)
    await page.getByRole('textbox', { name: 'Name' }).fill(`${productName} edited`)
    await saveCollectionDocument(page, 'products', productID)

    await deleteDocument(page, 'products', productID)
    await openCollectionList(page, 'products')
    await expect(page.getByText(`${productName} edited`)).toHaveCount(0)
  })
})
