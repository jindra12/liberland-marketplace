import { describe, expect, it, vi } from 'vitest'
import { mock, mockDeep } from 'vitest-mock-extended'
import type { Media } from '@/payload-types'
import type { PayloadRequest } from 'payload'

import { reindexSearch } from '@/search/reindex'
import type { SearchReindexDoc } from '@/search/types'

describe('reindexSearch', () => {
  it('prepares published records across all pages before replacing the live index', async () => {
    const replace = vi.fn<(docs: SearchReindexDoc[]) => Promise<void>>(async () => {})
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
              meta: { image: mock<Media>({ id: 'product-image' }) },
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
      req: mockDeep<PayloadRequest>(),
      payload: {
        replace,
        find,
        findByID: vi.fn(async () => null),
        logger,
      },
    } satisfies Parameters<typeof reindexSearch>[0]

    const result = await reindexSearch(service)

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
    expect(replace).toHaveBeenCalledExactlyOnceWith([
      expect.objectContaining({
        doc: { relationTo: 'products', value: 'product-1' },
        title: 'Product One',
        meta: expect.objectContaining({ image: 'product-image' }),
      }),
      expect.objectContaining({
        doc: { relationTo: 'products', value: 'product-3' },
        title: 'Product Three',
      }),
    ])
    expect(result).toHaveLength(6)
    expect(result.find((entry) => entry.collection === 'products')?.count).toBe(2)
  })
})
