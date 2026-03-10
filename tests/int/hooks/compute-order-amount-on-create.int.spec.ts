import { beforeEach, describe, expect, it, vi } from 'vitest'
import { computeOrderAmountOnCreate } from '@/hooks/computeOrderAmountOnCreate'

type FindByIDArgs = {
  collection: 'products' | 'variants'
  id: string
}

const createReq = (findByID: (args: FindByIDArgs) => Promise<Record<string, unknown>>) =>
  ({
    payload: {
      findByID,
    },
  }) as never

describe('computeOrderAmountOnCreate', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('computes amount from product USD price on create', async () => {
    const findByID = vi.fn(async ({ collection, id }: FindByIDArgs) => {
      expect(collection).toBe('products')
      expect(id).toBe('p1')
      return {
        priceInUSDEnabled: true,
        priceInUSD: 1250,
      }
    })

    const req = createReq(findByID)
    const result = await computeOrderAmountOnCreate({
      data: {
        items: [{ product: 'p1', quantity: 2 }],
      },
      operation: 'create',
      req,
    } as never)

    expect(result.currency).toBe('USD')
    expect(result.amount).toBe(2500)
    expect(findByID).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'products',
        id: 'p1',
        depth: 0,
        overrideAccess: false,
        select: {
          priceInUSDEnabled: true,
          priceInUSD: true,
        },
      }),
    )
  })

  it('prefers variant USD price when variant is present', async () => {
    const findByID = vi.fn(async ({ collection, id }: FindByIDArgs) => {
      expect(collection).toBe('variants')
      expect(id).toBe('v1')
      return {
        priceInUSDEnabled: true,
        priceInUSD: 300,
        product: 'p1',
      }
    })

    const result = await computeOrderAmountOnCreate({
      data: {
        items: [{ variant: 'v1', quantity: 4 }],
      },
      operation: 'create',
      req: createReq(findByID),
    } as never)

    expect(result.amount).toBe(1200)
    expect(findByID).toHaveBeenCalledTimes(1)
  })

  it('falls back to product USD price when variant USD price is disabled', async () => {
    const findByID = vi.fn(async ({ collection }: FindByIDArgs) => {
      if (collection === 'variants') {
        return {
          priceInUSDEnabled: false,
          product: 'p1',
        }
      }

      return {
        priceInUSDEnabled: true,
        priceInUSD: 1000,
      }
    })

    const result = await computeOrderAmountOnCreate({
      data: {
        items: [{ variant: 'v1', quantity: 2 }],
      },
      operation: 'create',
      req: createReq(findByID),
    } as never)

    expect(result.amount).toBe(2000)
    expect(findByID).toHaveBeenCalledTimes(2)
  })

  it('fails politely when product USD price is not configured', async () => {
    const findByID = vi.fn(async () => ({
      priceInUSDEnabled: false,
      priceInUSD: null,
    }))

    await expect(
      computeOrderAmountOnCreate({
        data: {
          items: [{ product: 'p1', quantity: 1 }],
        },
        operation: 'create',
        req: createReq(findByID),
      } as never),
    ).rejects.toThrow(
      'Product p1 is missing a valid priceInUSD value. Enable priceInUSDEnabled and set a numeric price.',
    )
  })
})
