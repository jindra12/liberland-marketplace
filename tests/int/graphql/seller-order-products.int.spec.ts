import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  getSellerOrderProducts,
  updateSellerOrderProductFulfilled,
  updateSellerOrderProductRejected,
  type SellerOrdersRequest,
} from '@/graphql/sellerOrders'
import type { AccessUser } from '@/access/types'
import type { Order, Product } from '@/payload-types'

const SELLER_ID = 'seller-1'

type SellerOrderProductValue = Pick<
  Product,
  'company' | 'createdBy' | 'createdAt' | 'id' | 'name' | 'updatedAt'
>

type SellerOrderPaymentProofValue = {
  product: string | Product
  chain: 'ethereum' | 'solana' | 'tron'
  transactionHash: string
  fulfilled?: boolean | null
  rejected?: boolean | null
  id?: string | null
}

type SellerOrderDocValue = Omit<Pick<Order, 'createdAt' | 'id' | 'items' | 'shippingAddress' | 'status'>, never> & {
  paymentProofs?: SellerOrderPaymentProofValue[] | null
}

const createRequest = (): SellerOrdersRequest => {
  const ownedProduct = {
    company: {
      createdBy: SELLER_ID,
      createdAt: '2026-06-01T00:00:00.000Z',
      identity: 'identity-1',
      id: 'company-1',
      name: 'Owned company',
      updatedAt: '2026-06-01T00:00:00.000Z',
    },
    createdBy: 'other-seller',
    createdAt: '2026-06-01T00:00:00.000Z',
    id: 'owned-product',
    name: 'Owned product',
    updatedAt: '2026-06-01T00:00:00.000Z',
  } satisfies SellerOrderProductValue

  const order = {
    createdAt: '2026-06-02T00:00:00.000Z',
    id: 'order-1',
    items: [
      {
        id: 'item-1',
        product: 'owned-product',
        quantity: 2,
      },
      {
        id: 'item-2',
        product: 'other-product',
        quantity: 1,
      },
    ],
    paymentProofs: [
      {
        chain: 'ethereum' as const,
        fulfilled: false,
        rejected: true,
        id: 'proof-owned',
        product: 'owned-product',
        transactionHash: '0xowned',
      },
      {
        chain: 'ethereum' as const,
        fulfilled: true,
        rejected: false,
        id: 'proof-other',
        product: 'other-product',
        transactionHash: '0xother',
      },
    ] satisfies SellerOrderPaymentProofValue[],
    shippingAddress: {
      addressLine1: '123 Main St',
      city: 'Berlin',
      country: 'Germany',
      firstName: 'Seller',
      lastName: 'Customer',
      postalCode: '10115',
      state: 'BE',
      title: 'Home',
    },
    status: 'completed' as const,
  } satisfies SellerOrderDocValue

  const payload = {
    find: vi.fn(async ({ collection }: { collection: string }) => {
      if (collection === 'products') {
        return {
          docs: [ownedProduct],
          hasNextPage: false,
          hasPrevPage: false,
          limit: 0,
          page: 1,
          totalDocs: 1,
          totalPages: 1,
        }
      }

      if (collection === 'orders') {
        return {
          docs: [order],
          hasNextPage: false,
          hasPrevPage: false,
          limit: 50,
          page: 1,
          totalDocs: 1,
          totalPages: 1,
        }
      }

      throw new Error(`Unexpected find(${collection})`)
    }),
    findByID: vi.fn(async ({ collection, id }: { collection: string; id: string }) => {
      if (collection === 'orders' && id === 'order-1') {
        return order
      }

      if (collection === 'products' && id === 'owned-product') {
        return ownedProduct
      }

      throw new Error(`Unexpected findByID(${collection}, ${id})`)
    }),
    update: vi.fn(async ({ data }: { data: Partial<SellerOrderDocValue> }) => ({
      ...order,
      paymentProofs: data.paymentProofs ?? order.paymentProofs,
    })),
  } satisfies SellerOrdersRequest['payload']

  return {
    payload,
    user: {
      id: SELLER_ID,
      role: ['user'],
    } satisfies AccessUser,
  } satisfies SellerOrdersRequest
}

describe('seller order products graphql', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns only the seller-owned products with fulfillment filters and pagination', async () => {
    const req = createRequest()

    const result = await getSellerOrderProducts({
      fulfilled: false,
      limit: 10,
      page: 1,
      req,
    })

    expect(result.totalDocs).toBe(1)
    expect(result.docs).toHaveLength(1)
    expect(result.docs[0]?.productId).toBe('owned-product')
    expect(result.docs[0]?.fulfilled).toBe(false)
    expect(result.docs[0]?.rejected).toBe(true)
    expect(result.docs[0]?.quantity).toBe(2)
    expect(req.payload.find).toHaveBeenCalledTimes(2)
  })

  it('updates the selected payment proof fulfillment flag', async () => {
    const req = createRequest()

    const result = await updateSellerOrderProductFulfilled({
      fulfilled: true,
      orderId: 'order-1',
      paymentProofId: 'proof-owned',
      req,
    })

    expect(req.payload.update).toHaveBeenCalledTimes(1)
    expect(result.fulfilled).toBe(true)
    expect(result.paymentProof.fulfilled).toBe(true)
    expect(result.paymentProofId).toBe('proof-owned')
  })

  it('updates the selected payment proof rejected flag', async () => {
    const req = createRequest()

    const result = await updateSellerOrderProductRejected({
      rejected: false,
      orderId: 'order-1',
      paymentProofId: 'proof-owned',
      req,
    })

    expect(req.payload.update).toHaveBeenCalledTimes(1)
    expect(result.rejected).toBe(false)
    expect(result.paymentProof.rejected).toBe(false)
    expect(result.paymentProofId).toBe('proof-owned')
  })
})
