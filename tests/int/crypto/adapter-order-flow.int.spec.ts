import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * This suite exercises the crypto adapter's confirmOrder flow with a mocked
 * Payload API object (in-memory behavior), so we can verify that:
 * - cart is read
 * - order is created with per-product transaction hash entries
 * - verification result drives status transitions
 * - transaction document is written
 * - cart gets purchasedAt when verification succeeds
 */
vi.mock('@/crypto', () => ({
  verifyTransactionOccurred: vi.fn(),
}))

vi.mock('@/crypto/recipient', () => ({
  resolveProductIDsForItems: vi.fn(),
  resolveProductPaymentTargetsFromItems: vi.fn(),
}))

import { verifyTransactionOccurred } from '@/crypto'
import { resolveProductIDsForItems, resolveProductPaymentTargetsFromItems } from '@/crypto/recipient'
import { cryptoAdapter } from '@/payments/cryptoAdapter'

type CreateCall = {
  collection: string
  data: Record<string, unknown>
}

type UpdateCall = {
  collection: string
  id: string
  data: Record<string, unknown>
}

const createFakeReq = () => {
  const creates: CreateCall[] = []
  const updates: UpdateCall[] = []

  const payload = {
    findByID: vi.fn(async ({ collection, id }: { collection: string; id: string }) => {
      if (collection === 'carts' && id === 'cart_1') {
        return {
          id: 'cart_1',
          currency: 'USD',
          subtotal: 150,
          customer: 'user_1',
          items: [
            { product: 'prod_1', quantity: 1 },
            { product: 'prod_2', quantity: 2 },
          ],
        }
      }

      throw new Error(`Unexpected findByID(${collection}, ${id})`)
    }),

    create: vi.fn(async ({ collection, data }: { collection: string; data: Record<string, unknown> }) => {
      creates.push({ collection, data })

      if (collection === 'orders') {
        return { id: 'order_1' }
      }

      if (collection === 'transactions') {
        return { id: 'tx_1' }
      }

      throw new Error(`Unexpected create(${collection})`)
    }),

    update: vi.fn(async ({
      collection,
      id,
      data,
    }: {
      collection: string
      id: string
      data: Record<string, unknown>
    }) => {
      updates.push({ collection, id, data })
      return { id }
    }),
  }

  return {
    creates,
    payload,
    req: {
      payload,
      user: {
        id: 'user_1',
        email: 'buyer@example.com',
      },
    },
    updates,
  }
}

