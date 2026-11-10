import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mock, mockDeep } from 'vitest-mock-extended'

import { getSellerOrderProducts, type SellerOrdersRequest } from '@/graphql/sellerOrders'
import type { Order, Product, User } from '@/payload-types'

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

type SellerOrderDocValue = Omit<
  Pick<Order, 'createdAt' | 'id' | 'items' | 'shippingAddress' | 'status'>,
  never
> & {
  paymentProofs?: SellerOrderPaymentProofValue[] | null
}

const createRequest = () => {
  const ownedProduct = mock<Product>({
    company: {
      createdBy: SELLER_ID,
      createdAt: '2026-06-01T00:00:00.000Z',
      identity: 'identity-1',
      id: 'company-1',
      name: 'Owned company',
      updatedAt: '2026-06-01T00:00:00.000Z',
    },
    createdBy: SELLER_ID,
    createdAt: '2026-06-01T00:00:00.000Z',
    id: 'owned-product',
    name: 'Owned product',
    updatedAt: '2026-06-01T00:00:00.000Z',
  } satisfies SellerOrderProductValue)

  const order = mock<Order>({
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
  } satisfies SellerOrderDocValue)

  const req = mockDeep<SellerOrdersRequest>()
  req.user = mock<User>({ id: SELLER_ID, role: ['user'] })
  const page = {
    hasNextPage: false,
    hasPrevPage: false,
    limit: 50,
    page: 1,
    pagingCounter: 1,
    totalDocs: 1,
    totalPages: 1,
  }
  req.payload.find.mockResolvedValueOnce({ ...page, docs: [order] })
  req.payload.find.mockResolvedValue({ ...page, docs: [ownedProduct] })
  req.payload.findByID.mockResolvedValue(order)
  req.payload.update.mockResolvedValue(order)
  return req
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
})
