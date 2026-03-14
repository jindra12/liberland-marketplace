import { beforeEach, describe, expect, it, vi } from 'vitest'

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
  data: Record<string, unknown>
  id: string
}

const createFakeReq = ({ withExistingTransaction }: { withExistingTransaction: boolean }) => {
  const creates: CreateCall[] = []
  const updates: UpdateCall[] = []

  const payload = {
    findByID: vi.fn(async ({ collection, id }: { collection: string; id: string }) => {
      if (collection === 'orders' && id === 'order_1') {
        return {
          id: 'order_1',
          amount: 150,
          currency: 'USD',
          customer: 'user_1',
          customerEmail: 'buyer@example.com',
          items: [
            { product: 'prod_1', quantity: 1 },
            { product: 'prod_2', quantity: 2 },
          ],
          transactionHashes: [
            { product: 'prod_1', chain: 'ethereum', transactionHash: '0xabc' },
            { product: 'prod_2', chain: 'ethereum', transactionHash: '0xabc' },
          ],
          transactions: withExistingTransaction ? ['tx_existing'] : [],
        }
      }

      if (collection === 'transactions' && id === 'tx_existing') {
        return {
          id: 'tx_existing',
          order: 'order_1',
        }
      }

      throw new Error(`Unexpected findByID(${collection}, ${id})`)
    }),

    create: vi.fn(async ({ collection, data }: { collection: string; data: Record<string, unknown> }) => {
      creates.push({ collection, data })

      if (collection === 'transactions') {
        return { id: 'tx_created' }
      }

      throw new Error(`Unexpected create(${collection})`)
    }),

    update: vi.fn(async ({
      collection,
      data,
      id,
    }: {
      collection: string
      data: Record<string, unknown>
      id: string
    }) => {
      updates.push({ collection, data, id })
      return { id }
    }),
  }

  return {
    creates,
    payload,
    req: {
      payload,
      user: {
        id: 'admin_1',
        email: 'admin@example.com',
        role: ['admin'],
      },
    },
    updates,
  }
}

describe('payments/cryptoAdapter confirmOrder for existing orders', () => {
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

  it('updates the existing transaction when the order already has one', async () => {
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

    const { creates, req, updates } = createFakeReq({ withExistingTransaction: true })
    const adapter = cryptoAdapter()

    const result = await adapter.confirmOrder({
      cartsSlug: 'carts',
      data: {
        orderID: 'order_1',
      },
      ordersSlug: 'orders',
      req: req as never,
      transactionsSlug: 'transactions',
    })

    expect(result).toEqual({
      message: 'Crypto order confirmed.',
      orderID: 'order_1',
      transactionID: 'tx_existing',
    })

    expect(creates).toEqual([])

    expect(
      updates.some(
        (entry) =>
          entry.collection === 'transactions' &&
          entry.id === 'tx_existing' &&
          entry.data.status === 'succeeded',
      ),
    ).toBe(true)

    expect(
      updates.some(
        (entry) =>
          entry.collection === 'orders' &&
          entry.id === 'order_1' &&
          entry.data.status === 'completed',
      ),
    ).toBe(true)
  })

  it('creates a transaction when the order has no linked transaction yet', async () => {
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

    const { creates, req, updates } = createFakeReq({ withExistingTransaction: false })
    const adapter = cryptoAdapter()

    const result = await adapter.confirmOrder({
      data: {
        orderID: 'order_1',
      },
      req: req as never,
    })

    expect(result).toEqual({
      message: 'Crypto order confirmed.',
      orderID: 'order_1',
      transactionID: 'tx_created',
    })

    expect(creates).toHaveLength(1)
    expect(creates[0]?.collection).toBe('transactions')

    expect(
      updates.some(
        (entry) =>
          entry.collection === 'orders' &&
          entry.id === 'order_1' &&
          entry.data.status === 'completed',
      ),
    ).toBe(true)
  })

  it('marks order/transaction as failed and throws when verification fails', async () => {
    vi.mocked(verifyTransactionOccurred).mockResolvedValue({
      orderId: 'order_1',
      ok: false,
      results: [
        {
          chain: 'ethereum',
          error: 'Transaction amount does not match.',
          ok: false,
          productIDs: ['prod_1'],
          transactionHash: '0xabc',
        },
      ],
    })

    const { req, updates } = createFakeReq({ withExistingTransaction: true })
    const adapter = cryptoAdapter()

    await expect(
      adapter.confirmOrder({
        data: {
          orderID: 'order_1',
        },
        req: req as never,
      }),
    ).rejects.toThrow('Transaction amount does not match')

    expect(
      updates.some(
        (entry) =>
          entry.collection === 'transactions' &&
          entry.id === 'tx_existing' &&
          entry.data.status === 'failed',
      ),
    ).toBe(true)

    expect(
      updates.some(
        (entry) =>
          entry.collection === 'orders' &&
          entry.id === 'order_1' &&
          entry.data.status === 'cancelled',
      ),
    ).toBe(true)
  })
})