describe('payments/cryptoAdapter confirmOrder integration with mock db', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    vi.mocked(resolveProductIDsForItems).mockResolvedValue(['prod_1', 'prod_2'])
    vi.mocked(resolveProductPaymentTargetsFromItems).mockResolvedValue([
      {
        chain: 'ethereum',
        normalizedRecipientAddress: '0xwallet-1',
        productID: 'prod_1',
        quantity: 1,
        recipientAddress: '0x1111111111111111111111111111111111111111',
        stableAmount: 50,
        unitAmount: 50,
      },
      {
        chain: 'ethereum',
        normalizedRecipientAddress: '0xwallet-2',
        productID: 'prod_2',
        quantity: 2,
        recipientAddress: '0x2222222222222222222222222222222222222222',
        stableAmount: 100,
        unitAmount: 50,
      },
    ])
  })

  it('creates order with product-linked transactionHashes and completes flow on successful verification', async () => {
    vi.mocked(verifyTransactionOccurred).mockResolvedValue({
      orderId: 'order_1',
      ok: true,
      results: [
        {
          chain: 'ethereum',
          ok: true,
          productIDs: ['prod_1', 'prod_2'],
          transactionHash: '0xabc',
        },
      ],
    })

    const { creates, req, updates } = createFakeReq()
    const adapter = cryptoAdapter()

    const result = await adapter.confirmOrder({
      cartsSlug: 'carts',
      data: {
        cartID: 'cart_1',
        chain: 'ethereum',
        transactionHash: '0xABC',
      },
      ordersSlug: 'orders',
      req: req as never,
      transactionsSlug: 'transactions',
    })

    expect(result).toEqual({
      message: 'Crypto order confirmed.',
      orderID: 'order_1',
      transactionID: 'tx_1',
    })

    const orderCreate = creates.find((entry) => entry.collection === 'orders')
    expect(orderCreate).toBeDefined()

    const txHashes = (orderCreate?.data.transactionHashes ?? []) as Array<Record<string, unknown>>
    expect(txHashes).toEqual([
      { chain: 'ethereum', product: 'prod_1', transactionHash: '0xabc' },
      { chain: 'ethereum', product: 'prod_2', transactionHash: '0xabc' },
    ])

    // Order status should be completed and linked to created transaction.
    expect(
      updates.some(
        (entry) =>
          entry.collection === 'orders' &&
          entry.id === 'order_1' &&
          entry.data.status === 'completed',
      ),
    ).toBe(true)

    // Cart should be marked purchased only on successful verification.
    expect(
      updates.some(
        (entry) =>
          entry.collection === 'carts' &&
          entry.id === 'cart_1' &&
          typeof entry.data.purchasedAt === 'string',
      ),
    ).toBe(true)
  })

  it('cancels order and returns a verification error when payment check fails', async () => {
    vi.mocked(verifyTransactionOccurred).mockResolvedValue({
      orderId: 'order_1',
      ok: false,
      results: [
        {
          chain: 'ethereum',
          ok: false,
          productIDs: ['prod_1'],
          transactionHash: '0xabc',
          error: 'Transaction amount does not match.',
        },
      ],
    })

    const { req, updates } = createFakeReq()
    const adapter = cryptoAdapter()

    await expect(
      adapter.confirmOrder({
        cartsSlug: 'carts',
        data: {
          cartID: 'cart_1',
          chain: 'ethereum',
          transactionHash: '0xabc',
        },
        ordersSlug: 'orders',
        req: req as never,
        transactionsSlug: 'transactions',
      }),
    ).rejects.toThrow('Transaction amount does not match')

    expect(
      updates.some(
        (entry) =>
          entry.collection === 'orders' &&
          entry.id === 'order_1' &&
          entry.data.status === 'cancelled',
      ),
    ).toBe(true)

    // On failure there should be no purchasedAt update on the cart.
    expect(
      updates.some((entry) => entry.collection === 'carts' && typeof entry.data.purchasedAt === 'string'),
    ).toBe(false)
  })

  it('accepts explicit per-product transactionHashes so one order can use multiple txs', async () => {
    vi.mocked(resolveProductPaymentTargetsFromItems).mockResolvedValue([
      {
        chain: 'ethereum',
        normalizedRecipientAddress: '0xwallet-a',
        productID: 'prod_1',
        quantity: 1,
        recipientAddress: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        stableAmount: 50,
        unitAmount: 50,
      },
      {
        chain: 'ethereum',
        normalizedRecipientAddress: '0xwallet-b',
        productID: 'prod_2',
        quantity: 2,
        recipientAddress: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
        stableAmount: 100,
        unitAmount: 50,
      },
    ])

    vi.mocked(verifyTransactionOccurred).mockResolvedValue({
      orderId: 'order_1',
      ok: true,
      results: [
        {
          chain: 'ethereum',
          ok: true,
          productIDs: ['prod_1'],
          transactionHash: '0xhash-a',
        },
        {
          chain: 'ethereum',
          ok: true,
          productIDs: ['prod_2'],
          transactionHash: '0xhash-b',
        },
      ],
    })

    const { creates, req } = createFakeReq()
    const adapter = cryptoAdapter()

    await adapter.confirmOrder({
      cartsSlug: 'carts',
      data: {
        cartID: 'cart_1',
        transactionHashes: [
          { product: 'prod_1', chain: 'ethereum', transactionHash: '0xHASH-A' },
          { product: 'prod_2', chain: 'ethereum', transactionHash: '0xHASH-B' },
        ],
      },
      ordersSlug: 'orders',
      req: req as never,
      transactionsSlug: 'transactions',
    })

    const orderCreate = creates.find((entry) => entry.collection === 'orders')
    expect(orderCreate).toBeDefined()

    const txHashes = (orderCreate?.data.transactionHashes ?? []) as Array<Record<string, unknown>>
    expect(txHashes).toEqual([
      { chain: 'ethereum', product: 'prod_1', transactionHash: '0xhash-a' },
      { chain: 'ethereum', product: 'prod_2', transactionHash: '0xhash-b' },
    ])

    const transactionCreate = creates.find((entry) => entry.collection === 'transactions')
    const crypto = transactionCreate?.data.crypto as { paymentRef?: string; txHash?: string } | undefined

    expect(crypto?.paymentRef).toContain('ethereum:0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')
    expect(crypto?.paymentRef).toContain('ethereum:0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb')
    expect(crypto?.txHash).toBe('0xhash-a,0xhash-b')
  })
})
