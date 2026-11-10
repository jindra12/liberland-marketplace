import { describe, expect, it } from 'vitest'
import { mock, mockDeep } from 'vitest-mock-extended'
import { getDataLoader, type CollectionAfterReadHook, type PayloadRequest, type PaginatedDocs } from 'payload'
import type { User } from '@/payload-types'
import { populateAuthors } from '@/collections/Posts/hooks/populateAuthors'
import { isCurrentUserSubscribedToTarget } from '@/newsletter/notificationSubscriptions'

describe('Request-scoped content read budgets', () => {
  it('reuses one author lookup across a page of posts with the same author', async () => {
    const req = mockDeep<PayloadRequest>()
    Object.assign(req, { payloadDataLoader: getDataLoader(req) })
    req.payload.find.mockResolvedValue(mock<PaginatedDocs<User>>({ docs: [mock<User>({ id: 'author', name: 'Shared author' })] }))
    await Array.from({ length: 10 }, (_, index) => index).reduce(async (previous, index) => {
      await previous
      await populateAuthors(
        Object.assign(mock<Parameters<CollectionAfterReadHook>[0]>(), {
          req,
          doc: { id: `post-${index}`, authors: ['author'] },
        }),
      )
    }, Promise.resolve())
    expect(req.payload.find).toHaveBeenCalledTimes(1)
  })

  it('does not repeatedly throw database misses for the same subscription in one request', async () => {
    const req = mockDeep<PayloadRequest>()
    Object.assign(req, { payloadDataLoader: getDataLoader(req) })
    req.user = mock<User & { collection: 'users' }>({
      id: 'reader',
      email: 'reader@example.test',
      collection: 'users',
    })
    req.payload.find.mockResolvedValue({ docs: [], hasNextPage: false, hasPrevPage: false,
      limit: 1, page: 1, pagingCounter: 1, totalDocs: 0, totalPages: 1 })
    await Array.from({ length: 10 }, (_, index) => index).reduce(async (previous) => {
      await previous
      expect(
        await isCurrentUserSubscribedToTarget({
          req,
          targetCollection: 'companies',
          targetID: 'company',
        }),
      ).toBe(false)
    }, Promise.resolve())
    expect(req.payload.find).toHaveBeenCalledTimes(1)
  })
})
