import { describe, expect, it, vi } from 'vitest'

import { reindexSearch } from '@/search/reindex'

describe('reindexSearch', () => {
  it('clears search and rebuilds it from published docs across paginated results', async () => {
    const create = vi.fn(async () => ({}))
    const deleteMany = vi.fn(async () => ({}))
    const logger = {
      info: vi.fn(),
    }
    const find = vi.fn(async ({ collection, page }: { collection: string; page: number }) => {
      if (collection !== 'products') {
        return {
          docs: [],
          hasNextPage: false,
        }
      }

      if (page === 1) {
        return {
          docs: [
            {
              _status: 'published',
              id: 'product-1',
              name: 'Product One',
            },
            {
              _status: 'draft',
              id: 'product-2',
              name: 'Product Two',
            },
          ],
          hasNextPage: true,
        }
      }

      return {
        docs: [
          {
            _status: 'published',
            id: 'product-3',
            name: 'Product Three',
          },
        ],
        hasNextPage: false,
      }
    })

    const service = {
      payload: {
        create,
        deleteMany,
        find,
        findByID: vi.fn(async () => null),
        logger,
      },
    } satisfies Parameters<typeof reindexSearch>[0]

    const result = await reindexSearch(service)

    expect(deleteMany).toHaveBeenCalledTimes(1)
    expect(deleteMany).toHaveBeenCalledWith({
      collection: 'search',
      where: {},
    })
    expect(find).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'products',
        page: 1,
      }),
    )
    expect(find).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'products',
        page: 2,
      }),
    )
    expect(create).toHaveBeenCalledTimes(2)
    expect(create).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        collection: 'search',
        data: expect.objectContaining({
          doc: {
            relationTo: 'products',
            value: 'product-1',
          },
          priority: 0,
          title: 'Product One',
        }),
      }),
    )
    expect(create).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        collection: 'search',
        data: expect.objectContaining({
          doc: {
            relationTo: 'products',
            value: 'product-3',
          },
          priority: 0,
          title: 'Product Three',
        }),
      }),
    )
    expect(result).toHaveLength(6)
    expect(result.find((entry) => entry.collection === 'products')?.count).toBe(2)
  })
})
