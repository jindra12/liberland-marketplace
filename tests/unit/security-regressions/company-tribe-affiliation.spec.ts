import { describe, expect, it } from 'vitest'
import { mock, mockDeep } from 'vitest-mock-extended'
import type { CollectionAfterChangeHook, PayloadRequest, PaginatedDocs } from 'payload'
import type { NotificationSubscription } from '@/payload-types'
import { Companies } from '@/collections/Companies'

describe('Company tribe affiliation propagation', () => {
  it.each(['products', 'jobs'])(
    'propagates a company tribe change to its existing %s without requiring a child edit',
    async (collection) => {
      const req = mockDeep<PayloadRequest>()
      req.payload.config.collections = []
      req.payload.find.mockResolvedValue(
        mock<PaginatedDocs<NotificationSubscription>>({ docs: [] }),
      )
      req.payload.count.mockResolvedValue({ totalDocs: 0 })
      const args = Object.assign(mock<Parameters<CollectionAfterChangeHook>[0]>(), {
        req,
        operation: 'update',
        doc: { id: 'company', identity: 'new-tribe', _status: 'published' },
        previousDoc: { id: 'company', identity: 'old-tribe', _status: 'published' },
      })
      await (Companies.hooks?.afterChange ?? []).reduce(async (previous, hook) => {
        await previous
        await hook(args)
      }, Promise.resolve())
      expect(req.payload.update).toHaveBeenCalledWith(
        expect.objectContaining({
          collection,
          where: expect.objectContaining({ company: { equals: 'company' } }),
          data: expect.objectContaining({ companyIdentityId: 'new-tribe' }),
        }),
      )
    },
  )

})
