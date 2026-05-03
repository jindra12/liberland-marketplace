import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

let updateInventoryPost: ((request: Request) => Promise<Response>) | null = null

const mockPayload = {
  auth: vi.fn(async ({ headers }: { headers: Headers }) => {
    if (headers.get('authorization') === 'Bearer admin-token') {
      return {
        user: {
          id: 'user-1',
          role: ['admin'],
        },
      }
    }

    return { user: null }
  }),
  findByID: vi.fn(async ({ collection, id }: { collection: string; id: string }) => {
    if (collection === 'orders' && id === 'order-1') {
      return {
        id: 'order-1',
        items: [
          {
            product: 'product-1',
            quantity: 2,
          },
          {
            variant: 'variant-1',
            quantity: 1,
          },
          {
            product: 'product-2',
            quantity: 1,
          },
          {
            product: 'product-3',
            quantity: 1,
          },
        ],
      }
    }

    if (collection === 'products' && id === 'product-1') {
      return {
        id: 'product-1',
        inventory: 5,
        unlimitedInventory: false,
      }
    }

    if (collection === 'products' && id === 'product-2') {
      return {
        id: 'product-2',
        inventory: 0,
        unlimitedInventory: false,
      }
    }

    if (collection === 'products' && id === 'product-3') {
      return {
        id: 'product-3',
        inventory: 10,
        unlimitedInventory: true,
      }
    }

    if (collection === 'variants' && id === 'variant-1') {
      return {
        id: 'variant-1',
        inventory: 3,
        product: 'product-1',
      }
    }

    throw new Error(`Unexpected ${collection} lookup: ${id}`)
  }),
  update: vi.fn(async ({ collection, id, data }: { collection: string; id: string; data: Record<string, unknown> }) => {
    return {
      collection,
      id,
      ...data,
    }
  }),
}

vi.mock('payload', () => ({
  APIError: class APIError extends Error {
    constructor(message: string) {
      super(message)
      this.name = 'APIError'
    }
  },
  createLocalReq: vi.fn(async ({ user }: { user: { id: string; role: string[] } }) => ({
    payload: mockPayload,
    user,
  })),
  getPayload: vi.fn(async () => mockPayload),
}))

vi.mock('@payload-config', () => ({
  default: {},
}))

vi.mock('next/headers', () => ({
  headers: vi.fn(async () => new Headers({ authorization: 'Bearer admin-token' })),
}))

describe('order inventory route', () => {
  beforeAll(async () => {
    const routeModule = await import('@/app/api/orders/[id]/update-inventory/route')
    updateInventoryPost = routeModule.POST
  })

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('updates product and variant inventory once per order item group', async () => {
    if (!updateInventoryPost) {
      throw new Error('Order inventory route is not available.')
    }

    const response = await updateInventoryPost(
      new Request('https://example.com/api/orders/order-1/update-inventory', {
        method: 'POST',
        headers: {
          authorization: 'Bearer admin-token',
        },
      }),
    )

    const body = (await response.json()) as {
      orderID?: string
      updated?: Array<{
        id?: string
        kind?: string
        nextInventory?: number
      }>
    }

    expect(response.status).toBe(200)
    expect(body.orderID).toBe('order-1')
    expect(body.updated).toEqual([
      {
        id: 'product-1',
        kind: 'product',
        nextInventory: 3,
      },
      {
        id: 'variant-1',
        kind: 'variant',
        nextInventory: 2,
      },
    ])
    expect(mockPayload.update).toHaveBeenCalledTimes(2)
    expect(mockPayload.update).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'products',
        id: 'product-1',
        data: {
          inventory: 3,
        },
        overrideAccess: false,
      }),
    )
    expect(mockPayload.update).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'variants',
        id: 'variant-1',
        data: {
          inventory: 2,
        },
        overrideAccess: false,
      }),
    )
  })
})
