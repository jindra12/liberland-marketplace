import { expect, test } from '@playwright/test'

import {
  createUniqueLabel,
  deleteDocument,
  fillTextField,
  loginToAdmin,
  openCollectionDocument,
  openCollectionList,
} from './helpers'
import { createDocumentViaUI } from './admin-crud.utils'

test.describe('Admin user CRUD', () => {
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
      [],
    )

    await openCollectionDocument(page, 'users', userID)
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

    await deleteDocument(page, 'users', userID)
    await openCollectionList(page, 'users')
    await expect(page.getByText(userName)).toHaveCount(0)
  })
})
