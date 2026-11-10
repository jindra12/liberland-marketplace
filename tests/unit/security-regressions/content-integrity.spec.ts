import { afterEach, describe, expect, it, vi } from 'vitest'
import { mock, mockDeep } from 'vitest-mock-extended'
import type {
  CollectionAfterChangeHook,
  CollectionAfterReadHook,
  CollectionBeforeChangeHook,
  Config,
  PaginatedDocs,
  PayloadRequest,
} from 'payload'
import { getDataLoader } from 'payload'
import type { Company, Post, Product, Search, User } from '@/payload-types'
import { setPostAuthors } from '@/collections/Posts/hooks/setPostAuthors'
import { populateAuthors } from '@/collections/Posts/hooks/populateAuthors'
import { canCreateNotificationSubscriptions } from '@/access/notificationSubscriptions'
import { syncCompanyIdentityId } from '@/hooks/syncCompanyIdentityId'
import { updateIdentityItemCountAfterChange } from '@/hooks/updateIdentityItemCount'
import { collectDocumentChanges } from '@/utilities/notificationDiff'
import { marketplaceSearchPlugin } from '@/plugins/search'

describe('Content attribution and publication integrity', () => {
  afterEach(() => vi.useRealTimers())

  it('preserves trusted post authors when a caller submits another user as author', async () => {
    const req = mockDeep<PayloadRequest>()
    req.user = mock<User & { collection: 'users' }>({
      id: 'mallory',
      role: ['user'],
      collection: 'users',
    })
    const result = await setPostAuthors(
      Object.assign(mock<Parameters<CollectionBeforeChangeHook>[0]>(), {
        req,
        operation: 'update',
        data: { authors: ['alice'] },
        originalDoc: { authors: ['mallory'] },
      }),
    )
    expect(result).toMatchObject({ authors: ['mallory'] })
  })

  it('respects caller access when populating private author records', async () => {
    const req = mockDeep<PayloadRequest>()
    Object.assign(req, { payloadDataLoader: getDataLoader(req) })
    req.payload.find.mockResolvedValue(mock<PaginatedDocs<User>>({ docs: [] }))
    await populateAuthors(
      Object.assign(mock<Parameters<CollectionAfterReadHook>[0]>(), {
        req,
        doc: { id: 'post', authors: ['private-author'] },
      }),
    )
    expect(req.payload.find).toHaveBeenCalledWith(
      expect.objectContaining({ overrideAccess: false, req }),
    )
  })

  it('requires verified mailbox ownership before creating notification subscriptions', async () => {
    const req = mockDeep<PayloadRequest>()
    req.user = mock<User & { collection: 'users' }>({
      id: 'mallory',
      email: 'victim@example.test',
      emailVerified: false,
      collection: 'users',
    })
    expect(await canCreateNotificationSubscriptions({ req })).toBe(false)
  })

  it('refreshes child tribe affiliation after the parent company changes tribe', async () => {
    const req = mockDeep<PayloadRequest>()
    req.payload.findByID.mockResolvedValue(mock<Company>({ id: 'company', identity: 'new-tribe' }))
    const result = await syncCompanyIdentityId(
      Object.assign(mock<Parameters<CollectionBeforeChangeHook>[0]>(), {
        req,
        operation: 'update',
        data: { name: 'Updated product' },
        originalDoc: { company: 'company', companyIdentityId: 'old-tribe' },
      }),
    )
    expect(result).toMatchObject({ companyIdentityId: 'new-tribe' })
  })

  it.each(['products', 'companies', 'startups'])(
    'excludes unpublished %s from public tribe counts',
    async (collection) => {
      const req = mockDeep<PayloadRequest>()
      req.payload.count.mockResolvedValue({ totalDocs: 1 })
      await updateIdentityItemCountAfterChange('identity')(
        Object.assign(mock<Parameters<CollectionAfterChangeHook>[0]>(), {
          req,
          doc: { identity: 'tribe' },
          previousDoc: undefined,
        }),
      )
      expect(req.payload.count).toHaveBeenCalledWith(
        expect.objectContaining({
          collection,
          where: expect.objectContaining({ _status: { equals: 'published' } }),
        }),
      )
    },
  )

  it('does not recursively include populated relationship secrets in email diffs', () => {
    const previousDoc = Object.assign(mock<Product>(), {
      id: 'product',
      company: { id: 'company', name: 'Company', email: 'old-private@example.test' },
    })
    const nextDoc = Object.assign(mock<Product>(), {
      id: 'product',
      company: { id: 'company', name: 'Company', email: 'new-private@example.test' },
    })
    expect(
      collectDocumentChanges({
        fields: [{ name: 'company', type: 'relationship', relationTo: 'companies' }],
        nextDoc,
        previousDoc,
      }),
    ).toEqual([])
  })

  it('does not delete the live search entry when saving a draft revision', async () => {
    vi.useFakeTimers()
    const req = mockDeep<PayloadRequest>()
    req.context = {}
    req.payload.config.localization = false
    req.payload.find.mockImplementation(async (args) =>
      args.collection === 'search'
        ? mock<PaginatedDocs<Search>>({ docs: [mock<Search>({ id: 'live-index-entry' })] })
        : mock<PaginatedDocs<Post>>({
            docs: [mock<Post>({ id: 'post', title: 'Published', _status: 'published' })],
          }),
    )
    const config = await marketplaceSearchPlugin(
      Object.assign(mock<Config>(), { collections: [{ slug: 'posts', fields: [] }] }),
    )
    const hook = config.collections?.[0]?.hooks?.afterChange?.[0]
    if (!hook) {
      throw new Error('Missing actual deferred search hook')
    }
    await hook(
      Object.assign(mock<Parameters<CollectionAfterChangeHook>[0]>(), {
        req,
        operation: 'update',
        doc: { id: 'post', title: 'Draft', _status: 'draft' },
        previousDoc: { id: 'post', title: 'Published', _status: 'published' },
      }),
    )
    await vi.runAllTimersAsync()
    expect(req.payload.logger.error).not.toHaveBeenCalled()
    expect(req.payload.delete).not.toHaveBeenCalled()
  })
})
