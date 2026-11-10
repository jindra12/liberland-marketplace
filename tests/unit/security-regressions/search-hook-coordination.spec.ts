import { afterEach, describe, expect, it, vi } from 'vitest'
import { mock, mockDeep } from 'vitest-mock-extended'
import type { CollectionAfterChangeHook, Config, PaginatedDocs, PayloadRequest } from 'payload'
import type { Search } from '@/payload-types'
import { marketplaceSearchPlugin } from '@/plugins/search'

describe('Installed search hook coordination', () => {
  afterEach(() => vi.useRealTimers())

  it('performs only one search write for a publication through the configured plugin', async () => {
    vi.useFakeTimers()
    const config = await marketplaceSearchPlugin(
      mock<Config>({ collections: [{ slug: 'posts', fields: [] }] }),
    )
    const req = mockDeep<PayloadRequest>()
    req.context = {}
    req.payload.find.mockResolvedValue(mock<PaginatedDocs<Search>>({ docs: [] }))
    req.payload.create.mockResolvedValue(mock<Search>({ id: 'entry' }))
    req.payload.config.collections = []
    req.payload.config.localization = false
    req.payload.collections.search.config.fields = []
    const args = Object.assign(mock<Parameters<CollectionAfterChangeHook>[0]>(), {
      req,
      operation: 'create',
      doc: { id: 'post', title: 'Published post', _status: 'published' },
      context: {},
    })
    await Promise.all([1, 2].map(() => (
      config.collections?.find((entry) => entry.slug === 'posts')?.hooks?.afterChange ?? []
    ).reduce(async (previous, hook) => {
      await previous
      await hook(args)
    }, Promise.resolve())))
    await vi.runAllTimersAsync()
    expect(req.payload.logger.error).not.toHaveBeenCalled()
    expect(req.payload.create).toHaveBeenCalledTimes(1)
  })
})
